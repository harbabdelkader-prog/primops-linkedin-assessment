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

test('repeated polls preserve the original historical record', async t => {
  const f = setup(t);
  await f.run(['old']);
  const original = { ...f.state.getInvitations().records[hash('old')] };
  for (let i = 0; i < 4; i++) await f.run(['old']);
  assert.deepEqual(f.calls, []);
  assert.deepEqual(f.state.getInvitations().records[hash('old')], original);
});

test('delayed historical appearance is quarantined rather than inferred new', async t => {
  const f = setup(t);
  await f.run(['visible-old']);
  await f.run([], { snapshot: { ids: [], stableIdsVerified: true, complete: false } });
  await f.run(['delayed-old'], { snapshot: { ids: ['delayed-old'], stableIdsVerified: true, complete: false } });
  await f.run(['visible-old', 'delayed-old'], { state: new State(f.file) });
  assert.deepEqual(f.calls, []);
  assert.equal(new State(f.file).getInvitations().records[hash('delayed-old')].status, 'historical');
});

test('separate virtualized pages never establish a complete baseline', async t => {
  const f = setup(t);
  for (const ids of [['page-one'], ['page-two'], ['page-one']]) {
    await f.run(ids, { snapshot: { ids, stableIdsVerified: true, complete: false } });
  }
  const saved = new State(f.file).getInvitations();
  assert.equal(saved.initialized, false);
  assert.equal(Object.keys(saved.records).length, 2);
  assert.deepEqual(f.calls, []);
});

test('duplicate identifiers block the entire pass, including otherwise unseen IDs', async t => {
  const f = setup(t);
  await f.run(['old']);
  await f.run(['duplicate', 'duplicate', 'new']);
  await f.run(['old', 'duplicate', 'new'], { state: new State(f.file) });
  assert.deepEqual(f.calls, []);
});

test('missing identifiers block actions without discarding historical or pending state', async t => {
  const f = setup(t);
  await f.run(['old']);
  const saved = f.state.getInvitations();
  saved.records[hash('uncertain')] = { status: 'pending', at: 123 };
  f.state.setInvitations(saved);
  await f.run(['new', null]);
  await f.run(['old', 'new', 'uncertain'], { state: new State(f.file) });
  assert.deepEqual(f.calls, []);
  assert.deepEqual(new State(f.file).getInvitations().records[hash('uncertain')], { status: 'pending', at: 123 });
});
