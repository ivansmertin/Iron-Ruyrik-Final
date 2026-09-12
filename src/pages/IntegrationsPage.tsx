import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Info,
  Loader2,
  RefreshCw,
  Shield,
  Smartphone,
  Watch,
  Zap,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button, Card, PageHeader } from '../components/ui'
import { Modal } from '../components/Modal'
import {
  formatLastSync,
  useHealthSources,
} from '../hooks/useHealthSources'
import { HEALTH_PERMISSION_EXPLANATION } from '../services/healthBridge'
import type { HealthSourceProvider } from '../types/health'

export function IntegrationsPage() {
  const {
    sources,
    isLoading,
    error,
    refetch,
    isNative,
    platform,
    activeProviderForPermission,
    disconnectConfirmProvider,
    bridgeNotice,
    syncFeedback,
    isSyncing,
    isConnecting,
    isDisconnecting,
    startConnect,
    confirmPermission,
    cancelPermission,
    startDisconnect,
    confirmDisconnect,
    cancelDisconnect,
    handleManualSync,
  } = useHealthSources()

  if (error) {
    return (
      <div className="page integrations-page">
        <Link to="/profile" className="back-link" aria-label="Назад в профиль">
          <ArrowLeft size={18} aria-hidden="true" />
          <span>Профиль</span>
        </Link>

        <PageHeader
          eyebrow="Синхронизация"
          title="Источники данных"
        />

        <div className="schedule-state-card schedule-state-card--error" role="alert" style={{ marginTop: '24px' }}>
          <AlertCircle size={32} className="schedule-state-card__icon" aria-hidden="true" />
          <h2 className="schedule-state-card__title">Не удалось загрузить источники данных</h2>
          <p className="schedule-state-card__text">
            Проверьте соединение с интернетом и попробуйте снова.
          </p>
          <Button
            type="button"
            className="button--primary"
            onClick={() => void refetch()}
          >
            Повторить
          </Button>
        </div>
      </div>
    )
  }

  const appleSource = sources.find((s) => s.provider === 'apple_health')
  const healthConnectSource = sources.find((s) => s.provider === 'health_connect')
  const garminSource = sources.find((s) => s.provider === 'garmin')

  const isAppleConnected = appleSource?.status === 'connected'
  const isHealthConnectConnected = healthConnectSource?.status === 'connected'
  const isGarminConnected = garminSource?.status === 'connected'
  const isXiaomiGatewayConnected = isAppleConnected || isHealthConnectConnected

  const integrationsList = [
    {
      id: 'apple_health' as HealthSourceProvider,
      name: 'Apple Health',
      category: 'iOS / WatchOS',
      description:
        'Автоматический импорт веса, процента жира, пульса и тренировок из Apple Watch и умных весов.',
      icon: Smartphone,
      connected: isAppleConnected,
      lastSync: isAppleConnected ? formatLastSync(appleSource?.lastSyncedAt) : undefined,
      requiresNativeBridge: true,
      isSystemBridge: true,
    },
    {
      id: 'health_connect' as HealthSourceProvider,
      name: 'Health Connect',
      category: 'Android / Wear OS',
      description:
        'Единый шлюз данных для Google Fit, Samsung Health и фитнес-часов на Android.',
      icon: Smartphone,
      connected: isHealthConnectConnected,
      lastSync: isHealthConnectConnected
        ? formatLastSync(healthConnectSource?.lastSyncedAt)
        : undefined,
      requiresNativeBridge: true,
      isSystemBridge: true,
    },
    {
      id: 'garmin' as HealthSourceProvider,
      name: 'Garmin Connect',
      category: 'Спортивные часы',
      description:
        'Импорт треков тренировок, пульсовых зон, VO2 max и времени восстановления.',
      icon: Watch,
      connected: isGarminConnected,
      lastSync: isGarminConnected ? formatLastSync(garminSource?.lastSyncedAt) : undefined,
      requiresNativeBridge: false,
      isSoon: !isGarminConnected,
    },
    {
      id: 'xiaomi' as const,
      name: 'Xiaomi / Zepp Life',
      category: 'Mi Band / Smart Scales',
      description:
        'Синхронизация биоимпедансных весов Mi Body Composition Scale и браслетов Mi Band.',
      icon: Zap,
      connected: false,
      lastSync: isXiaomiGatewayConnected
        ? formatLastSync(appleSource?.lastSyncedAt || healthConnectSource?.lastSyncedAt)
        : undefined,
      requiresNativeBridge: true,
      isEcosystemAggregator: true,
    },
  ]

  const directIntegrations = integrationsList.filter((i) => !i.isEcosystemAggregator)
  const connectedCount = sources.filter((s) => s.status === 'connected').length

  const handleGlobalSync = () => {
    if (isAppleConnected) {
      void handleManualSync('apple_health')
    } else if (isHealthConnectConnected) {
      void handleManualSync('health_connect')
    } else if (isGarminConnected) {
      void handleManualSync('garmin')
    }
  }

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
            {connectedCount} из {directIntegrations.length} активно
          </span>
        }
      />

      <p className="integrations-intro">
        Подключите спортивные трекеры и умные весы. Показатели будут автоматически обновлять
        динамику в разделе «Мой прогресс».
      </p>

      {!isNative && (
        <div
          className="web-environment-banner"
          role="note"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            background: 'var(--surface-1)',
            border: '1px solid var(--border-dark)',
            borderRadius: 'var(--radius-control)',
            padding: '12px 14px',
            marginBottom: '16px',
            fontSize: '0.82rem',
            lineHeight: 1.45,
            color: 'var(--text-secondary)',
          }}
        >
          <Info
            size={18}
            style={{ color: 'var(--brand-yellow)', flexShrink: 0, marginTop: '2px' }}
            aria-hidden="true"
          />
          <div>
            <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '2px' }}>
              Веб-окружение
            </strong>
            Прямое считывание Apple Health и Health Connect доступно только в нативном мобильном
            приложении. В браузере используйте ручной ввод замеров в разделе «Мой прогресс».
          </div>
        </div>
      )}

      {syncFeedback && (
        <div
          className={`sync-feedback-banner is-${syncFeedback.type}`}
          role="status"
          style={{
            padding: '10px 14px',
            borderRadius: 'var(--radius-control)',
            marginBottom: '16px',
            fontSize: '0.82rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background:
              syncFeedback.type === 'success'
                ? 'rgba(124, 203, 136, 0.15)'
                : syncFeedback.type === 'error'
                ? 'rgba(239, 68, 68, 0.15)'
                : 'rgba(255, 214, 38, 0.15)',
            color:
              syncFeedback.type === 'success'
                ? 'var(--status-positive)'
                : syncFeedback.type === 'error'
                ? 'var(--status-danger)'
                : 'var(--brand-yellow)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          {syncFeedback.type === 'success' && <CheckCircle2 size={16} />}
          {syncFeedback.type === 'error' && <AlertCircle size={16} />}
          {syncFeedback.type === 'info' && <Info size={16} />}
          <span>{syncFeedback.message}</span>
        </div>
      )}

      <div className="integrations-list" role="list">
        {isLoading && <p className="sources-empty">Загрузка источников данных...</p>}
        {integrationsList.map((item) => {
          const Icon = item.icon
          const isItemSyncing = isSyncing === item.id

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

                <div className="integration-item__actions">
                  {item.connected ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {item.isSystemBridge && (
                        <button
                          type="button"
                          className="icon-button"
                          title="Синхронизировать сейчас"
                          aria-label={`Синхронизировать ${item.name}`}
                          onClick={() => handleManualSync(item.id as HealthSourceProvider)}
                          disabled={isSyncing !== null}
                          style={{ width: '36px', height: '36px', padding: 0 }}
                        >
                          <RefreshCw
                            size={16}
                            className={isItemSyncing ? 'spin-animation' : ''}
                          />
                        </button>
                      )}
                      {item.id !== 'xiaomi' && (
                        <Button
                          type="button"
                          variant="ghost"
                          className="button--sm"
                          onClick={() => startDisconnect(item.id as HealthSourceProvider)}
                        >
                          Отключить
                        </Button>
                      )}
                    </div>
                  ) : item.isSoon ? (
                    <span className="source-badge is-soon" style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                      Скоро
                    </span>
                  ) : item.id === 'xiaomi' ? (
                    isXiaomiGatewayConnected ? (
                      <span className="source-badge is-connected" style={{ fontSize: '0.78rem', color: 'var(--status-positive)' }}>
                        Через {isAppleConnected ? 'Apple Health' : 'Health Connect'}
                      </span>
                    ) : (
                      <Button
                        type="button"
                        variant="secondary"
                        className="button--sm"
                        onClick={() =>
                          startConnect(platform === 'ios' ? 'apple_health' : 'health_connect')
                        }
                      >
                        Подключить шлюз
                      </Button>
                    )
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      className="button--sm"
                      onClick={() => startConnect(item.id as HealthSourceProvider)}
                    >
                      Подключить
                    </Button>
                  )}
                </div>
              </div>

              <p className="integration-item__desc">{item.description}</p>

              <div className="integration-item__footer">
                {item.id === 'xiaomi' ? (
                  isXiaomiGatewayConnected ? (
                    <span className="integration-status integration-status--active">
                      <Info size={13} aria-hidden="true" />
                      <span>
                        Данные весов поступают через {isAppleConnected ? 'Apple Health' : 'Health Connect'}
                        {item.lastSync ? ` · Синхр. ${item.lastSync}` : ''}
                      </span>
                    </span>
                  ) : (
                    <span className="integration-status integration-status--idle">
                      Требуется подключение Apple Health или Health Connect
                    </span>
                  )
                ) : item.connected ? (
                  <span className="integration-status integration-status--active">
                    <Check size={13} aria-hidden="true" />
                    <span>
                      Подключено {item.lastSync ? `· Синхр. ${item.lastSync}` : ''}
                    </span>
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
          onClick={handleGlobalSync}
          disabled={isSyncing !== null || connectedCount === 0}
        >
          <RefreshCw
            size={16}
            className={isSyncing !== null ? 'spin-animation' : ''}
            aria-hidden="true"
          />
          <span>{isSyncing !== null ? 'Синхронизация...' : 'Синхронизировать сейчас'}</span>
        </Button>
      </div>

      {/* Permission Explanation Modal */}
      {activeProviderForPermission && (
        <Modal
          isOpen={true}
          onClose={cancelPermission}
          titleId="permission-modal-title"
          className="permission-explainer-card"
        >
          <div className="permission-explainer__header" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <Shield size={24} className="permission-shield-icon" aria-hidden="true" />
            <h4 id="permission-modal-title" style={{ margin: 0, fontSize: '1.1rem' }}>
              {activeProviderForPermission === 'apple_health'
                ? HEALTH_PERMISSION_EXPLANATION.apple_health.title
                : HEALTH_PERMISSION_EXPLANATION.health_connect.title}
            </h4>
          </div>

          <p className="permission-explainer__text" style={{ color: 'var(--text-secondary)', fontSize: '0.86rem', lineHeight: 1.5, marginBottom: '14px' }}>
            {activeProviderForPermission === 'apple_health'
              ? HEALTH_PERMISSION_EXPLANATION.apple_health.description
              : HEALTH_PERMISSION_EXPLANATION.health_connect.description}
          </p>

          <div className="permission-requested-data" style={{ marginBottom: '14px' }}>
            <strong style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>
              Запрашиваемые показатели (только чтение):
            </strong>
            <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {(activeProviderForPermission === 'apple_health'
                ? HEALTH_PERMISSION_EXPLANATION.apple_health.requestedData
                : HEALTH_PERMISSION_EXPLANATION.health_connect.requestedData
              ).map((item) => (
                <li key={item} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  <CheckCircle2 size={15} color="var(--status-positive)" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {bridgeNotice && (
            <div
              className="bridge-notice-box"
              role="alert"
              style={{
                display: 'flex',
                gap: '8px',
                padding: '10px 12px',
                background: 'rgba(255, 214, 38, 0.1)',
                border: '1px solid rgba(255, 214, 38, 0.25)',
                borderRadius: 'var(--radius-control)',
                marginBottom: '14px',
                fontSize: '0.8rem',
                lineHeight: 1.4,
                color: 'var(--text-primary)',
              }}
            >
              <Info size={18} color="var(--brand-yellow)" style={{ flexShrink: 0, marginTop: '2px' }} aria-hidden="true" />
              <p style={{ margin: 0 }}>{bridgeNotice}</p>
            </div>
          )}

          <div className="permission-explainer__actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <Button type="button" variant="ghost" onClick={cancelPermission}>
              Отмена
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => confirmPermission(activeProviderForPermission)}
              disabled={isConnecting || !isNative}
            >
              {isConnecting ? (
                <>
                  <Loader2 size={16} className="spin-animation" /> Подключение...
                </>
              ) : isNative ? (
                'Разрешить доступ'
              ) : (
                'Требуется нативное приложение'
              )}
            </Button>
          </div>
        </Modal>
      )}

      {/* Disconnect Confirmation Modal */}
      {disconnectConfirmProvider && (
        <Modal
          isOpen={true}
          onClose={cancelDisconnect}
          titleId="disconnect-modal-title"
          className="permission-explainer-card"
        >
          <div className="permission-explainer__header" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <AlertCircle size={24} className="permission-alert-icon" color="var(--status-danger)" aria-hidden="true" />
            <h4 id="disconnect-modal-title" style={{ margin: 0, fontSize: '1.1rem' }}>
              Отключение источника
            </h4>
          </div>
          <p className="permission-explainer__text" style={{ color: 'var(--text-secondary)', fontSize: '0.86rem', lineHeight: 1.5, marginBottom: '14px' }}>
            Вы уверены, что хотите отключить этот источник?
            <br />
            <strong style={{ color: 'var(--text-primary)' }}>
              Исторические замеры останутся в вашем профиле
            </strong>
            , но новые замеры перестанут поступать автоматически.
          </p>
          <div className="permission-explainer__actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <Button type="button" variant="ghost" onClick={cancelDisconnect}>
              Оставить
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={confirmDisconnect}
              disabled={isDisconnecting}
            >
              {isDisconnecting ? 'Отключение...' : 'Отключить'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
