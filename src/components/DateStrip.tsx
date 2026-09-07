import { useLayoutEffect, useRef, useState } from 'react'
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

  useLayoutEffect(() => {
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
  }, [selectedId, days])

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
