/**
 * SismoCol · Metrics Module
 * Renders Hero card info and key indicator counters for both modes:
 * 1) 'terremoto_2026': mainshock context, candidate associations, and impacts
 * 2) 'sismos': National general seismicity technical metrics
 */

import { state, $, fmt, formatDepth, numFmt } from './state.js';
import { getGeneralSeismicStats } from './eventsClassifier.js';

export function renderMetrics() {
  if (state.currentMode === 'sismos') {
    renderGeneralSeismicMetrics();
  } else {
    renderEarthquakeMetrics();
  }
}

/**
 * Renders metrics for the 2026 Earthquake mode
 */
function renderEarthquakeMetrics() {
  const s = state.summary || {};
  const eq = s.earthquake || {};
  const rep = s.latest_report || {};

  // Badge updates
  const heroBadgeWrap = $('#hero-badge-wrap');
  if (heroBadgeWrap) {
    heroBadgeWrap.style.background = '#fef2f2';
    heroBadgeWrap.style.borderColor = '#fca5a5';
  }
  const heroMag = $('#hero-mag');
  if (heroMag) {
    heroMag.textContent = eq.magnitude || '7.4';
    heroMag.style.color = '#b91c1c';
  }
  const heroUnit = $('#hero-mag-unit');
  if (heroUnit) {
    heroUnit.textContent = 'Mw · Magnitud';
    heroUnit.style.color = '#991b1b';
  }

  // Hero Meta labels & values
  const lblDate = $('#hero-label-datetime');
  if (lblDate) lblDate.textContent = 'Fecha:';
  if (eq.event_date && eq.event_time) {
    $('#hero-datetime').textContent = `${eq.event_date} ${eq.event_time} COT`;
  }

  const lblLoc = $('#hero-label-location');
  if (lblLoc) lblLoc.textContent = 'Epicentro:';
  if (eq.municipality && eq.department) {
    $('#hero-location').textContent = `${eq.municipality}, ${eq.department}`;
  }

  const lblDepth = $('#hero-label-depth');
  if (lblDepth) lblDepth.textContent = 'Profundidad:';
  if (eq.depth_km !== undefined && eq.depth_km !== null) {
    const depth = Number(eq.depth_km);
    if (!Number.isFinite(depth) || depth < 0 || depth > 700) {
      $('#hero-depth').textContent = formatDepth(eq.depth_km);
    } else {
      const depthType = depth < 70 ? 'superficial' : depth <= 300 ? 'intermedia' : 'profunda';
      $('#hero-depth').textContent = `${formatDepth(depth)} (${depthType})`;
    }
  } else {
    $('#hero-depth').textContent = 'Sin dato';
  }

  const lblCoords = $('#hero-label-coords');
  if (lblCoords) lblCoords.textContent = 'Coordenadas:';
  if (eq.latitude && eq.longitude) {
    $('#hero-coords').textContent = `${eq.latitude}° N, ${eq.longitude}° W`;
  }

  const btnFocusText = $('#btn-focus-text');
  if (btnFocusText) btnFocusText.textContent = 'Ubicar Epicentro';

  // The spatial-temporal screen identifies candidates, not confirmed aftershocks.
  const candidateCount = state.earthquakeEvents.filter(e => e.association_status === 'CANDIDATE_AFTERSHOCK').length;
  const displayCandidates = candidateCount > 0 ? candidateCount : (s.candidate_aftershocks || 0);

  const countersData = [
    {
      title: 'Candidatos a réplica',
      val: numFmt(displayCandidates),
      caption: 'Filtro espacial-temporal; requiere confirmación',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="m4.93 4.93 4.24 4.24"></path><path d="m14.83 9.17 4.24-4.24"></path><path d="m14.83 14.83 4.24 4.24"></path><path d="m9.17 14.83-4.24 4.24"></path></svg>'
    },
    {
      title: 'Mayor candidato',
      val: s.max_candidate_aftershock ?? '—',
      caption: 'Magnitud según el catálogo; escala no disponible',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>'
    },
    {
      title: 'Fallecidos Oficiales',
      val: numFmt(rep.deceased || 0),
      caption: 'Consolidado nacional',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="#b91c1c" stroke-width="2"><path d="M18 20V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14"></path><path d="M2 20h20"></path><path d="M14 12v.01"></path></svg>'
    },
    {
      title: 'Personas Heridas',
      val: numFmt(rep.injured || 0),
      caption: 'Atención hospitalaria',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="#ea580c" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>'
    }
  ];

  renderCounters(countersData);
}

/**
 * Renders metrics for the General Seismicity mode
 */
function renderGeneralSeismicMetrics() {
  const stats = getGeneralSeismicStats(state.generalEvents);

  // Badge updates
  const heroBadgeWrap = $('#hero-badge-wrap');
  if (heroBadgeWrap) {
    heroBadgeWrap.style.background = '#f0f9ff';
    heroBadgeWrap.style.borderColor = '#bae6fd';
  }
  const heroMag = $('#hero-mag');
  if (heroMag) {
    heroMag.textContent = stats.maxMagnitude !== '—' ? stats.maxMagnitude : '4.8';
    heroMag.style.color = '#0284c7';
  }
  const heroUnit = $('#hero-mag-unit');
  if (heroUnit) {
    heroUnit.textContent = 'Magnitud Máx';
    heroUnit.style.color = '#0369a1';
  }

  // Hero Meta labels & values
  const lblDate = $('#hero-label-datetime');
  if (lblDate) lblDate.textContent = 'Último Registro:';
  const latestOccurred = stats.latestEvent?.occurred_at;
  $('#hero-datetime').textContent = latestOccurred ? `${latestOccurred} UTC` : 'Sin registros';

  const lblLoc = $('#hero-label-location');
  if (lblLoc) lblLoc.textContent = `Zona más activa (${stats.activityWindowDays} días):`;
  $('#hero-location').textContent = stats.activeArea;

  const lblDepth = $('#hero-label-depth');
  if (lblDepth) lblDepth.textContent = 'Profundidad Media:';
  $('#hero-depth').textContent = stats.avgDepth === '—' ? 'Sin datos válidos' : `${stats.avgDepth} km (promedio)`;

  const lblCoords = $('#hero-label-coords');
  if (lblCoords) lblCoords.textContent = 'Centro de actividad:';
  if (stats.activeAreaCoordinates) {
    $('#hero-coords').textContent = `${stats.activeAreaCoordinates.latitude.toFixed(3)}° lat., ${stats.activeAreaCoordinates.longitude.toFixed(3)}° lon.`;
  } else {
    $('#hero-coords').textContent = 'Sin coordenadas recientes';
  }

  const btnFocusText = $('#btn-focus-text');
  if (btnFocusText) btnFocusText.textContent = 'Centrar zona más activa';

  // 4 Key Counters for general seismicity:
  const countersData = [
    {
      title: 'Sismos Monitoreados',
      val: numFmt(stats.total),
      caption: 'Eventos del catálogo dentro del filtro de cobertura',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="#0284c7" stroke-width="2"><path d="M2 12h4l3-9 4 18 3-9h6"></path></svg>'
    },
    {
      title: 'Sismos superficiales',
      val: numFmt(stats.shallowCount),
      caption: 'Profundidad < 70 km',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2"><polyline points="7 13 12 18 17 13"></polyline><polyline points="7 6 12 11 17 6"></polyline></svg>'
    },
    {
      title: 'Sismos ≥ 70 km',
      val: numFmt(stats.nonShallowCount),
      caption: 'Intermedios (70–300 km) y profundos (>300 km)',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v12M8 14l4 4 4-4"></path></svg>'
    },
    {
      title: 'Magnitud Máxima',
      val: `${stats.maxMagnitude}`,
      caption: stats.maxEvent?.municipality ? `${stats.maxEvent.municipality}` : 'Registro más fuerte',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>'
    }
  ];

  renderCounters(countersData);
}

function renderCounters(countersData) {
  const container = $('#metrics-counters');
  if (!container) return;

  container.innerHTML = countersData
    .map(
      c => `
    <div class="metric-card">
      <div class="metric-card-header">
        <span class="metric-card-title">${c.title}</span>
        <div class="metric-card-icon">${c.icon}</div>
      </div>
      <div class="metric-card-value">${c.val}</div>
      <div class="metric-card-caption">${c.caption}</div>
    </div>
  `
    )
    .join('');
}
