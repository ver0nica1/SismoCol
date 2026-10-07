import json, os, sqlite3
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DB_PATH = Path(os.getenv('SISMOCOL_DB', ROOT / 'data' / 'sismocol.sqlite3'))

def connect():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    return conn

def now(): return datetime.now(timezone.utc).isoformat()

def init_db(conn):
    schema = (ROOT / 'schema.sql').read_text(encoding='utf-8')
    conn.executescript(schema); conn.commit()
    migrate(conn)

def migrate(conn):
    """Migraciones idempotentes para bases creadas con versiones anteriores del esquema."""
    columns = {row[1] for row in conn.execute('PRAGMA table_info(seismic_events)')}
    migrated_relations = 'association_status' not in columns
    if migrated_relations:
        # Rebuild once: SQLite cannot change the old event_type CHECK constraint in place.
        conn.execute('PRAGMA foreign_keys = OFF')
        conn.execute('BEGIN')
        conn.execute('''CREATE TABLE seismic_events_new (
          id INTEGER PRIMARY KEY, event_id TEXT NOT NULL UNIQUE, occurred_at TEXT, magnitude REAL,
          depth_km REAL, latitude REAL, longitude REAL, municipality TEXT, department TEXT,
          event_type TEXT NOT NULL DEFAULT 'SISMO' CHECK(event_type = 'SISMO'),
          association_status TEXT NOT NULL DEFAULT 'INSUFFICIENT_DATA'
            CHECK(association_status IN ('MAINSHOCK','CANDIDATE_AFTERSHOCK','UNASSOCIATED','INSUFFICIENT_DATA','SWARM','POSSIBLE_SWARM')),
          association_distance_km REAL, association_time_days REAL, depth_difference_km REAL,
          source_id INTEGER REFERENCES sources(id), earthquake_id INTEGER REFERENCES earthquakes(id),
          raw_payload TEXT, classification_method TEXT
        )''')
        old_rows = conn.execute('SELECT * FROM seismic_events').fetchall()
        old_names = [row[1] for row in conn.execute('PRAGMA table_info(seismic_events)')]
        index = {name: old_names.index(name) for name in old_names}
        for row in old_rows:
            legacy_type = row[index['event_type']]
            status = {
                'TERREMOTO PRINCIPAL': 'MAINSHOCK',
                'RÉPLICA': 'CANDIDATE_AFTERSHOCK',
                'OTRO EVENTO SÍSMICO / ENJAMBRE': 'UNASSOCIATED',
            }.get(legacy_type, 'INSUFFICIENT_DATA')
            values = {name: row[pos] for name, pos in index.items()}
            conn.execute('''INSERT INTO seismic_events_new
              (id,event_id,occurred_at,magnitude,depth_km,latitude,longitude,municipality,department,
               event_type,association_status,association_distance_km,association_time_days,depth_difference_km,
               source_id,earthquake_id,raw_payload,classification_method)
              VALUES(?,?,?,?,?,?,?,?,?,'SISMO',?,NULL,NULL,NULL,?,?,?,?)''',
              (values['id'], values['event_id'], values['occurred_at'], values['magnitude'],
               values['depth_km'], values['latitude'], values['longitude'], values['municipality'],
               values['department'], status, values.get('source_id'), values.get('earthquake_id'),
               values.get('raw_payload'), values.get('classification_method')))
        conn.execute('DROP TABLE seismic_events')
        conn.execute('ALTER TABLE seismic_events_new RENAME TO seismic_events')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_events_occurred_at ON seismic_events(occurred_at)')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_events_earthquake ON seismic_events(earthquake_id)')
        conn.commit()
        conn.execute('PRAGMA foreign_keys = ON')
    elif 'classification_method' not in columns:
        conn.execute('ALTER TABLE seismic_events ADD COLUMN classification_method TEXT')
        conn.commit()
    event_columns = {row[1] for row in conn.execute('PRAGMA table_info(seismic_events)')}
    for name in ('association_distance_km', 'association_time_days', 'depth_difference_km'):
        if name not in event_columns:
            conn.execute(f'ALTER TABLE seismic_events ADD COLUMN {name} REAL')
    conn.commit()
    # Older versions constrained association_status without the swarm category.
    table_sql = conn.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='seismic_events'").fetchone()[0]
    if "'POSSIBLE_SWARM'" not in table_sql:
        conn.execute('PRAGMA foreign_keys = OFF')
        conn.execute('BEGIN')
        conn.execute('''CREATE TABLE seismic_events_new (
          id INTEGER PRIMARY KEY, event_id TEXT NOT NULL UNIQUE, occurred_at TEXT, magnitude REAL,
          depth_km REAL, latitude REAL, longitude REAL, municipality TEXT, department TEXT,
          event_type TEXT NOT NULL DEFAULT 'SISMO' CHECK(event_type = 'SISMO'),
          association_status TEXT NOT NULL DEFAULT 'INSUFFICIENT_DATA'
            CHECK(association_status IN ('MAINSHOCK','CANDIDATE_AFTERSHOCK','UNASSOCIATED','INSUFFICIENT_DATA','SWARM','POSSIBLE_SWARM')),
          association_distance_km REAL, association_time_days REAL, depth_difference_km REAL,
          source_id INTEGER REFERENCES sources(id), earthquake_id INTEGER REFERENCES earthquakes(id),
          raw_payload TEXT, classification_method TEXT
        )''')
        conn.execute('''INSERT INTO seismic_events_new
          (id,event_id,occurred_at,magnitude,depth_km,latitude,longitude,municipality,department,event_type,
           association_status,association_distance_km,association_time_days,depth_difference_km,source_id,
           earthquake_id,raw_payload,classification_method)
          SELECT id,event_id,occurred_at,magnitude,depth_km,latitude,longitude,municipality,department,event_type,
                 association_status,association_distance_km,association_time_days,depth_difference_km,source_id,
                 earthquake_id,raw_payload,classification_method FROM seismic_events''')
        conn.execute('DROP TABLE seismic_events')
        conn.execute('ALTER TABLE seismic_events_new RENAME TO seismic_events')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_events_occurred_at ON seismic_events(occurred_at)')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_events_earthquake ON seismic_events(earthquake_id)')
        conn.commit()
        conn.execute('PRAGMA foreign_keys = ON')
    monthly_columns = {row[1] for row in conn.execute('PRAGMA table_info(monthly_stats)')}
    if 'total_candidates' not in monthly_columns:
        if 'total_replicas' in monthly_columns:
            conn.execute('BEGIN')
            conn.execute('''CREATE TABLE monthly_stats_new (
              month TEXT NOT NULL, department TEXT NOT NULL, total_events INTEGER NOT NULL,
              total_candidates INTEGER NOT NULL, max_magnitude REAL, avg_magnitude REAL,
              avg_depth_km REAL, felt_events INTEGER NOT NULL, min_magnitude_filter REAL NOT NULL,
              updated_at TEXT NOT NULL, PRIMARY KEY (month, department)
            )''')
            conn.execute('''INSERT INTO monthly_stats_new
              (month,department,total_events,total_candidates,max_magnitude,avg_magnitude,avg_depth_km,
               felt_events,min_magnitude_filter,updated_at)
              SELECT month,department,total_events,total_replicas,max_magnitude,avg_magnitude,avg_depth_km,
                     felt_events,min_magnitude_filter,updated_at FROM monthly_stats''')
            conn.execute('DROP TABLE monthly_stats')
            conn.execute('ALTER TABLE monthly_stats_new RENAME TO monthly_stats')
            conn.commit()
        else:
            conn.execute('ALTER TABLE monthly_stats ADD COLUMN total_candidates INTEGER NOT NULL DEFAULT 0')
            conn.commit()
    # Upgrade old classifications to candidate/association statuses exactly once.
    from backend.services.sync import reclassify_events
    reclassify_events(conn, only_missing=not migrated_relations)
    from backend.services.swarm import reclassify_swarms
    reclassify_swarms(conn)

def seed(conn):
    init_db(conn)
    conn.execute("INSERT OR IGNORE INTO sources(name,base_url,source_type) VALUES(?,?,?)", ('Servicio Geológico Colombiano','https://www2.sgc.gov.co/Paginas/aplicaciones-sismos.aspx','official'))
    conn.execute("INSERT OR IGNORE INTO sources(name,base_url,source_type) VALUES(?,?,?)", ('Infobae Colombia','https://www.infobae.com/colombia/','news'))
    conn.execute("INSERT OR IGNORE INTO sources(name,base_url,source_type) VALUES(?,?,?)", ('El Colombiano','https://www.elcolombiano.com/','news'))
    sgc = conn.execute("SELECT id FROM sources WHERE name='Servicio Geológico Colombiano'").fetchone()['id']
    conn.execute("INSERT OR IGNORE INTO earthquakes(id,name,event_date,event_time,magnitude,municipality,department,source_id,updated_at) VALUES(1,?,?,?,?,?,?,?,?)", ("Terremoto Colombia 2026-08-10",'2026-08-10','07:34',7.4,'San José del Palmar','Chocó',sgc,now()))
    cities = [('Pereira','Risaralda',4.813,-75.696),('Dosquebradas','Risaralda',4.835,-75.672),('Cali','Valle del Cauca',3.452,-76.532),('Manizales','Caldas',5.070,-75.513),('Armenia','Quindío',4.534,-75.675),('Quibdó','Chocó',5.692,-76.658)]
    conn.executemany("INSERT OR IGNORE INTO cities(name,department,latitude,longitude) VALUES(?,?,?,?)", cities)
    conn.commit()
    from backend.services.city_balances import populate_city_impacts
    populate_city_impacts(conn)

def rows(conn, sql, params=()): return [dict(r) for r in conn.execute(sql, params).fetchall()]
