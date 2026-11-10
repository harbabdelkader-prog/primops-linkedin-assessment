// Structural selectors inspected on the authenticated English UI; actions need live validation.
// Override any selector via an ignored .local/selectors.json file.
const defaults = {
  invitationCard: 'main [role="listitem"]',
  conversationLink: 'a[href*="/messaging/thread/"]',
  event: '.msg-s-message-list__event',
  body: '.msg-s-event-listitem__body',
  self: '.msg-s-event-with-indicator__sending-indicator--sent',
  other: '.msg-s-event-listitem--other',
  eventId: 'data-event-urn',
  composer: '[contenteditable="true"][role="textbox"]',
  conversationEntry: 'main .msg-conversation-listitem__link',
};
class LinkedIn {
  constructor(page, selectors = {}) { this.page = page; this.s = { ...defaults, ...selectors }; }
  async guard() {
    if (!/^https:\/\/www\.linkedin\.com\//.test(this.page.url())) throw new Error('UNEXPECTED_ORIGIN');
    if (/checkpoint|challenge|login|authwall/.test(this.page.url())) throw new Error('AUTH_REQUIRED');
    const challenges = this.page.locator('iframe[src*="captcha"], #captcha-internal');
    for (let i = 0; i < await challenges.count(); i++) if (await challenges.nth(i).isVisible()) throw new Error('CHALLENGE');
    if (await this.page.getByText(/weekly invitation limit|temporarily restricted|unusual activity|too many requests/i).count()) throw new Error('RESTRICTION');
  }
  async goto(path) {
    await this.page.goto('https://www.linkedin.com' + path, { waitUntil: 'domcontentloaded' });
    await this.guard();
    await this.page.locator('main').waitFor({ state: 'visible' });
  }
  async invitations(log) {
    await this.goto('/mynetwork/invitation-manager/');
    for (let n = 0; n < 20; n++) {
      if (!await this.acceptFirst(log)) break;
    }
  }
  async acceptFirst(log) {
      if (!new URL(this.page.url()).pathname.startsWith('/mynetwork/invitation-manager')) throw new Error('NOT_INVITATIONS');
      const cards = this.page.locator(this.s.invitationCard);
      const card = cards.filter({ has: this.page.getByRole('button', { name: /^Accept(?: .*)?$/i }) }).first();
      if (!await card.count()) return false;
      const button = card.getByRole('button', { name: /^Accept(?: .*)?$/i });
      if (await button.count() !== 1) throw new Error('AMBIGUOUS_ACCEPT');
      if (await card.getByRole('button', { name: /^Ignore(?: .*)?$/i }).count() !== 1) throw new Error('NOT_CONFIRMED_INCOMING');
      const start = Date.now();
      await this.guard();
      const originalButton = await button.elementHandle();
      await button.click();
      await originalButton.waitForElementState('hidden', { timeout: 10000 });
      await originalButton.dispose();
      log('invitation_accepted', { observedLatencyMs: Date.now() - start, sourceLatencyMs: null });
      return true;
  }
  async conversations() {
    await this.goto('/messaging/');
    // Only existing conversation links; never compose new messages.
    const hrefs = await this.page.locator(this.s.conversationLink).evaluateAll(nodes => nodes.map(n => n.getAttribute('href')));
    const paths = [...new Set(hrefs)].map(h => new URL(h, 'https://www.linkedin.com'))
      .filter(u => u.origin === 'https://www.linkedin.com' && /^\/messaging\/thread\/[^/]+\/?$/.test(u.pathname))
      .map(u => u.pathname);
    if (paths.length) return paths;
    const entries = this.page.locator(this.s.conversationEntry);
    const count = await entries.count();
    // Current UI has clickable DIVs. Capture existing thread URLs without exposing identities.
    for (let i = 0; i < count; i++) {
      await this.guard();
      const entry = entries.nth(i);
      const active = await entry.evaluate(n => n.classList.contains('msg-conversations-container__convo-item-link--active'));
      const before = this.page.url();
      await entry.click();
      if (!active) await this.page.waitForURL(url => url.href !== before && /\/messaging\/thread\/[^/]+\/?$/.test(url.pathname));
      await this.page.waitForURL(/\/messaging\/thread\/[^/]+\/?(?:\?.*)?$/);
      const current = new URL(this.page.url());
      if (current.origin === 'https://www.linkedin.com' && /^\/messaging\/thread\/[^/]+\/?$/.test(current.pathname)) paths.push(current.pathname);
    }
    return [...new Set(paths)];
  }
  async events() {
    return this.page.locator(this.s.event).evaluateAll((nodes, s) => nodes.map(node => {
      const id = node.getAttribute(s.eventId) || node.querySelector('[' + s.eventId + ']')?.getAttribute(s.eventId);
      const self = node.matches(s.self) || !!node.querySelector(s.self);
      const other = node.matches(s.other) || !!node.querySelector(s.other);
      const time = node.querySelector('time[datetime]')?.getAttribute('datetime');
      return { id, direction: self && !other ? 'self' : other && !self ? 'other' : 'unknown',
        text: node.querySelector(s.body)?.textContent?.trim() || '', timestamp: time ? Date.parse(time) || null : null };
    }).filter(event => event.id || event.text || event.direction !== 'unknown'), this.s);
  }
  async send(text, expectedId) {
    await this.guard();
    const events = await this.events();
    if (events.at(-1)?.id !== expectedId || events.at(-1)?.direction !== 'other') throw new Error('CONVERSATION_CHANGED');
    const editor = this.page.locator(this.s.composer);
    if (await editor.count() !== 1) throw new Error('AMBIGUOUS_COMPOSER');
    if ((await editor.innerText()).trim()) throw new Error('EXISTING_DRAFT');
    await editor.fill(text);
    const fresh = await this.events();
    if (fresh.at(-1)?.id !== expectedId || fresh.at(-1)?.direction !== 'other') {
      await editor.fill('');
      throw new Error('CONVERSATION_CHANGED');
    }
    const button = this.page.getByRole('button', { name: /^Send$/i });
    if (await button.count() !== 1) throw new Error('AMBIGUOUS_SEND');
    await button.click();
    await this.page.waitForFunction(({ event, self, body, eventId, text, previousIds }) => [...document.querySelectorAll(event)].some(n => {
      const id = n.getAttribute(eventId) || n.querySelector('[' + eventId + ']')?.getAttribute(eventId);
      return id && !previousIds.includes(id) && (n.matches(self) || n.querySelector(self)) && n.querySelector(body)?.textContent?.trim() === text;
    }), { ...this.s, text, previousIds: events.map(e => e.id) }, { timeout: 10000 });
  }
}
module.exports = { LinkedIn };
