import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Trainer } from '../types/domain'
import { ButtonLink } from './ui'

function getInitial(name: string): string {
  const trimmed = name.trim()
  return trimmed.length > 0 ? trimmed[0].toUpperCase() : 'Р'
}

function capitalizeFirst(text: string): string {
  if (!text) return ''
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function normalizeSpecialty(tag: string): string {
  const lower = tag.trim().toLowerCase()
  if (lower.includes('набор мышечной массы') || lower.includes('набор массы')) {
    return 'Набор массы'
  }
  if (lower.includes('силовые тренировки') || lower === 'силовые') {
    return 'Силовые'
  }
  if (lower.includes('рекомпозиция')) {
    return 'Рекомпозиция'
  }
  if (lower.includes('похудение')) {
    return 'Похудение'
  }
  if (lower.includes('выносливость')) {
    return 'Выносливость'
  }
  if (lower.includes('триатлон')) {
    return 'Триатлон'
  }
  if (lower.includes('трейлы')) {
    return 'Трейлы'
  }
  if (lower.includes('бег')) {
    return 'Бег'
  }
  return capitalizeFirst(tag.trim())
}

export function TrainerAvatar({
  trainer,
  className = '',
}: {
  trainer: Trainer
  className?: string
}) {
  const initial = getInitial(trainer.name)
  return (
    <div
      className={`trainer-avatar trainer-avatar--${trainer.id} ${className}`}
      aria-label={`Аватар: ${trainer.name}`}
      aria-hidden="true"
    >
      <span className="trainer-avatar__initial">{initial}</span>
    </div>
  )
}

export function TrainerCard({ trainer }: { trainer: Trainer }) {
  const normalizedTags = trainer.specialties.map(normalizeSpecialty)
  const visibleTags = normalizedTags.slice(0, 3)
  const extraCount = normalizedTags.length - visibleTags.length

  return (
    <div className="trainer-card" role="region" aria-label={`Тренер ${trainer.name}`}>
      {/* 1. Upper informational & profile navigation area */}
      <Link
        to={`/trainers/${trainer.id}`}
        className="trainer-card__header"
        aria-label={`Открыть профиль тренера ${trainer.name}`}
      >
        <TrainerAvatar trainer={trainer} />
        <div className="trainer-card__identity">
          <span className="trainer-card__role">ТРЕНЕР</span>
          <h2 className="trainer-card__name">{trainer.name}</h2>
        </div>
        <div className="trainer-card__arrow" aria-hidden="true">
          <ChevronRight size={18} strokeWidth={2.5} />
        </div>
      </Link>

      {/* 2. Compact functional specialties tags */}
      <div className="trainer-card__specialties">
        <ul className="tag-list" aria-label={`Специализации: ${trainer.name}`}>
          {visibleTags.map((specialty) => (
            <li key={specialty} className="tag-item">
              {specialty}
            </li>
          ))}
          {extraCount > 0 && (
            <li className="tag-item tag-item--more">
              <Link
                to={`/trainers/${trainer.id}`}
                className="tag-item__link"
                title={`Посмотреть ещё ${extraCount} направления в профиле`}
                aria-label={`Ещё ${extraCount} направления в профиле`}
              >
                +{extraCount}
              </Link>
            </li>
          )}
        </ul>
      </div>

      {/* 3. Thin architectural divider */}
      <div className="trainer-card__divider" role="separator" />

      {/* 4. Primary CTA: book with this trainer */}
      <ButtonLink
        to={`/schedule?trainer=${trainer.id}`}
        variant="primary"
        className="trainer-card__cta"
        aria-label={`Выбрать время тренировки с ${trainer.name}`}
      >
        Выбрать время
      </ButtonLink>
    </div>
  )
}
