import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
import { useEffect, useState } from 'react'
import {
  connectHealthSource,
  disconnectHealthSource,
  getHealthSources,
} from '../api/health'
import {
  checkNativeBridgeAvailability,
  detectClientPlatform,
  getAppleHealthBridge,
  getHealthConnectBridge,
  getNativeHealthPermissionStatus,
  HEALTH_PERMISSION_EXPLANATION,
  isProviderRelevantForPlatform,
  openNativeHealthSettings,
  requestNativeHealthPermissions,
  syncNativeHealth,
} from '../services/healthBridge'
import type {
  BridgeAvailabilityResult,
  HealthSourceProvider,
  PermissionStatusResult,
} from '../types/health'
import { Button, Card } from './ui'

interface HealthSourcesModalProps {
  isOpen: boolean
  onClose: () => void
}

interface SyncFeedback {
  type: 'success' | 'error' | 'info'
  message: string
}

export function HealthSourcesModal({ isOpen, onClose }: HealthSourcesModalProps) {
  const queryClient = useQueryClient()
  const platform = detectClientPlatform()

  const { data: sources, isLoading } = useQuery({
    queryKey: ['health-sources'],
    queryFn: getHealthSources,
    enabled: isOpen,
  })

  const [activeProviderForPermission, setActiveProviderForPermission] =
    useState<HealthSourceProvider | null>(null)
  const [disconnectConfirmProvider, setDisconnectConfirmProvider] =
    useState<HealthSourceProvider | null>(null)
  const [bridgeNotice, setBridgeNotice] = useState<string | null>(null)
  const [bridgeAvailability, setBridgeAvailability] = useState<BridgeAvailabilityResult | null>(null)
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatusResult | null>(null)
  const [isSyncing, setIsSyncing] = useState<HealthSourceProvider | null>(null)
  const [syncFeedback, setSyncFeedback] = useState<SyncFeedback | null>(null)

  // Load platform & permission diagnosis when modal opens
  useEffect(() => {
    if (!isOpen) return
    let isMounted = true

    async function checkStatus() {
      try {
        const avail = await checkNativeBridgeAvailability()
        const perm = await getNativeHealthPermissionStatus()
        if (isMounted) {
          setBridgeAvailability(avail)
          setPermissionStatus(perm)
        }
      } catch {
        // Fallback gracefully
      }
    }

    checkStatus()
    return () => {
      isMounted = false
    }
  }, [isOpen])

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        if (activeProviderForPermission) {
          setActiveProviderForPermission(null)
        } else if (disconnectConfirmProvider) {
          setDisconnectConfirmProvider(null)
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, activeProviderForPermission, disconnectConfirmProvider, onClose])

  const connectMutation = useMutation({
    mutationFn: connectHealthSource,
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ['health-sources'] })
      queryClient.invalidateQueries({ queryKey: ['health-progress'] })
      queryClient.invalidateQueries({ queryKey: ['progress'] })
      setActiveProviderForPermission(null)

      // Trigger initial sync automatically upon successful connection
      if (data.provider === 'apple_health' || data.provider === 'health_connect') {
        handleManualSync(data.provider)
      }
    },
  })

  const disconnectMutation = useMutation({
    mutationFn: disconnectHealthSource,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['health-sources'] })
      queryClient.invalidateQueries({ queryKey: ['health-progress'] })
      queryClient.invalidateQueries({ queryKey: ['progress'] })
      setDisconnectConfirmProvider(null)
      setSyncFeedback(null)
    },
  })

  if (!isOpen) return null

  const handleStartConnect = (provider: HealthSourceProvider) => {
    setBridgeNotice(null)
    setSyncFeedback(null)

    if (provider === 'apple_health') {
      const bridge = getAppleHealthBridge()
      if (!bridge.isAvailable) {
        setBridgeNotice(
          'Прямое чтение Apple HealthKit доступно только в нативном приложении для iOS с entitlement com.apple.developer.healthkit. В текущем веб-окружении доступ ограничен песочницей браузера. Вы можете вести ручные замеры или запускать сборку в Xcode.'
        )
      }
      setActiveProviderForPermission(provider)
    } else if (provider === 'health_connect') {
      const bridge = getHealthConnectBridge()
      if (!bridge.isAvailable) {
        if (bridgeAvailability?.updateRequired) {
          setBridgeNotice(
            'Служба Google Health Connect требует установки или обновления из Google Play Store перед подключением.'
          )
        } else {
          setBridgeNotice(
            'Служба Health Connect доступна на устройствах Android через системный API androidx.health.connect. В текущем браузере доступ ограничен.'
          )
        }
      }
      setActiveProviderForPermission(provider)
    } else {
      connectMutation.mutate(provider)
    }
  }

  const handleConfirmPermission = async (provider: HealthSourceProvider) => {
    setSyncFeedback(null)

    if (provider === 'apple_health' || provider === 'health_connect') {
      try {
        const res = await requestNativeHealthPermissions()
        if (res.granted) {
          connectMutation.mutate(provider)
        } else {
          // Check if fallback web bridge
          const bridge = provider === 'apple_health' ? getAppleHealthBridge() : getHealthConnectBridge()
          if (!bridge.isAvailable) {
            connectMutation.mutate(provider)
          } else {
            setBridgeNotice('Разрешение на доступ к показателям здоровья не было предоставлено.')
          }
        }
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e)
        setBridgeNotice(errorMsg)
      }
    }
  }

  const handleManualSync = async (provider: HealthSourceProvider) => {
    setIsSyncing(provider)
    setSyncFeedback(null)

    try {
      const result = await syncNativeHealth({ provider, sinceDays: 90 })
      queryClient.invalidateQueries({ queryKey: ['health-progress'] })
      queryClient.invalidateQueries({ queryKey: ['progress'] })
      queryClient.invalidateQueries({ queryKey: ['health-sources'] })

      const msg =
        result.imported_count > 0
          ? `Синхронизация завершена: +${result.imported_count} новых измерений (${result.duplicates_count} учтено повторно)`
          : result.duplicates_count > 0
          ? `Данные актуальны: новых измерений нет (${result.duplicates_count} проверено)`
          : 'Новых измерений за последние 90 дней не обнаружено в приложении здоровья.'

      setSyncFeedback({ type: 'success', message: msg })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setSyncFeedback({ type: 'error', message: msg })
    } finally {
      setIsSyncing(null)
    }
  }

  const handleOpenSettings = async () => {
    const opened = await openNativeHealthSettings()
    if (!opened) {
      setSyncFeedback({
        type: 'info',
        message: 'Откройте «Настройки» устройства → «Приложения» / «Здоровье» для настройки разрешений.',
      })
    }
  }

  const handleConfirmDisconnect = () => {
    if (disconnectConfirmProvider) {
      disconnectMutation.mutate(disconnectConfirmProvider)
    }
  }

  const deviceSources = (sources || []).filter(
    (s) => s.category === 'device' && isProviderRelevantForPlatform(s.provider, platform)
  )

  const serviceSources = (sources || []).filter((s) => s.category === 'service')

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="health-sources-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal-content health-sources-modal">
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
              borderRadius: '8px',
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
                  : 'rgba(59, 130, 246, 0.15)',
              color:
                syncFeedback.type === 'success'
                  ? 'var(--status-positive, #4ade80)'
                  : syncFeedback.type === 'error'
                  ? 'var(--status-danger, #ef4444)'
                  : 'var(--brand-yellow, #f59e0b)',
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
              <Button
                type="button"
                variant="ghost"
                onClick={() => setActiveProviderForPermission(null)}
              >
                Отмена
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => handleConfirmPermission(activeProviderForPermission)}
                disabled={connectMutation.isPending}
              >
                {connectMutation.isPending ? (
                  <>
                    <Loader2 size={16} className="spin-icon" /> Подключение...
                  </>
                ) : (
                  'Разрешить доступ'
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
              <strong>Исторические замеры останутся в вашем профиле</strong>, но новые замеры перестанут поступать автоматически.
            </p>
            <div className="permission-explainer__actions">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDisconnectConfirmProvider(null)}
              >
                Оставить
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={handleConfirmDisconnect}
                disabled={disconnectMutation.isPending}
              >
                {disconnectMutation.isPending ? 'Отключение...' : 'Отключить'}
              </Button>
            </div>
          </div>
        )}

        {!activeProviderForPermission && !disconnectConfirmProvider && (
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
                  const hasPartialPermissions =
                    permissionStatus?.status === 'partially_authorized'

                  return (
                    <Card key={source.id} className="source-item">
                      <div className="source-item__icon-wrap">
                        <Smartphone size={22} />
                      </div>
                      <div className="source-item__info">
                        <strong>{source.displayName}</strong>
                        <span>
                          {isConnected
                            ? 'Синхронизация активна'
                            : 'Весы Xiaomi, Withings, Apple Watch, Samsung'}
                        </span>
                        {isConnected && hasPartialPermissions && (
                          <span
                            style={{
                              color: 'var(--brand-yellow, #f59e0b)',
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
                                disabled={isSyncingCurrent}
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
                                onClick={handleOpenSettings}
                              >
                                <Settings size={14} />
                              </button>
                            </div>
                            <button
                              type="button"
                              className="source-disconnect-btn"
                              onClick={() => setDisconnectConfirmProvider(source.provider)}
                            >
                              Отключить
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="button button--secondary button--sm"
                            onClick={() => handleStartConnect(source.provider)}
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
                                onClick={() => setDisconnectConfirmProvider(source.provider)}
                              >
                                Отключить
                              </button>
                            </div>
                          ) : (
                            <span
                              className="source-badge is-soon"
                              title="Интеграция подготовлена. Ожидается OAuth Developer регистрация"
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
                Ваши данные о здоровье используются только для отображения прогресса в приложении и не передаются третьим лицам.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
