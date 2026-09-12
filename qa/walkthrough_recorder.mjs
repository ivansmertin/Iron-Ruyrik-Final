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

async function runWalkthrough() {
  console.log('--- Starting Walkthrough & Transition Diagnostics ---')
  const profileDir = join(tmpdir(), 'chrome_walkthrough_' + Date.now())
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9223',
    `--user-data-dir=${profileDir}`,
    '--disable-gpu',
    '--no-first-run',
    '--window-size=390,844'
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

  const cdp = new CDPClient(tabs[0].webSocketDebuggerUrl)
  await cdp.ready()

  await cdp.send('Page.enable')
  await cdp.send('DOM.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true
  })

  // Instrument View Transitions
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      window.__viewTransitionsCalls = [];
      const origSVT = document.startViewTransition;
      if (origSVT) {
        document.startViewTransition = function(cb) {
          window.__viewTransitionsCalls.push({ time: performance.now() });
          return origSVT.call(this, cb);
        };
      }
    `
  })

  async function saveShot(name) {
    const res = await cdp.send('Page.captureScreenshot', { format: 'png' })
    const buf = Buffer.from(res.data, 'base64')
    writeFileSync(join(QA_DIR, `${name}.png`), buf)
    writeFileSync(join(ARTIFACT_DIR, `${name}.png`), buf)
    console.log(`[Walkthrough] Screenshot: ${name}.png`)
  }

  // --- STEP 1: Schedule -> Slot Selection -> Booking Create ---
  console.log('\n[1] Schedule -> Slot Selection')
  await cdp.send('Page.navigate', { url: `${APP_URL}/schedule` })
  await sleep(800)
  await saveShot('flow_1_schedule_view')

  const slotClick = await cdp.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `
      (function() {
        const slot = document.querySelector('a.time-slot.is-available');
        if (slot) {
          slot.click();
          return { ok: true, href: slot.getAttribute('href') };
        }
        return { ok: false };
      })()
    `
  })
  console.log('Slot click:', slotClick.result.value)
  await sleep(800)
  await saveShot('flow_2_booking_create_view')

  // --- STEP 2: Booking Submit -> 350ms Hold -> Details View ---
  console.log('\n[2] Booking Submit -> 350ms Phase -> Details')
  await cdp.send('Runtime.evaluate', {
    expression: `
      const submitBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Подтвердить запись'));
      if (submitBtn) submitBtn.click();
    `
  })
  // Capture holding phase at ~100ms
  await sleep(100)
  await saveShot('flow_3_booking_submitting_or_confirmed_phase')

  // Wait for 350ms transition to complete
  await sleep(500)
  await saveShot('flow_4_booking_details_view')

  // Check details content and click Back
  const backClick = await cdp.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `
      (function() {
        const back = document.querySelector('a.back-link');
        if (back) {
          back.click();
          return { ok: true };
        }
        return { ok: false };
      })()
    `
  })
  console.log('Back link click:', backClick.result.value)
  await sleep(800)
  await saveShot('flow_5_back_to_schedule')

  // --- STEP 3: Trainers -> Profile -> Back ---
  console.log('\n[3] Trainers -> Profile -> Back')
  await cdp.send('Page.navigate', { url: `${APP_URL}/trainers` })
  await sleep(800)
  await saveShot('flow_6_trainers_view')

  await cdp.send('Runtime.evaluate', {
    expression: `
      const trainerCard = document.querySelector('a[href*="/trainers/"]');
      if (trainerCard) trainerCard.click();
    `
  })
  await sleep(800)
  await saveShot('flow_7_trainer_profile_view')

  await cdp.send('Runtime.evaluate', {
    expression: `
      const back = document.querySelector('a.back-link');
      if (back) back.click();
    `
  })
  await sleep(800)
  await saveShot('flow_8_back_to_trainers')

  // --- STEP 4: Progress -> Health Sources Modal -> Toggle -> Reopen defect ---
  console.log('\n[4] Progress -> Sources Modal -> Reopen check')
  await cdp.send('Page.navigate', { url: `${APP_URL}/progress` })
  await sleep(800)

  // Click sources button
  await cdp.send('Runtime.evaluate', {
    expression: `
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Источники данных') || b.innerText.includes('Источники'));
      if (btn) btn.click();
    `
  })
  await sleep(500)
  await saveShot('flow_9_health_sources_modal_open')

  // Close modal via Escape
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await sleep(500)
  await saveShot('flow_10_health_sources_modal_closed')

  // --- STEP 5: View Transitions count check ---
  const vtCalls = await cdp.send('Runtime.evaluate', {
    returnByValue: true,
    expression: 'window.__viewTransitionsCalls ? window.__viewTransitionsCalls.length : 0'
  })
  console.log(`\n[Audit] Total document.startViewTransition calls across entire user flow: ${vtCalls.result.value}`)

  cdp.close()
  chrome.kill()
  console.log('--- Walkthrough Completed Successfully! ---')
}

runWalkthrough().catch(err => {
  console.error('Walkthrough error:', err)
  process.exit(1)
})
