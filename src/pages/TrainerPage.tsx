import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { TrainerAvatar } from '../components/TrainerCard'
import { Button, ButtonLink, Skeleton } from '../components/ui'
import { getScheduleData } from '../api/schedule'
import { getTrainers } from '../api/trainers'
import { isSupportedBookingTrainer } from '../types/domain'
import { cleanSpecialty } from '../utils/formatters'

export function TrainerPage() {
  const { id } = useParams<{ id: string }>()

  const trainersQuery = useQuery({
    queryKey: ['trainers'],
    queryFn: getTrainers,
  })

  const scheduleQuery = useQuery({
    queryKey: ['schedule'],
    queryFn: getScheduleData,
  })

  // 1. Loading State
  if (trainersQuery.isLoading) {
    return (
      <div
        className="page trainer-detail-page trainer-detail-page--loading"
        aria-busy="true"
        aria-label="Загрузка профиля тренера"
      >
        <div className="back-link back-link--skeleton">
          <Skeleton style={{ width: '120px', height: '24px' }} />
        </div>
        <div className="trainer-hero trainer-hero--skeleton">
          <Skeleton className="trainer-hero__avatar-skeleton" />
          <div className="trainer-hero__info">
            <Skeleton style={{ width: '60px', height: '12px', marginBottom: '8px' }} />
            <Skeleton style={{ width: '220px', height: '36px' }} />
          </div>
        </div>
        <Skeleton style={{ width: '100%', height: '48px', marginTop: '16px' }} />
        <div style={{ marginTop: '28px' }}>
          <Skeleton style={{ width: '140px', height: '20px', marginBottom: '14px' }} />
          <Skeleton style={{ width: '100%', height: '60px' }} />
        </div>
      </div>
    )
  }

  // 2. Error State (Network error loading trainers)
  if (trainersQuery.isError) {
    return (
      <div className="page trainer-detail-page">
        <Link to="/trainers" viewTransition className="back-link">
          <ArrowLeft size={19} aria-hidden="true" />
          <span>Все тренеры</span>
        </Link>
        <div className="trainer-profile-state trainer-profile-state--error" role="alert">
          <p className="trainer-profile-state__message">
            Не удалось загрузить профиль тренера. Проверьте соединение и повторите попытку.
          </p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => trainersQuery.refetch()}
            disabled={trainersQuery.isFetching}
            className="trainer-profile-state__btn"
          >
            <RefreshCw
              size={16}
              className={trainersQuery.isFetching ? 'animate-spin' : ''}
              aria-hidden="true"
            />
            <span>{trainersQuery.isFetching ? 'Загрузка…' : 'Повторить попытку'}</span>
          </Button>
        </div>
      </div>
    )
  }

  const trainer = trainersQuery.data?.find((item) => item.id === id)

  // 3. Not Found State (Trainer genuinely unknown in roster)
  if (!trainer) {
    return (
      <div className="page trainer-detail-page">
        <Link to="/trainers" viewTransition className="back-link">
          <ArrowLeft size={19} aria-hidden="true" />
          <span>Все тренеры</span>
        </Link>
        <div className="trainer-profile-state trainer-profile-state--not-found" role="status">
          <p className="trainer-profile-state__message">
            Тренер не найден. Возможно, профиль был перемещен или удален.
          </p>
          <ButtonLink to="/trainers" variant="secondary" className="trainer-profile-state__btn">
            Вернуться к списку тренеров
          </ButtonLink>
        </div>
      </div>
    )
  }

  const isBookingSupported = isSupportedBookingTrainer(trainer.id)
  const specialties = trainer.specialties.map(cleanSpecialty).filter(Boolean)

  // Future unblocked slots calculation
  const now = new Date()
  const futureSlots =
    scheduleQuery.data?.slots.filter((slot) => {
      const isFuture = new Date(slot.endIso).getTime() > now.getTime()
      return isFuture && !slot.isBlocked
    }) ?? []
  const nextAvailableSlot = futureSlots.find((slot) => slot.occupied < slot.capacity)

  return (
    <div className="page trainer-detail-page">
      {/* Back Link */}
      <Link to="/trainers" viewTransition className="back-link" aria-label="Вернуться ко всем тренерам">
        <ArrowLeft size={19} aria-hidden="true" />
        <span>Все тренеры</span>
      </Link>

      {/* Hero Identity Section */}
      <section className="trainer-hero" aria-label={`Профиль: ${trainer.name}`}>
        <TrainerAvatar
          trainer={trainer}
          className="trainer-hero__avatar"
          style={{ viewTransitionName: `trainer-avatar-${trainer.id}` }}
        />
        <div className="trainer-hero__info">
          <span className="eyebrow trainer-hero__eyebrow">ТРЕНЕР</span>
          <h1
            className="trainer-hero__name"
            style={{ viewTransitionName: `trainer-name-${trainer.id}` }}
          >
            {trainer.name}
          </h1>
        </div>
      </section>

      {/* Primary Action */}
      {isBookingSupported ? (
        <ButtonLink
          to={`/schedule?trainer=${trainer.id}`}
          viewTransition
          variant="primary"
          className="trainer-profile-cta"
          aria-label={`Выбрать время тренировки с ${trainer.name}`}
        >
          Выбрать время
        </ButtonLink>
      ) : (
        <div className="trainer-profile-unsupported-note" role="note">
          <p className="trainer-profile-unsupported-note__text">
            Запись к этому тренеру через приложение временно недоступна.
          </p>
        </div>
      )}

      {/* Directions Section (Single substantive specialties list, no duplicate chips) */}
      {specialties.length > 0 && (
        <section className="trainer-profile-section trainer-directions" aria-label="Направления">
          <h2 className="trainer-profile-section__title">Направления</h2>
          <ul className="trainer-directions__list" aria-label={`Направления: ${trainer.name}`}>
            {specialties.map((spec) => (
              <li key={spec} className="trainer-directions__item">
                <span className="trainer-directions__bullet" aria-hidden="true">·</span>
                <span>{spec}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* About Section */}
      {trainer.about && (
        <section className="trainer-profile-section trainer-about" aria-label="О тренере">
          <h2 className="trainer-profile-section__title">О тренере</h2>
          <p className="trainer-about__text">{trainer.about}</p>
        </section>
      )}

      {/* Telegram Channel Section (Editorial block for Dima, no blue icon box) */}
      {trainer.id === 'dima' && (
        <section className="trainer-profile-section trainer-channel" aria-label="Telegram-канал">
          <div className="trainer-channel__header">
            <span className="eyebrow trainer-channel__eyebrow">TELEGRAM-КАНАЛ</span>
            <h3 className="trainer-channel__title">Говер на движениях</h3>
          </div>
          <p className="trainer-channel__desc">
            Авторский блог о спорте, триатлоне, забегах и подготовке атлетов в Великом Новгороде.
          </p>
          <a
            href="https://t.me/goverrun"
            target="_blank"
            rel="noopener noreferrer"
            className="button button--secondary trainer-channel__btn"
            aria-label="Перейти в Telegram-канал Говер на движениях"
          >
            <span>Перейти в @goverrun</span>
          </a>
        </section>
      )}

      {/* Next Slot Section (Compact actionable row with honest caption) */}
      <section className="trainer-profile-section trainer-next-slot-section" aria-label="Ближайшее время в зале">
        {scheduleQuery.isLoading && (
          <div
            className="trainer-next-slot-row trainer-next-slot-row--loading"
            aria-busy="true"
            aria-label="Загрузка расписания"
          >
            <Skeleton style={{ width: '100%', height: '52px' }} />
          </div>
        )}

        {!scheduleQuery.isLoading && scheduleQuery.isError && (
          <div className="trainer-next-slot-row trainer-next-slot-row--error">
            <div className="trainer-next-slot-row__info">
              <span className="trainer-next-slot-row__label">БЛИЖАЙШЕЕ ВРЕМЯ В ЗАЛЕ</span>
              <p className="trainer-next-slot-row__desc">Не удалось загрузить ближайшие слоты</p>
            </div>
            <ButtonLink
              to="/schedule"
              variant="secondary"
              className="trainer-next-slot-row__btn"
              aria-label="Открыть расписание"
            >
              Расписание
            </ButtonLink>
          </div>
        )}

        {!scheduleQuery.isLoading && !scheduleQuery.isError && nextAvailableSlot && (
          <div className="trainer-next-slot-row">
            <div className="trainer-next-slot-row__info">
              <span className="trainer-next-slot-row__label">БЛИЖАЙШЕЕ ВРЕМЯ В ЗАЛЕ</span>
              <strong className="trainer-next-slot-row__time">
                {nextAvailableSlot.dateLabel}, {nextAvailableSlot.startAt}–{nextAvailableSlot.endAt}
              </strong>
            </div>
            {isBookingSupported ? (
              <ButtonLink
                to={`/booking/${nextAvailableSlot.id}?trainer=${trainer.id}`}
                viewTransition
                variant="secondary"
                className="trainer-next-slot-row__btn"
                aria-label={`Выбрать слот ${nextAvailableSlot.startAt} ${nextAvailableSlot.dateLabel}`}
              >
                Выбрать
              </ButtonLink>
            ) : (
              <ButtonLink
                to="/schedule"
                viewTransition
                variant="secondary"
                className="trainer-next-slot-row__btn"
                aria-label="Открыть общее расписание"
              >
                Расписание
              </ButtonLink>
            )}
          </div>
        )}

        {!scheduleQuery.isLoading && !scheduleQuery.isError && !nextAvailableSlot && (
          <div className="trainer-next-slot-row trainer-next-slot-row--empty">
            <div className="trainer-next-slot-row__info">
              <span className="trainer-next-slot-row__label">БЛИЖАЙШЕЕ ВРЕМЯ В ЗАЛЕ</span>
              <p className="trainer-next-slot-row__desc">На ближайшие дни свободных мест нет</p>
            </div>
            <ButtonLink
              to="/schedule"
              variant="secondary"
              className="trainer-next-slot-row__btn"
              aria-label="Смотреть всё расписание"
            >
              Все слоты
            </ButtonLink>
          </div>
        )}
      </section>
    </div>
  )
}
