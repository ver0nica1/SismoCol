/**
 * SismoCol · Seismic Catalog Module
 * Manages event filtering, paginated table rendering, and CSV exports
 * Operates reactively on the active mode's dataset (earthquakeEvents vs generalEvents).
 */

import { state, $, fmt, formatDepth, getMagnitudeClass, getActiveEvents } from './state.js';
import { focusLocation } from './map.js';
import { associationLabel, eventKindLabel } from './eventsClassifier.js';

export function initCatalog() {
  $('#filter-search')?.addEventListener('input', applyEventFilters);
  $('#filter-mag')?.addEventListener('change', applyEventFilters);
  $('#filter-type')?.addEventListener('change', applyEventFilters);
  $('#btn-export-csv')?.addEventListener('click', exportEventsCSV);
}

/**
 * Updates the options inside #filter-type depending on the current active mode
 */
export function updateCatalogTypeOptions() {
  const select = $('#filter-type');
  if (!select) return;

  const currentVal = select.value;
  const activeEvents = getActiveEvents();
  const hasSwarmRecords = activeEvents.some(ev => ['SWARM', 'POSSIBLE_SWARM'].includes(ev.association_status));
  if (state.currentMode === 'sismos') {
    select.innerHTML = `
      <option value="all">Todos los sismos</option>
      ${hasSwarmRecords ? '<option value="SWARM_GROUP">Enjambre sísmico</option>' : ''}
      <option value="UNASSOCIATED">Otro evento sísmico</option>
    `;
  } else {
    select.innerHTML = `
      <option value="all">Todos los eventos (Terremoto 2026)</option>
      <option value="MAINSHOCK">Sismo principal</option>
    `;
  }

  // Restore selection if valid, else default to 'all'
  const validOption = Array.from(select.options).some(o => o.value === currentVal);
  select.value = validOption ? currentVal : 'all';
}

export function applyEventFilters() {
  const searchTerm = ($('#filter-search')?.value || '').toLowerCase().trim();
  const magFilter = $('#filter-mag')?.value || 'all';
  const typeFilter = $('#filter-type')?.value || 'all';

  const sourceEvents = getActiveEvents();

  state.filteredEvents = sourceEvents.filter(ev => {
    // Text search
    if (searchTerm) {
      const text = `${ev.municipality || ''} ${ev.department || ''} ${ev.event_id || ''} ${ev.source || ''}`.toLowerCase();
      if (!text.includes(searchTerm)) return false;
    }

    // Magnitude filter
    const mag = ev.magnitude || 0;
    if (magFilter === 'mag-6' && mag < 6.0) return false;
    if (magFilter === 'mag-45' && mag < 4.5) return false;
    if (magFilter === 'mag-3' && mag < 3.0) return false;
    if (magFilter === 'mag-sub3' && mag >= 3.0) return false;

    // Type filter
    if (typeFilter === 'SWARM_GROUP') {
      if (!['SWARM', 'POSSIBLE_SWARM'].includes(ev.association_status)) return false;
    } else if (typeFilter !== 'all' && ev.association_status !== typeFilter) return false;

    return true;
  });

  state.currentPage = 1;
  renderEventsTable();
}

export function renderEventsTable() {
  const tbody = $('#events-table-body');
  const info = $('#table-info');
  const pager = $('#table-pager');
  if (!tbody) return;

  const total = state.filteredEvents.length;
  const pages = Math.max(1, Math.ceil(total / state.pageSize));
  state.currentPage = Math.min(state.currentPage, pages);

  const start = (state.currentPage - 1) * state.pageSize;
  const currentSlice = state.filteredEvents.slice(start, start + state.pageSize);

  if (currentSlice.length === 0) {
    const emptyMsg = state.currentMode === 'sismos'
      ? 'No se encontraron sismos en la red nacional con los filtros seleccionados.'
      : 'No se encontraron sismos del terremoto 2026 con los filtros seleccionados.';
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:24px; color:#64748b;">${emptyMsg}</td></tr>`;
  } else {
    tbody.innerHTML = currentSlice
      .map(ev => {
        const mag = ev.magnitude !== null && ev.magnitude !== undefined ? ev.magnitude : '—';
        const magClass = getMagnitudeClass(Number(mag) || 0);
        const typeClass =
          ev.association_status === 'MAINSHOCK'
            ? 'principal'
            : ev.association_status === 'CANDIDATE_AFTERSHOCK'
            ? 'replica'
            : '';

        return `
        <tr data-lat="${ev.latitude || ''}" data-lng="${ev.longitude || ''}">
          <td class="td-mono">${fmt(ev.occurred_at)}</td>
          <td><span class="badge-mag ${magClass}">${mag}</span></td>
          <td class="td-mono">${formatDepth(ev.depth_km)}</td>
          <td><strong>${fmt(ev.municipality)}</strong></td>
          <td>${fmt(ev.department)}</td>
          <td>${eventKindLabel(ev)}</td>
          <td><span class="badge-type ${typeClass}">${associationLabel(ev)}</span></td>
          <td style="color:#94a3b8; font-size:12px;">${fmt(ev.source)}</td>
          <td>
            ${
              ev.latitude && ev.longitude
                ? `<button class="btn-secondary btn-locate" style="padding:4px 8px; font-size:11px;" data-lat="${ev.latitude}" data-lng="${ev.longitude}">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg>
                    Ver
                  </button>`
                : '<span style="color:#64748b">—</span>'
            }
          </td>
        </tr>
      `;
      })
      .join('');
  }

  // Table info
  if (info) {
    const modeLabel = state.currentMode === 'sismos' ? 'sismos de la red nacional' : 'sismos del evento 2026';
    info.textContent = `Mostrando ${total > 0 ? start + 1 : 0} a ${Math.min(start + state.pageSize, total)} de ${total.toLocaleString('es-CO')} ${modeLabel}`;
  }

  // Pager controls
  if (pager) {
    pager.innerHTML = `
      <button class="pager-btn" ${state.currentPage === 1 ? 'disabled' : ''} data-page="${state.currentPage - 1}">‹ Anterior</button>
      <span style="font-family:'JetBrains Mono'; padding:0 8px;">Pág. ${state.currentPage} / ${pages}</span>
      <button class="pager-btn" ${state.currentPage === pages ? 'disabled' : ''} data-page="${state.currentPage + 1}">Siguiente ›</button>
    `;

    pager.querySelectorAll('.pager-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = Number(btn.dataset.page);
        if (p >= 1 && p <= pages) {
          state.currentPage = p;
          renderEventsTable();
        }
      });
    });
  }

  // Row / Button click to locate on map
  tbody.querySelectorAll('.btn-locate').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const lat = parseFloat(btn.dataset.lat);
      const lng = parseFloat(btn.dataset.lng);
      if (!isNaN(lat) && !isNaN(lng)) {
        focusLocation(lat, lng, 10);
      }
    });
  });

  tbody.querySelectorAll('tr').forEach(tr => {
    tr.addEventListener('click', () => {
      const lat = parseFloat(tr.dataset.lat);
      const lng = parseFloat(tr.dataset.lng);
      if (!isNaN(lat) && !isNaN(lng)) {
        focusLocation(lat, lng, 10);
      }
    });
  });
}

export function exportEventsCSV() {
  if (!state.filteredEvents || state.filteredEvents.length === 0) {
    alert('No hay eventos para exportar.');
    return;
  }

  const headers = ['ID Evento', 'Fecha/Hora (UTC)', 'Magnitud (escala no disponible)', 'Profundidad (km)', 'Latitud', 'Longitud', 'Municipio', 'Departamento', 'Tipo de evento', 'Relación con la secuencia', 'Distancia epicentral al principal (km)', 'Tiempo desde el principal (días)', 'Diferencia de profundidad (km; informativa)', 'Método de asociación', 'Fuente'];
  const rows = state.filteredEvents.map(e => [
    `"${e.event_id || ''}"`,
    `"${e.occurred_at || ''}"`,
    e.magnitude !== null ? e.magnitude : '',
    e.depth_km !== null ? e.depth_km : '',
    e.latitude !== null ? e.latitude : '',
    e.longitude !== null ? e.longitude : '',
    `"${e.municipality || ''}"`,
    `"${e.department || ''}"`,
    `"${e.event_type || ''}"`,
    `"${associationLabel(e)}"`,
    e.association_distance_km ?? '',
    e.association_time_days ?? '',
    e.depth_difference_km ?? '',
    `"${e.classification_method || ''}"`,
    `"${e.source || ''}"`
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const filenamePrefix = state.currentMode === 'sismos' ? 'sismocol_red_sismica' : 'sismocol_terremoto_2026';
  a.download = `${filenamePrefix}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
