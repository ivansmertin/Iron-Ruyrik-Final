import { useQuery } from '@tanstack/react-query'
import { ChevronRight, MapPin, X } from 'lucide-react'
import { useState } from 'react'
import { BookingCard } from '../components/BookingCard'
import { CapacityIndicator } from '../components/CapacityIndicator'
import { GymNewsWidget } from '../components/GymNewsWidget'
import { Button, LoadingPage } from '../components/ui'
import { getHomeData } from '../api/home'
import { getScheduleData } from '../api/schedule'

export function HomePage() {
  const homeQuery = useQuery({ queryKey: ['home'], queryFn: getHomeData })
  const scheduleQuery = useQuery({ queryKey: ['schedule'], queryFn: getScheduleData })
  const [showClubModal, setShowClubModal] = useState(false)

  if (homeQuery.isLoading) return <LoadingPage label="Загружаем главную" />
  if (!homeQuery.data) return <div className="page"><p>Не удалось загрузить данные.</p></div>

  const { user, activeBooking, capacity } = homeQuery.data
  const now = new Date()
  const slots = scheduleQuery.data?.slots ?? []
  const nextSlot = slots.find((slot) => new Date(slot.endIso) > now && !slot.isBlocked) ?? slots[0] ?? null

  return (
    <div className="page home-page">
      <header className="home-header">
        <div className="home-greeting">
          <span className="eyebrow home-greeting__eyebrow">ДОБРЫЙ ДЕНЬ</span>
          <h1 className="home-user-name">{user.name}</h1>
        </div>

        <button
          type="button"
          className="club-badge"
          onClick={() => setShowClubModal(true)}
          aria-label={`Выбранный клуб: ${user.city}. Нажмите, чтобы посмотреть подробности.`}
        >
          <MapPin size={13} className="club-badge__pin" />
          <span className="club-badge__city">{user.city}</span>
          <ChevronRight size={14} className="club-badge__chevron" />
        </button>
      </header>

      <section className="home-section" aria-label="Ближайшая тренировка">
        <BookingCard booking={activeBooking} nextSlot={nextSlot} />
      </section>

      <section className="home-section" aria-label="Загрузка зала">
        <CapacityIndicator occupied={capacity.occupied} limit={capacity.limit} />
      </section>

      <section className="home-section" aria-label="Новости зала">
        <GymNewsWidget />
      </section>

      {showClubModal && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setShowClubModal(false)}
        >
          <div
            className="modal club-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="club-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="modal__close"
              onClick={() => setShowClubModal(false)}
              aria-label="Закрыть"
            >
              <X size={20} />
            </button>
            <span className="eyebrow">Локация клуба</span>
            <h2 id="club-modal-title">Железный Рюрик</h2>
            <div className="club-modal__details">
              <p><strong>Адрес:</strong> Великий Новгород, ул. Большая Санкт-Петербургская, 28</p>
              <p><strong>Режим работы:</strong> 07:00 – 22:00, ежедневно</p>
              <p><strong>Правило посещения:</strong> только по предварительной записи. Одновременно в зале тренируются не более 8 человек.</p>
            </div>
            <Button
              onClick={() => setShowClubModal(false)}
              className="button--primary"
              style={{ width: '100%', marginTop: '16px' }}
            >
              Понятно
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

