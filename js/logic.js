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
