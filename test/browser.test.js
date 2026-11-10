const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { LinkedIn } = require('../src/linkedin');

test('browser adapter reads direction and IDs, sends only to existing incoming thread', async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('https://www.linkedin.com/**', route => route.fulfill({ contentType: 'text/html', body: `
    <main><div class="msg-s-message-list__event" data-event-urn="event-1"><div class="msg-s-event-listitem--other"></div>
    <p class="msg-s-event-listitem__body">Hello</p></div>
    <div contenteditable="true" role="textbox"></div><button onclick="
    const d=document.createElement('div');d.className='msg-s-message-list__event';const mark=document.createElement('span');mark.className='msg-s-event-with-indicator__sending-indicator--sent';d.append(mark);
    d.setAttribute('data-event-urn','event-2');const p=document.createElement('p');p.className='msg-s-event-listitem__body';
    p.textContent=document.querySelector('[contenteditable]').textContent;d.append(p);document.querySelector('main').append(d);
    document.querySelector('[contenteditable]').textContent='';">Send</button></main>` }));
  const adapter = new LinkedIn(page);
  await adapter.goto('/messaging/thread/fixture/');
  assert.deepEqual((await adapter.events()).map(e => [e.id, e.direction]), [['event-1', 'other']]);
  await adapter.send('Thanks!', 'event-1');
  assert.equal((await adapter.events()).at(-1).direction, 'self');
  await assert.rejects(adapter.send('Duplicate', 'event-1'), /CONVERSATION_CHANGED/);
});

test('browser adapter scopes acceptance to cards and verifies removal', async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('https://www.linkedin.com/**', route => route.fulfill({ contentType: 'text/html', body: `
    <main><button>Accept unrelated</button>
    <div role="listitem"><button onclick="this.parentElement.remove()">Accept</button><button>Ignore</button></div>
    <div role="listitem"><button onclick="this.parentElement.remove()">Accept</button><button>Ignore</button></div></main>` }));
  const adapter = new LinkedIn(page); let accepted = 0;
  await adapter.invitations(() => accepted++);
  assert.equal(accepted, 2);
  assert.equal(await page.getByRole('button', { name: 'Accept unrelated' }).count(), 1);
});

test('clickable conversation entries resolve thread routes without initiating conversations', async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('https://www.linkedin.com/**', route => route.fulfill({ contentType: 'text/html', body: `<main>
  <div class="msg-conversation-listitem__link" onclick="history.pushState({},'', '/messaging/thread/one/');document.querySelectorAll('.msg-conversation-listitem__link').forEach(n=>n.classList.remove('msg-conversations-container__convo-item-link--active'));this.classList.add('msg-conversations-container__convo-item-link--active')">Existing one</div>
  <div class="msg-conversation-listitem__link" onclick="history.pushState({},'', '/messaging/thread/two/');document.querySelectorAll('.msg-conversation-listitem__link').forEach(n=>n.classList.remove('msg-conversations-container__convo-item-link--active'));this.classList.add('msg-conversations-container__convo-item-link--active')">Existing two</div>
  </main>` }));
  assert.deepEqual(await new LinkedIn(page).conversations(), ['/messaging/thread/one/', '/messaging/thread/two/']);
});

test('visible challenges block actions while hidden background frames do not', async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('https://www.linkedin.com/**', route => route.fulfill({ contentType: 'text/html', body: '<main>Inbox</main><div id="captcha-internal" style="display:none"></div>' }));
  const adapter = new LinkedIn(page);
  await adapter.goto('/messaging/');
  await page.locator('#captcha-internal').evaluate(n => { n.style.display = 'block'; n.style.height = '100px'; });
  await assert.rejects(adapter.guard(), /CHALLENGE/);
});
