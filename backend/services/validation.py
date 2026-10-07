import math


def _number(value):
    if value is None or value == '':
        return None
    try:
        number = float(str(value).replace(',', '.'))
        return number if math.isfinite(number) else None
    except (TypeError, ValueError):
        return None


def validate_event(event):
    """Return data-quality errors without confusing missing data with zero."""
    errors = []
    if not event.get('event_id'):
        errors.append('missing_event_id')

    magnitude = _number(event.get('magnitude'))
    if event.get('magnitude') not in (None, '') and (magnitude is None or not 0 < magnitude <= 10):
        errors.append('magnitude_range')

    depth = _number(event.get('depth_km'))
    if event.get('depth_km') not in (None, '') and (depth is None or not 0 <= depth <= 700):
        errors.append('depth_range')

    for field, low, high in (('latitude', -90, 90), ('longitude', -180, 180)):
        raw = event.get(field)
        value = _number(raw)
        if raw not in (None, '') and (value is None or not low <= value <= high):
            errors.append(f'{field}_range')
    return errors
