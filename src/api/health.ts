import type {
  BatchHealthImportIn,
  BatchHealthImportOut,
  HealthMeasurement,
  HealthProgress,
  HealthSourceConnection,
  HealthSourceProvider,
  ManualMeasurementInput,
} from '../types/health'
import { apiRequest } from './client'

export async function getHealthProgress(): Promise<HealthProgress> {
  return apiRequest<HealthProgress>('/health/progress')
}

export async function getHealthSources(): Promise<HealthSourceConnection[]> {
  return apiRequest<HealthSourceConnection[]>('/health/sources')
}

export async function connectHealthSource(
  provider: HealthSourceProvider
): Promise<HealthSourceConnection> {
  return apiRequest<HealthSourceConnection>(`/health/sources/${provider}/connect`, {
    method: 'POST',
  })
}

export async function disconnectHealthSource(
  provider: HealthSourceProvider
): Promise<HealthSourceConnection> {
  return apiRequest<HealthSourceConnection>(`/health/sources/${provider}/disconnect`, {
    method: 'POST',
  })
}

export async function addManualHealthMeasurement(
  input: ManualMeasurementInput
): Promise<HealthMeasurement[]> {
  return apiRequest<HealthMeasurement[]>('/health/measurements/manual', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function syncHealthRecords(payload: {
  provider: HealthSourceProvider
  deviceName?: string
  appName?: string
  records: Array<{
    metricType: string
    value: number
    unit?: string
    measuredAt: string | number
    sourceRecordId?: string
    sourceDevice?: string
  }>
}): Promise<HealthMeasurement[]> {
  return apiRequest<HealthMeasurement[]>('/health/sources/sync', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function batchImportHealthRecords(
  payload: BatchHealthImportIn
): Promise<BatchHealthImportOut> {
  return apiRequest<BatchHealthImportOut>('/health/measurements/import', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

