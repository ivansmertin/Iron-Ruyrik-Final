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

async function runM09QA() {
  console.log('=== Starting M09 Browser QA with CDP ===')
  const profileDir = join(tmpdir(), 'chrome_m09_' + Date.now())
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9224',
    `--user-data-dir=${profileDir}`,
    '--disable-gpu',
    '--no-first-run',
    '--window-size=1280,1024',
  ])

  await sleep(2000)

  let tabs
  for (let i = 0; i < 5; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9224/json/list')
      tabs = await res.json()
      if (tabs && tabs.length > 0) break
    } catch {
      await sleep(1000)
    }
  }

  const pageTab = tabs.find((t) => t.type === 'page') || tabs[0]
  const cdp = new CDPClient(pageTab.webSocketDebuggerUrl)
  await cdp.ready()
  console.log('CDP connection established on port 9224')

  await cdp.send('Page.enable')
  await cdp.send('DOM.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Fetch.enable', {
    patterns: [{ urlPattern: '*api/v1*' }],
  })

  let fixtureMode = 'baseline'

  const baselineProfile = {
    user: {
      id: 'user_1',
      name: 'Алексей Смирнов',
      city: 'Великий Новгород',
      role: 'client',
      isActive: true,
    },
    membership: {
      id: 'm1',
      name: 'Абонемент на 8 занятий',
      type: 'visits_package',
      startsAt: '2026-09-01T00:00:00+03:00',
      expiresAt: '2026-10-15T00:00:00+03:00',
      visitsTotal: 8,
      visitsRemaining: 5,
      status: 'active',
    },
    history: [
      {
        id: 'b1',
        userId: 'user_1',
        clientName: 'Алексей Смирнов',
        trainerSlug: 'dima',
        trainerName: 'Дима',
        slotId: 's1',
        startAt: '2026-09-08T10:00:00+03:00',
        endAt: '2026-09-08T11:00:00+03:00',
        status: 'completed',
        notes: null,
        createdAt: '2026-09-01T10:00:00+03:00',
        cancelledAt: null,
      },
      {
        id: 'b2',
        userId: 'user_1',
        clientName: 'Алексей Смирнов',
        trainerSlug: 'vanya',
        trainerName: 'Ваня',
        slotId: 's2',
        startAt: '2026-09-05T18:00:00+03:00',
        endAt: '2026-09-05T19:00:00+03:00',
        status: 'completed',
        notes: null,
        createdAt: '2026-08-30T10:00:00+03:00',
        cancelledAt: null,
      },
      {
        id: 'b3',
        userId: 'user_1',
        clientName: 'Алексей Смирнов',
        trainerSlug: null,
        trainerName: null,
        slotId: 's3',
        startAt: '2026-09-01T12:00:00+03:00',
        endAt: '2026-09-01T13:00:00+03:00',
        status: 'completed',
        notes: null,
        createdAt: '2026-08-25T10:00:00+03:00',
        cancelledAt: null,
      },
    ],
  }

  const longNameProfile = {
    ...baselineProfile,
    user: {
      ...baselineProfile.user,
      name: 'Константинопольский Константин Константинович',
    },
  }

  const unlimitedProfile = {
    ...baselineProfile,
    membership: {
      id: 'm_unlim',
      name: 'Безлимитный на 1 месяц',
      type: 'unlimited',
      startsAt: '2026-09-01T00:00:00+03:00',
      expiresAt: null,
      visitsTotal: 0,
      visitsRemaining: 0,
      status: 'active',
    },
  }

  const expiredProfile = {
    ...baselineProfile,
    membership: {
      id: 'm_exp',
      name: 'Абонемент на 8 занятий',
      type: 'visits_package',
      startsAt: '2026-08-01T00:00:00+03:00',
      expiresAt: '2026-09-01T00:00:00+03:00',
      visitsTotal: 8,
      visitsRemaining: 0,
      status: 'expired',
    },
  }

  const manyHistoryProfile = {
    ...baselineProfile,
    history: Array.from({ length: 12 }, (_, i) => ({
      id: `bh_${i + 1}`,
      userId: 'user_1',
      clientName: 'Алексей Смирнов',
      trainerSlug: i === 0 ? 'dima' : null,
      trainerName: i === 0 ? 'Константинопольский Константин' : i % 2 === 0 ? 'Ваня' : null,
      slotId: `s_${i + 1}`,
      startAt: `2026-08-${String(28 - i).padStart(2, '0')}T10:00:00+03:00`,
      endAt: `2026-08-${String(28 - i).padStart(2, '0')}T11:00:00+03:00`,
      status: 'completed',
      notes: null,
      createdAt: '2026-08-01T10:00:00+03:00',
      cancelledAt: null,
    })),
  }

  cdp.on('Fetch.requestPaused', async (params) => {
    const { requestId, request } = params
    const url = request.url

    if (url.includes('/api/v1/profile')) {
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

      let payload = baselineProfile
      if (fixtureMode === 'long_name') payload = longNameProfile
      if (fixtureMode === 'unlimited') payload = unlimitedProfile
      if (fixtureMode === 'expired') payload = expiredProfile
      if (fixtureMode === 'many_history') payload = manyHistoryProfile

      return cdp.send('Fetch.fulfillRequest', {
        requestId,
        responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
        body: Buffer.from(JSON.stringify(payload)).toString('base64'),
      })
    }

    return cdp.send('Fetch.continueRequest', { requestId })
  })

  const results = {}

  // 1. Test 4 Standard Viewports
  for (const vp of VIEWPORTS) {
    console.log(`\nTesting viewport: ${vp.name} (${vp.width}x${vp.height})`)
    fixtureMode = 'baseline'

    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: 2,
      mobile: true,
    })

    await cdp.send('Page.navigate', { url: `${APP_URL}/profile` })
    await sleep(600)

    const evalResult = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const hasHorizontalScroll = document.documentElement.scrollWidth > window.innerWidth;
        const nameEl = document.querySelector('.profile-identity__name');
        const name = nameEl?.textContent?.trim();
        const nameFontSize = nameEl ? window.getComputedStyle(nameEl).fontSize : null;
        const city = document.querySelector('.profile-identity__city')?.textContent?.trim();
        const avatar = document.querySelector('.profile-avatar');
        const avatarRect = avatar?.getBoundingClientRect();

        const memTitle = document.querySelector('.membership-card__title')?.textContent?.trim();
        const memBigNum = document.querySelector('.membership-card__big-number')?.textContent?.trim();
        const memExpiry = document.querySelector('.membership-card__expiry')?.textContent?.trim();
        const memIcon = document.querySelector('.membership-card__icon');
        const memIconRect = memIcon?.getBoundingClientRect();

        const historyRows = document.querySelectorAll('.history-row');
        const historyCount = historyRows.length;

        const allHistoryBtn = document.querySelector('.profile-history-section .text-button');
        const allHistoryBtnRect = allHistoryBtn?.getBoundingClientRect();

        const settingsRows = Array.from(document.querySelectorAll('.settings-row')).map(r => {
          const rect = r.getBoundingClientRect();
          return {
            text: r.querySelector('span')?.childNodes[0]?.textContent?.trim(),
            height: Math.round(rect.height),
          };
        });

        return {
          hasHorizontalScroll,
          name,
          nameFontSize,
          city,
          avatarSize: avatarRect ? { width: Math.round(avatarRect.width), height: Math.round(avatarRect.height) } : null,
          memTitle,
          memBigNum,
          memExpiry,
          memIconSize: memIconRect ? { width: Math.round(memIconRect.width), height: Math.round(memIconRect.height) } : null,
          historyCount,
          allHistoryBtnSize: allHistoryBtnRect ? { width: Math.round(allHistoryBtnRect.width), height: Math.round(allHistoryBtnRect.height) } : null,
          settingsRows,
        };
      })()`,
      returnByValue: true,
    })

    const data = evalResult.result.value
    console.log(`Viewport ${vp.name} result:`, data)
    results[vp.name] = data

    const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(join(QA_DIR, `m09_profile_${vp.name}.png`), Buffer.from(screenshot.data, 'base64'))
  }

  // 2. Test Long User Name on 320x740
  console.log('\nTesting Long Name on 320x740...')
  fixtureMode = 'long_name'
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 320,
    height: 740,
    deviceScaleFactor: 2,
    mobile: true,
  })
  await cdp.send('Page.reload', { ignoreCache: true })
  await sleep(600)

  const longEval = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const hasHorizontalScroll = document.documentElement.scrollWidth > window.innerWidth;
      const nameEl = document.querySelector('.profile-identity__name');
      return {
        hasHorizontalScroll,
        name: nameEl?.textContent?.trim(),
        offsetHeight: nameEl?.offsetHeight,
      };
    })()`,
    returnByValue: true,
  })
  console.log('Long name evaluation:', longEval.result.value)
  const shotLong = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(QA_DIR, 'm09_profile_long_name_320x740.png'), Buffer.from(shotLong.data, 'base64'))

  // 3. Test Unlimited Membership on 390x844
  console.log('\nTesting Unlimited Membership...')
  fixtureMode = 'unlimited'
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  })
  await cdp.send('Page.reload', { ignoreCache: true })
  await sleep(600)

  const unlimEval = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const title = document.querySelector('.membership-card__title')?.textContent?.trim();
      const bigNumber = document.querySelector('.membership-card__big-number')?.textContent?.trim();
      const label = document.querySelector('.membership-card__stat-label')?.textContent?.trim();
      const expiry = document.querySelector('.membership-card__expiry');
      return {
        title,
        bigNumber,
        label,
        hasExpiry: !!expiry,
      };
    })()`,
    returnByValue: true,
  })
  console.log('Unlimited evaluation:', unlimEval.result.value)
  const shotUnlim = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(QA_DIR, 'm09_profile_unlimited_390x844.png'), Buffer.from(shotUnlim.data, 'base64'))

  // 4. Test Expired Membership on 390x844
  console.log('\nTesting Expired Membership...')
  fixtureMode = 'expired'
  await cdp.send('Page.reload', { ignoreCache: true })
  await sleep(600)

  const expEval = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const title = document.querySelector('.membership-card__title')?.textContent?.trim();
      const statusText = document.querySelector('.membership-card__status-text')?.textContent?.trim();
      const expiry = document.querySelector('.membership-card__expiry')?.textContent?.trim();
      const note = document.querySelector('.membership-card__empty-text')?.textContent?.trim();
      return {
        title,
        statusText,
        expiry,
        note,
      };
    })()`,
    returnByValue: true,
  })
  console.log('Expired evaluation:', expEval.result.value)
  const shotExp = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(QA_DIR, 'm09_profile_expired_390x844.png'), Buffer.from(shotExp.data, 'base64'))

  // 5. Test Full History Modal (10+ Items & Long Trainer Name) on 390x844
  console.log('\nTesting Full History Modal...')
  fixtureMode = 'many_history'
  await cdp.send('Page.reload', { ignoreCache: true })
  await sleep(600)

  // Click "Вся история"
  await cdp.send('Runtime.evaluate', {
    expression: `document.querySelector('.profile-history-section .text-button')?.click()`,
  })
  await sleep(300)

  const modalEval = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const modal = document.querySelector('.history-modal');
      const title = modal?.querySelector('h2')?.textContent?.trim();
      const rows = modal ? modal.querySelectorAll('.history-row') : [];
      const firstTrainer = rows[0]?.querySelector('.history-row__trainer')?.textContent?.trim();
      const closeBtn = modal?.querySelector('.modal__close');
      const closeRect = closeBtn?.getBoundingClientRect();
      const secondPanel = modal?.querySelector('.history-list--modal');
      return {
        isModalOpen: !!modal,
        title,
        rowCount: rows.length,
        firstTrainer,
        hasSecondPanel: !!secondPanel,
        closeBtnSize: closeRect ? { width: Math.round(closeRect.width), height: Math.round(closeRect.height) } : null,
      };
    })()`,
    returnByValue: true,
  })
  console.log('History modal evaluation:', modalEval.result.value)
  const shotModal = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(QA_DIR, 'm09_profile_history_modal_390x844.png'), Buffer.from(shotModal.data, 'base64'))

  // 6. Test Error 500 State on 390x844
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
  writeFileSync(join(QA_DIR, 'm09_profile_error_500_390x844.png'), Buffer.from(shotError.data, 'base64'))

  cdp.close()
  chrome.kill()
  console.log('\n=== M09 CDP Verification Complete! ===')
  writeFileSync(join(QA_DIR, 'm09_verification_results.json'), JSON.stringify(results, null, 2))
}

runM09QA().catch((err) => {
  console.error('QA failed with error:', err)
  process.exit(1)
})
