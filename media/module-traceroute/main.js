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

// suppress ResizeObserver loop errors
window.addEventListener('error', event => {
  if (
    event.message &&
    event.message.includes('ResizeObserver loop completed with undelivered notifications')
  ) {
    event.preventDefault();
    return false;
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const vscode = acquireVsCodeApi();
  const targetsInput = document.getElementById('targets');
  const traceBtn = document.getElementById('traceBtn');
  const clearBtn = document.getElementById('clearBtn');
  const exportBtn = document.getElementById('exportBtn');
  const resultsDiv = document.getElementById('results');
  let resultsByTarget = {};

  if (!targetsInput || !traceBtn || !clearBtn || !exportBtn || !resultsDiv) {
    console.error('Missing DOM elements in Traceroute UI');
    return;
  }

  traceBtn.addEventListener('click', () => {
    const targets = targetsInput.value.split(/,|\n/)
      .map(t => t.trim()).filter(t => t);
    resultsByTarget = {};
    renderClear();
    vscode.postMessage({
      command: 'traceroute',
      data: { targets }
    });
  });

  clearBtn.addEventListener('click', () => {
    resultsByTarget = {};
    renderClear();
    vscode.postMessage({ command: 'clear' });
  });

  exportBtn.addEventListener('click', () => {
    // I export one file per target
    Object.values(resultsByTarget).forEach(group => {
      let csv = '';
      group.hops.forEach(r => {
        csv += [
          r.hop || '',
          r.hostname,
          r.ip,
          r.rtt1,
          r.rtt2,
          r.rtt3,
          r.status,
          r.target,
          r.localIP,
          r.macAddress,
          r.timestamp
        ].join(',') + '\n';
      });
      const s = group.summary;
      if (s) {
        csv += `Summary:,Total=${s.totalHops},Success=${s.successHops},Timeout=${s.timeoutHops}\n`;
      }
      vscode.postMessage({ command: 'exportCSV', data: { csv, targets: [group.target] } });
    });
  });

  window.addEventListener('message', ({ data }) => {
    switch (data.command) {
      case 'tracerouteResult':
        handleTracerouteResult(data);
        break;
      case 'clearResults':
        renderClear();
        break;
      case 'toggleStop':
        break;
    }
  });

  function handleTracerouteResult({ data }) {
    const { target, type } = data;
    if (!resultsByTarget[target]) {
      resultsByTarget[target] = { target, hops: [], summary: null };
    }
    if (type === 'hop') {
      resultsByTarget[target].hops.push(data.row);
    } else if (type === 'summary') {
      resultsByTarget[target].summary = data.summary;
    }
    renderAll();
  }

  function renderClear() {
    resultsDiv.innerHTML = '';
    resultsByTarget = {};
  }

  function renderAll() {
    resultsDiv.innerHTML = '';
    for (const key in resultsByTarget) {
      const group = resultsByTarget[key];
      const title = document.createElement('h3');
      title.textContent = `Traceroute: ${group.target}`;
      resultsDiv.appendChild(title);

      const table = document.createElement('vscode-table');
      table.zebra = true;
      table['bordered-rows'] = true;

      const header = document.createElement('vscode-table-header');
      header.slot = 'header';
      ['Hop', 'Hostname', 'IP', 'RTT 1', 'RTT 2', 'RTT 3', 'Status', 'Timestamp']
        .forEach(col => {
          const th = document.createElement('vscode-table-header-cell');
          th.textContent = col;
          header.appendChild(th);
        });
      table.appendChild(header);

      const body = document.createElement('vscode-table-body');
      body.slot = 'body';
      group.hops.forEach(row => {
        const tr = document.createElement('vscode-table-row');
        const isTimeout = row.status === 'timeout';

        [row.hop, row.hostname, row.ip, row.rtt1, row.rtt2, row.rtt3, row.status, row.timestamp]
          .forEach((val, idx) => {
            const td = document.createElement('vscode-table-cell');
            td.textContent = val;
            // Color the status cell
            if (idx === 6) {
              td.style.color = isTimeout ? '#f14c4c' : '#4ec9b0';
              td.style.fontWeight = 'bold';
            }
            // Color timeout rows
            if (isTimeout && idx >= 1 && idx <= 5) {
              td.style.color = '#f14c4c';
            }
            tr.appendChild(td);
          });
        body.appendChild(tr);
      });

      if (group.summary) {
        const tr = document.createElement('vscode-table-row');
        const td = document.createElement('vscode-table-cell');
        td.colSpan = 8;
        td.style.fontWeight = 'bold';
        const s = group.summary;
        td.textContent = `Total hops: ${s.totalHops} | Success: ${s.successHops} | Timeout: ${s.timeoutHops}`;
        tr.appendChild(td);
        body.appendChild(tr);
      }

      table.appendChild(body);
      resultsDiv.appendChild(table);
    }
  }
});
