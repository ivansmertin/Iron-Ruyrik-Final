import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { cleanSpecialty } from '../utils/formatters'
import type { Trainer } from '../types/domain'
import { ButtonLink } from './ui'

function getInitial(name: string): string {
  const trimmed = name.trim()
  return trimmed.length > 0 ? trimmed[0].toUpperCase() : 'Р'
}

export function TrainerAvatar({
  trainer,
  className = '',
  style,
}: {
  trainer: Trainer
  className?: string
  style?: React.CSSProperties
}) {
  const initial = getInitial(trainer.name)
  return (
    <div
      className={`trainer-avatar trainer-avatar--${trainer.id} ${className}`}
      style={style}
      aria-hidden="true"
    >
      <span className="trainer-avatar__initial">{initial}</span>
    </div>
  )
}

export function TrainerCard({ trainer }: { trainer: Trainer }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const specialties = trainer.specialties.map(cleanSpecialty).filter(Boolean)
  const hasMultiple = specialties.length > 3
  const visibleSpecialties = hasMultiple && !isExpanded ? specialties.slice(0, 3) : specialties
  const specialtiesListId = `trainer-specs-${trainer.id}`

  return (
    <article className="trainer-entity trainer-card" aria-label={`Тренер ${trainer.name}`}>
      {/* 1. Upper Identity Link (Navigates to Trainer Profile) */}
      <Link
        to={`/trainers/${trainer.id}`}
        viewTransition
        className="trainer-entity__identity-link motion-pressable"
        aria-label={`Профиль тренера ${trainer.name}`}
      >
        <TrainerAvatar
          trainer={trainer}
          style={{ viewTransitionName: `trainer-avatar-${trainer.id}` }}
        />
        <div className="trainer-entity__identity-text">
          <span className="trainer-entity__role">ТРЕНЕР</span>
          <h2
            className="trainer-entity__name"
            style={{ viewTransitionName: `trainer-name-${trainer.id}` }}
          >
            {trainer.name}
          </h2>
        </div>
        <div className="trainer-entity__arrow" aria-hidden="true">
          <ChevronRight size={20} strokeWidth={2.5} />
        </div>
      </Link>

      {/* 2. Content: Specialties editorial list */}
      {specialties.length > 0 && (
        <div className="trainer-entity__specialties">
          <ul
            id={specialtiesListId}
            className="trainer-entity__spec-list"
            aria-label={`Направления: ${trainer.name}`}
          >
            {visibleSpecialties.map((spec) => (
              <li key={spec} className="trainer-entity__spec-item">
                <span className="trainer-entity__bullet" aria-hidden="true">·</span>
                <span>{spec}</span>
              </li>
            ))}
          </ul>
          {hasMultiple && (
            <button
              type="button"
              className="trainer-entity__disclosure-btn"
              aria-expanded={isExpanded}
              aria-controls={specialtiesListId}
              onClick={() => setIsExpanded((prev) => !prev)}
            >
              <span>{isExpanded ? 'Свернуть' : `Все направления (${specialties.length})`}</span>
            </button>
          )}
        </div>
      )}

      {/* 3. Sibling Action: Schedule booking (Navigates to Schedule with Trainer Filter) */}
      <div className="trainer-entity__actions">
        <ButtonLink
          to={`/schedule?trainer=${trainer.id}`}
          viewTransition
          variant="secondary"
          className="trainer-entity__schedule-btn"
          aria-label={`Выбрать время тренировки с ${trainer.name}`}
        >
          Выбрать время
        </ButtonLink>
      </div>
    </article>
  )
}
