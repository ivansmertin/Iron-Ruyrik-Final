import { useQuery } from '@tanstack/react-query'
import {
  AlertCircle,
  Bell,
  ChevronRight,
  Info,
  LogOut,
  MapPin,
  ShieldCheck,
  UserRound,
  Watch,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getProfileData } from '../api/profile'
import { MembershipCard } from '../components/MembershipCard'
import {
  Divider,
  Modal,
  PageHeader,
  Section,
  SectionHeader,
  Skeleton,
} from '../components/ui'

export function ProfilePage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['profile'],
    queryFn: getProfileData,
  })

  const [showAllHistory, setShowAllHistory] = useState(false)
  const [showAbout, setShowAbout] = useState(false)

  if (isLoading) {
    return (
      <div className="page profile-page" aria-busy="true" aria-label="Загрузка профиля">
        <PageHeader title="Профиль" />
        <Skeleton className="profile-identity-skeleton" aria-hidden="true" />
        <Skeleton className="membership-skeleton" aria-hidden="true" />
        <Skeleton className="history-skeleton" aria-hidden="true" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="page profile-page">
        <PageHeader title="Профиль" />
        <div className="schedule-state-card schedule-state-card--error" role="alert">
          <AlertCircle size={32} className="schedule-state-card__icon" aria-hidden="true" />
          <h3 className="schedule-state-card__title">Не удалось загрузить данные профиля</h3>
          <p className="schedule-state-card__text">Проверьте соединение с интернетом и попробуйте снова.</p>
          <button type="button" className="button button--primary" onClick={() => refetch()}>
            Повторить
          </button>
        </div>
      </div>
    )
  }

  const isAdmin = data.user.role === 'admin'
  const visibleHistory = data.history.slice(0, 3)

  return (
    <div className="page profile-page">
      <PageHeader title="Профиль" />

      {/* 1. User Identity Section (cardless row layout) */}
      <Section
        className="profile-identity-section"
        aria-label={`Профиль: ${data.user.name}, ${data.user.city}`}
      >
        <div className="profile-avatar" aria-hidden="true">
          <UserRound size={26} />
        </div>
        <div className="profile-identity__info">
          <span className="eyebrow">{isAdmin ? 'АДМИНИСТРАТОР' : 'СПОРТСМЕН'}</span>
          <h2 className="profile-identity__name">{data.user.name}</h2>
          <span className="profile-identity__city">
            <MapPin size={14} aria-hidden="true" /> {data.user.city}
          </span>
        </div>
      </Section>

      <Divider />

      {/* 2. Membership Card */}
      <MembershipCard membership={data.membership} />

      <Divider />

      {/* 3. Visit History Section (max 3 items on profile screen) */}
      <Section aria-label="История посещений" className="profile-history-section">
        <SectionHeader
          title="История посещений"
          eyebrow="ТРЕНИРОВКИ"
          detail={
            data.history.length > 0 ? (
              <button
                type="button"
                className="text-button"
                onClick={() => setShowAllHistory(true)}
                aria-label="Показать всю историю посещений"
              >
                Вся история
              </button>
            ) : undefined
          }
        />

        {data.history.length === 0 ? (
          <div className="history-list history-list--empty cardless-history-empty">
            <div className="history-empty">
              <p className="history-empty__text">Пока нет посещений</p>
              <Link to="/schedule" className="button button--secondary button--sm">
                Записаться на тренировку
              </Link>
            </div>
          </div>
        ) : (
          <div className="history-list cardless-history-list" role="region" aria-label="Последние посещения">
            {visibleHistory.map((item) => (
              <div key={item.id} className="history-row">
                <div className="history-row__datetime">
                  <strong className="history-row__date">{item.dateLabel}</strong>
                  <span className="history-row__time">{item.time}</span>
                </div>
                <span className="history-row__trainer">
                  {item.trainerName ?? 'Самостоятельно'}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Divider />

      {/* 4. Settings Section */}
      <Section aria-label="Сервисы и система" className="profile-settings-section">
        <SectionHeader title="Сервисы и система" eyebrow="СИСТЕМА" />
        <div className="settings-list cardless-settings-list" role="region" aria-label="Сервисы и система">
          {/* Admin panel item ONLY shown to admins */}
          {isAdmin && (
            <Link to="/admin" className="settings-row" aria-label="Перейти в админ-панель">
              <ShieldCheck size={20} aria-hidden="true" />
              <span>
                Админ-панель
                <small>Управление расписанием и залом</small>
              </span>
              <ChevronRight size={19} aria-hidden="true" />
            </Link>
          )}

          {/* Integrations row (M02 real entry point) */}
          <Link to="/integrations" className="settings-row" aria-label="Подключить фитнес-трекеры и весы">
            <Watch size={20} aria-hidden="true" />
            <span>
              Источники данных
              <small>Apple Health, Garmin, Xiaomi</small>
            </span>
            <ChevronRight size={19} aria-hidden="true" />
          </Link>

          {/* Notifications: honest unavailable state without fake toggle */}
          <div
            className="settings-row is-disabled"
            role="group"
            aria-label="Уведомления о тренировках: недоступно в веб-версии"
          >
            <Bell size={20} aria-hidden="true" />
            <span>
              Уведомления
              <small>Недоступно в веб-версии · Требуется приложение</small>
            </span>
            <span className="settings-badge" aria-hidden="true">
              Недоступно
            </span>
          </div>

          {/* About Application: renamed from "Настройки", reveals version info */}
          <button
            type="button"
            className="settings-row motion-pressable"
            onClick={() => setShowAbout((prev) => !prev)}
            aria-expanded={showAbout}
            aria-label="О приложении: сведения о версии и зале"
          >
            <Info size={20} aria-hidden="true" />
            <span>
              О приложении
              <small>Версия 0.1.0 · Великий Новгород</small>
            </span>
            <ChevronRight size={19} aria-hidden="true" />
          </button>

          {/* Logout boundary: honest disabled state without fake modal */}
          <div
            className="settings-row is-disabled"
            role="group"
            aria-label="Выход из профиля: автономный режим"
          >
            <LogOut size={20} aria-hidden="true" />
            <span>
              Выход из профиля
              <small>Автономный режим без серверной авторизации</small>
            </span>
          </div>
        </div>
      </Section>

      {showAbout && (
        <p className="inline-note" role="status">
          Приложение «Железный Рюрик» · Версия 0.1.0 · Великий Новгород, ул. Большая Санкт-Петербургская
        </p>
      )}

      {/* Full History Modal */}
      <Modal
        isOpen={showAllHistory}
        onClose={() => setShowAllHistory(false)}
        titleId="history-modal-title"
        className="history-modal"
      >
        <div className="history-modal__header">
          <h2 id="history-modal-title">Вся история посещений</h2>
          <button
            type="button"
            className="modal__close"
            onClick={() => setShowAllHistory(false)}
            aria-label="Закрыть историю"
          >
            <X size={20} />
          </button>
        </div>
        <div className="history-modal__body">
          <div className="history-list cardless-history-list">
            {data.history.map((item) => (
              <div key={item.id} className="history-row">
                <div className="history-row__datetime">
                  <strong className="history-row__date">{item.dateLabel}</strong>
                  <span className="history-row__time">{item.time}</span>
                </div>
                <span className="history-row__trainer">
                  {item.trainerName ?? 'Самостоятельно'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  )
}
