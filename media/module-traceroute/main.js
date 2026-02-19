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

// media/module-traceroute/main.js

window.addEventListener('error', event => {
  if (event.message && event.message.includes('ResizeObserver loop completed with undelivered notifications')) {
    event.preventDefault();
    return false;
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const vscode       = acquireVsCodeApi();
  const targetsInput = document.getElementById('targets');
  const traceBtn     = document.getElementById('traceBtn');
  const stopBtn      = document.getElementById('stopBtn');
  const clearBtn     = document.getElementById('clearBtn');
  const resultsDiv   = document.getElementById('results');

  let resultsByTarget  = {};
  let totalTargets     = 0;
  let completedTargets = 0;
  let inputLabel       = '';
  let running          = false;

  if (!targetsInput || !traceBtn || !stopBtn || !clearBtn || !resultsDiv) {
    console.error('Missing DOM elements in Traceroute UI');
    return;
  }

  traceBtn.addEventListener('click', () => {
    const targets = targetsInput.value.split(/[,\n]/).map(t => t.trim()).filter(t => t);
    if (targets.length === 0) return;
    inputLabel       = targetsInput.value.trim();
    resultsByTarget  = {};
    totalTargets     = 0;
    completedTargets = 0;
    running          = true;
    setRunning(true);
    resultsDiv.innerHTML = '<div style="padding:12px;">Preparing targets\u2026</div>';
    vscode.postMessage({ command: 'traceroute', data: { targets } });
  });

  stopBtn.addEventListener('click', () => {
    running = false;
    setRunning(false);
    resultsDiv.innerHTML = '<div style="padding:12px;">Stopped.</div>';
    vscode.postMessage({ command: 'stop' });
  });

  clearBtn.addEventListener('click', () => {
    running          = false;
    resultsByTarget  = {};
    totalTargets     = 0;
    completedTargets = 0;
    inputLabel       = '';
    setRunning(false);
    resultsDiv.innerHTML = '';
    vscode.postMessage({ command: 'clear' });
  });

  function setRunning(on) {
    traceBtn.style.display = on ? 'none' : '';
    stopBtn.style.display  = on ? '' : 'none';
  }

  window.addEventListener('message', ({ data }) => {
    switch (data.command) {
      case 'tracerouteTotal':
        totalTargets     = data.total;
        completedTargets = 0;
        renderProgress(0, totalTargets);
        break;
      case 'tracerouteResult':
        handleTracerouteResult(data);
        break;
      case 'clearResults':
        resultsByTarget  = {};
        totalTargets     = 0;
        completedTargets = 0;
        resultsDiv.innerHTML = '';
        break;
      case 'toggleStop':
        break;
    }
  });

  function handleTracerouteResult({ data }) {
    if (!running) return;
    const { target, type } = data;
    if (!resultsByTarget[target]) {
      resultsByTarget[target] = { target, hops: [], summary: null };
    }
    if (type === 'hop') {
      resultsByTarget[target].hops.push(data.row);
    } else if (type === 'summary') {
      resultsByTarget[target].summary = data.summary;
      completedTargets++;
      renderProgress(completedTargets, totalTargets);
      if (totalTargets > 0 && completedTargets >= totalTargets) {
        running = false;
        setRunning(false);
        autoExportAll();
      }
    }
  }

  function renderProgress(done, total) {
    const pct = total > 0 ? Math.round(done / total * 100) : 0;
    resultsDiv.innerHTML = `<div style="padding:12px;">
      <div>Tracing <strong>${total}</strong> host${total !== 1 ? 's' : ''}&hellip; <strong>${done} / ${total}</strong> completed (${pct}%)</div>
      <div style="background:var(--vscode-editorWidget-border,#454545);height:6px;border-radius:3px;margin-top:10px;overflow:hidden;">
        <div style="background:var(--vscode-progressBar-background,#0e70c0);height:100%;width:${pct}%;transition:width 0.15s;"></div>
      </div>
    </div>`;
  }

  function autoExportAll() {
    let csv = 'Target,Hop,Hostname,IP,RTT 1,RTT 2,RTT 3,Status,Total Hops,Success Hops,Timeout Hops,Source,Source Mac,Timestamp\n';
    Object.values(resultsByTarget).forEach(group => {
      const s = group.summary;
      if (group.hops.length > 0) {
        group.hops.forEach((r, idx) => {
          csv += [
            group.target,
            r.hop || '', r.hostname, r.ip, r.rtt1, r.rtt2, r.rtt3, r.status,
            idx === 0 && s ? s.totalHops   : '',
            idx === 0 && s ? s.successHops : '',
            idx === 0 && s ? s.timeoutHops : '',
            r.localIP, r.macAddress, r.timestamp
          ].join(',') + '\n';
        });
      } else {
        csv += [
          group.target, '', '', '', '', '', '', '',
          s ? s.totalHops   : '',
          s ? s.successHops : '',
          s ? s.timeoutHops : '',
          '', '', ''
        ].join(',') + '\n';
      }
    });
    vscode.postMessage({ command: 'exportCSV', data: { csv, targets: [inputLabel] } });
    resultsDiv.innerHTML = `<div style="padding:12px;">
      <strong>${totalTargets} host${totalTargets !== 1 ? 's' : ''}</strong> traced. CSV exported automatically.
    </div>`;
  }
});
