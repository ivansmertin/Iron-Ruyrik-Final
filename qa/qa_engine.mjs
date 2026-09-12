import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const QA_DIR = 'qa/baseline_m00'
const ARTIFACT_DIR = 'C:\\Users\\iwans\\.gemini\\antigravity\\brain\\450fa6ff-5b20-4591-902a-05926475b8f0\\screenshots'
const APP_URL = 'http://localhost:5173'

mkdirSync(QA_DIR, { recursive: true })
mkdirSync(ARTIFACT_DIR, { recursive: true })

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
        handlers.forEach(h => h(data.params))
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

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function runQA() {
  console.log('--- Starting M00 Comprehensive Baseline & QA Suite ---')
  const profileDir = join(tmpdir(), 'chrome_m00_v2_' + Date.now())
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9222',
    `--user-data-dir=${profileDir}`,
    '--disable-gpu',
    '--no-first-run',
    '--window-size=1280,1024'
  ])

  await sleep(2000)

  let tabs
  for (let i = 0; i < 5; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9222/json/list')
      tabs = await res.json()
      if (tabs && tabs.length > 0) break
    } catch {
      await sleep(1000)
    }
  }

  const pageTab = tabs.find(t => t.type === 'page') || tabs[0]
  const cdp = new CDPClient(pageTab.webSocketDebuggerUrl)
  await cdp.ready()
  console.log('CDP connection established')

  await cdp.send('Page.enable')
  await cdp.send('DOM.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Fetch.enable', {
    patterns: [{ urlPattern: '*/api/v1/*' }]
  })

  let currentFixtureMode = 'baseline'

  cdp.on('Fetch.requestPaused', async (params) => {
    const { requestId, request } = params
    const url = request.url

    if (currentFixtureMode === 'query_error' && (url.includes('/trainers') || url.includes('/profile'))) {
      return cdp.send('Fetch.fulfillRequest', {
        requestId,
        responseCode: 500,
        responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
        body: Buffer.from(JSON.stringify({ error: { code: 'SERVER_ERROR', message: 'Внутренняя ошибка сервера' } })).toString('base64')
      })
    }

    if (url.endsWith('/api/v1/home') && currentFixtureMode === 'baseline') {
      const homeData = {
        user: { id: '00000000-0000-0000-0000-000000000001', name: 'Алексей', role: 'client', isActive: true, city: 'Великий Новгород' },
        membership: { id: 'm-1', name: '8 посещений', type: 'visits_package', startsAt: '2026-08-20T00:00:00Z', expiresAt: '2026-09-20T23:59:00Z', visitsTotal: 8, visitsRemaining: 3, status: 'active' },
        nextBooking: {
          id: 'b-qa-future',
          userId: '00000000-0000-0000-0000-000000000001',
          clientName: 'Алексей',
          trainerSlug: null,
          trainerName: null,
          slotId: '2026-09-11-2030',
          startAt: '2026-09-11T17:30:00Z',
          endAt: '2026-09-11T18:30:00Z',
          status: 'confirmed',
          notes: null,
          createdAt: '2026-09-11T09:00:00Z',
          cancelledAt: null
        },
        currentOccupancy: 2,
        capacity: 8
      }
      return cdp.send('Fetch.fulfillRequest', {
        requestId,
        responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
        body: Buffer.from(JSON.stringify(homeData)).toString('base64')
      })
    }

    if (url.includes('/api/v1/profile')) {
      const isAdmin = currentFixtureMode === 'admin'
      const clientName = currentFixtureMode === 'long_russian' 
        ? 'Константинопольский Александр-Себастьян Владимирович' 
        : (isAdmin ? 'Администратор' : 'Алексей')
      const profileData = {
        user: { id: isAdmin ? '00000000-0000-0000-0000-000000000002' : '00000000-0000-0000-0000-000000000001', name: clientName, role: isAdmin ? 'admin' : 'client', isActive: true, city: 'Великий Новгород' },
        membership: { id: 'm-1', name: '8 посещений', type: 'visits_package', startsAt: '2026-08-20T00:00:00Z', expiresAt: '2026-09-20T23:59:00Z', visitsTotal: 8, visitsRemaining: 3, status: 'active' },
        history: [
          { id: 'b-h1', userId: 'u-1', clientName, trainerSlug: 'vanya', trainerName: 'Ваня', slotId: null, startAt: '2026-05-20T16:00:00Z', endAt: '2026-05-20T17:00:00Z', status: 'completed', notes: null, createdAt: '2026-05-20T17:00:00Z', cancelledAt: null },
          { id: 'b-h2', userId: 'u-1', clientName, trainerSlug: null, trainerName: null, slotId: null, startAt: '2026-05-18T06:00:00Z', endAt: '2026-05-18T07:00:00Z', status: 'completed', notes: null, createdAt: '2026-05-18T07:00:00Z', cancelledAt: null },
          { id: 'b-h3', userId: 'u-1', clientName, trainerSlug: 'dima', trainerName: 'Дима', slotId: null, startAt: '2026-05-15T15:00:00Z', endAt: '2026-05-15T16:00:00Z', status: 'completed', notes: null, createdAt: '2026-05-15T16:00:00Z', cancelledAt: null },
        ]
      }
      return cdp.send('Fetch.fulfillRequest', {
        requestId,
        responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
        body: Buffer.from(JSON.stringify(profileData)).toString('base64')
      })
    }

    if (url.endsWith('/api/v1/bookings') && currentFixtureMode === 'baseline') {
      const bookingsData = [
        {
          id: 'b-qa-future',
          userId: '00000000-0000-0000-0000-000000000001',
          clientName: 'Алексей',
          trainerSlug: null,
          trainerName: null,
          slotId: '2026-09-11-2030', // only 20:30 is booked in baseline!
          startAt: '2026-09-11T17:30:00Z',
          endAt: '2026-09-11T18:30:00Z',
          status: 'confirmed',
          notes: null,
          createdAt: '2026-09-11T09:00:00Z',
          cancelledAt: null
        }
      ]
      return cdp.send('Fetch.fulfillRequest', {
        requestId,
        responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
        body: Buffer.from(JSON.stringify(bookingsData)).toString('base64')
      })
    }

    if (url.includes('/api/v1/trainers')) {
      if (currentFixtureMode === 'trainers_0') {
        return cdp.send('Fetch.fulfillRequest', {
          requestId,
          responseCode: 200,
          responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
          body: Buffer.from(JSON.stringify([])).toString('base64')
        })
      }
      if (currentFixtureMode === 'trainers_10') {
        const many = Array.from({ length: 12 }).map((_, i) => ({
          id: `t-${i + 1}`,
          slug: `trainer-${i + 1}`,
          name: `Тренер ${i + 1}`,
          specialties: ['ОФП', 'Силовой тренинг', 'Реабилитация'],
          bio: 'Опытный наставник зала Железный Рюрик.'
        }))
        return cdp.send('Fetch.fulfillRequest', {
          requestId,
          responseCode: 200,
          responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
          body: Buffer.from(JSON.stringify(many)).toString('base64')
        })
      }
      if (currentFixtureMode === 'long_russian') {
        const longTrainer = [
          {
            id: 't-long',
            slug: 'dima',
            name: 'Преображенский-Стародубцев Святослав Ростиславович',
            specialties: [
              'Высокоинтенсивная функциональная подготовка',
              'Силовая реабилитация после спортивных травм опорно-двигательного аппарата',
              'Марафонский бег и циклическая выносливость'
            ],
            bio: 'Мастер спорта международного класса по пауэрлифтингу, старший инструктор зала с непрерывным стажем более пятнадцати лет.'
          }
        ]
        return cdp.send('Fetch.fulfillRequest', {
          requestId,
          responseCode: 200,
          responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
          body: Buffer.from(JSON.stringify(longTrainer)).toString('base64')
        })
      }
    }

    if (url.includes('/api/v1/health/progress') && currentFixtureMode === 'health_cold') {
      const coldData = {
        visitsThisMonth: 0,
        consistentWeeks: 0,
        latestWeight: null,
        latestBodyFat: null,
        latestMuscleMass: null,
        weightSeries: []
      }
      return cdp.send('Fetch.fulfillRequest', {
        requestId,
        responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
        body: Buffer.from(JSON.stringify(coldData)).toString('base64')
      })
    }

    cdp.send('Fetch.continueRequest', { requestId })
  })

  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      window.__viewTransitionsCount = 0;
      const originalSVT = document.startViewTransition;
      if (originalSVT) {
        document.startViewTransition = function(...args) {
          window.__viewTransitionsCount++;
          console.log('[CDP SPY] document.startViewTransition count=' + window.__viewTransitionsCount);
          return originalSVT.apply(this, args);
        };
      }
    `
  })

  async function takeScreenshot(name, fullPage = false) {
    const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: fullPage })
    const buf = Buffer.from(res.data, 'base64')
    writeFileSync(join(QA_DIR, `${name}.png`), buf)
    writeFileSync(join(ARTIFACT_DIR, `${name}.png`), buf)
    console.log(`Saved screenshot: ${name}.png (${buf.length} bytes)`)
  }

  async function setViewport(vp) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: 2,
      mobile: true,
      fitWindow: false
    })
  }

  async function waitForContentReady() {
    for (let i = 0; i < 20; i++) {
      const check = await cdp.send('Runtime.evaluate', {
        returnByValue: true,
        expression: `
          (function() {
            const hasSkeleton = document.querySelector('.home-page--skeleton, .hero-workout--skeleton, [aria-busy="true"]');
            const hasContent = document.querySelector('.home-header, .schedule-page, .training-details-page, .booking-page, .trainers-page, .trainer-page, .progress-page, .profile-page, .integrations-page, .admin-shell');
            return !hasSkeleton && Boolean(hasContent);
          })()
        `
      })
      if (check.result.value) return
      await sleep(150)
    }
  }

  // --- 1. CAPTURE 40 BASELINE SCREEN VIEWS ---
  console.log('\n--- Capturing 40 Baseline Screen Views ---')

  const SCREENS = [
    { id: '01_home', path: '/', mode: 'baseline' },
    { id: '02_schedule', path: '/schedule', mode: 'baseline' },
    { id: '03_booking_create', path: '/booking/2026-09-11-1900', mode: 'baseline' }, // 19:00 has no booking!
    { id: '04_booking_details', path: '/booking/b-qa-future', mode: 'baseline' },     // confirmed details!
    { id: '05_trainers', path: '/trainers', mode: 'baseline' },
    { id: '06_trainer_profile', path: '/trainers/dima', mode: 'baseline' },
    { id: '07_progress', path: '/progress', mode: 'baseline' },
    { id: '08_profile', path: '/profile', mode: 'baseline' },
    { id: '09_integrations', path: '/integrations', mode: 'baseline' },
    { id: '10_admin', path: '/admin', mode: 'admin' },
  ]

  for (const screen of SCREENS) {
    currentFixtureMode = screen.mode
    for (const vp of VIEWPORTS) {
      await setViewport(vp)
      await cdp.send('Page.navigate', { url: `${APP_URL}${screen.path}` })
      await waitForContentReady()
      await sleep(400) // Settle layout
      const filename = `baseline_${screen.id}_${vp.name}`
      await takeScreenshot(filename, false)
    }
  }

  // Capture Full Page versions on 320 and 390 for long screens
  console.log('\n--- Capturing Full-Page Views for 320 and 390 ---')
  for (const screenId of ['02_schedule', '07_progress', '08_profile', '09_integrations', '10_admin']) {
    const screen = SCREENS.find(s => s.id === screenId)
    currentFixtureMode = screen.mode
    for (const vp of [VIEWPORTS[0], VIEWPORTS[2]]) { // 320x740 and 390x844
      await setViewport(vp)
      await cdp.send('Page.navigate', { url: `${APP_URL}${screen.path}` })
      await waitForContentReady()
      await sleep(300)
      await takeScreenshot(`fullpage_${screen.id}_${vp.name}`, true)
    }
  }

  // --- 2. 200% TEXT ZOOM ON 390x844 ---
  console.log('\n--- Testing 200% Text Zoom on 390x844 ---')
  currentFixtureMode = 'baseline'
  await setViewport(VIEWPORTS[2])
  await cdp.send('Page.navigate', { url: `${APP_URL}/` })
  await waitForContentReady()
  // Emulate 200% font zoom by scaling font-size
  await cdp.send('Runtime.evaluate', {
    expression: `document.documentElement.style.fontSize = '200%';`
  })
  await sleep(400)
  await takeScreenshot('zoom200_01_home_390x844')

  await cdp.send('Page.navigate', { url: `${APP_URL}/schedule` })
  await waitForContentReady()
  await cdp.send('Runtime.evaluate', {
    expression: `document.documentElement.style.fontSize = '200%';`
  })
  await sleep(400)
  await takeScreenshot('zoom200_02_schedule_390x844')

  // Reset font size
  await cdp.send('Runtime.evaluate', {
    expression: `document.documentElement.style.fontSize = '';`
  })

  // --- 3. EDGE-CASE FIXTURES ---
  console.log('\n--- Capturing Edge-Case Fixtures ---')
  currentFixtureMode = 'trainers_0'
  await setViewport(VIEWPORTS[2])
  await cdp.send('Page.navigate', { url: `${APP_URL}/trainers` })
  await waitForContentReady()
  await sleep(400)
  await takeScreenshot('fixture_trainers_0_empty_390x844')

  currentFixtureMode = 'trainers_10'
  await cdp.send('Page.navigate', { url: `${APP_URL}/trainers` })
  await waitForContentReady()
  await sleep(400)
  await takeScreenshot('fixture_trainers_12_many_390x844')

  currentFixtureMode = 'long_russian'
  await setViewport(VIEWPORTS[0])
  await cdp.send('Page.navigate', { url: `${APP_URL}/trainers/dima` })
  await waitForContentReady()
  await sleep(400)
  await takeScreenshot('fixture_long_russian_trainer_320x740')

  await cdp.send('Page.navigate', { url: `${APP_URL}/profile` })
  await waitForContentReady()
  await sleep(400)
  await takeScreenshot('fixture_long_russian_profile_320x740')

  currentFixtureMode = 'health_cold'
  await setViewport(VIEWPORTS[2])
  await cdp.send('Page.navigate', { url: `${APP_URL}/progress` })
  await waitForContentReady()
  await sleep(400)
  await takeScreenshot('fixture_health_cold_progress_390x844')

  // --- 4. STEP-BY-STEP USER FLOW WALKTHROUGH ---
  console.log('\n--- Step-by-Step User Flow Walkthrough ---')

  // Flow 1: Schedule -> Slot 19:00 -> Booking create -> Submit -> 350ms -> Details -> Back
  currentFixtureMode = 'baseline'
  await setViewport(VIEWPORTS[2]) // 390x844
  await cdp.send('Page.navigate', { url: `${APP_URL}/schedule` })
  await waitForContentReady()
  await takeScreenshot('flow_1_schedule_before_click')

  // Click slot 19:00 (which is not yet booked)
  await cdp.send('Runtime.evaluate', {
    expression: `
      const slots = Array.from(document.querySelectorAll('a.time-slot.is-available'));
      const slot19 = slots.find(s => s.innerText.includes('19:00')) || slots[0];
      if (slot19) slot19.click();
    `
  })
  await waitForContentReady()
  await sleep(300)
  await takeScreenshot('flow_2_booking_create_form')

  // Click submit button
  await cdp.send('Runtime.evaluate', {
    expression: `
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Подтвердить запись'));
      if (btn) btn.click();
    `
  })
  // Capture holding confirmed state (150ms)
  await sleep(150)
  await takeScreenshot('flow_3_booking_confirmed_holding_state')

  // Settle into Details view (total > 350ms)
  await sleep(400)
  await takeScreenshot('flow_4_booking_details_rendered')

  // Click Back link
  await cdp.send('Runtime.evaluate', {
    expression: `
      const back = document.querySelector('a.back-link');
      if (back) back.click();
    `
  })
  await waitForContentReady()
  await sleep(300)
  await takeScreenshot('flow_5_returned_to_schedule')

  // Flow 2: Trainer -> Profile -> Back
  await cdp.send('Page.navigate', { url: `${APP_URL}/trainers` })
  await waitForContentReady()
  await takeScreenshot('flow_6_trainers_catalog')

  await cdp.send('Runtime.evaluate', {
    expression: `
      const link = document.querySelector('a[href*="/trainers/dima"], a[href*="/trainers/"]');
      if (link) link.click();
    `
  })
  await waitForContentReady()
  await sleep(300)
  await takeScreenshot('flow_7_trainer_profile_details')

  await cdp.send('Runtime.evaluate', {
    expression: `
      const back = document.querySelector('a.back-link');
      if (back) back.click();
    `
  })
  await waitForContentReady()
  await sleep(300)
  await takeScreenshot('flow_8_trainers_catalog_returned')

  // Flow 3: Progress -> Manual measurement modal -> Escape
  await cdp.send('Page.navigate', { url: `${APP_URL}/progress` })
  await waitForContentReady()
  await cdp.send('Runtime.evaluate', {
    expression: `
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Замер'));
      if (btn) btn.click();
    `
  })
  await sleep(400)
  await takeScreenshot('flow_9_progress_add_modal_opened')

  // Press Escape
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await sleep(400)
  await takeScreenshot('flow_10_progress_add_modal_closed_escape')

  // Flow 4: Admin modal -> Escape
  currentFixtureMode = 'admin'
  await cdp.send('Page.navigate', { url: `${APP_URL}/admin` })
  await waitForContentReady()
  await cdp.send('Runtime.evaluate', {
    expression: `
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Записать клиента'));
      if (btn) btn.click();
    `
  })
  await sleep(400)
  await takeScreenshot('flow_11_admin_add_modal_opened')

  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await sleep(400)
  await takeScreenshot('flow_12_admin_add_modal_closed_escape')

  // Flow 5: Integrations toggle & reopen defect
  currentFixtureMode = 'baseline'
  await cdp.send('Page.navigate', { url: `${APP_URL}/integrations` })
  await waitForContentReady()
  await takeScreenshot('flow_13_integrations_page')

  // Toggle Health Connect switch
  await cdp.send('Runtime.evaluate', {
    expression: `
      const toggle = document.querySelectorAll('.switch, input[type="checkbox"], [role="switch"]')[1];
      if (toggle) toggle.click();
    `
  })
  await sleep(300)
  await takeScreenshot('flow_14_integrations_after_toggle')

  // Check document.startViewTransition count
  const vtCount = await cdp.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `window.__viewTransitionsCount || 0`
  })
  console.log(`\n[DIAGNOSTICS] Total actual document.startViewTransition calls: ${vtCount.result.value}`)

  cdp.close()
  chrome.kill()
  console.log('\n--- Complete M00 QA Suite Finished Successfully! ---')
}

runQA().catch(err => {
  console.error('QA Suite Failed:', err)
  process.exit(1)
})
