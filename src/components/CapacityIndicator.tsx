import { Lock, Users } from 'lucide-react'
import type { GymCapacity } from '../types/domain'

export function CapacityIndicator({ occupied, limit }: GymCapacity) {
  const free = Math.max(0, limit - occupied)
  const isFull = free === 0
  const isHigh = occupied >= 6 && !isFull

  const statusText = isFull
    ? 'Зал заполнен · Только текущие записи'
    : isHigh
      ? `Осталось ${free} ${free === 1 ? 'место' : 'места'} · Высокая загрузка`
      : `Свободно ${free} из ${limit} мест · До 8 человек одновременно`

  return (
    <div
      className={`capacity-widget ${isFull ? 'is-full' : ''}`}
      role="region"
      aria-label={`Сейчас в зале ${occupied} из ${limit} человек`}
    >
      <div className="capacity-widget__top">
        <span className="eyebrow capacity-widget__eyebrow">СЕЙЧАС В ЗАЛЕ</span>
        <span className={`capacity-widget__status-tag ${isFull ? 'is-full' : isHigh ? 'is-high' : 'is-free'}`}>
          {isFull ? <Lock size={11} aria-hidden="true" /> : <Users size={11} aria-hidden="true" />}
          <span>{isFull ? 'Заполнено' : `${free} свободно`}</span>
        </span>
      </div>

      <div className="capacity-widget__main">
        <div className="capacity-widget__num-block">
          <strong className="capacity-widget__current">{occupied}</strong>
          <span className="capacity-widget__total">из {limit}</span>
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

      <p className="capacity-widget__note">{statusText}</p>
    </div>
  )
}


