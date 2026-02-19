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

// media/module-ping/main.js

window.addEventListener('error', event => {
    if (event.message && event.message.includes('ResizeObserver loop completed with undelivered notifications')) {
      event.preventDefault();
      return false;
    }
  });

document.addEventListener('DOMContentLoaded', () => {
    const vscode        = acquireVsCodeApi();
    const targetsInput  = document.getElementById('pingtargets');
    const countInput    = document.getElementById('pingcount');
    const sizeInput     = document.getElementById('pingsize');
    const pingBtn       = document.getElementById('pingBtn');
    const stopBtn       = document.getElementById('stopBtn');
    const clearBtn      = document.getElementById('clearBtn');
    const resultsDiv    = document.getElementById('results');

    let resultsByTarget = {};
    let totalTargets    = 0;
    let completedTargets = 0;
    let inputLabel      = '';
    let running         = false;

    if (!targetsInput || !countInput || !sizeInput || !pingBtn || !stopBtn || !clearBtn || !resultsDiv) {
      console.error('Missing DOM elements in Ping UI');
      return;
    }

    pingBtn.addEventListener('click', () => {
      const targets = targetsInput.value.split(/[,\n]/).map(t => t.trim()).filter(t => t);
      if (targets.length === 0) return;
      inputLabel        = targetsInput.value.trim();
      resultsByTarget   = {};
      totalTargets      = 0;
      completedTargets  = 0;
      running           = true;
      setRunning(true);
      resultsDiv.innerHTML = '<div style="padding:12px;">Preparing targets\u2026</div>';
      vscode.postMessage({
        command: 'ping',
        data: { targets, count: parseInt(countInput.value, 10) || 4, size: parseInt(sizeInput.value, 10) || 56 }
      });
    });

    stopBtn.addEventListener('click', () => {
      running = false;
      setRunning(false);
      resultsDiv.innerHTML = '<div style="padding:12px;">Stopped.</div>';
      vscode.postMessage({ command: 'stop' });
    });

    clearBtn.addEventListener('click', () => {
      running           = false;
      resultsByTarget   = {};
      totalTargets      = 0;
      completedTargets  = 0;
      inputLabel        = '';
      setRunning(false);
      resultsDiv.innerHTML = '';
      vscode.postMessage({ command: 'clear' });
    });

    function setRunning(on) {
      pingBtn.style.display = on ? 'none' : '';
      stopBtn.style.display = on ? '' : 'none';
    }

    window.addEventListener('message', ({ data }) => {
      switch (data.command) {
        case 'pingTotal':
          totalTargets     = data.total;
          completedTargets = 0;
          renderProgress(0, totalTargets);
          break;
        case 'pingResult':
          handlePingResult(data);
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

    function handlePingResult({ data }) {
      if (!running) return;
      const { target, type } = data;
      if (!resultsByTarget[target]) {
        resultsByTarget[target] = { target, replies: [], summary: null };
      }
      if (type === 'reply') {
        const entry = resultsByTarget[target];
        entry.replies.push(data.row);

        // Compute cumulative running stats up to this reply
        const replies  = entry.replies;
        const received = replies.length;
        const sent     = parseInt(data.row.seq, 10) || received;
        const lossStr  = sent > 0 ? ((sent - received) / sent * 100).toFixed(1) + '%' : '0%';
        const rtts     = replies.map(r => parseFloat(r.time)).filter(v => !isNaN(v));
        data.row._running = {
          sent,
          received,
          loss:   lossStr,
          rttMin: rtts.length ? Math.min(...rtts).toFixed(3) + ' ms' : '',
          rttAvg: rtts.length ? (rtts.reduce((a, b) => a + b, 0) / rtts.length).toFixed(3) + ' ms' : '',
          rttMax: rtts.length ? Math.max(...rtts).toFixed(3) + ' ms' : ''
        };
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
        <div>Pinging <strong>${total}</strong> host${total !== 1 ? 's' : ''}&hellip; <strong>${done} / ${total}</strong> completed (${pct}%)</div>
        <div style="background:var(--vscode-editorWidget-border,#454545);height:6px;border-radius:3px;margin-top:10px;overflow:hidden;">
          <div style="background:var(--vscode-progressBar-background,#0e70c0);height:100%;width:${pct}%;transition:width 0.15s;"></div>
        </div>
      </div>`;
    }

    function autoExportAll() {
      let csv = 'Target,Seq,Bytes,TTL,Time,Sent,Received,Loss,RTT Min,RTT Avg,RTT Max,Source,Source Mac,Timestamp\n';
      Object.values(resultsByTarget).forEach(group => {
        const s = group.summary;
        if (group.replies.length > 0) {
          group.replies.forEach((r) => {
            const rs = r._running || {};
            csv += [
              group.target,
              r.seq || '',
              r.bytes, r.ttl, r.time,
              rs.sent     !== undefined ? rs.sent     : '',
              rs.received !== undefined ? rs.received : '',
              rs.loss   || '',
              rs.rttMin || '',
              rs.rttAvg || '',
              rs.rttMax || '',
              r.localIP, r.macAddress, r.timestamp
            ].join(',') + '\n';
          });
        } else {
          // unreachable host — one row with summary stats so it appears in the CSV
          csv += [
            group.target, '', '', '', '',
            s ? s.transmitted : '',
            s ? s.received    : '',
            s ? s.loss        : '',
            '', '', '', '', '', ''
          ].join(',') + '\n';
        }
      });
      vscode.postMessage({ command: 'exportCSV', data: { csv, targets: [inputLabel] } });
      resultsDiv.innerHTML = `<div style="padding:12px;">
        <strong>${totalTargets} host${totalTargets !== 1 ? 's' : ''}</strong> completed. CSV exported automatically.
      </div>`;
    }
  });
