import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ScheduleDay } from '../types/domain'
import { haptics } from '../services/haptics'

export function DateStrip({
  days,
  selectedId,
  onSelect,
}: {
  days: ScheduleDay[]
  selectedId: string
  onSelect: (id: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [indicatorStyle, setIndicatorStyle] = useState<{ left: number; width: number } | null>(null)

  const updateIndicator = useCallback(() => {
    if (!containerRef.current) return
    const activeBtn = containerRef.current.querySelector(
      '.date-strip__item.is-active'
    ) as HTMLElement | null

    if (activeBtn) {
      setIndicatorStyle({
        left: activeBtn.offsetLeft,
        width: activeBtn.offsetWidth,
      })
    }
  }, [])

  useLayoutEffect(() => {
    updateIndicator()
    if (!containerRef.current) return
    const activeBtn = containerRef.current.querySelector(
      '.date-strip__item.is-active'
    ) as HTMLElement | null

    if (activeBtn && typeof activeBtn.scrollIntoView === 'function') {
      activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
  }, [selectedId, days, updateIndicator])

  useEffect(() => {
    if (!containerRef.current) return

    let ro: ResizeObserver | null = null
    if (typeof window !== 'undefined' && 'ResizeObserver' in window) {
      ro = new ResizeObserver(() => {
        updateIndicator()
      })
      ro.observe(containerRef.current)
    }

    const onWindowResize = () => updateIndicator()
    window.addEventListener('resize', onWindowResize, { passive: true })

    if (typeof document !== 'undefined' && 'fonts' in document) {
      void document.fonts.ready.then(() => {
        updateIndicator()
      })
    }

    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', onWindowResize)
    }
  }, [updateIndicator])

  const handleSelect = (id: string) => {
    if (id !== selectedId) {
      void haptics.selection()
      onSelect(id)
    }
  }

  return (
    <div
      ref={containerRef}
      className="date-strip"
      role="group"
      aria-label="Выбор даты записи"
    >
      {indicatorStyle && (
        <span
          className="date-strip__selection-surface"
          style={{
            transform: `translateX(${indicatorStyle.left}px)`,
            width: `${indicatorStyle.width}px`,
          }}
          aria-hidden="true"
        />
      )}
      {days.map((day) => {
        const isSelected = day.id === selectedId
        return (
          <button
            key={day.id}
            type="button"
            aria-pressed={isSelected}
            className={`date-strip__item ${isSelected ? 'is-active' : ''}`}
            onClick={() => handleSelect(day.id)}
            aria-label={`${day.weekday}, ${day.day} ${day.monthLabel}`}
          >
            <span className="date-strip__weekday">{day.weekday}</span>
            <strong className="date-strip__day">{day.day}</strong>
          </button>
        )
      })}
    </div>
  )
}
