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
import { useState } from 'react'
import { getProgressData } from '../api/progress'
import { AddMeasurementModal } from '../components/AddMeasurementModal'
import { HealthSourcesModal } from '../components/HealthSourcesModal'
import { ProgressLineChart } from '../components/ProgressLineChart'
import { Card, PageHeader, SectionHeader, Skeleton } from '../components/ui'
import { calculateDelta, formatDecimal, pluralize } from '../utils/formatters'

export function ProgressPage() {
  const [isSourcesOpen, setIsSourcesOpen] = useState(false)
  const [isAddOpen, setIsAddOpen] = useState(false)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['health-progress'],
    queryFn: getProgressData,
  })

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

  const currentWeight = weightSummary?.currentValue ?? latest?.weight
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
              className="progress-action-btn progress-action-btn--sources"
              onClick={() => setIsSourcesOpen(true)}
              aria-label="Подключить источники данных здоровья"
              title="Источники данных"
            >
              <Smartphone size={16} aria-hidden="true" />
              <span>Источники</span>
            </button>
            <button
              type="button"
              className="progress-action-btn progress-action-btn--add"
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

      {/* Top summary stats */}
      <div className="progress-summary">
        <Card className="summary-stat">
          <CalendarCheck2 size={22} className="summary-stat__icon" aria-hidden="true" />
          <strong>{data.visitsThisMonth}</strong>
          <span>{visitsPlural} за месяц</span>
        </Card>

        <Card className="summary-stat">
          <Activity size={22} className="summary-stat__icon" aria-hidden="true" />
          <strong>{data.consistentWeeks}</strong>
          <span>{weeksPlural} подряд</span>
        </Card>
      </div>

      {/* Weight Hero Card */}
      {currentWeight !== undefined ? (
        <Card
          className="weight-card"
          aria-label={`Текущий вес ${formatDecimal(currentWeight, 1)} кг${
            weightDelta ? `, изменение ${weightDelta.label}` : ''
          }`}
        >
          <SectionHeader
            title="Вес"
            detail={
              weightDelta ? (
                <span className="metric-change" title={weightDelta.label} aria-label={weightDelta.label}>
                  {weightDelta.direction === 'down' && <TrendingDown size={15} aria-hidden="true" />}
                  {weightDelta.direction === 'up' && <TrendingUp size={15} aria-hidden="true" />}
                  <span>{weightDelta.formatted}</span>
                </span>
              ) : undefined
            }
          />

          <div className="weight-card__value">
            <strong>{formatDecimal(currentWeight, 1)}</strong>
            <span>кг</span>
          </div>

          {weightProvenance && (
            <p className="metric-provenance" aria-label={`Источник: ${weightProvenance}`}>
              {weightProvenance}
            </p>
          )}

          <ProgressLineChart measurements={measurements} />
        </Card>
      ) : (
        <div className="schedule-state-card schedule-state-card--empty" role="status">
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

      {/* Other Metrics Section */}
      {(currentBodyFat !== undefined || currentMuscleMass !== undefined) && (
        <section aria-label="Дополнительные показатели">
          <SectionHeader title="Показатели" />
          <div className="metric-list">
            {currentBodyFat !== undefined && (
              <Card
                className="metric-row"
                aria-label={`Процент жира ${formatDecimal(currentBodyFat, 1)} %${
                  bodyFatDelta ? `, изменение ${bodyFatDelta.label}` : ''
                }`}
              >
                <div className="metric-row__info">
                  <span>Процент жира</span>
                  <strong>{formatDecimal(currentBodyFat, 1)} %</strong>
                  {fatProvenance && (
                    <span className="metric-row__provenance">{fatProvenance}</span>
                  )}
                </div>

                {bodyFatDelta && (
                  <span className="metric-change" title={bodyFatDelta.label} aria-label={bodyFatDelta.label}>
                    {bodyFatDelta.direction === 'down' && <TrendingDown size={15} aria-hidden="true" />}
                    {bodyFatDelta.direction === 'up' && <TrendingUp size={15} aria-hidden="true" />}
                    <span>{bodyFatDelta.formatted}</span>
                  </span>
                )}
              </Card>
            )}

            {currentMuscleMass !== undefined && (
              <Card
                className="metric-row"
                aria-label={`Мышечная масса ${formatDecimal(currentMuscleMass, 1)} кг${
                  muscleMassDelta ? `, изменение ${muscleMassDelta.label}` : ''
                }`}
              >
                <div className="metric-row__info">
                  <span>Мышечная масса</span>
                  <strong>{formatDecimal(currentMuscleMass, 1)} кг</strong>
                  {muscleProvenance && (
                    <span className="metric-row__provenance">{muscleProvenance}</span>
                  )}
                </div>

                {muscleMassDelta && (
                  <span className="metric-change" title={muscleMassDelta.label} aria-label={muscleMassDelta.label}>
                    {muscleMassDelta.direction === 'down' && <TrendingDown size={15} aria-hidden="true" />}
                    {muscleMassDelta.direction === 'up' && <TrendingUp size={15} aria-hidden="true" />}
                    <span>{muscleMassDelta.formatted}</span>
                  </span>
                )}
              </Card>
            )}
          </div>
        </section>
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
