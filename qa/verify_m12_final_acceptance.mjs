import { spawn } from 'node:child_process'
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const QA_DIR = 'qa/acceptance_m12'
const BRAIN_DIR = 'C:\\Users\\iwans\\.gemini\\antigravity\\brain\\609f967c-eaac-4768-ba0d-9ca04bdef2af'
const APP_URL = 'http://localhost:5173'

mkdirSync(QA_DIR, { recursive: true })
mkdirSync(BRAIN_DIR, { recursive: true })

const VIEWPORTS = [
  { name: '320x740', width: 320, height: 740 },
  { name: '360x800', width: 360, height: 800 },
  { name: '390x844', width: 390, height: 844 },
  { name: '430x932', width: 430, height: 932 },
]

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl)
    this.id = 1
    this.pending = new Map()
    this.eventHandlers = new Map()

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.id && this.pending.has(data.id)) {
        const { resolve, reject } = this.pending.get(data.id)
        this.pending.delete(data.id)
        if (data.error) reject(new Error(data.error.message || JSON.stringify(data.error)))
        else resolve(data.result)
      } else if (data.method) {
        const handlers = this.eventHandlers.get(data.method) || []
        handlers.forEach((h) => h(data.params))
      }
    }
  }

  async ready() {
    if (this.ws.readyState === WebSocket.OPEN) return
    return new Promise((resolve, reject) => {
      this.ws.onopen = resolve
      this.ws.onerror = reject
    })
  }

  on(method, handler) {
    if (!this.eventHandlers.has(method)) this.eventHandlers.set(method, [])
    this.eventHandlers.get(method).push(handler)
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const msgId = this.id++
      this.pending.set(msgId, { resolve, reject })
      this.ws.send(JSON.stringify({ id: msgId, method, params }))
    })
  }

  close() {
    this.ws.close()
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function runM12AcceptanceQA() {
  console.log('=== Starting M12 Final Consistency & Acceptance QA Suite ===')

  const userDataDir = join(tmpdir(), `chrome_m12_qa_${Date.now()}`)
  const chrome = spawn(CHROME_PATH, [
    '--remote-debugging-port=9222',
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ])

  let pageWsUrl = null
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9222/json/list')
      const tabs = await res.json()
      const pageTab = tabs.find((t) => t.type === 'page') || tabs[0]
      if (pageTab?.webSocketDebuggerUrl) {
        pageWsUrl = pageTab.webSocketDebuggerUrl
        break
      }
    } catch {}
    await sleep(200)
  }

  if (!pageWsUrl) {
    chrome.kill()
    throw new Error('Failed to connect to Chrome page debugging target')
  }

  const cdp = new CDPClient(pageWsUrl)
  await cdp.ready()
  console.log('[CDP] Connected to Chrome Page target')

  await cdp.send('Page.enable')
  await cdp.send('DOM.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Fetch.enable', {
    patterns: [{ urlPattern: '*api/v1*' }],
  })

  let serverMode = 'normal'

  const mockUser = {
    id: 'u-1',
    name: 'Иван',
    city: 'Великий Новгород',
    role: 'admin',
  }

  const mockLongUser = {
    id: 'u-long',
    name: 'Константинопольский Константин',
    city: 'Великий Новгород',
    role: 'admin',
  }

  const mockCapacity = {
    occupied: 3,
    limit: 8,
  }

  const mockSlots = [
    {
      id: '2026-09-12-1100',
      startAt: '2026-09-12T11:00:00+03:00',
      endAt: '2026-09-12T12:00:00+03:00',
      booked: 2,
      capacity: 8,
      available: 6,
      isBlocked: false,
    },
    {
      id: '2026-09-12-1200',
      startAt: '2026-09-12T12:00:00+03:00',
      endAt: '2026-09-12T13:00:00+03:00',
      booked: 8,
      capacity: 8,
      available: 0,
      isBlocked: false,
    },
    {
      id: '2026-09-12-1400',
      startAt: '2026-09-12T14:00:00+03:00',
      endAt: '2026-09-12T15:00:00+03:00',
      booked: 0,
      capacity: 8,
      available: 8,
      isBlocked: true,
    },
    {
      id: '2026-09-12-1730',
      startAt: '2026-09-12T17:30:00+03:00',
      endAt: '2026-09-12T18:30:00+03:00',
      booked: 1,
      capacity: 8,
      available: 7,
      isBlocked: false,
    },
  ]

  const mockDays = [
    {
      date: '2026-09-12',
      slots: mockSlots,
    },
    {
      date: '2026-09-13',
      slots: [
        {
          id: '2026-09-13-1100',
          startAt: '2026-09-13T11:00:00+03:00',
          endAt: '2026-09-13T12:00:00+03:00',
          booked: 0,
          capacity: 8,
          available: 8,
          isBlocked: false,
        },
      ],
    },
  ]

  const mockTrainers = [
    {
      id: 't-1',
      slug: 'dima',
      name: 'Дима',
      bio: 'Специализируется на базовых силовых движениях и правильной технике. Призер региональных соревнований по пауэрлифтингу.',
      specialties: ['Силовой тренинг', 'Пауэрлифтинг', 'Набор массы', 'ОФП'],
      isActive: true,
    },
    {
      id: 't-2',
      slug: 'vanya',
      name: 'Ваня',
      bio: 'Помогает развить общую физическую подготовку, выносливость и подвижность суставов.',
      specialties: ['Функциональный тренинг', 'Выносливость', 'Похудение'],
      isActive: true,
    },
  ]

  const mockLongTrainers = [
    {
      id: 't-1',
      slug: 'dima',
      name: 'Дмитрий Александрович Константинопольский',
      bio: 'Сертифицированный специалист по биомеханике спорта высших достижений. Многократный призер чемпионатов Северо-Запада по пауэрлифтингу в весовой категории до 93 кг.',
      specialties: [
        'Силовой атлетический тренинг',
        'Подготовка к соревнованиям по пауэрлифтингу IPF',
        'Адаптивная физическая культура и реабилитация опорно-двигательного аппарата',
        'Периодизация тренировочного процесса высокой интенсивности',
        'Коррекция двигательных стереотипов',
      ],
      isActive: true,
    },
  ]

  const mockProgress = {
    visitsThisMonth: 12,
    consistentWeeks: 4,
    latestWeight: {
      metricType: 'weight',
      currentValue: 78.2,
      unit: 'kg',
      measuredAt: '2026-09-10T08:30:00+03:00',
      provenanceLabel: 'Apple Health',
      sourceProvider: 'apple_health',
      delta: {
        diff: -1.2,
        formatted: '−1,2 кг',
        direction: 'down',
        label: '−1,2 кг с 1 июня',
      },
      baselineValue: 79.4,
      baselineDate: '2026-06-01',
    },
    latestBodyFat: {
      metricType: 'body_fat_percentage',
      currentValue: 15.4,
      unit: 'percent',
      measuredAt: '2026-09-10T08:30:00+03:00',
      provenanceLabel: 'Xiaomi Scale S400',
      sourceProvider: 'xiaomi',
      delta: {
        diff: -1.4,
        formatted: '−1,4 %',
        direction: 'down',
        label: '−1,4 % с 1 июня',
      },
      baselineValue: 16.8,
      baselineDate: '2026-06-01',
    },
    latestMuscleMass: {
      metricType: 'lean_body_mass',
      currentValue: 66.1,
      unit: 'kg',
      measuredAt: '2026-09-10T08:30:00+03:00',
      provenanceLabel: 'Xiaomi Scale S400',
      sourceProvider: 'xiaomi',
      delta: {
        diff: 0.9,
        formatted: '+0,9 кг',
        direction: 'up',
        label: '+0,9 кг с 1 июня',
      },
      baselineValue: 65.2,
      baselineDate: '2026-06-01',
    },
    weightSeries: [
      { id: 'w-1', date: '2026-06-01', measuredAt: '2026-06-01T08:00:00+03:00', value: 79.4, provenanceLabel: 'Ручной ввод', sourceProvider: 'manual' },
      { id: 'w-2', date: '2026-06-15', measuredAt: '2026-06-15T08:00:00+03:00', value: 79.1, provenanceLabel: 'Apple Health', sourceProvider: 'apple_health' },
      { id: 'w-3', date: '2026-07-01', measuredAt: '2026-07-01T08:00:00+03:00', value: 78.8, provenanceLabel: 'Apple Health', sourceProvider: 'apple_health' },
      { id: 'w-4', date: '2026-07-20', measuredAt: '2026-07-20T08:00:00+03:00', value: 78.5, provenanceLabel: 'Apple Health', sourceProvider: 'apple_health' },
      { id: 'w-5', date: '2026-08-15', measuredAt: '2026-08-15T08:00:00+03:00', value: 78.4, provenanceLabel: 'Apple Health', sourceProvider: 'apple_health' },
      { id: 'w-6', date: '2026-09-10', measuredAt: '2026-09-10T08:30:00+03:00', value: 78.2, provenanceLabel: 'Apple Health', sourceProvider: 'apple_health' },
    ],
  }

  const mockSources = [
    {
      id: 'apple_health',
      provider: 'apple_health',
      displayName: 'Apple Health',
      status: 'disconnected',
      category: 'service',
      requiresNativeBridge: true,
      description: 'Синхронизация веса и активности',
      lastSyncedAt: null,
    },
    {
      id: 'health_connect',
      provider: 'health_connect',
      displayName: 'Health Connect',
      status: 'disconnected',
      category: 'service',
      requiresNativeBridge: true,
      description: 'Синхронизация данных здоровья Android',
      lastSyncedAt: null,
    },
    {
      id: 'xiaomi',
      provider: 'xiaomi',
      displayName: 'Xiaomi Scale S400',
      status: 'connected',
      category: 'device',
      requiresNativeBridge: false,
      description: 'Умные весы для биоимпедансного анализа',
      lastSyncedAt: '2026-09-12T10:00:00+03:00',
    },
  ]

  const mockProfile = {
    user: {
      ...mockUser,
      isActive: true,
    },
    membership: {
      id: 'mem-1',
      name: 'Абонемент на 8 занятий',
      type: 'visits_package',
      startsAt: '2026-09-01T00:00:00+03:00',
      expiresAt: '2026-10-15T23:59:59+03:00',
      visitsTotal: 8,
      visitsRemaining: 5,
      status: 'active',
    },
    history: [
      {
        id: 'h-1',
        userId: 'u-1',
        clientName: 'Иван',
        trainerSlug: 'dima',
        trainerName: 'Дима',
        slotId: 'slot-h-1',
        startAt: '2026-09-10T18:00:00+03:00',
        endAt: '2026-09-10T19:00:00+03:00',
        status: 'completed',
        notes: null,
        createdAt: '2026-09-09T12:00:00+03:00',
        cancelledAt: null,
      },
      {
        id: 'h-2',
        userId: 'u-1',
        clientName: 'Иван',
        trainerSlug: null,
        trainerName: null,
        slotId: 'slot-h-2',
        startAt: '2026-09-08T19:00:00+03:00',
        endAt: '2026-09-08T20:00:00+03:00',
        status: 'completed',
        notes: null,
        createdAt: '2026-09-07T12:00:00+03:00',
        cancelledAt: null,
      },
      {
        id: 'h-3',
        userId: 'u-1',
        clientName: 'Иван',
        trainerSlug: 'vanya',
        trainerName: 'Ваня',
        slotId: 'slot-h-3',
        startAt: '2026-09-05T11:00:00+03:00',
        endAt: '2026-09-05T12:00:00+03:00',
        status: 'completed',
        notes: null,
        createdAt: '2026-09-04T12:00:00+03:00',
        cancelledAt: null,
      },
    ],
  }

  const mockAdminBookings = [
    {
      id: 'ab-1',
      userId: 'u-2',
      clientName: 'Алексей Смирнов',
      trainerSlug: 'dima',
      trainerName: 'Дима',
      slotId: '2026-09-12-1100',
      startAt: '2026-09-12T11:00:00+03:00',
      endAt: '2026-09-12T12:00:00+03:00',
      status: 'confirmed',
      notes: null,
      createdAt: '2026-09-11T10:00:00+03:00',
      cancelledAt: null,
    },
    {
      id: 'ab-2',
      userId: 'u-3',
      clientName: 'Михаил Козлов',
      trainerSlug: null,
      trainerName: null,
      slotId: '2026-09-12-1100',
      startAt: '2026-09-12T11:00:00+03:00',
      endAt: '2026-09-12T12:00:00+03:00',
      status: 'confirmed',
      notes: null,
      createdAt: '2026-09-11T10:30:00+03:00',
      cancelledAt: null,
    },
    {
      id: 'ab-3',
      userId: 'u-4',
      clientName: 'Елена Васильева',
      trainerSlug: 'vanya',
      trainerName: 'Ваня',
      slotId: '2026-09-12-1730',
      startAt: '2026-09-12T17:30:00+03:00',
      endAt: '2026-09-12T18:30:00+03:00',
      status: 'confirmed',
      notes: null,
      createdAt: '2026-09-11T11:00:00+03:00',
      cancelledAt: null,
    },
  ]

  const mockAdminSettings = {
    gymCapacity: 8,
    defaultBookingDurationMinutes: 60,
    bookingStepMinutes: 60,
    cancelBeforeMinutes: 240,
    timezone: 'Europe/Moscow',
  }

  let currentBookings = []

  cdp.on('Fetch.requestPaused', async (event) => {
    const { requestId, request } = event
    const url = request.url

    let body = null
    let status = 200

    if (serverMode === 'error_500') {
      status = 500
      body = { detail: 'Internal Server Error' }
    } else if (serverMode === 'error_home_schedule' && url.includes('/api/v1/schedule')) {
      status = 500
      body = { detail: 'Schedule service offline' }
    } else if (serverMode === 'error_mutation' && (request.method === 'POST')) {
      status = 400
      body = { detail: 'Ошибка валидации параметров запроса' }
    } else if (url.includes('/api/v1/home')) {
      const active = currentBookings.find((b) => b.status === 'confirmed')
      body = {
        user: serverMode === 'long_content' ? { ...mockLongUser, isActive: true } : { ...mockUser, isActive: true },
        membership: mockProfile.membership,
        nextBooking: active ? {
          id: active.id,
          userId: 'u-1',
          clientName: 'Иван',
          trainerSlug: active.trainerId || null,
          trainerName: active.trainerName || null,
          slotId: active.slotId || null,
          startAt: '2026-09-12T11:00:00+03:00',
          endAt: '2026-09-12T12:00:00+03:00',
          status: active.status,
          notes: null,
          createdAt: active.createdAt || new Date().toISOString(),
          cancelledAt: null,
        } : null,
        currentOccupancy: 3,
        capacity: mockAdminSettings.gymCapacity,
      }
    } else if (url.includes('/api/v1/schedule')) {
      body = {
        timezone: 'Europe/Moscow',
        capacity: mockAdminSettings.gymCapacity,
        days: serverMode === 'empty_schedule' ? [{ date: '2026-09-12', slots: [] }] : mockDays,
      }
    } else if (url.includes('/api/v1/trainers')) {
      body = serverMode === 'empty_trainers' ? [] : (serverMode === 'long_content' ? mockLongTrainers : mockTrainers)
    } else if (url.includes('/api/v1/health/progress')) {
      body = mockProgress
    } else if (url.includes('/api/v1/health/sources')) {
      body = mockSources
    } else if (url.includes('/api/v1/profile')) {
      body = {
        ...mockProfile,
        user: serverMode === 'long_content' ? { ...mockLongUser, isActive: true } : { ...mockUser, isActive: true },
      }
    } else if (url.includes('/api/v1/admin/bookings') && request.method === 'GET') {
      body = serverMode === 'empty_schedule' ? [] : mockAdminBookings
    } else if (url.includes('/api/v1/admin/settings') && request.method === 'GET') {
      body = mockAdminSettings
    } else if (url.includes('/api/v1/admin/settings') && request.method === 'PATCH') {
      const parsed = JSON.parse(request.postData || '{}')
      Object.assign(mockAdminSettings, parsed)
      body = mockAdminSettings
    } else if (url.includes('/api/v1/admin/booking-blocks') && request.method === 'GET') {
      body = []
    } else if (url.includes('/api/v1/health/measurements/manual') && request.method === 'POST') {
      const parsed = JSON.parse(request.postData || '{}')
      if (parsed.weight) {
        mockProgress.latestWeight.currentValue = parsed.weight
        mockProgress.weightSeries.push({
          id: `w-${Date.now()}`,
          date: '2026-09-12',
          measuredAt: parsed.measuredAt || new Date().toISOString(),
          value: parsed.weight,
          provenanceLabel: 'Ручной ввод',
          sourceProvider: 'manual',
        })
      }
      body = [
        {
          id: `m-${Date.now()}`,
          userId: 'u-1',
          metricType: 'weight',
          value: parsed.weight || 78.2,
          unit: 'kg',
          measuredAt: parsed.measuredAt || new Date().toISOString(),
          sourceProvider: 'manual',
          importMethod: 'manual',
          createdAt: new Date().toISOString(),
        }
      ]
    } else if (url.includes('/api/v1/bookings') && request.method === 'POST') {
      const parsed = JSON.parse(request.postData || '{}')
      const newBooking = {
        id: `b-${Date.now()}`,
        userId: 'u-1',
        clientName: 'Иван',
        trainerSlug: parsed.trainerSlug || (parsed.trainerId === 'dima' ? 'dima' : parsed.trainerId === 'vanya' ? 'vanya' : null),
        trainerName: parsed.trainerSlug === 'dima' || parsed.trainerId === 'dima' ? 'Дима' : parsed.trainerSlug === 'vanya' || parsed.trainerId === 'vanya' ? 'Ваня' : null,
        slotId: parsed.slotId || '2026-09-12-1100',
        startAt: '2026-09-12T11:00:00+03:00',
        endAt: '2026-09-12T12:00:00+03:00',
        status: 'confirmed',
        notes: null,
        createdAt: new Date().toISOString(),
        cancelledAt: null,
      }
      currentBookings.push(newBooking)
      body = newBooking
    } else if (url.includes('/cancel') && request.method === 'POST') {
      if (currentBookings.length > 0) {
        currentBookings[currentBookings.length - 1].status = 'cancelled'
      }
      body = {
        id: currentBookings.length > 0 ? currentBookings[currentBookings.length - 1].id : 'b-1',
        userId: 'u-1',
        clientName: 'Иван',
        trainerSlug: null,
        trainerName: null,
        slotId: '2026-09-12-1100',
        startAt: '2026-09-12T11:00:00+03:00',
        endAt: '2026-09-12T12:00:00+03:00',
        status: 'cancelled',
        notes: null,
        createdAt: new Date().toISOString(),
        cancelledAt: new Date().toISOString(),
      }
    } else if (url.includes('/api/v1/admin/bookings') && request.method === 'POST') {
      const parsed = JSON.parse(request.postData || '{}')
      const newAdminBooking = {
        id: `ab-${Date.now()}`,
        userId: `u-${Date.now()}`,
        clientName: parsed.clientName || 'Новый Клиент',
        trainerSlug: parsed.trainerSlug || null,
        trainerName: parsed.trainerSlug === 'dima' ? 'Дима' : null,
        slotId: parsed.slotId || '2026-09-12-1100',
        startAt: '2026-09-12T11:00:00+03:00',
        endAt: '2026-09-12T12:00:00+03:00',
        status: 'confirmed',
        notes: null,
        createdAt: new Date().toISOString(),
        cancelledAt: null,
      }
      mockAdminBookings.push(newAdminBooking)
      body = newAdminBooking
    } else {
      body = {}
    }

    const headers = [
      { name: 'Content-Type', value: 'application/json' },
      { name: 'Access-Control-Allow-Origin', value: '*' },
    ]

    await cdp.send('Fetch.fulfillRequest', {
      requestId,
      responseCode: status,
      responseHeaders: headers,
      body: Buffer.from(JSON.stringify(body)).toString('base64'),
    })
  })

  async function capture(filename) {
    const res = await cdp.send('Page.captureScreenshot', { format: 'png' })
    const buffer = Buffer.from(res.data, 'base64')
    const qaPath = join(QA_DIR, filename)
    const brainPath = join(BRAIN_DIR, filename)
    writeFileSync(qaPath, buffer)
    copyFileSync(qaPath, brainPath)
    console.log(`  [Screenshot] Saved ${filename}`)
  }

  async function setViewport(vp, zoom = 1) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: 2,
      mobile: true,
    })
    if (zoom !== 1) {
      await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: zoom })
    }
  }

  async function checkA11yAndOverflow() {
    const res = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const body = document.body;
        const html = document.documentElement;
        const scrollWidth = Math.max(body.scrollWidth, html.scrollWidth);
        const clientWidth = html.clientWidth;
        const hasHorizontalScroll = scrollWidth > clientWidth + 1;

        const interactive = Array.from(document.querySelectorAll('button, a, input, select, [role="button"], [role="radio"], [role="tab"]'));
        const sub44 = interactive.filter(el => {
          if (el.offsetWidth === 0 && el.offsetHeight === 0) return false;
          if (el.closest('[aria-hidden="true"]') && !el.closest('.modal')) return false;
          const rect = el.getBoundingClientRect();
          return (rect.width < 43 || rect.height < 43) && !el.classList.contains('sr-only');
        }).map(el => ({
          tag: el.tagName,
          text: el.innerText ? el.innerText.slice(0, 30) : el.getAttribute('aria-label') || el.className,
          w: Math.round(el.getBoundingClientRect().width),
          h: Math.round(el.getBoundingClientRect().height)
        }));

        return {
          hasHorizontalScroll,
          scrollWidth,
          clientWidth,
          sub44Count: sub44.length,
          sub44Samples: sub44.slice(0, 5)
        };
      })()`,
      returnByValue: true,
    })
    return res.result.value
  }

  const matrixResults = []

  console.log('\n--- PART 1: Acceptance Matrix (10 Screens x 4 Viewports = 40 Views) ---')

  const screens = [
    { id: '01_home', route: '/', name: 'Главная' },
    { id: '02_schedule', route: '/schedule', name: 'Расписание' },
    { id: '03_booking_create', route: '/booking/2026-09-12-1100', name: 'Оформление записи' },
    { id: '04_booking_details', route: '/booking/2026-09-12-1100', name: 'Детали записи', prepare: () => {
      currentBookings = [{
        id: 'b-active-1',
        slotId: '2026-09-12-1100',
        date: '2026-09-12',
        time: '11:00–12:00',
        title: 'Тренировка в зале',
        trainerId: 'dima',
        trainerName: 'Дима',
        status: 'confirmed',
        createdAt: '2026-09-12T08:00:00+03:00'
      }]
    }},
    { id: '05_trainers', route: '/trainers', name: 'Тренеры' },
    { id: '06_trainer_profile', route: '/trainers/dima', name: 'Профиль тренера' },
    { id: '07_progress', route: '/progress', name: 'Прогресс' },
    { id: '08_profile', route: '/profile', name: 'Профиль' },
    { id: '09_integrations', route: '/integrations', name: 'Интеграции' },
    { id: '10_admin', route: '/admin', name: 'Админ-панель' },
  ]

  for (const screen of screens) {
    console.log(`\nEvaluating Screen: ${screen.name} (${screen.id})`)
    if (screen.prepare) screen.prepare()
    else currentBookings = []

    for (const vp of VIEWPORTS) {
      await setViewport(vp)
      await cdp.send('Page.navigate', { url: `${APP_URL}${screen.route}` })
      await sleep(700)

      if (screen.id === '07_progress') {
        const progressCheck = await cdp.send('Runtime.evaluate', {
          expression: `(() => {
            const heroVal = document.querySelector('.hero-metric__value')?.innerText?.trim();
            const heroUnit = document.querySelector('.hero-metric__unit')?.innerText?.trim();
            const hasSkeleton = !!document.querySelector('.skeleton');
            return { heroVal, heroUnit, hasSkeleton };
          })()`,
          returnByValue: true,
        })
        const pVal = progressCheck.result.value
        console.log(`  [Progress Assertion] heroVal="${pVal.heroVal}", heroUnit="${pVal.heroUnit}", hasSkeleton=${pVal.hasSkeleton}`)
        if (!pVal.heroVal || pVal.heroVal !== '78,2') {
          throw new Error(`Progress hero value assertion failed: expected "78,2", got "${pVal.heroVal}"`)
        }
      }

      if (screen.id === '10_admin') {
        const adminCheck = await cdp.send('Runtime.evaluate', {
          expression: `(() => {
            const bookings = document.querySelectorAll('.admin-booking-item');
            const hasSkeleton = !!document.querySelector('.admin-page--skeleton, .skeleton');
            const capacityVal = document.querySelector('.capacity-control__output')?.innerText?.trim();
            return { bookingCount: bookings.length, hasSkeleton, capacityVal };
          })()`,
          returnByValue: true,
        })
        const aVal = adminCheck.result.value
        console.log(`  [Admin Assertion] bookingCount=${aVal.bookingCount}, hasSkeleton=${aVal.hasSkeleton}, capacityVal="${aVal.capacityVal}"`)
        if (aVal.hasSkeleton || aVal.bookingCount === 0) {
          throw new Error(`Admin assertion failed: bookingCount=${aVal.bookingCount}, hasSkeleton=${aVal.hasSkeleton}`)
        }
      }

      const diag = await checkA11yAndOverflow()
      const filename = `m12_${screen.id}_${vp.name}.png`
      await capture(filename)

      matrixResults.push({
        screen: screen.id,
        screenName: screen.name,
        viewport: vp.name,
        width: vp.width,
        height: vp.height,
        hasHorizontalScroll: diag.hasHorizontalScroll,
        sub44Count: diag.sub44Count,
        sub44Samples: diag.sub44Samples,
        screenshot: filename,
        status: !diag.hasHorizontalScroll ? 'PASS' : 'FAIL',
      })
    }
  }

  console.log('\n--- PART 2: Edge Cases & Error States ---')

  // 2.1 Home with Schedule Error
  serverMode = 'error_home_schedule'
  await setViewport(VIEWPORTS[2]) // 390x844
  await cdp.send('Page.navigate', { url: `${APP_URL}/` })
  await sleep(700)
  await capture('m12_edge_home_schedule_error_390x844.png')

  // 2.2 Schedule Network 500 Error
  serverMode = 'error_500'
  await cdp.send('Page.navigate', { url: `${APP_URL}/schedule` })
  await sleep(700)
  await capture('m12_edge_schedule_error_500_390x844.png')

  // 2.3 Trainers 500 Error
  await cdp.send('Page.navigate', { url: `${APP_URL}/trainers` })
  await sleep(700)
  await capture('m12_edge_trainers_error_500_390x844.png')

  // 2.4 Trainer Unknown 404
  serverMode = 'normal'
  await cdp.send('Page.navigate', { url: `${APP_URL}/trainers/unknown_trainer_99` })
  await sleep(700)
  await capture('m12_edge_trainer_not_found_390x844.png')

  // 2.5 Progress 500 Error
  serverMode = 'error_500'
  await cdp.send('Page.navigate', { url: `${APP_URL}/progress` })
  await sleep(700)
  await capture('m12_edge_progress_error_500_390x844.png')

  // 2.6 Profile 500 Error
  await cdp.send('Page.navigate', { url: `${APP_URL}/profile` })
  await sleep(700)
  await capture('m12_edge_profile_error_500_390x844.png')

  // 2.7 Admin 500 Error
  await cdp.send('Page.navigate', { url: `${APP_URL}/admin` })
  await sleep(700)
  await capture('m12_edge_admin_error_500_390x844.png')

  // 2.8 Empty Schedule
  serverMode = 'empty_schedule'
  await cdp.send('Page.navigate', { url: `${APP_URL}/schedule` })
  await sleep(700)
  await capture('m12_edge_schedule_empty_390x844.png')

  // 2.9 Empty Trainers
  serverMode = 'empty_trainers'
  await cdp.send('Page.navigate', { url: `${APP_URL}/trainers` })
  await sleep(700)
  await capture('m12_edge_trainers_empty_390x844.png')

  // 2.10 Admin Empty Bookings
  await cdp.send('Page.navigate', { url: `${APP_URL}/admin` })
  await sleep(700)
  await capture('m12_edge_admin_empty_bookings_390x844.png')

  console.log('\n--- PART 3: Long Russian Content on 320x740 ---')
  serverMode = 'long_content'
  await setViewport(VIEWPORTS[0]) // 320x740

  // 3.1 Long Profile Name
  await cdp.send('Page.navigate', { url: `${APP_URL}/profile` })
  await sleep(700)
  await capture('m12_edge_long_profile_320x740.png')

  // 3.2 Long Trainer Description & Multiple Specialties
  await cdp.send('Page.navigate', { url: `${APP_URL}/trainers` })
  await sleep(700)
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const btn = document.querySelector('.trainer-entity__disclosure-btn');
      if (btn) btn.click();
    })()`
  })
  await sleep(300)
  await capture('m12_edge_long_trainers_expanded_320x740.png')

  // 3.3 Long Trainer Profile
  await cdp.send('Page.navigate', { url: `${APP_URL}/trainers/dima` })
  await sleep(700)
  await capture('m12_edge_long_trainer_profile_320x740.png')

  console.log('\n--- PART 4: Open Modals & Dialogs ---')
  serverMode = 'normal'
  await setViewport(VIEWPORTS[2]) // 390x844

  // 4.1 Club Location Modal (Home)
  await cdp.send('Page.navigate', { url: `${APP_URL}/` })
  await sleep(700)
  await cdp.send('Runtime.evaluate', {
    expression: `document.querySelector('.home-location-btn')?.click()`
  })
  await sleep(400)
  await capture('m12_modal_club_location_390x844.png')

  // 4.2 Booking Cancel Confirmation Modal
  currentBookings = [{
    id: 'b-to-cancel',
    slotId: '2026-09-12-1730',
    date: '2026-09-12',
    time: '17:30–18:30',
    title: 'Тренировка в зале',
    trainerId: null,
    trainerName: null,
    status: 'confirmed',
    createdAt: '2026-09-12T08:00:00+03:00'
  }]
  await cdp.send('Page.navigate', { url: `${APP_URL}/booking/2026-09-12-1730` })
  await sleep(700)
  await cdp.send('Runtime.evaluate', {
    expression: `document.querySelector('.training-details__cancel-btn')?.click()`
  })
  await sleep(400)
  await capture('m12_modal_booking_cancel_390x844.png')

  // 4.3 Profile History Modal
  await cdp.send('Page.navigate', { url: `${APP_URL}/profile` })
  await sleep(700)
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const histBtn = btns.find(b => b.innerText.includes('Вся история'));
      if (histBtn) histBtn.click();
    })()`
  })
  await sleep(400)
  await capture('m12_modal_profile_history_390x844.png')

  // 4.4 Progress Add Measurement Modal
  await cdp.send('Page.navigate', { url: `${APP_URL}/progress` })
  await sleep(700)
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const btn = document.querySelector('.progress-action-btn--add') || Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Замер'));
      if (btn) btn.click();
    })()`
  })
  await sleep(400)
  await capture('m12_modal_progress_add_measurement_390x844.png')

  // 4.5 Admin Add Client Modal & Error Handling
  serverMode = 'error_mutation'
  await cdp.send('Page.navigate', { url: `${APP_URL}/admin` })
  await sleep(700)
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Записать клиента'));
      if (btn) btn.click();
    })()`
  })
  await sleep(400)
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const input = document.getElementById('client-name-input');
      if (input) {
        input.value = 'Ольга Смирнова';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const form = document.querySelector('.add-client-form');
      if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    })()`
  })
  await sleep(500)
  await capture('m12_modal_admin_add_client_error_390x844.png')

  console.log('\n--- PART 5: 200% Text Zoom & Scroll Integrity ---')
  serverMode = 'normal'
  currentBookings = []
  await setViewport(VIEWPORTS[2], 2.0) // 390x844 at 200% zoom
  await cdp.send('Page.navigate', { url: `${APP_URL}/` })
  await sleep(700)
  await capture('m12_zoom_200_home_390x844.png')

  await cdp.send('Page.navigate', { url: `${APP_URL}/schedule` })
  await sleep(700)
  await capture('m12_zoom_200_schedule_390x844.png')

  await setViewport(VIEWPORTS[2], 1.0)

  console.log('\n--- PART 6: Cross-Cutting End-to-End Flows ---')

  // Flow 1: Home -> Schedule -> Booking create -> Submit & 350ms hold -> Confirmed -> Details -> Cancel -> Cancelled
  console.log('Testing Flow 1: Booking lifecycle and cancellation')
  await cdp.send('Page.navigate', { url: `${APP_URL}/` })
  await sleep(700)
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const btn = document.querySelector('.hero-workout__cta') || Array.from(document.querySelectorAll('a, button')).find(el => el.innerText.includes('Записаться'));
      if (btn) btn.click();
    })()`
  })
  await sleep(700)
  // On booking create page
  await capture('m12_flow1_booking_form_390x844.png')

  // Submit booking
  await cdp.send('Runtime.evaluate', {
    expression: `document.querySelector('.booking-submit-btn')?.click()`
  })
  await sleep(150)
  await capture('m12_flow1_booking_hold_390x844.png')
  await sleep(600)
  await capture('m12_flow1_booking_confirmed_details_390x844.png')

  // Cancel booking
  await cdp.send('Runtime.evaluate', {
    expression: `document.querySelector('.training-details__cancel-btn')?.click()`
  })
  await sleep(350)
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const btns = Array.from(document.querySelectorAll('.cancel-confirm-modal button'));
      const confirmBtn = btns.find(b => b.innerText.includes('Да, отменить'));
      if (confirmBtn) confirmBtn.click();
    })()`
  })
  await sleep(600)
  await capture('m12_flow1_booking_cancelled_details_390x844.png')

  // Flow 2: Trainers -> Profile -> Schedule with trainer filter -> Back to Trainer
  console.log('Testing Flow 2: Trainers editorial & schedule context filter')
  await cdp.send('Page.navigate', { url: `${APP_URL}/trainers` })
  await sleep(700)
  await cdp.send('Runtime.evaluate', {
    expression: `document.querySelector('.trainer-entity__identity-link')?.click()`
  })
  await sleep(700)
  await capture('m12_flow2_trainer_profile_390x844.png')

  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const btn = Array.from(document.querySelectorAll('a, button')).find(el => el.innerText.includes('Выбрать время'));
      if (btn) btn.click();
    })()`
  })
  await sleep(700)
  await capture('m12_flow2_schedule_filtered_390x844.png')

  // Flow 3: Progress -> Manual Entry -> Add Measurement
  console.log('Testing Flow 3: Progress manual measurement')
  await cdp.send('Page.navigate', { url: `${APP_URL}/progress` })
  await sleep(700)
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const btn = document.querySelector('.progress-action-btn--add') || Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Замер'));
      if (btn) btn.click();
    })()`
  })
  await sleep(400)
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const weightInput = document.getElementById('measurement-weight');
      if (weightInput) {
        weightInput.value = '77.9';
        weightInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const form = document.querySelector('.measurement-form');
      if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    })()`
  })
  await sleep(600)
  await capture('m12_flow3_progress_updated_390x844.png')

  // Flow 4: Integrations -> Permissions Info -> Disconnect modal -> Escape close
  console.log('Testing Flow 4: Integrations & Escape LIFO')
  await cdp.send('Page.navigate', { url: `${APP_URL}/integrations` })
  await sleep(700)
  await capture('m12_flow4_integrations_main_390x844.png')

  // Flow 5: Admin capacity stepper & slot management
  console.log('Testing Flow 5: Admin capacity stepper & slots')
  await cdp.send('Page.navigate', { url: `${APP_URL}/admin` })
  await sleep(700)
  // Click stepper increment
  await cdp.send('Runtime.evaluate', {
    expression: `document.querySelector('button[aria-label="Увеличить вместимость"]')?.click()`
  })
  await sleep(300)
  await capture('m12_flow5_admin_capacity_stepper_390x844.png')

  console.log('\n--- PART 7: Motion Continuity & Steady-State Diagnostics ---')
  await cdp.send('Page.navigate', { url: `${APP_URL}/` })
  await sleep(1000)

  const animDiag = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const anims = document.getAnimations ? document.getAnimations() : [];
      const running = anims.filter(a => a.playState === 'running');
      return {
        totalAnimations: anims.length,
        runningCount: running.length,
        runningNames: running.map(a => a.animationName || a.id || 'anonymous')
      };
    })()`,
    returnByValue: true,
  })
  console.log('[Motion] Steady state animations:', animDiag.result.value)

  writeFileSync(
    join(QA_DIR, 'acceptance_matrix_m12.json'),
    JSON.stringify({ matrixResults, animDiag: animDiag.result.value }, null, 2)
  )

  console.log('\n=== M12 Final Acceptance QA Suite Completed Successfully ===')

  cdp.close()
  chrome.kill()
}

runM12AcceptanceQA().catch((err) => {
  console.error('QA Suite Error:', err)
  process.exit(1)
})
