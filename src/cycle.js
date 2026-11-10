const { processConversation } = require('./processor');
const { processInvitations } = require('./invitations');
const requiresManualIntervention = error => /AUTH_REQUIRED|CHALLENGE|RESTRICTION/.test(error.message);

// One adapter/page and shared state; each navigation/action is awaited serially.
async function runCycle({ adapter, state, activation, log, messagesEnabled = true, shouldStop = () => false }) {
  let snapshot;
  try { snapshot = await adapter.invitationSnapshot(); }
  catch (error) {
    if (requiresManualIntervention(error)) throw error;
    log('invitation_observation_error', { type: error.name });
  }
  if (snapshot) await processInvitations({ snapshot, state, log, accept: id => adapter.acceptById(id) });
  const ids = messagesEnabled && !shouldStop() ? await adapter.conversations() : [];
  if (messagesEnabled && !ids.length) log('no_conversations_detected');
  let inspected = 0;
  for (const id of ids) {
    if (shouldStop()) break;
    try {
      const events = await adapter.readConversation(id);
      if (!events?.length) { log('unsupported_or_empty_thread'); continue; }
      const observedAt = Date.now();
      if (events.some(e => !e.id || e.direction === 'unknown')) { log('unverified_message_markup'); continue; }
      await processConversation({ id, events, state, observedAt, activation,
        send: (text, last) => adapter.send(text, last), log });
      inspected++;
    } catch (error) {
      if (requiresManualIntervention(error)) throw error;
      log('conversation_error', { type: error.name });
    }
  }
  const result = { invitationObservationSucceeded: !!snapshot, messagesEnabled,
    conversationsDiscovered: ids.length, conversationsInspected: inspected };
  log('monitoring_cycle_completed', result);
  return result;
}
module.exports = { runCycle };
