import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, LockKeyhole, Plus, Settings2, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { addAdminBooking, createBookingBlock, deleteBookingBlock, getAdminBookings, getAdminSettings, getBookingBlocks, patchAdminSettings } from '../api/admin'
import { getProfileData } from '../api/profile'
import { getScheduleData } from '../api/schedule'
import { Button, LoadingPage, Modal } from '../components/ui'

export function AdminPage() {
  const queryClient = useQueryClient()
  const profileQuery = useQuery({ queryKey: ['profile'], queryFn: getProfileData })
  const settingsQuery = useQuery({ queryKey: ['admin', 'settings'], queryFn: getAdminSettings })
  const bookingsQuery = useQuery({ queryKey: ['admin', 'bookings'], queryFn: getAdminBookings })
  const blocksQuery = useQuery({ queryKey: ['admin', 'blocks'], queryFn: getBookingBlocks })
  const scheduleQuery = useQuery({ queryKey: ['schedule'], queryFn: getScheduleData })
  const [showForm, setShowForm] = useState(false)
  const [clientName, setClientName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const invalidate = async () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['schedule'] }),
    queryClient.invalidateQueries({ queryKey: ['admin'] }),
  ])
  const settingsMutation = useMutation({ mutationFn: patchAdminSettings, onSuccess: invalidate, onError: (value) => setError(value.message) })
  const blockMutation = useMutation({
    mutationFn: async (slotId: string) => {
      const slot = scheduleQuery.data!.slots.find((item) => item.id === slotId)!
      const block = blocksQuery.data?.find((item) => item.startAt === slot.startIso && item.endAt === slot.endIso)
      return block ? deleteBookingBlock(block.id) : createBookingBlock(slot.startIso, slot.endIso)
    },
    onSuccess: invalidate, onError: (value) => setError(value.message),
  })
  const bookingMutation = useMutation({
    mutationFn: ({ name, slotId }: { name: string; slotId: string }) => addAdminBooking(name, slotId),
    onSuccess: async () => { setClientName(''); setShowForm(false); await invalidate() },
    onError: (value) => setError(value.message),
  })

  if (profileQuery.isLoading || settingsQuery.isLoading || bookingsQuery.isLoading || scheduleQuery.isLoading || blocksQuery.isLoading) {
    return <LoadingPage label="Загружаем админ-панель" />
  }
  if (profileQuery.data && profileQuery.data.user.role !== 'admin') {
    return <Navigate to="/" replace />
  }
  if (!settingsQuery.data || !bookingsQuery.data || !scheduleQuery.data || !blocksQuery.data) return <div className="page"><p>Не удалось загрузить админ-панель.</p></div>
  const capacity = settingsQuery.data.gymCapacity
  const day = scheduleQuery.data.days[0]
  const slots = scheduleQuery.data.slots.filter((slot) => slot.dateId === day?.id)
  const bookings = bookingsQuery.data.filter((booking) => booking.date === day?.id)
  const formSlot = slots.find((slot) => slot.startAt === '11:00' && slot.occupied < slot.capacity && !slot.isBlocked)
    ?? slots.find((slot) => slot.occupied < slot.capacity && !slot.isBlocked)

  const addClient = (event: FormEvent) => {
    event.preventDefault(); const name = clientName.trim()
    if (name && formSlot) bookingMutation.mutate({ name, slotId: formSlot.id })
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
              <span>{day?.day} {day?.monthLabel} · Великий Новгород</span>
            </div>
            <Button disabled={!formSlot} onClick={() => setShowForm(true)}>
              <Plus size={19} /> Записать клиента
            </Button>
          </header>
          {error && <div className="inline-error" role="alert">{error}</div>}
          <section id="today" className="admin-section">
            <div className="admin-section__header"><div><h2>Загрузка по времени</h2><p>Данные из SQLite</p></div></div>
            <div className="timeline-grid">{slots.map((slot) => (
              <button key={slot.id} type="button" className={`${slot.occupied >= capacity ? 'is-full' : ''} ${slot.isBlocked ? 'is-closed' : ''}`} onClick={() => blockMutation.mutate(slot.id)} aria-pressed={slot.isBlocked} disabled={blockMutation.isPending}>
                <span>{slot.startAt}</span><strong>{slot.isBlocked ? 'Закрыто' : `${slot.occupied}/${capacity}`}</strong><small>{slot.isBlocked ? 'Открыть время' : slot.occupied >= capacity ? 'Мест нет' : 'Закрыть время'}</small>
              </button>
            ))}</div>
          </section>
          <section id="bookings" className="admin-section">
            <div className="admin-section__header"><div><h2>Записи на день</h2><p>{bookings.length} клиентов в списке</p></div>{blocksQuery.data.length > 0 && <span className="closed-badge"><LockKeyhole size={15} /> Есть закрытое время</span>}</div>
            <div className="admin-table" role="table" aria-label="Записи на день">
              <div className="admin-table__head" role="row"><span>Время</span><span>Клиент</span><span>Тренер</span><span>Статус</span></div>
              {bookings.map((booking) => <div className="admin-table__row" role="row" key={booking.id}><strong>{booking.startAt}</strong><span>{booking.clientName}</span><span>{booking.trainerName ?? 'Самостоятельно'}</span><span className={`status status--${booking.status === 'completed' ? 'arrived' : 'confirmed'}`}>{booking.status === 'cancelled' ? 'Отменена' : booking.status === 'completed' ? 'Пришёл' : 'Подтверждена'}</span></div>)}
            </div>
          </section>
          <section id="capacity" className="admin-section capacity-control">
            <div><Settings2 size={22} /><div><h2>Вместимость зала</h2><p>Максимум людей одновременно</p></div></div>
            <label><span className="sr-only">Вместимость зала</span><button type="button" disabled={settingsMutation.isPending || capacity <= 1} onClick={() => settingsMutation.mutate({ gymCapacity: capacity - 1 })}>−</button><output>{capacity}</output><button type="button" disabled={settingsMutation.isPending || capacity >= 20} onClick={() => settingsMutation.mutate({ gymCapacity: capacity + 1 })}>+</button></label>
          </section>
        </main>
        <Modal
          isOpen={showForm}
          onClose={() => setShowForm(false)}
          titleId="add-client-title"
        >
          <button
            type="button"
            className="modal__close"
            onClick={() => setShowForm(false)}
            aria-label="Закрыть"
          >
            <X size={20} />
          </button>
          <h2 id="add-client-title">Записать клиента</h2>
          <p>Добавьте запись на {formSlot?.startAt}. Она сохранится в базе.</p>
          <form onSubmit={addClient}>
            <label>
              Имя клиента
              <input
                value={clientName}
                onChange={(event) => setClientName(event.target.value)}
                autoFocus
                placeholder="Например, Сергей"
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
