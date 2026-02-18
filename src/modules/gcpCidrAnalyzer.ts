/***************************************************************************
 *   Extension:   Net Commander                                            *
 *   Author:      skhell                                                   *
 *   Description: Net Commander is the extension for Visual Studio Code    *
 *                dedicated to Network Engineers, DevOps Engineers and     *
 *                Solution Architects streamlining everyday workflows and  *
 *                accelerating data-driven root-cause analysis.            *
 *                                                                         *
 *   Github:      https://github.com/skhell/net-commander                   *
 *                                                                         *
 *   Icon Author: skhell                                                   *
 *                                                                         *
 *   Copyright (C) 2025 skhell                                             *
 *   https://www.skhell.com                                                *
 *                                                                         *
 *   Licensed under the MIT License. See LICENSE file in the project       *
 *   root for details.                                                     *
 **************************************************************************/

// src/modules/gcpCidrAnalyzer.ts

// =========================================================================
// IMPORT libraries or modules
// =========================================================================
import * as vscode from 'vscode';
import { AuthClient, GoogleAuth } from 'google-auth-library';
import { getNonce } from '../helpers/nonce';
import { exportCsv } from '../helpers/exporter';

// =========================================================================
// TYPES
// =========================================================================
type GcpCidrResult = Record<string, unknown>;

interface ProjectInfo {
  id: string;
  name?: string;
  number?: string;
}

interface LookupMessage {
  command: 'lookupCidr';
  cidr: string;
  projects?: string[];
}

interface ExportMessage {
  command: 'exportCsv';
}

interface RequestProjectsMessage {
  command: 'requestProjects';
}

type IncomingMessage = LookupMessage | ExportMessage | RequestProjectsMessage;

type Matcher = (value: string) => boolean;

interface WebviewContentOptions {
  nonce: string;
  cspSource: string;
  elementsSrc: string;
  commonStyleSrc: string;
  styleSrc: string;
  scriptSrc: string;
}

// =========================================================================
// CONSTANTS
// =========================================================================
const READ_ONLY_SCOPE = 'https://www.googleapis.com/auth/cloud-platform.read-only';
const PROJECT_CACHE_TTL_MS = 5 * 60 * 1000;

// =========================================================================
// STATE
// =========================================================================
const authProvider = new GoogleAuth({ scopes: [READ_ONLY_SCOPE] });

let cachedAuthClient: AuthClient | undefined;
let cachedProjects: ProjectInfo[] | undefined;
let projectsCacheExpiry = 0;

// =========================================================================
// EXPORT functions
// =========================================================================
export function openGcpCidrAnalyzer(context: vscode.ExtensionContext): void {
  const panel = vscode.window.createWebviewPanel(
    'gcpCidrAnalyzer',
    'GCP CIDR Analyzer',
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [
        vscode.Uri.joinPath(context.extensionUri, 'media', 'libs'),
        vscode.Uri.joinPath(context.extensionUri, 'media', 'common'),
        vscode.Uri.joinPath(context.extensionUri, 'media', 'module-gcpcidranalyzer')
      ]
    }
  );

  const nonce = getNonce();
  const cspSource = panel.webview.cspSource;
  const elementsUri = panel.webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, 'media', 'libs', 'vscode-elements', 'bundled.js')
  );
  const commonStyleUri = panel.webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, 'media', 'common', 'css', 'style.css')
  );
  const styleUri = panel.webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, 'media', 'module-gcpcidranalyzer', 'style.css')
  );
  const scriptUri = panel.webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, 'media', 'module-gcpcidranalyzer', 'main.js')
  );

  panel.webview.html = showWebviewContent({
    nonce,
    cspSource,
    elementsSrc: elementsUri.toString(),
    commonStyleSrc: commonStyleUri.toString(),
    styleSrc: styleUri.toString(),
    scriptSrc: scriptUri.toString()
  });

  let lastResults: GcpCidrResult[] = [];

  panel.webview.onDidReceiveMessage(async (message: IncomingMessage) => {
    if (message.command === 'requestProjects') {
      await sendAvailableProjects(panel);
      return;
    }

    if (message.command === 'lookupCidr') {
      const cidrs = message.cidr
        .split(/[,\n]/)
        .map(part => part.trim())
        .filter(Boolean);

      const requestedProjects = Array.isArray(message.projects)
        ? message.projects.map(projectId => projectId.trim()).filter(Boolean)
        : [];

      panel.webview.postMessage({ command: 'setLoading', value: true });

      try {
        if (!cidrs.length) {
          throw new Error('Enter at least one CIDR to search.');
        }

        const client = await getAuthClient();
        const projects = await resolveProjects(client, requestedProjects);
        if (!projects.length) {
          throw new Error('No GCP projects available for the current credentials.');
        }

        panel.webview.postMessage({
          command: 'initProjects',
          projects: projects.map(project => ({
            id: project.id,
            name: project.name,
            number: project.number
          }))
        });

        lastResults = [];

        for (const project of projects) {
          panel.webview.postMessage({
            command: 'projectStatus',
            projectId: project.id,
            status: 'running'
          });

          try {
            const hits = await queryGcpForCidrs(client, cidrs, project);
            lastResults.push(...hits);
            panel.webview.postMessage({
              command: 'projectStatus',
              projectId: project.id,
              status: 'done',
              count: hits.length
            });
          } catch (errProject: any) {
            const msg = errProject?.message ?? String(errProject ?? 'Unknown error');
            panel.webview.postMessage({
              command: 'projectStatus',
              projectId: project.id,
              status: 'error',
              message: msg
            });
          }
        }

        const columns = collectColumns(lastResults);
        panel.webview.postMessage({
          command: 'displayResults',
          cidrs,
          results: lastResults,
          columns
        });

        const summaryText = lastResults.length
          ? `Search completed. Found ${lastResults.length} matching entr${lastResults.length === 1 ? 'y' : 'ies'}.`
          : `Search completed. No matches found for ${cidrs.join(', ')}.`;
        panel.webview.postMessage({ command: 'showInfo', message: summaryText });
      } catch (err: any) {
        const msg = err?.message ?? String(err ?? 'Unknown error');
        vscode.window.showErrorMessage(`GCP CIDR Analyzer error: ${msg}`);
        panel.webview.postMessage({ command: 'showError', message: msg });
      } finally {
        panel.webview.postMessage({ command: 'setLoading', value: false });
      }
      return;
    }

    if (message.command === 'exportCsv') {
      if (!lastResults.length) {
        vscode.window.showWarningMessage('No results to export yet. Run a search first.');
        panel.webview.postMessage({ command: 'showInfo', message: 'Run a search to export results.' });
        return;
      }

      const columns = collectColumns(lastResults);
      const header = columns.map(col => `"${col.replace(/"/g, '""')}"`).join(',');
      const csvBody = lastResults
        .map(row => columns
          .map(col => {
            const value = row[col];
            if (value === undefined || value === null) return '""';
            const str = typeof value === 'object'
              ? JSON.stringify(value)
              : String(value);
            return `"${str.replace(/"/g, '""')}"`;
          })
          .join(','))
        .join('\n');

      void exportCsv('gcp-cidr-analyzer', 'gcp-cidr-results', csvBody, header + '\n');
      return;
    }
  });
}

// =========================================================================
// INTERNAL helpers
// =========================================================================
async function getAuthClient(): Promise<AuthClient> {
  if (cachedAuthClient) {
    return cachedAuthClient;
  }

  try {
    cachedAuthClient = await authProvider.getClient();
    return cachedAuthClient;
  } catch (err: any) {
    const msg = err?.message ?? String(err ?? 'Unknown error');
    throw new Error(
      `Unable to obtain Google Cloud credentials. Please install gcloud cli and execute "gcloud auth application-default login" or set GOOGLE_APPLICATION_CREDENTIALS. Details: ${msg}`
    );
  }
}

async function listProjects(client: AuthClient): Promise<ProjectInfo[]> {
  if (cachedProjects && Date.now() < projectsCacheExpiry) {
    return cachedProjects;
  }

  const projects: ProjectInfo[] = [];
  let pageToken: string | undefined;

  do {
    const response = await client.request<{
      projects?: Array<{
        projectId?: string;
        displayName?: string;
        projectNumber?: string;
        lifecycleState?: string;
      }>;
      nextPageToken?: string;
    }>({
      url: 'https://cloudresourcemanager.googleapis.com/v1/projects',
      params: pageToken ? { pageToken } : undefined
    });

    const entries = Array.isArray(response.data.projects) ? response.data.projects : [];
    for (const entry of entries) {
      const id = typeof entry.projectId === 'string' ? entry.projectId : '';
      if (!id) continue;
      const state = entry.lifecycleState ?? '';
      if (state && state.toUpperCase() !== 'ACTIVE') continue;
      projects.push({
        id,
        name: typeof entry.displayName === 'string' ? entry.displayName : undefined,
        number: typeof entry.projectNumber === 'string' ? entry.projectNumber : undefined
      });
    }

    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  if (!projects.length) {
    throw new Error('No active GCP projects returned for the current credentials.');
  }

  cachedProjects = projects;
  projectsCacheExpiry = Date.now() + PROJECT_CACHE_TTL_MS;
  return projects;
}

async function resolveProjects(client: AuthClient, requested: string[]): Promise<ProjectInfo[]> {
  const all = await listProjects(client);
  if (!requested.length) {
    return all;
  }

  const byId = new Map(all.map(project => [project.id.toLowerCase(), project] as const));
  const seen = new Set<string>();
  const unique: ProjectInfo[] = [];

  for (const raw of requested) {
    const key = raw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const existing = byId.get(key);
    if (existing) {
      unique.push(existing);
    } else {
      unique.push({ id: raw });
    }
  }

  return unique;
}

async function sendAvailableProjects(panel: vscode.WebviewPanel): Promise<void> {
  try {
    const client = await getAuthClient();
    const projects = await listProjects(client);
    panel.webview.postMessage({ command: 'projectOptions', projects });
  } catch (err: any) {
    const msg = err?.message ?? String(err ?? 'Unknown error');
    vscode.window.showErrorMessage(`Failed to load GCP projects: ${msg}`);
    panel.webview.postMessage({ command: 'showError', message: msg });
  }
}

async function queryGcpForCidrs(client: AuthClient, cidrs: string[], project: ProjectInfo): Promise<GcpCidrResult[]> {
  const matchers = buildCidrMatchers(cidrs);
  const results: GcpCidrResult[] = [];

  const include = (prefix: string | undefined | null): boolean => {
    if (!prefix) {
      return false;
    }
    const normalized = prefix.toLowerCase();
    if (!matchers.length) {
      return true;
    }
    return matchers.some(fn => fn(normalized));
  };

  const pushResult = (payload: Record<string, unknown> & { prefix: string }): void => {
    if (!include(payload.prefix)) {
      return;
    }
    const { prefix, ...rest } = payload;
    results.push({
      ...rest,
      prefixStr: prefix.toLowerCase(),
      originalPrefix: prefix
    });
  };

  await collectNetworks(client, project, pushResult);
  await collectSubnetworks(client, project, pushResult);

  return results;
}

async function collectNetworks(
  client: AuthClient,
  project: ProjectInfo,
  pushResult: (payload: Record<string, unknown> & { prefix: string }) => void
): Promise<void> {
  let pageToken: string | undefined;
  const baseUrl = `https://compute.googleapis.com/compute/v1/projects/${encodeURIComponent(project.id)}/global/networks`;

  do {
    const response = await client.request<{
      items?: Array<Record<string, any>>;
      nextPageToken?: string;
    }>({
      url: baseUrl,
      params: pageToken ? { pageToken } : undefined
    });

    const networks = Array.isArray(response.data.items) ? response.data.items : [];
    for (const network of networks) {
      const legacyRange = typeof network?.['IPv4Range'] === 'string' ? network['IPv4Range'] : undefined;
      if (!legacyRange) {
        continue;
      }

      const base = {
        type: 'networkLegacy',
        projectId: project.id,
        projectName: project.name,
        projectNumber: project.number,
        networkName: typeof network?.name === 'string' ? network.name : undefined,
        networkId: typeof network?.id === 'string' ? network.id : undefined,
        autoCreateSubnetworks: network?.autoCreateSubnetworks ?? undefined,
        routingMode: network?.routingConfig?.routingMode ?? undefined,
        selfLink: typeof network?.selfLink === 'string' ? network.selfLink : undefined,
        description: typeof network?.description === 'string' ? network.description : undefined
      };

      pushResult({ ...base, prefix: legacyRange });
    }

    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);
}

async function collectSubnetworks(
  client: AuthClient,
  project: ProjectInfo,
  pushResult: (payload: Record<string, unknown> & { prefix: string }) => void
): Promise<void> {
  let pageToken: string | undefined;
  const baseUrl = `https://compute.googleapis.com/compute/v1/projects/${encodeURIComponent(project.id)}/aggregated/subnetworks`;

  do {
    const response = await client.request<{
      items?: Record<string, { subnetworks?: Array<Record<string, any>> }>;
      nextPageToken?: string;
    }>({
      url: baseUrl,
      params: pageToken ? { pageToken } : undefined
    });

    const scopes = response.data.items ?? {};
    for (const [scope, data] of Object.entries(scopes)) {
      const region = scope.startsWith('regions/') ? scope.substring('regions/'.length) : scope;
      const subnetworks = Array.isArray(data?.subnetworks) ? data.subnetworks : [];

      for (const subnet of subnetworks) {
        const base = {
          type: 'subnet',
          projectId: project.id,
          projectName: project.name,
          projectNumber: project.number,
          region,
          subnetworkName: typeof subnet?.name === 'string' ? subnet.name : undefined,
          subnetworkId: typeof subnet?.id === 'string' ? subnet.id : undefined,
          networkName: extractResourceName(subnet?.network),
          networkSelfLink: typeof subnet?.network === 'string' ? subnet.network : undefined,
          selfLink: typeof subnet?.selfLink === 'string' ? subnet.selfLink : undefined,
          purpose: subnet?.purpose ?? undefined,
          role: subnet?.role ?? undefined,
          stackType: subnet?.stackType ?? undefined,
          ipv6AccessType: subnet?.ipv6AccessType ?? undefined,
          privateIpv6GoogleAccess: subnet?.privateIpv6GoogleAccess ?? undefined,
          enableFlowLogs: subnet?.enableFlowLogs ?? undefined,
          gatewayAddress: subnet?.gatewayAddress ?? undefined,
          creationTimestamp: subnet?.creationTimestamp ?? undefined,
          description: typeof subnet?.description === 'string' ? subnet.description : undefined
        };

        if (typeof subnet?.ipCidrRange === 'string') {
          pushResult({ ...base, prefix: subnet.ipCidrRange });
        }

        if (typeof subnet?.ipv6CidrRange === 'string') {
          pushResult({ ...base, prefix: subnet.ipv6CidrRange, type: 'subnetIpv6' });
        }

        const secondary = Array.isArray(subnet?.secondaryIpRanges) ? subnet.secondaryIpRanges : [];
        for (const range of secondary) {
          if (typeof range?.ipCidrRange !== 'string') continue;
          pushResult({
            ...base,
            prefix: range.ipCidrRange,
            type: 'subnetSecondaryRange',
            secondaryRangeName: range?.rangeName ?? undefined,
            secondaryRangeDescription: range?.description ?? undefined
          });
        }
      }
    }

    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);
}

function collectColumns(rows: GcpCidrResult[]): string[] {
  const cols = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      cols.add(key);
    }
  }
  return Array.from(cols).sort();
}

function buildCidrMatchers(cidrs: string[]): Matcher[] {
  const normalized = Array.from(new Set(cidrs.map(cidr => cidr.toLowerCase()).filter(Boolean)));
  return normalized.map(value => {
    if (value.includes('*')) {
      const escaped = value
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*');
      const regex = new RegExp(`^${escaped}$`);
      return (input: string) => regex.test(input);
    }
    return (input: string) => input === value;
  });
}

function extractResourceName(selfLink: unknown): string | undefined {
  if (typeof selfLink !== 'string' || !selfLink.length) {
    return undefined;
  }
  const parts = selfLink.split('/');
  const last = parts[parts.length - 1];
  return last || undefined;
}

function showWebviewContent(opts: WebviewContentOptions): string {
  const { nonce, cspSource, elementsSrc, commonStyleSrc, styleSrc, scriptSrc } = opts;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} https: data:; script-src 'nonce-${nonce}' ${cspSource}; style-src 'unsafe-inline' ${cspSource}; font-src ${cspSource} https: data:; connect-src ${cspSource} https:;">
  <script type="module" nonce="${nonce}" src="${elementsSrc}"></script>
  <link rel="stylesheet" href="${commonStyleSrc}" />
  <link rel="stylesheet" href="${styleSrc}" />
</head>
<body>
  <div class="layout">
    <div class="top-bar">
      <h1>GCP CIDR Analyzer</h1>
    </div>
    <div class="header flex-row section-padding">
      <vscode-form-container responsive="true">
        <div class="input-block">
          <vscode-label for="cidrInput">CIDR to search</vscode-label>
          <vscode-form-helper>
            <p>Search a single CIDR, multiple comma separated CIDRs, or use wildcards such as <code>10.10.*</code>.</p>
          </vscode-form-helper>
          <vscode-textfield id="cidrInput" placeholder="10.0.0.0/24, 10.0.1.0/24"></vscode-textfield>
        </div>
        <div class="input-block">
          <vscode-label>Projects</vscode-label>
          <div id="projectOptions" class="project-options"></div>
        </div>
        <div class="actions-row">
          <vscode-button id="searchBtn">Search</vscode-button>
          <vscode-button id="exportBtn">Export CSV</vscode-button>
        </div>
        <vscode-form-helper>
          <p>Ensure Google Cloud Application Default Credentials are available (e.g. run <code>gcloud auth application-default login</code>). Choose one or more projects or keep <strong>All projects</strong> selected.</p>
        </vscode-form-helper>
        <div id="status" role="status"></div>
      </vscode-form-container>
    </div>
    <div class="middle section-padding scrollable-y">
      <div id="projects"></div>
      <div id="results"></div>
    </div>
  </div>
  <script nonce="${nonce}" src="${scriptSrc}"></script>
</body>
</html>`;
}
