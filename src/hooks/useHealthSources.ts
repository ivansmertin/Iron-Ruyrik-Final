import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
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
  openNativeHealthSettings,
  requestNativeHealthPermissions,
  syncNativeHealth,
} from '../services/healthBridge'
import { registerModal } from '../services/modalStack'
import { haptics } from '../services/haptics'
import type {
  BridgeAvailabilityResult,
  HealthSourceProvider,
  PermissionStatusResult,
} from '../types/health'

export interface SyncFeedback {
  type: 'success' | 'error' | 'info'
  message: string
}

const SYNC_FEEDBACK_HOLD_MS = 4500

/**
 * Safely removes legacy mock integrations from localStorage if present,
 * preventing corrupted JSX/component serialization from crashing the app.
 */
export function cleanupLegacyIntegrationsStorage(): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (window.localStorage.getItem('ryrik_integrations') !== null) {
        window.localStorage.removeItem('ryrik_integrations')
      }
    }
  } catch {
    // Ignore environments with restricted storage access
  }
}

// Perform cleanup at module load
cleanupLegacyIntegrationsStorage()

export function formatLastSync(dateStr?: string | null): string {
  if (!dateStr) return 'Синхронизация не выполнялась'
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return 'Синхронизация не выполнялась'

  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  if (diffMs >= 0 && diffMs < 60_000) {
    return 'Только что'
  }

  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear()

  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')

  if (isToday) {
    return `Сегодня, ${hours}:${minutes}`
  }

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear()

  if (isYesterday) {
    return `Вчера, ${hours}:${minutes}`
  }

  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${day}.${month}.${date.getFullYear()}, ${hours}:${minutes}`
}

export function useHealthSources(enabled = true) {
  const queryClient = useQueryClient()
  const platform = detectClientPlatform()
  const isNative = Capacitor.isNativePlatform()

  const {
    data: sources = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['health-sources'],
    queryFn: getHealthSources,
    enabled,
  })

  const [activeProviderForPermission, setActiveProviderForPermission] =
    useState<HealthSourceProvider | null>(null)
  const [disconnectConfirmProvider, setDisconnectConfirmProvider] =
    useState<HealthSourceProvider | null>(null)
  const [bridgeNotice, setBridgeNotice] = useState<string | null>(null)
  const [bridgeAvailability, setBridgeAvailability] =
    useState<BridgeAvailabilityResult | null>(null)
  const [permissionStatus, setPermissionStatus] =
    useState<PermissionStatusResult | null>(null)
  const [isSyncing, setIsSyncing] = useState<HealthSourceProvider | null>(null)
  const [recentlySyncedProvider, setRecentlySyncedProvider] =
    useState<HealthSourceProvider | null>(null)
  const [syncFeedback, setSyncFeedback] = useState<SyncFeedback | null>(null)

  const syncInFlightRef = useRef(false)
  const syncedFeedbackTimerRef = useRef<number | null>(null)

  // Clean legacy storage upon mount
  useEffect(() => {
    cleanupLegacyIntegrationsStorage()
  }, [])

  // Timer & flight lock cleanup
  useEffect(() => {
    return () => {
      if (syncedFeedbackTimerRef.current !== null) {
        window.clearTimeout(syncedFeedbackTimerRef.current)
      }
      syncInFlightRef.current = false
    }
  }, [])

  // Load platform & permission diagnosis when active
  useEffect(() => {
    if (!enabled) return
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

    void checkStatus()
    return () => {
      isMounted = false
    }
  }, [enabled])

  // LIFO Stack management for permissions sub-step
  useEffect(() => {
    if (!activeProviderForPermission) return
    const unregister = registerModal(() => {
      setActiveProviderForPermission(null)
      setBridgeNotice(null)
    })
    return () => {
      unregister()
    }
  }, [activeProviderForPermission])

  // LIFO Stack management for disconnect confirmation sub-step
  useEffect(() => {
    if (!disconnectConfirmProvider) return
    const unregister = registerModal(() => {
      setDisconnectConfirmProvider(null)
    })
    return () => {
      unregister()
    }
  }, [disconnectConfirmProvider])

  const connectMutation = useMutation({
    mutationFn: connectHealthSource,
    onSuccess: async (data) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['health-sources'] }),
        queryClient.invalidateQueries({ queryKey: ['health-progress'] }),
        queryClient.invalidateQueries({ queryKey: ['progress'] }),
      ])
      setActiveProviderForPermission(null)
      setBridgeNotice(null)

      // Trigger initial sync automatically on native platform
      if (
        isNative &&
        (data.provider === 'apple_health' || data.provider === 'health_connect')
      ) {
        void handleManualSync(data.provider)
      }
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : String(err)
      setBridgeNotice(`Ошибка подключения источника: ${msg}`)
    },
  })

  const disconnectMutation = useMutation({
    mutationFn: disconnectHealthSource,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['health-sources'] }),
        queryClient.invalidateQueries({ queryKey: ['health-progress'] }),
        queryClient.invalidateQueries({ queryKey: ['progress'] }),
      ])
      setDisconnectConfirmProvider(null)
      setSyncFeedback(null)
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : String(err)
      setSyncFeedback({
        type: 'error',
        message: `Ошибка отключения источника: ${msg}`,
      })
    },
  })

  const startConnect = (provider: HealthSourceProvider) => {
    setBridgeNotice(null)
    setSyncFeedback(null)

    if (provider === 'apple_health') {
      const bridge = getAppleHealthBridge()
      if (!isNative || !bridge.isAvailable) {
        setBridgeNotice(
          'Прямое чтение Apple HealthKit доступно только в нативном мобильном приложении для iOS (с entitlement com.apple.developer.healthkit). В текущем веб-окружении системный доступ ограничен песочницей браузера. Для учета замеров используйте ручной ввод в разделе «Мой прогресс».'
        )
      }
      setActiveProviderForPermission(provider)
    } else if (provider === 'health_connect') {
      const bridge = getHealthConnectBridge()
      if (!isNative || !bridge.isAvailable) {
        if (bridgeAvailability?.updateRequired) {
          setBridgeNotice(
            'Служба Google Health Connect требует установки или обновления из Google Play Store перед подключением.'
          )
        } else {
          setBridgeNotice(
            'Служба Health Connect доступна только на устройствах Android через системный API androidx.health.connect. В веб-браузере системный доступ ограничен. Для синхронизации установите мобильное приложение клуба для Android.'
          )
        }
      }
      setActiveProviderForPermission(provider)
    } else if (provider === 'garmin') {
      setSyncFeedback({
        type: 'info',
        message:
          'Прямая облачная интеграция с Garmin Connect находится в разработке и станет доступна в ближайшем обновлении.',
      })
    } else {
      connectMutation.mutate(provider)
    }
  }

  const confirmPermission = async (provider: HealthSourceProvider) => {
    setSyncFeedback(null)

    if (provider === 'apple_health' || provider === 'health_connect') {
      if (!isNative) {
        setBridgeNotice(
          'Подключение невозможно в веб-браузере. Для автоматического чтения данных здоровья установите нативное мобильное приложение «Железный Рюрик» для iOS или Android.'
        )
        return
      }

      try {
        const res = await requestNativeHealthPermissions()
        if (res.granted) {
          connectMutation.mutate(provider)
        } else {
          setBridgeNotice(
            'Разрешение на доступ к показателям здоровья не было предоставлено в системном диалоге.'
          )
        }
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e)
        setBridgeNotice(errorMsg)
      }
    } else {
      connectMutation.mutate(provider)
    }
  }

  const cancelPermission = () => {
    setActiveProviderForPermission(null)
    setBridgeNotice(null)
  }

  const startDisconnect = (provider: HealthSourceProvider) => {
    setDisconnectConfirmProvider(provider)
  }

  const confirmDisconnect = () => {
    if (disconnectConfirmProvider) {
      disconnectMutation.mutate(disconnectConfirmProvider)
    }
  }

  const cancelDisconnect = () => {
    setDisconnectConfirmProvider(null)
  }

  const handleManualSync = async (provider: HealthSourceProvider) => {
    if (syncInFlightRef.current) return

    if (!isNative && (provider === 'apple_health' || provider === 'health_connect')) {
      setSyncFeedback({
        type: 'info',
        message:
          'Синхронизация системного здоровья доступна только в нативном мобильном приложении. В браузере используйте ручной ввод замеров.',
      })
      return
    }

    syncInFlightRef.current = true
    if (syncedFeedbackTimerRef.current !== null) {
      window.clearTimeout(syncedFeedbackTimerRef.current)
      syncedFeedbackTimerRef.current = null
    }
    setIsSyncing(provider)
    setRecentlySyncedProvider(null)
    setSyncFeedback(null)
    void haptics.light()

    try {
      const result = await syncNativeHealth({ provider, sinceDays: 90 })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['health-progress'] }),
        queryClient.invalidateQueries({ queryKey: ['progress'] }),
        queryClient.invalidateQueries({ queryKey: ['health-sources'] }),
      ])

      const msg =
        result.imported_count > 0
          ? `Синхронизация завершена: +${result.imported_count} новых измерений (${result.duplicates_count} учтено повторно)`
          : result.duplicates_count > 0
          ? `Данные актуальны: новых измерений нет (${result.duplicates_count} проверено)`
          : 'Новых измерений за последние 90 дней не обнаружено в приложении здоровья.'

      setSyncFeedback({ type: 'success', message: msg })
      setRecentlySyncedProvider(provider)
      void haptics.success()
      syncedFeedbackTimerRef.current = window.setTimeout(() => {
        setRecentlySyncedProvider((current) => (current === provider ? null : current))
        syncedFeedbackTimerRef.current = null
      }, SYNC_FEEDBACK_HOLD_MS)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setSyncFeedback({ type: 'error', message: msg })
      void haptics.warning()
    } finally {
      syncInFlightRef.current = false
      setIsSyncing(null)
    }
  }

  const handleOpenSettings = async (): Promise<boolean> => {
    const opened = await openNativeHealthSettings()
    if (!opened) {
      setSyncFeedback({
        type: 'info',
        message:
          'Откройте «Настройки» устройства → «Приложения» / «Здоровье» для управления разрешениями.',
      })
    }
    return opened
  }

  return {
    sources,
    isLoading,
    error,
    refetch,
    platform,
    isNative,
    bridgeAvailability,
    permissionStatus,
    activeProviderForPermission,
    setActiveProviderForPermission,
    disconnectConfirmProvider,
    setDisconnectConfirmProvider,
    bridgeNotice,
    setBridgeNotice,
    syncFeedback,
    setSyncFeedback,
    isSyncing,
    recentlySyncedProvider,
    isConnecting: connectMutation.isPending,
    isDisconnecting: disconnectMutation.isPending,
    startConnect,
    confirmPermission,
    cancelPermission,
    startDisconnect,
    confirmDisconnect,
    cancelDisconnect,
    handleManualSync,
    handleOpenSettings,
  }
}
