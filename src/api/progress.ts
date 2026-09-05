import type { Measurement } from '../types/domain'
import type { HealthMetricSummary, HealthProgress } from '../types/health'
import { apiRequest } from './client'

export interface ProgressPageData {
  measurements: Measurement[]
  visitsThisMonth: number
  consistentWeeks: number
  latestWeightSummary?: HealthMetricSummary | null
  latestBodyFatSummary?: HealthMetricSummary | null
  latestMuscleMassSummary?: HealthMetricSummary | null
}

export async function getProgressData(): Promise<ProgressPageData> {
  try {
    const health = await apiRequest<HealthProgress>('/health/progress')
    const measurements: Measurement[] = health.weightSeries.map((pt) => ({
      id: pt.id,
      date: pt.date,
      weight: pt.value,
      provenanceLabel: pt.provenanceLabel,
      sourceProvider: pt.sourceProvider,
      sourceDevice: pt.sourceDevice || undefined,
    }))

    return {
      measurements,
      visitsThisMonth: health.visitsThisMonth,
      consistentWeeks: health.consistentWeeks,
      latestWeightSummary: health.latestWeight,
      latestBodyFatSummary: health.latestBodyFat,
      latestMuscleMassSummary: health.latestMuscleMass,
    }
  } catch {
    // Fallback to legacy measurements endpoint
    interface ApiMeasurement {
      id: string
      measuredAt: string
      weight: number | null
      bodyFat: number | null
      muscleMass: number | null
    }
    const rows = await apiRequest<ApiMeasurement[]>('/measurements')
    const measurements: Measurement[] = rows
      .filter((row) => row.weight !== null)
      .map((row) => ({
        id: row.id,
        date: row.measuredAt.slice(0, 10),
        weight: row.weight!,
        bodyFat: row.bodyFat ?? undefined,
        muscleMass: row.muscleMass ?? undefined,
        provenanceLabel: 'Внесено вручную',
      }))
    return { measurements, visitsThisMonth: 3, consistentWeeks: 3 }
  }
}
