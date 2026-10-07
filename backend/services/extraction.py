import re

LABELS = {'deceased': r'(?:fallecid|muert)[oa]s?', 'injured': r'heridos?', 'missing': r'desaparecid[oa]s?', 'rescued': r'rescatad[oa]s?', 'affected': r'afectad[oa]s?', 'homes_affected': r'viviendas? afectad[oa]s?', 'homes_destroyed': r'viviendas? destruid[oa]s?'}

def number_near(text, label):
    m = re.search(rf'(\d[\d\.]*)\s+(?:(?:de|personas?|familias?)\s+)?{label}', text, re.I)
    if not m: return None
    return int(m.group(1).replace('.', ''))

def extract_figures(text):
    return {key: number_near(text, pattern) for key, pattern in LABELS.items()}

def clean_text(text):
    return re.sub(r'\s+', ' ', text or '').strip()
