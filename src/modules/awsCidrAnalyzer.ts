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

// src/modules/awsCidrAnalyzer.ts

// =========================================================================
// IMPORT libraries or modules
// =========================================================================
import * as vscode from 'vscode';
import { getNonce } from '../helpers/nonce';
import { exportCsv } from '../helpers/exporter';
import {
  EC2Client,
  DescribeRegionsCommand,
  DescribeVpcsCommand,
  DescribeSubnetsCommand,
  DescribeManagedPrefixListsCommand,
  GetManagedPrefixListEntriesCommand
} from '@aws-sdk/client-ec2';

// =========================================================================
// TYPES
// =========================================================================
type AwsCidrResult = Record<string, unknown>;

interface RegionInfo {
  name: string;
  endpoint?: string;
  optInStatus?: string;
}

interface LookupMessage {
  command: 'lookupCidr';
  cidr: string;
  regions?: string[];
}

interface ExportMessage {
  command: 'exportCsv';
}

interface RequestRegionsMessage {
  command: 'requestRegions';
}

type IncomingMessage = LookupMessage | ExportMessage | RequestRegionsMessage;

interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

type Matcher = (value: string) => boolean;

// =========================================================================
// EXPORT functions
// =========================================================================
export function openAwsCidrAnalyzer(context: vscode.ExtensionContext): void {
  const panel = vscode.window.createWebviewPanel(
    'awsCidrAnalyzer',
    'AWS CIDR Analyzer',
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [
        vscode.Uri.joinPath(context.extensionUri, 'media', 'libs'),
        vscode.Uri.joinPath(context.extensionUri, 'media', 'common'),
        vscode.Uri.joinPath(context.extensionUri, 'media', 'module-awscidranalyzer')
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
    vscode.Uri.joinPath(context.extensionUri, 'media', 'module-awscidranalyzer', 'style.css')
  );
  const scriptUri = panel.webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, 'media', 'module-awscidranalyzer', 'main.js')
  );

  panel.webview.html = showWebviewContent({
    nonce,
    cspSource,
    elementsSrc: elementsUri.toString(),
    commonStyleSrc: commonStyleUri.toString(),
    styleSrc: styleUri.toString(),
    scriptSrc: scriptUri.toString()
  });

  let lastResults: AwsCidrResult[] = [];

  panel.webview.onDidReceiveMessage(async (message: IncomingMessage) => {
    if (message.command === 'requestRegions') {
      await sendAvailableRegions(panel);
      return;
    }

    if (message.command === 'lookupCidr') {
      const cidrs = message.cidr
        .split(/[,\n]/)
        .map(part => part.trim())
        .filter(Boolean);

      const requestedRegions = Array.isArray(message.regions)
        ? message.regions.map(region => region.trim()).filter(Boolean)
        : [];

      panel.webview.postMessage({ command: 'setLoading', value: true });

      try {
        const credentials = getAwsCredentials();
        const regions = await resolveRegions(credentials, requestedRegions);
        if (!regions.length) {
          throw new Error('No AWS regions available for the configured credentials.');
        }

        panel.webview.postMessage({
          command: 'initRegions',
          regions: regions.map(region => ({ name: region.name, endpoint: region.endpoint }))
        });

        lastResults = [];

        for (const region of regions) {
          panel.webview.postMessage({
            command: 'regionStatus',
            region: region.name,
            status: 'running'
          });

          try {
            const hits = await queryAwsForCidrs(credentials, cidrs, region.name);
            lastResults.push(...hits);
            panel.webview.postMessage({
              command: 'regionStatus',
              region: region.name,
              status: 'done',
              count: hits.length
            });
          } catch (errRegion: any) {
            const msg = errRegion?.message ?? String(errRegion ?? 'Unknown error');
            panel.webview.postMessage({
              command: 'regionStatus',
              region: region.name,
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
          : `Search completed. No matches found for ${cidrs.join(', ') || 'your query'}.`;
        panel.webview.postMessage({ command: 'showInfo', message: summaryText });
      } catch (err: any) {
        const msg = err?.message ?? String(err ?? 'Unknown error');
        vscode.window.showErrorMessage(`AWS CIDR Analyzer error: ${msg}`);
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

      void exportCsv('aws-cidr-analyzer', 'aws-cidr-results', csvBody, header + '\n');
      return;
    }
  });
}

// =========================================================================
// INTERNAL helpers
// =========================================================================
async function queryAwsForCidrs(credentials: AwsCredentials, cidrs: string[], region: string): Promise<AwsCidrResult[]> {
  const client = new EC2Client({ region, credentials });
  const matchers = buildCidrMatchers(cidrs);
  const results: AwsCidrResult[] = [];

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

  console.log('[AwsCIDR] Querying region:', region);

  // Gather VPC CIDRs
  let nextVpcToken: string | undefined;
  do {
    const response = await client.send(new DescribeVpcsCommand({ NextToken: nextVpcToken }));
    for (const vpc of response.Vpcs ?? []) {
      const base = {
        type: 'vpc',
        region,
        id: vpc.VpcId ?? '',
        resourceId: vpc.VpcId ?? '',
        resourceName: getTagValue(vpc.Tags, 'Name'),
        accountId: vpc.OwnerId ?? '',
        state: vpc.State ?? '',
        tenancy: vpc.InstanceTenancy ?? ''
      };

      if (typeof vpc.CidrBlock === 'string') {
        pushResult({ ...base, prefix: vpc.CidrBlock });
      }

      for (const assoc of vpc.CidrBlockAssociationSet ?? []) {
        if (!assoc?.CidrBlock) continue;
        pushResult({
          ...base,
          prefix: assoc.CidrBlock,
          associationId: assoc.AssociationId ?? '',
          associationStatus: assoc.CidrBlockState?.State ?? ''
        });
      }

      for (const assoc of vpc.Ipv6CidrBlockAssociationSet ?? []) {
        if (!assoc?.Ipv6CidrBlock) continue;
        pushResult({
          ...base,
          prefix: assoc.Ipv6CidrBlock,
          associationId: assoc.AssociationId ?? '',
          associationStatus: assoc.Ipv6CidrBlockState?.State ?? ''
        });
      }
    }
    nextVpcToken = response.NextToken;
  } while (nextVpcToken);

  // Gather Subnet CIDRs
  let nextSubnetToken: string | undefined;
  do {
    const response = await client.send(new DescribeSubnetsCommand({ NextToken: nextSubnetToken }));
    for (const subnet of response.Subnets ?? []) {
      const base = {
        type: 'subnet',
        region,
        id: subnet.SubnetId ?? '',
        resourceId: subnet.SubnetId ?? '',
        resourceName: getTagValue(subnet.Tags, 'Name'),
        accountId: subnet.OwnerId ?? '',
        vpcId: subnet.VpcId ?? '',
        availabilityZone: subnet.AvailabilityZone ?? '',
        state: subnet.State ?? '',
        defaultForAz: subnet.DefaultForAz ?? undefined,
        availableIpAddressCount: subnet.AvailableIpAddressCount ?? undefined
      };

      if (typeof subnet.CidrBlock === 'string') {
        pushResult({ ...base, prefix: subnet.CidrBlock });
      }

      for (const assoc of subnet.Ipv6CidrBlockAssociationSet ?? []) {
        if (!assoc?.Ipv6CidrBlock) continue;
        pushResult({
          ...base,
          prefix: assoc.Ipv6CidrBlock,
          associationId: assoc.AssociationId ?? '',
          associationStatus: assoc.Ipv6CidrBlockState?.State ?? ''
        });
      }
    }
    nextSubnetToken = response.NextToken;
  } while (nextSubnetToken);

  // Gather Managed Prefix Lists (best-effort)
  try {
    let nextPrefixListToken: string | undefined;
    do {
      const response = await client.send(new DescribeManagedPrefixListsCommand({ NextToken: nextPrefixListToken }));
      for (const list of response.PrefixLists ?? []) {
        if (!list?.PrefixListId) continue;
        const base = {
          type: 'managedPrefixList',
          region,
          id: list.PrefixListId,
          resourceId: list.PrefixListId,
          resourceName: list.PrefixListName ?? '',
          ownerId: list.OwnerId ?? '',
          addressFamily: list.AddressFamily ?? '',
          state: list.State ?? '',
          maxEntries: list.MaxEntries ?? undefined
        };

        const entries = await collectManagedPrefixListEntries(client, list.PrefixListId);
        for (const entry of entries) {
          if (!entry?.Cidr) continue;
          pushResult({
            ...base,
            prefix: entry.Cidr,
            entryDescription: entry.Description ?? '',
            entryCidr: entry.Cidr
          });
        }
      }
      nextPrefixListToken = response.NextToken;
    } while (nextPrefixListToken);
  } catch (err) {
    console.warn(`[AwsCIDR] Unable to collect managed prefix lists in ${region}:`, err);
  }

  return results;
}

let cachedRegions: RegionInfo[] | undefined;
let cachedCredentialKey: string | undefined;

async function listRegions(credentials: AwsCredentials): Promise<RegionInfo[]> {
  const key = credentialCacheKey(credentials);
  if (cachedRegions && cachedCredentialKey === key) {
    return cachedRegions;
  }

  const client = new EC2Client({ region: 'us-east-1', credentials });
  const response = await client.send(new DescribeRegionsCommand({ AllRegions: false }));

  const regions: RegionInfo[] = (response.Regions ?? [])
    .map(entry => ({
      name: entry.RegionName ?? '',
      endpoint: entry.Endpoint ?? undefined,
      optInStatus: entry.OptInStatus ?? undefined
    }))
    .filter(entry => entry.name.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!regions.length) {
    throw new Error('No AWS regions returned for the current credentials.');
  }

  cachedCredentialKey = key;
  cachedRegions = regions;
  return regions;
}

async function resolveRegions(credentials: AwsCredentials, requested: string[]): Promise<RegionInfo[]> {
  const all = await listRegions(credentials);
  if (!requested.length) {
    return all;
  }

  const byName = new Map(all.map(region => [region.name.toLowerCase(), region] as const));
  const seen = new Set<string>();
  const unique: RegionInfo[] = [];

  for (const raw of requested) {
    const key = raw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const existing = byName.get(key);
    if (existing) {
      unique.push(existing);
    } else {
      unique.push({ name: raw });
    }
  }

  return unique;
}

async function sendAvailableRegions(panel: vscode.WebviewPanel): Promise<void> {
  try {
    const credentials = getAwsCredentials();
    const regions = await listRegions(credentials);
    panel.webview.postMessage({ command: 'regionOptions', regions });
  } catch (err: any) {
    const msg = err?.message ?? String(err ?? 'Unknown error');
    vscode.window.showErrorMessage(`Failed to load AWS regions: ${msg}`);
    panel.webview.postMessage({ command: 'showError', message: msg });
  }
}

async function collectManagedPrefixListEntries(client: EC2Client, prefixListId: string) {
  const allEntries: Array<{ Cidr?: string; Description?: string }> = [];
  let nextToken: string | undefined;

  do {
    const response = await client.send(new GetManagedPrefixListEntriesCommand({
      PrefixListId: prefixListId,
      NextToken: nextToken
    }));
    allEntries.push(...(response.Entries ?? []));
    nextToken = response.NextToken;
  } while (nextToken);

  return allEntries;
}

function collectColumns(rows: AwsCidrResult[]): string[] {
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

function getAwsCredentials(): AwsCredentials {
  const config = vscode.workspace.getConfiguration('netCommander');
  const accessKeyId = readConfigValue(config, 'awsAccessKeyId');
  const secretAccessKey = readConfigValue(config, 'awsSecretAccessKey');
  const sessionToken = readConfigValue(config, 'awsSessionToken');

  if (!accessKeyId || !secretAccessKey) {
    throw new Error('Configure AWS credentials (Access Key ID and Secret Access Key) under NET Commander settings first.');
  }

  return {
    accessKeyId,
    secretAccessKey,
    sessionToken: sessionToken || undefined
  };
}

function readConfigValue(config: vscode.WorkspaceConfiguration, key: string): string {
  const value = config.get<string>(key);
  return typeof value === 'string' ? value.trim() : '';
}

function getTagValue(tags: Array<{ Key?: string; Value?: string }> | undefined, key: string): string | undefined {
  if (!Array.isArray(tags)) {
    return undefined;
  }
  const match = tags.find(tag => typeof tag.Key === 'string' && tag.Key.toLowerCase() === key.toLowerCase());
  return match?.Value || undefined;
}

function credentialCacheKey(credentials: AwsCredentials): string {
  return `${credentials.accessKeyId}:${credentials.sessionToken ?? ''}`;
}

interface WebviewContentOptions {
  nonce: string;
  cspSource: string;
  elementsSrc: string;
  commonStyleSrc: string;
  styleSrc: string;
  scriptSrc: string;
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
      <h1>AWS CIDR Analyzer</h1>
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
          <vscode-label>Regions</vscode-label>
          <div id="regionOptions" class="region-options"></div>
        </div>
        <div class="actions-row">
          <vscode-button id="searchBtn">Search</vscode-button>
          <vscode-button id="exportBtn">Export CSV</vscode-button>
        </div>
        <vscode-form-helper>
          <p>Ensure the AWS credentials are configured in NET Commander settings. Choose one or more regions or keep <strong>All regions</strong> selected to query every region available to this account.</p>
        </vscode-form-helper>
        <div id="status" role="status"></div>
      </vscode-form-container>
    </div>
    <div class="middle section-padding scrollable-y">
      <div id="regions"></div>
      <div id="results"></div>
    </div>
  </div>
  <script nonce="${nonce}" src="${scriptSrc}"></script>
</body>
</html>`;
}
