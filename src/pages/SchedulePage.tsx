import { useQuery } from '@tanstack/react-query'
import { AlertCircle, ArrowRight, CalendarDays, CalendarX, UsersRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { DateStrip } from '../components/DateStrip'
import { PageHeader, Skeleton } from '../components/ui'
import { getScheduleData } from '../api/schedule'
import { getTrainers } from '../api/trainers'
import type { ScheduleDay } from '../types/domain'

interface AvailabilityResult {
  free: number
  label: string
  tone: 'positive' | 'warning' | 'full' | 'blocked' | 'past'
  isAvailable: boolean
}

function getSlotAvailability(
  occupied: number,
  capacity: number,
  isBlocked: boolean,
  endIso?: string
): AvailabilityResult {
  if (isBlocked) {
    return { free: 0, label: 'Зал закрыт', tone: 'blocked', isAvailable: false }
  }
  if (endIso) {
    const endTime = new Date(endIso).getTime()
    if (!isNaN(endTime) && endTime <= Date.now()) {
      return { free: 0, label: 'Время прошло', tone: 'past', isAvailable: false }
    }
  }
  const free = Math.max(0, capacity - occupied)
  if (free <= 0) {
    return { free: 0, label: 'Мест нет', tone: 'full', isAvailable: false }
  }
  if (free === 1) {
    return { free: 1, label: '1 место свободно', tone: 'warning', isAvailable: true }
  }
  if (free === 2) {
    return { free: 2, label: '2 места свободно', tone: 'warning', isAvailable: true }
  }
  if (free >= 3 && free <= 4) {
    return { free, label: `${free} места свободно`, tone: 'positive', isAvailable: true }
  }
  return { free, label: `${free} мест свободно`, tone: 'positive', isAvailable: true }
}

function formatDayHeading(day: ScheduleDay): string {
  const weekdayFormatted =
    day.weekday.charAt(0).toUpperCase() + day.weekday.slice(1).toLowerCase()
  return `${weekdayFormatted}, ${day.day} ${day.monthLabel}`
}

export function SchedulePage() {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const backSlotId =
    (location.state as { fromSlotId?: string } | null)?.fromSlotId ??
    (window.history.state?.usr as { fromSlotId?: string } | undefined)?.fromSlotId ??
    (window.history.state as { fromSlotId?: string } | undefined)?.fromSlotId ??
    (typeof window !== 'undefined' ? window.sessionStorage.getItem('ryrik_schedule_last_slot') : null) ??
    params.get('slot') ??
    params.get('fromSlotId')
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null)
  const transitioningSlotId = activeSlotId ?? backSlotId

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['schedule'],
    queryFn: getScheduleData,
  })
  const trainersQuery = useQuery({
    queryKey: ['trainers'],
    queryFn: getTrainers,
  })

  const selectedDate =
    params.get('date') ??
    (location.state as { date?: string } | null)?.date ??
    data?.days[0]?.id ??
    ''
  const trainerId =
    params.get('trainer') ??
    (location.state as { trainer?: string } | null)?.trainer ??
    null
  const trainer = trainersQuery.data?.find((item) => item.id === trainerId)

  const selectDate = (date: string) => {
    const next = new URLSearchParams(params)
    next.set('date', date)
    setParams(next)
  }

  const resetTrainer = () => {
    const next = new URLSearchParams(params)
    next.delete('trainer')
    setParams(next)
  }

  const lastRestoredKeyRef = useRef<string | null>(null)

  // Restore scroll and focus when returning from booking
  useEffect(() => {
    if (isLoading || !data) return
    if (!backSlotId || lastRestoredKeyRef.current === location.key) return

    const timer = setTimeout(() => {
      lastRestoredKeyRef.current = location.key
      const targetId = backSlotId.startsWith('slot-') ? backSlotId : `slot-${backSlotId}`
      const slotEl = document.getElementById(targetId)
      if (slotEl) {
        if (typeof slotEl.scrollIntoView === 'function') {
          slotEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
        slotEl.focus?.({ preventScroll: true })
      } else {
        const headingEl = document.getElementById('schedule-day-heading')
        if (headingEl) {
          if (typeof headingEl.scrollIntoView === 'function') {
            headingEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
          headingEl.focus?.({ preventScroll: true })
        }
      }
    }, 100)

    return () => clearTimeout(timer)
  }, [backSlotId, isLoading, data, selectedDate, location.key])

  // Loading skeleton matching layout shape
  if (isLoading) {
    return (
      <div className="page schedule-page" aria-busy="true" aria-label="Загрузка расписания">
        <PageHeader eyebrow="Запись" title="Выберите время" />
        <div className="date-strip-skeleton" aria-hidden="true">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="date-strip-skeleton__item" />
          ))}
        </div>
        <div className="schedule-day-title-skeleton" aria-hidden="true">
          <Skeleton style={{ width: '150px', height: '20px', borderRadius: '6px' }} />
        </div>
        <div className="slot-list" aria-hidden="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="time-slot-skeleton" />
          ))}
        </div>
      </div>
    )
  }

  // Error state
  if (isError || !data) {
    return (
      <div className="page schedule-page">
        <PageHeader eyebrow="Запись" title="Выберите время" />
        <div className="schedule-state schedule-state--error schedule-state-card schedule-state-card--error" role="alert">
          <AlertCircle size={32} className="schedule-state__icon schedule-state-card__icon" aria-hidden="true" />
          <h3 className="schedule-state__title schedule-state-card__title">Не удалось загрузить расписание</h3>
          <p className="schedule-state__text schedule-state-card__text">Проверьте соединение с интернетом и попробуйте снова.</p>
          <button
            type="button"
            className="button button--primary"
            onClick={() => refetch()}
          >
            Повторить
          </button>
        </div>
      </div>
    )
  }

  const slots = data.slots.filter((slot) => slot.dateId === selectedDate)
  const selectedDay = data.days.find((day) => day.id === selectedDate) ?? data.days[0]

  return (
    <div className="page schedule-page">
      <PageHeader eyebrow="Запись" title="Выберите время" />

      {trainer && (
        <div className="schedule-filter">
          <span>С тренером {trainer.name}</span>
          <button type="button" onClick={resetTrainer}>
            Сбросить
          </button>
        </div>
      )}

      <DateStrip days={data.days} selectedId={selectedDate} onSelect={selectDate} />

      {selectedDay && (
        <div className="schedule-day-title">
          <CalendarDays size={18} className="schedule-day-title__icon" aria-hidden="true" />
          <h2 id="schedule-day-heading" tabIndex={-1}>{formatDayHeading(selectedDay)}</h2>
        </div>
      )}

      {slots.length === 0 ? (
        <div className="schedule-state schedule-state--empty schedule-state-card schedule-state-card--empty" role="status">
          <CalendarX size={32} className="schedule-state__icon schedule-state-card__icon" aria-hidden="true" />
          <h3 className="schedule-state__title schedule-state-card__title">На этот день тренировок нет</h3>
          <p className="schedule-state__text schedule-state-card__text">
            Выберите другую дату в календаре выше или посмотрите ближайшие доступные дни.
          </p>
          {data.days[0] && data.days[0].id !== selectedDate && (
            <button
              type="button"
              className="button button--secondary"
              onClick={() => selectDate(data.days[0].id)}
            >
              Выбрать {data.days[0].day} {data.days[0].monthLabel}
            </button>
          )}
        </div>
      ) : (
        <ul className="slot-list" aria-label="Доступные временные слоты">
          {slots.map((slot) => {
            const availability = getSlotAvailability(
              slot.occupied,
              slot.capacity,
              slot.isBlocked,
              slot.endIso
            )
            const isClickable = availability.isAvailable
            const isTransitioning = transitioningSlotId === slot.id

            const bookingParams = new URLSearchParams()
            if (trainer) bookingParams.set('trainer', trainer.id)
            if (selectedDate) bookingParams.set('date', selectedDate)
            const query = bookingParams.toString() ? `?${bookingParams.toString()}` : ''

            return (
              <li key={slot.id} className="slot-list__item" id={`slot-item-${slot.id}`}>
                {isClickable ? (
                  <Link
                    key={slot.id}
                    id={`slot-${slot.id}`}
                    to={`/booking/${slot.id}${query}`}
                    state={{ fromSlotId: slot.id, date: selectedDate, trainer: trainer?.id }}
                    viewTransition
                    onClick={() => {
                      setActiveSlotId(slot.id)
                      if (typeof window !== 'undefined') {
                        try {
                          window.sessionStorage.setItem('ryrik_schedule_last_slot', slot.id)
                          const currentUsr = (window.history.state?.usr as Record<string, unknown> | undefined) ?? {}
                          window.history.replaceState(
                            {
                              ...window.history.state,
                              usr: { ...currentUsr, fromSlotId: slot.id },
                              fromSlotId: slot.id,
                            },
                            ''
                          )
                        } catch {
                          // Ignore storage or history access restrictions
                        }
                      }
                    }}
                    className={`time-slot is-available ${isTransitioning ? 'is-transitioning' : ''}`}
                    aria-label={`Записаться на время ${slot.startAt}–${slot.endAt}, ${availability.label}, занято ${slot.occupied} из ${slot.capacity}`}
                  >
                    <div className="time-slot__time-col">
                      <strong
                        className="time-slot__interval"
                        style={isTransitioning ? { viewTransitionName: 'hero-slot-time' } : undefined}
                      >
                        {slot.startAt}–{slot.endAt}
                      </strong>
                      <span className="time-slot__duration">60 мин</span>
                    </div>

                    <div className="time-slot__status-col">
                      <div className="time-slot__occupancy" aria-label={`Занято ${slot.occupied} из ${slot.capacity}`}>
                        <UsersRound size={15} aria-hidden="true" />
                        <span>{slot.occupied} / {slot.capacity}</span>
                      </div>
                      <span className={`time-slot__status is-${availability.tone}`}>
                        {availability.label}
                      </span>
                    </div>

                    <div className="time-slot__affordance" aria-hidden="true">
                      <ArrowRight size={18} />
                    </div>
                  </Link>
                ) : (
                  <div
                    id={`slot-${slot.id}`}
                    className={`time-slot is-disabled is-${availability.tone}`}
                    aria-disabled="true"
                    aria-label={`Время ${slot.startAt}–${slot.endAt}, ${availability.label}, занято ${slot.occupied} из ${slot.capacity}`}
                  >
                    <div className="time-slot__time-col">
                      <strong className="time-slot__interval">{slot.startAt}–{slot.endAt}</strong>
                      <span className="time-slot__duration">60 мин</span>
                    </div>

                    <div className="time-slot__status-col">
                      <div className="time-slot__occupancy" aria-label={`Занято ${slot.occupied} из ${slot.capacity}`}>
                        <UsersRound size={15} aria-hidden="true" />
                        <span>{slot.occupied} / {slot.capacity}</span>
                      </div>
                      <span className={`time-slot__status is-${availability.tone}`}>
                        {availability.label}
                      </span>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <p className="schedule-note">Время для Великого Новгорода · UTC+3</p>
    </div>
  )
}
