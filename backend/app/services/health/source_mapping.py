from __future__ import annotations

from ...enums import HealthSourceProvider


KNOWN_BUNDLE_AND_PACKAGE_MAP: dict[str, HealthSourceProvider] = {
    # Xiaomi / Zepp / Huami ecosystems
    "com.xiaomi.wearable": HealthSourceProvider.XIAOMI,
    "com.mi.health": HealthSourceProvider.XIAOMI,
    "com.xiaomi.hm.health": HealthSourceProvider.XIAOMI,
    "com.huami.watch.hmwatchmanager": HealthSourceProvider.XIAOMI,
    "com.xiaomi.smarthome": HealthSourceProvider.XIAOMI,
    # Garmin
    "com.garmin.connect": HealthSourceProvider.GARMIN,
    "com.garmin.android.apps.connectmobile": HealthSourceProvider.GARMIN,
    # Samsung
    "com.sec.android.app.shealth": HealthSourceProvider.SAMSUNG_HEALTH,
    "com.samsung.shealth": HealthSourceProvider.SAMSUNG_HEALTH,
    # Withings
    "com.withings.wiscale2": HealthSourceProvider.WITHINGS,
    # WHOOP
    "com.whoop.client": HealthSourceProvider.WHOOP,
    # Oura
    "com.ouraring.oura": HealthSourceProvider.OURA,
    # Fitbit
    "com.fitbit.fitbitmobile": HealthSourceProvider.FITBIT,
    # Apple Health
    "com.apple.health": HealthSourceProvider.APPLE_HEALTH,
}


def resolve_source_provider(
    source_app_id: str | None,
    transport_provider: HealthSourceProvider,
) -> HealthSourceProvider:
    """
    Разрешает фактического производителя данных по bundle ID (iOS) или package name (Android).
    Если источник не распознан, возвращает транспортный провайдер (apple_health или health_connect).
    Никаких догадок и эвристик по значениям не производится.
    """
    if not source_app_id:
        return transport_provider

    cleaned_id = source_app_id.strip().lower()
    return KNOWN_BUNDLE_AND_PACKAGE_MAP.get(cleaned_id, transport_provider)


def sanitize_device_name(raw_device: str | None) -> str | None:
    if not raw_device:
        return None
    cleaned = raw_device.strip()
    if not cleaned or cleaned.lower() in ("unknown", "null", "none", "device"):
        return None
    return cleaned[:120]
