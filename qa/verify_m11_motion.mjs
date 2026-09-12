import { spawn } from 'node:child_process'
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const QA_DIR = 'qa'
const BRAIN_DIR = 'C:\\Users\\iwans\\.gemini\\antigravity\\brain\\609f967c-eaac-4768-ba0d-9ca04bdef2af'
const APP_URL = 'http://localhost:5173'

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function runM11QA() {
  console.log('=== Starting M11 Motion Continuity Browser QA ===')

  const userDataDir = join(tmpdir(), `chrome_m11_qa_${Date.now()}`)
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

  // Fixture states
  const mockUser = {
    id: 'u-1',
    name: 'Иван',
    city: 'Великий Новгород',
    role: 'client',
  }

  const mockCapacity = {
    occupied: 3,
    limit: 8,
  }

  const mockDays = [
    { id: '2026-09-12', day: 12, weekday: 'СБ', monthLabel: 'сентября' },
    { id: '2026-09-13', day: 13, weekday: 'ВС', monthLabel: 'сентября' },
  ]

  const mockSchedule = {
    timezone: 'Europe/Moscow',
    capacity: 8,
    days: [
      {
        date: '2026-09-12',
        slots: [
          {
            id: 'slot-101',
            startAt: '2026-09-12T18:00:00+03:00',
            endAt: '2026-09-12T19:00:00+03:00',
            booked: 2,
            capacity: 8,
            available: 6,
            isBlocked: false,
          },
          {
            id: 'slot-102',
            startAt: '2026-09-12T19:30:00+03:00',
            endAt: '2026-09-12T20:30:00+03:00',
            booked: 5,
            capacity: 8,
            available: 3,
            isBlocked: false,
          },
        ],
      },
    ],
  }

  const mockTrainers = [
    {
      id: 't-1',
      slug: 'dima',
      name: 'Дима Волков',
      specialties: ['триатлон', 'бег', 'силовые'],
      bio: 'Мастер спорта по пауэрлифтингу и триатлонный тренер.',
      isActive: true,
    },
    {
      id: 't-2',
      slug: 'vanya',
      name: 'Ваня Кузнецов',
      specialties: ['похудение', 'рекомпозиция', 'силовые'],
      bio: 'Сертифицированный тренер по силовой подготовке.',
      isActive: true,
    },
  ]

  let bookingsList = []

  cdp.on('Fetch.requestPaused', async (params) => {
    const { requestId, request } = params
    const url = request.url
    const method = request.method

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

    if (url.includes('/api/v1/home')) {
      const activeBooking = bookingsList.find((b) => b.status === 'confirmed') || null
      await respondJson({
        user: mockUser,
        membership: null,
        nextBooking: activeBooking,
        currentOccupancy: 3,
        capacity: 8,
      })
      return
    }

    if (url.includes('/api/v1/schedule')) {
      await respondJson(mockSchedule)
      return
    }

    if (url.includes('/api/v1/trainers')) {
      await respondJson(mockTrainers)
      return
    }

    if (url.includes('/api/v1/news')) {
      await respondJson({ items: [] })
      return
    }

    if (url.includes('/api/v1/bookings')) {
      if (method === 'POST') {
        const postData = JSON.parse(request.postData || '{}')
        const newBooking = {
          id: `bk_${Date.now()}`,
          slotId: postData.slotId || 'slot-101',
          userId: mockUser.id,
          clientName: mockUser.name,
          trainerSlug: postData.trainerSlug || null,
          trainerName: postData.trainerSlug === 'dima' ? 'Дима Волков' : null,
          startAt: '2026-09-12T18:00:00+03:00',
          endAt: '2026-09-12T19:00:00+03:00',
          status: 'confirmed',
          notes: null,
          createdAt: new Date().toISOString(),
          cancelledAt: null,
        }
        bookingsList.push(newBooking)
        await sleep(150)
        await respondJson(newBooking, 201)
        return
      }

      await respondJson(bookingsList)
      return
    }

    if (url.includes('/api/v1/profile')) {
      await respondJson({
        user: mockUser,
        membership: null,
        history: [],
      })
      return
    }

    if (url.includes('/api/v1/health') || url.includes('/api/v1/progress')) {
      await respondJson({
        measurements: [],
        weightSeries: [],
        latestWeightSummary: null,
      })
      return
    }

    await cdp.send('Fetch.continueRequest', { requestId })
  })

  const setViewport = async (vp) => {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: 2,
      mobile: true,
    })
    console.log(`[Viewport] Set to ${vp.name} (${vp.width}x${vp.height})`)
  }

  const evaluate = async (expression) => {
    const res = await cdp.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    return res.result?.value
  }

  const captureScreenshot = async (name) => {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' })
    const buffer = Buffer.from(data, 'base64')
    const qaPath = join(QA_DIR, `${name}.png`)
    writeFileSync(qaPath, buffer)
    try {
      copyFileSync(qaPath, join(BRAIN_DIR, `${name}.png`))
    } catch {}
    console.log(`[Screenshot] Saved ${name}.png`)
  }

  // 1. Check Continuity Pair 1: Home Slot Time -> Booking Hero Time
  console.log('\n--- 1. Testing Home Slot Time -> Booking Hero Time ---')
  await setViewport(VIEWPORTS[2]) // 390x844
  await cdp.send('Page.navigate', { url: `${APP_URL}/` })
  await sleep(1500)

  const homeMetrics = await evaluate(`(() => {
    const heroTime = document.querySelector('.hero-workout__time');
    const ctaBtn = document.querySelector('.hero-workout__cta');
    const ctaRect = ctaBtn?.getBoundingClientRect();
    const style = heroTime ? window.getComputedStyle(heroTime) : null;
    return {
      heroTimeText: heroTime?.textContent?.trim(),
      viewTransitionName: heroTime?.style?.viewTransitionName || style?.viewTransitionName,
      ctaHref: ctaBtn?.getAttribute('href'),
      ctaSize: ctaRect ? { w: Math.round(ctaRect.width), h: Math.round(ctaRect.height) } : null,
    };
  })()`)
  console.log('[Home Hero] Metrics:', homeMetrics)
  await captureScreenshot('m11_motion_home_hero_390x844')

  // Click CTA to navigate to Booking
  await evaluate(`document.querySelector('.hero-workout__cta')?.click()`)
  await sleep(1000)

  const bookingFromHomeMetrics = await evaluate(`(() => {
    const timeEl = document.querySelector('.training-details__time');
    const style = timeEl ? window.getComputedStyle(timeEl) : null;
    const submitBtn = document.querySelector('.booking-submit-btn');
    const submitRect = submitBtn?.getBoundingClientRect();
    return {
      pathname: window.location.pathname,
      timeText: timeEl?.textContent?.trim(),
      viewTransitionName: timeEl?.style?.viewTransitionName || style?.viewTransitionName,
      submitBtnSize: submitRect ? { w: Math.round(submitRect.width), h: Math.round(submitRect.height) } : null,
    };
  })()`)
  console.log('[Booking from Home] Metrics:', bookingFromHomeMetrics)
  await captureScreenshot('m11_motion_booking_from_home_390x844')

  // 2. Check Continuity Pair 2: Schedule Selected Slot -> Booking Hero Time
  console.log('\n--- 2. Testing Schedule Slot -> Booking Hero Time ---')
  await cdp.send('Page.navigate', { url: `${APP_URL}/schedule` })
  await sleep(1200)

  const scheduleMetrics = await evaluate(`(() => {
    const slots = Array.from(document.querySelectorAll('.time-slot'));
    return {
      count: slots.length,
      slot0TransitionName: slots[0]?.querySelector('.time-slot__interval')?.style?.viewTransitionName || null,
      slot1TransitionName: slots[1]?.querySelector('.time-slot__interval')?.style?.viewTransitionName || null,
    };
  })()`)
  console.log('[Schedule Initial] No slots have viewTransitionName before click:', scheduleMetrics)
  await captureScreenshot('m11_motion_schedule_list_390x844')

  // Click first slot
  await evaluate(`document.querySelector('.time-slot.is-available')?.click()`)
  await sleep(1000)

  const bookingFromScheduleMetrics = await evaluate(`(() => {
    const timeEl = document.querySelector('.training-details__time');
    const style = timeEl ? window.getComputedStyle(timeEl) : null;
    const backLink = document.querySelector('.back-link');
    const backRect = backLink?.getBoundingClientRect();
    return {
      pathname: window.location.pathname,
      timeText: timeEl?.textContent?.trim(),
      viewTransitionName: timeEl?.style?.viewTransitionName || style?.viewTransitionName,
      backTarget: backRect ? { w: Math.round(backRect.width), h: Math.round(backRect.height) } : null,
    };
  })()`)
  console.log('[Booking from Schedule] Metrics:', bookingFromScheduleMetrics)
  await captureScreenshot('m11_motion_booking_from_schedule_390x844')

  // 3. Test Booking Flow: 350ms hold -> transition to Confirmed Details View
  console.log('\n--- 3. Testing Booking Flow: Submitting -> 350ms Hold -> Confirmed ---')
  // Click submit button
  await evaluate(`document.querySelector('.booking-submit-btn')?.click()`)
  await sleep(100)

  const submittingMetrics = await evaluate(`(() => {
    const btn = document.querySelector('.booking-submit-btn');
    return {
      isSubmitting: btn?.classList.contains('button--submitting'),
      isConfirmed: btn?.classList.contains('button--confirmed'),
      btnText: btn?.textContent?.trim(),
    };
  })()`)
  console.log('[Booking Submitting Phase]:', submittingMetrics)

  await sleep(250)
  const confirmedHoldMetrics = await evaluate(`(() => {
    const btn = document.querySelector('.booking-submit-btn');
    return {
      isConfirmed: btn?.classList.contains('button--confirmed'),
      btnText: btn?.textContent?.trim(),
    };
  })()`)
  console.log('[Booking 350ms Hold Phase]:', confirmedHoldMetrics)
  await captureScreenshot('m11_motion_booking_350ms_hold_390x844')

  // Wait for 350ms timer to resolve safeStartViewTransition
  await sleep(600)
  const detailsViewMetrics = await evaluate(`(() => {
    const statusText = document.querySelector('.training-details__status')?.textContent?.trim();
    const timeEl = document.querySelector('.training-details__time');
    const cancelBtn = document.querySelector('.training-details__cancel-btn');
    const cancelRect = cancelBtn?.getBoundingClientRect();
    return {
      statusText,
      timeText: timeEl?.textContent?.trim(),
      viewTransitionName: timeEl?.style?.viewTransitionName,
      cancelTarget: cancelRect ? { w: Math.round(cancelRect.width), h: Math.round(cancelRect.height) } : null,
    };
  })()`)
  console.log('[Booking Confirmed Details View]:', detailsViewMetrics)
  await captureScreenshot('m11_motion_booking_confirmed_details_390x844')

  // 4. Check Continuity Pair 3: Trainers List -> Trainer Profile
  console.log('\n--- 4. Testing Trainers List -> Trainer Profile ---')
  await cdp.send('Page.navigate', { url: `${APP_URL}/trainers` })
  await sleep(1200)

  const trainersListMetrics = await evaluate(`(() => {
    const cards = Array.from(document.querySelectorAll('.trainer-card'));
    return cards.map((card) => {
      const link = card.querySelector('.trainer-entity__identity-link');
      const avatar = card.querySelector('.trainer-avatar');
      const name = card.querySelector('.trainer-entity__name');
      const scheduleBtn = card.querySelector('.trainer-entity__schedule-btn');
      return {
        name: name?.textContent?.trim(),
        avatarVTN: avatar?.style?.viewTransitionName,
        nameVTN: name?.style?.viewTransitionName,
        scheduleBtnHref: scheduleBtn?.getAttribute('href'),
      };
    });
  })()`)
  console.log('[Trainers List] Shared transition attributes:', trainersListMetrics)
  await captureScreenshot('m11_motion_trainers_list_390x844')

  // Click Dima's card
  await evaluate(`document.querySelector('.trainer-entity__identity-link')?.click()`)
  await sleep(1000)

  const trainerProfileMetrics = await evaluate(`(() => {
    const hero = document.querySelector('.trainer-hero');
    const avatar = hero?.querySelector('.trainer-hero__avatar');
    const name = hero?.querySelector('.trainer-hero__name');
    const cta = document.querySelector('.trainer-profile-cta');
    const ctaRect = cta?.getBoundingClientRect();
    const backLink = document.querySelector('.back-link');
    const backRect = backLink?.getBoundingClientRect();
    return {
      pathname: window.location.pathname,
      name: name?.textContent?.trim(),
      avatarVTN: avatar?.style?.viewTransitionName,
      nameVTN: name?.style?.viewTransitionName,
      ctaSize: ctaRect ? { w: Math.round(ctaRect.width), h: Math.round(ctaRect.height) } : null,
      backSize: backRect ? { w: Math.round(backRect.width), h: Math.round(backRect.height) } : null,
    };
  })()`)
  console.log('[Trainer Profile] Shared transition attributes:', trainerProfileMetrics)
  await captureScreenshot('m11_motion_trainer_profile_390x844')

  // 5. Test Bottom Nav Smooth Sliding Indicator across tabs
  console.log('\n--- 5. Testing Bottom Navigation Sliding Indicator ---')
  const bottomNavTransforms = []
  const tabs = [
    { name: 'Home', url: '/' },
    { name: 'Schedule', url: '/schedule' },
    { name: 'Trainers', url: '/trainers' },
    { name: 'Progress', url: '/progress' },
    { name: 'Profile', url: '/profile' },
  ]

  for (const tab of tabs) {
    await cdp.send('Page.navigate', { url: `${APP_URL}${tab.url}` })
    await sleep(600)
    const metrics = await evaluate(`(() => {
      const indicator = document.querySelector('.mobile-nav__indicator');
      const activeItem = document.querySelector('.mobile-nav__item.is-active');
      return {
        tab: '${tab.name}',
        transform: indicator?.style?.transform,
        activeLabel: activeItem?.querySelector('.mobile-nav__label')?.textContent?.trim(),
      };
    })()`)
    bottomNavTransforms.push(metrics)
  }
  console.log('[Bottom Nav Indicator Positions]:', bottomNavTransforms)

  // 6. Test Responsive Layout Across All 4 Viewports
  console.log('\n--- 6. Capturing Responsive Viewports Evidence ---')
  for (const vp of VIEWPORTS) {
    await setViewport(vp)
    await cdp.send('Page.navigate', { url: `${APP_URL}/` })
    await sleep(1000)

    const vpMetrics = await evaluate(`(() => {
      const body = document.body;
      const html = document.documentElement;
      return {
        hasHorizontalScroll: html.scrollWidth > window.innerWidth || body.scrollWidth > window.innerWidth,
        heroTimeText: document.querySelector('.hero-workout__time')?.textContent?.trim(),
      };
    })()`)
    console.log(`[Viewport ${vp.name}] Layout check:`, vpMetrics)
    await captureScreenshot(`m11_motion_home_${vp.name}`)
  }

  cdp.close()
  chrome.kill()
  console.log('\n=== M11 QA Completed Successfully ===')
}

runM11QA().catch((err) => {
  console.error('M11 QA Error:', err)
  process.exit(1)
})
