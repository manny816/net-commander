/***************************************************************************
 *   Extension:   Net Commander                                            *
 *   Author:      skhell                                                   *
 *   Engineer dashboard customizations for manny816/net-commander          *
 *                                                                         *
 *   Licensed under the MIT License. See LICENSE file in the project       *
 *   root for details.                                                     *
 ***************************************************************************/

(function () {
  const MAX_POINTS = 90;
  const signalData = [];
  const snrData = [];
  let signalChart;
  let snrChart;
  let prevRxBytes = null;
  let prevTxBytes = null;
  let prevCounterAt = null;

  const vscode = acquireVsCodeApi();
  const pcapBtn = document.getElementById('pcapBtn');
  const csvBtn = document.getElementById('csvBtn');

  function valueOrDash(value) {
    return value === undefined || value === null || value === '' ? '—' : String(value);
  }

  function snr(info) {
    if (Number.isFinite(info.snrDb)) return Number(info.snrDb);
    if (Number.isFinite(info.signalDbm) && Number.isFinite(info.noiseDbm)) {
      return Number(info.signalDbm) - Number(info.noiseDbm);
    }
    return undefined;
  }

  function rssiAssessment(rssi) {
    if (!Number.isFinite(rssi)) return { label: 'UNKNOWN', className: 'unknown' };
    if (rssi >= -55) return { label: 'EXCELLENT', className: 'excellent' };
    if (rssi >= -67) return { label: 'GOOD', className: 'good' };
    if (rssi >= -70) return { label: 'FAIR', className: 'fair' };
    if (rssi >= -75) return { label: 'MARGINAL', className: 'marginal' };
    return { label: 'POOR', className: 'poor' };
  }

  function snrAssessment(value) {
    if (!Number.isFinite(value)) return { label: 'UNKNOWN', className: 'unknown' };
    if (value >= 40) return { label: 'EXCELLENT', className: 'excellent' };
    if (value >= 30) return { label: 'GOOD', className: 'good' };
    if (value >= 25) return { label: 'FAIR', className: 'fair' };
    if (value >= 20) return { label: 'MARGINAL', className: 'marginal' };
    return { label: 'POOR', className: 'poor' };
  }

  function setBadge(elementId, assessment) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = assessment.label;
    el.className = 'health-badge ' + assessment.className;
  }

  function engineerHeader() {
    const title = document.querySelector('.top-bar h1');
    if (title) title.textContent = 'NET Commander RF Dashboard';

    const header = document.querySelector('.header');
    if (!header) return;

    header.innerHTML = `
      <div class="section metric-card connection-card">
        <div class="metric-title">Current Connection</div>
        <div class="primary-value" id="ssid-val">—</div>
        <div class="metric-row"><span>BSSID</span><strong id="bssid-val">—</strong></div>
        <div class="metric-row"><span>Interface</span><strong id="iface-val">—</strong></div>
        <div class="metric-row"><span>IP</span><strong id="ip-val">—</strong></div>
      </div>
      <div class="section metric-card">
        <div class="metric-title">RF Health</div>
        <div class="health-line"><span>RSSI</span><strong id="rssi-val">—</strong><span id="rssi-health" class="health-badge unknown">UNKNOWN</span></div>
        <div class="health-line"><span>SNR</span><strong id="snr-val">—</strong><span id="snr-health" class="health-badge unknown">UNKNOWN</span></div>
        <div class="metric-row"><span>Noise floor</span><strong id="noise-val">—</strong></div>
      </div>
      <div class="section metric-card">
        <div class="metric-title">Radio / PHY</div>
        <div class="metric-row"><span>PHY</span><strong id="phy-val">—</strong></div>
        <div class="metric-row"><span>Band</span><strong id="band-val">—</strong></div>
        <div class="metric-row"><span>Channel</span><strong id="channel-val">—</strong></div>
        <div class="metric-row"><span>Width</span><strong id="width-val">—</strong></div>
        <div class="metric-row"><span>MCS</span><strong id="mcs-val">—</strong></div>
        <div class="metric-row"><span>Tx PHY rate</span><strong id="tx-phy-val">—</strong></div>
      </div>
      <div class="section metric-card">
        <div class="metric-title">Interface Traffic</div>
        <div class="metric-row"><span>RX</span><strong id="rx-rate-val">—</strong></div>
        <div class="metric-row"><span>TX</span><strong id="tx-rate-val">—</strong></div>
        <div class="metric-row"><span>Dropped RX</span><strong id="rx-dropped-val">—</strong></div>
        <div class="metric-row"><span>Dropped TX</span><strong id="tx-dropped-val">—</strong></div>
        <div class="metric-row"><span>Client MAC</span><strong id="mac-val">—</strong></div>
      </div>`;

    const neighborHeader = document.querySelector('#neighbor-signal-block .chart-header');
    if (neighborHeader) {
      neighborHeader.innerHTML = `
        <div>
          <h2>Neighbor / Interference Context</h2>
          <div class="panel-subtitle">Strong neighbors are not inherently bad. Evaluate channel reuse, overlap and airtime context.</div>
        </div>`;
    }

    const signalHeader = document.querySelector('#signal-chart .chart-header');
    if (signalHeader) {
      signalHeader.innerHTML = `
        <div>
          <h2>Client RSSI History</h2>
          <div class="panel-subtitle">Enterprise voice/data reference: -67 dBm is a common design boundary, not a universal pass/fail threshold.</div>
        </div>`;
    }

    const infoHeader = document.querySelector('.info-block .chart-header h2');
    if (infoHeader) infoHeader.textContent = 'Raw Evidence';

    const linkHeader = document.querySelector('#link-chart .chart-header');
    if (linkHeader) {
      linkHeader.innerHTML = `
        <div>
          <h2>SNR History</h2>
          <div class="panel-subtitle">SNR is signal minus noise floor and is usually more diagnostic than RSSI alone.</div>
        </div>`;
    }

    const footerHeaders = document.querySelectorAll('.footer .chart-header h2');
    if (footerHeaders[0]) footerHeaders[0].textContent = '2.4 GHz Channel Context';
    if (footerHeaders[1]) footerHeaders[1].textContent = '5 / 6 GHz Channel Context';
  }

  function initTimeChart(id, yDomain) {
    const svgEl = document.querySelector('#' + id + ' svg');
    if (!svgEl) return null;
    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();
    const rect = svgEl.getBoundingClientRect();
    const width = Math.max(rect.width, 400);
    const height = Math.max(rect.height, 250);
    const margin = { top: 20, right: 20, bottom: 28, left: 48 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    svg.attr('viewBox', `0 0 ${width} ${height}`);
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
    const x = d3.scaleTime().range([0, innerWidth]);
    const y = d3.scaleLinear().domain(yDomain).range([innerHeight, 0]);
    g.append('g').attr('class', 'y-axis');
    g.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${innerHeight})`);
    const line = d3.line().x(d => x(d.time)).y(d => y(d.value)).curve(d3.curveMonotoneX);
    const path = g.append('path').attr('fill', 'none').attr('stroke', 'var(--vscode-charts-blue)').attr('stroke-width', 2);
    const reference = g.append('line').attr('x1', 0).attr('x2', innerWidth).attr('stroke-dasharray', '5,5');
    return { g, x, y, line, path, reference };
  }

  function renderTimeChart(chart, points, referenceValue) {
    if (!chart || !points.length) return;
    chart.x.domain(d3.extent(points, d => d.time));
    chart.path.datum(points).attr('d', chart.line);
    chart.g.select('.y-axis').call(d3.axisLeft(chart.y));
    chart.g.select('.x-axis').call(d3.axisBottom(chart.x).ticks(5));
    if (Number.isFinite(referenceValue)) {
      chart.reference.attr('y1', chart.y(referenceValue)).attr('y2', chart.y(referenceValue)).attr('stroke', 'var(--vscode-descriptionForeground)');
    }
  }

  function updateTraffic(info) {
    const now = Date.now();
    if (prevCounterAt != null && Number.isFinite(info.rxBytes) && Number.isFinite(prevRxBytes)) {
      const elapsed = Math.max((now - prevCounterAt) / 1000, 0.001);
      const mbps = Math.max(0, (info.rxBytes - prevRxBytes) * 8 / elapsed / 1e6);
      const el = document.getElementById('rx-rate-val');
      if (el) el.textContent = mbps.toFixed(2) + ' Mbps';
    }
    if (prevCounterAt != null && Number.isFinite(info.txBytes) && Number.isFinite(prevTxBytes)) {
      const elapsed = Math.max((now - prevCounterAt) / 1000, 0.001);
      const mbps = Math.max(0, (info.txBytes - prevTxBytes) * 8 / elapsed / 1e6);
      const el = document.getElementById('tx-rate-val');
      if (el) el.textContent = mbps.toFixed(2) + ' Mbps';
    }
    if (Number.isFinite(info.rxBytes)) prevRxBytes = info.rxBytes;
    if (Number.isFinite(info.txBytes)) prevTxBytes = info.txBytes;
    prevCounterAt = now;
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = valueOrDash(value);
  }

  function updateSummary(info) {
    const currentSnr = snr(info);
    setText('ssid-val', info.ssid || 'SSID unavailable / redacted');
    setText('bssid-val', info.bssid || 'BSSID unavailable / redacted');
    setText('iface-val', info.iface);
    setText('ip-val', info.ipAddr);
    setText('mac-val', info.mac);
    setText('rssi-val', Number.isFinite(info.signalDbm) ? `${info.signalDbm} dBm` : undefined);
    setText('noise-val', Number.isFinite(info.noiseDbm) ? `${info.noiseDbm} dBm` : undefined);
    setText('snr-val', Number.isFinite(currentSnr) ? `${currentSnr} dB` : undefined);
    setText('phy-val', info.mode);
    setText('band-val', info.band);
    setText('channel-val', info.channel);
    setText('width-val', Number.isFinite(info.widthMHz) ? `${info.widthMHz} MHz` : undefined);
    setText('mcs-val', info.mcsIndex);
    setText('tx-phy-val', Number.isFinite(info.txRateMbps) ? `${info.txRateMbps} Mbps` : undefined);
    setText('rx-dropped-val', Number.isFinite(info.rxDropped) ? info.rxDropped : undefined);
    setText('tx-dropped-val', Number.isFinite(info.txDropped) ? info.txDropped : undefined);
    setBadge('rssi-health', rssiAssessment(Number(info.signalDbm)));
    setBadge('snr-health', snrAssessment(currentSnr));
    updateTraffic(info);
  }

  function updateRawEvidence(info) {
    const tbody = document.getElementById('info-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    const fields = [
      ['Timestamp', info.timestamp], ['Interface', info.iface], ['SSID', info.ssid], ['BSSID', info.bssid],
      ['IP address', info.ipAddr], ['Client MAC', info.mac], ['PHY mode', info.mode], ['Band', info.band],
      ['Channel', info.channel], ['Channel width', Number.isFinite(info.widthMHz) ? `${info.widthMHz} MHz` : undefined],
      ['RSSI', Number.isFinite(info.signalDbm) ? `${info.signalDbm} dBm` : undefined],
      ['Noise floor', Number.isFinite(info.noiseDbm) ? `${info.noiseDbm} dBm` : undefined],
      ['SNR', Number.isFinite(snr(info)) ? `${snr(info)} dB` : undefined],
      ['Tx PHY rate', Number.isFinite(info.txRateMbps) ? `${info.txRateMbps} Mbps` : undefined],
      ['MCS index', info.mcsIndex], ['Security', info.security], ['Network type', info.networkType],
      ['Neighbor radios', Array.isArray(info.neighborDetails) ? info.neighborDetails.length : 0],
      ['RX bytes', info.rxBytes], ['TX bytes', info.txBytes], ['Dropped RX', info.rxDropped], ['Dropped TX', info.txDropped]
    ];
    fields.forEach(([key, value]) => {
      const row = document.createElement('vscode-table-row');
      const keyCell = document.createElement('vscode-table-cell');
      const valueCell = document.createElement('vscode-table-cell');
      keyCell.textContent = key;
      valueCell.textContent = valueOrDash(value);
      row.appendChild(keyCell);
      row.appendChild(valueCell);
      tbody.appendChild(row);
    });
  }

  function updateCharts(info) {
    if (Number.isFinite(info.signalDbm)) {
      signalData.push({ time: new Date(), value: Number(info.signalDbm) });
      if (signalData.length > MAX_POINTS) signalData.shift();
      renderTimeChart(signalChart, signalData, -67);
    }
    const currentSnr = snr(info);
    if (Number.isFinite(currentSnr)) {
      snrData.push({ time: new Date(), value: currentSnr });
      if (snrData.length > MAX_POINTS) snrData.shift();
      renderTimeChart(snrChart, snrData, 25);
    }
  }

  function renderNeighbors(info) {
    const panel = document.getElementById('neighbor-signal-block');
    if (!panel) return;
    let body = panel.querySelector('.neighbor-evidence');
    const svg = panel.querySelector('svg');
    if (!body) {
      body = document.createElement('div');
      body.className = 'neighbor-evidence';
      if (svg) svg.replaceWith(body);
      else panel.appendChild(body);
    }

    const neighbors = Array.isArray(info.neighborDetails) ? [...info.neighborDetails] : [];
    neighbors.sort((a, b) => (Number(b.signalDbm) || -999) - (Number(a.signalDbm) || -999));

    if (!neighbors.length) {
      body.innerHTML = '<div class="coming-data">No neighbor RF records are currently exposed by macOS. Current-link RF evidence remains available.</div>';
      return;
    }

    const sameChannel = neighbors.filter(n => Number(n.channel) === Number(info.channel) && n.band === info.band).length;
    const strongest = neighbors[0];
    const rows = neighbors.slice(0, 12).map(n => `
      <div class="neighbor-row">
        <div><strong>${valueOrDash(n.ssid)}</strong><span>${valueOrDash(n.bssid)}</span></div>
        <div><span>${valueOrDash(n.band)}</span><strong>Ch ${valueOrDash(n.channel)}</strong></div>
        <div><span>${Number.isFinite(n.widthMHz) ? n.widthMHz + ' MHz' : '—'}</span><strong>${Number.isFinite(n.signalDbm) ? n.signalDbm + ' dBm' : 'RSSI n/a'}</strong></div>
        <div><span>${valueOrDash(n.mode)}</span><strong>${valueOrDash(n.security)}</strong></div>
      </div>`).join('');

    body.innerHTML = `
      <div class="neighbor-summary">
        <div><span>Detected radios</span><strong>${neighbors.length}</strong></div>
        <div><span>Same primary channel</span><strong>${sameChannel}</strong></div>
        <div><span>Strongest neighbor</span><strong>${Number.isFinite(strongest.signalDbm) ? strongest.signalDbm + ' dBm' : 'n/a'}</strong></div>
      </div>
      <div class="neighbor-list">${rows}</div>
      <div class="evidence-note">Same-channel count is a candidate CCI indicator only. Airtime utilization and AP identity are required before declaring interference.</div>`;
  }

  function renderChannelContext(info) {
    const neighbors = Array.isArray(info.neighborDetails) ? info.neighborDetails : [];
    const groups = [
      { selector: '#bot1', title: '2.4 GHz', filter: n => n.band === '2.4 GHz' },
      { selector: '#bot2', title: '5 / 6 GHz', filter: n => n.band === '5 GHz' || n.band === '6 GHz' }
    ];

    groups.forEach(group => {
      const section = document.querySelector(group.selector);
      if (!section) return;
      let holder = section.querySelector('.channel-context');
      const svg = section.querySelector('svg');
      if (!holder) {
        holder = document.createElement('div');
        holder.className = 'channel-context';
        if (svg) svg.replaceWith(holder);
        else section.appendChild(holder);
      }

      const entries = neighbors.filter(group.filter);
      if (!entries.length) {
        holder.innerHTML = '<div class="coming-data">No radios observed in this band.</div>';
        return;
      }

      const byChannel = new Map();
      entries.forEach(n => {
        const current = byChannel.get(n.channel) || { count: 0, strongest: undefined };
        current.count += 1;
        if (Number.isFinite(n.signalDbm) && (!Number.isFinite(current.strongest) || n.signalDbm > current.strongest)) current.strongest = n.signalDbm;
        byChannel.set(n.channel, current);
      });

      holder.innerHTML = Array.from(byChannel.entries())
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([channel, data]) => `<div class="channel-chip ${Number(channel) === Number(info.channel) ? 'serving-channel' : ''}"><strong>Ch ${channel}</strong><span>${data.count} radio${data.count === 1 ? '' : 's'}</span><span>${Number.isFinite(data.strongest) ? data.strongest + ' dBm' : 'RSSI n/a'}</span></div>`)
        .join('');
    });
  }

  function initialize() {
    engineerHeader();
    signalChart = initTimeChart('signal-chart', [-90, -30]);
    snrChart = initTimeChart('link-chart', [0, 60]);
    if (pcapBtn) pcapBtn.onclick = () => vscode.postMessage({ command: 'togglePcap' });
    if (csvBtn) csvBtn.onclick = () => vscode.postMessage({ command: 'exportCsv' });
  }

  window.addEventListener('message', event => {
    const msg = event.data;
    if (msg.command === 'pcapStarted') {
      if (pcapBtn) { pcapBtn.textContent = 'Stop Packet Capture'; pcapBtn.disabled = false; }
      return;
    }
    if (msg.command === 'pcapStopped' || msg.command === 'pcapError') {
      if (pcapBtn) { pcapBtn.textContent = 'Start Packet Capture'; pcapBtn.disabled = false; }
      return;
    }
    if (csvBtn) csvBtn.disabled = false;
    updateSummary(msg);
    updateRawEvidence(msg);
    updateCharts(msg);
    renderNeighbors(msg);
    renderChannelContext(msg);
  });

  initialize();
})();
