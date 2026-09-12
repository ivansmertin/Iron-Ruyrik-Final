import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  UsersRound,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { cancelBooking, createBooking, getBookings } from '../api/bookings'
import { getScheduleData } from '../api/schedule'
import { getTrainers } from '../api/trainers'
import { Button, ButtonLink, LoadingPage, Modal } from '../components/ui'
import { useBookings } from '../features/bookings/BookingContext'
import {
  isSupportedBookingTrainer,
  type Booking,
  type BookingMode,
  type TimeSlot,
  type Trainer,
  type TrainerId,
} from '../types/domain'
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

  const { data: scheduleData, isLoading: isScheduleLoading, isError: isScheduleError } = useQuery({
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

  // 1. Resolve route ID: strictly distinguish direct bookingId vs slotId
  // Direct booking ID match (e.g. /booking/b-123 from Home/Profile)
  const bookingById =
    bookingsQuery.data?.find((b) => b.id === id) ??
    (createdBooking && createdBooking.id === id ? createdBooking : undefined)

  // Active (non-cancelled) booking by slotId (e.g. user already booked this slot)
  const activeBookingBySlot =
    bookingsQuery.data?.find((b) => b.slotId === id && b.status !== 'cancelled') ??
    (createdBooking && createdBooking.slotId === id && createdBooking.status !== 'cancelled'
      ? createdBooking
      : undefined)

  // Session-created booking (even if cancelled afterwards, kept for local details view)
  const sessionBooking =
    createdBooking && (createdBooking.id === id || createdBooking.slotId === id)
      ? createdBooking
      : undefined

  const existingBooking = bookingById ?? activeBookingBySlot ?? sessionBooking
  const slotId = existingBooking?.slotId ?? id
  const slot = scheduleData?.slots.find((item) => item.id === slotId)

  const location = useLocation()
  const returnDate =
    params.get('date') ??
    (location.state as { date?: string } | null)?.date ??
    slot?.dateId ??
    existingBooking?.date
  const returnTrainer =
    params.get('trainer') ??
    (location.state as { trainer?: string } | null)?.trainer ??
    existingBooking?.trainerId
  const returnParams = new URLSearchParams()
  if (returnDate) returnParams.set('date', returnDate)
  if (returnTrainer) returnParams.set('trainer', returnTrainer)
  if (slotId) returnParams.set('slot', slotId)
  const returnSearch = returnParams.toString() ? `?${returnParams.toString()}` : ''
  const scheduleReturnUrl = `/schedule${returnSearch}`
  const scheduleReturnState = {
    fromSlotId: slotId,
    date: returnDate,
    trainer: returnTrainer,
  }

  const suggestedTrainer = params.get('trainer')
  const initialMode: BookingMode =
    existingBooking?.trainerId ??
    (suggestedTrainer === 'dima' || suggestedTrainer === 'vanya' ? suggestedTrainer : 'self')
  const [mode, setMode] = useState<BookingMode>(initialMode)
  type ConfirmPhase = 'idle' | 'submitting' | 'confirmed'
  const [confirmPhase, setConfirmPhase] = useState<ConfirmPhase>('idle')
  const slotSnapshotRef = useRef<TimeSlot | null>(null)

  const activeTrainers = (trainersQuery.data ?? []).filter(
    (t): t is Trainer & { id: TrainerId } => isSupportedBookingTrainer(t.id)
  )
  const isSelectedTrainerAvailable = mode === 'self' || activeTrainers.some((t) => t.id === mode)
  const effectiveMode: BookingMode = isSelectedTrainerAvailable ? mode : 'self'

  useEffect(() => {
    if (trainersQuery.isSuccess && mode !== 'self') {
      const isPresent = (trainersQuery.data ?? []).some(
        (t) => t.id === mode && isSupportedBookingTrainer(t.id)
      )
      if (!isPresent) {
        setMode('self')
      }
    }
  }, [trainersQuery.isSuccess, trainersQuery.data, mode])

  const refresh = async () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['schedule'] }),
      queryClient.invalidateQueries({ queryKey: ['home'] }),
      queryClient.invalidateQueries({ queryKey: ['profile'] }),
    ])

  const createMutation = useMutation({
    mutationFn: ({ slotToBook, modeToBook }: { slotToBook: TimeSlot; modeToBook: BookingMode }) =>
      createBooking(slotToBook, modeToBook),
    onSuccess: (booking) => {
      // 1. OUTCOME: Unconditionally and immediately commit to query cache and invalidate
      // Decoupled from mounted status or visual 350ms timer
      queryClient.setQueryData<Booking[]>(['bookings'], (old) => {
        if (!old) return [booking]
        return [booking, ...old.filter((b) => b.id !== booking.id)]
      })
      void refresh()

      // 2. PRESENTATION: Local visual feedback
      void haptics.success()

      if (isMountedRef.current) {
        setConfirmPhase('confirmed')
        confirmTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            safeStartViewTransition(() => {
              setCreatedBooking(booking)
              setConfirmPhase('idle')
              slotSnapshotRef.current = null
            })
          }
        }, 350)
      }
    },
    onError: () => {
      setConfirmPhase('idle')
      slotSnapshotRef.current = null
    },
  })

  const handleConfirm = () => {
    if (!slot || confirmPhase !== 'idle') return
    slotSnapshotRef.current = slot
    const snapshotSlot = slot
    const snapshotMode = effectiveMode
    setConfirmPhase('submitting')
    createMutation.mutate({ slotToBook: snapshotSlot, modeToBook: snapshotMode })
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

  // Required query loading state
  if (isScheduleLoading || bookingsQuery.isLoading) {
    return <LoadingPage label="Загружаем детали тренировки" />
  }

  // Required query error state (distinct from unknown ID)
  if ((!scheduleData && isScheduleError) || bookingsQuery.isError) {
    return (
      <div className="page training-details-page">
        <Link to={scheduleReturnUrl} state={scheduleReturnState} className="back-link">
          <ArrowLeft size={18} aria-hidden="true" />
          <span>К расписанию</span>
        </Link>
        <div className="schedule-state schedule-state--error schedule-state-card--error" role="alert">
          <AlertCircle size={32} className="schedule-state__icon" aria-hidden="true" />
          <h2 className="schedule-state__title">Не удалось загрузить данные записи</h2>
          <p className="schedule-state__text">Проверьте соединение с интернетом и попробуйте снова.</p>
          <button
            type="button"
            className="button button--primary"
            onClick={() => {
              void queryClient.invalidateQueries({ queryKey: ['schedule'] })
              void queryClient.invalidateQueries({ queryKey: ['bookings'] })
            }}
          >
            Повторить
          </button>
        </div>
      </div>
    )
  }

  // If neither booking nor slot exists (and queries succeeded)
  if (!existingBooking && !slot) {
    return (
      <div className="page training-details-page">
        <Link to={scheduleReturnUrl} state={scheduleReturnState} className="back-link">
          <ArrowLeft size={18} aria-hidden="true" />
          <span>К расписанию</span>
        </Link>
        <div className="schedule-state schedule-state--empty">
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 8px' }}>Запись не найдена</h2>
          <p style={{ color: 'var(--text-secondary)', margin: '0 0 16px' }}>
            Возможно, выбранное время больше недоступно или было удалено.
          </p>
          <ButtonLink to={scheduleReturnUrl} state={scheduleReturnState} variant="secondary">
            К расписанию
          </ButtonLink>
        </div>
      </div>
    )
  }

  // Determine whether to show the Confirmed Details View
  // (Only when booking exists AND not currently in the middle of submitting or holding the 350ms confirmed button)
  const isDetailsView = Boolean(existingBooking && confirmPhase === 'idle')

  // --- CONFIRMED / EXISTING BOOKING DETAILS VIEW ---
  if (isDetailsView && existingBooking) {
    const startIso =
      slot?.startIso ?? `${existingBooking.date}T${existingBooking.startAt}:00+03:00`
    const endIso =
      slot?.endIso ?? `${existingBooking.date}T${existingBooking.endAt}:00+03:00`
    const startTime = new Date(startIso).getTime()
    const endTime = new Date(endIso).getTime()
    const now = Date.now()

    const isCancelled = displayedBooking?.status === 'cancelled'
    const isCompleted = !isCancelled && !isNaN(endTime) && now >= endTime
    const isOngoing = !isCancelled && !isCompleted && !isNaN(startTime) && now >= startTime

    // 4 hours cancellation window: only applicable if not past, not ongoing, not cancelled
    const minutesLeft = Math.round((startTime - now) / 60000)
    const isCancellationWindowPassed = isOngoing || isCompleted || minutesLeft < 240

    const formattedDate = formatWorkoutDate(existingBooking.date, existingBooking.dateLabel)
    const trainerMeta = existingBooking.trainerName
      ? `${existingBooking.trainerName} · 60 мин`
      : '60 мин'

    const capacityText = slot
      ? `${slot.occupied} из ${slot.capacity} мест`
      : null

    let statusText = 'Запись подтверждена'
    let statusTone = 'confirmed'
    let StatusIcon = CheckCircle2

    if (isCancelled) {
      statusText = 'Запись отменена'
      statusTone = 'cancelled'
      StatusIcon = X
    } else if (isCompleted) {
      statusText = 'Тренировка завершена'
      statusTone = 'completed'
      StatusIcon = Clock
    } else if (isOngoing) {
      statusText = 'Тренировка идёт сейчас'
      statusTone = 'ongoing'
      StatusIcon = Activity
    }

    const mainAriaLabel = isCancelled
      ? `Отмененная тренировка: ${existingBooking.title}, ${trainerMeta}, ${formattedDate} с ${existingBooking.startAt} до ${existingBooking.endAt}`
      : isCompleted
        ? `Завершенная тренировка: ${existingBooking.title}, ${trainerMeta}, ${formattedDate} с ${existingBooking.startAt} до ${existingBooking.endAt}`
        : isOngoing
          ? `Текущая тренировка: ${existingBooking.title}, ${trainerMeta}, ${formattedDate} с ${existingBooking.startAt} до ${existingBooking.endAt}`
          : `Подтвержденная тренировка: ${existingBooking.title}, ${trainerMeta}, ${formattedDate} с ${existingBooking.startAt} до ${existingBooking.endAt}`

    return (
      <div className="page training-details-page" aria-label={mainAriaLabel}>
        <Link
          to={scheduleReturnUrl}
          state={scheduleReturnState}
          viewTransition
          className="back-link"
          aria-label="Вернуться к расписанию"
        >
          <ArrowLeft size={18} aria-hidden="true" />
          <span>К расписанию</span>
        </Link>

        {/* 1. Single Status Line (Compact, Top of Screen) */}
        <div className="training-details__status-wrap">
          <span className={`training-details__status training-details__status--${statusTone}`}>
            <StatusIcon size={13} aria-hidden="true" />
            <span>{statusText}</span>
          </span>
        </div>

        {/* 2. Hero Time (No heavy cards, open rhythm) */}
        <header className="training-details__header">
          {/* Semantic text for accessibility and test compatibility */}
          <span className="sr-only">ВАША ТРЕНИРОВКА</span>
          <h1
            className="training-details__time"
            style={{ viewTransitionName: 'hero-slot-time' }}
            aria-label={`Время: с ${existingBooking.startAt} до ${existingBooking.endAt}`}
          >
            {existingBooking.startAt}–{existingBooking.endAt}
          </h1>
        </header>

        {/* 3. Facts (Date, Workout Title, Trainer, Capacity if known) */}
        <div className="training-details__facts">
          <p className="training-details__date">{formattedDate}</p>
          <div className="training-details__meta-row">
            <span className="training-details__title">{existingBooking.title}</span>
            <span className="training-details__dot" aria-hidden="true">·</span>
            <span className="training-details__meta">{trainerMeta}</span>
          </div>

          {capacityText && (
            <div
              className="training-details__capacity"
              aria-label={`Заполненность зала: ${capacityText}`}
            >
              <UsersRound size={15} aria-hidden="true" />
              <span>{capacityText}</span>
            </div>
          )}
        </div>

        {/* 4. Thin Divider */}
        <div className="training-details__divider" role="separator" />

        {/* 5. Cancellation / Management Action Section */}
        <section className="training-cancellation" aria-label="Управление записью">
          {isCancelled ? (
            <ButtonLink
              to={scheduleReturnUrl}
              state={scheduleReturnState}
              variant="secondary"
              className="training-details__action-btn"
            >
              Выбрать другое время
            </ButtonLink>
          ) : isCompleted ? (
            <ButtonLink
              to={scheduleReturnUrl}
              state={scheduleReturnState}
              variant="secondary"
              className="training-details__action-btn"
            >
              Записаться снова
            </ButtonLink>
          ) : isOngoing ? (
            <div className="training-cancellation__warning-box">
              <AlertCircle size={15} aria-hidden="true" />
              <p>Тренировка идёт прямо сейчас. Отмена через приложение недоступна.</p>
            </div>
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
          onClose={() => {
            if (!cancelMutation.isPending) {
              setShowCancelModal(false)
            }
          }}
          titleId="cancel-dialog-title"
          className="cancel-confirm-modal"
        >
          <h2 id="cancel-dialog-title">Отменить запись?</h2>
          <p className="cancel-confirm-modal__text">
            Вы уверены, что хотите отменить тренировку{' '}
            {formatDateRu(existingBooking.date, 'long')} в {existingBooking.startAt}?
          </p>

          {cancelMutation.error && (
            <div className="inline-error" role="alert" style={{ marginBottom: '14px' }}>
              {cancelMutation.error.message}
            </div>
          )}

          <div className="cancel-confirm-modal__actions">
            <Button
              type="button"
              variant="secondary"
              disabled={cancelMutation.isPending}
              onClick={() => setShowCancelModal(false)}
            >
              Оставить запись
            </Button>
            <Button
              type="button"
              className="button button--danger"
              disabled={cancelMutation.isPending}
              onClick={() => cancelMutation.mutate()}
            >
              {cancelMutation.isPending ? 'Отменяем…' : 'Отменить запись'}
            </Button>
          </div>
        </Modal>
      </div>
    )
  }

  // --- NEW BOOKING CREATION VIEW (when slot is open to book or being confirmed) ---
  const activeSlot = confirmPhase !== 'idle' && slotSnapshotRef.current ? slotSnapshotRef.current : slot
  const startIso = activeSlot?.startIso ?? ''
  const startTime = startIso ? new Date(startIso).getTime() : NaN
  const now = Date.now()
  const isPast = !isNaN(startTime) && now >= startTime
  const isBlocked = activeSlot?.isBlocked ?? false
  const freePlaces = activeSlot ? Math.max(0, activeSlot.capacity - activeSlot.occupied) : 0
  const isFull = freePlaces <= 0
  // Presentation of submitting or confirmed hold (350ms) has absolute priority over live availability changes
  const isUnavailable = confirmPhase === 'idle' && (isBlocked || isPast || isFull)

  let unavailableReason = ''
  if (isBlocked) {
    unavailableReason = 'Зал закрыт на это время. Пожалуйста, выберите другой интервал в расписании.'
  } else if (isPast) {
    unavailableReason = 'Это время уже прошло или тренировка уже началась. Пожалуйста, выберите будущее время в расписании.'
  } else if (isFull) {
    unavailableReason = 'Все места заняты. Пожалуйста, выберите другой интервал в расписании.'
  }

  const formattedDate = activeSlot ? formatWorkoutDate(activeSlot.date, activeSlot.dateLabel) : ''
  const capacityLabel = `60 мин · ${formatCapacity(freePlaces)}`

  return (
    <div
      className="page training-details-page"
      aria-label={`Запись на тренировку: ${formattedDate} с ${slot?.startAt} до ${slot?.endAt}`}
    >
      <Link
        to={scheduleReturnUrl}
        state={scheduleReturnState}
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
          aria-label={`Время: с ${slot?.startAt} до ${slot?.endAt}`}
        >
          {slot?.startAt}–{slot?.endAt}
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

      {!isUnavailable ? (
        <>
          <fieldset
            className="booking-mode"
            style={{ border: 'none', padding: 0, margin: 0 }}
            aria-labelledby="booking-mode-heading"
          >
            <legend id="booking-mode-heading" className="booking-mode__title">
              Как будете заниматься?
            </legend>

            {trainersQuery.isError && (
              <div className="inline-error" role="alert" style={{ marginBottom: '12px' }}>
                <p style={{ margin: '0 0 8px' }}>
                  Не удалось загрузить список тренеров. Вы можете записаться самостоятельно или повторить попытку.
                </p>
                <button
                  type="button"
                  className="button button--sm button--secondary"
                  onClick={() => void trainersQuery.refetch()}
                >
                  Повторить загрузку тренеров
                </button>
              </div>
            )}

            <div className="booking-options" role="radiogroup" aria-labelledby="booking-mode-heading">
              <label
                className={`booking-option motion-pressable ${effectiveMode === 'self' ? 'is-selected' : ''} ${
                  confirmPhase !== 'idle' ? 'is-disabled' : ''
                }`}
              >
                <input
                  type="radio"
                  name="booking-mode"
                  value="self"
                  checked={effectiveMode === 'self'}
                  disabled={confirmPhase !== 'idle'}
                  onChange={() => {
                    setMode('self')
                    void haptics.selection()
                  }}
                  className="booking-option__input"
                />
                <div className="booking-option__content">
                  <span className="booking-option__name">Самостоятельно</span>
                  <span className="booking-option__subtitle">Без тренера</span>
                </div>
                <span className="booking-option__radio" aria-hidden="true">
                  {effectiveMode === 'self' && <Check size={14} strokeWidth={3} />}
                </span>
              </label>

              {trainersQuery.data && trainersQuery.data.length === 0 && !trainersQuery.isError && (
                <div className="inline-note" style={{ margin: '4px 0 8px' }}>
                  Нет доступных тренеров на это время. Доступна самостоятельная тренировка.
                </div>
              )}

              {activeTrainers.map((trainer) => {
                const isSelected = effectiveMode === trainer.id
                const subtitle = getTrainerSubtitle(trainer)
                return (
                  <label
                    key={trainer.id}
                    className={`booking-option motion-pressable ${isSelected ? 'is-selected' : ''} ${
                      confirmPhase !== 'idle' ? 'is-disabled' : ''
                    }`}
                  >
                    <input
                      type="radio"
                      name="booking-mode"
                      value={trainer.id}
                      checked={isSelected}
                      disabled={confirmPhase !== 'idle'}
                      onChange={() => {
                        setMode(trainer.id)
                        void haptics.selection()
                      }}
                      className="booking-option__input"
                    />
                    <div className="booking-option__content">
                      <span className="booking-option__name">{trainer.name}</span>
                      <span className="booking-option__subtitle">{subtitle}</span>
                    </div>
                    <span className="booking-option__radio" aria-hidden="true">
                      {isSelected && <Check size={14} strokeWidth={3} />}
                    </span>
                  </label>
                )
              })}
            </div>
          </fieldset>

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
            {unavailableReason}
          </div>
          <ButtonLink
            to={scheduleReturnUrl}
            state={scheduleReturnState}
            variant="secondary"
            className="booking-submit-btn"
          >
            Выбрать другое время
          </ButtonLink>
        </div>
      )}
    </div>
  )
}
