import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  AlertCircle,
  Plus,
  Smartphone,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { useState } from 'react'
import { getProgressData } from '../api/progress'
import { AddMeasurementModal } from '../components/AddMeasurementModal'
import { HealthSourcesModal } from '../components/HealthSourcesModal'
import { ProgressLineChart } from '../components/ProgressLineChart'
import { Divider, HeroMetric, PageHeader, Section, SectionHeader, Skeleton } from '../components/ui'
import { useCountUp } from '../hooks/useCountUp'
import { calculateDelta, formatDecimal, formatDateRu } from '../utils/formatters'
import { MOTION_DURATIONS } from '../utils/motion'

export function ProgressPage() {
  const [isSourcesOpen, setIsSourcesOpen] = useState(false)
  const [isAddOpen, setIsAddOpen] = useState(false)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['health-progress'],
    queryFn: getProgressData,
  })

  const currentWeight =
    data?.latestWeightSummary?.currentValue ?? data?.measurements?.at(-1)?.weight

  // First known value renders immediately without 0 -> value animation.
  // Subsequent known -> known updates animate smoothly over <= 220ms.
  const animatedWeight = useCountUp(currentWeight, {
    duration: MOTION_DURATIONS.ui,
    decimals: 1,
  })

  if (isLoading) {
    return (
      <div className="page progress-page" aria-busy="true" aria-label="Загрузка данных прогресса">
        <PageHeader eyebrow="Динамика" title="Мой прогресс" />
        <Skeleton className="weight-card-skeleton" aria-hidden="true" />
        <div className="metric-list" aria-hidden="true">
          <Skeleton className="metric-row-skeleton" />
          <Skeleton className="metric-row-skeleton" />
        </div>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="page progress-page">
        <PageHeader eyebrow="Динамика" title="Мой прогресс" />
        <div className="schedule-state-card schedule-state-card--error" role="alert">
          <AlertCircle size={32} className="schedule-state-card__icon" aria-hidden="true" />
          <h3 className="schedule-state-card__title">Не удалось загрузить данные прогресса</h3>
          <p className="schedule-state-card__text">Проверьте соединение с интернетом и попробуйте снова.</p>
          <button type="button" className="button button--primary" onClick={() => refetch()}>
            Повторить
          </button>
        </div>
      </div>
    )
  }

  const measurements = data.measurements ?? []
  const latest = measurements.at(-1)
  const baseline = measurements[0]

  const weightSummary = data.latestWeightSummary
  const fatSummary = data.latestBodyFatSummary
  const muscleSummary = data.latestMuscleMassSummary

  const weightProvenance = weightSummary?.provenanceLabel ?? latest?.provenanceLabel

  // Weight Delta: only calculated when more than 1 measurement exists
  let weightDelta: { formatted: string; direction: 'up' | 'down' | 'neutral'; label: string } | null = null
  if (measurements.length > 1) {
    if (weightSummary?.delta) {
      const baselineFormatted = weightSummary.baselineDate
        ? formatDateRu(weightSummary.baselineDate, 'long')
        : baseline
        ? formatDateRu(baseline.date, 'long')
        : ''
      const hasWithDate = weightSummary.delta.label.includes(' с ')
      const label = hasWithDate
        ? weightSummary.delta.label
        : baselineFormatted
        ? `${weightSummary.delta.formatted} с ${baselineFormatted}`
        : weightSummary.delta.label

      weightDelta = {
        formatted: weightSummary.delta.formatted,
        direction: weightSummary.delta.direction,
        label,
      }
    } else if (baseline && latest) {
      weightDelta = calculateDelta(
        latest.weight,
        baseline.weight,
        'кг',
        baseline.measuredAt || baseline.date
      )
    }
  }

  // Body Fat Delta
  const currentBodyFat = fatSummary?.currentValue ?? latest?.bodyFat
  const fatProvenance = fatSummary?.provenanceLabel
  let bodyFatDelta: { formatted: string; direction: 'up' | 'down' | 'neutral'; label: string } | null = null
  if (measurements.length > 1) {
    if (fatSummary?.delta) {
      const baselineFormatted = fatSummary.baselineDate
        ? formatDateRu(fatSummary.baselineDate, 'long')
        : baseline
        ? formatDateRu(baseline.date, 'long')
        : ''
      const hasWithDate = fatSummary.delta.label.includes(' с ')
      const label = hasWithDate
        ? fatSummary.delta.label
        : baselineFormatted
        ? `${fatSummary.delta.formatted} с ${baselineFormatted}`
        : fatSummary.delta.label
      bodyFatDelta = {
        formatted: fatSummary.delta.formatted,
        direction: fatSummary.delta.direction,
        label,
      }
    } else if (latest?.bodyFat !== undefined && baseline?.bodyFat !== undefined) {
      bodyFatDelta = calculateDelta(
        latest.bodyFat,
        baseline.bodyFat,
        '%',
        baseline.measuredAt || baseline.date
      )
    }
  }

  // Muscle Mass vs Lean Body Mass (strict terminology)
  const isLeanBodyMass = muscleSummary?.metricType === 'lean_body_mass'
  const muscleName = isLeanBodyMass ? 'Безжировая масса' : 'Мышечная масса'
  const currentMuscleMass = muscleSummary?.currentValue ?? latest?.muscleMass
  const muscleProvenance = muscleSummary?.provenanceLabel
  let muscleMassDelta: { formatted: string; direction: 'up' | 'down' | 'neutral'; label: string } | null = null
  if (measurements.length > 1) {
    if (muscleSummary?.delta) {
      const baselineFormatted = muscleSummary.baselineDate
        ? formatDateRu(muscleSummary.baselineDate, 'long')
        : baseline
        ? formatDateRu(baseline.date, 'long')
        : ''
      const hasWithDate = muscleSummary.delta.label.includes(' с ')
      const label = hasWithDate
        ? muscleSummary.delta.label
        : baselineFormatted
        ? `${muscleSummary.delta.formatted} с ${baselineFormatted}`
        : muscleSummary.delta.label
      muscleMassDelta = {
        formatted: muscleSummary.delta.formatted,
        direction: muscleSummary.delta.direction,
        label,
      }
    } else if (latest?.muscleMass !== undefined && baseline?.muscleMass !== undefined) {
      muscleMassDelta = calculateDelta(
        latest.muscleMass,
        baseline.muscleMass,
        'кг',
        baseline.measuredAt || baseline.date
      )
    }
  }

  const displayWeight = animatedWeight !== undefined ? animatedWeight : currentWeight

  return (
    <div className="page progress-page">
      <PageHeader
        eyebrow="Динамика"
        title="Мой прогресс"
        action={
          <div className="progress-header-actions">
            <button
              type="button"
              className="progress-action-btn progress-action-btn--sources motion-pressable"
              onClick={() => setIsSourcesOpen(true)}
              aria-label="Подключить источники данных здоровья"
              title="Источники данных"
            >
              <Smartphone size={16} aria-hidden="true" />
              <span>Источники</span>
            </button>
            <button
              type="button"
              className="progress-action-btn progress-action-btn--add motion-pressable"
              onClick={() => setIsAddOpen(true)}
              aria-label="Записать новый замер"
              title="Записать замер"
            >
              <Plus size={16} aria-hidden="true" />
              <span>Замер</span>
            </button>
          </div>
        }
      />

      {/* Weight Hero Section - cardless athletic typography */}
      {currentWeight !== undefined ? (
        <Section
          className="progress-weight-section"
          aria-label={`Текущий вес ${formatDecimal(currentWeight, 1)} кг${
            weightDelta ? `, изменение ${weightDelta.label}` : ''
          }`}
        >
          <div className="progress-weight-header">
            <span className="eyebrow">ТЕКУЩИЙ ВЕС</span>
            {weightDelta && (
              <span
                className="metric-change"
                title={weightDelta.label}
                aria-label={weightDelta.label}
              >
                {weightDelta.direction === 'down' && <TrendingDown size={14} aria-hidden="true" />}
                {weightDelta.direction === 'up' && <TrendingUp size={14} aria-hidden="true" />}
                <span>{weightDelta.label}</span>
              </span>
            )}
          </div>

          <HeroMetric
            value={formatDecimal(displayWeight ?? currentWeight, 1)}
            unit="кг"
            className="progress-weight-hero"
          />

          {weightProvenance && (
            <p className="metric-provenance" aria-label={`Источник: ${weightProvenance}`}>
              {weightProvenance}
            </p>
          )}

          <ProgressLineChart measurements={measurements} />
        </Section>
      ) : (
        <div className="schedule-state-card schedule-state-card--empty motion-surface" role="status">
          <Activity size={32} className="schedule-state-card__icon" aria-hidden="true" />
          <h3 className="schedule-state-card__title">Пока нет данных о весе</h3>
          <p className="schedule-state-card__text">
            Внесите первый замер вручную или подключите носимое устройство в источниках данных.
          </p>
          <button
            type="button"
            className="button button--primary"
            onClick={() => setIsAddOpen(true)}
            style={{ marginTop: 12 }}
          >
            Внести первый замер
          </button>
        </div>
      )}

      <Divider />

      {/* Supporting Body Metrics Section - remains visible even when weight is missing */}
      {(currentBodyFat !== undefined || currentMuscleMass !== undefined) && (
        <Section aria-label="Дополнительные показатели" className="progress-metrics-section">
          <SectionHeader title="Показатели" eyebrow="СОСТАВ ТЕЛА" />
          <div className="cardless-metric-list">
            {currentBodyFat !== undefined && (
              <div
                className="cardless-metric-row"
                aria-label={`Процент жира ${formatDecimal(currentBodyFat, 1)} %${
                  bodyFatDelta ? `, изменение ${bodyFatDelta.label}` : ''
                }`}
              >
                <div className="cardless-metric-row__info">
                  <span className="cardless-metric-row__name">Процент жира</span>
                  {fatProvenance && (
                    <span className="cardless-metric-row__provenance">{fatProvenance}</span>
                  )}
                </div>

                <div className="cardless-metric-row__values">
                  <strong className="cardless-metric-row__val">{formatDecimal(currentBodyFat, 1)} %</strong>
                  {bodyFatDelta && (
                    <span className="metric-change" title={bodyFatDelta.label} aria-label={bodyFatDelta.label}>
                      {bodyFatDelta.direction === 'down' && <TrendingDown size={14} aria-hidden="true" />}
                      {bodyFatDelta.direction === 'up' && <TrendingUp size={14} aria-hidden="true" />}
                      <span>{bodyFatDelta.label}</span>
                    </span>
                  )}
                </div>
              </div>
            )}

            {currentMuscleMass !== undefined && (
              <div
                className="cardless-metric-row"
                aria-label={`${muscleName} ${formatDecimal(currentMuscleMass, 1)} кг${
                  muscleMassDelta ? `, изменение ${muscleMassDelta.label}` : ''
                }`}
              >
                <div className="cardless-metric-row__info">
                  <span className="cardless-metric-row__name">{muscleName}</span>
                  {muscleProvenance && (
                    <span className="cardless-metric-row__provenance">{muscleProvenance}</span>
                  )}
                </div>

                <div className="cardless-metric-row__values">
                  <strong className="cardless-metric-row__val">{formatDecimal(currentMuscleMass, 1)} кг</strong>
                  {muscleMassDelta && (
                    <span className="metric-change" title={muscleMassDelta.label} aria-label={muscleMassDelta.label}>
                      {muscleMassDelta.direction === 'down' && <TrendingDown size={14} aria-hidden="true" />}
                      {muscleMassDelta.direction === 'up' && <TrendingUp size={14} aria-hidden="true" />}
                      <span>{muscleMassDelta.label}</span>
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Explanatory note */}
      <p className="data-note">
        Показатели синхронизируются из внешних источников или вносятся вручную для отслеживания долгосрочной динамики.
      </p>

      {/* Modals */}
      <AddMeasurementModal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} />
      <HealthSourcesModal isOpen={isSourcesOpen} onClose={() => setIsSourcesOpen(false)} />
    </div>
  )
}
