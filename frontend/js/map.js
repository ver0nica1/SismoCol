/**
 * SismoCol · Map Module (Leaflet + OpenStreetMap)
 * Handles cartographic rendering, epicenter pulse, and marker layers
 * Supports segregated layers for 'terremoto_2026' and 'sismos' modes.
 */

import { state, $, fmt, formatDepth, numFmt, getMagnitudeColor } from './state.js';
import { associationLabel, getGeneralSeismicStats } from './eventsClassifier.js';

export function initMap() {
  if (state.map) return;

  // Center of Colombia / Epicenter region
  state.map = L.map('map', {
    zoomControl: false,
    attributionControl: false
  }).setView([4.99, -76.29], 7);

  // Zoom control at top-left
  L.control.zoom({ position: 'topleft' }).addTo(state.map);

  // Base Tile Layer: Calles (OpenStreetMap - 100% free, NO API keys)
  state.tileLayers.osm = L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors'
    }
  ).addTo(state.map);

  // Layer groups for dynamic toggles
  state.markersLayer = L.layerGroup().addTo(state.map);
  state.citiesLayer = L.layerGroup().addTo(state.map);

  // Reset View Button
  $('#btn-reset-map')?.addEventListener('click', () => {
    if (state.currentMode === 'sismos') {
      state.map.flyTo([5.8, -74.0], 6.5, { duration: 1.2 });
    } else {
      state.map.flyTo([4.85, -75.5], 7, { duration: 1.2 });
    }
  });

  // Focus Epicenter / Focus Seismicity Button
  $('#btn-focus-epicenter')?.addEventListener('click', () => {
    if (state.currentMode === 'sismos') {
      const activeArea = getGeneralSeismicStats(state.generalEvents).activeAreaCoordinates;
      if (activeArea) {
        focusLocation(activeArea.latitude, activeArea.longitude, 8, 'Zona más activa en los últimos 7 días');
      } else {
        state.map.flyTo([6.0, -73.5], 7, { duration: 1.2 });
      }
    } else {
      // In earthquake mode, focus on main epicenter
      const eq = state.summary?.earthquake;
      if (eq && eq.latitude && eq.longitude) {
        focusLocation(eq.latitude, eq.longitude, 10, 'Epicentro Principal');
      }
    }
  });
}

function associationDetails(ev) {
  if (ev.association_distance_km === null || ev.association_distance_km === undefined) return '';
  const depthNote = ev.depth_difference_km === null || ev.depth_difference_km === undefined
    ? 'sin comparación de profundidad'
    : `diferencia de profundidad ${ev.depth_difference_km} km (informativa; no usada por el filtro)`;
  return `<div class="popup-row"><span>Filtro espacial-temporal:</span><span>${ev.association_distance_km} km; ${ev.association_time_days} días desde el principal; ${depthNote}.</span></div>`;
}

export function renderMapLayers() {
  if (!state.map) return;

  state.markersLayer.clearLayers();
  state.citiesLayer.clearLayers();

  if (state.epicenterMarker) {
    state.map.removeLayer(state.epicenterMarker);
    state.epicenterMarker = null;
  }

  if (state.currentMode === 'sismos') {
    renderGeneralSeismicMapLayers();
  } else {
    renderEarthquakeMapLayers();
  }

  renderMapLegend();
}

/**
 * Renders Map Layers for 'terremoto_2026' mode:
 * Mainshock, candidate associations, and impacted cities.
 */
function renderEarthquakeMapLayers() {
  const eq = state.summary?.earthquake;

  // 1. Epicenter Animated Pulse Marker
  if (eq && eq.latitude && eq.longitude) {
    const pulseHtml = `
      <div style="position:relative; width:34px; height:34px;">
        <div class="radar-ring" style="position:absolute; width:34px; height:34px; left:0; top:0;"></div>
        <div style="position:absolute; width:16px; height:16px; left:9px; top:9px; background:#dc2626; border:2px solid #ffffff; border-radius:50%; box-shadow:0 0 8px rgba(220,38,38,0.5);"></div>
      </div>
    `;

    const pulseIcon = L.divIcon({
      html: pulseHtml,
      className: 'custom-radar-icon',
      iconSize: [34, 34],
      iconAnchor: [17, 17]
    });

    state.epicenterMarker = L.marker([eq.latitude, eq.longitude], { icon: pulseIcon })
      .addTo(state.map)
      .bindPopup(`
        <div class="popup-card">
          <div class="popup-title">Terremoto Principal · Epicentro</div>
          <div class="popup-row"><span>Magnitud:</span><strong style="color:#b91c1c">${eq.magnitude} Mw</strong></div>
          <div class="popup-row"><span>Profundidad:</span><span>${formatDepth(eq.depth_km)}</span></div>
          <div class="popup-row"><span>Municipio:</span><span>${fmt(eq.municipality)}, ${fmt(eq.department)}</span></div>
          <div class="popup-row"><span>Fecha/Hora:</span><span>${fmt(eq.event_date)} ${fmt(eq.event_time)}</span></div>
          <div class="popup-row"><span>Coordenadas:</span><span>${eq.latitude}, ${eq.longitude}</span></div>
        </div>
      `);
  }

  // 2. Replicas and Epicenter-zone Swarm Markers
  const relevantEvents = state.earthquakeEvents.filter(e => e.latitude && e.longitude);
  relevantEvents.forEach(ev => {
    if (ev.association_status === 'MAINSHOCK') return;

    const mag = ev.magnitude || 2.0;
    const radius = Math.max(3.5, Math.min(18, Math.pow(mag, 1.3) * 1.6));
    const color = getMagnitudeColor(mag);

    const marker = L.circleMarker([ev.latitude, ev.longitude], {
      radius: radius,
      fillColor: color,
      color: '#ffffff',
      weight: 1,
      opacity: 0.95,
      fillOpacity: 0.8
    }).bindPopup(`
      <div class="popup-card">
        <div class="popup-title" style="color:${color}">${associationLabel(ev)}</div>
        <div class="popup-row"><span>Magnitud:</span><strong style="color:${color}">${fmt(ev.magnitude)}</strong></div>
        <div class="popup-row"><span>Profundidad:</span><span>${formatDepth(ev.depth_km)}</span></div>
        <div class="popup-row"><span>Municipio:</span><span>${fmt(ev.municipality)}, ${fmt(ev.department)}</span></div>
        <div class="popup-row"><span>Fecha:</span><span>${fmt(ev.occurred_at)}</span></div>
        ${associationDetails(ev)}
        <div class="popup-row"><span>Fuente:</span><span>${fmt(ev.source)}</span></div>
      </div>
    `);

    state.markersLayer.addLayer(marker);
  });

  // 3. Impacted Cities Markers
  state.cities.forEach(city => {
    if (!city.latitude || !city.longitude) return;

    const cityIcon = L.divIcon({
      html: `
        <div style="background:#1d4ed8; border:2px solid #ffffff; width:14px; height:14px; border-radius:3px; transform:rotate(45deg); box-shadow:0 0 6px rgba(29,78,216,0.6);"></div>
      `,
      className: 'city-pin-icon',
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    });

    const cityMarker = L.marker([city.latitude, city.longitude], { icon: cityIcon })
      .bindPopup(`
        <div class="popup-card">
          <div class="popup-title" style="color:#1d4ed8">${city.name} (${city.department})</div>
          <div class="popup-row"><span>Fallecidos:</span><span style="color:#b91c1c">${numFmt(city.deceased)}</span></div>
          <div class="popup-row"><span>Heridos:</span><span style="color:#c2410c">${numFmt(city.injured)}</span></div>
          <div class="popup-row"><span>Desaparecidos:</span><span style="color:#b45309">${numFmt(city.missing)}</span></div>
          <div class="popup-row"><span>Viviendas afect.:</span><span>${numFmt(city.homes_affected)}</span></div>
        </div>
      `);

    state.citiesLayer.addLayer(cityMarker);
  });
}

/**
 * Renders Map Layers for 'sismos' mode:
 * Only general seismicity events across Colombia (no epicenter pulse, no disaster city pins).
 */
function renderGeneralSeismicMapLayers() {
  const validEvents = state.generalEvents.filter(e => e.latitude && e.longitude);

  validEvents.forEach(ev => {
    const mag = ev.magnitude || 2.0;
    const radius = Math.max(3.5, Math.min(18, Math.pow(mag, 1.3) * 1.6));
    const color = getMagnitudeColor(mag);

    const marker = L.circleMarker([ev.latitude, ev.longitude], {
      radius: radius,
      fillColor: color,
      color: '#ffffff',
      weight: 1,
      opacity: 0.95,
      fillOpacity: 0.82
    }).bindPopup(`
      <div class="popup-card">
        <div class="popup-title" style="color:${color}">Sismicidad Nacional</div>
        <div class="popup-row"><span>Magnitud del catálogo:</span><strong style="color:${color}">${fmt(ev.magnitude)}</strong></div>
        <div class="popup-row"><span>Profundidad:</span><span>${formatDepth(ev.depth_km)}</span></div>
        <div class="popup-row"><span>Municipio:</span><span>${fmt(ev.municipality)}, ${fmt(ev.department)}</span></div>
        <div class="popup-row"><span>Fecha:</span><span>${fmt(ev.occurred_at)}</span></div>
        <div class="popup-row"><span>Asociación:</span><span>${associationLabel(ev)}</span></div>
        <div class="popup-row"><span>Fuente:</span><span>${fmt(ev.source)}</span></div>
      </div>
    `);

    state.markersLayer.addLayer(marker);
  });
}

/**
 * Renders dynamic legend according to current mode
 */
function renderMapLegend() {
  const container = $('#map-legend-items');
  if (!container) return;

  if (state.currentMode === 'sismos') {
    container.innerHTML = `
      <span class="legend-item"><span class="legend-dot mag-high"></span> ≥ 5.0 Fuerte / Mayor</span>
      <span class="legend-item"><span class="legend-dot mag-med"></span> 3.5 - 4.9 Moderado</span>
      <span class="legend-item"><span class="legend-dot mag-low"></span> &lt; 3.5 Leve / Micro</span>
      <span class="legend-item" style="color:#0284c7; font-weight:600;"><span class="legend-dot" style="background:#0284c7"></span> Red Sismológica SGC</span>
    `;
  } else {
    container.innerHTML = `
      <span class="legend-item"><span class="legend-dot epicenter"></span> Epicentro (7.4 Mw)</span>
      <span class="legend-item"><span class="legend-dot mag-high"></span> ≥ 5.0 Fuerte</span>
      <span class="legend-item"><span class="legend-dot mag-med"></span> 3.5 - 4.9 Moderado</span>
      <span class="legend-item"><span class="legend-dot mag-low"></span> &lt; 3.5 Leve</span>
      <span class="legend-item"><span class="legend-dot city"></span> Ciudades Afectadas</span>
    `;
  }
}

export function focusLocation(lat, lng, zoom = 10, popupText = null) {
  if (!state.map) return;

  // Dispatch custom tab switch event if tab not active
  window.dispatchEvent(new CustomEvent('switch-tab', { detail: 'tab-overview' }));

  setTimeout(() => {
    state.map.invalidateSize();
    state.map.flyTo([lat, lng], zoom, {
      duration: 1.2,
      easeLinearity: 0.25
    });
    if (popupText && state.epicenterMarker && lat === state.summary?.earthquake?.latitude) {
      setTimeout(() => state.epicenterMarker.openPopup(), 1300);
    }
  }, 150);
}
