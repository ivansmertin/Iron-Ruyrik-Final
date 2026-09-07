import type { GymCapacity } from '../types/domain'

export function CapacityIndicator({ occupied, limit }: GymCapacity) {
  const free = Math.max(0, limit - occupied)
  const isFull = free === 0

  const statusNote = isFull
    ? 'Все места заняты · Только текущие записи'
    : occupied === 0
      ? `Все ${limit} мест свободны`
      : free === 1
        ? 'Осталось 1 место'
        : free <= 4
          ? `Осталось ${free} места`
          : `Осталось ${free} мест`

  return (
    <div
      className={`capacity-section ${isFull ? 'is-full' : ''}`}
      role="region"
      aria-label={`Сейчас в зале: ${occupied} из ${limit} человек, ${statusNote}`}
    >
      <div className="capacity-section__header">
        <span className="eyebrow capacity-section__eyebrow">СЕЙЧАС В ЗАЛЕ</span>
      </div>

      <div className="capacity-section__hero">
        <div className="capacity-section__metric">
          <strong className="capacity-section__occupied">{occupied}</strong>
          <span className="capacity-section__divider" aria-hidden="true">/</span>
          <span className="capacity-section__limit">{limit}</span>
        </div>

        {/* 8 Discrete Athletic Segments */}
        <div className="capacity-segments" aria-hidden="true">
          {Array.from({ length: limit }, (_, index) => {
            const isOccupied = index < occupied
            return (
              <span
                key={index}
                className={`capacity-segment ${isOccupied ? 'is-filled' : 'is-empty'} ${isFull ? 'is-full-segment' : ''}`}
              />
            )
          })}
        </div>
      </div>

      <p className="capacity-section__note">{statusNote}</p>
    </div>
  )
}
