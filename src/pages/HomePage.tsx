import { useQuery } from '@tanstack/react-query'
import { AlertCircle, ChevronRight, MapPin, X } from 'lucide-react'
import { useState } from 'react'
import { BookingCard } from '../components/BookingCard'
import { CapacityIndicator } from '../components/CapacityIndicator'
import { GymNewsWidget } from '../components/GymNewsWidget'
import { Button, Divider, Modal, Skeleton } from '../components/ui'
import { getHomeData } from '../api/home'
import { getScheduleData } from '../api/schedule'

export function HomePage() {
  const homeQuery = useQuery({ queryKey: ['home'], queryFn: getHomeData })
  const scheduleQuery = useQuery({ queryKey: ['schedule'], queryFn: getScheduleData })
  const [showClubModal, setShowClubModal] = useState(false)

  if (homeQuery.isLoading || scheduleQuery.isLoading) {
    return (
      <div className="page home-page home-page--skeleton" aria-busy="true" aria-label="Загрузка главной страницы">
        {/* Header skeleton */}
        <header className="home-header">
          <div className="home-header__greeting">
            <Skeleton style={{ width: '84px', height: '12px', marginBottom: '8px' }} />
            <Skeleton style={{ width: '190px', height: '38px', marginBottom: '8px' }} />
          </div>
          <Skeleton style={{ width: '130px', height: '28px', borderRadius: '4px' }} />
        </header>

        {/* Hero Workout skeleton */}
        <div className="hero-workout hero-workout--skeleton" aria-hidden="true">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <Skeleton style={{ width: '70px', height: '12px' }} />
            <Skeleton style={{ width: '110px', height: '12px' }} />
          </div>
          <Skeleton style={{ width: '230px', height: '54px', marginBottom: '14px' }} />
          <Skeleton style={{ width: '170px', height: '20px', marginBottom: '6px' }} />
          <Skeleton style={{ width: '130px', height: '14px', marginBottom: '20px' }} />
          <Skeleton style={{ width: '100%', height: '50px', borderRadius: '3px' }} />
        </div>

        <Divider />

        {/* Capacity skeleton */}
        <div className="capacity-section capacity-section--skeleton" aria-hidden="true">
          <Skeleton style={{ width: '110px', height: '12px', marginBottom: '14px' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
            <Skeleton style={{ width: '56px', height: '36px' }} />
            <Skeleton style={{ flex: 1, height: '8px' }} />
          </div>
          <Skeleton style={{ width: '150px', height: '14px' }} />
        </div>

        <Divider />

        {/* News skeleton */}
        <div className="gym-news-feed gym-news-feed--skeleton" aria-hidden="true">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
            <Skeleton style={{ width: '90px', height: '12px' }} />
            <Skeleton style={{ width: '80px', height: '14px' }} />
          </div>
          <Skeleton style={{ width: '100%', height: '180px', marginBottom: '16px', borderRadius: '2px' }} />
          <Skeleton style={{ width: '90%', height: '14px', marginBottom: '8px' }} />
          <Skeleton style={{ width: '70%', height: '14px' }} />
        </div>
      </div>
    )
  }

  if (homeQuery.isError || !homeQuery.data) {
    return (
      <div className="page home-page">
        <div className="schedule-state-card schedule-state-card--error" role="alert">
          <AlertCircle size={32} className="schedule-state-card__icon" aria-hidden="true" />
          <h1 className="schedule-state-card__title">Не удалось загрузить главную</h1>
          <p className="schedule-state-card__text">
            Проверьте соединение с интернетом и попробуйте снова.
          </p>
          <button
            type="button"
            className="button button--primary"
            onClick={() => {
              void Promise.all([homeQuery.refetch(), scheduleQuery.refetch()])
            }}
          >
            Повторить
          </button>
        </div>
      </div>
    )
  }

  const { user, activeBooking, capacity } = homeQuery.data
  const now = new Date()
  const slots = scheduleQuery.data?.slots ?? []
  const futureSlots = slots.filter((slot) => new Date(slot.endIso) > now && !slot.isBlocked)
  const nextSlot = futureSlots.find((slot) => slot.occupied < slot.capacity) ?? futureSlots[0] ?? null

  return (
    <div className="page home-page">
      {/* 1. Header: Greeting, User Name, Location Control */}
      <header className="home-header">
        <div className="home-header__greeting">
          <span className="eyebrow home-header__eyebrow">ДОБРЫЙ ДЕНЬ</span>
          <h1 className="home-user-name">{user.name}</h1>
        </div>

        <button
          type="button"
          className="home-location-btn"
          onClick={() => setShowClubModal(true)}
          aria-label={`Выбранный клуб: ${user.city}. Нажмите, чтобы посмотреть подробности.`}
        >
          <MapPin size={13} className="home-location-btn__pin" aria-hidden="true" />
          <span className="home-location-btn__city">{user.city}</span>
          <ChevronRight size={14} className="home-location-btn__chevron" aria-hidden="true" />
        </button>
      </header>

      {/* 2. Hero Workout (Cardless / Surface-based) */}
      <section className="home-section" aria-label="Ближайшая тренировка">
        <BookingCard
          booking={activeBooking}
          nextSlot={nextSlot}
          isScheduleError={Boolean(scheduleQuery.isError && !activeBooking)}
          onRetrySchedule={() => void scheduleQuery.refetch()}
        />
      </section>

      <Divider />

      {/* 3. Gym Capacity (Cardless Open Section) */}
      <section className="home-section" aria-label="Загрузка зала">
        <CapacityIndicator occupied={capacity.occupied} limit={capacity.limit} />
      </section>

      <Divider />

      {/* 4. Gym News (Editorial Content Feed) */}
      <section className="home-section" aria-label="Новости зала">
        <GymNewsWidget />
      </section>

      {/* Club Location Info Modal */}
      <Modal
        isOpen={showClubModal}
        onClose={() => setShowClubModal(false)}
        titleId="club-modal-title"
        className="club-modal"
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
          <p><strong>Правило посещения:</strong> только по предварительной записи. Одновременно в зале тренируются не более {capacity.limit} человек.</p>
        </div>
        <Button
          onClick={() => setShowClubModal(false)}
          className="button--primary"
          style={{ width: '100%', marginTop: '16px' }}
        >
          Понятно
        </Button>
      </Modal>
    </div>
  )
}
