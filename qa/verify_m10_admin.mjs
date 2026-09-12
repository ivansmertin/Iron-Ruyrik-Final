import { spawn } from 'node:child_process'
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const QA_DIR = 'qa'
const BRAIN_DIR = 'C:\\Users\\iwans\\.gemini\\antigravity\\brain\\609f967c-eaac-4768-ba0d-9ca04bdef2af'
const APP_URL = 'http://localhost:5173/admin'

mkdirSync(QA_DIR, { recursive: true })

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function runM10QA() {
  console.log('=== Starting M10 Admin Browser QA with CDP ===')
  const profileDir = join(tmpdir(), 'chrome_m10_' + Date.now())
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9225',
    `--user-data-dir=${profileDir}`,
    '--disable-gpu',
    '--no-first-run',
    '--window-size=1280,1024',
  ])

  await sleep(2000)

  let tabs
  for (let i = 0; i < 5; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9225/json/list')
      tabs = await res.json()
      if (tabs && tabs.length > 0) break
    } catch {
      await sleep(1000)
    }
  }

  const pageTab = tabs.find((t) => t.type === 'page') || tabs[0]
  const cdp = new CDPClient(pageTab.webSocketDebuggerUrl)
  await cdp.ready()
  console.log('CDP connection established on port 9225')

  await cdp.send('Page.enable')
  await cdp.send('DOM.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Fetch.enable', {
    patterns: [{ urlPattern: '*api/v1*' }],
  })

  let fixtureMode = 'baseline'

  const adminProfile = {
    user: {
      id: 'admin_1',
      name: 'Святослав Рюрикович',
      city: 'Великий Новгород',
      role: 'admin',
      isActive: true,
    },
    membership: {
      id: 'm_admin',
      name: 'Администратор зала',
      type: 'unlimited',
      startsAt: '2026-01-01T00:00:00+03:00',
      expiresAt: null,
      visitsTotal: 0,
      visitsRemaining: 0,
      status: 'active',
    },
    history: [],
  }

  const adminSettings = {
    gymCapacity: 8,
    defaultBookingDurationMinutes: 60,
    bookingStepMinutes: 60,
    cancelBeforeMinutes: 120,
    timezone: 'Europe/Moscow',
  }

  const baseSchedule = {
    timezone: 'Europe/Moscow',
    capacity: 8,
    days: [
      {
        date: '2026-09-12',
        slots: [
          { id: 's1', startAt: '2026-09-12T10:00:00+03:00', endAt: '2026-09-12T11:00:00+03:00', booked: 3, capacity: 8, available: 5, isBlocked: false },
          { id: 's2', startAt: '2026-09-12T11:00:00+03:00', endAt: '2026-09-12T12:00:00+03:00', booked: 8, capacity: 8, available: 0, isBlocked: false },
          { id: 's3', startAt: '2026-09-12T12:00:00+03:00', endAt: '2026-09-12T13:00:00+03:00', booked: 0, capacity: 8, available: 0, isBlocked: true },
          { id: 's4', startAt: '2026-09-12T13:00:00+03:00', endAt: '2026-09-12T14:00:00+03:00', booked: 5, capacity: 8, available: 3, isBlocked: false },
          { id: 's5', startAt: '2026-09-12T14:00:00+03:00', endAt: '2026-09-12T15:00:00+03:00', booked: 2, capacity: 8, available: 6, isBlocked: false },
          { id: 's6', startAt: '2026-09-12T15:00:00+03:00', endAt: '2026-09-12T16:00:00+03:00', booked: 4, capacity: 8, available: 4, isBlocked: false },
        ],
      },
    ],
  }

  const baseBookings = [
    {
      id: 'bk_1',
      userId: 'u_1',
      clientName: 'Алексей Смирнов',
      trainerSlug: 'dima',
      trainerName: 'Дима',
      slotId: 's1',
      startAt: '2026-09-12T10:00:00+03:00',
      endAt: '2026-09-12T11:00:00+03:00',
      status: 'confirmed',
      notes: null,
      createdAt: '2026-09-11T10:00:00+03:00',
      cancelledAt: null,
    },
    {
      id: 'bk_2',
      userId: 'u_2',
      clientName: 'Михаил Сидоров',
      trainerSlug: null,
      trainerName: null,
      slotId: 's2',
      startAt: '2026-09-12T11:00:00+03:00',
      endAt: '2026-09-12T12:00:00+03:00',
      status: 'completed',
      notes: null,
      createdAt: '2026-09-11T11:00:00+03:00',
      cancelledAt: null,
    },
    {
      id: 'bk_3',
      userId: 'u_3',
      clientName: 'Дарья Романова',
      trainerSlug: null,
      trainerName: null,
      slotId: 's2',
      startAt: '2026-09-12T11:00:00+03:00',
      endAt: '2026-09-12T12:00:00+03:00',
      status: 'cancelled',
      notes: null,
      createdAt: '2026-09-11T11:30:00+03:00',
      cancelledAt: '2026-09-11T12:00:00+03:00',
    },
  ]

  const longNamesBookings = [
    {
      id: 'bk_long_1',
      userId: 'u_long',
      clientName: 'Константинопольский Константин Константинович',
      trainerSlug: 'dima',
      trainerName: 'Дима',
      slotId: 's1',
      startAt: '2026-09-12T10:00:00+03:00',
      endAt: '2026-09-12T11:00:00+03:00',
      status: 'confirmed',
      notes: null,
      createdAt: '2026-09-11T10:00:00+03:00',
      cancelledAt: null,
    },
    {
      id: 'bk_long_2',
      userId: 'u_long_2',
      clientName: 'Александра-Франциска Преображенская-Голицына',
      trainerSlug: null,
      trainerName: null,
      slotId: 's2',
      startAt: '2026-09-12T11:00:00+03:00',
      endAt: '2026-09-12T12:00:00+03:00',
      status: 'completed',
      notes: null,
      createdAt: '2026-09-11T11:00:00+03:00',
      cancelledAt: null,
    },
  ]

  const baseBlocks = [
    {
      id: 'blk_1',
      startAt: '2026-09-12T12:00:00+03:00',
      endAt: '2026-09-12T13:00:00+03:00',
      type: 'closed',
      reason: 'Закрыто администратором',
      createdAt: '2026-09-11T09:00:00+03:00',
    },
  ]

  cdp.on('Fetch.requestPaused', async (params) => {
    const { requestId, request } = params
    const url = request.url

    const respondJson = async (bodyObj, status = 200) => {
      const body = Buffer.from(JSON.stringify(bodyObj)).toString('base64')
      await cdp.send('Fetch.fulfillRequest', {
        requestId,
        responseCode: status,
        responseHeaders: [
          { name: 'Content-Type', value: 'application/json' },
          { name: 'Access-Control-Allow-Origin', value: '*' },
        ],
        body,
      })
    }

    if (fixtureMode === 'error_500') {
      await respondJson({ detail: 'Internal Server Error' }, 500)
      return
    }

    if (url.includes('/api/v1/profile')) {
      await respondJson(adminProfile)
    } else if (url.includes('/api/v1/admin/settings')) {
      await respondJson(adminSettings)
    } else if (url.includes('/api/v1/schedule')) {
      await respondJson(baseSchedule)
    } else if (url.includes('/api/v1/admin/bookings')) {
      if (fixtureMode === 'empty_bookings') {
        await respondJson([])
      } else if (fixtureMode === 'long_names') {
        await respondJson(longNamesBookings)
      } else {
        await respondJson(baseBookings)
      }
    } else if (url.includes('/api/v1/admin/booking-blocks')) {
      await respondJson(baseBlocks)
    } else {
      await cdp.send('Fetch.continueRequest', { requestId })
    }
  })

  const setViewport = async (vp) => {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: 2,
      mobile: true,
    })
    await cdp.send('Emulation.setVisibleSize', { width: vp.width, height: vp.height })
  }

  const captureScreenshot = async (name) => {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' })
    const filename = `${name}.png`
    const qaPath = join(QA_DIR, filename)
    const brainPath = join(BRAIN_DIR, filename)
    writeFileSync(qaPath, Buffer.from(data, 'base64'))
    try {
      copyFileSync(qaPath, brainPath)
    } catch (e) {
      console.warn('Failed to copy to brain:', e.message)
    }
    console.log(`Saved screenshot: ${filename}`)
  }

  const evaluate = async (expression) => {
    const res = await cdp.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    return res.result.value
  }

  // 1. Baseline viewports check
  for (const vp of VIEWPORTS) {
    fixtureMode = 'baseline'
    await setViewport(vp)
    await cdp.send('Page.navigate', { url: APP_URL })
    await sleep(1500)

    const metrics = await evaluate(`(() => {
      const scrollWidth = document.documentElement.scrollWidth;
      const clientWidth = document.documentElement.clientWidth;
      const hasHorizontalScroll = scrollWidth > clientWidth;

      const backBtn = document.querySelector('.mobile-header__back');
      const addClientBtn = document.querySelector('.admin-header .button');
      const timelineBtns = Array.from(document.querySelectorAll('.timeline-slot-btn')).map(b => {
        const r = b.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) };
      });
      const stepperBtns = Array.from(document.querySelectorAll('.capacity-control__btn')).map(b => {
        const r = b.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) };
      });

      const backRect = backBtn ? backBtn.getBoundingClientRect() : null;
      const addRect = addClientBtn ? addClientBtn.getBoundingClientRect() : null;

      const bookings = Array.from(document.querySelectorAll('.admin-booking-item')).map(item => ({
        time: item.querySelector('.admin-booking-item__time')?.textContent?.trim(),
        client: item.querySelector('.admin-booking-item__client')?.textContent?.trim(),
        trainer: item.querySelector('.admin-booking-item__trainer')?.textContent?.trim(),
        status: item.querySelector('.status')?.textContent?.trim(),
      }));

      return {
        hasHorizontalScroll,
        scrollWidth,
        clientWidth,
        backBtnTarget: backRect ? { w: Math.round(backRect.width), h: Math.round(backRect.height) } : null,
        addBtnTarget: addRect ? { w: Math.round(addRect.width), h: Math.round(addRect.height) } : null,
        timelineBtns,
        stepperBtns,
        bookingsCount: bookings.length,
      };
    })()`)

    console.log(`[Viewport ${vp.name}] metrics:`, JSON.stringify(metrics, null, 2))
    if (metrics.hasHorizontalScroll) {
      console.error(`FAIL: Horizontal scroll detected on ${vp.name}!`)
    }

    await captureScreenshot(`m10_admin_${vp.name}`)
  }

  // 2. Edge Case: Long Russian Names at 320x740
  console.log('=== Checking Edge Case: Long Names at 320x740 ===')
  fixtureMode = 'long_names'
  await setViewport(VIEWPORTS[0])
  await cdp.send('Page.navigate', { url: APP_URL })
  await sleep(1500)

  const longNamesMetrics = await evaluate(`(() => {
    const scrollWidth = document.documentElement.scrollWidth;
    const clientWidth = document.documentElement.clientWidth;
    const hasHorizontalScroll = scrollWidth > clientWidth;
    const clientNames = Array.from(document.querySelectorAll('.admin-booking-item__client')).map(el => el.textContent.trim());
    return { hasHorizontalScroll, clientNames };
  })()`)

  console.log('[Edge Case: Long Names] metrics:', longNamesMetrics)
  await captureScreenshot('m10_admin_long_names_320x740')

  // 3. Edge Case: Empty Bookings State at 390x844
  console.log('=== Checking Edge Case: Empty Bookings State at 390x844 ===')
  fixtureMode = 'empty_bookings'
  await setViewport(VIEWPORTS[2])
  await cdp.send('Page.navigate', { url: APP_URL })
  await sleep(1500)

  const emptyMetrics = await evaluate(`(() => {
    const emptyEl = document.querySelector('.admin-bookings-empty');
    return {
      emptyFound: !!emptyEl,
      text: emptyEl?.textContent?.trim(),
      role: emptyEl?.getAttribute('role'),
    };
  })()`)

  console.log('[Edge Case: Empty Bookings] metrics:', emptyMetrics)
  await captureScreenshot('m10_admin_empty_bookings_390x844')

  // 4. Interactive Flow: Add Client Modal Open with Validation/API Error
  console.log('=== Checking Modal Flow & In-Modal Error ===')
  fixtureMode = 'baseline'
  await setViewport(VIEWPORTS[2])
  await cdp.send('Page.navigate', { url: APP_URL })
  await sleep(1500)

  // Click "Записать клиента" button
  await evaluate(`document.querySelector('.admin-header .button').click()`)
  await sleep(600)

  // Type a name and trigger submission error or inspect modal elements
  await evaluate(`(() => {
    const input = document.querySelector('#client-name-input');
    if (input) {
      input.value = 'Владимир Красно Солнышко';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  })()`)
  await sleep(300)

  // Simulate in-modal error for inspection
  await evaluate(`(() => {
    const form = document.querySelector('.add-client-form');
    if (form && !document.querySelector('.add-client-form .inline-error')) {
      const err = document.createElement('div');
      err.className = 'inline-error';
      err.setAttribute('role', 'alert');
      err.textContent = 'Слот 10:00 уже заполнен или недоступен';
      form.prepend(err);
    }
  })()`)
  await sleep(300)

  const modalMetrics = await evaluate(`(() => {
    const modal = document.querySelector('.modal');
    const closeBtn = document.querySelector('.modal__close');
    const input = document.querySelector('#client-name-input');
    const closeRect = closeBtn?.getBoundingClientRect();
    const alert = document.querySelector('.inline-error');
    return {
      modalOpen: !!modal,
      closeBtnSize: closeRect ? { w: Math.round(closeRect.width), h: Math.round(closeRect.height) } : null,
      inputVal: input?.value,
      alertText: alert?.textContent,
    };
  })()`)

  console.log('[Modal Flow] metrics:', modalMetrics)
  await captureScreenshot('m10_admin_add_modal_error_390x844')

  // Close modal with Escape
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`)
  await sleep(400)

  // 5. Edge Case: Server Error 500 State at 390x844
  console.log('=== Checking Edge Case: Server Error 500 State ===')
  fixtureMode = 'error_500'
  await setViewport(VIEWPORTS[2])
  await cdp.send('Page.navigate', { url: APP_URL })
  await sleep(1500)

  const errorMetrics = await evaluate(`(() => {
    const alert = document.querySelector('.schedule-state-card--error');
    const retryBtn = alert?.querySelector('button');
    const retryRect = retryBtn?.getBoundingClientRect();
    return {
      alertFound: !!alert,
      title: alert?.querySelector('.schedule-state-card__title')?.textContent,
      retryBtnSize: retryRect ? { w: Math.round(retryRect.width), h: Math.round(retryRect.height) } : null,
    };
  })()`)

  console.log('[Edge Case: Server 500] metrics:', errorMetrics)
  await captureScreenshot('m10_admin_error_500_390x844')

  cdp.close()
  chrome.kill()
  console.log('=== M10 QA Completed Successfully ===')
}

runM10QA().catch((err) => {
  console.error('M10 QA Error:', err)
  process.exit(1)
})
