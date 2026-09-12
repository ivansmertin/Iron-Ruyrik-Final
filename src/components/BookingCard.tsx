import { useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ButtonLink } from './ui'
import type { Booking, TimeSlot } from '../types/domain'
import { MOTION_DURATIONS } from '../utils/motion'
import { formatHeroSemanticDate, pluralize } from '../utils/formatters'

interface BookingCardProps {
  booking: Booking | null
  nextSlot?: TimeSlot | null
  isScheduleError?: boolean
  onRetrySchedule?: () => void
}

function calculateDurationMinutes(startAt?: string, endAt?: string): number {
  if (!startAt || !endAt) return 60
  const [startH, startM] = startAt.split(':').map(Number)
  const [endH, endM] = endAt.split(':').map(Number)
  if (Number.isFinite(startH) && Number.isFinite(startM) && Number.isFinite(endH) && Number.isFinite(endM)) {
    const diff = (endH * 60 + endM) - (startH * 60 + startM)
    if (diff > 0) return diff
  }
  return 60
}

export function BookingCard({
  booking,
  nextSlot,
  isScheduleError = false,
  onRetrySchedule,
}: BookingCardProps) {
  const currentTimeString = booking
    ? `${booking.startAt}–${booking.endAt}`
    : nextSlot
      ? `${nextSlot.startAt}–${nextSlot.endAt}`
      : ''

  const prevTimeStringRef = useRef<string | null>(null)
  const [isTimeFlipped, setIsTimeFlipped] = useState(false)

  useEffect(() => {
    if (prevTimeStringRef.current !== null && prevTimeStringRef.current !== currentTimeString) {
      prevTimeStringRef.current = currentTimeString
      setIsTimeFlipped(true)
      const t = setTimeout(() => setIsTimeFlipped(false), MOTION_DURATIONS.ui)
      return () => clearTimeout(t)
    }
    prevTimeStringRef.current = currentTimeString
  }, [currentTimeString])

  // 1. Пользователь уже записан (Booked State)
  if (booking) {
    const semanticDate = formatHeroSemanticDate(booking.date) || booking.dateLabel
    const duration = calculateDurationMinutes(booking.startAt, booking.endAt)

    return (
      <div
        className="hero-workout hero-workout--booked main-card--booked"
        role="region"
        aria-label={`Ваша тренировка: ${booking.title}, ${semanticDate} с ${booking.startAt} до ${booking.endAt}`}
      >
        <div className="hero-workout__header">
          <span className="eyebrow hero-workout__eyebrow hero-workout__eyebrow--confirmed">
            <CheckCircle2 size={13} aria-hidden="true" />
            <span>{semanticDate} · ЗАПИСЬ ПОДТВЕРЖДЕНА</span>
          </span>
        </div>

        <div className="hero-workout__time-wrap">
          <p
            className={`hero-workout__time ${isTimeFlipped ? 'time-digit-flip' : ''}`}
            style={{ viewTransitionName: 'hero-slot-time' }}
          >
            {booking.startAt}–{booking.endAt}
          </p>
        </div>

        <div className="hero-workout__details">
          <h2 className="hero-workout__title">{booking.title}</h2>
          <p className="hero-workout__meta">
            {booking.trainerName ?? 'Самостоятельно'} · {duration} мин
          </p>
        </div>

        <div className="hero-workout__actions">
          <ButtonLink
            to={`/booking/${booking.id}`}
            viewTransition
            className="button--primary button--dominant hero-workout__cta"
          >
            Подробнее
          </ButtonLink>
          <Link
            to="/schedule"
            viewTransition
            className="card-secondary-link hero-workout__secondary-link"
          >
            Другое время →
          </Link>
        </div>
      </div>
    )
  }

  // 2. Ошибка загрузки расписания (когда активной записи нет)
  if (isScheduleError) {
    return (
      <div
        className="hero-workout hero-workout--error"
        role="region"
        aria-label="Ошибка загрузки расписания"
      >
        <div className="hero-workout__header">
          <span className="eyebrow hero-workout__eyebrow">БЛИЖАЙШАЯ ТРЕНИРОВКА</span>
        </div>

        <div className="hero-workout__details hero-workout__details--empty">
          <div className="hero-workout__notice hero-workout__notice--error" role="status">
            <AlertCircle size={16} aria-hidden="true" />
            <span>Не удалось загрузить расписание</span>
          </div>
          <p className="hero-workout__meta">
            Проверьте соединение с интернетом и попробуйте обновить
          </p>
        </div>

        <div className="hero-workout__actions">
          {onRetrySchedule ? (
            <button
              type="button"
              className="button button--primary button--dominant hero-workout__cta"
              onClick={onRetrySchedule}
            >
              Повторить
            </button>
          ) : (
            <ButtonLink
              to="/schedule"
              viewTransition
              className="button--primary button--dominant hero-workout__cta"
            >
              Перейти к расписанию
            </ButtonLink>
          )}
        </div>
      </div>
    )
  }

  // 3. Пользователь еще не записан (есть свободные места)
  if (nextSlot && nextSlot.occupied < nextSlot.capacity && !nextSlot.isBlocked) {
    const free = nextSlot.capacity - nextSlot.occupied
    const semanticDate = formatHeroSemanticDate(nextSlot.date, nextSlot.startIso) || nextSlot.dateLabel
    const capacityText = `${free} ${pluralize(free, 'место', 'места', 'мест')} на тренировку`
    const duration = calculateDurationMinutes(nextSlot.startAt, nextSlot.endAt)

    return (
      <div className="hero-workout hero-workout--available">
        <div className="hero-workout__header">
          <span className="eyebrow hero-workout__eyebrow">{semanticDate}</span>
          <span className="hero-workout__capacity-hint">{capacityText}</span>
        </div>

        <div className="hero-workout__time-wrap">
          <p
            className={`hero-workout__time ${isTimeFlipped ? 'time-digit-flip' : ''}`}
            style={{ viewTransitionName: 'hero-slot-time' }}
          >
            {nextSlot.startAt}–{nextSlot.endAt}
          </p>
        </div>

        <div className="hero-workout__details">
          <h2 className="hero-workout__title">Тренировка в зале</h2>
          <p className="hero-workout__meta">{duration} мин · Тренер или самостоятельно</p>
        </div>

        <div className="hero-workout__actions">
          <ButtonLink
            to={`/booking/${nextSlot.id}`}
            viewTransition
            className="button--primary button--dominant hero-workout__cta"
          >
            Записаться
          </ButtonLink>
          <Link
            to="/schedule"
            viewTransition
            className="card-secondary-link hero-workout__secondary-link"
          >
            Другое время →
          </Link>
        </div>
      </div>
    )
  }

  // 4. Нет свободных мест
  if (nextSlot && (nextSlot.occupied >= nextSlot.capacity || nextSlot.isBlocked)) {
    const semanticDate = formatHeroSemanticDate(nextSlot.date, nextSlot.startIso) || nextSlot.dateLabel
    const duration = calculateDurationMinutes(nextSlot.startAt, nextSlot.endAt)

    return (
      <div className="hero-workout hero-workout--full">
        <div className="hero-workout__header">
          <span className="eyebrow hero-workout__eyebrow">{semanticDate}</span>
          <span className="hero-workout__capacity-hint hero-workout__capacity-hint--full">
            Мест нет
          </span>
        </div>

        <div className="hero-workout__time-wrap">
          <p
            className={`hero-workout__time hero-workout__time--muted ${isTimeFlipped ? 'time-digit-flip' : ''}`}
            style={{ viewTransitionName: 'hero-slot-time' }}
          >
            {nextSlot.startAt}–{nextSlot.endAt}
          </p>
        </div>

        <div className="hero-workout__details">
          <h2 className="hero-workout__title">Тренировка в зале</h2>
          <p className="hero-workout__meta">{duration} мин</p>
        </div>

        <div className="hero-workout__actions">
          <div className="hero-workout__notice" role="status">
            <AlertCircle size={14} aria-hidden="true" />
            <span>На этот интервал все места заняты</span>
          </div>
          <ButtonLink
            to="/schedule"
            viewTransition
            variant="secondary"
            className="button--secondary button--dominant hero-workout__cta"
          >
            Другое время
          </ButtonLink>
        </div>
      </div>
    )
  }

  // 5. Нет ближайшей тренировки (Empty State)
  return (
    <div className="hero-workout hero-workout--empty">
      <div className="hero-workout__header">
        <span className="eyebrow hero-workout__eyebrow">БЛИЖАЙШАЯ ТРЕНИРОВКА</span>
      </div>

      <div className="hero-workout__details hero-workout__details--empty">
        <h2 className="hero-workout__title">Пока ничего не выбрано</h2>
        <p className="hero-workout__meta">Выберите удобный день и свободное время в зале</p>
      </div>

      <div className="hero-workout__actions">
        <ButtonLink
          to="/schedule"
          viewTransition
          className="button--primary button--dominant hero-workout__cta"
        >
          Найти время
        </ButtonLink>
      </div>
    </div>
  )
}
