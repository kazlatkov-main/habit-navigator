# Habit Navigator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 30-дневен gamified habit dashboard (тай-чи всеки ден + отказване от цигари) — статичен сайт на GitHub Pages, данни в Supabase, събиращ чист dataset за habit платформата на Крис.

**Architecture:** Статичен frontend без build стъпка (index.html + ES modules), който говори директно със Supabase (Postgres + Auth + RLS) през supabase-js v2. Чистата домейн логика (XP, вериги, значки, метрики, taper тавани) е отделена в pure модули, тествани с `node --test`. Бързите тапове минават през localStorage outbox → никога не се губят при лоша мрежа.

**Tech Stack:** Vanilla HTML/CSS/JS (ES modules), supabase-js v2 (CDN ESM), Chart.js 4 (CDN), Node.js вграден test runner (`node --test`), Supabase (нов проект `habit-navigator`), GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-07-08-habit-navigator-design.md` — прочети я преди старт. Планът я имплементира 1:1.

## Global Constraints

- Език на целия UI: **български**. Тон: кратък, енергичен, без вина („данни > вина").
- Валута: **EUR**. Defaults: pack_price_eur=3.60, cigs_per_pack=20, baseline_cigs=22.5, quit_day_offset=21.
- Ден 1 = `settings.start_date`. Ден = локална дата (Europe/Sofia), низ `YYYY-MM-DD`.
- Taper тавани: дни 1–3→20, 4–7→16, 8–10→12, 11–14→8, 15–17→5, 18–20→3, ≥21→0.
- Никакъв build step. Никакви npm dependencies за runtime (CDN only). `node --test` е само за dev.
- Mobile-first (375px базова ширина), тъмна тема.
- XP: тай-чи ≥10 мин +20; тай-чи 2–9 мин +10; устоян глад +5; ден ≤ таван +15; сутрешен чекин +5; пълен вечерен вход +10.
- Нива: Начинаещ 0 / Ученик 300 / Практикуващ 800 / Пазител на веригата 1500 / Майстор на навика 2400.
- Тай-чи верига се брои при `taichi_minutes ≥ 2` („никога нула").
- Commits: конвенционални (`feat:`, `test:`, `chore:`), чести — след всяка задача минимум.

## File Structure

```
~/code/habit-navigator/
├── index.html              # Shell: login + 4 таба (Днес/Прогрес/Постижения/Данни)
├── css/style.css           # Тъмна тема, design tokens, компоненти
├── js/config.js            # SUPABASE_URL, SUPABASE_ANON_KEY (попълва се в Task 4)
├── js/logic.js             # PURE: дни/тавани/XP/нива/вериги/значки/метрики/здраве
├── js/outbox.js            # PURE: localStorage опашка за craving events
├── js/db.js                # Тънък Supabase wrapper (auth + CRUD)
├── js/app.js               # UI state, рендериране, форми, графики
├── tests/logic.test.mjs    # node --test за logic.js
├── tests/outbox.test.mjs   # node --test за outbox.js
├── supabase/migrations/001_init.sql
├── README.md               # Setup, deploy, телефон, export
└── docs/superpowers/{specs,plans}/...
```

Забележка към spec §2: spec-ът казва „един самостоятелен index.html". Уточнение, прието при планиране: **без build стъпка** остава, но логиката е в отделни ES модули, за да е тестваема — GitHub Pages сервира всичко статично без промяна.

---

### Task 1: Scaffold + чиста домейн логика, част 1 (дни, тавани, XP, нива)

**Files:**
- Create: `js/logic.js`
- Create: `tests/logic.test.mjs`
- Create: `.gitignore` (съдържание: `.DS_Store`)

**Interfaces:**
- Produces (използват се от Task 2, 6–9):
  - `dayNumber(startDateStr, dateStr) → int` — 1-базиран; `dateStr < startDateStr` → 0 или отрицателно
  - `ceilingForDay(dayNum) → int` — таван; `dayNum ≥ 21` → 0; `dayNum < 1` → `null`
  - `xpForDay(dayRow, dayEvents, dayNum) → int`
  - `levelForXp(xp) → {name, floor, next}` — `next` = праг на следващото ниво или `null` на макс
  - `LEVELS` — масив `[{name, floor}]`

- [ ] **Step 1: Напиши failing тестове**

```js
// tests/logic.test.mjs
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
```

- [ ] **Step 2: Пусни ги — да фейлват**

Run: `cd ~/code/habit-navigator && node --test tests/logic.test.mjs`
Expected: FAIL (Cannot find module '../js/logic.js')

- [ ] **Step 3: Имплементирай `js/logic.js`**

```js
// js/logic.js — pure домейн логика; без DOM, без мрежа, без Date.now() в изчисленията

export const TAPER = [
  { from: 1, to: 3, ceiling: 20 },
  { from: 4, to: 7, ceiling: 16 },
  { from: 8, to: 10, ceiling: 12 },
  { from: 11, to: 14, ceiling: 8 },
  { from: 15, to: 17, ceiling: 5 },
  { from: 18, to: 20, ceiling: 3 },
];

export const LEVELS = [
  { name: 'Начинаещ', floor: 0 },
  { name: 'Ученик', floor: 300 },
  { name: 'Практикуващ', floor: 800 },
  { name: 'Пазител на веригата', floor: 1500 },
  { name: 'Майстор на навика', floor: 2400 },
];

const DAY_MS = 24 * 60 * 60 * 1000;

// Дати като 'YYYY-MM-DD' низове; сравняваме през UTC parse — еднакво отместване, чиста аритметика.
export function dayNumber(startDateStr, dateStr) {
  const start = Date.parse(startDateStr + 'T00:00:00Z');
  const d = Date.parse(dateStr + 'T00:00:00Z');
  return Math.round((d - start) / DAY_MS) + 1;
}

export function ceilingForDay(dayNum) {
  if (dayNum < 1) return null;
  if (dayNum >= 21) return 0;
  return TAPER.find((t) => dayNum >= t.from && dayNum <= t.to).ceiling;
}

export function xpForDay(dayRow, dayEvents, dayNum) {
  let xp = 0;
  const min = dayRow.taichi_minutes ?? 0;
  if (min >= 10) xp += 20;
  else if (min >= 2) xp += 10;
  if (dayRow.morning_done_at) xp += 5;
  if (dayRow.evening_done_at) xp += 10;
  const ceiling = ceilingForDay(dayNum);
  if (ceiling !== null && dayRow.cig_count_final !== null && dayRow.cig_count_final !== undefined
      && dayRow.cig_count_final <= ceiling) xp += 15;
  xp += dayEvents.filter((e) => e.kind === 'resisted').length * 5;
  return xp;
}

export function levelForXp(xp) {
  let level = LEVELS[0];
  for (const l of LEVELS) if (xp >= l.floor) level = l;
  const idx = LEVELS.indexOf(level);
  return { ...level, next: LEVELS[idx + 1]?.floor ?? null };
}
```

- [ ] **Step 4: Пусни тестовете — PASS**

Run: `node --test tests/logic.test.mjs`
Expected: всички PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: domain logic part 1 — days, taper ceilings, XP, levels"
```

---

### Task 2: Чиста домейн логика, част 2 (вериги, значки, метрики, здравна линия)

**Files:**
- Modify: `js/logic.js` (добавяне в края)
- Modify: `tests/logic.test.mjs` (добавяне)

**Interfaces:**
- Consumes: `dayNumber`, `ceilingForDay` от Task 1.
- Produces (за Task 6–9):
  - `streak(days, todayStr, qualifiesFn) → int` — общ бек-брояч; днес без запис не къса (брои от вчера)
  - `taichiQualifies(dayRow) → bool`, `cleanQualifies(dayRow, dayNum) → bool`
  - `maxRun(days, qualifiesFn, startDateStr) → int` — най-дълга историческа серия
  - `computeBadges(days, events, settings, todayStr) → [{id, name, desc, unlocked}]`
  - `liveMetrics(days, settings) → {notSmoked, moneySaved, lifeMinutes}`
  - `HEALTH_MILESTONES` — `[{minutes, label}]`
  - `daysMap(days) → Map<dayStr, dayRow>` (helper)

Договор за данните: `days` = масив от habit_days редове (полето `day` е `'YYYY-MM-DD'`), `events` = масив craving_events (`ts` ISO низ, `kind`, `trigger`, `intensity`, `instead`).

- [ ] **Step 1: Failing тестове (добави в tests/logic.test.mjs)**

```js
import { streak, taichiQualifies, cleanQualifies, maxRun, computeBadges,
         liveMetrics, totalXp, HEALTH_MILESTONES } from '../js/logic.js';

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
```

- [ ] **Step 2: Пусни — FAIL** (`node --test tests/logic.test.mjs`)

- [ ] **Step 3: Имплементирай (добави в js/logic.js)**

```js
export function daysMap(days) {
  return new Map(days.map((r) => [r.day, r]));
}

function addDays(dateStr, n) {
  const t = Date.parse(dateStr + 'T00:00:00Z') + n * DAY_MS;
  return new Date(t).toISOString().slice(0, 10);
}

export const taichiQualifies = (row) => (row?.taichi_minutes ?? 0) >= 2;

export function cleanQualifies(row, dayNum) {
  const c = row?.cig_count_final;
  if (c === null || c === undefined) return false;
  const ceiling = ceilingForDay(dayNum);
  return ceiling !== null && c <= ceiling;
}

// qualifiesFn(row, dayNum) → bool. Днес без запис → броим от вчера (денят не е свършил).
// startDateStr е нужен, за да смятаме dayNum за cleanQualifies.
export function streak(days, todayStr, qualifiesFn, startDateStr) {
  const map = daysMap(days);
  const startOfCount = map.has(todayStr) ? todayStr : addDays(todayStr, -1);
  let n = 0;
  for (let dstr = startOfCount; ; dstr = addDays(dstr, -1)) {
    const row = map.get(dstr);
    if (!row || !qualifiesFn(row, dayNumber(startDateStr, dstr))) break;
    n++;
  }
  return n;
}

export function maxRun(days, qualifiesFn, startDateStr) {
  const sorted = [...days].sort((a, b) => a.day.localeCompare(b.day));
  let best = 0, cur = 0, prev = null;
  for (const row of sorted) {
    const ok = qualifiesFn(row, dayNumber(startDateStr, row.day));
    const consecutive = prev !== null && dayNumber(prev, row.day) === 2;
    cur = ok ? (consecutive ? cur + 1 : 1) : 0;
    best = Math.max(best, cur);
    prev = row.day;
  }
  return best;
}

export function liveMetrics(days, settings) {
  let notSmoked = 0;
  for (const row of days) {
    if (row.cig_count_final === null || row.cig_count_final === undefined) continue;
    notSmoked += Math.max(0, settings.baseline_cigs - row.cig_count_final);
  }
  const moneySaved = +((notSmoked / settings.cigs_per_pack) * settings.pack_price_eur).toFixed(2);
  return { notSmoked, moneySaved, lifeMinutes: Math.round(notSmoked * 11) };
}

export const HEALTH_MILESTONES = [
  { minutes: 20, label: 'Пулсът и кръвното се нормализират' },
  { minutes: 12 * 60, label: 'Въглеродният оксид в кръвта пада до нормално' },
  { minutes: 48 * 60, label: 'Вкусът и обонянието се изострят' },
  { minutes: 72 * 60, label: 'Никотинът е изхвърлен; дишането олеква' },
  { minutes: 14 * 24 * 60, label: 'Кръвообращението се подобрява' },
  { minutes: 30 * 24 * 60, label: 'Дробовете започват да се самопочистват' },
  { minutes: 90 * 24 * 60, label: 'Белодробната функция ↑ с до 30% (preview)' },
  { minutes: 365 * 24 * 60, label: 'Рискът от инфаркт — наполовина (preview)' },
];

export function computeBadges(days, events, settings, todayStr) {
  const start = settings.start_date;
  const dn = (dstr) => dayNumber(start, dstr);
  const evDay = (e) => e.ts.slice(0, 10);
  const smokedDriving = events.filter((e) => e.kind === 'smoked' && e.trigger === 'шофиране');
  const fullDays = days.filter((r) => r.evening_done_at);
  const dayByNum = (n) => days.find((r) => dn(r.day) === n);
  const inRange = (n, a, b) => n >= a && n <= b;

  const clean3 = [1, 2, 3].every((n) => {
    const row = dayByNum(n);
    if (!row?.evening_done_at) return false;
    return !smokedDriving.some((e) => dn(evDay(e)) === n);
  });
  const peakClean = [22, 23, 24, 25, 26].every((n) => dayByNum(n)?.cig_count_final === 0);

  return [
    { id: 'first_day', name: 'Първи ден', desc: 'Пълен дневник за Ден 1',
      unlocked: !!dayByNum(1)?.evening_done_at },
    { id: 'clean_car_3', name: 'Чиста кола ×3', desc: 'Дни 1–3 без цигара зад волана', unlocked: clean3 },
    { id: 'taichi_week', name: 'Седмица тай-чи', desc: '7 поредни дни тай-чи',
      unlocked: maxRun(days, taichiQualifies, start) >= 7 },
    { id: 'ceil_16', name: '≤16', desc: 'Ден с максимум 16 цигари',
      unlocked: days.some((r) => r.cig_count_final !== null && r.cig_count_final <= 16 && r.evening_done_at) },
    { id: 'ceil_12', name: '≤12', desc: 'Ден с максимум 12 цигари',
      unlocked: days.some((r) => r.cig_count_final !== null && r.cig_count_final <= 12 && r.evening_done_at) },
    { id: 'ceil_8', name: '≤8', desc: 'Ден с максимум 8 цигари',
      unlocked: days.some((r) => r.cig_count_final !== null && r.cig_count_final <= 8 && r.evening_done_at) },
    { id: 'quit_day', name: 'QUIT DAY', desc: 'Ден 21 с нула цигари',
      unlocked: dayByNum(21)?.cig_count_final === 0 },
    { id: 'survived_peak', name: 'Оцелях пика', desc: 'Дни 22–26 чисти (пикът на отнемане)',
      unlocked: peakClean },
    { id: 'resisted_100', name: '100 устояни глада', desc: '100 записани устоявания',
      unlocked: events.filter((e) => e.kind === 'resisted').length >= 100 },
    { id: 'chain_30', name: '30-дневна верига', desc: '30 поредни дни тай-чи',
      unlocked: maxRun(days, taichiQualifies, start) >= 30 },
    { id: 'client_no1', name: 'Клиент №1', desc: '30 пълни дневника — dataset-ът е събран',
      unlocked: fullDays.length >= 30 },
  ];
}
```

```js
export function totalXp(days, events, startDateStr) {
  const evByDay = new Map();
  for (const e of events) {
    const k = e.ts.slice(0, 10);
    if (!evByDay.has(k)) evByDay.set(k, []);
    evByDay.get(k).push(e);
  }
  return days.reduce((sum, row) =>
    sum + xpForDay(row, evByDay.get(row.day) ?? [], dayNumber(startDateStr, row.day)), 0);
}
```

- [ ] **Step 4: Пусни — PASS** (`node --test tests/logic.test.mjs`)

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: domain logic part 2 — streaks, badges, metrics, health timeline"`

---

### Task 3: Outbox — offline-устойчиви тапове

**Files:**
- Create: `js/outbox.js`
- Create: `tests/outbox.test.mjs`

**Interfaces:**
- Produces: `createOutbox({ storage, send, key? }) → { add(event), flush(), pending() }`
  - `storage`: обект с `getItem/setItem` (localStorage-съвместим)
  - `send(event) → Promise` — reject = остава в опашката
  - `add()` записва в опашката ПЪРВО, после опитва flush → тап никога не се губи
  - Всеки event носи `client_id` (uuid, генериран от викащия) за dedup на сървъра

- [ ] **Step 1: Failing тестове**

```js
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
```

- [ ] **Step 2: Пусни — FAIL** (`node --test tests/outbox.test.mjs`)

- [ ] **Step 3: Имплементирай `js/outbox.js`**

```js
// js/outbox.js — pure опашка; тап се записва локално ПЪРВО, после се изпраща.
export function createOutbox({ storage, send, key = 'outbox_v1' }) {
  const read = () => JSON.parse(storage.getItem(key) ?? '[]');
  const write = (q) => storage.setItem(key, JSON.stringify(q));

  async function flush() {
    let q = read();
    while (q.length) {
      try { await send(q[0]); } catch { break; }
      q = q.slice(1);
      write(q);
    }
  }

  return {
    async add(event) { write([...read(), event]); await flush(); },
    flush,
    pending: () => read().length,
  };
}
```

- [ ] **Step 4: Пусни — PASS**, после и двата файла: `node --test tests/`
- [ ] **Step 5: Commit** — `git commit -am "feat: offline outbox for craving taps"` (с `git add -A`)

---

### Task 4: Supabase проект, схема, RLS, потребител, config

**Files:**
- Create: `supabase/migrations/001_init.sql`
- Create: `js/config.js`

**Interfaces:**
- Produces: работещ Supabase проект + `js/config.js` с `export const SUPABASE_URL = '...'; export const SUPABASE_ANON_KEY = '...';` (реални стойности, anon/publishable key е публичен по дизайн — RLS пази данните).

**Инструменти:** Supabase MCP tools (`list_organizations`, `get_cost`, `confirm_cost`, `create_project`, `apply_migration`, `get_project_url`, `get_publishable_keys`). Ако MCP липсва в build сесията — същите стъпки през dashboard-а, SQL-ът е идентичен.

- [ ] **Step 1: Създай проекта**

1. `list_organizations` → избери организацията на Крис (при повече от една — питай го).
2. `get_cost(type: 'project')` → `confirm_cost` (очаквано: $0 free tier; ако не е $0 — спри и питай Крис).
3. `create_project(name: 'habit-navigator', confirm_cost_id: <id>)`. Изчакай status ACTIVE (`get_project`).

- [ ] **Step 2: Напиши миграцията**

```sql
-- supabase/migrations/001_init.sql
create table public.settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  start_date date,
  quit_day_offset int not null default 21,
  baseline_cigs numeric not null default 22.5,
  pack_price_eur numeric not null default 3.60,
  cigs_per_pack int not null default 20,
  created_at timestamptz not null default now()
);

create table public.habit_days (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null,
  taichi_minutes int,
  taichi_quality int check (taichi_quality between 1 and 5),
  state_before int check (state_before between 1 and 5),
  state_after int check (state_after between 1 and 5),
  sleep_quality int check (sleep_quality between 1 and 5),
  morning_craving int check (morning_craving between 1 and 5),
  confidence int check (confidence between 1 and 5),
  morning_done_at timestamptz,
  cig_count_final int check (cig_count_final >= 0),
  mood int check (mood between 1 and 5),
  stress int check (stress between 1 and 5),
  wife_smoked boolean,
  alcohol boolean,
  identity_vote int check (identity_vote between 1 and 5),
  hardest_moment text,
  what_helped text,
  withdrawal jsonb,
  note text,
  evening_done_at timestamptz,
  primary key (user_id, day)
);

create table public.craving_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ts timestamptz not null default now(),
  kind text not null check (kind in ('smoked','resisted')),
  trigger text not null check (trigger in
    ('стрес','кафе','след_ядене','скука','пауза_работа','шофиране','жена_ми_запали','алкохол','друго')),
  intensity int not null check (intensity between 1 and 5),
  instead text check (instead in
    ('дишане_60с','отложих_10мин','микро_тай_чи','чай_вода','отмина_само','друго')),
  note text,
  unique (user_id, client_id)
);

alter table public.settings enable row level security;
alter table public.habit_days enable row level security;
alter table public.craving_events enable row level security;

create policy "own settings" on public.settings for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own days" on public.habit_days for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own events" on public.craving_events for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

- [ ] **Step 3: Приложи я** — `apply_migration(name: 'init', query: <файлът>)`. Провери с `list_tables` → трите таблици съществуват, RLS enabled.

- [ ] **Step 4: Създай потребителя на Крис**

В Supabase Dashboard → Authentication → Users → **Add user** → email `kazlatkov@gmail.com` + парола (Крис я избира, кажи му да я запише) + **Auto Confirm User = ON**. После Authentication → Sign In / Up → **изключи** "Allow new users to sign up". (Ръчна стъпка — дай на Крис точните кликове; не може през MCP.)

- [ ] **Step 5: Попълни `js/config.js`**

`get_project_url` + `get_publishable_keys` →

```js
// js/config.js
export const SUPABASE_URL = '<от get_project_url>';
export const SUPABASE_ANON_KEY = '<publishable key>';
```

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: supabase schema, RLS, project config"`

---

### Task 5: db.js — Supabase wrapper

**Files:**
- Create: `js/db.js`

**Interfaces:**
- Consumes: `js/config.js`, `js/outbox.js`.
- Produces (за app.js):

```js
export async function createDb() → {
  signIn(email, password),        // → session или хвърля
  getSession(),                    // → session | null
  signOut(),
  loadAll(),                       // → { settings, days, events } (сортирани по day/ts)
  saveSettings(patch),             // upsert върху settings (user_id = auth.uid())
  upsertDay(dayStr, patch),        // upsert върху habit_days по (user_id, day)
  addCraving(event),               // през outbox; event без client_id го получава тук (crypto.randomUUID())
  outboxPending(),                 // → int
  flushOutbox(),
}
```

- [ ] **Step 1: Имплементирай**

```js
// js/db.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { createOutbox } from './outbox.js';

export async function createDb() {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const outbox = createOutbox({
    storage: localStorage,
    send: async (event) => {
      const { error } = await sb.from('craving_events').insert(event);
      // 23505 = unique violation → дубликат от повторен flush; третираме като успех
      if (error && error.code !== '23505') throw error;
    },
  });
  window.addEventListener('online', () => outbox.flush());
  setInterval(() => outbox.flush(), 60_000);

  const one = async (q) => { const { data, error } = await q; if (error) throw error; return data; };

  return {
    signIn: (email, password) => one(sb.auth.signInWithPassword({ email, password })),
    getSession: async () => (await sb.auth.getSession()).data.session,
    signOut: () => sb.auth.signOut(),
    async loadAll() {
      const [settings, days, events] = await Promise.all([
        one(sb.from('settings').select('*').maybeSingle()),
        one(sb.from('habit_days').select('*').order('day')),
        one(sb.from('craving_events').select('*').order('ts')),
      ]);
      return { settings, days, events };
    },
    saveSettings: (patch) => one(sb.from('settings').upsert(patch, { onConflict: 'user_id' }).select().single()),
    upsertDay: (day, patch) => one(sb.from('habit_days').upsert({ day, ...patch }, { onConflict: 'user_id,day' }).select().single()),
    addCraving: (event) => outbox.add({ client_id: crypto.randomUUID(), ...event }),
    outboxPending: () => outbox.pending(),
    flushOutbox: () => outbox.flush(),
  };
}
```

**Забележка:** `upsert` с `default auth.uid()` колона: при upsert подавай и `user_id` не е нужно — default-ът се прилага при insert, а RLS пази update-а. `onConflict: 'user_id,day'` изисква user_id в payload при conflict-detection → добави `user_id` в payload: вземи го от сесията (`(await sb.auth.getSession()).data.session.user.id`) и го включвай в `upsertDay`/`saveSettings`. Имплементирай така от първия път.

- [ ] **Step 2: Smoke check в браузър** — след Task 6 login екрана (db.js се проверява end-to-end там; няма отделен unit тест — тънък wrapper без логика).

- [ ] **Step 3: Commit** — `git add -A && git commit -m "feat: supabase db wrapper with outbox integration"`

---

### Task 6: UI shell — login, табове, екран „Днес" + craving sheet

**Files:**
- Create: `index.html`, `css/style.css`, `js/app.js`

**Interfaces:**
- Consumes: всичко от Task 1–5.
- Produces: работещо приложение с login → Днес екран → тапове, записващи в Supabase. Останалите табове са празни секции (попълват се в Task 7–9).

**Design tokens (css/style.css — точни стойности):**

```css
:root {
  --bg: #0e1116;        /* фон */
  --surface: #171c24;   /* карти */
  --surface2: #1f2630;  /* повдигнати елементи */
  --text: #e8edf4;
  --muted: #8b96a5;
  --accent: #4ade80;    /* зелено — чисто/успех */
  --accent2: #f59e0b;   /* кехлибар — огън/вериги */
  --danger: #f87171;    /* изпуших */
  --radius: 16px;
  font-size: 16px;
}
body { background: var(--bg); color: var(--text);
  font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; margin: 0;
  padding-bottom: 72px; /* място за tab bar */ }
```

Компоненти: `.card` (surface, radius, 16px padding), `.chip` (избираем pill — grid от чипове), `.dots5` (5 тап-точки за 1–5 скали, избраната е --accent), `.btn-big` (min-height 72px, radius 20px, bold), `.tabbar` (fixed bottom, 4 иконни бутона, активен = --accent), `.sheet` (bottom sheet: fixed, слайд отдолу, backdrop). Preferred: без библиотеки, чист CSS.

- [ ] **Step 1: index.html скелет**

```html
<!doctype html>
<html lang="bg">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#0e1116">
  <title>Навигатор</title>
  <link rel="stylesheet" href="css/style.css">
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
</head>
<body>
  <section id="view-login" hidden>
    <!-- email, password, бутон „Вход", error ред -->
  </section>
  <main id="view-app" hidden>
    <section id="tab-today"></section>
    <section id="tab-progress" hidden></section>
    <section id="tab-achievements" hidden></section>
    <section id="tab-data" hidden></section>
  </main>
  <nav class="tabbar" id="tabbar" hidden>
    <button data-tab="today">Днес</button>
    <button data-tab="progress">Прогрес</button>
    <button data-tab="achievements">Постижения</button>
    <button data-tab="data">Данни</button>
  </nav>
  <div id="sheet-root"></div>
  <script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: app.js — boot, auth, state, Днес**

Boot: `createDb()` → `getSession()` → ако няма: покажи login; има: `loadAll()` → ако `settings == null || !settings.start_date`: onboarding карта (date input с default `2026-07-09` + полета цена/кутия/baseline с defaults + бутон „Старт") → `saveSettings` → render.

State: `{ settings, days, events, tab }` в модулен обект; `refresh()` → `loadAll()` + `renderAll()`.

Екран „Днес" (ред отгоре надолу):
1. Header: „Ден X от 30" + ниво име + XP бар (`totalXp` → `levelForXp`; ширина % = (xp−floor)/(next−floor)).
2. Двете вериги: 🔥 „Тай-чи: N дни" (`streak(days, today, taichiQualifies, start)`) и 🍃 „Чиста: N дни" (с `cleanQualifies`). Големи числа, пламъче се сивее при 0.
3. Карта „Днешен таван": `ceilingForDay(dayNumber(start, today))` + „изпушени досега: K" (брой днешни `smoked` events) + progress лента K/таван (при ≥21: текст „БЕЗ ДИМ — Ден след отказа №M").
4. Двата грамадни бутона: **УСТОЯХ** (--accent) и **ИЗПУШИХ** (--danger) → отварят sheet.
5. CTA карти: ако днешният ред няма `morning_done_at` → „🌅 Сутрешен чекин" бутон; след 20:00 и няма `evening_done_at` → „🌙 Вечерен вход"; ако вчерашният ред няма `evening_done_at` → „Попълни вчера" (отваря вечерната форма за вчера).
6. Ако `outboxPending() > 0`: тънка лента „⏳ N тапа чакат връзка".

Craving sheet (стъпков, един въпрос на екран, автоматично напред):
- Стъпка 1: тригер — грид 3×3 чипа: стрес / кафе / след ядене / скука / пауза работа / шофиране / жена ми запали / алкохол / друго.
- Стъпка 2: сила — 5 точки (1–5).
- Стъпка 3 (само „Устоях"): какво направи — чипове: дишане 60с / отложих 10 мин / микро тай-чи / чай·вода / отмина само / друго.
- Запис: `db.addCraving({ ts: new Date().toISOString(), kind, trigger, intensity, instead })` → sheet се затваря с бърза анимация „+5 XP" при устоян → `refresh()`.
- Чип стойностите в БД са снейк-вариантите от схемата (`след_ядене`, `пауза_работа`, `дишане_60с`, `чай_вода`, `отмина_само`, `жена_ми_запали`); етикетите в UI са с интервали.

„Днес" дефиниция: `const today = new Date().toLocaleDateString('sv-SE')` (дава YYYY-MM-DD в локална зона).

- [ ] **Step 3: Ръчна проверка**

Run: `cd ~/code/habit-navigator && python3 -m http.server 8000` → отвори `http://localhost:8000`.
Провери: login с потребителя на Крис работи; onboarding записва settings ред (виж в Supabase table editor); тап „Устоях" → ред в `craving_events` с правилен тригер; „Изпуших" също; XP барът мърда след refresh; табовете превключват.

- [ ] **Step 4: Offline проверка** — DevTools → Network → Offline → тап „Устоях" → лентата показва 1 чакащ → Online → до 60 сек (или reload) редът е в базата, без дубликат.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: app shell, login, today screen, craving sheet"`

---

### Task 7: Сутрешен чекин + вечерен вход

**Files:**
- Modify: `js/app.js`, `css/style.css`, `index.html` (форми в sheet-ове)

**Interfaces:**
- Consumes: `db.upsertDay`.
- Produces: двете форми записват в `habit_days`; вечерната приема параметър `dayStr` (за „попълни вчера").

- [ ] **Step 1: Сутрешен чекин (sheet, един екран, тап-only)**

Полета по ред (всички чипове/точки, без клавиатура):
1. Тай-чи минути: чипове 2 / 5 / 10 / 15 / 20+ (стойност 20) / 0 (пропуснах)
2. Качество на сесията: 5 точки (скрий при 0 минути)
3. Състояние преди: 5 точки; Състояние след: 5 точки (скрий при 0)
4. Сън снощи: 5 точки
5. Глад при кафето без цигара: 5 точки
6. Увереност за тавана днес: 5 точки
Бутон „Готово" → `upsertDay(today, { taichi_minutes, taichi_quality, state_before, state_after, sleep_quality, morning_craving, confidence, morning_done_at: new Date().toISOString() })` → „+XP" тост → refresh.

- [ ] **Step 2: Вечерен вход (sheet, приема dayStr)**

1. „Цигари днес": число с − / + бутони, предзаредено с броя `smoked` events за deня
2. Настроение: 5 точки; Стрес: 5 точки
3. Среда: два toggle-а „Жена ми пуши до мен" / „Алкохол"
4. „Днес действах като непушач": 5 точки
5. „Най-труден момент" + „Какво помогна": две еднократни text полета (по 1 ред)
6. Ако `dayNumber ≥ 21`: „Симптоми днес" чекбокси: раздразнителност / трудна концентрация / глад за храна / друго → `withdrawal: { irritability: bool, focus: bool, hunger: bool, other: bool }`
7. Бележка (optional, 1 ред)
„Готово" → `upsertDay(dayStr, {...полетата, cig_count_final, evening_done_at: new Date().toISOString()})`.

Правило editable история: формите позволяват отваряне само за дни `>= today − 2` (48 ч); по-стари дни са read-only (без CTA).

- [ ] **Step 3: Ръчна проверка** — попълни сутрешна + вечерна за днес; виж реда в Supabase; XP и вериги се обновяват; „попълни вчера" работи и попълва вчерашната дата.

- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: morning check-in and evening entry forms"`

---

### Task 8: Екран „Прогрес" — графики

**Files:**
- Modify: `js/app.js` (render функции), `index.html` (canvas/grid контейнери)

**Interfaces:**
- Consumes: `days`, `events`, `settings`, `logic.js` функции; Chart.js глобал `Chart`.

- [ ] **Step 1: Календар-heatmap (30 дни)** — CSS grid 7 колони; всяка клетка = ден; два индикатора в клетка: горна половина (тай-чи: зелена при qualifies) и долна (чист ден: кехлибар); бъдещи дни — тъмни; днес — рамка. Tooltip (title attr): „Ден N: тай-чи Xм, Y цигари (таван Z)".

- [ ] **Step 2: Линия „цигари/ден срещу тавана"** — Chart.js line: dataset 1 = `cig_count_final` по дни (span gaps), dataset 2 = stepped line на `ceilingForDay` за дни 1–30. Цветове: данни --text, таван --accent2 dashed.

- [ ] **Step 3: Heatmap „гладове по час"** — CSS grid 24 колони × 2 реда (изпушени/устояни): интензитет на клетката = брой events в този час (алфа стъпки 0/.25/.5/.75/1 при 0/1/2/3/4+). Оцветяване: smoked → --danger, resisted → --accent.

- [ ] **Step 4: Барове тай-чи минути + линии сън/стрес/настроение** — Chart.js bar (минути по ден) и line chart с 3-те серии (1–5 скали).

- [ ] **Step 5: Ръчна проверка** — seed си 3–4 дни данни (през формите или SQL insert), виж 4-те визуализации; празно състояние (0 данни) не чупи нищо (guard: „Още няма данни — първият чекин ги запалва").

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: progress screen with charts and heatmaps"`

---

### Task 9: Екрани „Постижения" и „Данни"

**Files:**
- Modify: `js/app.js`, `index.html`, `css/style.css`

- [ ] **Step 1: Постижения** — грид от `computeBadges`: отключена = цветна карта (emoji + име + desc), заключена = сива с 🔒 + условието. Под тях „Живи метрики": 3 големи числа от `liveMetrics` (неизпушени цигари / спестени € / върнати часове = lifeMinutes÷60, 1 десетичен знак). Най-долу „Възстановяване на тялото": вертикална линия от `HEALTH_MILESTONES` — quitAt = `start_date + 20 дни, 00:00 локално`; преди Quit Day: „отключва се на Ден 21"; след: milestone-и с ✓ (достигнат, `now − quitAt ≥ minutes`) или оставащо време („след 3 дни").

- [ ] **Step 2: Данни** — бутон „Изтегли JSON" → `Blob` от `{ settings, days, events, exported_at }` → download `habit-navigator-export-YYYY-MM-DD.json`. Бутон „Изтегли CSV" → две изтегляния: `habit_days.csv` и `craving_events.csv` (заглавен ред + редове, запетаи, кавички около текстови полета). Секция „Настройки": цена/кутия, цигари/кутия, baseline, start_date (editable → `saveSettings`). Бутон „Изход" → `signOut()` → login екран.

- [ ] **Step 3: Ръчна проверка** — export файловете се отварят и съдържат данните; смяна на цена се отразява в „спестени €"; logout/login цикъл работи.

- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: achievements and data screens"`

---

### Task 10: README + GitHub + Pages deploy

**Files:**
- Create: `README.md`

- [ ] **Step 1: README.md** — секции: Какво е това (2 изречения + линк към спецификацията), Стек, Локален старт (`python3 -m http.server 8000`), Тестове (`node --test tests/`), Supabase setup (миграцията + създаване на потребител + изключване на signup — стъпките от Task 4), Deploy (push към main → Pages), Телефон (Safari/Chrome → Share → Add to Home Screen), Export на dataset-а.

- [ ] **Step 2: GitHub repo + Pages**

```bash
cd ~/code/habit-navigator
gh repo create habit-navigator --private --source=. --push
gh api repos/{owner}/habit-navigator/pages -X POST -f build_type=workflow 2>/dev/null \
  || gh api repos/{owner}/habit-navigator/pages -X POST -f "source[branch]=main" -f "source[path]=/"
```

**Внимание:** GitHub Pages на **private** repo изисква платен план. Ако акаунтът на Крис е free → питай го: (а) public repo (кодът няма тайни — anon key е публичен по дизайн) или (б) друг хостинг. Препоръка: public.

- [ ] **Step 3: Провери live URL** — `https://<owner>.github.io/habit-navigator/` зарежда, login работи от телефона на Крис, Add to Home Screen.

- [ ] **Step 4: Commit + push** — `git add -A && git commit -m "docs: README with setup and deploy" && git push`

---

### Task 11: End-to-end верификация

- [ ] **Step 1: RLS тест с втори потребител** — създай временен тест потребител в dashboard-а → login в incognito → вижда празно приложение (0 дни, 0 events, никакви данни на Крис). После го изтрий.

- [ ] **Step 2: Offline тест на живо** — телефон в airplane mode → 2 тапа → мрежа обратно → редовете пристигат, без дубликати (провери `select client_id, count(*) from craving_events group by 1 having count(*) > 1` → 0 реда).

- [ ] **Step 3: XP крос-проверка** — ръчно сметни XP за един пълен ден по таблицата от Global Constraints и сравни с показаното. Трябва да съвпада точно.

- [ ] **Step 4: Пусни всички тестове** — `node --test tests/` → всички PASS.

- [ ] **Step 5: Финален commit + push.** Кажи на Крис URL-а, напомни: (1) утре 6:00 — първи тай-чи + сутрешен чекин; (2) цигарите и запалката излизат от колата довечера; (3) паролата за dashboard-а е в неговия password manager.
