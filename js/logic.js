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
