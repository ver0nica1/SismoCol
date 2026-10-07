import csv, io, re, requests, time, zipfile
import xml.etree.ElementTree as ET
from datetime import date, timedelta

# Tope de filas que se pide al formulario del SGC; si un tramo lo alcanza, se divide.
ROW_LIMIT = 1350

CATALOG_URL = 'https://bdrsnc.sgc.gov.co/paginas1/catalogo/Consulta_Experta_Seiscomp/consultaexperta.php'
RESULT_URL = 'https://bdrsnc.sgc.gov.co/paginas1/catalogo/Consulta_Experta_Seiscomp/consulta_sismo.php'

def _number(value):
    if value is None: return None
    if isinstance(value, (int, float)): return float(value)
    value = value.strip().replace(',', '.')
    try: return float(value)
    except ValueError: return None

# La relación con una secuencia se calcula en backend/services/classification.py.

def parse_csv(content):
    for row in csv.DictReader(io.StringIO(content)):
        yield {'event_id': row.get('id') or row.get('ID') or row.get('event_id'), 'occurred_at': row.get('occurred_at') or row.get('fecha'), 'magnitude': float((row.get('magnitude') or row.get('magnitud')).replace(',','.')) if (row.get('magnitude') or row.get('magnitud')) else None, 'depth_km': row.get('depth_km') or row.get('profundidad'), 'latitude': row.get('latitude') or row.get('latitud'), 'longitude': row.get('longitude') or row.get('longitud'), 'municipality': row.get('municipality') or row.get('municipio'), 'department': row.get('department') or row.get('departamento')}

def fetch_csv(url, timeout=20):
    r = requests.get(url, timeout=timeout, headers={'User-Agent':'SismoCol/1.0'}); r.raise_for_status(); return list(parse_csv(r.text))

def fetch_catalog(start_date='2026-08-10', end_date=None, timeout=60, chunk_days=7, pause_seconds=1.0):
    """Descarga el catálogo SGC por tramos para no chocar con el tope de filas del formulario."""
    start = date.fromisoformat(start_date)
    end = date.fromisoformat(end_date) if end_date else date.today()
    seen, events = set(), []
    cursor = start
    while cursor <= end:
        chunk_end = min(cursor + timedelta(days=chunk_days - 1), end)
        for event in _fetch_range(cursor, chunk_end, timeout, pause_seconds):
            if event['event_id'] not in seen:
                seen.add(event['event_id']); events.append(event)
        cursor = chunk_end + timedelta(days=1)
    if not events and (end - start).days >= 3:
        raise RuntimeError('El SGC respondió sin filas de eventos; la estructura del catálogo pudo cambiar.')
    return events

def _fetch_range(start, end, timeout, pause_seconds):
    """Descarga un tramo; si llega al tope de filas lo parte en dos (hasta un día)."""
    rows = fetch_catalog_range(start.isoformat(), end.isoformat(), timeout)
    if pause_seconds: time.sleep(pause_seconds)
    if len(rows) >= ROW_LIMIT and start < end:
        middle = start + (end - start) // 2
        return _fetch_range(start, middle, timeout, pause_seconds) + _fetch_range(middle + timedelta(days=1), end, timeout, pause_seconds)
    if len(rows) >= ROW_LIMIT:
        print(f'Aviso: {start} alcanzó el tope de {ROW_LIMIT} filas del SGC; pueden faltar eventos de ese día.')
    return rows

def fetch_catalog_range(start_date, end_date, timeout=60):
    """Descarga y parsea el Excel oficial generado por el catálogo SGC para un rango."""
    params = {'longitudStart':'-90','lat':'','longitudEnd':'-66','latitudStart':'-07','latitudEnd':'15','magnitudStart':'0','magnitudEnd':'9','depthStart':'0','depthEnd':'700','rmsStart':'0','rmsEnd':'10','inicial':start_date,'final1':end_date,'contipo':'cuadrante','longcentral':'','latcentral':'','radio':'','departamento':'','municipio':'','gapinicio':'0','gapfinal':'360','num_registros':str(ROW_LIMIT),'eprof':'0','eprofm':'999','elat':'0','elatm':'999','elong':'0','elongm':'999','id':'320'}
    export_url = 'https://bdrsnc.sgc.gov.co/paginas1/catalogo/Consulta_Experta_Seiscomp/descargar_exel_experta.php'
    response = requests.get(export_url, params=params, timeout=timeout, headers={'User-Agent':'SismoCol/1.0 (research)'})
    response.raise_for_status()
    if 'application/force-download' not in response.headers.get('content-type',''):
        raise RuntimeError('El SGC no devolvió el Excel del catálogo; revise el rango o la disponibilidad de la fuente.')
    ns = {'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    with zipfile.ZipFile(io.BytesIO(response.content)) as workbook:
        names = workbook.namelist()
        shared_root = ET.fromstring(workbook.read('xl/sharedStrings.xml')) if 'xl/sharedStrings.xml' in names else None
        shared = [''.join(t.text or '' for t in si.iter('{%s}t' % ns['m'])) for si in shared_root.findall('m:si', ns)] if shared_root is not None else []
        sheet = ET.fromstring(workbook.read('xl/worksheets/sheet1.xml'))
    events = []
    for row in sheet.findall('.//m:row', ns):
        cells = []
        for cell in row.findall('m:c', ns):
            value = cell.find('m:v', ns); text = '' if value is None else value.text
            if cell.get('t') == 's' and text: text = shared[int(text)]
            cells.append(text)
        if len(cells) < 14 or not re.match(r'^\d{4}-\d\d-\d\d \d\d:', cells[0]): continue
        region = cells[12]; parts = region.split(' - ', 1)
        event = {'event_id':'SGC:' + ':'.join(cells[:3]), 'occurred_at':cells[0], 'latitude':_number(cells[1]), 'longitude':_number(cells[2]), 'depth_km':_number(cells[3]), 'magnitude':_number(cells[4]), 'municipality':parts[0].strip(), 'department':parts[1].split(',')[0].strip() if len(parts)>1 else None}
        events.append(event)
    return events
