import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayNumber, ceilingForDay, xpForDay, levelForXp } from '../js/logic.js';

test('dayNumber: start date е Ден 1', () => {
  assert.equal(dayNumber('2026-07-09', '2026-07-09'), 1);
  assert.equal(dayNumber('2026-07-09', '2026-07-10'), 2);
  assert.equal(dayNumber('2026-07-09', '2026-08-07'), 30);
  assert.equal(dayNumber('2026-07-09', '2026-07-08'), 0);
});

test('ceilingForDay: taper графикът от плана', () => {
  assert.equal(ceilingForDay(1), 20);
  assert.equal(ceilingForDay(3), 20);
  assert.equal(ceilingForDay(4), 16);
  assert.equal(ceilingForDay(7), 16);
  assert.equal(ceilingForDay(8), 12);
  assert.equal(ceilingForDay(10), 12);
  assert.equal(ceilingForDay(11), 8);
  assert.equal(ceilingForDay(14), 8);
  assert.equal(ceilingForDay(15), 5);
  assert.equal(ceilingForDay(17), 5);
  assert.equal(ceilingForDay(18), 3);
  assert.equal(ceilingForDay(20), 3);
  assert.equal(ceilingForDay(21), 0);
  assert.equal(ceilingForDay(30), 0);
  assert.equal(ceilingForDay(0), null);
});

test('xpForDay: пълен добър ден', () => {
  const dayRow = {
    taichi_minutes: 12, morning_done_at: 'x', evening_done_at: 'x',
    cig_count_final: 18,
  };
  const events = [
    { kind: 'resisted' }, { kind: 'resisted' }, { kind: 'smoked' },
  ];
  // тай-чи 20 + сутрин 5 + вечер 10 + под тавана (18≤20) 15 + 2 устояни ×5 = 60
  assert.equal(xpForDay(dayRow, events, 1), 60);
});

test('xpForDay: мини тай-чи, над тавана, без вечерен вход', () => {
  const dayRow = { taichi_minutes: 2, morning_done_at: 'x', evening_done_at: null, cig_count_final: 19 };
  // тай-чи мини 10 + сутрин 5; 19 > таван 16 (ден 5) → без 15; вечер незавършена → без 10
  assert.equal(xpForDay(dayRow, [], 5), 15);
});

test('xpForDay: null cig_count_final не носи ceiling XP', () => {
  assert.equal(xpForDay({ taichi_minutes: 0, cig_count_final: null }, [], 1), 0);
});

test('levelForXp: прагове', () => {
  assert.equal(levelForXp(0).name, 'Начинаещ');
  assert.equal(levelForXp(299).name, 'Начинаещ');
  assert.equal(levelForXp(300).name, 'Ученик');
  assert.equal(levelForXp(800).name, 'Практикуващ');
  assert.equal(levelForXp(1500).name, 'Пазител на веригата');
  assert.equal(levelForXp(2400).name, 'Майстор на навика');
  assert.equal(levelForXp(2400).next, null);
  assert.equal(levelForXp(300).next, 800);
});
