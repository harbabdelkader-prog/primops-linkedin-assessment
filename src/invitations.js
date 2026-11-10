const { hash } = require('./state');

// Only a verified, complete snapshot can establish an actionable baseline.
// Unknown IDs observed without those guarantees are permanently quarantined.
async function processInvitations({ snapshot, state, accept, log }) {
  const saved = state.getInvitations() || { initialized: false, records: {} };
  const ids = snapshot.ids || [];
  const validIds = ids.every(id => typeof id === 'string' && id.length > 0) && new Set(ids).size === ids.length;
  const verified = snapshot.complete === true && snapshot.stableIdsVerified === true && validIds;
  if (!verified || !saved.initialized) {
    for (const id of ids.filter(id => typeof id === 'string' && id.length > 0)) {
      saved.records[hash(id)] ||= { status: 'historical', at: Date.now() };
    }
    if (verified) saved.initialized = true;
    state.setInvitations(saved);
    log(verified ? 'invitation_baseline_created' : 'invitation_acceptance_blocked', {
      visiblePending: ids.length, stableIdsVerified: snapshot.stableIdsVerified === true,
      completeCoverageVerified: snapshot.complete === true,
    });
    return;
  }
  for (const id of ids) {
    const key = hash(id);
    if (saved.records[key]) continue;
    const started = Date.now();
    saved.records[key] = { status: 'pending', at: started };
    state.setInvitations(saved); // reserve before the click; ambiguous outcomes never retry
    await accept(id);
    saved.records[key] = { status: 'accepted', at: Date.now() };
    state.setInvitations(saved);
    log('invitation_accepted', { invitation: key, observedLatencyMs: Date.now() - started });
  }
}
module.exports = { processInvitations };
