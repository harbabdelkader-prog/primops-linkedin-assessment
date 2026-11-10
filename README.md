# Primops LinkedIn automation

Local Node.js 24/CommonJS + Playwright bot. Visible Chromium, manual login, persistent local profile, incoming invitations and existing conversations only. No LLM credentials required; replies use deterministic contextual templates.

## Install

```powershell
npm.cmd ci
npx.cmd playwright install chromium
npm.cmd test
npm.cmd run inspect
```

Log in manually in the visible browser, including any verification LinkedIn requires. Never provide credentials to the application. Inspection mode does not accept invitations or send messages. Use Playwright Inspector's locator picker against the live invitation manager and messaging pages. Do not save DOM snapshots, screenshots, traces, or private message contents in the repository.

Inspection mode opens a local Chromium debugging endpoint on loopback port 9222 so the developer can inspect structural selectors. Other local processes could access that browser; close inspection mode when finished. Normal monitoring does not expose this port.

## Live verification required

Selectors in `src/linkedin.js` were inspected against an authenticated English LinkedIn UI on November 10, 2026. One approved incoming invitation was accepted successfully (385 ms detection-to-confirmation; pending count 2 to 1). One explicitly approved reply to a controlled incoming message was confirmed as sent in the UI (887 ms send-to-confirmation; 19.21 seconds including approval wait). Exactly one matching outgoing reply was present. Reprocessing the same incoming event with reloaded durable state produced no second send. This confirms these controlled workflows, not complete inbox coverage or recipient read receipt. Recheck selectors for your account before enabling actions. Override keys in `.local/selectors.json` (ignored) if needed. Unknown direction or missing IDs stops replies. Localized messages are supported independently of UI language.

Close inspection browser, then run only after confirming the selectors:

```powershell
$env:LIVE_SELECTORS_VERIFIED='1'
$env:POLL_INTERVAL_MS='8000'
npm.cmd start
```

Use a controlled existing conversation to verify one inbound message, several successive messages, one outgoing manual message, restart deduplication, one incoming invitation, and a disconnected network. Confirm actual results in the browser. The environment flag is an operator acknowledgment, not proof of live integration. Ctrl+C or closing the browser stops monitoring. Account challenges/restrictions stop the bot; resolve manually and restart. No stealth or challenge bypass is used.

## State, privacy and recovery

`.local/browser-profile/` contains authentication data: protect it like a password. `.local/state.json` contains hashed conversation identifiers and last message IDs, status and timestamps; no message text. `.local/activity.log` contains event names, hashed IDs, timestamps, latency and error types only. Message text is processed in memory and never sent to an external API. Links and attachments are not opened. The profile may retain browser data locally. Do not share `.local/` or enable browser tracing.

One process per workspace is enforced by `.local/runner.lock`. After a hard crash, confirm no bot process is running before deleting that lock. Never delete state to fix a transient problem: doing so permits replay. A `pending` send means its outcome is uncertain; that conversation stays blocked even if new messages arrive. Inspect the conversation manually before changing its status to `sent` in local state. Atomic state writes reserve a message before sending; true exactly-once delivery cannot be guaranteed with browser UI automation.

## Behavior and limitations

- Poll interval defaults to 8 seconds, minimum 5 seconds; transient failures back off to 120 seconds. Navigation and actions have explicit timeouts.
- Every activation records a read-only baseline on each conversation's first observation, including conversations discovered later. Historical and offline messages are not answered. A later incoming message must appear after a known baseline/processed message ID in the loaded history; missing boundaries cause a fresh baseline without sending. This conservative policy can skip a legitimate new message in a newly discovered conversation.
- Continuous monitoring observes invitations but leaves acceptance disabled: the live UI has no verified creation timestamp or complete pagination coverage to distinguish all historical invitations from new ones. The acceptance adapter remains implemented, fixture-tested, and verified with one explicitly approved live invitation. Do not claim unattended new-only invitation acceptance is complete.
- `src/invitations.js` persists hashed first-observation identifiers, excludes historical observations, reserves new invitations before clicking, and suppresses accepted or uncertain duplicates across restarts. Automatic actions require both verified stable invitation IDs and verified complete coverage. The live adapter deliberately reports both guarantees false: inspected cards expose only candidate `componentkey` values and a `LazyColumn` without total-count/position metadata. A single reload preserved one candidate key, which does not prove invitation-ID stability or complete coverage. Exact-ID acceptance supports explicit `data-invitation-id` attributes in fixtures; that contract has not been found on the live UI. This feature is tested infrastructure, not functioning unattended live acceptance.
- Run `npm.cmd start -- --invitations-only` to observe invitations without navigating to conversations. This is the active safety mode following the invitation-baseline update. It never accepts while the identity/coverage guarantees remain unverified.
- A second controlled live test compared the original persisted historical candidate-key baseline with a newly received, user-confirmed invitation. Two distinct candidate keys survived reload; exactly one was absent from the original baseline. After explicit visual approval, `acceptCandidateKey` targeted that card only: pending count fell from 2 to 1 and the historical key remained. Action-to-confirmation was 1,364 ms; first-observation-to-confirmation including approval was 156,716 ms. This manually approved result does not establish complete coverage or justify enabling unattended acceptance. Candidate-key targeting has a regression test for historical preservation, duplicate attempts and nonunique keys.
- Consecutive incoming events are combined into one response. A last outgoing event prevents a reply. New events arriving during reply preparation abort the send and require review.
- Only loaded conversation links, invitation cards and message events are processed; virtualized lists, pagination, group chats, and LinkedIn UI experiments may need adapter changes. No claim of complete inbox coverage.
- Direction markers may be absent for some LinkedIn events. Fail-closed behavior prevents replies in affected conversations until the adapter is verified/updated. Empty system/timestamp-only events are ignored. Zero invitations/conversations is not evidence that detection works.
- Replies cover scheduling, jobs, pricing, questions, links, attachments/empty messages, emojis and rude content. Arabic, French and Spanish have basic templates; other languages receive an English fallback. No personal facts, commitments or availability are invented. No semantic LLM or universal translation is claimed.
- Latency is measured from local detection; source timestamp latency is recorded only if a machine-readable timestamp exists. Invitation source timestamps are unavailable. Batch size and page coverage affect actual latency.
- The bot sends automatic replies on behalf of the signed-in account. Follow applicable LinkedIn account rules and stop if restricted. Do not use an account with sensitive conversations for assessment testing.

## Validation

`npm.cmd test` runs Node's test runner for batching, self-message exclusion, restart deduplication, ambiguous sends, state corruption and reply edge cases, plus real Chromium tests against synthetic local HTML fixtures for acceptance and delivery. These do not establish live LinkedIn compatibility.

Public-source submission: inspect `git status` and staged diff before committing. `.gitignore` excludes profiles, secrets, logs and local state. Submission repository: https://github.com/harbabdelkader-prog/primops-linkedin-assessment.

## Publishing after review

For a fresh checkout without an `origin` remote, configure the submission repository and publish:

```powershell
git remote add origin https://github.com/harbabdelkader-prog/primops-linkedin-assessment.git
git push -u origin main
```

Git Credential Manager can prompt for GitHub authentication. Never place credentials in the remote URL. Run `git remote -v` first if `origin` may already be configured. Publishing requires an explicit push.
