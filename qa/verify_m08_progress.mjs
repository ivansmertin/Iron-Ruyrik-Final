import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const QA_DIR = 'qa'
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function runM08QA() {
  console.log('=== Starting M08 Browser QA with CDP ===')
  const profileDir = join(tmpdir(), 'chrome_m08_' + Date.now())
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9223',
    `--user-data-dir=${profileDir}`,
    '--disable-gpu',
    '--no-first-run',
    '--window-size=1280,1024',
  ])

  await sleep(2000)

  let tabs
  for (let i = 0; i < 5; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9223/json/list')
      tabs = await res.json()
      if (tabs && tabs.length > 0) break
    } catch {
      await sleep(1000)
    }
  }

  const pageTab = tabs.find((t) => t.type === 'page') || tabs[0]
  const cdp = new CDPClient(pageTab.webSocketDebuggerUrl)
  await cdp.ready()
  console.log('CDP connection established on port 9223')

  await cdp.send('Page.enable')
  await cdp.send('DOM.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Fetch.enable', {
    patterns: [{ urlPattern: '*/api/v1/*' }],
  })

  let fixtureMode = 'baseline'

  const baselineHealth = {
    visitsThisMonth: 0,
    consistentWeeks: 0,
    latestWeight: {
      metricType: 'weight',
      currentValue: 78.2,
      unit: 'kg',
      measuredAt: '2026-09-08T08:30:00+03:00',
      provenanceLabel: 'Apple Health (iPhone 15)',
      sourceProvider: 'apple_health',
      baselineValue: 79.4,
      baselineDate: '2026-06-01T10:00:00+03:00',
      delta: {
        diff: -1.2,
        formatted: '−1,2 кг',
        direction: 'down',
        label: '−1,2 кг с 1 июня',
      },
    },
    latestBodyFat: {
      metricType: 'body_fat_percentage',
      currentValue: 14.8,
      unit: 'percent',
      measuredAt: '2026-09-08T08:30:00+03:00',
      provenanceLabel: 'Xiaomi Scale S400',
      sourceProvider: 'xiaomi',
      delta: {
        diff: -0.5,
        formatted: '−0,5 %',
        direction: 'down',
        label: '−0,5 % с 1 июня',
      },
    },
    latestMuscleMass: {
      metricType: 'muscle_mass',
      currentValue: 36.5,
      unit: 'kg',
      measuredAt: '2026-09-08T08:30:00+03:00',
      provenanceLabel: 'Xiaomi Scale S400',
      sourceProvider: 'xiaomi',
      delta: {
        diff: 0.8,
        formatted: '+0,8 кг',
        direction: 'up',
        label: '+0,8 кг с 1 июня',
      },
    },
    weightSeries: [
      {
        id: 'w1',
        date: '2026-08-15',
        measuredAt: '2026-08-15T09:00:00+03:00',
        value: 79.2,
        provenanceLabel: 'Apple Health (iPhone 15)',
        sourceProvider: 'apple_health',
      },
      {
        id: 'w2',
        date: '2026-08-20',
        measuredAt: '2026-08-20T08:45:00+03:00',
        value: 78.9,
        provenanceLabel: 'Внесено вручную',
        sourceProvider: 'manual',
      },
      {
        id: 'w3',
        date: '2026-08-28',
        measuredAt: '2026-08-28T09:15:00+03:00',
        value: 78.6,
        provenanceLabel: 'Apple Health (iPhone 15)',
        sourceProvider: 'apple_health',
      },
      {
        id: 'w4',
        date: '2026-09-01',
        measuredAt: '2026-09-01T08:00:00+03:00',
        value: 78.5,
        provenanceLabel: 'Apple Health (iPhone 15)',
        sourceProvider: 'apple_health',
      },
      {
        id: 'w5',
        date: '2026-09-05',
        measuredAt: '2026-09-05T08:30:00+03:00',
        value: 78.4,
        provenanceLabel: 'Apple Health (iPhone 15)',
        sourceProvider: 'apple_health',
      },
      {
        id: 'w6',
        date: '2026-09-08',
        measuredAt: '2026-09-08T08:30:00+03:00',
        value: 78.2,
        provenanceLabel: 'Apple Health (iPhone 15)',
        sourceProvider: 'apple_health',
      },
    ],
  }

  const singlePointHealth = {
    ...baselineHealth,
    latestWeight: {
      ...baselineHealth.latestWeight,
      delta: null,
    },
    weightSeries: [baselineHealth.weightSeries[5]],
  }

  const emptyWeightHealth = {
    visitsThisMonth: 0,
    consistentWeeks: 0,
    latestWeight: null,
    latestBodyFat: baselineHealth.latestBodyFat,
    latestMuscleMass: {
      metricType: 'lean_body_mass',
      currentValue: 38.0,
      unit: 'kg',
      measuredAt: '2026-09-08T08:30:00+03:00',
      provenanceLabel: 'Xiaomi Scale S400',
      sourceProvider: 'xiaomi',
      delta: null,
    },
    weightSeries: [],
  }

  cdp.on('Fetch.requestPaused', async (params) => {
    const { requestId, request } = params
    const url = request.url

    if (url.includes('/api/v1/health/progress')) {
      if (fixtureMode === 'error') {
        return cdp.send('Fetch.fulfillRequest', {
          requestId,
          responseCode: 500,
          responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
          body: Buffer.from(
            JSON.stringify({ error: { code: 'SERVER_ERROR', message: 'Ошибка сервера' } })
          ).toString('base64'),
        })
      }

      let payload = baselineHealth
      if (fixtureMode === 'single_point') payload = singlePointHealth
      if (fixtureMode === 'empty_weight') payload = emptyWeightHealth

      return cdp.send('Fetch.fulfillRequest', {
        requestId,
        responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
        body: Buffer.from(JSON.stringify(payload)).toString('base64'),
      })
    }

    if (url.includes('/api/v1/health/sources')) {
      return cdp.send('Fetch.fulfillRequest', {
        requestId,
        responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
        body: Buffer.from(
          JSON.stringify([
            {
              id: '1',
              provider: 'apple_health',
              status: 'connected',
              displayName: 'Apple Health',
              category: 'service',
              requiresNativeBridge: true,
            },
          ])
        ).toString('base64'),
      })
    }

    return cdp.send('Fetch.continueRequest', { requestId })
  })

  const results = []

  // 1. Test Baseline Across 4 Viewports
  for (const vp of VIEWPORTS) {
    console.log(`\nTesting viewport: ${vp.name} (${vp.width}x${vp.height})`)
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: 2,
      mobile: true,
    })

    fixtureMode = 'baseline'
    await cdp.send('Page.navigate', { url: `${APP_URL}/progress` })
    await sleep(800)

    const evalResult = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const root = document.querySelector('.progress-page');
        const heroVal = document.querySelector('.progress-weight-hero .hero-metric__value')?.textContent?.trim();
        const heroUnit = document.querySelector('.progress-weight-hero .hero-metric__unit')?.textContent?.trim();
        const deltaText = document.querySelector('.progress-weight-header .metric-change')?.textContent?.trim();
        const provenance = document.querySelector('.metric-provenance')?.textContent?.trim();
        const readoutVal = document.querySelector('.chart-readout__val')?.textContent?.trim();
        const readoutDate = document.querySelector('.chart-readout__date')?.textContent?.trim();
        const sourcesBtn = document.querySelector('.progress-action-btn--sources');
        const addBtn = document.querySelector('.progress-action-btn--add');
        const prevBtn = document.querySelector('.chart-readout__nav-btn[aria-label="Предыдущий замер"]');
        const nextBtn = document.querySelector('.chart-readout__nav-btn[aria-label="Следующий замер"]');
        const disclosureBtn = document.querySelector('.chart-data-disclosure__btn');
        const periodBtns = Array.from(document.querySelectorAll('.chart-period-btn'));
        const svg = document.querySelector('.line-chart__svg');
        const svgAriaHidden = svg?.getAttribute('aria-hidden');
        const interactiveInSvg = svg?.querySelectorAll('[tabindex], [role="button"], button')?.length || 0;

        const hasHorizontalScroll = document.documentElement.scrollWidth > window.innerWidth;

        const getRect = el => el ? { width: Math.round(el.getBoundingClientRect().width), height: Math.round(el.getBoundingClientRect().height) } : null;

        return {
          heroVal,
          heroUnit,
          deltaText,
          provenance,
          readoutVal,
          readoutDate,
          svgAriaHidden,
          interactiveInSvg,
          hasHorizontalScroll,
          sourcesBtnSize: getRect(sourcesBtn),
          addBtnSize: getRect(addBtn),
          prevBtnSize: getRect(prevBtn),
          nextBtnSize: getRect(nextBtn),
          disclosureBtnSize: getRect(disclosureBtn),
          periodBtnsSizes: periodBtns.map(getRect),
        };
      })()`,
      returnByValue: true,
    })

    const data = evalResult.result.value
    console.log(`Viewport ${vp.name} result:`, data)
    results.push({ viewport: vp.name, data })

    // Take screenshot
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(join(QA_DIR, `m08_progress_${vp.name}.png`), Buffer.from(shot.data, 'base64'))
  }

  // 2. Test Interactive Disclosure (Expand Measurement List) on 390x844
  console.log('\nTesting Expandable Measurement List...')
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  })

  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const btn = document.querySelector('.chart-data-disclosure__btn');
      if (btn) btn.click();
    })()`,
  })
  await sleep(300)

  const expandedEval = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const list = document.querySelector('#chart-data-list');
      const items = Array.from(document.querySelectorAll('.chart-data-list__item'));
      return {
        listVisible: !!list,
        itemCount: items.length,
      };
    })()`,
    returnByValue: true,
  })
  console.log('Expanded list evaluation:', expandedEval.result.value)

  const shotExpanded = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(QA_DIR, 'm08_progress_expanded_390x844.png'), Buffer.from(shotExpanded.data, 'base64'))

  // 3. Test Readout Navigation (Prev Button Click)
  console.log('\nTesting Prev Button in Readout...')
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const prevBtn = document.querySelector('.chart-readout__nav-btn[aria-label="Предыдущий замер"]');
      if (prevBtn) prevBtn.click();
    })()`,
  })
  await sleep(200)

  const prevEval = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      return {
        val: document.querySelector('.chart-readout__val')?.textContent?.trim(),
        date: document.querySelector('.chart-readout__date')?.textContent?.trim(),
      };
    })()`,
    returnByValue: true,
  })
  console.log('Prev button navigation evaluation:', prevEval.result.value)

  // 4. Test Single Point State
  console.log('\nTesting Single Point State on 390x844...')
  fixtureMode = 'single_point'
  await cdp.send('Page.navigate', { url: `${APP_URL}/progress` })
  await sleep(600)

  const singleEval = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const delta = document.querySelector('.metric-change');
      const dots = document.querySelectorAll('.line-chart__dot');
      return {
        deltaExists: !!delta,
        dotCount: dots.length,
        dotCx: dots[0]?.getAttribute('cx'),
      };
    })()`,
    returnByValue: true,
  })
  console.log('Single point evaluation:', singleEval.result.value)
  const shotSingle = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(QA_DIR, 'm08_progress_single_point_390x844.png'), Buffer.from(shotSingle.data, 'base64'))

  // 5. Test Empty Weight (Body-Fat / Lean Body Mass Only)
  console.log('\nTesting Empty Weight with Secondary Metrics...')
  fixtureMode = 'empty_weight'
  await cdp.send('Page.navigate', { url: `${APP_URL}/progress` })
  await sleep(600)

  const emptyEval = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const emptyTitle = document.querySelector('.schedule-state-card__title')?.textContent?.trim();
      const rows = Array.from(document.querySelectorAll('.cardless-metric-row')).map(r => ({
        name: r.querySelector('.cardless-metric-row__name')?.textContent?.trim(),
        val: r.querySelector('.cardless-metric-row__val')?.textContent?.trim(),
      }));
      return {
        emptyTitle,
        rows,
      };
    })()`,
    returnByValue: true,
  })
  console.log('Empty weight evaluation:', emptyEval.result.value)
  const shotEmpty = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(QA_DIR, 'm08_progress_empty_weight_390x844.png'), Buffer.from(shotEmpty.data, 'base64'))

  // 6. Test Error State
  console.log('\nTesting Canonical Error 500 State...')
  fixtureMode = 'error'
  await cdp.send('Page.reload', { ignoreCache: true })
  let errorEval = null
  for (let attempt = 0; attempt < 25; attempt++) {
    await sleep(200)
    const res = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const alert = document.querySelector('[role="alert"]');
        const title = alert?.querySelector('.schedule-state-card__title')?.textContent?.trim();
        const retryBtn = alert?.querySelector('button')?.textContent?.trim();
        return {
          hasAlert: !!alert,
          title,
          retryBtn,
        };
      })()`,
      returnByValue: true,
    })
    if (res.result?.value?.hasAlert) {
      errorEval = res
      break
    }
  }
  console.log('Error state evaluation:', errorEval?.result?.value)
  const shotError = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(QA_DIR, 'm08_progress_error_500_390x844.png'), Buffer.from(shotError.data, 'base64'))

  cdp.close()
  chrome.kill()
  console.log('\n=== M08 CDP Verification Complete! ===')
  writeFileSync(join(QA_DIR, 'm08_verification_results.json'), JSON.stringify(results, null, 2))
}

runM08QA().catch((err) => {
  console.error('QA failed with error:', err)
  process.exit(1)
})
