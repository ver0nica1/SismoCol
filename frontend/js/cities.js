/**
 * SismoCol · Municipal Impact Module
 * Renders casualty and damage cards for affected cities
 */

import { state, $, numFmt } from './state.js';
import { focusLocation } from './map.js';

export function renderCities() {
  const container = $('#cities-container');
  if (!container) return;

  if (!state.cities || state.cities.length === 0) {
    container.innerHTML = `<p style="color:#64748b; padding:16px;">No hay registros de municipios afectados aún.</p>`;
    return;
  }

  container.innerHTML = state.cities
    .map(
      c => `
    <div class="city-card" data-lat="${c.latitude || ''}" data-lng="${c.longitude || ''}">
      <div class="city-card-header">
        <div>
          <div class="city-card-name">${c.name}</div>
          <div class="city-card-dept">${c.department}</div>
        </div>
        ${
          c.latitude && c.longitude
            ? `<button class="btn-secondary btn-city-map" data-lat="${c.latitude}" data-lng="${c.longitude}" style="padding:4px 8px; font-size:11px;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon></svg>
                Mapa
              </button>`
            : ''
        }
      </div>

      <div class="city-stats-list">
        <div class="city-stat-box">
          <div class="city-stat-label">Fallecidos</div>
          <div class="city-stat-num" style="color:#b91c1c">${numFmt(c.deceased)}</div>
        </div>
        <div class="city-stat-box">
          <div class="city-stat-label">Heridos</div>
          <div class="city-stat-num" style="color:#ea580c">${numFmt(c.injured)}</div>
        </div>
        <div class="city-stat-box">
          <div class="city-stat-label">Desaparecidos</div>
          <div class="city-stat-num" style="color:#b45309">${numFmt(c.missing)}</div>
        </div>
        <div class="city-stat-box">
          <div class="city-stat-label">Viviendas</div>
          <div class="city-stat-num" style="color:#7c3aed">${numFmt(c.homes_affected)}</div>
        </div>
      </div>
    </div>
  `
    )
    .join('');

  container.querySelectorAll('.btn-city-map').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const lat = parseFloat(btn.dataset.lat);
      const lng = parseFloat(btn.dataset.lng);
      if (!isNaN(lat) && !isNaN(lng)) {
        focusLocation(lat, lng, 11);
      }
    });
  });

  container.querySelectorAll('.city-card').forEach(card => {
    card.addEventListener('click', () => {
      const lat = parseFloat(card.dataset.lat);
      const lng = parseFloat(card.dataset.lng);
      if (!isNaN(lat) && !isNaN(lng)) {
        focusLocation(lat, lng, 11);
      }
    });
  });
}
