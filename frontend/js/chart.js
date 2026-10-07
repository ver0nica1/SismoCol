/**
 * SismoCol · Chart Module (Chart.js)
 * Visualizes chronological evolution of:
 * - casualties by municipality (deceased / injured / missing tabs)
 * - probable aftershocks per day (replicas tab)
 */

import { state, $, $$ } from './state.js';

const CASUALTY_TEXT = {
  title: 'Evolución de Víctimas por Fecha',
  caption: '* Consolidado cronológico trazable por municipio según boletines de autoridades y reportes oficiales.'
};
const REPLICA_TEXT = {
  title: 'Candidatos a réplica por día',
  caption: '* Barras: eventos que pasan un filtro espacial-temporal; no confirma una relación causal. ' +
    'Línea: magnitud máxima del día (el catálogo disponible no informa su escala). Días en hora Colombia (UTC−5). ' +
    'Un 0 indica que hay registros ese día, pero ninguno pasó el filtro; un hueco indica que no hay registros disponibles.'
};
const COT_OFFSET_MS = 5 * 60 * 60 * 1000;

export function initChart() {
  $$('#chart-field-tabs .chart-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('#chart-field-tabs .chart-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.activeChartField = btn.dataset.field;
      renderChart();
    });
  });
}

function setChartText({ title, caption }) {
  const titleEl = $('#evolution-chart-title');
  const captionEl = $('#evolution-chart-caption');
  if (titleEl) titleEl.textContent = title;
  if (captionEl) captionEl.textContent = caption;
}

export function renderChart() {
  const ctx = document.getElementById('evolution-chart');
  if (!ctx) return;

  if (state.chartInstance) {
    state.chartInstance.destroy();
    state.chartInstance = null;
  }

  if (state.activeChartField === 'replicas') {
    setChartText(REPLICA_TEXT);
    renderReplicasChart(ctx);
    return;
  }

  setChartText(CASUALTY_TEXT);
  renderCasualtiesChart(ctx);
}

/**
 * Converts a catalog timestamp (UTC, 'YYYY-MM-DD HH:MM:SS') into a Colombia-time day key.
 */
function toColombiaDay(occurredAt) {
  if (!occurredAt) return null;
  const utc = Date.parse(`${occurredAt.trim().replace(' ', 'T')}Z`);
  if (Number.isNaN(utc)) return null;
  return new Date(utc - COT_OFFSET_MS).toISOString().slice(0, 10);
}

function formatDayLabel(dayKey) {
  const d = new Date(`${dayKey}T00:00:00Z`);
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', timeZone: 'UTC' });
}

/**
 * Builds a daily series from the mainshock to the latest catalog record.
 * A day is zero only when catalog records exist but none passed the candidate filter;
 * days without catalog records remain null gaps.
 */
export function buildDailyReplicaSeries(events, catalogEvents = events) {
  const byDay = new Map();
  const catalogByDay = new Map();
  for (const ev of catalogEvents || []) {
    const day = toColombiaDay(ev.occurred_at);
    if (!day) continue;
    catalogByDay.set(day, (catalogByDay.get(day) || 0) + 1);
  }

  for (const ev of events) {
    if (ev.association_status !== 'CANDIDATE_AFTERSHOCK') continue;
    const day = toColombiaDay(ev.occurred_at);
    if (!day) continue;
    const entry = byDay.get(day) || { count: 0, maxMag: null };
    entry.count += 1;
    const mag = Number(ev.magnitude);
    if (!Number.isNaN(mag) && (entry.maxMag === null || mag > entry.maxMag)) entry.maxMag = mag;
    byDay.set(day, entry);
  }

  const main = events.find(ev => ev.association_status === 'MAINSHOCK');
  const keys = [...new Set([...byDay.keys(), ...catalogByDay.keys()])].sort();
  if (keys.length === 0) return [];
  const first = toColombiaDay(main?.occurred_at) || keys[0];
  const last = keys[keys.length - 1];

  const series = [];
  for (let t = Date.parse(`${first}T00:00:00Z`); t <= Date.parse(`${last}T00:00:00Z`); t += 86400000) {
    const day = new Date(t).toISOString().slice(0, 10);
    const entry = byDay.get(day);
    const catalogCount = catalogByDay.get(day) ?? null;
    series.push({
      day,
      count: entry ? entry.count : catalogCount === null ? null : 0,
      maxMag: entry ? entry.maxMag : null,
      catalogCount
    });
  }
  return series;
}

function getChartTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  return {
    isDark,
    textColor: isDark ? '#e1e3e8' : '#101014',
    textMuted: isDark ? '#8a8f9d' : '#6b6f7b',
    textFaint: isDark ? '#525866' : '#9ea2ae',
    tooltipBg: isDark ? '#15161a' : '#ffffff',
    tooltipTitle: isDark ? '#ffffff' : '#101014',
    tooltipBody: isDark ? '#e1e3e8' : '#101014',
    tooltipBorder: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(16, 16, 20, 0.12)',
    pointBorder: isDark ? '#0d0e10' : '#ffffff'
  };
}

function renderReplicasChart(ctx) {
  const series = buildDailyReplicaSeries(state.earthquakeEvents || [], state.events || []);
  if (series.length === 0) return;

  const theme = getChartTheme();

  state.chartInstance = new Chart(ctx, {
    data: {
      labels: series.map(s => formatDayLabel(s.day)),
      datasets: [
        {
          type: 'bar',
          label: 'Candidatos a réplica por día',
          data: series.map(s => s.count),
          backgroundColor: theme.isDark ? 'rgba(59, 130, 246, 0.65)' : 'rgba(45, 129, 255, 0.75)',
          hoverBackgroundColor: '#3b82f6',
          borderRadius: 2,
          maxBarThickness: 22,
          yAxisID: 'y',
          order: 2
        },
        {
          type: 'line',
          label: 'Magnitud máxima',
          data: series.map(s => s.maxMag),
          borderColor: '#ef4444',
          backgroundColor: '#ef4444',
          pointBackgroundColor: '#ef4444',
          pointBorderColor: theme.pointBorder,
          pointBorderWidth: 1.5,
          pointRadius: 3,
          pointHoverRadius: 6,
          borderWidth: 2,
          tension: 0.25,
          spanGaps: false,
          yAxisID: 'yMag',
          order: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            color: theme.textColor,
            font: { family: 'Geist Mono, monospace', size: 11 },
            boxWidth: 8,
            usePointStyle: true,
            pointStyle: 'circle'
          }
        },
        tooltip: {
          backgroundColor: theme.tooltipBg,
          titleColor: theme.tooltipTitle,
          bodyColor: theme.tooltipBody,
          borderColor: theme.tooltipBorder,
          borderWidth: 1,
          padding: 10,
          cornerRadius: 2,
          boxShadow: theme.isDark ? '0 8px 24px rgba(0,0,0,0.6)' : '0 4px 12px rgba(0,0,0,0.08)',
          titleFont: { family: 'Archivo, sans-serif', weight: 'bold', size: 12 },
          bodyFont: { family: 'Geist Mono, monospace', size: 11 },
          callbacks: {
            title: items => (items.length ? series[items[0].dataIndex].day : ''),
            label: item => {
              const s = series[item.dataIndex];
              if (s.count === null) return item.datasetIndex === 0 ? 'Sin registros disponibles del catálogo' : null;
              return item.datasetIndex === 0
                ? s.count === 0
                  ? `Candidatos: 0 (${s.catalogCount} registros en catálogo)`
                  : `Candidatos: ${s.count.toLocaleString('es-CO')}`
                : s.maxMag === null ? 'Sin candidato para calcular magnitud máxima' : `Magnitud máx.: ${s.maxMag}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false, drawBorder: false },
          ticks: {
            color: theme.textMuted,
            font: { family: 'Geist Mono, monospace', size: 10 },
            autoSkip: true,
            maxRotation: 45,
            minRotation: 0
          }
        },
        y: {
          beginAtZero: true,
          position: 'left',
          title: { display: true, text: 'Candidatos', color: theme.isDark ? '#60a5fa' : '#2d81ff', font: { family: 'Archivo, sans-serif', size: 11, weight: 'bold' } },
          grid: { display: false, drawBorder: false },
          ticks: { color: theme.textMuted, precision: 0, font: { family: 'Geist Mono, monospace', size: 10 } }
        },
        yMag: {
          position: 'right',
          suggestedMin: 2,
          suggestedMax: 6,
          title: { display: true, text: 'Magnitud máx.', color: '#ef4444', font: { family: 'Archivo, sans-serif', size: 11, weight: 'bold' } },
          grid: { display: false, drawBorder: false },
          ticks: { color: theme.textMuted, font: { family: 'Geist Mono, monospace', size: 10 } }
        }
      }
    }
  });
}

function renderCasualtiesChart(ctx) {
  const rows = state.cityTimeline;
  if (!rows || rows.length === 0) return;

  const dates = [...new Set(rows.map(x => x.balance_date))].sort();
  const cities = [...new Set(rows.map(x => x.city))];

  const theme = getChartTheme();

  const colors = [
    '#3b82f6', // Vivid Blue
    '#ef4444', // Crimson Red
    '#10b981', // Emerald Green
    '#f59e0b', // Warm Amber
    '#a855f7', // Violet
    '#06b6d4'  // Cyan
  ];

  const datasets = cities.map((city, idx) => {
    const color = colors[idx % colors.length];
    const data = dates.map(d => {
      const item = rows.find(r => r.city === city && r.balance_date === d);
      return item && item[state.activeChartField] !== null && item[state.activeChartField] !== undefined
        ? item[state.activeChartField]
        : null;
    });

    return {
      label: city,
      data: data,
      borderColor: color,
      backgroundColor: color,
      pointBackgroundColor: color,
      pointBorderColor: theme.pointBorder,
      pointBorderWidth: 2,
      pointRadius: 4,
      pointHoverRadius: 7,
      tension: 0.3,
      spanGaps: true
    };
  });

  state.chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dates,
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            color: theme.textColor,
            font: { family: 'Geist Mono, monospace', size: 11 },
            boxWidth: 8,
            usePointStyle: true,
            pointStyle: 'circle'
          }
        },
        tooltip: {
          backgroundColor: theme.tooltipBg,
          titleColor: theme.tooltipTitle,
          bodyColor: theme.tooltipBody,
          borderColor: theme.tooltipBorder,
          borderWidth: 1,
          padding: 10,
          cornerRadius: 2,
          boxShadow: theme.isDark ? '0 8px 24px rgba(0,0,0,0.6)' : '0 4px 12px rgba(0,0,0,0.08)',
          titleFont: { family: 'Archivo, sans-serif', weight: 'bold', size: 12 },
          bodyFont: { family: 'Geist Mono, monospace', size: 11 }
        }
      },
      scales: {
        x: {
          grid: { display: false, drawBorder: false },
          ticks: {
            color: theme.textMuted,
            font: { family: 'Geist Mono, monospace', size: 10 }
          }
        },
        y: {
          beginAtZero: true,
          grid: { display: false, drawBorder: false },
          ticks: {
            color: theme.textMuted,
            font: { family: 'Geist Mono, monospace', size: 10 }
          }
        }
      }
    }
  });
}
