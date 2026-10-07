"""Configuración leída del entorno en cada llamada (permite cambiarla en pruebas)."""
import os


def min_magnitude():
    """Magnitud mínima para guardar eventos sin asociación (los candidatos se conservan)."""
    return float(os.getenv('SISMOCOL_MIN_MAGNITUDE', '2.5'))


def retention_months():
    """Meses de detalle que se conservan para sismos no asociados al terremoto."""
    return int(os.getenv('SISMOCOL_RETENTION_MONTHS', '24'))


def sync_days():
    """Días hacia atrás que consulta `sync-events` cuando no se fija SISMOCOL_START_DATE."""
    return int(os.getenv('SISMOCOL_SYNC_DAYS', '7'))
