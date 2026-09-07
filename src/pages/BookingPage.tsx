import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  ShieldCheck,
  UsersRound,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { cancelBooking, createBooking, getBookings } from '../api/bookings'
import { getScheduleData } from '../api/schedule'
import { getTrainers } from '../api/trainers'
import { Button, ButtonLink, Card, LoadingPage, Modal } from '../components/ui'
import { useBookings } from '../features/bookings/BookingContext'
import type { Booking, BookingMode, Trainer } from '../types/domain'
import { formatDateRu } from '../utils/formatters'
import { safeStartViewTransition } from '../utils/viewTransitions'
import { haptics } from '../services/haptics'

function formatWorkoutDate(dateStr?: string, label?: string): string {
  if (!dateStr) return label ?? ''
  const formatted = formatDateRu(dateStr, 'long')
  const isToday = label?.toLowerCase().includes('сегодня')
  return isToday ? `Сегодня, ${formatted}` : formatted
}

function formatCapacity(freePlaces: number): string {
  if (freePlaces <= 0) return 'Все места заняты'
  const mod10 = freePlaces % 10
  const mod100 = freePlaces % 100
  if (mod100 >= 11 && mod100 <= 14) return `${freePlaces} мест свободно`
  if (mod10 === 1) return `${freePlaces} место свободно`
  if (mod10 >= 2 && mod10 <= 4) return `${freePlaces} места свободно`
  return `${freePlaces} мест свободно`
}

function getTrainerSubtitle(trainer: Trainer): string {
  if (trainer.id === 'dima') return 'Бег и выносливость'
  if (trainer.id === 'vanya') return 'Силовые тренировки'
  if (trainer.specialties && trainer.specialties.length > 0) {
    const text = trainer.specialties.slice(0, 2).join(', ')
    return text.charAt(0).toUpperCase() + text.slice(1)
  }
  return 'Персональная тренировка'
}

export function BookingPage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const queryClient = useQueryClient()

  const { data: scheduleData, isLoading: isScheduleLoading } = useQuery({
    queryKey: ['schedule'],
    queryFn: getScheduleData,
  })
  const bookingsQuery = useQuery({ queryKey: ['bookings'], queryFn: getBookings })
  const trainersQuery = useQuery({ queryKey: ['trainers'], queryFn: getTrainers })
  const { showNotice } = useBookings()

  const [showCancelModal, setShowCancelModal] = useState(false)
  const [createdBooking, setCreatedBooking] = useState<Booking | null>(null)
  const isMountedRef = useRef(true)
  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      if (confirmTimeoutRef.current) {
        clearTimeout(confirmTimeoutRef.current)
      }
    }
  }, [])

  const existingBooking =
    bookingsQuery.data?.find((b) => b.id === id || b.slotId === id) ??
    (createdBooking && (createdBooking.id === id || createdBooking.slotId === id)
      ? createdBooking
      : undefined)
  const slotId = existingBooking?.slotId ?? id
  const slot = scheduleData?.slots.find((item) => item.id === slotId)

  const suggestedTrainer = params.get('trainer')
  const initialMode: BookingMode =
    existingBooking?.trainerId ??
    (suggestedTrainer === 'dima' || suggestedTrainer === 'vanya' ? suggestedTrainer : 'self')
  const [mode, setMode] = useState<BookingMode>(initialMode)
  type ConfirmPhase = 'idle' | 'submitting' | 'confirmed'
  const [confirmPhase, setConfirmPhase] = useState<ConfirmPhase>('idle')

  const refresh = async () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['schedule'] }),
      queryClient.invalidateQueries({ queryKey: ['bookings'] }),
      queryClient.invalidateQueries({ queryKey: ['home'] }),
      queryClient.invalidateQueries({ queryKey: ['profile'] }),
    ])

  const createMutation = useMutation({
    mutationFn: () => createBooking(slot!, mode),
    onSuccess: (booking) => {
      void haptics.success()

      // Resolve micro-phase: Show confirmation state briefly (~350ms)
      // before committing query cache and transitioning into confirmed details view.
      if (isMountedRef.current) {
        setConfirmPhase('confirmed')
        confirmTimeoutRef.current = setTimeout(() => {
          queryClient.setQueryData<Booking[]>(['bookings'], (old) => {
            if (!old) return [booking]
            return [booking, ...old.filter((b) => b.id !== booking.id)]
          })
          void refresh()
          if (isMountedRef.current) {
            safeStartViewTransition(() => {
              setCreatedBooking(booking)
              setConfirmPhase('idle')
            })
          }
        }, 350)
      }
    },
    onError: () => {
      setConfirmPhase('idle')
    },
  })

  const handleConfirm = () => {
    if (!slot || confirmPhase !== 'idle') return
    setConfirmPhase('submitting')
    createMutation.mutate()
  }

  const cancelMutation = useMutation({
    mutationFn: () => cancelBooking(existingBooking!.id),
    onSuccess: async (cancelledBooking) => {
      void haptics.warning()
      showNotice('Запись отменена')
      setShowCancelModal(false)
      if (cancelledBooking) {
        setCreatedBooking(cancelledBooking)
      }
      queryClient.setQueryData<Booking[]>(['bookings'], (old) => {
        if (!old) return old
        return old.map((b) =>
          b.id === existingBooking!.id ? { ...b, status: 'cancelled' as const } : b,
        )
      })
      await refresh()
    },
  })

  const displayedBooking = cancelMutation.data ?? existingBooking

  if (isScheduleLoading || bookingsQuery.isLoading || trainersQuery.isLoading) {
    return <LoadingPage label="Загружаем детали тренировки" />
  }

  // If neither booking nor slot exists
  if (!existingBooking && !slot) {
    return (
      <div className="page training-details-page">
        <Link to="/schedule" className="back-link">
          <ArrowLeft size={18} aria-hidden="true" />
          <span>К расписанию</span>
        </Link>
        <Card className="empty-card">
          <h2>Запись не найдена</h2>
          <p>Возможно, выбранное время больше недоступно или было удалено.</p>
          <ButtonLink to="/schedule">К расписанию</ButtonLink>
        </Card>
      </div>
    )
  }

  // --- CONFIRMED / EXISTING BOOKING DETAILS VIEW ---
  if (existingBooking && confirmPhase !== 'confirmed') {
    const isCancelled = displayedBooking?.status === 'cancelled'

    // Compute timing and past status
    const startIso =
      slot?.startIso ?? `${existingBooking.date}T${existingBooking.startAt}:00+03:00`
    const startTime = new Date(startIso).getTime()
    const now = new Date().getTime()
    const minutesLeft = Math.round((startTime - now) / 60000)
    const isPast = minutesLeft <= 0
    const isCancellationWindowPassed = !isPast && minutesLeft < 240 // 4 hours rule

    const formattedDate = formatWorkoutDate(existingBooking.date, existingBooking.dateLabel)
    const trainerMeta = existingBooking.trainerName
      ? `${existingBooking.trainerName} · 60 мин`
      : '60 мин'

    const capacityText = slot
      ? `${slot.occupied} из ${slot.capacity} мест`
      : 'До 8 человек в зале'

    return (
      <div
        className="page training-details-page"
        aria-label={`Подтвержденная тренировка: ${existingBooking.title}, ${trainerMeta}, ${formattedDate} с ${existingBooking.startAt} до ${existingBooking.endAt}`}
      >
        <Link
          to="/schedule"
          state={{ fromSlotId: slotId }}
          viewTransition
          className="back-link"
          aria-label="Вернуться к расписанию"
        >
          <ArrowLeft size={18} aria-hidden="true" />
          <span>К расписанию</span>
        </Link>

        {/* 1. Status Indicator (Compact, Top of Screen) */}
        <div className="training-details__status-wrap">
          {isCancelled ? (
            <span className="training-details__status training-details__status--cancelled">
              <X size={13} aria-hidden="true" />
              <span>Запись отменена</span>
            </span>
          ) : isPast ? (
            <span className="training-details__status training-details__status--past">
              <Clock size={13} aria-hidden="true" />
              <span>Тренировка завершена</span>
            </span>
          ) : (
            <span className="training-details__status training-details__status--confirmed">
              <CheckCircle2 size={13} aria-hidden="true" />
              <span>Запись подтверждена</span>
            </span>
          )}
        </div>

        {/* 2. Main Workout Section (No heavy card, directly on background) */}
        <header className="training-details__header">
          <span className="eyebrow training-details__eyebrow">ВАША ТРЕНИРОВКА</span>
          <p className="training-details__date">{formattedDate}</p>
          <h1
            className="training-details__time"
            style={{ viewTransitionName: 'hero-slot-time' }}
            aria-label={`Время: с ${existingBooking.startAt} до ${existingBooking.endAt}`}
          >
            {existingBooking.startAt}–{existingBooking.endAt}
          </h1>
        </header>

        {/* 3. Training Type, Trainer & Capacity */}
        <div className="training-details__info">
          <h2 className="training-details__title">{existingBooking.title}</h2>
          <p className="training-details__meta">{trainerMeta}</p>

          <div
            className="training-details__capacity"
            aria-label={`Заполненность зала: ${capacityText}`}
          >
            <UsersRound size={15} aria-hidden="true" />
            <span>{capacityText}</span>
          </div>
        </div>

        {/* 4. Thin Divider */}
        <div className="training-details__divider" role="separator" />

        {/* 5. Pre-Workout Guidance (Border-free content section) */}
        <section className="training-guidance" aria-labelledby="guidance-heading">
          <div className="training-guidance__header">
            <ShieldCheck size={16} className="training-guidance__icon" aria-hidden="true" />
            <h3 id="guidance-heading" className="training-guidance__title">
              ПЕРЕД ТРЕНИРОВКОЙ
            </h3>
          </div>

          <ul className="training-guidance__list">
            <li className="training-guidance__item">
              <span className="training-guidance__marker" aria-hidden="true" />
              <span>Приходите за 10 минут до начала.</span>
            </li>
            <li className="training-guidance__item">
              <span className="training-guidance__marker" aria-hidden="true" />
              <span>Возьмите сменную спортивную обувь.</span>
            </li>
            <li className="training-guidance__item">
              <span className="training-guidance__marker" aria-hidden="true" />
              <span>Если планы изменились, отмените запись заранее.</span>
            </li>
          </ul>
        </section>

        {/* 6. Thin Divider */}
        <div className="training-details__divider" role="separator" />

        {/* 7. Cancellation / Action Section */}
        <section className="training-cancellation" aria-label="Управление записью">
          {isCancelled ? (
            <ButtonLink to="/schedule" variant="secondary" className="training-details__action-btn">
              Выбрать другое время
            </ButtonLink>
          ) : isPast ? (
            <ButtonLink to="/schedule" variant="secondary" className="training-details__action-btn">
              Записаться снова
            </ButtonLink>
          ) : (
            <>
              {cancelMutation.error && (
                <div className="inline-error" role="alert">
                  {cancelMutation.error.message}
                </div>
              )}

              {isCancellationWindowPassed ? (
                <div className="training-cancellation__warning-box">
                  <AlertCircle size={15} aria-hidden="true" />
                  <p>
                    Отмена через приложение недоступна: до тренировки осталось менее 4 часов. При
                    необходимости свяжитесь с администратором клуба.
                  </p>
                </div>
              ) : (
                <>
                  <p className="training-cancellation__policy">
                    Отмена записи без списания возможна не позднее чем за 4 часа до начала
                    тренировки.
                  </p>
                  <button
                    type="button"
                    className="button button--destructive training-details__cancel-btn"
                    onClick={() => setShowCancelModal(true)}
                    disabled={cancelMutation.isPending}
                    aria-haspopup="dialog"
                  >
                    {cancelMutation.isPending ? 'Отменяем…' : 'Отменить запись'}
                  </button>
                </>
              )}
            </>
          )}
        </section>

        {/* Confirmation Modal */}
        <Modal
          isOpen={showCancelModal}
          onClose={() => setShowCancelModal(false)}
          titleId="cancel-dialog-title"
          className="cancel-confirm-modal"
        >
          <h2 id="cancel-dialog-title">Отменить запись?</h2>
          <p className="cancel-confirm-modal__text">
            Вы уверены, что хотите отменить тренировку{' '}
            {formatDateRu(existingBooking.date, 'long')} в {existingBooking.startAt}?
          </p>

          <div className="cancel-confirm-modal__actions">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowCancelModal(false)}
            >
              Оставить запись
            </Button>
            <Button
              type="button"
              className="button button--danger"
              disabled={cancelMutation.isPending}
              onClick={() => {
                cancelMutation.mutate()
                setShowCancelModal(false)
              }}
            >
              {cancelMutation.isPending ? 'Отменяем…' : 'Отменить запись'}
            </Button>
          </div>
        </Modal>
      </div>
    )
  }

  // --- NEW BOOKING CREATION VIEW (when slot is not yet booked) ---
  const freePlaces = Math.max(0, slot!.capacity - slot!.occupied)
  const isFull = freePlaces <= 0 || slot!.isBlocked
  const formattedDate = formatWorkoutDate(slot!.date, slot!.dateLabel)
  const capacityLabel = `60 мин · ${formatCapacity(freePlaces)}`
  const activeTrainers = trainersQuery.data ?? []

  return (
    <div
      className="page training-details-page"
      aria-label={`Запись на тренировку: ${formattedDate} с ${slot!.startAt} до ${slot!.endAt}`}
    >
      <Link
        to="/schedule"
        state={{ fromSlotId: slotId }}
        viewTransition
        className="back-link"
        aria-label="Вернуться к расписанию"
      >
        <ArrowLeft size={18} aria-hidden="true" />
        <span>К расписанию</span>
      </Link>

      <div className="training-details__status-wrap">
        <span className="training-details__status training-details__status--new">
          Новая запись
        </span>
      </div>

      <header className="training-details__header">
        <p className="training-details__date">{formattedDate}</p>
        <h1
          className="training-details__time"
          style={{ viewTransitionName: 'hero-slot-time' }}
          aria-label={`Время: с ${slot!.startAt} до ${slot!.endAt}`}
        >
          {slot!.startAt}–{slot!.endAt}
        </h1>
      </header>

      <div className="training-details__info">
        <div
          className="training-details__capacity"
          aria-label={`Доступность мест: ${formatCapacity(freePlaces)}`}
        >
          <UsersRound size={15} aria-hidden="true" />
          <span>{capacityLabel}</span>
        </div>
      </div>

      <div className="training-details__divider" role="separator" />

      {!isFull ? (
        <>
          <section className="booking-mode" aria-labelledby="booking-mode-heading">
            <h2 id="booking-mode-heading" className="booking-mode__title">
              Как будете заниматься?
            </h2>
            <div className="booking-options" role="radiogroup" aria-label="Формат тренировки">
              <button
                type="button"
                role="radio"
                aria-checked={mode === 'self'}
                className={`booking-option motion-pressable ${mode === 'self' ? 'is-selected' : ''}`}
                onClick={() => {
                  setMode('self')
                  void haptics.selection()
                }}
              >
                <div className="booking-option__content">
                  <span className="booking-option__name">Самостоятельно</span>
                  <span className="booking-option__subtitle">Без тренера</span>
                </div>
                <span className="booking-option__radio" aria-hidden="true">
                  {mode === 'self' && <Check size={14} strokeWidth={3} />}
                </span>
              </button>

              {activeTrainers.map((trainer) => {
                const isSelected = mode === trainer.id
                const subtitle = getTrainerSubtitle(trainer)
                return (
                  <button
                    key={trainer.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    className={`booking-option motion-pressable ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => {
                      setMode(trainer.id)
                      void haptics.selection()
                    }}
                  >
                    <div className="booking-option__content">
                      <span className="booking-option__name">{trainer.name}</span>
                      <span className="booking-option__subtitle">{subtitle}</span>
                    </div>
                    <span className="booking-option__radio" aria-hidden="true">
                      {isSelected && <Check size={14} strokeWidth={3} />}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>

          <div className="booking-actions">
            {createMutation.error && (
              <div className="inline-error" role="alert">
                {createMutation.error.message}
              </div>
            )}

            <Button
              type="button"
              variant="primary"
              disabled={confirmPhase !== 'idle'}
              onClick={handleConfirm}
              className={`booking-submit-btn ${
                confirmPhase === 'submitting' ? 'button--submitting' : ''
              } ${confirmPhase === 'confirmed' ? 'button--confirmed' : ''}`}
            >
              {confirmPhase === 'submitting' ? (
                <span>Записываем…</span>
              ) : confirmPhase === 'confirmed' ? (
                <span>✓ Запись подтверждена</span>
              ) : (
                <span>Подтвердить запись</span>
              )}
            </Button>
          </div>
        </>
      ) : (
        <div className="booking-actions">
          <div className="inline-error" role="status">
            Это время уже заполнено. Пожалуйста, выберите другой интервал в расписании.
          </div>
          <ButtonLink to="/schedule" variant="secondary" className="booking-submit-btn">
            Выбрать другое время
          </ButtonLink>
        </div>
      )}
    </div>
  )
}
