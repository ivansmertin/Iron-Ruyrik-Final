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
  const health = await apiRequest<HealthProgress>('/health/progress')
  const measurements: Measurement[] = (health.weightSeries ?? []).map((pt) => ({
    id: pt.id,
    date: pt.date,
    measuredAt: pt.measuredAt || pt.date,
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
}
