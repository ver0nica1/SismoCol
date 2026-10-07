/**
 * SismoCol · State Management & Utilities
 * Centralized application state and shared formatting helpers
 */

export const $ = selector => document.querySelector(selector);
export const $$ = selector => document.querySelectorAll(selector);

export const fmt = val => (val === null || val === undefined || val === '' ? '—' : val);
export const numFmt = n => (typeof n === 'number' ? n.toLocaleString('es-CO') : fmt(n));
export function formatDepth(value) {
  if (value === null || value === undefined || value === '') return '—';
  const depth = Number(value);
  return Number.isFinite(depth) && depth >= 0 && depth <= 700 ? `${depth} km` : 'Dato por revisar';
}

export function getMagnitudeColor(mag) {
  if (mag >= 6.0) return '#dc2626'; // Deep Red
  if (mag >= 4.5) return '#ea580c'; // Warm Orange
  if (mag >= 3.0) return '#d97706'; // Warm Amber
  return '#059669'; // Forest / Sage Green
}

export function getMagnitudeClass(mag) {
  if (mag >= 6.0) return 'mag-destructive';
  if (mag >= 4.5) return 'mag-strong';
  if (mag >= 3.0) return 'mag-moderate';
  return 'mag-minor';
}

export const state = {
  currentMode: 'terremoto_2026', // 'terremoto_2026' | 'sismos'
  summary: null,
  events: [],
  earthquakeEvents: [],
  generalEvents: [],
  filteredEvents: [],
  cities: [],
  cityTimeline: [],
  news: [],
  activeChartField: 'deceased',
  currentPage: 1,
  pageSize: 12,
  map: null,
  tileLayers: {},
  markersLayer: null,
  citiesLayer: null,
  epicenterMarker: null,
  chartInstance: null
};

/**
 * Returns the array of events corresponding to the active mode.
 * @returns {Array}
 */
export function getActiveEvents() {
  return state.currentMode === 'terremoto_2026' ? state.earthquakeEvents : state.generalEvents;
}
