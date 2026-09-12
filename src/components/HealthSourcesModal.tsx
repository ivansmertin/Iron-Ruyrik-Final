import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  Info,
  Loader2,
  RefreshCw,
  Settings,
  Shield,
  Smartphone,
  Watch,
  X,
} from 'lucide-react'
import {
  HEALTH_PERMISSION_EXPLANATION,
  isProviderRelevantForPlatform,
} from '../services/healthBridge'
import { useHealthSources } from '../hooks/useHealthSources'
import { Button, Card, Modal } from './ui'

interface HealthSourcesModalProps {
  isOpen: boolean
  onClose: () => void
}

export function HealthSourcesModal({ isOpen, onClose }: HealthSourcesModalProps) {
  const {
    sources,
    isLoading,
    error,
    refetch,
    isNative,
    platform,
    permissionStatus,
    activeProviderForPermission,
    disconnectConfirmProvider,
    bridgeNotice,
    syncFeedback,
    isSyncing,
    recentlySyncedProvider,
    isConnecting,
    isDisconnecting,
    startConnect,
    confirmPermission,
    cancelPermission,
    startDisconnect,
    confirmDisconnect,
    cancelDisconnect,
    handleManualSync,
    handleOpenSettings,
  } = useHealthSources(isOpen)

  if (!isOpen) return null

  const deviceSources = sources.filter(
    (s) => s.category === 'device' && isProviderRelevantForPlatform(s.provider, platform)
  )

  const serviceSources = sources.filter(
    (s) => s.category === 'service' && s.provider !== 'whoop'
  )

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      titleId="health-sources-title"
      className="modal-content health-sources-modal"
    >
      <div className="modal-header">
        <div>
          <h3 id="health-sources-title">Источники данных</h3>
          <p className="modal-subtitle">Подключение умных устройств и фитнес-сервисов</p>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label="Закрыть окно"
        >
          <X size={20} />
        </button>
      </div>

      {/* Global Feedback Banner */}
      {syncFeedback && (
        <div
          className={`sync-feedback-banner is-${syncFeedback.type}`}
          role="alert"
          style={{
            padding: '10px 14px',
            borderRadius: 'var(--radius-control)',
            marginBottom: '12px',
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
                ? 'var(--status-positive, #4ade80)'
                : syncFeedback.type === 'error'
                ? 'var(--status-danger, #ef4444)'
                : 'var(--brand-yellow, #ffd626)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          {syncFeedback.type === 'success' && <CheckCircle2 size={16} />}
          {syncFeedback.type === 'error' && <AlertCircle size={16} />}
          {syncFeedback.type === 'info' && <Info size={16} />}
          <span>{syncFeedback.message}</span>
        </div>
      )}

      {/* Permission Explanation Submodal */}
      {activeProviderForPermission && (
        <div className="permission-explainer-card" role="region" aria-label="Разрешения источника">
          <div className="permission-explainer__header">
            <Shield size={24} className="permission-shield-icon" aria-hidden="true" />
            <h4>
              {activeProviderForPermission === 'apple_health'
                ? HEALTH_PERMISSION_EXPLANATION.apple_health.title
                : HEALTH_PERMISSION_EXPLANATION.health_connect.title}
            </h4>
          </div>

          <p className="permission-explainer__text">
            {activeProviderForPermission === 'apple_health'
              ? HEALTH_PERMISSION_EXPLANATION.apple_health.description
              : HEALTH_PERMISSION_EXPLANATION.health_connect.description}
          </p>

          <div className="permission-requested-data">
            <strong>Запрашиваемые показатели (только чтение):</strong>
            <ul>
              {(activeProviderForPermission === 'apple_health'
                ? HEALTH_PERMISSION_EXPLANATION.apple_health.requestedData
                : HEALTH_PERMISSION_EXPLANATION.health_connect.requestedData
              ).map((item) => (
                <li key={item}>
                  <CheckCircle2 size={15} aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {bridgeNotice && (
            <div className="bridge-notice-box" role="alert">
              <Info size={18} aria-hidden="true" />
              <p>{bridgeNotice}</p>
            </div>
          )}

          <div className="permission-explainer__actions">
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
                  <Loader2 size={16} className="spin-icon" /> Подключение...
                </>
              ) : isNative ? (
                'Разрешить доступ'
              ) : (
                'Требуется нативное приложение'
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Disconnect Confirmation Submodal */}
      {disconnectConfirmProvider && (
        <div className="permission-explainer-card" role="alertdialog">
          <div className="permission-explainer__header">
            <AlertCircle size={24} className="permission-alert-icon" aria-hidden="true" />
            <h4>Отключение источника</h4>
          </div>
          <p className="permission-explainer__text">
            Вы уверены, что хотите отключить этот источник?
            <br />
            <strong>Исторические замеры останутся в вашем профиле</strong>, но новые замеры
            перестанут поступать автоматически.
          </p>
          <div className="permission-explainer__actions">
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
        </div>
      )}

      {error && (
        <div
          className="schedule-state-card schedule-state-card--error"
          role="alert"
          style={{ padding: '24px 16px', margin: '16px 0', textAlign: 'center' }}
        >
          <AlertCircle
            size={28}
            className="schedule-state-card__icon"
            aria-hidden="true"
            style={{ margin: '0 auto 8px' }}
          />
          <h4
            className="schedule-state-card__title"
            style={{ fontSize: '1rem', margin: '0 0 6px' }}
          >
            Не удалось загрузить источники данных
          </h4>
          <p
            className="schedule-state-card__text"
            style={{ fontSize: '0.84rem', margin: '0 0 16px', color: 'var(--text-secondary)' }}
          >
            Проверьте соединение с интернетом и попробуйте обновить список.
          </p>
          <Button
            type="button"
            className="button--primary button--sm"
            onClick={() => void refetch()}
          >
            Повторить
          </Button>
        </div>
      )}

      {!error && !activeProviderForPermission && !disconnectConfirmProvider && (
        <div className="health-sources-body">
          {/* Section 1: Device Health */}
          <div className="sources-section">
            <h4 className="sources-section__title">Здоровье устройства</h4>
            <div className="sources-list">
              {isLoading && <p className="sources-empty">Загрузка источников...</p>}
              {!isLoading && deviceSources.length === 0 && (
                <p className="sources-empty">Нет доступных системных источников для вашей платформы.</p>
              )}
              {deviceSources.map((source) => {
                const isConnected = source.status === 'connected'
                const isSyncingCurrent = isSyncing === source.provider
                const isRecentlySynced = recentlySyncedProvider === source.provider
                const hasPartialPermissions =
                  permissionStatus?.status === 'partially_authorized'

                return (
                  <Card
                    key={source.id}
                    className={`source-item motion-pressable ${
                      isSyncingCurrent ? 'source-item--syncing' : ''
                    }`}
                  >
                    {isSyncingCurrent && (
                      <div className="source-item__sync-bar" aria-hidden="true" />
                    )}
                    <div className="source-item__icon-wrap">
                      <Smartphone size={22} />
                    </div>
                    <div className="source-item__info">
                      <strong>{source.displayName}</strong>
                      <span className={isRecentlySynced ? 'source-item__synced-note' : ''}>
                        {isSyncingCurrent
                          ? 'Синхронизация…'
                          : isRecentlySynced
                          ? 'Обновлено только что'
                          : isConnected
                          ? 'Синхронизация активна'
                          : 'Весы Xiaomi, Withings, Apple Watch, Samsung'}
                      </span>
                      {isConnected && hasPartialPermissions && (
                        <span
                          style={{
                            color: 'var(--brand-yellow, #ffd626)',
                            fontSize: '0.72rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            marginTop: '2px',
                          }}
                        >
                          <AlertTriangle size={12} /> Частичный доступ (
                          {permissionStatus.availableTypes.join(', ')})
                        </span>
                      )}
                    </div>
                    <div className="source-item__action">
                      {isConnected ? (
                        <div className="source-connected-actions">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span className="source-badge is-connected">
                              <Check size={13} /> Подключено
                            </span>
                            <button
                              type="button"
                              className="icon-button"
                              style={{ width: '28px', height: '28px', padding: 0 }}
                              title="Синхронизировать сейчас"
                              onClick={() => handleManualSync(source.provider)}
                              disabled={isSyncing !== null}
                            >
                              <RefreshCw
                                size={14}
                                className={isSyncingCurrent ? 'spin-icon' : ''}
                              />
                            </button>
                            <button
                              type="button"
                              className="icon-button"
                              style={{ width: '28px', height: '28px', padding: 0 }}
                              title="Открыть системные настройки здоровья"
                              onClick={() => void handleOpenSettings()}
                            >
                              <Settings size={14} />
                            </button>
                          </div>
                          <button
                            type="button"
                            className="source-disconnect-btn"
                            onClick={() => startDisconnect(source.provider)}
                          >
                            Отключить
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="button button--secondary button--sm"
                          onClick={() => startConnect(source.provider)}
                        >
                          Подключить
                        </button>
                      )}
                    </div>
                  </Card>
                )
              })}
            </div>
          </div>

          {/* Section 2: External Services */}
          <div className="sources-section">
            <h4 className="sources-section__title">Сервисы</h4>
            <div className="sources-list">
              {serviceSources.map((source) => {
                const isGarmin = source.provider === 'garmin'
                const isConnected = source.status === 'connected'

                return (
                  <Card key={source.id} className="source-item">
                    <div className="source-item__icon-wrap">
                      <Watch size={22} />
                    </div>
                    <div className="source-item__info">
                      <strong>{source.displayName}</strong>
                      <span>{source.description || 'Облачная синхронизация'}</span>
                    </div>
                    <div className="source-item__action">
                      {isGarmin ? (
                        isConnected ? (
                          <div className="source-connected-actions">
                            <span className="source-badge is-connected">
                              <Check size={13} /> Подключено
                            </span>
                            <button
                              type="button"
                              className="source-disconnect-btn"
                              onClick={() => startDisconnect(source.provider)}
                            >
                              Отключить
                            </button>
                          </div>
                        ) : (
                          <span
                            className="source-badge is-soon"
                            title="Интеграция подготовлена. Ожидается OAuth регистрация"
                          >
                            Скоро
                          </span>
                        )
                      ) : (
                        <span className="source-badge is-soon">Скоро</span>
                      )}
                    </div>
                  </Card>
                )
              })}
            </div>
          </div>

          {/* Privacy note */}
          <div className="health-privacy-note">
            <Shield size={16} aria-hidden="true" />
            <p>
              Ваши данные о здоровье используются только для отображения прогресса в приложении и
              не передаются третьим лицам.
            </p>
          </div>
        </div>
      )}
    </Modal>
  )
}
