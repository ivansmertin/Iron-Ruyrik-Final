import { useQuery } from '@tanstack/react-query'
import { Bell, ChevronRight, LogOut, MapPin, Settings, ShieldCheck, UserRound, Watch, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MembershipCard } from '../components/MembershipCard'
import { Button, Card, LoadingPage, PageHeader, SectionHeader } from '../components/ui'
import { getProfileData } from '../api/profile'

export function ProfilePage() {
  const { data, isLoading } = useQuery({ queryKey: ['profile'], queryFn: getProfileData })

  const [notifications, setNotifications] = useState(() => {
    try {
      const saved = localStorage.getItem('ryrik_notifications_enabled')
      return saved !== null ? (JSON.parse(saved) as boolean) : true
    } catch {
      return true
    }
  })

  const [isPushDenied, setIsPushDenied] = useState(false)
  const [showAllHistory, setShowAllHistory] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'denied') {
        setIsPushDenied(true)
      }
    }
  }, [])

  // Close modals on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowAllHistory(false)
        setShowLogoutConfirm(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  if (isLoading || !data) return <LoadingPage label="Загружаем профиль" />

  const isAdmin = data.user.role === 'admin'
  const visibleHistory = data.history.slice(0, 3)

  const toggleNotifications = () => {
    if (isPushDenied) return
    setNotifications((prev) => {
      const next = !prev
      try {
        localStorage.setItem('ryrik_notifications_enabled', JSON.stringify(next))
      } catch {
        // ignore storage errors
      }
      return next
    })
  }

  return (
    <div className="page profile-page">
      <PageHeader title="Профиль" />

      {/* 1. User Identity Card (non-editable, no false chevron affordance) */}
      <Card className="profile-identity" role="region" aria-label={`Профиль: ${data.user.name}, ${data.user.city}`}>
        <div className="profile-avatar" aria-hidden="true">
          <UserRound size={26} />
        </div>
        <div className="profile-identity__info">
          <h2>{data.user.name}</h2>
          <span>
            <MapPin size={14} aria-hidden="true" /> {data.user.city}
          </span>
        </div>
      </Card>

      {/* 2. Membership Card */}
      <MembershipCard membership={data.membership} />

      {/* 3. Visit History Section (max 3 items on profile screen) */}
      <section aria-label="История посещений">
        <SectionHeader
          title="История посещений"
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
          <Card className="history-list history-list--empty">
            <div className="history-empty">
              <p className="history-empty__text">Пока нет посещений</p>
              <Link to="/schedule" className="button button--secondary button--sm">
                Записаться на тренировку
              </Link>
            </div>
          </Card>
        ) : (
          <Card className="history-list" role="region" aria-label="Последние посещения">
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
          </Card>
        )}
      </section>

      {/* 4. Settings Section */}
      <Card className="settings-list" role="region" aria-label="Настройки">
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

        {/* Notifications toggle row */}
        <button
          type="button"
          className={`settings-row ${isPushDenied ? 'is-disabled' : ''}`}
          onClick={toggleNotifications}
          disabled={isPushDenied}
          role="switch"
          aria-checked={!isPushDenied && notifications}
          aria-label={`Уведомления о тренировках, ${
            isPushDenied ? 'запрещены в настройках устройства' : notifications ? 'включены' : 'выключены'
          }`}
        >
          <Bell size={20} aria-hidden="true" />
          <span>
            Уведомления
            <small>
              {isPushDenied
                ? 'Уведомления запрещены в настройках устройства'
                : 'Напоминания о тренировках'}
            </small>
          </span>
          <span
            className={`switch ${!isPushDenied && notifications ? 'is-on' : ''} ${
              isPushDenied ? 'is-disabled' : ''
            }`}
            aria-hidden="true"
          />
        </button>

        {/* Integrations row */}
        <Link to="/integrations" className="settings-row" aria-label="Подключить фитнес-трекеры и весы">
          <Watch size={20} aria-hidden="true" />
          <span>
            Источники данных
            <small>Apple Health, Garmin, Xiaomi</small>
          </span>
          <ChevronRight size={19} aria-hidden="true" />
        </Link>

        {/* Application settings row */}
        <button
          type="button"
          className="settings-row"
          onClick={() => setMessage('Приложение «Железный Рюрик» · Версия 0.1.0 · Великий Новгород')}
          aria-label="Открыть настройки приложения"
        >
          <Settings size={20} aria-hidden="true" />
          <span>Настройки</span>
          <ChevronRight size={19} aria-hidden="true" />
        </button>
      </Card>

      {message && (
        <p className="inline-note" role="status">
          {message}
        </p>
      )}

      {/* 5. Logout Button (Semantic destructive, visually separated) */}
      <Button
        variant="ghost"
        className="logout-button"
        onClick={() => setShowLogoutConfirm(true)}
        aria-label="Выйти из аккаунта"
      >
        <LogOut size={18} aria-hidden="true" />
        <span>Выйти</span>
      </Button>

      {/* Full History Modal */}
      {showAllHistory && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="history-modal-title"
          onClick={() => setShowAllHistory(false)}
        >
          <div className="modal history-modal" onClick={(e) => e.stopPropagation()}>
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
              <div className="history-list history-list--modal">
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
          </div>
        </div>
      )}

      {/* Logout Confirmation Dialog */}
      {showLogoutConfirm && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="logout-dialog-title"
          onClick={() => setShowLogoutConfirm(false)}
        >
          <div className="modal logout-modal" onClick={(e) => e.stopPropagation()}>
            <h2 id="logout-dialog-title">Выход из аккаунта</h2>
            <p>Вы действительно хотите выйти из профиля «{data.user.name}»?</p>
            <div className="logout-modal__actions">
              <Button
                variant="secondary"
                onClick={() => setShowLogoutConfirm(false)}
              >
                Отмена
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  setShowLogoutConfirm(false)
                  setMessage('В прототипе вы остаётесь в профиле Алексея')
                }}
              >
                Выйти
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
