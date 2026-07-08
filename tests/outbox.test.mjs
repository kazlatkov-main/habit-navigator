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

test('конкурентни add() (double-tap) не губят и не дублират събития', async () => {
  const sent = [];
  const pendingSends = [];
  const ob = createOutbox({
    storage: fakeStorage(),
    send: (e) => new Promise((resolve, reject) => {
      pendingSends.push({ id: e.client_id, resolve: () => { sent.push(e.client_id); resolve(); }, reject });
    }),
  });

  // втори tap преди първият да е await-нат — старият код чете storage преди
  // първият flush да е dequeue-нал, стартира втори flush със стар snapshot.
  const p1 = ob.add({ client_id: 'a' });
  const p2 = ob.add({ client_id: 'b' });

  const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

  // resolve-ваме pending send-овете в реда, в който се появяват (FIFO),
  // докато не изчезнат — броят и самоличността им зависят от имплементацията.
  while (pendingSends.length) {
    pendingSends.shift().resolve();
    await tick();
  }

  await p1;
  await p2;
  await ob.flush();

  assert.equal(sent.filter((id) => id === 'a').length, 1);
  assert.equal(sent.filter((id) => id === 'b').length, 1);
  assert.equal(sent.length, 2);
  assert.equal(ob.pending(), 0);
});

test('повредено съдържание в storage не чупи outbox-а', async () => {
  const st = fakeStorage();
  st.setItem('outbox_v1', 'not-json');
  const sent = [];
  const ob = createOutbox({ storage: st, send: async (e) => sent.push(e) });

  assert.equal(ob.pending(), 0);

  await ob.add({ client_id: 'a' });
  assert.deepEqual(sent.map((e) => e.client_id), ['a']);
  assert.equal(ob.pending(), 0);
});
