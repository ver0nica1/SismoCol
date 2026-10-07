/**
 * SismoCol · Main Application Orchestrator
 * Coordinates tabs, mode switcher (Terremoto 2026 vs Sismos), and component lifecycle
 */

import { state, $, $$, getActiveEvents } from './state.js';
import { initMap, renderMapLayers } from './map.js';
import { initChart, renderChart } from './chart.js';
import { initCatalog, applyEventFilters, updateCatalogTypeOptions } from './catalog.js';
import { renderMetrics } from './metrics.js';
import { loadAllData } from './api.js';

/**
 * Switches the active tab panel
 * @param {string} tabId
 */
export function switchTab(tabId) {
  $$('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
  $$('.tab-content-panel').forEach(p => p.classList.toggle('active', p.id === tabId));

  if (tabId === 'tab-overview') {
    setTimeout(() => {
      if (state.map) state.map.invalidateSize();
    }, 100);
  }
}

/**
 * Sets the active application mode ('terremoto_2026' | 'sismos')
 * Adjusts visible tabs, map layers, metrics, and catalog data
 * @param {string} mode
 */
export function setMode(mode) {
  if (state.currentMode === mode) {
    closeModeDropdown();
    return;
  }

  state.currentMode = mode;

  // 1. Update dropdown button & options active state
  const labelEl = $('#current-mode-label');
  if (labelEl) {
    labelEl.textContent = mode === 'sismos' ? 'Sismos' : 'Terremoto 2026';
  }

  $$('.mode-option').forEach(opt => {
    opt.classList.toggle('active', opt.dataset.mode === mode);
  });

  closeModeDropdown();

  // 2. Adjust navigation tabs visibility
  const isSismos = mode === 'sismos';
  $$('.nav-tab[data-mode-only="terremoto_2026"]').forEach(tab => {
    tab.classList.toggle('tab-hidden', isSismos);
  });

  // If user is currently on a hidden tab (Impacto Municipal or Noticias), switch to Visión General
  const activeTab = $('.nav-tab.active');
  if (activeTab && activeTab.classList.contains('tab-hidden')) {
    switchTab('tab-overview');
  }

  // 3. Toggle evolution casualty chart (only applies to 2026 disaster)
  const chartPanel = $('#panel-evolution-chart');
  if (chartPanel) {
    chartPanel.classList.toggle('hidden', isSismos);
  }

  // 4. Update events badge to reflect count of current mode
  const evBadge = $('#badge-events-count');
  if (evBadge) {
    evBadge.textContent = getActiveEvents().length.toLocaleString('es-CO');
  }

  // 5. Update catalog filter options & filter active list
  updateCatalogTypeOptions();
  applyEventFilters();

  // 6. Re-render metrics & map layers
  renderMetrics();
  renderMapLayers();

  // 7. Re-center map appropriately
  if (state.map) {
    if (isSismos) {
      state.map.flyTo([5.8, -74.0], 6.5, { duration: 1.2 });
    } else {
      state.map.flyTo([4.85, -75.5], 7, { duration: 1.2 });
    }
  }
}

function closeModeDropdown() {
  const menu = $('#mode-dropdown-menu');
  const btn = $('#btn-mode-selector');
  if (menu) menu.classList.remove('open');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

function toggleModeDropdown() {
  const menu = $('#mode-dropdown-menu');
  const btn = $('#btn-mode-selector');
  if (!menu || !btn) return;

  const isOpen = menu.classList.contains('open');
  if (isOpen) {
    closeModeDropdown();
  } else {
    menu.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
  }
}

function setupModeSelector() {
  const btn = $('#btn-mode-selector');
  const menu = $('#mode-dropdown-menu');

  if (btn) {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      toggleModeDropdown();
    });
  }

  // Option selection
  $$('.mode-option').forEach(opt => {
    opt.addEventListener('click', e => {
      e.stopPropagation();
      const selectedMode = opt.dataset.mode;
      if (selectedMode) {
        setMode(selectedMode);
      }
    });
  });

  // Close when clicking outside
  document.addEventListener('click', e => {
    if (menu && menu.classList.contains('open')) {
      if (!menu.contains(e.target) && !btn.contains(e.target)) {
        closeModeDropdown();
      }
    }
  });

  // Close with Escape key
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && menu && menu.classList.contains('open')) {
      closeModeDropdown();
    }
  });
}

function setupTabs() {
  $$('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      switchTab(tab.dataset.tab);
    });
  });

  // Custom event listener for programmatic tab switching (e.g. from table or cards)
  window.addEventListener('switch-tab', e => {
    if (e.detail) switchTab(e.detail);
  });
}

function setupThemeToggle() {
  const btn = $('#btn-theme-toggle');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', nextTheme);
    try {
      localStorage.setItem('sismocol-theme', nextTheme);
    } catch (e) {}

    // Re-render chart so Chart.js canvas immediately gets dark mode styling without gridlines!
    renderChart();

    // Invalidate map size so Leaflet refreshes smoothly
    if (state.map) {
      setTimeout(() => state.map.invalidateSize(), 50);
    }
  });
}

function init() {
  initMap();
  initChart();
  initCatalog();
  setupTabs();
  setupModeSelector();
  setupThemeToggle();
  loadAllData();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
