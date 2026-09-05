import type { ScheduleDay } from '../types/domain'

export function DateStrip({
  days,
  selectedId,
  onSelect,
}: {
  days: ScheduleDay[]
  selectedId: string
  onSelect: (id: string) => void
}) {
  return (
    <div className="date-strip" role="tablist" aria-label="Выбор даты записи">
      {days.map((day) => {
        const isSelected = day.id === selectedId
        return (
          <button
            key={day.id}
            type="button"
            role="tab"
            aria-selected={isSelected}
            className={`date-strip__item ${isSelected ? 'is-active' : ''}`}
            onClick={() => onSelect(day.id)}
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
