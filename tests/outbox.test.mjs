// tests/outbox.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOutbox } from '../js/outbox.js';

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
}

test('успешен send: опашката се изпразва', async () => {
  const sent = [];
  const ob = createOutbox({ storage: fakeStorage(), send: async (e) => sent.push(e) });
  await ob.add({ client_id: 'a', kind: 'resisted' });
  assert.equal(sent.length, 1);
  assert.equal(ob.pending(), 0);
});

test('фейлнал send: event-ът остава и се изпраща при следващ flush', async () => {
  let up = false;
  const sent = [];
  const st = fakeStorage();
  const ob = createOutbox({ storage: st, send: async (e) => { if (!up) throw new Error('offline'); sent.push(e); } });
  await ob.add({ client_id: 'a' });
  assert.equal(ob.pending(), 1);
  up = true;
  await ob.flush();
  assert.equal(ob.pending(), 0);
  assert.deepEqual(sent.map((e) => e.client_id), ['a']);
});

test('редът се пази; частичен фейл спира flush-а', async () => {
  let failOn = 'b';
  const sent = [];
  const ob = createOutbox({ storage: fakeStorage(), send: async (e) => {
    if (e.client_id === failOn) throw new Error('x');
    sent.push(e);
  }});
  await ob.add({ client_id: 'a' });
  await ob.add({ client_id: 'b' });
  await ob.add({ client_id: 'c' });
  assert.equal(ob.pending(), 2); // b фейлна → b,c чакат
  failOn = null;
  await ob.flush();
  assert.deepEqual(sent.map((e) => e.client_id), ['a', 'b', 'c']);
});

test('опашката оцелява през нов инстанс (persist)', async () => {
  const st = fakeStorage();
  const ob1 = createOutbox({ storage: st, send: async () => { throw new Error('offline'); } });
  await ob1.add({ client_id: 'a' });
  const ob2 = createOutbox({ storage: st, send: async () => {} });
  assert.equal(ob2.pending(), 1);
  await ob2.flush();
  assert.equal(ob2.pending(), 0);
});
