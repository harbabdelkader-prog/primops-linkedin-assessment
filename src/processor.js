const { hash } = require('./state');
const { reply } = require('./reply');
async function processConversation({ id, events, state, send, log, observedAt = Date.now(), activation }) {
  if (!events.length) return;
  const last = events.at(-1);
  if (!last.id || !['self', 'other'].includes(last.direction)) return;
  const previous = state.get(id);
  let boundary = previous?.last;
  if (activation) {
    const baseline = state.getBaseline(id);
    if (baseline?.activation !== activation) {
      state.setBaseline(id, { activation, last: last.id, at: Date.now() });
      log('conversation_baselined', { conversation: hash(id) });
      return;
    }
    if (baseline.last === last.id) return;
    boundary = events.some(e => e.id === previous?.last) ? previous.last : baseline.last;
    if (!events.some(e => e.id === boundary)) {
      state.setBaseline(id, { activation, last: last.id, at: Date.now() });
      log('baseline_boundary_missing');
      return;
    }
  }
  if (previous?.status === 'pending') { log('send_requires_review', { conversation: hash(id) }); return; }
  if (previous?.last === last.id) return;
  if (last.direction === 'self') { state.set(id, { last: last.id, status: 'observed' }); return; }
  const batch = [];
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].direction !== 'other' || events[i].id === boundary) break;
    batch.unshift(events[i]);
  }
  if (!batch.length) return;
  const response = reply(batch);
  state.set(id, { last: last.id, status: 'pending', at: Date.now() });
  // Persist before clicking: uncertain sends are never automatically retried.
  const sendStartedAt = Date.now();
  await send(response, last.id);
  state.set(id, { last: last.id, status: 'sent', at: Date.now() });
  log('reply_sent', { conversation: hash(id), actionLatencyMs: Date.now() - sendStartedAt, observedLatencyMs: Date.now() - observedAt,
    sourceLatencyMs: last.timestamp ? Math.max(0, Date.now() - last.timestamp) : null });
}
module.exports = { processConversation };
