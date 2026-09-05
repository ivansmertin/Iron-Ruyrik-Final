import { Capacitor, registerPlugin } from '@capacitor/core'
import { batchImportHealthRecords } from '../api/health'
import type {
  BatchHealthImportIn,
  BatchHealthImportOut,
  BridgeAvailabilityResult,
  HealthImportRecordIn,
  HealthMetricType,
  HealthSourceProvider,
  HealthUnit,
  NativeHealthBridgeRecord,
  PermissionStatusResult,
  ReadMeasurementsResult,
  RequestPermissionsResult,
} from '../types/health'

export type ClientPlatform = 'ios' | 'android' | 'web'

export interface NativeHealthBridgePlugin {
  isAvailable(): Promise<BridgeAvailabilityResult>
  getPlatform(): Promise<{ platform: string; isNative: boolean }>
  requestPermissions(): Promise<RequestPermissionsResult>
  getPermissionStatus(): Promise<PermissionStatusResult>
  readMeasurements(options?: {
    limit?: number
    sinceDays?: number
    since?: string
  }): Promise<ReadMeasurementsResult>
  openSystemHealthSettings(): Promise<{ opened: boolean }>
}

export const NativeHealthBridge = registerPlugin<NativeHealthBridgePlugin>('NativeHealthBridge', {
  web: () => ({
    async isAvailable() {
      return { available: false, platform: 'web' }
    },
    async getPlatform() {
      return { platform: 'web', isNative: false }
    },
    async requestPermissions() {
      return { granted: false, types: [] }
    },
    async getPermissionStatus() {
      return { status: 'unsupported', availableTypes: [] }
    },
    async readMeasurements() {
      return { records: [], count: 0, syncCursor: new Date().toISOString() }
    },
    async openSystemHealthSettings() {
      return { opened: false }
    },
  }),
})

export function detectClientPlatform(): ClientPlatform {
  if (Capacitor.isNativePlatform()) {
    const platform = Capacitor.getPlatform()
    if (platform === 'ios') return 'ios'
    if (platform === 'android') return 'android'
  }
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'web'
  const ua = navigator.userAgent || ''
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    return 'ios'
  }
  if (/Android/.test(ua)) {
    return 'android'
  }
  return 'web'
}

export function isProviderRelevantForPlatform(
  provider: HealthSourceProvider,
  platform: ClientPlatform
): boolean {
  if (provider === 'apple_health') {
    return platform === 'ios'
  }
  if (provider === 'health_connect' || provider === 'samsung_health') {
    return platform === 'android'
  }
  return true
}

export const HEALTH_PERMISSION_EXPLANATION = {
  apple_health: {
    title: 'Подключение Apple Health',
    description:
      '«Железный Рюрик» запрашивает минимально необходимые права только на чтение (Least Privilege) веса и состава тела. Данные поступают из весов Xiaomi, Withings или часов Apple Watch. Мы не запрашиваем право на запись.',
    requestedData: [
      'Вес (Body Mass)',
      'Процент жира (Body Fat %)',
      'Безжировая масса (Lean Body Mass)',
    ],
  },
  health_connect: {
    title: 'Подключение Health Connect',
    description:
      '«Железный Рюрик» считывает показатели веса и состава тела через Android Health Connect. Доступ запрашивается только на чтение для синхронизации с умными весами Xiaomi, Samsung Health и другими источниками.',
    requestedData: [
      'Вес (WeightRecord)',
      'Процент жира (BodyFatRecord)',
      'Мышечная масса (LeanBodyMassRecord)',
    ],
  },
}

// Check native bridge availability with diagnostic information
export async function checkNativeBridgeAvailability(): Promise<BridgeAvailabilityResult> {
  if (!Capacitor.isNativePlatform()) {
    return {
      available: false,
      platform: detectClientPlatform(),
      updateRequired: false,
    }
  }

  try {
    return await NativeHealthBridge.isAvailable()
  } catch {
    return {
      available: false,
      platform: detectClientPlatform(),
      updateRequired: false,
    }
  }
}

// Request system health permissions
export async function requestNativeHealthPermissions(): Promise<RequestPermissionsResult> {
  if (!Capacitor.isNativePlatform()) {
    return { granted: false, types: [] }
  }

  try {
    return await NativeHealthBridge.requestPermissions()
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    throw new Error(`Ошибка запроса прав здоровья: ${errorMsg}`)
  }
}

// Get current permission status
export async function getNativeHealthPermissionStatus(): Promise<PermissionStatusResult> {
  if (!Capacitor.isNativePlatform()) {
    return { status: 'unsupported', availableTypes: [] }
  }

  try {
    return await NativeHealthBridge.getPermissionStatus()
  } catch {
    return { status: 'unsupported', availableTypes: [] }
  }
}

// Open device health settings
export async function openNativeHealthSettings(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false

  try {
    const res = await NativeHealthBridge.openSystemHealthSettings()
    return res.opened
  } catch {
    return false
  }
}

// Offline queue management
const OFFLINE_QUEUE_KEY = 'iron_ryrik_offline_health_queue'

function getOfflineQueue(): BatchHealthImportIn[] {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveOfflineQueue(queue: BatchHealthImportIn[]): void {
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue))
  } catch {
    // Ignore storage quota errors
  }
}

function enqueueOfflineBatch(batch: BatchHealthImportIn): void {
  const queue = getOfflineQueue()
  queue.push(batch)
  saveOfflineQueue(queue)
}

export async function flushOfflineHealthQueue(): Promise<number> {
  if (typeof window === 'undefined' || !navigator.onLine) return 0

  const queue = getOfflineQueue()
  if (queue.length === 0) return 0

  let flushedCount = 0
  const remainingQueue: BatchHealthImportIn[] = []

  for (const batch of queue) {
    try {
      await batchImportHealthRecords(batch)
      flushedCount += batch.records.length
    } catch {
      remainingQueue.push(batch)
    }
  }

  saveOfflineQueue(remainingQueue)
  return flushedCount
}

// Synchronize health records from native platform to backend HealthService
export async function syncNativeHealth(options: {
  provider: HealthSourceProvider
  sinceDays?: number
  sinceCursor?: string
}): Promise<BatchHealthImportOut> {
  const { provider, sinceDays = 90, sinceCursor } = options

  // 1. Try flushing any offline items first if online
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      await flushOfflineHealthQueue()
    } catch {
      // Best-effort flush
    }
  }

  // 2. Query records from Native Bridge
  const bridgeResult = await NativeHealthBridge.readMeasurements({
    sinceDays,
    since: sinceCursor,
    limit: 500,
  })

  // 3. Map bridge records to canonical import format
  const importRecords: HealthImportRecordIn[] = bridgeResult.records.map((r: NativeHealthBridgeRecord) => {
    let metricType: HealthMetricType = 'weight'
    let unit: HealthUnit = 'kg'

    if (r.metricType === 'body_fat_percentage') {
      metricType = 'body_fat_percentage'
      unit = 'percent'
    } else if (r.metricType === 'lean_body_mass') {
      metricType = 'lean_body_mass'
      unit = 'kg'
    } else {
      metricType = 'weight'
      unit = 'kg'
    }

    return {
      source_record_id: r.sourceRecordId,
      metric_type: metricType,
      value: r.value,
      unit,
      measured_at: r.measuredAt,
      source_app: r.sourceApp || null,
      source_device: r.sourceDevice || null,
      device_manufacturer: r.deviceManufacturer || null,
      device_model: r.deviceModel || null,
      origin_platform: r.originPlatform || (Capacitor.getPlatform() === 'ios' ? 'ios' : 'android'),
    }
  })

  const batchPayload: BatchHealthImportIn = {
    provider,
    sync_cursor: bridgeResult.syncCursor,
    records: importRecords,
  }

  // If no records were found on native device, return clean empty result
  if (importRecords.length === 0) {
    return {
      imported_count: 0,
      duplicates_count: 0,
      failed_count: 0,
      sync_cursor: bridgeResult.syncCursor,
      errors: [],
    }
  }

  // 4. Send batch to backend
  try {
    return await batchImportHealthRecords(batchPayload)
  } catch (err) {
    // Check if network is offline
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine
    if (isOffline) {
      enqueueOfflineBatch(batchPayload)
      throw new Error(
        `Отсутствует интернет-соединение. ${importRecords.length} записей сохранены в локальную очередь и будут отправлены при восстановлении сети.`
      )
    }
    throw err
  }
}

// Backward compatibility interfaces
export interface NativeBridgeInterface {
  isAvailable: boolean
  requestPermissions: (types: string[]) => Promise<{ granted: boolean; error?: string }>
  readRecords: (options: { types: string[]; since?: string }) => Promise<Record<string, unknown>[]>
}

export function getAppleHealthBridge(): NativeBridgeInterface {
  const isIos = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'
  if (isIos) {
    return {
      isAvailable: true,
      requestPermissions: async () => {
        try {
          const res = await NativeHealthBridge.requestPermissions()
          return { granted: res.granted }
        } catch (e) {
          return { granted: false, error: e instanceof Error ? e.message : String(e) }
        }
      },
      readRecords: async (opts) => {
        const res = await NativeHealthBridge.readMeasurements({ since: opts.since })
        return res.records as unknown as Record<string, unknown>[]
      },
    }
  }

  return {
    isAvailable: false,
    requestPermissions: async () => ({
      granted: false,
      error:
        'Apple Health доступен только через нативный контейнер iOS с entitlement com.apple.developer.healthkit. В текущем браузере/PWA прямое чтение ограничено политикой безопасности Apple.',
    }),
    readRecords: async () => [],
  }
}

export function getHealthConnectBridge(): NativeBridgeInterface {
  const isAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
  if (isAndroid) {
    return {
      isAvailable: true,
      requestPermissions: async () => {
        try {
          const res = await NativeHealthBridge.requestPermissions()
          return { granted: res.granted }
        } catch (e) {
          return { granted: false, error: e instanceof Error ? e.message : String(e) }
        }
      },
      readRecords: async (opts) => {
        const res = await NativeHealthBridge.readMeasurements({ since: opts.since })
        return res.records as unknown as Record<string, unknown>[]
      },
    }
  }

  return {
    isAvailable: false,
    requestPermissions: async () => ({
      granted: false,
      error:
        'Health Connect доступен на устройствах Android через системный API androidx.health.connect. В веб-версии прямое чтение ограничено песочницей браузера.',
    }),
    readRecords: async () => [],
  }
}
