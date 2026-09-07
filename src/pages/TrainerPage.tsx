import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, CalendarClock, Check } from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { TrainerAvatar } from '../components/TrainerCard'
import { ButtonLink, Card, LoadingPage, SectionHeader } from '../components/ui'
import { getScheduleData } from '../api/schedule'
import { getTrainers } from '../api/trainers'

export function TrainerPage() {
  const { id } = useParams()
  const trainersQuery = useQuery({ queryKey: ['trainers'], queryFn: getTrainers })
  const scheduleQuery = useQuery({ queryKey: ['schedule'], queryFn: getScheduleData })
  if (trainersQuery.isLoading || scheduleQuery.isLoading) return <LoadingPage label="Загружаем профиль тренера" />
  const trainer = trainersQuery.data?.find((item) => item.id === id)
  if (!trainer || !['dima', 'vanya'].includes(id ?? '')) return <Navigate to="/404" replace />
  const available = scheduleQuery.data?.slots.find((slot) => slot.occupied < slot.capacity && !slot.isBlocked)

  return (
    <div className="page trainer-detail-page">
      <Link to="/trainers" viewTransition className="back-link">
        <ArrowLeft size={19} /> Все тренеры
      </Link>
      <section className="trainer-hero">
        <TrainerAvatar
          trainer={trainer}
          style={{ viewTransitionName: `trainer-avatar-${trainer.id}` }}
        />
        <div>
          <p className="eyebrow">Тренер</p>
          <h1 style={{ viewTransitionName: `trainer-name-${trainer.id}` }}>
            {trainer.name}
          </h1>
          <ul className="tag-list">
            {trainer.specialties.slice(0, 3).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>
      <ButtonLink
        to={`/schedule?trainer=${trainer.id}`}
        viewTransition
      >
        Записаться к {trainer.name}
      </ButtonLink>
      <Card className="trainer-about">
        <SectionHeader title="О тренере" />
        <p>{trainer.about}</p>
        <h3>Направления</h3>
        <ul className="direction-list">
          {trainer.specialties.map((item) => <li key={item}><Check size={18} /> {item}</li>)}
        </ul>
      </Card>

      {trainer.id === 'dima' && (
        <Card className="trainer-channel-card">
          <div className="trainer-channel-card__head">
            <div className="trainer-channel-card__icon" aria-hidden="true">
              <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.52 2.77-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .37z" />
              </svg>
            </div>
            <div>
              <span className="eyebrow" style={{ color: 'var(--brand-yellow)', marginBottom: 0 }}>Telegram-канал</span>
              <strong style={{ display: 'block', fontSize: '1rem', color: 'var(--text-primary)' }}>Говер на движениях</strong>
            </div>
          </div>
          <p style={{ margin: '8px 0 12px', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            Авторский блог о спорте, триатлоне, забегах и подготовке атлетов в Великом Новгороде.
          </p>
          <a
            href="https://t.me/goverrun"
            target="_blank"
            rel="noopener noreferrer"
            className="button button--secondary"
            style={{ width: '100%', minHeight: '40px', gap: '8px' }}
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.52 2.77-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .37z" />
            </svg>
            <span>Перейти в @goverrun</span>
          </a>
        </Card>
      )}

      {available && (

        <Card className="next-slot-card">
          <CalendarClock size={24} />
          <div><span>Ближайшее свободное время</span><strong>{available.dateLabel}, {available.startAt}–{available.endAt}</strong></div>
          <ButtonLink to={`/booking/${available.id}?trainer=${trainer.id}`} variant="secondary">Выбрать</ButtonLink>
        </Card>
      )}
    </div>
  )
}
