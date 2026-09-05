import { useState } from 'react'
import type { Measurement } from '../types/domain'
import { formatDecimal, formatDateRu } from '../utils/formatters'

interface ProgressLineChartProps {
  measurements: Measurement[]
}

export function ProgressLineChart({ measurements }: ProgressLineChartProps) {
  const [activePointIndex, setActivePointIndex] = useState<number | null>(null)

  if (!measurements || measurements.length === 0) {
    return (
      <div className="line-chart line-chart--empty" role="status">
        <p className="line-chart__empty-text">Пока нет данных о весе</p>
      </div>
    )
  }

  const values = measurements.map((item) => item.weight)
  const valMin = Math.min(...values)
  const valMax = Math.max(...values)
  const diff = valMax - valMin
  const buffer = diff === 0 ? 1.0 : Math.max(0.6, diff * 0.25)
  const yMin = valMin - buffer
  const yMax = valMax + buffer
  const range = yMax - yMin || 1

  const svgWidth = 300
  const svgHeight = 84
  const padX = 16
  const usableWidth = svgWidth - padX * 2
  const count = measurements.length

  const pointCoords = measurements.map((item, index) => {
    const x = count === 1 ? svgWidth / 2 : padX + index * (usableWidth / (count - 1))
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

  const pointsPolyline = pointCoords.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

  const firstDate = formatDateRu(measurements[0].date, 'short')
  const lastDate = formatDateRu(measurements[measurements.length - 1].date, 'short')
  const activePoint = activePointIndex !== null ? pointCoords[activePointIndex] : null

  return (
    <div
      className="line-chart"
      role="region"
      aria-label={`График изменения веса с ${firstDate} по ${lastDate}`}
      onClick={(e) => {
        // Dismiss tooltip if clicking outside points
        if ((e.target as HTMLElement).tagName !== 'circle') {
          setActivePointIndex(null)
        }
      }}
    >
      <div className="line-chart__canvas-wrap">
        {/* Interactive Floating Tooltip */}
        {activePoint && (
          <div
            className="line-chart__tooltip"
            style={{
              left: `${(activePoint.x / svgWidth) * 100}%`,
              top: `${(activePoint.y / svgHeight) * 100}%`,
            }}
            role="status"
          >
            <span className="line-chart__tooltip-date">{activePoint.fullDate}</span>
            <strong className="line-chart__tooltip-val">
              {formatDecimal(activePoint.value, 1)} кг
            </strong>
            {activePoint.item.provenanceLabel && (
              <span className="line-chart__tooltip-source">{activePoint.item.provenanceLabel}</span>
            )}
          </div>
        )}

        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          preserveAspectRatio="none"
          aria-hidden="true"
          className="line-chart__svg"
        >
          {/* Subtle baseline */}
          <line x1={padX} y1={72} x2={svgWidth - padX} y2={72} className="line-chart__baseline" />

          {/* Polyline connecting points if 2+ */}
          {count > 1 && <polyline points={pointsPolyline} className="line-chart__line" />}

          {/* Interactive circle points */}
          {pointCoords.map((pt, idx) => {
            const isActive = activePointIndex === idx
            return (
              <g key={pt.item.id || idx}>
                {/* Larger transparent touch area */}
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
                    setActivePointIndex(isActive ? null : idx)
                  }}
                  onMouseEnter={() => setActivePointIndex(idx)}
                  onFocus={() => setActivePointIndex(idx)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setActivePointIndex(isActive ? null : idx)
                    }
                  }}
                />

                {/* Visible dot */}
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isActive ? 5 : 3.5}
                  className={`line-chart__dot ${isActive ? 'is-active' : ''}`}
                />
              </g>
            )
          })}
        </svg>
      </div>

      {/* Date bounds */}
      <div className="line-chart__labels" aria-hidden="true">
        <span>{firstDate}</span>
        {count > 1 && <span>{lastDate}</span>}
      </div>
    </div>
  )
}
