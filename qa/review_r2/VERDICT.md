# R2 — BLOCK, M04–M07

Review date: 2026-09-11. Application source and existing tests were not edited. Review harness, screenshots, video and logs are isolated in this directory.

## Scope and revision identity

Git HEAD is 58875cb896d8d845283eaf61cdc99df3920b1b62. M00–M07 and R1 remediation are uncommitted. No separate accepted-R1 commit or immutable snapshot was found in the three-commit history. The logical base is the accepted R1 remediation documented in MIGRATION_LOG.md; the reviewed target is the M07 working tree, not the pristine Git HEAD. Relevant source hashes are in source-manifest.json. relevant.diff and styles.diff are cumulative against Git HEAD and include older hunks; older R1 components were inspected only as relevant shared consumers. No invented R1 hash is used.

Inputs: migration log including R1 findings/remediation, cumulative stat, current M04–M07 code/tests, booking context/cache/API mappers, relevant backend booking policy, shared Modal and Home BookingCard consumers. Antigravity summary and screenshots/scripts were located at C:/Users/iwans/.gemini/antigravity/brain/450fa6ff-5b20-4591-902a-05926475b8f0. Its M05 script uses a real 120 ms sleep, which does not establish a fixed-clock 350 ms gate. Its M05 unit unmount tests assert cache only; its radio keyboard test actually clicks. Our browser reproductions supplement those assertions.

## Findings to resolve within this R2

### R2-01 — P1: last-place success loses confirmed presentation

File: src/pages/BookingPage.tsx:490,552 (onSuccess:147).
With 7/8 occupied, submit successfully; immediate schedule invalidation returns 8/8. At virtual 0,100,349 ms the form says “Все места заняты… выберите другой интервал”, with no confirmed button. At 350 ms it changes to successful details. Expected: uninterrupted visible confirmed for 350 ms, regardless of the post-success availability update, while the cache commits immediately. Fix: give confirmed presentation precedence over live availability and retain the submitted slot snapshot. Do not delay cache mutation or replace confirmed with toast.
Evidence: browser-results-timing-proof.json; timing-last.webm; timing-last-{0,100,349,350}.png; video-last-frame.png extracted and visually inspected. Normal control retains confirmed at 349 and details at 350 (timing-normal.webm).

### R2-02 — P1: browser Back lacks source context

Files: src/pages/SchedulePage.tsx:57,100,239; src/components/DateStrip.tsx:30.
Select late date/trainer, scroll to 19:00, enter Booking at width 360 after Schedule 320, use history Back. Date/trainer survive, but scroll changes from 439 to approximately 2 and no source link receives focus. The source history entry never receives fromSlotId; state belongs to the destination, while DateStrip scrollIntoView runs again. Same-width repeat also has no source-link focus (browser restores some position itself). Explicit in-app return can focus slot-s11; missing slot falls back to the day heading. Expected: both history/native Back and explicit return restore the source context. Fix: persist source slot/scroll on the Schedule history entry and coordinate DateStrip restoration; verify both back paths, unchanged and resized viewport.
Evidence: browser-results.json (schedule320/browser-back), browser-results-back-proof.json; back-before/back-after/back-explicit screenshots; browser-results-boundary.json (missing-slot-fallback).

### R2-03 — P1: trainer selection does not match submitted mode

Files: src/components/TrainerCard.tsx:105; src/pages/BookingPage.tsx:132,177,503.
API fixture adds slug sergey. Catalog “Выбрать время” → Schedule with sergey → Booking silently selects self and POST sends trainerSlug:null. Profile's unsupported-trainer guard does not cover the catalog/direct URL. Additionally /booking/s3?trainer=dima with an empty trainer roster shows only an unchecked self radio but submits trainerSlug:dima. Expected: never silently change trainer intent or submit a mode absent from visible options. Fix: consistent support/roster validation at entry points and submit; require an explicit valid mode choice after unavailable/unknown trainer. Preserve slot/mode snapshot and pending lock.
Evidence: browser-results-trainers main.json (unsupported-post), browser-results-boundary.json (no-trainer-post), unsupported-booking.png, no-trainer-selected-id.png. Backend trainer_slug is string, resolves active trainers; this is a frontend restriction, not a backend two-slug contract. No backend refactor is required for the minimal guard.

### R2-04 — P1: offline paused queries misrepresented as missing entities

Files: src/pages/BookingPage.tsx:208,240; src/pages/TrainerPage.tsx:25,82; src/pages/TrainersPage.tsx:18.
Start with empty query cache on /404, turn browser offline, navigate within SPA to existing booking slot/profile/catalog. Booking says “Запись не найдена”; Profile says “Тренер не найден”; catalog gives no loading/offline explanation. React Query pending/paused is not isLoading. Expected: explicit offline/waiting state, no missing-entity conclusion before a successful query. Fix: distinguish isPending/fetchStatus paused, errors, successful empty and missing results; verify recovery on reconnect.
Evidence: browser-results-offline.json, offline_*.png. Online HTTP 500 states correctly show retry UI, independently verified in browser-results-error.json.

### R2-05 — P1: Schedule accessibility gate fails

File: src/styles/index.css:1442,1705.
At 320, “Сбросить” is 77.94×28, below required 44×44. Full/blocked/past reasons use #929292 with ancestor opacity .65 on #111, giving effective RGB≈101 and contrast ≈3.23:1, below the requested 4.5:1. The opacity is a changed M04 rule; reset height is an existing unmet gate on the changed screen, not presented as a newly introduced regression. Fix: increase the actual reset target and remove ancestor dimming from readable reason text/use qualifying rendered colors. Check effective composite contrast and nonoverlap, not CSS token names.
Evidence: browser-results-boundary.json (contrast-targets), boundary-schedule320.png and long-filter320.png. Earlier commentary's rough 3.15 estimate is superseded by the calculated 3.23 value.

### R2-06 — P1: “nearest time” is already unbookable

Files: src/pages/TrainerPage.tsx:111; src/pages/SchedulePage.tsx:27.
Fixed clock 2026-09-12 08:30 MSK: Profile selects 08:00–09:00 as nearest and Schedule exposes it as an available booking link, but Booking rejects it as already started. Both filters test endIso, while booking eligibility tests startIso. Expected: advertised bookable time agrees with Booking's start boundary. Fix: use the booking eligibility start boundary for these entry points without changing backend rules. Verify just before, at, and after slot start.
Evidence: browser-results-started-slot.json and started-{profile,schedule,booking}.png.

### R2-07 — P1 evidence gate: native Back/Modal not proven

Files: src/main.tsx:40; src/components/Modal.tsx:35; MIGRATION_LOG.md verification claims.
No connected devices in adb devices. Browser history Back, keyboard and Modal tests are browser evidence only. No native PASS exists in the initial audit or this review. Expected: required native Back/Modal preservation demonstrated on the reviewed revision. Close with native evidence for route return, modal LIFO, focus/background isolation and pending cancellation. This is an unproven mandatory gate, not a claim of a native regression. No blind code changes requested.

## Confirmed and preserved

- Build PASS, lint PASS; frontend 83/83 in 10 files PASS, each full command run once before reviewer harness creation. Logs: build.log, lint.log, frontend.log.
- Backend 40/40 PASS, run once because trainer/cancelled-match contracts were examined; backend.log includes a Starlette/httpx deprecation warning, no failures.
- StrictMode actual app runs: rapid submit sends one POST and disables radio mode changes; arrow keyboard selection has visible focus.
- Leaving before resolve and at virtual 100 ms commits cache and returns to current details. Normal confirmed holds through virtual 349 ms and changes at 350.
- Cancellation API error remains visible inside the dialog; Escape restores background interaction/focus; successful cancel displays cancelled details. Unit suite covers ongoing/completed/cancelled and cancellation policy. Exact sub-minute 4h boundary was not newly claimed proven (legacy Math.round remains).
- Backend overlap queries ignore cancelled bookings, so excluding cancelled slot matches does not itself change server rebooking rules. Capacity, block and trainer-overlap guards unchanged.
- Available Schedule rows remain links inside a list, DateStrip group/pressed semantics remain, missing slot fallback focuses heading.
- Trainers use API names/directions; actual local API supplies “Дима” and “Ваня”, not full names. No surname was fabricated to satisfy full-name fixtures. Editorial entities and independent links are implemented. Long names and 0/1/12 roster fixtures have no horizontal overflow in measured 320 viewport. Screenshots were visually inspected where noted; fullpage fixed header/nav placement artifacts are not reported as page overlap defects.
- Shared Modal portal/inert R1 remediation retained; R1 frontend regressions pass. Full R1 design/health audit was not repeated.

## Open nonblocking debt / scope limits

- Route View Transitions under BrowserRouter remain M11 debt (src/main.tsx); not a new R2 regression. Owner: Antigravity M11; close with actual route startViewTransition evidence.
- R1 navigation-label P2 remains monitored: no label overlap seen in 320 browser captures. Native result is still separate.
- Original 60-minute labels and rounded cancellation-minute calculation are retained legacy code; no broad backend/time-policy redesign attempted.

No observed data loss/corruption. Wrong trainer-mode booking is tracked explicitly in R2-03.

Next R2 reads only remediation diff for R2-01–07 plus relevant regression evidence against this verdict. Keep immediate cache outcome, uninterrupted 350 ms presentation, native Back/Modal, StrictMode and accepted R1 health fixes. No next migration block until PASS or PASS WITH P2. Failed harness timing/initialization attempts are retained in logs; superseding targeted JSON reports identify completed reproductions. Existing evidence claims are not blanket browser/native PASS.
