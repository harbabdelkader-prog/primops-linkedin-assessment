const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { State } = require('../src/state');
const { runCycle } = require('../src/cycle');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'primops-cycle-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return new State(path.join(dir, 'state.json'));
}

test('combined cycles serialize navigation, detect invitations and reply only to a new incoming message', async t => {
  const state = fixture(t); const trace = []; const logs = []; let active = false; let fresh = false; let sends = 0;
  const step = async name => { assert.equal(active, false); active = true; trace.push(name); await Promise.resolve(); active = false; };
  const old = { id: 'old', direction: 'other', text: 'historical' };
  const adapter = {
    async invitationSnapshot() { await step('invitations'); return { ids: fresh ? ['old-invite', 'unclassified-invite'] : ['old-invite'], stableIdsVerified: true, complete: false }; },
    async acceptById() { assert.fail('incomplete coverage must prevent acceptance'); },
    async conversations() { await step('inbox'); return ['thread']; },
    async readConversation() { await step('thread'); return fresh ? [old, { id: 'new', direction: 'other', text: 'Could we schedule a meeting?' }] : [old]; },
    async send(text, id) { await step('send'); assert.equal(id, 'new'); assert.match(text, /time zone/); sends++; },
  };
  const args = { adapter, state, activation: 'activation', log: (event, fields) => logs.push({ event, ...fields }) };
  await runCycle(args); assert.equal(sends, 0);
  fresh = true; await runCycle(args); await runCycle(args);
  assert.equal(sends, 1);
  assert.deepEqual(trace, ['invitations', 'inbox', 'thread', 'invitations', 'inbox', 'thread', 'send', 'invitations', 'inbox', 'thread']);
  assert.equal(Object.keys(state.getInvitations().records).length, 2);
  assert.equal(logs.filter(x => x.event === 'monitoring_cycle_completed' && x.messagesEnabled && x.invitationObservationSucceeded).length, 3);
});

test('transient invitation navigation failure does not suppress message processing', async t => {
  const state = fixture(t); let inspected = false; const logs = [];
  const adapter = {
    async invitationSnapshot() { throw new Error('network'); },
    async conversations() { return ['thread']; },
    async readConversation() { inspected = true; return [{ id: 'old', direction: 'other' }]; },
    async send() { assert.fail('first observation must baseline'); },
  };
  const result = await runCycle({ adapter, state, activation: 'activation', log: event => logs.push(event) });
  assert.equal(inspected, true);
  assert.equal(result.invitationObservationSucceeded, false);
  assert.ok(logs.includes('invitation_observation_error'));
});

test('security challenges stop the combined cycle before further navigation', async t => {
  const adapter = {
    async invitationSnapshot() { throw new Error('CHALLENGE'); },
    async conversations() { assert.fail('must not continue past challenge'); },
  };
  await assert.rejects(runCycle({ adapter, state: fixture(t), activation: 'activation', log() {} }), /CHALLENGE/);
});
