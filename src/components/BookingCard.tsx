import { AlertCircle, CheckCircle2, ChevronRight } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { ButtonLink, Card } from './ui'
import type { Booking, TimeSlot } from '../types/domain'

interface BookingCardProps {
  booking: Booking | null
  nextSlot?: TimeSlot | null
}

export function BookingCard({ booking, nextSlot }: BookingCardProps) {
  const navigate = useNavigate()

  // 1. Пользователь уже записан
  if (booking) {
    const isToday = booking.dateLabel.toLowerCase().includes('сегодня')
    const eyebrowText = isToday ? 'СЕГОДНЯ' : booking.dateLabel.toUpperCase()

    return (
      <Card
        className="main-card main-card--booked"
        onClick={() => navigate(`/booking/${booking.id}`)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            navigate(`/booking/${booking.id}`)
          }
        }}
        aria-label={`Ваша тренировка: ${booking.title}, ${eyebrowText} с ${booking.startAt} до ${booking.endAt}. Нажмите для подробностей.`}
      >
        <div className="main-card__top">
          <span className="eyebrow card-eyebrow">{eyebrowText}</span>
          <Link
            to={`/booking/${booking.id}`}
            className="card-subaction"
            onClick={(e) => e.stopPropagation()}
            aria-label="Подробнее о тренировке"
          >
            <span>Подробнее</span>
            <ChevronRight size={14} />
          </Link>
        </div>

        <div className="main-card__time-row">
          <p className="main-card__time">{booking.startAt}–{booking.endAt}</p>
        </div>

        <div className="main-card__info">
          <h2 className="main-card__title">{booking.title}</h2>
          <p className="main-card__meta">
            {booking.trainerName ?? 'Самостоятельно'} · 60 мин
          </p>
        </div>

        <div className="main-card__footer">
          <div className="booked-badge">
            <CheckCircle2 size={15} />
            <span>Вы записаны</span>
          </div>
          <Link
            to="/schedule"
            className="card-secondary-link"
            onClick={(e) => e.stopPropagation()}
          >
            Другое время ›
          </Link>
        </div>
      </Card>
    )
  }

  // 2. Пользователь еще не записан (есть свободные места)
  if (nextSlot && nextSlot.occupied < nextSlot.capacity && !nextSlot.isBlocked) {
    const free = nextSlot.capacity - nextSlot.occupied
    const isToday = nextSlot.dateLabel.toLowerCase().includes('сегодня')
    const eyebrowText = isToday ? 'СЕГОДНЯ' : nextSlot.dateLabel.toUpperCase()

    return (
      <Card className="main-card main-card--actionable">
        <div className="main-card__top">
          <span className="eyebrow card-eyebrow">{eyebrowText}</span>
          <span className="card-seats-badge">
            {free === 1 ? 'Осталось 1 место' : `Свободно ${free} из ${nextSlot.capacity}`}
          </span>
        </div>

        <div className="main-card__time-row">
          <p className="main-card__time">{nextSlot.startAt}–{nextSlot.endAt}</p>
        </div>

        <div className="main-card__info">
          <h2 className="main-card__title">Силовая тренировка</h2>
          <p className="main-card__meta">Ваня · 60 мин</p>
        </div>

        <div className="main-card__actions">
          <ButtonLink
            to={`/booking/${nextSlot.id}`}
            className="button--primary button--dominant"
          >
            Записаться
          </ButtonLink>
          <Link to="/schedule" className="card-secondary-link">
            Другое время ›
          </Link>
        </div>
      </Card>
    )
  }

  // 3. Нет свободных мест
  if (nextSlot && (nextSlot.occupied >= nextSlot.capacity || nextSlot.isBlocked)) {
    const isToday = nextSlot.dateLabel.toLowerCase().includes('сегодня')
    const eyebrowText = isToday ? 'СЕГОДНЯ' : nextSlot.dateLabel.toUpperCase()

    return (
      <Card className="main-card main-card--full">
        <div className="main-card__top">
          <span className="eyebrow card-eyebrow">{eyebrowText}</span>
          <span className="card-seats-badge is-full">Мест нет</span>
        </div>

        <div className="main-card__time-row">
          <p className="main-card__time main-card__time--muted">{nextSlot.startAt}–{nextSlot.endAt}</p>
        </div>

        <div className="main-card__info">
          <h2 className="main-card__title">Силовая тренировка</h2>
          <p className="main-card__meta">Ваня · 60 мин</p>
        </div>

        <div className="main-card__actions">
          <div className="full-badge-row">
            <AlertCircle size={14} />
            <span>На этот интервал все места заняты</span>
          </div>
          <ButtonLink to="/schedule" variant="secondary" className="button--secondary button--dominant">
            Другое время
          </ButtonLink>
        </div>
      </Card>
    )
  }

  // 4. Нет ближайшей тренировки
  return (
    <Card className="main-card main-card--empty">
      <div className="main-card__top">
        <span className="eyebrow card-eyebrow">БЛИЖАЙШАЯ ТРЕНИРОВКА</span>
      </div>

      <div className="main-card__info" style={{ margin: '8px 0 16px' }}>
        <h2 className="main-card__title">Ближайшая тренировка пока не выбрана</h2>
        <p className="main-card__meta">Выберите удобный день и свободное время в зале</p>
      </div>

      <div className="main-card__actions">
        <ButtonLink to="/schedule" className="button--primary button--dominant">
          Найти время
        </ButtonLink>
      </div>
    </Card>
  )
}

