import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayNumber, ceilingForDay, xpForDay, levelForXp, streak, taichiQualifies, cleanQualifies, maxRun, computeBadges,
         liveMetrics, totalXp, HEALTH_MILESTONES } from '../js/logic.js';

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

const S = { start_date: '2026-07-09', baseline_cigs: 22.5, pack_price_eur: 3.6, cigs_per_pack: 20 };
const d = (day, extra) => ({ day, taichi_minutes: 10, cig_count_final: 15,
  morning_done_at: 'x', evening_done_at: 'x', ...extra });

test('streak: брои назад от днес; днес без запис не къса', () => {
  const days = [d('2026-07-09'), d('2026-07-10'), d('2026-07-11')];
  assert.equal(streak(days, '2026-07-11', taichiQualifies, S.start_date), 3);
  assert.equal(streak(days, '2026-07-12', taichiQualifies, S.start_date), 3); // днес още непопълнен
  assert.equal(streak(days, '2026-07-13', taichiQualifies, S.start_date), 0); // вчера липсва → 0
});

test('streak: 2-минутният минимум пази тай-чи веригата', () => {
  const days = [d('2026-07-09'), d('2026-07-10', { taichi_minutes: 2 })];
  assert.equal(streak(days, '2026-07-10', taichiQualifies, S.start_date), 2);
  const broken = [d('2026-07-09'), d('2026-07-10', { taichi_minutes: 1 })];
  assert.equal(streak(broken, '2026-07-10', taichiQualifies, S.start_date), 0);
});

test('totalXp: сума от xpForDay по дни', () => {
  const days = [d('2026-07-09', { cig_count_final: 18 }), d('2026-07-10', { cig_count_final: 15 })];
  // всеки ден: тай-чи 20 + сутрин 5 + вечер 10 + под тавана 15 = 50
  assert.equal(totalXp(days, [], S.start_date), 100);
});

test('cleanQualifies: таван преди Quit Day, 0 след', () => {
  assert.equal(cleanQualifies({ cig_count_final: 20 }, 1), true);
  assert.equal(cleanQualifies({ cig_count_final: 21 }, 1), false);
  assert.equal(cleanQualifies({ cig_count_final: 1 }, 21), false);
  assert.equal(cleanQualifies({ cig_count_final: 0 }, 25), true);
  assert.equal(cleanQualifies({ cig_count_final: null }, 1), false);
});

test('liveMetrics: неизпушени, пари, минути живот', () => {
  const days = [d('2026-07-09', { cig_count_final: 18 }), d('2026-07-10', { cig_count_final: 12 })];
  const m = liveMetrics(days, S);
  assert.equal(m.notSmoked, 4.5 + 10.5); // (22.5-18)+(22.5-12)
  assert.equal(m.moneySaved, +(15 / 20 * 3.6).toFixed(2)); // 2.7
  assert.equal(m.lifeMinutes, 15 * 11);
});

test('computeBadges: първи ден, ≤16, quit day', () => {
  const days = [d('2026-07-09', { cig_count_final: 16 })];
  const badges = computeBadges(days, [], S, '2026-07-09');
  const byId = Object.fromEntries(badges.map((b) => [b.id, b.unlocked]));
  assert.equal(byId.first_day, true);
  assert.equal(byId.ceil_16, true);
  assert.equal(byId.ceil_12, false);
  assert.equal(byId.quit_day, false);
  assert.equal(badges.length, 11);
});

test('computeBadges: чиста кола ×3 — дни 1–3 без изпушена с тригер шофиране', () => {
  const days = [d('2026-07-09'), d('2026-07-10'), d('2026-07-11')];
  const cleanCar = computeBadges(days, [
    { ts: '2026-07-10T09:00:00Z', kind: 'resisted', trigger: 'шофиране' },
  ], S, '2026-07-11').find((b) => b.id === 'clean_car_3');
  assert.equal(cleanCar.unlocked, true);
  const dirty = computeBadges(days, [
    { ts: '2026-07-10T09:00:00Z', kind: 'smoked', trigger: 'шофиране' },
  ], S, '2026-07-11').find((b) => b.id === 'clean_car_3');
  assert.equal(dirty.unlocked, false);
});

test('HEALTH_MILESTONES: подредени по време', () => {
  assert.ok(HEALTH_MILESTONES.length >= 6);
  for (let i = 1; i < HEALTH_MILESTONES.length; i++)
    assert.ok(HEALTH_MILESTONES[i].minutes > HEALTH_MILESTONES[i - 1].minutes);
});

test('totalXp: устоян тап се брои по ЛОКАЛНА дата, не по UTC', () => {
  // Timestamp, чиято локална дата може да се различава от UTC датата.
  // Проверката е детерминистична на всяка машина: сравняваме и двете дати и
  // твърдим, че totalXp групира по локалната (habit_days.day е локална дата).
  const ts = '2026-07-09T22:30:00Z';
  const utcDay = ts.slice(0, 10);                          // '2026-07-09'
  const localDay = new Date(ts).toLocaleDateString('sv-SE');
  // Пълен ден на localDay (тай-чи 20 + сутрин 5 + вечер 10 + под тавана 15 = 50)
  // + един устоян тап (+5). Ако събитието се групира по UTC и utcDay!=localDay
  // и няма ред за utcDay, +5 се губи → сумата пада на 50.
  const days = [d(localDay, { cig_count_final: 18 })];
  assert.equal(totalXp(days, [{ ts, kind: 'resisted' }], S.start_date), 55);
  if (utcDay !== localDay) {
    // На машина, където датите се разминават (напр. Europe/Sofia), UTC-групиране
    // би сложило събитието в несъществуващ ред и би върнало 50 — този тест го лови.
    assert.notEqual(totalXp(days, [{ ts, kind: 'resisted' }], S.start_date), 50);
  }
});
