const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { State, hash } = require('../src/state');
const { processInvitations } = require('../src/invitations');

function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'primops-invitations-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'state.json');
  let state = new State(file);
  const calls = [];
  return { file, calls, state, run: (ids, extra = {}) => processInvitations({
    snapshot: { ids, stableIdsVerified: true, complete: true }, state,
    accept: async id => calls.push(id), log() {}, ...extra,
  }) };
}
test('historical invitations are persisted without accepting on first observation', async t => {
  const f = setup(t);
  await f.run(['historical-1', 'historical-2']);
  await f.run(['historical-1', 'historical-2']);
  assert.deepEqual(f.calls, []);
  assert.equal(new State(f.file).getInvitations().records[hash('historical-1')].status, 'historical');
});
test('new invitation is accepted only on a later verified polling pass', async t => {
  const f = setup(t);
  await f.run(['historical']);
  await f.run(['historical', 'new']);
  assert.deepEqual(f.calls, ['new']);
});
test('restart preserves historical baseline and accepted-invitation deduplication', async t => {
  const f = setup(t);
  f.state.set('existing-conversation', { last: 'existing-message', status: 'sent' });
  await f.run(['historical']);
  await f.run(['historical', 'new']);
  await f.run(['historical', 'new', 'new-after-restart'], { state: new State(f.file) });
  assert.deepEqual(f.calls, ['new', 'new-after-restart']);
  assert.equal(new State(f.file).get('existing-conversation').last, 'existing-message');
});
test('ambiguous acceptance reserves the invitation and never retries after restart', async t => {
  const f = setup(t);
  await f.run([]);
  await assert.rejects(f.run(['uncertain'], { accept: async () => { throw new Error('network'); } }));
  await f.run(['uncertain'], { state: new State(f.file) });
  assert.deepEqual(f.calls, []);
  assert.equal(new State(f.file).getInvitations().records[hash('uncertain')].status, 'pending');
});
test('incomplete coverage or unstable IDs blocks all actions and quarantines observations', async t => {
  const f = setup(t);
  await f.run(['old'], { snapshot: { ids: ['old'], complete: false, stableIdsVerified: true } });
  assert.equal(f.state.getInvitations().initialized, false);
  await f.run(['old']);
  await f.run(['old', 'unverified'], { snapshot: { ids: ['old', 'unverified'], complete: true, stableIdsVerified: false } });
  await f.run(['old', 'unverified']);
  await f.run(['missing'], { snapshot: { ids: [null], complete: true, stableIdsVerified: true } });
  assert.deepEqual(f.calls, []);
});
