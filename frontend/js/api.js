/**
 * SismoCol · API & Data Loading Module
 * Coordinates asynchronous endpoint querying and view updates
 */

import { state, $, getActiveEvents } from './state.js';
import { classifyEvents } from './eventsClassifier.js';
import { renderMetrics } from './metrics.js';
import { renderMapLayers } from './map.js';
import { renderChart } from './chart.js';
import { renderEventsTable, updateCatalogTypeOptions } from './catalog.js';
import { renderCities } from './cities.js';
import { renderNews } from './news.js';

export async function fetchJson(endpoint) {
  try {
    const res = await fetch(endpoint);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn(`Error fetching ${endpoint}:`, err);
    return [];
  }
}

/**
 * Data source detection:
 * - GitHub Pages (static build): `data/manifest.json` exists -> read `data/<name>.json`.
 * - Local Python server (`python -m backend.main`): no manifest -> read `/api/<name>`.
 */
let dataSourcePromise = null;

function detectDataSource() {
  if (!dataSourcePromise) {
    dataSourcePromise = fetch('data/manifest.json', { cache: 'no-store' })
      .then(async res => (res.ok ? { mode: 'static', manifest: await res.json() } : { mode: 'api' }))
      .catch(() => ({ mode: 'api' }));
  }
  return dataSourcePromise;
}

async function loadDataset(name) {
  const source = await detectDataSource();
  return fetchJson(source.mode === 'static' ? `data/${name}.json` : `/api/${name}`);
}

export async function loadAllData(isRefresh = false) {
  const statusEl = $('#system-status');
  if (statusEl) statusEl.textContent = 'Consultando telemetría...';

  try {
    const [summary, events, cities, cityTimeline, news] = await Promise.all([
      loadDataset('summary'),
      loadDataset('events'),
      loadDataset('cities'),
      loadDataset('city-timeline'),
      loadDataset('news')
    ]);

    state.summary = summary || {};
    state.events = Array.isArray(events) ? events : [];

    // Split events using the backend classification (earthquake_id)
    const { earthquakeEvents, generalEvents } = classifyEvents(state.events);
    state.earthquakeEvents = earthquakeEvents;
    state.generalEvents = generalEvents;

    state.filteredEvents = [...getActiveEvents()];
    state.cities = Array.isArray(cities) ? cities : [];
    state.cityTimeline = Array.isArray(cityTimeline) ? cityTimeline : [];
    state.news = Array.isArray(news) ? news : [];

    // Update tab badge counts
    const evBadge = $('#badge-events-count');
    if (evBadge) evBadge.textContent = getActiveEvents().length.toLocaleString('es-CO');

    const citiesBadge = $('#badge-cities-count');
    if (citiesBadge) citiesBadge.textContent = state.cities.length.toLocaleString('es-CO');

    const newsBadge = $('#badge-news-count');
    if (newsBadge) newsBadge.textContent = state.news.length.toLocaleString('es-CO');

    if (statusEl) {
      statusEl.textContent = `Catálogo cargado (${state.events.length} sismos)`;
    }

    // Update timestamp badge
    const timeEl = $('#timestamp-val');
    if (timeEl) {
      let latestTime = null;
      if (state.events && state.events.length > 0) {
        latestTime = state.events[0].occurred_at;
      } else if (state.summary?.earthquake?.updated_at) {
        latestTime = state.summary.earthquake.updated_at;
      }

      if (latestTime) {
        try {
          const normalizedTime = latestTime.trim().replace(' ', 'T');
          const d = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(normalizedTime) ? normalizedTime : `${normalizedTime}Z`);
          if (!isNaN(d.getTime())) {
            const dateStr = d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Bogota' });
            const timeStr = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Bogota' });
            timeEl.innerHTML = `Corte: <strong>${dateStr} ${timeStr} COT</strong>`;
          } else {
            timeEl.innerHTML = `Corte: <strong>${latestTime}</strong>`;
          }
        } catch {
          timeEl.innerHTML = `Corte: <strong>${latestTime}</strong>`;
        }
      }
    }

    // Configure catalog filter options based on active mode
    updateCatalogTypeOptions();

    // Render all components
    renderMetrics();
    renderMapLayers();
    renderChart();
    renderEventsTable();
    renderCities();
    renderNews();

    if (isRefresh && state.map) {
      state.map.invalidateSize();
    }
  } catch (err) {
    console.error('Error loading data:', err);
    if (statusEl) statusEl.textContent = 'Error de conexión con API';
  }
}
