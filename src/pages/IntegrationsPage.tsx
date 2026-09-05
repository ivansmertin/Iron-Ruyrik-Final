import { ArrowLeft, Check, RefreshCw, Smartphone, Watch, Zap } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, PageHeader } from '../components/ui'

interface IntegrationItem {
  id: string
  name: string
  category: string
  description: string
  icon: typeof Smartphone
  connected: boolean
  lastSync?: string
}

const initialIntegrations: IntegrationItem[] = [
  {
    id: 'apple_health',
    name: 'Apple Health',
    category: 'iOS / WatchOS',
    description: 'Автоматический импорт веса, процента жира, пульса и тренировок из Apple Watch и умных весов.',
    icon: Smartphone,
    connected: true,
    lastSync: 'Сегодня, 08:30',
  },
  {
    id: 'health_connect',
    name: 'Health Connect',
    category: 'Android / Wear OS',
    description: 'Единый шлюз данных для Google Fit, Samsung Health и фитнес-часов на Android.',
    icon: Smartphone,
    connected: false,
  },
  {
    id: 'garmin',
    name: 'Garmin Connect',
    category: 'Garmin Ecosystem',
    description: 'Прямой импорт тренировочной нагрузки, вариабельности пульса (HRV) и восстановления Body Battery.',
    icon: Watch,
    connected: false,
  },
  {
    id: 'xiaomi',
    name: 'Xiaomi / Zepp Life',
    category: 'Mi Band / Smart Scales',
    description: 'Синхронизация биоимпедансных весов Mi Body Composition Scale и браслетов Mi Band.',
    icon: Zap,
    connected: true,
    lastSync: 'Вчера, 21:15',
  },
]

export function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<IntegrationItem[]>(() => {
    try {
      const saved = localStorage.getItem('ryrik_integrations')
      return saved ? (JSON.parse(saved) as IntegrationItem[]) : initialIntegrations
    } catch {
      return initialIntegrations
    }
  })

  const [isSyncing, setIsSyncing] = useState(false)
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null)

  const toggleConnection = (id: string) => {
    setIntegrations((prev) => {
      const updated = prev.map((item) => {
        if (item.id === id) {
          const nextConnected = !item.connected
          return {
            ...item,
            connected: nextConnected,
            lastSync: nextConnected ? 'Только что' : undefined,
          }
        }
        return item
      })
      try {
        localStorage.setItem('ryrik_integrations', JSON.stringify(updated))
      } catch {
        // ignore storage errors
      }
      return updated
    })
  }

  const handleManualSync = () => {
    setIsSyncing(true)
    setSyncFeedback(null)
    setTimeout(() => {
      setIsSyncing(false)
      setIntegrations((prev) =>
        prev.map((item) => (item.connected ? { ...item, lastSync: 'Только что' } : item))
      )
      setSyncFeedback('Данные успешно синхронизированы')
      setTimeout(() => setSyncFeedback(null), 3000)
    }, 1200)
  }

  const connectedCount = integrations.filter((i) => i.connected).length

  return (
    <div className="page integrations-page">
      <Link to="/profile" className="back-link" aria-label="Назад в профиль">
        <ArrowLeft size={18} aria-hidden="true" />
        <span>Профиль</span>
      </Link>

      <PageHeader
        eyebrow="Синхронизация"
        title="Источники данных"
        action={
          <span className="integrations-counter">
            {connectedCount} из {integrations.length} активно
          </span>
        }
      />

      <p className="integrations-intro">
        Подключите спортивные трекеры и умные весы. Показатели будут автоматически обновлять динамику в разделе «Мой прогресс».
      </p>

      <div className="integrations-list" role="list">
        {integrations.map((item) => {
          const Icon = item.icon
          return (
            <Card
              key={item.id}
              className={`integration-item ${item.connected ? 'is-connected' : ''}`}
            >
              <div className="integration-item__head">
                <div className="integration-item__icon" aria-hidden="true">
                  <Icon size={20} />
                </div>
                <div className="integration-item__meta">
                  <span className="eyebrow integration-item__category">{item.category}</span>
                  <h3 className="integration-item__name">{item.name}</h3>
                </div>

                <button
                  type="button"
                  className={`switch ${item.connected ? 'is-on' : ''}`}
                  onClick={() => toggleConnection(item.id)}
                  role="switch"
                  aria-checked={item.connected}
                  aria-label={`${item.name}, ${item.connected ? 'подключено' : 'отключено'}`}
                />
              </div>

              <p className="integration-item__desc">{item.description}</p>

              <div className="integration-item__footer">
                {item.connected ? (
                  <span className="integration-status integration-status--active">
                    <Check size={13} aria-hidden="true" />
                    <span>Подключено {item.lastSync && `· Синхр. ${item.lastSync}`}</span>
                  </span>
                ) : (
                  <span className="integration-status integration-status--idle">
                    Не подключено
                  </span>
                )}
              </div>
            </Card>
          )
        })}
      </div>

      <div className="integrations-actions">
        <Button
          type="button"
          className="button button--secondary integrations-sync-btn"
          onClick={handleManualSync}
          disabled={isSyncing || connectedCount === 0}
        >
          <RefreshCw size={16} className={isSyncing ? 'spin-animation' : ''} aria-hidden="true" />
          <span>{isSyncing ? 'Синхронизация...' : 'Синхронизировать сейчас'}</span>
        </Button>
        {syncFeedback && (
          <p className="inline-note integrations-feedback" role="status">
            {syncFeedback}
          </p>
        )}
      </div>
    </div>
  )
}
