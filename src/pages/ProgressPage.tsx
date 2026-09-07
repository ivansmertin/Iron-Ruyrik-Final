import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  AlertCircle,
  CalendarCheck2,
  Plus,
  Smartphone,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { getProgressData } from '../api/progress'
import { AddMeasurementModal } from '../components/AddMeasurementModal'
import { HealthSourcesModal } from '../components/HealthSourcesModal'
import { ProgressLineChart } from '../components/ProgressLineChart'
import { Divider, HeroMetric, PageHeader, Section, SectionHeader, Skeleton } from '../components/ui'
import { useCountUp } from '../hooks/useCountUp'
import { calculateDelta, formatDecimal, pluralize } from '../utils/formatters'
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

  // Retrieve previous known weight from sessionStorage to avoid counting up from 0
  const [initialWeightVal] = useState<number | undefined>(() => {
    try {
      const stored = sessionStorage.getItem('ryrik_last_weight')
      return stored ? parseFloat(stored) : undefined
    } catch {
      return undefined
    }
  })

  // Smooth numeric transition ONLY when meaningful value changes
  // If no previous value (initial session), renders currentWeight directly
  const animatedWeight = useCountUp(currentWeight ?? 0, {
    duration: MOTION_DURATIONS.ui,
    decimals: 1,
    startVal: initialWeightVal,
  })

  // Persist latest known weight to sessionStorage
  useEffect(() => {
    if (currentWeight !== undefined) {
      try {
        sessionStorage.setItem('ryrik_last_weight', String(currentWeight))
      } catch {
        // ignore storage errors
      }
    }
  }, [currentWeight])

  if (isLoading) {
    return (
      <div className="page progress-page" aria-busy="true" aria-label="Загрузка данных прогресса">
        <PageHeader eyebrow="Динамика" title="Мой прогресс" />
        <div className="progress-summary" aria-hidden="true">
          <Skeleton className="summary-stat-skeleton" />
          <Skeleton className="summary-stat-skeleton" />
        </div>
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

  const measurements = data.measurements
  const latest = measurements.at(-1)
  const baseline = measurements[0]

  const weightSummary = data.latestWeightSummary
  const fatSummary = data.latestBodyFatSummary
  const muscleSummary = data.latestMuscleMassSummary

  const weightProvenance = weightSummary?.provenanceLabel ?? latest?.provenanceLabel

  // Weight Delta
  const weightDelta = weightSummary?.delta
    ? {
        formatted: weightSummary.delta.formatted,
        direction: weightSummary.delta.direction,
        label: weightSummary.delta.label,
      }
    : measurements.length > 1 && baseline && latest
    ? calculateDelta(latest.weight, baseline.weight, 'кг', baseline.date)
    : null

  // Body Fat Delta
  const currentBodyFat = fatSummary?.currentValue ?? latest?.bodyFat
  const fatProvenance = fatSummary?.provenanceLabel
  const bodyFatDelta = fatSummary?.delta
    ? {
        formatted: fatSummary.delta.formatted,
        direction: fatSummary.delta.direction,
        label: fatSummary.delta.label,
      }
    : measurements.length > 1 && latest?.bodyFat !== undefined && baseline?.bodyFat !== undefined
    ? calculateDelta(latest.bodyFat, baseline.bodyFat, '%', baseline.date)
    : null

  // Muscle Mass Delta
  const currentMuscleMass = muscleSummary?.currentValue ?? latest?.muscleMass
  const muscleProvenance = muscleSummary?.provenanceLabel
  const muscleMassDelta = muscleSummary?.delta
    ? {
        formatted: muscleSummary.delta.formatted,
        direction: muscleSummary.delta.direction,
        label: muscleSummary.delta.label,
      }
    : measurements.length > 1 && latest?.muscleMass !== undefined && baseline?.muscleMass !== undefined
    ? calculateDelta(latest.muscleMass, baseline.muscleMass, 'кг', baseline.date)
    : null

  const visitsPlural = pluralize(data.visitsThisMonth, 'тренировка', 'тренировки', 'тренировок')
  const weeksPlural = pluralize(data.consistentWeeks, 'неделя', 'недели', 'недель')

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

      {/* Top summary stats - cardless metric columns */}
      <Section className="progress-summary-section" aria-label="Сводка активности">
        <div className="progress-summary-grid">
          <div className="summary-stat-block">
            <span className="eyebrow">ТРЕНИРОВКИ</span>
            <div className="summary-stat-block__value-row">
              <CalendarCheck2 size={18} className="summary-stat__icon" aria-hidden="true" />
              <strong>{data.visitsThisMonth}</strong>
            </div>
            <span>{visitsPlural} за месяц</span>
          </div>

          <Divider orientation="vertical" />

          <div className="summary-stat-block">
            <span className="eyebrow">ДИСЦИПЛИНА</span>
            <div className="summary-stat-block__value-row">
              <Activity size={18} className="summary-stat__icon" aria-hidden="true" />
              <strong>{data.consistentWeeks}</strong>
            </div>
            <span>{weeksPlural} подряд</span>
          </div>
        </div>
      </Section>

      <Divider />

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
                <span>{weightDelta.formatted}</span>
              </span>
            )}
          </div>

          <HeroMetric
            value={formatDecimal(animatedWeight, 1)}
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

      {/* Other Metrics Section - cardless rows */}
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
                      <span>{bodyFatDelta.formatted}</span>
                    </span>
                  )}
                </div>
              </div>
            )}

            {currentMuscleMass !== undefined && (
              <div
                className="cardless-metric-row"
                aria-label={`Мышечная масса ${formatDecimal(currentMuscleMass, 1)} кг${
                  muscleMassDelta ? `, изменение ${muscleMassDelta.label}` : ''
                }`}
              >
                <div className="cardless-metric-row__info">
                  <span className="cardless-metric-row__name">Мышечная масса</span>
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
                      <span>{muscleMassDelta.formatted}</span>
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
