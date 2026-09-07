import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { haptics } from '../services/haptics'
import type { Measurement } from '../types/domain'
import { formatDecimal, formatDateRu } from '../utils/formatters'

export type ChartPeriod = '7d' | '30d' | '3m' | '1y'

const PERIOD_OPTIONS: { id: ChartPeriod; label: string; days: number }[] = [
  { id: '7d', label: '7д', days: 7 },
  { id: '30d', label: '30д', days: 30 },
  { id: '3m', label: '3м', days: 90 },
  { id: '1y', label: '1г', days: 365 },
]

const SAMPLE_COUNT = 32
const SVG_WIDTH = 300
const SVG_HEIGHT = 84
const PAD_X = 16
const USABLE_WIDTH = SVG_WIDTH - PAD_X * 2

interface ProgressLineChartProps {
  measurements: Measurement[]
  onPeriodChange?: (period: ChartPeriod, filtered: Measurement[]) => void
}

export function ProgressLineChart({ measurements, onPeriodChange }: ProgressLineChartProps) {
  const [period, setPeriod] = useState<ChartPeriod>('30d')
  const [activePointIndex, setActivePointIndex] = useState<number | null>(null)

  // Sliding surface indicator for period buttons
  const periodContainerRef = useRef<HTMLDivElement>(null)
  const [periodSurfaceStyle, setPeriodSurfaceStyle] = useState<{ left: number; width: number } | null>(null)

  // Chronologically sorted measurements
  const sortedMeasurements = useMemo(() => {
    if (!measurements || measurements.length === 0) return []
    return [...measurements].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    )
  }, [measurements])

  // Filter measurements strictly based on active period relative to current time
  const activeMeasurements = useMemo(() => {
    if (!sortedMeasurements || sortedMeasurements.length === 0) return []
    const now = Date.now()
    const option = PERIOD_OPTIONS.find((p) => p.id === period)
    const windowDays = option ? option.days : 30
    const cutoff = now - windowDays * 24 * 60 * 60 * 1000

    return sortedMeasurements.filter(
      (m) => new Date(m.date).getTime() >= cutoff
    )
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

  // Point coordinates calculation
  const pointCoords = useMemo(() => {
    if (activeMeasurements.length === 0) return []

    const values = activeMeasurements.map((item) => item.weight)
    const valMin = Math.min(...values)
    const valMax = Math.max(...values)
    const diff = valMax - valMin
    const buffer = diff === 0 ? 1.0 : Math.max(0.6, diff * 0.25)
    const yMin = valMin - buffer
    const yMax = valMax + buffer
    const range = yMax - yMin || 1

    const count = activeMeasurements.length

    return activeMeasurements.map((item, index) => {
      const x = count === 1 ? SVG_WIDTH / 2 : PAD_X + index * (USABLE_WIDTH / (count - 1))
      const y = 70 - ((item.weight - yMin) / range) * 54
      return {
        x,
        y,
        item,
        value: item.weight,
        dateLabel: formatDateRu(item.date, 'short'),
        fullDate: formatDateRu(item.date, 'long'),
      }
    })
  }, [activeMeasurements])

  // Sample the curve uniformly so paths remain stable across data densities.
  const samplesY = useMemo(() => {
    if (pointCoords.length < 2) return null
    const samples: number[] = []

    for (let k = 0; k < SAMPLE_COUNT; k++) {
      const x = PAD_X + k * (USABLE_WIDTH / (SAMPLE_COUNT - 1))

      // Find the segment [ptA, ptB] containing x
      let idx = 0
      while (idx < pointCoords.length - 2 && pointCoords[idx + 1].x < x) {
        idx++
      }
      const ptA = pointCoords[idx]
      const ptB = pointCoords[idx + 1]

      const segmentWidth = ptB.x - ptA.x || 1
      const t = Math.max(0, Math.min(1, (x - ptA.x) / segmentWidth))
      const y = ptA.y + (ptB.y - ptA.y) * t
      samples.push(y)
    }

    return samples
  }, [pointCoords])

  // Generate the SVG path directly. Period changes stay interruptible and do not
  // force a React render on every animation frame in Android WebView.
  const pathD = useMemo(() => {
    if (!samplesY || samplesY.length === 0) return ''
    return samplesY
      .map((y, k) => {
        const x = PAD_X + k * (USABLE_WIDTH / (SAMPLE_COUNT - 1))
        return `${k === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
      })
      .join(' ')
  }, [samplesY])

  if (!measurements || measurements.length === 0) {
    return (
      <div className="line-chart line-chart--empty" role="status">
        <p className="line-chart__empty-text">Пока нет данных о весе</p>
      </div>
    )
  }

  const firstDate = pointCoords.length > 0 ? pointCoords[0].dateLabel : ''
  const lastDate = pointCoords.length > 1 ? pointCoords[pointCoords.length - 1].dateLabel : ''
  const activePoint =
    activePointIndex !== null && activePointIndex < pointCoords.length
      ? pointCoords[activePointIndex]
      : null

  const handlePeriodSelect = (nextPeriod: ChartPeriod) => {
    if (nextPeriod !== period) {
      void haptics.selection()
      setPeriod(nextPeriod)
      setActivePointIndex(null)
    }
  }

  return (
    <div
      className="line-chart"
      role="region"
      aria-label={`График изменения веса с ${firstDate} по ${lastDate}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).tagName !== 'circle') {
          setActivePointIndex(null)
        }
      }}
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

      {/* Main Interactive SVG Canvas */}
      <div className="line-chart__canvas-wrap">
        {pointCoords.length === 0 ? (
          <div className="line-chart__empty-period" role="status">
            <span>Нет данных за выбранный период</span>
          </div>
        ) : (
          <>
            {/* Floating tooltip snaps to the selected point for rapid exploration. */}
            {activePoint && (
              <div
                className="line-chart__tooltip-wrap"
                style={{
                  transform: `translate3d(${activePoint.x}px, ${activePoint.y}px, 0)`,
                }}
                role="status"
              >
                <div className="line-chart__tooltip">
                  <span className="line-chart__tooltip-date">{activePoint.fullDate}</span>
                  <strong className="line-chart__tooltip-val">
                    {formatDecimal(activePoint.value, 1)} кг
                  </strong>
                  {activePoint.item.provenanceLabel && (
                    <span className="line-chart__tooltip-source">
                      {activePoint.item.provenanceLabel}
                    </span>
                  )}
                </div>
              </div>
            )}

            <svg
              viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
              preserveAspectRatio="none"
              aria-hidden="true"
              className="line-chart__svg"
            >
          {/* Subtle baseline */}
          <line
            x1={PAD_X}
            y1={72}
            x2={SVG_WIDTH - PAD_X}
            y2={72}
            className="line-chart__baseline"
          />

          {/* Vertical Guide Line on Active Point */}
          {activePoint && (
            <line
              x1={activePoint.x}
              y1={10}
              x2={activePoint.x}
              y2={72}
              className="line-chart__guide"
            />
          )}

          {/* Line path updates immediately when the period changes. */}
          {pointCoords.length > 1 && pathD && (
            <path d={pathD} className="line-chart__line" />
          )}

          {/* Interactive Circle Points */}
          {pointCoords.map((pt, idx) => {
            const isActive = activePointIndex === idx
            return (
              <g key={pt.item.id || `${period}-${idx}`}>
                {/* Larger transparent touch target */}
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={16}
                  className="line-chart__touch-hit"
                  tabIndex={0}
                  role="button"
                  aria-label={`${pt.fullDate}: ${formatDecimal(pt.value, 1)} кг`}
                  onClick={(e) => {
                    e.stopPropagation()
                    void haptics.selection()
                    setActivePointIndex(isActive ? null : idx)
                  }}
                  onMouseEnter={() => {
                    setActivePointIndex(idx)
                  }}
                  onFocus={() => {
                    setActivePointIndex(idx)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      void haptics.selection()
                      setActivePointIndex(isActive ? null : idx)
                    }
                  }}
                />

                {/* Visible point */}
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isActive ? 5.5 : 3.5}
                  className={`line-chart__dot ${isActive ? 'is-active' : ''}`}
                />
              </g>
            )
          })}
        </svg>
        </>
        )}
      </div>

      {/* Date bounds update with the selected period. */}
      <div className="line-chart__labels" aria-hidden="true">
        <span>{firstDate}</span>
        {pointCoords.length > 1 && <span>{lastDate}</span>}
      </div>
    </div>
  )
}
