/**
 * Presentation helpers for catalog events and their estimated sequence association.
 * The browser does not infer aftershocks or swarms; it displays backend status.
 */

export const ASSOCIATION_LABELS = {
  MAINSHOCK: 'Sismo principal',
  CANDIDATE_AFTERSHOCK: 'Réplica',
  SWARM: 'Enjambre sísmico (estimado)',
  POSSIBLE_SWARM: 'Posible enjambre (detección automática)',
  UNASSOCIATED: 'Otro evento sísmico',
  INSUFFICIENT_DATA: 'No evaluable: faltan datos'
};

export function eventKindLabel(ev) {
  return ev?.event_type === 'SISMO' ? 'Sismo' : (ev?.event_type || 'Sismo');
}

export function associationLabel(ev) {
  if (ev?.association_status === 'SWARM') {
    if (ev.classification_method === 'chaparral-sequence-screen-v1') return 'Enjambre sísmico';
    if (ev.classification_method === 'sgc-choco-swarm-screen-v1') return 'Enjambre sísmico · grupo SGC';
  }
  return ASSOCIATION_LABELS[ev?.association_status] || 'Estado de asociación no informado';
}

export function isEarthquakeRelated(ev) {
  return Boolean(ev) && ev.earthquake_id !== null && ev.earthquake_id !== undefined;
}

export function classifyEvents(events = []) {
  const earthquakeEvents = [];
  const generalEvents = [];
  for (const ev of events) {
    (isEarthquakeRelated(ev) ? earthquakeEvents : generalEvents).push(ev);
  }
  return { earthquakeEvents, generalEvents };
}

export function getGeneralSeismicStats(generalEvents = []) {
  const activityWindowDays = 7;
  if (!generalEvents.length) {
    return { total: 0, maxMagnitude: '—', maxEvent: null, latestEvent: null,
      shallowCount: 0, intermediateCount: 0, deepCount: 0, nonShallowCount: 0, activeArea: 'Sin actividad reciente',
      activeAreaCount: 0, activeAreaCoordinates: null, activityWindowDays, avgDepth: '—' };
  }

  let maxMagnitude = -Infinity;
  let maxEvent = null;
  let shallowCount = 0;
  let intermediateCount = 0;
  let deepCount = 0;
  let depthSum = 0;
  let depthValidCount = 0;
  const datedEvents = [];

  for (const ev of generalEvents) {
    const magnitude = Number(ev.magnitude);
    if (Number.isFinite(magnitude) && magnitude > maxMagnitude) {
      maxMagnitude = magnitude;
      maxEvent = ev;
    }

    const depth = Number(ev.depth_km);
    if (Number.isFinite(depth) && ev.depth_km !== null && depth >= 0 && depth <= 700) {
      depthSum += depth;
      depthValidCount++;
      if (depth < 70) shallowCount++;
      else if (depth <= 300) intermediateCount++;
      else deepCount++;
    }

    const rawDate = String(ev.occurred_at || '').trim().replace(' ', 'T');
    const timestamp = Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(rawDate) ? rawDate : `${rawDate}Z`);
    if (Number.isFinite(timestamp)) datedEvents.push({ ev, timestamp });
  }

  const latestItem = datedEvents.reduce((latest, item) => !latest || item.timestamp > latest.timestamp ? item : latest, null);
  const windowMs = activityWindowDays * 24 * 60 * 60 * 1000;
  const recentGroups = new Map();
  if (latestItem) {
    for (const item of datedEvents) {
      if (item.timestamp < latestItem.timestamp - windowMs) continue;
      const ev = item.ev;
      const key = `${ev.municipality || 'Ubicación no informada'}, ${ev.department || ''}`.trim();
      const group = recentGroups.get(key) || { count: 0, latSum: 0, lonSum: 0, coordCount: 0, latest: -Infinity };
      group.count++;
      group.latest = Math.max(group.latest, item.timestamp);
      const lat = Number(ev.latitude), lon = Number(ev.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
        group.latSum += lat;
        group.lonSum += lon;
        group.coordCount++;
      }
      recentGroups.set(key, group);
    }
  }
  const mostActive = [...recentGroups.entries()].sort((a, b) =>
    b[1].count - a[1].count || b[1].latest - a[1].latest || a[0].localeCompare(b[0], 'es')
  )[0];
  const activeGroup = mostActive?.[1];
  return {
    total: generalEvents.length,
    maxMagnitude: Number.isFinite(maxMagnitude) ? maxMagnitude : '—',
    maxEvent,
    latestEvent: latestItem?.ev || null,
    shallowCount,
    intermediateCount,
    deepCount,
    nonShallowCount: intermediateCount + deepCount,
    activeArea: mostActive ? `${mostActive[0]} (${activeGroup.count} sismos)` : 'Sin actividad reciente',
    activeAreaCount: activeGroup?.count || 0,
    activeAreaCoordinates: activeGroup?.coordCount ? {
      latitude: activeGroup.latSum / activeGroup.coordCount,
      longitude: activeGroup.lonSum / activeGroup.coordCount
    } : null,
    activityWindowDays,
    avgDepth: depthValidCount ? Math.round(depthSum / depthValidCount) : '—'
  };
}
