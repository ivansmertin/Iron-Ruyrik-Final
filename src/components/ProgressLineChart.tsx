import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
} from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { haptics } from '../services/haptics'
import type { Measurement } from '../types/domain'
import { formatDecimal, formatDateRu, formatDateTimeRu } from '../utils/formatters'

export type ChartPeriod = '7d' | '30d' | '3m' | '1y'

const PERIOD_OPTIONS: { id: ChartPeriod; label: string; days: number }[] = [
  { id: '7d', label: '7д', days: 7 },
  { id: '30d', label: '30д', days: 30 },
  { id: '3m', label: '3м', days: 90 },
  { id: '1y', label: '1г', days: 365 },
]

const SVG_WIDTH = 320
const SVG_HEIGHT = 120
const PAD_X = 16
const PAD_Y_TOP = 14
const PAD_Y_BOTTOM = 18
const USABLE_WIDTH = SVG_WIDTH - PAD_X * 2
const USABLE_HEIGHT = SVG_HEIGHT - PAD_Y_TOP - PAD_Y_BOTTOM

function parseTimestamp(item: Measurement): number {
  const raw = item.measuredAt || item.date
  if (!raw) return 0
  const trimmed = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}T12:00:00`).getTime()
  }
  const t = new Date(trimmed).getTime()
  return isNaN(t) ? 0 : t
}

interface ProgressLineChartProps {
  measurements: Measurement[]
  onPeriodChange?: (period: ChartPeriod, filtered: Measurement[]) => void
}

export function ProgressLineChart({ measurements, onPeriodChange }: ProgressLineChartProps) {
  const [period, setPeriod] = useState<ChartPeriod>('30d')
  const [activePointIndex, setActivePointIndex] = useState<number | null>(null)
  const [isListExpanded, setIsListExpanded] = useState(false)

  // Sliding surface indicator for period buttons
  const periodContainerRef = useRef<HTMLDivElement>(null)
  const [periodSurfaceStyle, setPeriodSurfaceStyle] = useState<{ left: number; width: number } | null>(null)
  const svgWrapRef = useRef<HTMLDivElement>(null)

  // Chronologically sorted measurements
  const sortedMeasurements = useMemo(() => {
    if (!measurements || measurements.length === 0) return []
    return [...measurements].sort((a, b) => parseTimestamp(a) - parseTimestamp(b))
  }, [measurements])

  // Filter measurements strictly based on active period relative to current time
  const activeMeasurements = useMemo(() => {
    if (!sortedMeasurements || sortedMeasurements.length === 0) return []
    const now = Date.now()
    const option = PERIOD_OPTIONS.find((p) => p.id === period)
    const windowDays = option ? option.days : 30
    const cutoff = now - windowDays * 24 * 60 * 60 * 1000

    return sortedMeasurements.filter((m) => parseTimestamp(m) >= cutoff)
  }, [sortedMeasurements, period])

  // Notify parent if needed
  useEffect(() => {
    onPeriodChange?.(period, activeMeasurements)
  }, [period, activeMeasurements, onPeriodChange])

  // Update period slider indicator
  useLayoutEffect(() => {
    if (!periodContainerRef.current) return
    const activeBtn = periodContainerRef.current.querySelector(
      `.chart-period-btn[data-period="${period}"]`
    ) as HTMLElement | null

    if (activeBtn) {
      setPeriodSurfaceStyle({
        left: activeBtn.offsetLeft,
        width: activeBtn.offsetWidth,
      })
    }
  }, [period])

  // Point coordinates calculation based on real timestamps and values
  const pointCoords = useMemo(() => {
    if (activeMeasurements.length === 0) return []

    const count = activeMeasurements.length
    const weights = activeMeasurements.map((item) => item.weight)
    const valMin = Math.min(...weights)
    const valMax = Math.max(...weights)
    const diff = valMax - valMin
    const buffer = diff === 0 ? 1.0 : Math.max(0.6, diff * 0.25)
    const yMin = valMin - buffer
    const yMax = valMax + buffer
    const range = yMax - yMin || 1

    if (count === 1) {
      const item = activeMeasurements[0]
      return [
        {
          x: SVG_WIDTH / 2,
          y: PAD_Y_TOP + USABLE_HEIGHT / 2,
          item,
          value: item.weight,
          dateLabel: formatDateRu(item.date, 'short'),
          dateTimeLabel: formatDateTimeRu(item.measuredAt || item.date),
        },
      ]
    }

    const timestamps = activeMeasurements.map(parseTimestamp)
    const tMin = Math.min(...timestamps)
    const tMax = Math.max(...timestamps)
    const tRange = tMax - tMin

    return activeMeasurements.map((item, index) => {
      let x: number
      if (tRange === 0) {
        x = SVG_WIDTH / 2
      } else {
        x = PAD_X + ((timestamps[index] - tMin) / tRange) * USABLE_WIDTH
      }

      const y = PAD_Y_TOP + (1 - (item.weight - yMin) / range) * USABLE_HEIGHT

      return {
        x,
        y,
        item,
        value: item.weight,
        dateLabel: formatDateRu(item.date, 'short'),
        dateTimeLabel: formatDateTimeRu(item.measuredAt || item.date),
      }
    })
  }, [activeMeasurements])

  // Path connects actual data points without synthetic 32-sample interpolation
  const pathD = useMemo(() => {
    if (pointCoords.length < 2) return ''
    return pointCoords
      .map((pt, k) => `${k === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
      .join(' ')
  }, [pointCoords])

  const safeIndex = useMemo(() => {
    if (pointCoords.length === 0) return -1
    if (activePointIndex === null) return pointCoords.length - 1
    if (activePointIndex < 0) return 0
    if (activePointIndex >= pointCoords.length) return pointCoords.length - 1
    return activePointIndex
  }, [pointCoords.length, activePointIndex])

  const activePoint =
    safeIndex >= 0 && safeIndex < pointCoords.length ? pointCoords[safeIndex] : null

  const handlePeriodSelect = (nextPeriod: ChartPeriod) => {
    if (nextPeriod !== period) {
      void haptics.selection()
      setPeriod(nextPeriod)
      setActivePointIndex(null)
    }
  }

  const handlePointerInteraction = useCallback(
    (clientX: number) => {
      if (!svgWrapRef.current || pointCoords.length === 0) return
      const rect = svgWrapRef.current.getBoundingClientRect()
      if (rect.width <= 0) return
      const relativeX = clientX - rect.left
      const svgX = (relativeX / rect.width) * SVG_WIDTH

      let closestIdx = 0
      let minDistance = Infinity
      for (let i = 0; i < pointCoords.length; i++) {
        const dist = Math.abs(pointCoords[i].x - svgX)
        if (dist < minDistance) {
          minDistance = dist
          closestIdx = i
        }
      }
      if (closestIdx !== activePointIndex) {
        void haptics.selection()
        setActivePointIndex(closestIdx)
      }
    },
    [pointCoords, activePointIndex]
  )

  const handlePrev = () => {
    if (safeIndex > 0) {
      void haptics.selection()
      setActivePointIndex(safeIndex - 1)
    }
  }

  const handleNext = () => {
    if (safeIndex < pointCoords.length - 1) {
      void haptics.selection()
      setActivePointIndex(safeIndex + 1)
    }
  }

  if (!measurements || measurements.length === 0) {
    return (
      <div className="line-chart line-chart--empty" role="status">
        <p className="line-chart__empty-text">Пока нет данных о весе</p>
      </div>
    )
  }

  const firstDate = pointCoords.length > 0 ? pointCoords[0].dateLabel : ''
  const lastDate = pointCoords.length > 1 ? pointCoords[pointCoords.length - 1].dateLabel : ''

  return (
    <div
      className="line-chart"
      role="region"
      aria-label={`График изменения веса с ${firstDate} по ${lastDate}`}
    >
      {/* Period Selector with Continuous Sliding Highlight */}
      <div
        ref={periodContainerRef}
        className="chart-period-selector"
        role="group"
        aria-label="Временной период графика"
      >
        {periodSurfaceStyle && (
          <span
            className="chart-period__surface"
            style={{
              transform: `translateX(${periodSurfaceStyle.left}px)`,
              width: `${periodSurfaceStyle.width}px`,
            }}
            aria-hidden="true"
          />
        )}
        {PERIOD_OPTIONS.map((opt) => {
          const isSelected = opt.id === period
          return (
            <button
              key={opt.id}
              type="button"
              data-period={opt.id}
              aria-pressed={isSelected}
              className={`chart-period-btn ${isSelected ? 'is-active' : ''}`}
              onClick={() => handlePeriodSelect(opt.id)}
            >
              {opt.label}
            </button>
          )
        })}
      </div>

      {/* Main Calm SVG Canvas */}
      <div
        ref={svgWrapRef}
        className="line-chart__canvas-wrap"
        onPointerDown={(e) => {
          handlePointerInteraction(e.clientX)
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) {
            handlePointerInteraction(e.clientX)
          }
        }}
      >
        {pointCoords.length === 0 ? (
          <div className="line-chart__empty-period" role="status">
            <span>Нет данных за выбранный период</span>
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
            preserveAspectRatio="none"
            aria-hidden="true"
            className="line-chart__svg"
          >
            {/* Subtle baseline */}
            <line
              x1={PAD_X}
              y1={PAD_Y_TOP + USABLE_HEIGHT}
              x2={SVG_WIDTH - PAD_X}
              y2={PAD_Y_TOP + USABLE_HEIGHT}
              className="line-chart__baseline"
            />

            {/* Vertical guide line on active point */}
            {activePoint && (
              <line
                x1={activePoint.x}
                y1={PAD_Y_TOP}
                x2={activePoint.x}
                y2={PAD_Y_TOP + USABLE_HEIGHT}
                className="line-chart__guide"
              />
            )}

            {/* Line path updates immediately */}
            {pointCoords.length > 1 && pathD && (
              <path d={pathD} className="line-chart__line" />
            )}

            {/* Decorative SVG dots without interactive or focusable descendants */}
            {pointCoords.map((pt, idx) => {
              const isActive = idx === safeIndex
              return (
                <circle
                  key={pt.item.id || `${period}-${idx}`}
                  cx={pt.x}
                  cy={pt.y}
                  r={isActive ? 5 : 3}
                  className={`line-chart__dot ${isActive ? 'is-active' : ''}`}
                />
              )
            })}
          </svg>
        )}
      </div>

      {/* Modest axis date bounds */}
      {pointCoords.length > 0 && (
        <div className="line-chart__labels" aria-hidden="true">
          <span>{firstDate}</span>
          {pointCoords.length > 1 && <span>{lastDate}</span>}
        </div>
      )}

      {/* Fixed readout under chart */}
      {activePoint && (
        <div className="chart-readout" role="region" aria-label="Выбранный замер">
          <div className="chart-readout__nav-row">
            <button
              type="button"
              className="chart-readout__nav-btn motion-pressable"
              onClick={handlePrev}
              disabled={safeIndex <= 0}
              aria-label="Предыдущий замер"
            >
              <ChevronLeft size={20} aria-hidden="true" />
            </button>

            <span className="chart-readout__date">{activePoint.dateTimeLabel}</span>

            <button
              type="button"
              className="chart-readout__nav-btn motion-pressable"
              onClick={handleNext}
              disabled={safeIndex >= pointCoords.length - 1}
              aria-label="Следующий замер"
            >
              <ChevronRight size={20} aria-hidden="true" />
            </button>
          </div>

          <div className="chart-readout__data-row">
            <strong className="chart-readout__val">
              {formatDecimal(activePoint.value, 1)} кг
            </strong>
            {activePoint.item.provenanceLabel && (
              <span className="chart-readout__provenance">
                {activePoint.item.provenanceLabel}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Accessible measurement list disclosure */}
      {pointCoords.length > 0 && (
        <div className="chart-data-disclosure">
          <button
            type="button"
            className="chart-data-disclosure__btn motion-pressable"
            onClick={() => setIsListExpanded((prev) => !prev)}
            aria-expanded={isListExpanded}
            aria-controls="chart-data-list"
          >
            <span>
              {isListExpanded
                ? 'Скрыть список замеров'
                : `Все замеры за период (${activeMeasurements.length})`}
            </span>
            {isListExpanded ? (
              <ChevronUp size={16} aria-hidden="true" />
            ) : (
              <ChevronDown size={16} aria-hidden="true" />
            )}
          </button>

          {isListExpanded && (
            <ul id="chart-data-list" className="chart-data-list" role="list">
              {pointCoords.map((pt, idx) => {
                const isSelected = idx === safeIndex
                return (
                  <li key={pt.item.id || `${period}-${idx}`} className="chart-data-list__item">
                    <button
                      type="button"
                      className={`chart-data-list__btn motion-pressable ${
                        isSelected ? 'is-selected' : ''
                      }`}
                      onClick={() => {
                        void haptics.selection()
                        setActivePointIndex(idx)
                      }}
                      aria-pressed={isSelected}
                      aria-label={`${pt.dateTimeLabel}: ${formatDecimal(pt.value, 1)} кг, ${
                        pt.item.provenanceLabel || 'Внесено вручную'
                      }`}
                    >
                      <span className="chart-data-list__date">{pt.dateTimeLabel}</span>
                      <div className="chart-data-list__right">
                        <strong className="chart-data-list__val">
                          {formatDecimal(pt.value, 1)} кг
                        </strong>
                        <span className="chart-data-list__source">
                          {pt.item.provenanceLabel || 'Внесено вручную'}
                        </span>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
