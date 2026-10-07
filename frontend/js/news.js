/**
 * SismoCol · News & Sources Module
 * Renders journalism bulletins and source links
 */

import { state, $, fmt } from './state.js';

export function renderNews() {
  const container = $('#news-container');
  if (!container) return;

  if (!state.news || state.news.length === 0) {
    container.innerHTML = `<p style="color:#64748b; padding:16px;">No hay artículos periodísticos registrados en la base de datos.</p>`;
    return;
  }

  container.innerHTML = state.news
    .map(article => {
      const snippet = article.relevant_text
        ? article.relevant_text.slice(0, 230) + '...'
        : 'Boletín de monitoreo con cifras de afectación en infraestructura y víctimas.';

      return `
      <article class="news-card">
        <div>
          <span class="news-source-tag">${fmt(article.source)}</span>
          <h4 class="news-title">${fmt(article.title)}</h4>
          <p class="news-preview">${snippet}</p>
        </div>
        <div class="news-footer">
          <span>Publicado: <strong>${fmt(article.published_at)}</strong></span>
          <a href="${article.url}" target="_blank" rel="noopener noreferrer" class="news-link-btn">
            Leer fuente
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
          </a>
        </div>
      </article>
    `;
    })
    .join('');
}
