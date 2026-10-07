"""Genera el sitio estático para GitHub Pages: copia frontend/ y escribe data/*.json.

Uso: python -m backend.export_static --out dist
"""
import argparse, json, shutil
from datetime import datetime, timezone
from pathlib import Path

from backend import queries
from backend.database.db import connect, seed

ROOT = Path(__file__).resolve().parents[1]
FRONT = ROOT / 'frontend'


def export(out_dir):
    out = Path(out_dir)
    if out.exists():
        shutil.rmtree(out)
    shutil.copytree(FRONT, out)
    data_dir = out / 'data'
    data_dir.mkdir(parents=True, exist_ok=True)

    conn = connect()
    try:
        seed(conn)
        sizes = {}
        for name in queries.DATASETS:
            raw = json.dumps(queries.dataset(conn, name), ensure_ascii=False, separators=(',', ':'))
            (data_dir / f'{name}.json').write_text(raw, encoding='utf-8')
            sizes[name] = len(raw.encode('utf-8'))
    finally:
        conn.close()

    manifest = {'generated_at': datetime.now(timezone.utc).isoformat(timespec='seconds'),
                'datasets': sorted(sizes)}
    (data_dir / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False), encoding='utf-8')
    # Evita que GitHub Pages procese el sitio con Jekyll.
    (out / '.nojekyll').write_text('', encoding='utf-8')
    return sizes


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--out', default=str(ROOT / 'dist'))
    args = ap.parse_args()
    sizes = export(args.out)
    for name, size in sizes.items():
        print(f'{name}.json: {size / 1024:.1f} KB')
    print(f'Sitio estático generado en {args.out}')


if __name__ == '__main__':
    main()
