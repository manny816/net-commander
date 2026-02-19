/***************************************************************************
 *   Extension:   Net Commander                                            *
 *   Author:      skhell                                                *
 *   Description: Net Commander is the extension for Visual Studio Code    *
 *                dedicated to Network Engineers, DevOps Engineers and     *
 *                Solution Architects streamlining everyday workflows and  *
 *                accelerating data-driven root-cause analysis.            *
 *                                                                         *
 *   Github:      https://github.com/skhell/net-commander               *
 *                                                                         *
 *   Icon Author: skhell                                                   *
 *                                                                         *
 *   Copyright (C) 2025 skhell                                             *
 *   https://www.skhell.com                                                *
 *                                                                         *
 *   Licensed under the MIT License. See LICENSE file in the project       *
 *   root for details.                                                     *
 **************************************************************************/

// src/modules/traceroute.ts

// =========================================================================
// IMPORT libraries or modules
// =========================================================================
import * as vscode from 'vscode';
import * as os from 'os';
import { spawn, ChildProcess } from 'child_process';
import { getNonce } from '../helpers/nonce';
import { exportCsv } from '../helpers/exporter';


// =========================================================================
// INTERFACES
// =========================================================================
interface TracerouteRequest {
  command: 'traceroute';
  data: { targets: string[] };
}
interface StopRequest { command: 'stop' }
interface ClearRequest { command: 'clear' }
interface ExportCsvRequest { command: 'exportCSV'; data: { csv: string; targets: string[] } }
type IncomingMessage = TracerouteRequest | StopRequest | ClearRequest | ExportCsvRequest;

interface TracerouteHop {
  hop: string;
  hostname: string;
  ip: string;
  rtt1: string;
  rtt2: string;
  rtt3: string;
  status: 'success' | 'timeout';
  timestamp: string;
  localIP: string;
  macAddress: string;
  target: string;
}

interface TracerouteSummary {
  totalHops: number;
  successHops: number;
  timeoutHops: number;
  completed: boolean;
}


// =========================================================================
// EXPORT class
// =========================================================================
export class TraceroutePanel {
  public static currentPanel: TraceroutePanel | undefined;
  private activeProcesses: ChildProcess[] = [];
  private disposables: vscode.Disposable[] = [];

  private constructor(
    private panel: vscode.WebviewPanel,
    private extensionUri: vscode.Uri
  ) {
    panel.webview.html = this.showWebviewContent();
    panel.webview.onDidReceiveMessage(msg => this.handleMessage(msg), null, this.disposables);
    panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  public static createOrShow(extensionUri: vscode.Uri) {
    const column = vscode.ViewColumn.Beside;
    if (TraceroutePanel.currentPanel) {
      TraceroutePanel.currentPanel.panel.reveal(column);
    } else {
      const panel = vscode.window.createWebviewPanel(
        'traceroutePanel',
        'NetCommander Traceroute',
        column,
        { enableScripts: true }
      );
      TraceroutePanel.currentPanel = new TraceroutePanel(panel, extensionUri);
    }
  }

  public dispose() {
    this.stopAll();
    this.disposables.forEach(d => d.dispose());
    this.panel.dispose();
    TraceroutePanel.currentPanel = undefined;
  }

  private handleMessage(message: IncomingMessage) {
    try {
      switch (message.command) {
        case 'traceroute': {
          this.clearResults();
          this.toggleStop(true);
          const expanded = TraceroutePanel.expandTargets(message.data.targets);
          this.panel.webview.postMessage({ command: 'tracerouteTotal', total: expanded.length });
          this.runTracerouteMultiple(expanded);
          break;
        }
        case 'stop':
          this.stopAll();
          this.toggleStop(false);
          break;
        case 'clear':
          this.clearResults();
          break;
        case 'exportCSV':
          exportCsv('traceroute', 'traceroute', message.data.csv, '', message.data.targets);
          break;
      }
    } catch (e) {
      console.error('TraceroutePanel error', e);
    }
  }

  private runTracerouteMultiple(targets: string[]) {
    const CONCURRENCY = 5;
    let index = 0;
    const next = () => {
      if (index >= targets.length) return;
      const target = targets[index++];
      this.runTraceroute(target, next);
    };
    for (let i = 0; i < Math.min(CONCURRENCY, targets.length); i++) {
      next();
    }
  }

  private runTraceroute(target: string, onDone?: () => void) {
    const isWindows = os.platform().startsWith('win');
    const cmd = isWindows ? 'tracert' : 'traceroute';
    const args = [target];
    const { localIP, macAddress } = TraceroutePanel.getLocalNetworkInfo();

    const child = spawn(cmd, args);
    let buffer = '';
    let hopCount = 0;
    let successCount = 0;
    let timeoutCount = 0;

    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      buffer += chunk;
      const lines = chunk.split(/\r?\n/);

      for (const line of lines) {
        const hop = this.parseTracerouteLine(line);
        if (hop) {
          hopCount++;
          if (hop.status === 'success') {
            successCount++;
          } else {
            timeoutCount++;
          }
          this.postHop(target, hop, localIP, macAddress);
        }
      }
    });

    child.stderr?.on('data', (err: Buffer) => {
      console.error(`Traceroute error (${target}):`, err.toString());
    });

    child.on('close', () => {
      const summary: TracerouteSummary = {
        totalHops: hopCount,
        successHops: successCount,
        timeoutHops: timeoutCount,
        completed: true
      };
      this.postSummary(target, summary);
      this.activeProcesses = this.activeProcesses.filter(p => p !== child);
      if (this.activeProcesses.length === 0) {
        this.toggleStop(false);
      }
      onDone?.();
    });

    this.activeProcesses.push(child);
  }

  private stopAll() {
    for (const p of this.activeProcesses) {
      p.kill();
    }
    this.activeProcesses = [];
  }

  private clearResults() {
    this.panel.webview.postMessage({ command: 'clearResults' });
  }

  private toggleStop(show: boolean) {
    this.panel.webview.postMessage({ command: 'toggleStop', data: { show } });
  }

  private postHop(
    target: string,
    hop: { hop: string; hostname: string; ip: string; rtt1: string; rtt2: string; rtt3: string; status: 'success' | 'timeout' },
    localIP: string,
    macAddress: string
  ) {
    this.panel.webview.postMessage({
      command: 'tracerouteResult',
      data: {
        target,
        type: 'hop',
        row: {
          ...hop,
          timestamp: TraceroutePanel.formatTimestamp(new Date()),
          localIP,
          macAddress,
          target
        } as TracerouteHop
      }
    });
  }

  private postSummary(target: string, summary: TracerouteSummary) {
    this.panel.webview.postMessage({
      command: 'tracerouteResult',
      data: { target, type: 'summary', summary }
    });
  }

  private parseTracerouteLine(line: string): { hop: string; hostname: string; ip: string; rtt1: string; rtt2: string; rtt3: string; status: 'success' | 'timeout' } | null {
    line = line.trim();

    if (
      line.startsWith('traceroute to') ||
      line.startsWith('Tracing route to') ||
      line.startsWith('over a maximum') ||
      line === 'Trace complete.' ||
      line === ''
    ) {
      return null;
    }

    if (/^\s*(\d+)\s+\*\s+\*\s+\*/.test(line)) {
      const hopNum = line.match(/^\s*(\d+)/)?.[1] || '?';
      return {
        hop: hopNum,
        hostname: '*',
        ip: '*',
        rtt1: '*',
        rtt2: '*',
        rtt3: '*',
        status: 'timeout'
      };
    }

    const linuxRe = /^\s*(\d+)\s+(\S+)\s+\(([\d.]+)\)\s+([\d.]+)\s*ms\s+([\d.]+)\s*ms\s+([\d.]+)\s*ms/;
    let m = linuxRe.exec(line);
    if (m) {
      return {
        hop: m[1],
        hostname: m[2],
        ip: m[3],
        rtt1: `${m[4]} ms`,
        rtt2: `${m[5]} ms`,
        rtt3: `${m[6]} ms`,
        status: 'success'
      };
    }

    const linuxNoHostRe = /^\s*(\d+)\s+([\d.]+)\s+([\d.]+)\s*ms\s+([\d.]+)\s*ms\s+([\d.]+)\s*ms/;
    m = linuxNoHostRe.exec(line);
    if (m) {
      return {
        hop: m[1],
        hostname: m[2],
        ip: m[2],
        rtt1: `${m[3]} ms`,
        rtt2: `${m[4]} ms`,
        rtt3: `${m[5]} ms`,
        status: 'success'
      };
    }

    const winRe = /^\s*(\d+)\s+(<?\d+)\s*ms\s+(<?\d+)\s*ms\s+(<?\d+)\s*ms\s+(.+?)(?:\s+\[([\d.]+)\])?\s*$/;
    m = winRe.exec(line);
    if (m) {
      const ip = m[6] || m[5].trim();
      const hostname = m[6] ? m[5].trim() : ip;
      return {
        hop: m[1],
        hostname,
        ip,
        rtt1: `${m[2]} ms`,
        rtt2: `${m[3]} ms`,
        rtt3: `${m[4]} ms`,
        status: 'success'
      };
    }

    return null;
  }

  private static expandTargets(rawTargets: string[]): string[] {
    const result: string[] = [];
    for (const entry of rawTargets) {
      const m = entry.match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/);
      if (!m) { result.push(entry); continue; }
      const prefix = parseInt(m[2], 10);
      if (prefix < 0 || prefix > 32) { result.push(entry); continue; }
      const parts = m[1].split('.').map(Number);
      if (parts.some((p: number) => isNaN(p) || p < 0 || p > 255)) { result.push(entry); continue; }
      const base = (((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0);
      const mask = prefix === 0 ? 0 : ((~0 << (32 - prefix)) >>> 0);
      const network = (base & mask) >>> 0;
      const total = Math.pow(2, 32 - prefix);
      const start = prefix < 31 ? 1 : 0;
      const end   = prefix < 31 ? total - 1 : total;
      const limit = Math.min(end, start + 256);
      for (let i = start; i < limit; i++) {
        const ip = (network + i) >>> 0;
        result.push([
          (ip >>> 24) & 0xff,
          (ip >>> 16) & 0xff,
          (ip >>> 8)  & 0xff,
          ip          & 0xff
        ].join('.'));
      }
    }
    return result;
  }

  private static getLocalNetworkInfo() {
    const nets = os.networkInterfaces();
    let localIP = 'N/A', macAddress = 'N/A';
    for (const dev of Object.values(nets)) {
      if (!dev) continue;
      for (const inf of dev) {
        if (inf.family === 'IPv4' && !inf.internal) {
          localIP = inf.address;
          macAddress = inf.mac;
          break;
        }
      }
      if (localIP !== 'N/A') break;
    }
    return { localIP, macAddress };
  }

  private static formatTimestamp(d: Date) {
    const pad = (n: number) => n < 10 ? '0' + n : String(n);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
      + ` ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  private showWebviewContent(): string {
    const nonce = getNonce();
    const csp = this.panel.webview.cspSource;
    const webview = this.panel.webview;
    const elemUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'libs', 'vscode-elements', 'bundled.js'));
    const style = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'common', 'css', 'style.css'));
    const script = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'module-traceroute', 'main.js'));

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             img-src ${csp} https: data:;
             script-src 'nonce-${nonce}' ${csp};
             style-src 'unsafe-inline' ${csp};
             font-src ${csp} https: data:;">
  <link rel="stylesheet" href="${style}" />
  <style>
    .hop-success { color: #4ec9b0; }
    .hop-timeout { color: #f14c4c; }
    .summary-row { font-weight: bold; background: var(--vscode-editor-inactiveSelectionBackground); }
  </style>
</head>
<body>
  <div class="layout">
    <div class="top-bar">
      <h1>Traceroute utility</h1>
    </div>

    <div class="header flex-row section-padding">
      <vscode-form-container responsive="true">
        <vscode-label for="targets">Targets (comma, newline or CIDR)</vscode-label>
        <vscode-textarea id="targets" placeholder="1.1.1.1&#10;192.168.1.0/24"></vscode-textarea>
        <vscode-form-group>
          <vscode-button id="traceBtn">Trace &amp; Export</vscode-button>
          <vscode-button id="stopBtn" style="display:none;--vscode-button-background:#c42b1c;--vscode-button-hoverBackground:#d13128;--vscode-button-foreground:#ffffff;">Stop</vscode-button>
          <vscode-button id="clearBtn" secondary>Clear</vscode-button>
        </vscode-form-group>
      </vscode-form-container>
    </div>
    <div class="middle section-padding scrollable-y">
      <div id="results"></div>
    </div>
  </div>
  <script type="module" nonce="${nonce}" src="${elemUri}"></script>
  <script type="module" nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
  }
}
