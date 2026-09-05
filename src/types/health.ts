export type HealthMetricType =
  | 'weight'
  | 'body_fat_percentage'
  | 'lean_body_mass'
  | 'muscle_mass'
  | 'steps'
  | 'resting_heart_rate'
  | 'heart_rate'
  | 'hrv'
  | 'sleep_duration'
  | 'sleep_score'
  | 'vo2_max'
  | 'workout'

export type HealthUnit =
  | 'kg'
  | 'percent'
  | 'bpm'
  | 'ms'
  | 'count'
  | 'minutes'
  | 'seconds'
  | 'ml_kg_min'
  | 'score'

export type HealthSourceProvider =
  | 'manual'
  | 'apple_health'
  | 'health_connect'
  | 'garmin'
  | 'xiaomi'
  | 'withings'
  | 'whoop'
  | 'oura'
  | 'fitbit'
  | 'samsung_health'

export type HealthImportMethod =
  | 'manual'
  | 'direct_api'
  | 'native_bridge'
  | 'apple_health'
  | 'health_connect'

export type HealthSyncStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'syncing'
  | 'error'
  | 'permission_required'
  | 'unsupported'

export interface HealthMeasurement {
  id: string
  userId: string
  metricType: HealthMetricType
  value: number
  unit: HealthUnit
  measuredAt: string
  sourceProvider: HealthSourceProvider
  sourceDevice?: string | null
  sourceRecordId?: string | null
  sourceApp?: string | null
  importMethod: HealthImportMethod
  metadataJson?: string | null
  createdAt: string
}

export interface HealthSourceConnection {
  id: string
  provider: HealthSourceProvider
  status: HealthSyncStatus
  lastSyncedAt?: string | null
  errorCode?: string | null
  errorMessage?: string | null
  displayName: string
  category: 'device' | 'service'
  requiresNativeBridge: boolean
  description?: string | null
}

export interface HealthMetricDelta {
  diff: number
  formatted: string
  direction: 'up' | 'down' | 'neutral'
  label: string
}

export interface HealthMetricSummary {
  metricType: HealthMetricType
  currentValue: number
  unit: HealthUnit
  measuredAt: string
  provenanceLabel: string
  sourceProvider: HealthSourceProvider
  sourceDevice?: string | null
  delta?: HealthMetricDelta | null
  baselineValue?: number | null
  baselineDate?: string | null
}

export interface HealthSparklinePoint {
  id: string
  date: string
  measuredAt: string
  value: number
  provenanceLabel: string
  sourceProvider: HealthSourceProvider
  sourceDevice?: string | null
}

export interface HealthProgress {
  visitsThisMonth: number
  consistentWeeks: number
  latestWeight?: HealthMetricSummary | null
  latestBodyFat?: HealthMetricSummary | null
  latestMuscleMass?: HealthMetricSummary | null
  weightSeries: HealthSparklinePoint[]
}

export interface ManualMeasurementInput {
  measuredAt: string
  weight?: number
  bodyFat?: number
  muscleMass?: number
  notes?: string
}

export interface HealthImportRecordIn {
  source_record_id: string
  metric_type: HealthMetricType
  value: number
  unit: HealthUnit
  measured_at: string
  source_app?: string | null
  source_device?: string | null
  device_manufacturer?: string | null
  device_model?: string | null
  origin_platform?: string | null
}

export interface BatchHealthImportIn {
  provider: HealthSourceProvider
  sync_cursor?: string | null
  records: HealthImportRecordIn[]
}

export interface HealthImportErrorItem {
  index: number
  source_record_id?: string | null
  error: string
}

export interface BatchHealthImportOut {
  imported_count: number
  duplicates_count: number
  failed_count: number
  sync_cursor?: string | null
  errors: HealthImportErrorItem[]
}

export type BridgePlatform = 'ios' | 'android' | 'web'

export type PermissionStatusType =
  | 'authorized'
  | 'denied'
  | 'partially_authorized'
  | 'not_determined'
  | 'unsupported'

export interface NativeHealthBridgeRecord {
  sourceRecordId: string
  metricType: string
  value: number
  unit: string
  measuredAt: string
  originPlatform: string
  sourceApp?: string
  sourceName?: string
  sourceDevice?: string
  deviceManufacturer?: string
  deviceModel?: string
}

export interface PermissionStatusResult {
  status: PermissionStatusType
  availableTypes: string[]
}

export interface RequestPermissionsResult {
  granted: boolean
  types: string[]
}

export interface ReadMeasurementsResult {
  records: NativeHealthBridgeRecord[]
  count: number
  syncCursor: string
}

export interface BridgeAvailabilityResult {
  available: boolean
  platform: BridgePlatform
  updateRequired?: boolean
  providerPackage?: string
}

export type HealthBridgeErrorCode =
  | 'UNAVAILABLE'
  | 'UPDATE_REQUIRED'
  | 'PERMISSION_DENIED'
  | 'NOT_DETERMINED'
  | 'TIMEOUT'
  | 'IMPORT_FAILED'
  | 'NETWORK_OFFLINE'
  | 'UNKNOWN_ERROR'

