// js/app.js — boot → auth → state → Днес екран + craving sheet.
// Табовете Прогрес/Постижения/Данни са празни placeholder-и (Task 7–9).

import { createDb } from './db.js';
import {
  dayNumber,
  ceilingForDay,
  levelForXp,
  streak,
  taichiQualifies,
  cleanQualifies,
  daysMap,
  totalXp,
} from './logic.js';

// ============================================================
// Константи / речници (UI етикети ↔ snake стойности в БД)
// ============================================================

const today = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD, локална зона

const TRIGGERS = [
  ['Стрес', 'стрес'],
  ['Кафе', 'кафе'],
  ['След ядене', 'след_ядене'],
  ['Скука', 'скука'],
  ['Пауза работа', 'пауза_работа'],
  ['Шофиране', 'шофиране'],
  ['Жена ми запали', 'жена_ми_запали'],
  ['Алкохол', 'алкохол'],
  ['Друго', 'друго'],
];

const INSTEAD = [
  ['Дишане 60с', 'дишане_60с'],
  ['Отложих 10 мин', 'отложих_10мин'],
  ['Микро тай-чи', 'микро_тай_чи'],
  ['Чай/вода', 'чай_вода'],
  ['Отмина само', 'отмина_само'],
  ['Друго', 'друго'],
];

// ============================================================
// State
// ============================================================

const state = {
  db: null,
  settings: null,
  days: [],
  events: [],
  tab: 'today',
  sheet: null, // { kind, step, trigger, intensity, instead } | null
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function shiftDay(dateStr, n) {
  const t = Date.parse(dateStr + 'T00:00:00Z') + n * 24 * 60 * 60 * 1000;
  return new Date(t).toISOString().slice(0, 10);
}

// craving_events.ts е UTC timestamptz; „today" е локална календарна дата.
// Сравняваме по локалния ден на събитието, не по суров UTC slice — иначе
// тапове близо до полунощ (локално) биха попаднали в грешния ден при UTC+.
function localDay(isoTs) {
  return new Date(isoTs).toLocaleDateString('sv-SE');
}

// ============================================================
// Boot / auth
// ============================================================

async function boot() {
  renderPlaceholders();
  wireStaticListeners();

  state.db = await createDb();

  let session = null;
  try {
    session = await state.db.getSession();
  } catch (err) {
    console.error('getSession failed', err);
  }

  if (!session) {
    showLogin();
    return;
  }

  try {
    await refresh();
  } catch (err) {
    console.error('initial loadAll failed', err);
    showLogin();
  }
}

function showLogin() {
  document.getElementById('view-login').hidden = false;
  document.getElementById('view-app').hidden = true;
  document.getElementById('tabbar').hidden = true;
}

async function onLoginSubmit(e) {
  e.preventDefault();
  const errEl = document.getElementById('login-error');
  errEl.hidden = true;
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  try {
    await state.db.signIn(email, password); // резолвва {user, session}; не ни трябва тук, refresh() чете сесията индиректно
    await refresh();
  } catch (err) {
    console.error('signIn failed', err);
    errEl.textContent = 'Грешен имейл или парола.';
    errEl.hidden = false;
  }
}

// ============================================================
// Data refresh
// ============================================================

async function refresh() {
  const { settings, days, events } = await state.db.loadAll();
  state.settings = settings;
  state.days = days;
  state.events = events;
  renderAll();
}

function renderAll() {
  document.getElementById('view-login').hidden = true;
  document.getElementById('view-app').hidden = false;

  const needsOnboarding = !state.settings || !state.settings.start_date;
  document.getElementById('tabbar').hidden = needsOnboarding;

  if (needsOnboarding) {
    document.getElementById('tab-today').hidden = false;
    document.getElementById('tab-progress').hidden = true;
    document.getElementById('tab-achievements').hidden = true;
    document.getElementById('tab-data').hidden = true;
    renderOnboarding();
  } else {
    renderToday();
    switchTab(state.tab);
  }
}

// ============================================================
// Onboarding
// ============================================================

function renderOnboarding() {
  document.getElementById('tab-today').innerHTML = `
    <div class="card onboarding-card">
      <h2>Старт на плана</h2>
      <p class="muted" style="margin-bottom:14px;">Настройки за тавана и живите метрики. Може да се коригират после.</p>
      <form id="onboarding-form">
        <label class="field">Начална дата
          <input type="date" id="ob-start-date" value="2026-07-09" required>
        </label>
        <label class="field">Цена/кутия (€)
          <input type="number" id="ob-price" step="0.01" min="0" value="3.60" required>
        </label>
        <label class="field">Цигари/кутия
          <input type="number" id="ob-pack-size" step="1" min="1" value="20" required>
        </label>
        <label class="field">Базова линия (цигари/ден)
          <input type="number" id="ob-baseline" step="0.5" min="0" value="22.5" required>
        </label>
        <button type="submit" class="btn-big accent">Старт</button>
        <p id="onboarding-error" class="error-line" hidden></p>
      </form>
    </div>`;
  document.getElementById('onboarding-form').addEventListener('submit', onOnboardingSubmit);
}

async function onOnboardingSubmit(e) {
  e.preventDefault();
  const errEl = document.getElementById('onboarding-error');
  errEl.hidden = true;
  const patch = {
    start_date: document.getElementById('ob-start-date').value,
    pack_price_eur: parseFloat(document.getElementById('ob-price').value),
    cigs_per_pack: parseInt(document.getElementById('ob-pack-size').value, 10),
    baseline_cigs: parseFloat(document.getElementById('ob-baseline').value),
  };
  try {
    await state.db.saveSettings(patch);
    await refresh();
  } catch (err) {
    console.error('saveSettings failed', err);
    errEl.textContent = 'Грешка при запис: ' + (err?.message ?? String(err));
    errEl.hidden = false;
  }
}

// ============================================================
// Tabbar / tab switching
// ============================================================

function switchTab(tab) {
  state.tab = tab;
  for (const name of ['today', 'progress', 'achievements', 'data']) {
    document.getElementById(`tab-${name}`).hidden = name !== tab;
  }
  for (const btn of document.querySelectorAll('#tabbar button[data-tab]')) {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  }
}

function renderPlaceholders() {
  document.getElementById('tab-progress').innerHTML =
    '<div class="card placeholder"><p class="muted">Прогрес — предстои (Task 8).</p></div>';
  document.getElementById('tab-achievements').innerHTML =
    '<div class="card placeholder"><p class="muted">Постижения — предстои (Task 9).</p></div>';
  document.getElementById('tab-data').innerHTML =
    '<div class="card placeholder"><p class="muted">Данни — предстои (Task 9).</p></div>';
}

// ============================================================
// Днес — render
// ============================================================

function renderToday() {
  const container = document.getElementById('tab-today');
  const start = state.settings.start_date;
  const dayNum = dayNumber(start, today);

  const xp = totalXp(state.days, state.events, start);
  const level = levelForXp(xp);
  const xpPct = level.next
    ? Math.max(0, Math.min(100, ((xp - level.floor) / (level.next - level.floor)) * 100))
    : 100;

  const taichiStreak = streak(state.days, today, taichiQualifies, start);
  const cleanStreak = streak(state.days, today, cleanQualifies, start);

  const ceiling = ceilingForDay(dayNum);
  const smokedToday = state.events.filter(
    (e) => e.kind === 'smoked' && localDay(e.ts) === today
  ).length;

  const dmap = daysMap(state.days);
  const todayRow = dmap.get(today);
  const yesterday = shiftDay(today, -1);
  const yesterdayRow = dmap.get(yesterday);
  const yesterdayDayNum = dayNumber(start, yesterday);
  const afterEvening = new Date().getHours() >= 20;

  const pending = state.db.outboxPending();

  container.innerHTML = `
    ${renderHeader(dayNum, level, xp, xpPct)}
    ${renderStreaks(taichiStreak, cleanStreak)}
    ${renderCeilingCard(dayNum, ceiling, smokedToday)}
    ${renderBigActions()}
    ${renderCtaCards(todayRow, yesterdayRow, yesterdayDayNum, afterEvening)}
    ${pending > 0 ? renderOutboxBanner(pending) : ''}
  `;
}

function renderHeader(dayNum, level, xp, xpPct) {
  const xpLabel = level.next ? `${xp} / ${level.next} XP` : `${xp} XP (макс. ниво)`;
  return `
    <div class="card header-card">
      <div class="day-line">Ден ${dayNum} от 30</div>
      <div class="level-line">
        <span class="level-name">${level.name}</span>
        <span class="muted xp-num">${xpLabel}</span>
      </div>
      <div class="xp-bar-track"><div class="xp-bar-fill" style="width:${xpPct}%"></div></div>
    </div>`;
}

function renderStreaks(taichi, clean) {
  return `
    <div class="row streaks">
      <div class="card streak-box">
        <div class="streak-icon ${taichi === 0 ? 'dim' : ''}">🔥</div>
        <div class="streak-num">${taichi}</div>
        <div class="muted streak-label">Тай-чи: ${taichi} дни</div>
      </div>
      <div class="card streak-box">
        <div class="streak-icon ${clean === 0 ? 'dim' : ''}">🍃</div>
        <div class="streak-num">${clean}</div>
        <div class="muted streak-label">Чиста: ${clean} дни</div>
      </div>
    </div>`;
}

function renderCeilingCard(dayNum, ceiling, smokedToday) {
  if (ceiling === null) {
    return `
      <div class="card ceiling-card">
        <h3>Днешен таван</h3>
        <p class="muted">Планът все още не е започнал.</p>
      </div>`;
  }
  if (dayNum >= 21) {
    const m = dayNum - 20;
    return `
      <div class="card ceiling-card">
        <h3>Днешен таван</h3>
        <div class="quit-line">БЕЗ ДИМ — Ден след отказа №${m}</div>
        <p class="muted">Изпушени досега: ${smokedToday}</p>
      </div>`;
  }
  const pct = ceiling > 0 ? Math.min(100, (smokedToday / ceiling) * 100) : (smokedToday > 0 ? 100 : 0);
  const over = smokedToday > ceiling;
  return `
    <div class="card ceiling-card">
      <h3>Днешен таван</h3>
      <div class="ceiling-num">${smokedToday} / ${ceiling}</div>
      <p class="muted">Изпушени досега: ${smokedToday}</p>
      <div class="progress-track"><div class="progress-fill ${over ? 'over' : ''}" style="width:${pct}%"></div></div>
    </div>`;
}

function renderBigActions() {
  return `
    <div class="big-actions">
      <button type="button" class="btn-big accent" data-action="open-sheet" data-kind="resisted">УСТОЯХ</button>
      <button type="button" class="btn-big danger" data-action="open-sheet" data-kind="smoked">ИЗПУШИХ</button>
    </div>`;
}

function renderCtaCards(todayRow, yesterdayRow, yesterdayDayNum, afterEvening) {
  const cards = [];
  if (!todayRow?.morning_done_at) {
    cards.push(ctaCard('🌅 Сутрешен чекин'));
  }
  if (afterEvening && !todayRow?.evening_done_at) {
    cards.push(ctaCard('🌙 Вечерен вход'));
  }
  if (yesterdayDayNum >= 1 && !yesterdayRow?.evening_done_at) {
    cards.push(ctaCard('Попълни вчера'));
  }
  return cards.join('');
}

function ctaCard(label) {
  return `
    <div class="card cta-card">
      <span>${label}</span>
      <button type="button" class="btn-cta" data-action="cta-stub">Отвори</button>
    </div>`;
}

function renderOutboxBanner(pending) {
  return `<div class="outbox-banner">⏳ ${pending} тапа чакат връзка</div>`;
}

// CTA бутоните за сутрешен/вечерен чекин водят към форми, които се строят в Task 7.
// Тук само визуален stub, за да не се чупи потокът на екрана.
function handleCtaStub() {
  toast('Тази форма идва в следваща задача (Task 7).');
}

let toastTimer = null;
function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
}

// ============================================================
// Craving sheet — стъпков, автоматично напред
// ============================================================

function openSheet(kind) {
  state.sheet = { kind, step: 1, trigger: null, intensity: null, instead: null };
  renderSheet();
}

function closeSheet() {
  state.sheet = null;
  document.getElementById('sheet-root').innerHTML = '';
}

function renderSheet() {
  const root = document.getElementById('sheet-root');
  if (!state.sheet) {
    root.innerHTML = '';
    return;
  }
  const { kind, step } = state.sheet;
  const kindLabel = kind === 'resisted' ? 'УСТОЯХ' : 'ИЗПУШИХ';
  const totalSteps = kind === 'resisted' ? 3 : 2;

  let body = '';
  if (step === 1) {
    body = `<h3>Какво предизвика?</h3>${chipGrid(TRIGGERS, 'trigger')}`;
  } else if (step === 2) {
    body = `<h3>Колко силно?</h3>${dots5()}`;
  } else if (step === 3) {
    body = `<h3>Какво направи вместо?</h3>${chipGrid(INSTEAD, 'instead')}`;
  }

  root.innerHTML = `
    <div class="sheet-backdrop" data-action="sheet-close"></div>
    <div class="sheet">
      <div class="sheet-head">
        <span class="sheet-kind ${kind}">${kindLabel}</span>
        <span class="muted">${step}/${totalSteps}</span>
        <button type="button" class="sheet-x" data-action="sheet-close">×</button>
      </div>
      <div class="sheet-body">${body}</div>
    </div>`;
}

function chipGrid(items, group) {
  return `<div class="chip-grid">${items
    .map(([label, value]) => `<button type="button" class="chip" data-chip="${group}" data-value="${value}">${label}</button>`)
    .join('')}</div>`;
}

function dots5() {
  return `<div class="dots5">${[1, 2, 3, 4, 5]
    .map((n) => `<button type="button" class="dot" data-value="${n}"></button>`)
    .join('')}</div>`;
}

async function onSheetClick(e) {
  const closeBtn = e.target.closest('[data-action="sheet-close"]');
  if (closeBtn) {
    closeSheet();
    return;
  }
  const chip = e.target.closest('.chip');
  if (chip) {
    await handleChipTap(chip);
    return;
  }
  const dot = e.target.closest('.dot');
  if (dot) {
    await handleDotTap(dot);
  }
}

async function handleChipTap(el) {
  if (!state.sheet) return;
  const group = el.dataset.chip;
  const value = el.dataset.value;
  el.classList.add('selected');
  await wait(150);
  if (!state.sheet) return; // sheet може да е затворен междувременно
  if (group === 'trigger') {
    state.sheet.trigger = value;
    state.sheet.step = 2;
    renderSheet();
  } else if (group === 'instead') {
    state.sheet.instead = value;
    await finalizeSheet();
  }
}

async function handleDotTap(el) {
  if (!state.sheet) return;
  const value = Number(el.dataset.value);
  const dots = el.parentElement.querySelectorAll('.dot');
  dots.forEach((d, i) => d.classList.toggle('filled', i < value));
  await wait(150);
  if (!state.sheet) return;
  state.sheet.intensity = value;
  if (state.sheet.kind === 'resisted') {
    state.sheet.step = 3;
    renderSheet();
  } else {
    await finalizeSheet();
  }
}

async function finalizeSheet() {
  const { kind, trigger, intensity, instead } = state.sheet;
  const payload = { ts: new Date().toISOString(), kind, trigger, intensity };
  if (kind === 'resisted') payload.instead = instead;
  try {
    await state.db.addCraving(payload);
  } catch (err) {
    // addCraving пише локално в outbox-а първо, а send грешки се преглъщат вътрешно
    // (виж js/outbox.js) — тук стигаме само при наистина неочаквана грешка.
    console.error('addCraving failed', err);
  }
  if (kind === 'resisted') {
    showFlourish();
    await wait(700);
  }
  closeSheet();
  await refresh();
}

function showFlourish() {
  const body = document.querySelector('#sheet-root .sheet-body');
  if (body) body.innerHTML = '<div class="flourish">+5 XP</div>';
}

// ============================================================
// Event wiring
// ============================================================

function wireStaticListeners() {
  document.getElementById('login-form').addEventListener('submit', onLoginSubmit);
  document.getElementById('sheet-root').addEventListener('click', onSheetClick);
  document.addEventListener('click', onGlobalClick);

  // Лека периодична опресняваща на "Днес" (без мрежа) — държи outbox лентата
  // и CTA-тата (напр. „след 20:00") актуални без да чака следващ тап/смяна на таб.
  setInterval(() => {
    if (state.settings?.start_date && state.tab === 'today' && !document.getElementById('tab-today').hidden) {
      renderToday();
    }
  }, 5000);
}

function onGlobalClick(e) {
  const openBtn = e.target.closest('[data-action="open-sheet"]');
  if (openBtn) {
    openSheet(openBtn.dataset.kind);
    return;
  }
  const ctaBtn = e.target.closest('[data-action="cta-stub"]');
  if (ctaBtn) {
    handleCtaStub();
    return;
  }
  const tabBtn = e.target.closest('#tabbar button[data-tab]');
  if (tabBtn) {
    switchTab(tabBtn.dataset.tab);
  }
}

document.addEventListener('DOMContentLoaded', boot);
