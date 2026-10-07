CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, base_url TEXT, source_type TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS earthquakes (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, event_date TEXT, event_time TEXT, magnitude REAL,
  depth_km REAL, latitude REAL, longitude REAL, municipality TEXT, department TEXT,
  source_id INTEGER REFERENCES sources(id), updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS seismic_events (
  id INTEGER PRIMARY KEY, event_id TEXT NOT NULL UNIQUE, occurred_at TEXT, magnitude REAL,
  depth_km REAL, latitude REAL, longitude REAL, municipality TEXT, department TEXT,
  event_type TEXT NOT NULL DEFAULT 'SISMO' CHECK(event_type = 'SISMO'),
  association_status TEXT NOT NULL DEFAULT 'INSUFFICIENT_DATA'
    CHECK(association_status IN ('MAINSHOCK','CANDIDATE_AFTERSHOCK','UNASSOCIATED','INSUFFICIENT_DATA','SWARM','POSSIBLE_SWARM')),
  association_distance_km REAL, association_time_days REAL, depth_difference_km REAL,
  source_id INTEGER REFERENCES sources(id), earthquake_id INTEGER REFERENCES earthquakes(id), raw_payload TEXT,
  classification_method TEXT
);
CREATE TABLE IF NOT EXISTS news_articles (
  id INTEGER PRIMARY KEY, source_id INTEGER REFERENCES sources(id), title TEXT NOT NULL, url TEXT NOT NULL UNIQUE,
  published_at TEXT, relevant_text TEXT, extracted_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS impact_reports (
  id INTEGER PRIMARY KEY, article_id INTEGER REFERENCES news_articles(id), source_id INTEGER REFERENCES sources(id),
  balance_date TEXT, reported_at TEXT, deceased INTEGER, injured INTEGER, missing INTEGER, rescued INTEGER,
  affected INTEGER, homes_affected INTEGER, homes_destroyed INTEGER, buildings_affected INTEGER,
  hospitals_affected INTEGER, schools_affected INTEGER, roads_affected INTEGER, notes TEXT
);
CREATE TABLE IF NOT EXISTS cities (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, department TEXT, latitude REAL, longitude REAL, UNIQUE(name, department)
);
CREATE TABLE IF NOT EXISTS city_impacts (
  id INTEGER PRIMARY KEY, city_id INTEGER REFERENCES cities(id), report_id INTEGER REFERENCES impact_reports(id),
  deceased INTEGER, injured INTEGER, missing INTEGER, affected INTEGER, homes_affected INTEGER,
  homes_destroyed INTEGER, infrastructure_notes TEXT
);
-- Resumen mensual permanente: sobrevive a la limpieza del detalle de seismic_events.
-- total_* cuentan solo eventos con magnitud >= min_magnitude_filter para que los meses sean comparables.
CREATE TABLE IF NOT EXISTS monthly_stats (
  month TEXT NOT NULL, department TEXT NOT NULL,
  total_events INTEGER NOT NULL, total_candidates INTEGER NOT NULL,
  max_magnitude REAL, avg_magnitude REAL, avg_depth_km REAL,
  felt_events INTEGER NOT NULL,
  min_magnitude_filter REAL NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY (month, department)
);
CREATE INDEX IF NOT EXISTS idx_events_occurred_at ON seismic_events(occurred_at);
CREATE INDEX IF NOT EXISTS idx_events_earthquake ON seismic_events(earthquake_id);
CREATE INDEX IF NOT EXISTS idx_reports_balance_date ON impact_reports(balance_date);
