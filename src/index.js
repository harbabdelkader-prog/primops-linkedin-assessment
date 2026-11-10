const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { chromium } = require('playwright');
const { State } = require('./state');
const { LinkedIn } = require('./linkedin');
const { processConversation } = require('./processor');
const { processInvitations } = require('./invitations');

const local = path.resolve(__dirname, '../.local');
function log(event, fields = {}) {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), event, ...fields });
  console.log(line);
  fs.appendFileSync(path.join(local, 'activity.log'), line + '\n');
}
async function main() {
  fs.mkdirSync(local, { recursive: true });
  const interval = Number(process.env.POLL_INTERVAL_MS || 8000);
  if (!Number.isFinite(interval) || interval < 5000) throw new Error('Invalid polling interval');
  const lock = path.join(local, 'runner.lock');
  let lockFd;
  try { lockFd = fs.openSync(lock, 'wx'); } catch { throw new Error('RUNNER_LOCKED'); }
  fs.writeFileSync(lockFd, String(process.pid));
  let context;
  let stopped = false;
  let wake;
  const stop = () => { stopped = true; wake?.(); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  try {
    context = await chromium.launchPersistentContext(path.join(local, 'browser-profile'), { headless: false, acceptDownloads: false,
      args: process.argv.includes('--inspect') ? ['--remote-debugging-port=9222', '--remote-debugging-address=127.0.0.1'] : [] });
    context.on('close', stop);
    const page = context.pages()[0] || await context.newPage();
    page.setDefaultTimeout(10000);
    const selectorFile = path.join(local, 'selectors.json');
    const adapter = new LinkedIn(page, fs.existsSync(selectorFile) ? JSON.parse(fs.readFileSync(selectorFile, 'utf8')) : {});
    if (process.argv.includes('--inspect')) {
      console.log('Read-only inspection mode. Log in manually in the browser. Use Playwright Inspector to verify locators. No accept/send actions run. Close the browser to exit.');
      await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded' });
      await page.pause();
      while (!stopped) await new Promise(resolve => { wake = resolve; setTimeout(resolve, 1000); });
      return;
    }
    if (process.env.LIVE_SELECTORS_VERIFIED !== '1') throw new Error('LIVE_SELECTORS_NOT_VERIFIED');
    const state = new State(path.join(local, 'state.json'));
    const activation = randomUUID();
    const messagesEnabled = !process.argv.includes('--invitations-only');
    log('monitoring_started', { intervalMs: interval, historicalMessages: 'baseline_only', invitationActions: 'blocked_pending_verification', messagesEnabled });
    console.log(messagesEnabled ? 'Monitoring existing conversations. Replies are automated. Ctrl+C to stop.' : 'Invitation observation only. Message monitoring disabled. Close browser to stop.');
    let failures = 0;
    while (!stopped) {
      try {
        await processInvitations({ snapshot: await adapter.invitationSnapshot(), state, log,
          accept: id => adapter.acceptById(id) });
        const ids = messagesEnabled ? await adapter.conversations() : [];
        if (messagesEnabled && !ids.length) log('no_conversations_detected');
        for (const id of ids) {
          if (stopped) break;
          try {
            await adapter.goto(id);
            if (!await page.locator(adapter.s.event).count()) { log('unsupported_or_empty_thread'); continue; }
            const observedAt = Date.now();
            const events = await adapter.events();
            if (events.some(e => !e.id || e.direction === 'unknown')) { log('unverified_message_markup'); continue; }
            await processConversation({ id, events, state, observedAt, activation, send: (text, last) => adapter.send(text, last), log });
          } catch (error) {
            if (/AUTH_REQUIRED|CHALLENGE|RESTRICTION/.test(error.message)) throw error;
            log('conversation_error', { type: error.name });
          }
        }
        failures = 0;
        log('poll_completed', { conversationsDiscovered: ids.length, intervalMs: interval });
      } catch (error) {
        // Error messages/stacks can contain selectors, URLs and message text: never log them.
        const blocked = /AUTH_REQUIRED|CHALLENGE|RESTRICTION/.test(error.message);
        log(blocked ? 'manual_intervention_required' : 'poll_error', { type: error.name });
        if (blocked) { stopped = true; break; }
        failures++;
      }
      if (!stopped) await new Promise(resolve => {
        const timer = setTimeout(resolve, Math.min(interval * 2 ** Math.min(failures, 4), 120000));
        wake = () => { clearTimeout(timer); resolve(); };
      });
    }
  } finally {
    await context?.close().catch(() => {});
    fs.closeSync(lockFd);
    fs.unlinkSync(lock);
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
}
main().catch(error => {
  console.error('Startup stopped:', ['RUNNER_LOCKED', 'LIVE_SELECTORS_NOT_VERIFIED', 'Invalid polling interval'].includes(error.message) ? error.message : error.name);
  process.exitCode = 1;
});
