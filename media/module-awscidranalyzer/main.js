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

// media/module-awscidranalyzer/main.js

// Suppress noisy ResizeObserver loop errors in the webview console
window.addEventListener('error', (event) => {
  if (event.message?.includes('ResizeObserver loop completed with undelivered notifications')) {
    event.preventDefault();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const vscode = acquireVsCodeApi();
  const cidrInput = document.getElementById('cidrInput');
  const searchBtn = document.getElementById('searchBtn');
  const exportBtn = document.getElementById('exportBtn');
  const regionOptionsDiv = document.getElementById('regionOptions');
  const regionsProgressDiv = document.getElementById('regions');
  const resultsDiv = document.getElementById('results');
  const statusEl = document.getElementById('status');

  if (!cidrInput || !searchBtn || !exportBtn || !regionOptionsDiv || !regionsProgressDiv || !resultsDiv || !statusEl) {
    console.error('AWS CIDR Analyzer: missing DOM elements');
    return;
  }

  const regionState = {
    options: [],
    selected: new Set()
  };

  const setStatus = (message, kind = 'info') => {
    statusEl.textContent = message || '';
    statusEl.className = kind ? kind : '';
  };

  const setLoading = (value) => {
    if (value) {
      searchBtn.disabled = true;
      exportBtn.disabled = true;
      setStatus('Searching AWS APIs…', 'loading');
    } else {
      searchBtn.disabled = false;
      if (!statusEl.textContent) {
        setStatus('', '');
      }
    }
  };

  const renderEmpty = (message) => {
    resultsDiv.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'empty-state';
    p.textContent = message;
    resultsDiv.appendChild(p);
  };

  const resetRegionsView = () => {
    regionsProgressDiv.innerHTML = '';
  };

  const ensureAllCheckbox = () => {
    const allCheckbox = regionOptionsDiv.querySelector('input[data-id="__all__"]');
    if (!allCheckbox) return;
    allCheckbox.checked = regionState.selected.size === 0;
  };

  const renderRegionOptions = (options) => {
    regionState.options = options;
    regionState.selected.clear();
    regionOptionsDiv.innerHTML = '';

    const buildCheckbox = (labelText, value, checked = false, disabled = false) => {
      const wrapper = document.createElement('label');
      wrapper.className = 'region-option';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.dataset.id = value;
      checkbox.checked = checked;
      checkbox.disabled = disabled;

      const label = document.createElement('span');
      label.textContent = labelText;

      wrapper.append(checkbox, label);
      return { wrapper, checkbox };
    };

    const allEntry = buildCheckbox('All regions', '__all__', true, options.length === 0);
    allEntry.checkbox.addEventListener('change', () => {
      if (allEntry.checkbox.checked) {
        regionState.selected.clear();
        regionOptionsDiv.querySelectorAll('input[type="checkbox"]').forEach(cb => {
          if (cb.dataset.id && cb.dataset.id !== '__all__') {
            cb.checked = false;
          }
        });
      } else if (regionState.selected.size === 0) {
        allEntry.checkbox.checked = true;
      }
    });
    regionOptionsDiv.appendChild(allEntry.wrapper);

    options.forEach(option => {
      const label = option.endpoint
        ? `${option.name} (${option.endpoint})`
        : option.name;
      const { wrapper, checkbox } = buildCheckbox(label, option.name, false, false);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          regionState.selected.add(option.name);
          allEntry.checkbox.checked = false;
        } else {
          regionState.selected.delete(option.name);
          if (regionState.selected.size === 0) {
            allEntry.checkbox.checked = true;
          }
        }
      });
      regionOptionsDiv.appendChild(wrapper);
    });

    ensureAllCheckbox();
  };

  const createRegionProgressItem = (region) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'region-item';
    wrapper.dataset.id = region.name;

    const icon = document.createElement('span');
    icon.className = 'status-icon loading';

    const label = document.createElement('span');
    label.className = 'region-label';
    label.textContent = region.endpoint
      ? `${region.name} (${region.endpoint})`
      : region.name;

    const note = document.createElement('span');
    note.className = 'region-note';
    note.textContent = 'Pending…';

    wrapper.append(icon, label, note);
    regionsProgressDiv.appendChild(wrapper);
  };

  const updateRegionStatus = (regionName, status, detail) => {
    const item = regionsProgressDiv.querySelector(`[data-id="${regionName}"]`);
    if (!item) {
      return;
    }
    const icon = item.querySelector('.status-icon');
    const note = item.querySelector('.region-note');
    icon.classList.remove('loading', 'success', 'error');

    switch (status) {
      case 'running':
        icon.classList.add('loading');
        note.textContent = 'Searching…';
        break;
      case 'done':
        icon.classList.add('success');
        note.textContent = `${detail?.count ?? 0} match${(detail?.count ?? 0) === 1 ? '' : 'es'}`;
        break;
      case 'error':
        icon.classList.add('error');
        note.textContent = detail?.message ? `Error: ${detail.message}` : 'Error';
        break;
      default:
        note.textContent = '';
        break;
    }
  };

  const renderResults = (results, cidrs, columns) => {
    const joinedCidrs = Array.isArray(cidrs) ? cidrs.join(', ') : '';

    if (!Array.isArray(results) || results.length === 0) {
      renderEmpty(`No results for ${joinedCidrs || 'your query'}.`);
      exportBtn.disabled = true;
      return;
    }

    resultsDiv.innerHTML = '';

    const table = document.createElement('vscode-table');
    table.zebra = true;
    table['bordered-rows'] = true;

    const header = document.createElement('vscode-table-header');
    header.slot = 'header';
    const safeColumns = Array.isArray(columns) && columns.length ? columns : Object.keys(results[0] || {});
    safeColumns.forEach((col) => {
      const cell = document.createElement('vscode-table-header-cell');
      cell.textContent = col;
      header.appendChild(cell);
    });
    table.appendChild(header);

    const body = document.createElement('vscode-table-body');
    body.slot = 'body';

    results.forEach((row) => {
      const tr = document.createElement('vscode-table-row');
      safeColumns.forEach((col) => {
        const td = document.createElement('vscode-table-cell');
        const value = row ? row[col] : undefined;
        if (value === null || value === undefined) {
          td.textContent = '';
        } else if (typeof value === 'object') {
          td.textContent = JSON.stringify(value);
        } else {
          td.textContent = String(value);
        }
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });

    table.appendChild(body);
    resultsDiv.appendChild(table);
    exportBtn.disabled = false;
  };

  searchBtn.addEventListener('click', () => {
    const cidr = cidrInput.value.trim();
    if (!cidr) {
      setStatus('Enter a CIDR, e.g. 10.10.0.0/16', 'error');
      cidrInput.focus();
      return;
    }
    resetRegionsView();
    resultsDiv.innerHTML = '';
    exportBtn.disabled = true;

    const selectedNames = Array.from(regionState.selected);
    ensureAllCheckbox();

    vscode.postMessage({
      command: 'lookupCidr',
      cidr,
      regions: selectedNames.length ? selectedNames : undefined
    });
  });

  exportBtn.addEventListener('click', () => {
    vscode.postMessage({ command: 'exportCsv' });
  });

  vscode.postMessage({ command: 'requestRegions' });

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data) {
      return;
    }

    switch (data.command) {
      case 'setLoading':
        setLoading(!!data.value);
        break;
      case 'regionOptions':
        renderRegionOptions(data.regions || []);
        break;
      case 'initRegions':
        resetRegionsView();
        if (Array.isArray(data.regions)) {
          data.regions.forEach(createRegionProgressItem);
        }
        break;
      case 'regionStatus':
        updateRegionStatus(data.region, data.status, { count: data.count, message: data.message });
        break;
      case 'displayResults':
        renderResults(data.results, data.cidrs, data.columns);
        setStatus(
          `Found ${data.results.length} entr${data.results.length === 1 ? 'y' : 'ies'} for ${Array.isArray(data.cidrs) ? data.cidrs.join(', ') : 'your query'}.`,
          data.results.length ? 'info' : 'warning'
        );
        break;
      case 'showError':
        setStatus(data.message || 'Unexpected error.', 'error');
        exportBtn.disabled = true;
        break;
      case 'showInfo':
        setStatus(data.message || '', 'info');
        if (data.message?.includes('No matches')) {
          renderEmpty(data.message);
        }
        break;
      default:
        break;
    }
  });
});
