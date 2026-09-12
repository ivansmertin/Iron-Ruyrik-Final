import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, ArrowLeft, LockKeyhole, Plus, Settings2, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import {
  addAdminBooking,
  createBookingBlock,
  deleteBookingBlock,
  getAdminBookings,
  getAdminSettings,
  getBookingBlocks,
  patchAdminSettings,
} from '../api/admin'
import { getProfileData } from '../api/profile'
import { getScheduleData } from '../api/schedule'
import { Button, LoadingPage, Modal } from '../components/ui'

function formatClientsCount(count: number): string {
  const abs = Math.abs(count) % 100
  const rem = abs % 10
  if (abs > 10 && abs < 20) return `${count} клиентов в списке`
  if (rem > 1 && rem < 5) return `${count} клиента в списке`
  if (rem === 1) return `${count} клиент в списке`
  return `${count} клиентов в списке`
}

export function AdminPage() {
  const queryClient = useQueryClient()
  const profileQuery = useQuery({ queryKey: ['profile'], queryFn: getProfileData })
  const settingsQuery = useQuery({ queryKey: ['admin', 'settings'], queryFn: getAdminSettings })
  const bookingsQuery = useQuery({ queryKey: ['admin', 'bookings'], queryFn: getAdminBookings })
  const blocksQuery = useQuery({ queryKey: ['admin', 'blocks'], queryFn: getBookingBlocks })
  const scheduleQuery = useQuery({ queryKey: ['schedule'], queryFn: getScheduleData })

  const [showForm, setShowForm] = useState(false)
  const [clientName, setClientName] = useState('')
  const [timelineError, setTimelineError] = useState<string | null>(null)
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [modalError, setModalError] = useState<string | null>(null)
  const [pendingSlotId, setPendingSlotId] = useState<string | null>(null)

  const invalidate = async () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['schedule'] }),
      queryClient.invalidateQueries({ queryKey: ['admin'] }),
    ])

  const settingsMutation = useMutation({
    mutationFn: (variables: { gymCapacity: number }) => patchAdminSettings(variables),
    onSuccess: invalidate,
    onError: (err: Error) => setSettingsError(err.message),
  })

  const blockMutation = useMutation({
    mutationFn: async (slotId: string) => {
      const slot = scheduleQuery.data!.slots.find((item) => item.id === slotId)!
      const block = blocksQuery.data?.find(
        (item) => item.startAt === slot.startIso && item.endAt === slot.endIso
      )
      return block ? deleteBookingBlock(block.id) : createBookingBlock(slot.startIso, slot.endIso)
    },
    onSuccess: invalidate,
    onError: (err: Error) => setTimelineError(err.message),
  })

  const bookingMutation = useMutation({
    mutationFn: ({ name, slotId }: { name: string; slotId: string }) =>
      addAdminBooking(name, slotId),
    onSuccess: async () => {
      setClientName('')
      setModalError(null)
      setShowForm(false)
      await invalidate()
    },
    onError: (err: Error) => setModalError(err.message),
  })

  if (
    profileQuery.isLoading ||
    settingsQuery.isLoading ||
    bookingsQuery.isLoading ||
    scheduleQuery.isLoading ||
    blocksQuery.isLoading
  ) {
    return <LoadingPage label="Загружаем админ-панель" />
  }

  if (profileQuery.data && profileQuery.data.user.role !== 'admin') {
    return <Navigate to="/" replace />
  }

  const hasError =
    profileQuery.isError ||
    settingsQuery.isError ||
    bookingsQuery.isError ||
    scheduleQuery.isError ||
    blocksQuery.isError
  const isMissingData =
    !settingsQuery.data || !bookingsQuery.data || !scheduleQuery.data || !blocksQuery.data

  if (hasError || isMissingData) {
    const handleRetry = () => {
      profileQuery.refetch()
      settingsQuery.refetch()
      bookingsQuery.refetch()
      blocksQuery.refetch()
      scheduleQuery.refetch()
    }

    return (
      <div className="mobile-app-viewport">
        <div className="admin-shell">
          <header className="mobile-header">
            <Link to="/profile" className="mobile-header__back" aria-label="Назад в приложение">
              <ArrowLeft size={20} />
              <span>Назад</span>
            </Link>
            <span className="mobile-header__city">Админ-панель</span>
          </header>
          <main className="admin-main">
            <div className="schedule-state-card schedule-state-card--error" role="alert">
              <AlertCircle size={32} className="schedule-state-card__icon" aria-hidden="true" />
              <h3 className="schedule-state-card__title">Не удалось загрузить админ-панель</h3>
              <p className="schedule-state-card__text">
                Проверьте соединение с сервером и попробуйте снова.
              </p>
              <button
                type="button"
                className="button button--primary"
                onClick={handleRetry}
                style={{ marginTop: '14px' }}
              >
                Повторить
              </button>
            </div>
          </main>
        </div>
      </div>
    )
  }

  const capacity = settingsQuery.data.gymCapacity
  const day = scheduleQuery.data.days[0]
  const slots = day ? scheduleQuery.data.slots.filter((slot) => slot.dateId === day.id) : []
  const bookings = day ? bookingsQuery.data.filter((booking) => booking.date === day.id) : []

  const formSlot =
    slots.find(
      (slot) => slot.startAt === '11:00' && slot.occupied < slot.capacity && !slot.isBlocked
    ) ?? slots.find((slot) => slot.occupied < slot.capacity && !slot.isBlocked)

  const handleToggleBlock = (slotId: string) => {
    setTimelineError(null)
    setPendingSlotId(slotId)
    blockMutation.mutate(slotId, {
      onSettled: () => setPendingSlotId(null),
    })
  }

  const addClient = (event: FormEvent) => {
    event.preventDefault()
    const name = clientName.trim()
    if (name && formSlot) {
      bookingMutation.mutate({ name, slotId: formSlot.id })
    }
  }

  const handleOpenForm = () => {
    setModalError(null)
    setShowForm(true)
  }

  const handleCloseForm = () => {
    setShowForm(false)
    setModalError(null)
    setClientName('')
  }

  return (
    <div className="mobile-app-viewport">
      <div className="admin-shell">
        <header className="mobile-header">
          <Link to="/profile" className="mobile-header__back" aria-label="Назад в приложение">
            <ArrowLeft size={20} />
            <span>Назад</span>
          </Link>
          <span className="mobile-header__city">Админ-панель</span>
        </header>

        <main className="admin-main">
          <header className="admin-header">
            <div>
              <p className="eyebrow">Админ-панель</p>
              <h1>Сегодня</h1>
              <span>
                {day ? `${day.day} ${day.monthLabel}` : 'Сегодня'} · Великий Новгород
              </span>
            </div>
            <Button disabled={!formSlot} onClick={handleOpenForm}>
              <Plus size={19} /> Записать клиента
            </Button>
          </header>

          <section id="today" className="admin-section">
            <div className="admin-section__header">
              <div>
                <h2>Загрузка по времени</h2>
                <p>Управление слотами на сегодня</p>
              </div>
            </div>
            {timelineError && (
              <div className="inline-error" role="alert" style={{ marginBottom: '12px' }}>
                {timelineError}
              </div>
            )}
            <div className="timeline-grid">
              {slots.map((slot) => {
                const isThisPending = blockMutation.isPending && pendingSlotId === slot.id
                const isFull = slot.occupied >= capacity
                const isClosed = slot.isBlocked
                const actionLabel = isThisPending
                  ? 'Обновление…'
                  : isClosed
                  ? 'Открыть время'
                  : isFull
                  ? 'Мест нет'
                  : 'Закрыть время'

                return (
                  <button
                    key={slot.id}
                    type="button"
                    className={`timeline-slot-btn ${isFull ? 'is-full' : ''} ${
                      isClosed ? 'is-closed' : ''
                    }`}
                    onClick={() => handleToggleBlock(slot.id)}
                    aria-pressed={slot.isBlocked}
                    disabled={blockMutation.isPending}
                  >
                    <span className="timeline-slot-btn__time">{slot.startAt}</span>
                    <strong className="timeline-slot-btn__count">
                      {slot.isBlocked ? 'Закрыто' : `${slot.occupied}/${capacity}`}
                    </strong>
                    <small className="timeline-slot-btn__status">{actionLabel}</small>
                  </button>
                )
              })}
            </div>
          </section>

          <section id="bookings" className="admin-section">
            <div className="admin-section__header">
              <div>
                <h2>Записи на день</h2>
                <p>{formatClientsCount(bookings.length)}</p>
              </div>
              {blocksQuery.data.length > 0 && (
                <span className="closed-badge">
                  <LockKeyhole size={15} /> Есть закрытое время
                </span>
              )}
            </div>

            {bookings.length === 0 ? (
              <div className="admin-bookings-empty" role="status">
                <p>На этот день записей нет</p>
              </div>
            ) : (
              <div className="admin-bookings-container">
                <ul className="admin-bookings-list" aria-label="Записи на день">
                  {bookings.map((booking) => {
                    const statusLabel =
                      booking.status === 'cancelled'
                        ? 'Отменена'
                        : booking.status === 'completed'
                        ? 'Пришёл'
                        : 'Подтверждена'
                    const statusClass =
                      booking.status === 'completed'
                        ? 'status--arrived'
                        : booking.status === 'cancelled'
                        ? 'status--cancelled'
                        : 'status--confirmed'
                    return (
                      <li className="admin-booking-item" key={booking.id}>
                        <span className="admin-booking-item__time">{booking.startAt}</span>
                        <div className="admin-booking-item__info">
                          <span className="admin-booking-item__client">{booking.clientName}</span>
                          <span className="admin-booking-item__trainer">
                            {booking.trainerName ? `Тренер: ${booking.trainerName}` : 'Самостоятельно'}
                          </span>
                        </div>
                        <span className={`status ${statusClass}`}>{statusLabel}</span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </section>

          <section
            id="capacity"
            className="admin-section capacity-control"
            role="group"
            aria-label="Вместимость зала"
          >
            <div className="capacity-control__header">
              <Settings2 size={22} className="capacity-control__icon" aria-hidden="true" />
              <div>
                <h2>Вместимость зала</h2>
                <p>Максимум людей одновременно</p>
              </div>
            </div>

            {settingsError && (
              <div className="inline-error" role="alert" style={{ width: '100%', margin: '4px 0 0' }}>
                {settingsError}
              </div>
            )}

            <div className="capacity-control__stepper">
              <button
                type="button"
                className="capacity-control__btn"
                aria-label="Уменьшить вместимость"
                disabled={settingsMutation.isPending || capacity <= 1}
                onClick={() => {
                  setSettingsError(null)
                  settingsMutation.mutate({ gymCapacity: capacity - 1 })
                }}
              >
                −
              </button>
              <output
                className="capacity-control__output"
                aria-live="polite"
                aria-atomic="true"
              >
                {capacity}
              </output>
              <button
                type="button"
                className="capacity-control__btn"
                aria-label="Увеличить вместимость"
                disabled={settingsMutation.isPending || capacity >= 20}
                onClick={() => {
                  setSettingsError(null)
                  settingsMutation.mutate({ gymCapacity: capacity + 1 })
                }}
              >
                +
              </button>
            </div>
          </section>
        </main>

        <Modal
          isOpen={showForm}
          onClose={handleCloseForm}
          titleId="add-client-title"
        >
          <button
            type="button"
            className="modal__close"
            onClick={handleCloseForm}
            aria-label="Закрыть"
          >
            <X size={20} />
          </button>
          <h2 id="add-client-title">Записать клиента</h2>
          <p className="modal__subtitle">
            Запись на {day ? `${day.day} ${day.monthLabel}` : 'сегодня'}, {formSlot?.startAt}
          </p>

          {modalError && (
            <div className="inline-error" role="alert">
              {modalError}
            </div>
          )}

          <form onSubmit={addClient} className="add-client-form">
            <label htmlFor="client-name-input">
              Имя клиента
              <input
                id="client-name-input"
                value={clientName}
                onChange={(event) => {
                  setClientName(event.target.value)
                  if (modalError) setModalError(null)
                }}
                autoFocus
                placeholder="Например, Сергей"
                disabled={bookingMutation.isPending}
              />
            </label>
            <Button
              type="submit"
              disabled={!clientName.trim() || bookingMutation.isPending}
            >
              {bookingMutation.isPending ? 'Добавляем…' : 'Добавить запись'}
            </Button>
          </form>
        </Modal>
      </div>
    </div>
  )
}
