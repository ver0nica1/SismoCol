import argparse, os
from datetime import date, timedelta
from pathlib import Path

from backend import config
from backend.database.db import ROOT, connect, seed
from backend.scrapers.news import fetch_article, save_article
from backend.scrapers.sgc import fetch_catalog
from backend.services.retention import keep_from, run_cleanup
from backend.services.sync import reclassify_events, upsert_events
from backend.services.swarm import reclassify_swarms

ARCHIVE_DIR = Path(os.getenv('SISMOCOL_ARCHIVE_DIR', ROOT / 'data' / 'archive'))


def _sync(conn, start, end):
    source = conn.execute("SELECT id FROM sources WHERE name='Servicio Geológico Colombiano'").fetchone()
    events = fetch_catalog(start, end)
    inserted = upsert_events(conn, events, source[0])
    # Si el catálogo trae el principal, se actualizan profundidad y coordenadas confirmadas por el SGC.
    main = conn.execute("SELECT depth_km,latitude,longitude FROM seismic_events WHERE earthquake_id=1 AND association_status='MAINSHOCK' LIMIT 1").fetchone()
    if main:
        conn.execute("UPDATE earthquakes SET depth_km=?,latitude=?,longitude=?,updated_at=datetime('now') WHERE id=1", tuple(main))
        conn.commit()
    print(f'Rango {start} → {end or date.today().isoformat()}: {len(events)} consultados, {inserted} nuevos guardados.')


def main():
    ap = argparse.ArgumentParser(prog='python -m backend.cli')
    sub = ap.add_subparsers(dest='cmd', required=True)
    n = sub.add_parser('scrape-news', help='Extrae una noticia y su balance')
    n.add_argument('--url', required=True)
    s = sub.add_parser('sync-events', help='Sincroniza el catálogo SGC (por defecto, últimos SISMOCOL_SYNC_DAYS días)')
    s.add_argument('--start'); s.add_argument('--end')
    b = sub.add_parser('backfill', help='Carga inicial de todo el periodo de retención')
    b.add_argument('--months', type=int)
    c = sub.add_parser('cleanup', help='Resumen mensual, respaldo CSV y borrado de datos viejos')
    c.add_argument('--dry-run', action='store_true', help='Solo muestra qué se borraría')
    c.add_argument('--months', type=int); c.add_argument('--min-magnitude', type=float)
    sub.add_parser('reclassify', help='Reclasifica todos los sismos con el criterio vigente')
    args = ap.parse_args()

    conn = connect(); seed(conn)
    if args.cmd == 'scrape-news':
        article = fetch_article(args.url)
        source = conn.execute("SELECT id FROM sources WHERE base_url LIKE '%infobae%' LIMIT 1").fetchone()
        save_article(conn, article, source['id']); print(article['title'])
    elif args.cmd == 'sync-events':
        default_start = (date.today() - timedelta(days=config.sync_days())).isoformat()
        start = args.start or os.getenv('SISMOCOL_START_DATE') or default_start
        _sync(conn, start, args.end or os.getenv('SISMOCOL_END_DATE') or None)
    elif args.cmd == 'backfill':
        months = args.months or config.retention_months()
        _sync(conn, keep_from(months), None)
    elif args.cmd == 'cleanup':
        r = run_cleanup(conn, months=args.months, min_magnitude=args.min_magnitude,
                        archive_dir=ARCHIVE_DIR, dry_run=args.dry_run)
        prefix = '[simulación] ' if r['dry_run'] else ''
        print(f"{prefix}Se conservan sismos generales desde {r['keep_from']} con M >= {r['min_magnitude']}.")
        print(f"{prefix}A borrar: {r['to_delete']} ({r['old']} por antigüedad, {r['below_min']} por magnitud). "
              "Los eventos del terremoto no se tocan.")
        for path in r['archives']:
            print(f'Respaldo actualizado: {path}')
    elif args.cmd == 'reclassify':
        count = reclassify_events(conn, only_missing=False)
        swarms = reclassify_swarms(conn)
        print(f"Sismos reclasificados: {count}; enjambres documentados: {swarms['documented']}; "
              f"posibles enjambres detectados: {swarms['possible']}")


if __name__ == '__main__': main()
