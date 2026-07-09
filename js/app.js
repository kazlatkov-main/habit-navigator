// js/app.js — boot → auth → state → Днес екран + craving sheet + Прогрес (графики).
// Табовете Постижения/Данни са празни placeholder-и (Task 9).

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
  // Прогрес се пресъздава при всяко влизане в таба (виж destroyProgressCharts) —
  // покрива и „refresh() докато сме на прогрес" (renderAll → switchTab(state.tab)
  // винаги минава оттук), и „напускане/връщане" (следващ клик тук отново).
  if (tab === 'progress') renderProgress();
}

function renderPlaceholders() {
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
    cards.push(ctaCard('🌅 Сутрешен чекин', 'open-morning'));
  }
  if (afterEvening && !todayRow?.evening_done_at) {
    cards.push(ctaCard('🌙 Вечерен вход', 'open-evening-today'));
  }
  if (yesterdayDayNum >= 1 && !yesterdayRow?.evening_done_at) {
    cards.push(ctaCard('Попълни вчера', 'open-evening-yesterday'));
  }
  return cards.join('');
}

function ctaCard(label, action) {
  return `
    <div class="card cta-card">
      <span>${label}</span>
      <button type="button" class="btn-cta" data-action="${action}">Отвори</button>
    </div>`;
}

function renderOutboxBanner(pending) {
  return `<div class="outbox-banner">⏳ ${pending} тапа чакат връзка</div>`;
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
// Прогрес — render (Task 8)
//
// 4 визуализации: (1) календар-heatmap 30 дни (CSS grid), (2) Chart.js line
// цигари/ден срещу тавана, (3) heatmap гладове по час (CSS grid, локален час),
// (4) Chart.js bar тай-чи минути + Chart.js line сън/стрес/настроение.
//
// Chart.js lifecycle: DESTROY-BEFORE-RECREATE. renderProgress() е единствената
// точка, която (пре)създава Chart инстанции — при всяко влизане в таба
// (switchTab) и при всеки renderAll() докато табът вече е активен (refresh()).
// Първата стъпка на renderProgress() винаги е destroyProgressCharts(), преди
// да презапишем innerHTML-а (нови canvas елементи) — така никога няма повече
// от 1 жива Chart инстанция на canvas id и никога „Canvas is already in use".
// ============================================================

const progressCharts = { cigLine: null, taichiBar: null, wellbeing: null };

function destroyProgressCharts() {
  for (const key of Object.keys(progressCharts)) {
    progressCharts[key]?.destroy();
    progressCharts[key] = null;
  }
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Алфа стъпки 0/.25/.5/.75/1 при брой events 0/1/2/3/4+ (виж бриф).
function alphaForCount(n) {
  if (n <= 0) return 0;
  if (n === 1) return 0.25;
  if (n === 2) return 0.5;
  if (n === 3) return 0.75;
  return 1;
}

function renderProgress() {
  destroyProgressCharts();
  const container = document.getElementById('tab-progress');

  // Празно състояние: нито дневник, нито craving event — нищо за визуализация.
  const hasData = state.days.length > 0 || state.events.length > 0;
  if (!hasData) {
    container.innerHTML = '<div class="card placeholder"><p class="muted">Още няма данни — първият чекин ги запалва.</p></div>';
    return;
  }

  const start = state.settings.start_date;
  const dmap = daysMap(state.days);
  const dayNums = Array.from({ length: 30 }, (_, i) => i + 1);
  const dateForDayNum = (n) => shiftDay(start, n - 1); // ден 1 = start_date

  container.innerHTML = `
    <div class="card">
      <h3>Календар (30 дни)</h3>
      ${buildCalendarHeatmap(dayNums, dateForDayNum, dmap)}
    </div>
    <div class="card chart-card">
      <h3>Цигари/ден срещу тавана</h3>
      <div class="chart-wrap"><canvas id="chart-cig-line"></canvas></div>
    </div>
    <div class="card">
      <h3>Гладове по час</h3>
      ${buildCravingHeatmap(state.events)}
    </div>
    <div class="card chart-card">
      <h3>Тай-чи минути/ден</h3>
      <div class="chart-wrap"><canvas id="chart-taichi-bar"></canvas></div>
    </div>
    <div class="card chart-card">
      <h3>Сън / стрес / настроение</h3>
      <div class="chart-wrap"><canvas id="chart-wellbeing"></canvas></div>
    </div>`;

  createCigLineChart(dayNums, dateForDayNum, dmap);
  createTaichiBarChart(dayNums, dateForDayNum, dmap);
  createWellbeingChart(dayNums, dateForDayNum, dmap);
}

// ---------- Виз 1: календар-heatmap ----------
// Горна половина на клетката = тай-чи (taichiQualifies), долна = чист ден
// (cleanQualifies спрямо тавана за деня). Бъдещи дни са затъмнени; днес —
// рамка. Tooltip през title attr.
function buildCalendarHeatmap(dayNums, dateForDayNum, dmap) {
  const cells = dayNums.map((n) => {
    const dateStr = dateForDayNum(n);
    const row = dmap.get(dateStr);
    const isFuture = dateStr > today;
    const isToday = dateStr === today;
    const taichiOn = taichiQualifies(row);
    const cleanOn = cleanQualifies(row, n);
    const taichiMin = row?.taichi_minutes ?? 0;
    const cigLabel = (row?.cig_count_final ?? null) === null ? '—' : row.cig_count_final;
    const ceilingVal = ceilingForDay(n);
    const ceilingLabel = ceilingVal === null ? '—' : ceilingVal;
    const title = `Ден ${n}: тай-чи ${taichiMin}м, ${cigLabel} цигари (таван ${ceilingLabel})`;
    const cls = ['cal-cell'];
    if (isFuture) cls.push('future');
    if (isToday) cls.push('today');
    return `
      <div class="${cls.join(' ')}" title="${escapeAttr(title)}">
        <div class="cal-half cal-taichi${taichiOn ? ' on' : ''}"></div>
        <div class="cal-half cal-clean${cleanOn ? ' on' : ''}"></div>
      </div>`;
  });
  return `<div class="cal-grid">${cells.join('')}</div>`;
}

// ---------- Виз 3: heatmap гладове по час ----------
// Bucket по ЛОКАЛЕН час (new Date(ts).getHours()), не UTC — иначе тапове
// близо до полунощ биха паднали в грешния часови сегмент за потребителя.
function buildCravingHeatmap(events) {
  const smokedCounts = new Array(24).fill(0);
  const resistedCounts = new Array(24).fill(0);
  for (const e of events) {
    const hour = new Date(e.ts).getHours();
    if (e.kind === 'smoked') smokedCounts[hour]++;
    else if (e.kind === 'resisted') resistedCounts[hour]++;
  }
  const dangerHex = cssVar('--danger');
  const accentHex = cssVar('--accent');

  const rowHtml = (counts, hex, label) => counts.map((c, h) => {
    const bg = c > 0 ? hexToRgba(hex, alphaForCount(c)) : 'transparent';
    return `<div class="craving-cell" style="background:${bg}" title="${h}ч — ${label}: ${c}"></div>`;
  }).join('');

  const axisHtml = Array.from({ length: 24 }, (_, h) =>
    `<span>${[0, 6, 12, 18, 23].includes(h) ? h : ''}</span>`
  ).join('');

  return `
    <div class="craving-grid">
      ${rowHtml(smokedCounts, dangerHex, 'изпушени')}
      ${rowHtml(resistedCounts, accentHex, 'устояни')}
    </div>
    <div class="craving-axis">${axisHtml}</div>`;
}

// ---------- Виз 2: line цигари/ден срещу тавана ----------
function createCigLineChart(dayNums, dateForDayNum, dmap) {
  const canvas = document.getElementById('chart-cig-line');
  if (!canvas) return;
  const cigData = dayNums.map((n) => dmap.get(dateForDayNum(n))?.cig_count_final ?? null);
  const ceilingData = dayNums.map((n) => ceilingForDay(n));
  const textColor = cssVar('--text');
  const accent2 = cssVar('--accent2');
  const muted = cssVar('--muted');

  progressCharts.cigLine = new Chart(canvas, {
    type: 'line',
    data: {
      labels: dayNums,
      datasets: [
        { label: 'Цигари', data: cigData, spanGaps: true, borderColor: textColor,
          backgroundColor: textColor, pointRadius: 2, tension: 0.15 },
        { label: 'Таван', data: ceilingData, stepped: true, borderColor: accent2,
          borderDash: [6, 4], pointRadius: 0, backgroundColor: 'transparent' },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { title: { display: true, text: 'Ден', color: muted }, ticks: { color: muted }, grid: { color: '#2a3140' } },
        y: { beginAtZero: true, ticks: { color: muted }, grid: { color: '#2a3140' } },
      },
      plugins: { legend: { labels: { color: muted } } },
    },
  });
}

// ---------- Виз 4а: bar тай-чи минути ----------
function createTaichiBarChart(dayNums, dateForDayNum, dmap) {
  const canvas = document.getElementById('chart-taichi-bar');
  if (!canvas) return;
  const data = dayNums.map((n) => dmap.get(dateForDayNum(n))?.taichi_minutes ?? null);
  const accent = cssVar('--accent');
  const muted = cssVar('--muted');

  progressCharts.taichiBar = new Chart(canvas, {
    type: 'bar',
    data: { labels: dayNums, datasets: [{ label: 'Тай-чи мин', data, backgroundColor: accent }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { ticks: { color: muted }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: muted }, grid: { color: '#2a3140' } },
      },
      plugins: { legend: { display: false } },
    },
  });
}

// ---------- Виз 4б: line сън/стрес/настроение (1–5 скали) ----------
function createWellbeingChart(dayNums, dateForDayNum, dmap) {
  const canvas = document.getElementById('chart-wellbeing');
  if (!canvas) return;
  const seriesFor = (key) => dayNums.map((n) => dmap.get(dateForDayNum(n))?.[key] ?? null);
  const muted = cssVar('--muted');

  progressCharts.wellbeing = new Chart(canvas, {
    type: 'line',
    data: {
      labels: dayNums,
      datasets: [
        { label: 'Сън', data: seriesFor('sleep_quality'), spanGaps: true, borderColor: cssVar('--accent'), backgroundColor: 'transparent', pointRadius: 2 },
        { label: 'Стрес', data: seriesFor('stress'), spanGaps: true, borderColor: cssVar('--danger'), backgroundColor: 'transparent', pointRadius: 2 },
        { label: 'Настроение', data: seriesFor('mood'), spanGaps: true, borderColor: cssVar('--accent2'), backgroundColor: 'transparent', pointRadius: 2 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { ticks: { color: muted }, grid: { color: '#2a3140' } },
        y: { min: 1, max: 5, ticks: { color: muted, stepSize: 1 }, grid: { color: '#2a3140' } },
      },
      plugins: { legend: { labels: { color: muted } } },
    },
  });
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

// renderSheet() е общ dispatcher — насочва към правилния builder според
// state.sheet.kind. Всеки builder пише директно в #sheet-root.
function renderSheet() {
  const root = document.getElementById('sheet-root');
  if (!state.sheet) {
    root.innerHTML = '';
    return;
  }
  const { kind } = state.sheet;
  if (kind === 'resisted' || kind === 'smoked') {
    renderCravingSheet();
  } else if (kind === 'morning') {
    renderMorningSheet();
  } else if (kind === 'evening') {
    renderEveningSheet();
  }
}

function renderCravingSheet() {
  const root = document.getElementById('sheet-root');
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

// onSheetClick е общ dispatcher за всички sheet-ове (craving/morning/evening);
// затварянето е споделено, останалото се насочва по state.sheet.kind.
async function onSheetClick(e) {
  if (!state.sheet) return;
  const closeBtn = e.target.closest('[data-action="sheet-close"]');
  if (closeBtn) {
    closeSheet();
    return;
  }
  const { kind } = state.sheet;
  if (kind === 'resisted' || kind === 'smoked') {
    await onCravingSheetClick(e);
  } else if (kind === 'morning') {
    await onMorningSheetClick(e);
  } else if (kind === 'evening') {
    await onEveningSheetClick(e);
  }
}

async function onCravingSheetClick(e) {
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
// Сутрешен чекин — един sheet екран, тап-only (без клавиатура)
// ============================================================

const TAICHI_MIN_OPTIONS = [
  ['2', 2],
  ['5', 5],
  ['10', 10],
  ['15', 15],
  ['20+', 20],
  ['0 (пропуснах)', 0],
];

function openMorningSheet() {
  state.sheet = { kind: 'morning', values: {} };
  renderSheet();
}

function renderMorningSheet() {
  const root = document.getElementById('sheet-root');
  root.innerHTML = `
    <div class="sheet-backdrop" data-action="sheet-close"></div>
    <div class="sheet">
      <div class="sheet-head">
        <span class="sheet-kind morning">🌅 Сутрешен чекин</span>
        <button type="button" class="sheet-x" data-action="sheet-close">×</button>
      </div>
      <div class="sheet-body">${renderMorningBody()}</div>
    </div>`;
}

function renderMorningBody() {
  const v = state.sheet.values;
  // Качество на сесията и „състояние след" се показват само ако е избрано
  // ненулево тай-чи; при 0 (пропуснах) няма сесия, за която да се питаме.
  const showSessionFields = v.taichi_minutes !== undefined && v.taichi_minutes > 0;

  const minChips = TAICHI_MIN_OPTIONS.map(([label, value]) =>
    `<button type="button" class="chip${v.taichi_minutes === value ? ' selected' : ''}" data-chip="taichi_minutes" data-value="${value}">${label}</button>`
  ).join('');

  return `
    <div class="field-block">
      <h3>Тай-чи минути</h3>
      <div class="chip-grid">${minChips}</div>
    </div>
    ${showSessionFields ? dotsField('taichi_quality', 'Качество на сесията', v.taichi_quality) : ''}
    ${dotsField('state_before', 'Състояние преди', v.state_before)}
    ${showSessionFields ? dotsField('state_after', 'Състояние след', v.state_after) : ''}
    ${dotsField('sleep_quality', 'Сън снощи', v.sleep_quality)}
    ${dotsField('morning_craving', 'Глад при кафето без цигара', v.morning_craving)}
    ${dotsField('confidence', 'Увереност за тавана днес', v.confidence)}
    <button type="button" class="btn-big accent" data-action="sheet-done">Готово</button>`;
}

async function onMorningSheetClick(e) {
  const chip = e.target.closest('.chip[data-chip="taichi_minutes"]');
  if (chip) {
    const value = Number(chip.dataset.value);
    state.sheet.values.taichi_minutes = value;
    if (value === 0) {
      // Полетата, скрити при 0 минути — трием евентуално вече избрани
      // стойности, за да не изпратим остарели данни при „Готово".
      delete state.sheet.values.taichi_quality;
      delete state.sheet.values.state_after;
    }
    renderSheet(); // видимостта на quality/state_after зависи от избора тук
    return;
  }
  const dot = e.target.closest('.dot');
  if (dot) {
    setDotValue(dot);
    return;
  }
  const doneBtn = e.target.closest('[data-action="sheet-done"]');
  if (doneBtn) {
    await finalizeMorning();
  }
}

async function finalizeMorning() {
  const v = state.sheet.values;
  const patch = { morning_done_at: new Date().toISOString() };
  // Само докоснатите полета влизат в patch-а — недокоснати/скрити остават
  // непроменени (NULL) в habit_days, вместо да пишем остаряла стойност.
  for (const key of ['taichi_minutes', 'taichi_quality', 'state_before', 'state_after', 'sleep_quality', 'morning_craving', 'confidence']) {
    if (v[key] !== undefined) patch[key] = v[key];
  }
  try {
    await state.db.upsertDay(today, patch);
  } catch (err) {
    console.error('upsertDay (morning) failed', err);
    toast('Грешка при запис.');
    return;
  }
  closeSheet();
  toast('+XP');
  await refresh();
}

// ============================================================
// Вечерен вход — един sheet екран, приема dayStr (за „Попълни вчера")
// ============================================================

// Ръчно редактируемата история е ограничена до последните 48 ч
// (днес / вчера / по-вчера); по-стари дни остават read-only без CTA.
function isEditableDay(dayStr) {
  return dayStr >= shiftDay(today, -2);
}

function openEveningSheet(dayStr) {
  if (!isEditableDay(dayStr)) {
    toast('Този ден вече не може да се редактира.');
    return;
  }
  const preloadedCigCount = state.events.filter(
    (e) => e.kind === 'smoked' && localDay(e.ts) === dayStr
  ).length;
  const dayNum = dayNumber(state.settings.start_date, dayStr);
  const values = { cig_count_final: preloadedCigCount };
  if (dayNum >= 21) {
    values.withdrawal = { irritability: false, focus: false, hunger: false, other: false };
  }
  state.sheet = { kind: 'evening', dayStr, values };
  renderSheet();
}

function renderEveningSheet() {
  const root = document.getElementById('sheet-root');
  root.innerHTML = `
    <div class="sheet-backdrop" data-action="sheet-close"></div>
    <div class="sheet">
      <div class="sheet-head">
        <span class="sheet-kind evening">🌙 Вечерен вход</span>
        <button type="button" class="sheet-x" data-action="sheet-close">×</button>
      </div>
      <div class="sheet-body">${renderEveningBody()}</div>
    </div>`;
}

function renderEveningBody() {
  const v = state.sheet.values;
  const dayNum = dayNumber(state.settings.start_date, state.sheet.dayStr);
  const showWithdrawal = dayNum >= 21; // симптоми след деня на отказа (ден 21+)

  return `
    <div class="field-block">
      <h3>Цигари днес</h3>
      <div class="stepper">
        <button type="button" class="stepper-btn" data-action="cig-step" data-delta="-1">−</button>
        <span class="stepper-value" id="cig-count-value">${v.cig_count_final}</span>
        <button type="button" class="stepper-btn" data-action="cig-step" data-delta="1">+</button>
      </div>
    </div>
    ${dotsField('mood', 'Настроение', v.mood)}
    ${dotsField('stress', 'Стрес', v.stress)}
    <div class="field-block">
      <h3>Среда</h3>
      <div class="toggle-row">
        <button type="button" class="toggle${v.wife_smoked ? ' on' : ''}" data-toggle="wife_smoked">Жена ми пуши до мен</button>
        <button type="button" class="toggle${v.alcohol ? ' on' : ''}" data-toggle="alcohol">Алкохол</button>
      </div>
    </div>
    ${dotsField('identity_vote', 'Днес действах като непушач', v.identity_vote)}
    <label class="sheet-field">Най-труден момент
      <input type="text" class="sheet-input" data-field="hardest_moment" value="${escapeAttr(v.hardest_moment ?? '')}">
    </label>
    <label class="sheet-field">Какво помогна
      <input type="text" class="sheet-input" data-field="what_helped" value="${escapeAttr(v.what_helped ?? '')}">
    </label>
    ${showWithdrawal ? `
    <div class="field-block">
      <h3>Симптоми днес</h3>
      <div class="chip-grid">
        <button type="button" class="chip${v.withdrawal.irritability ? ' selected' : ''}" data-withdrawal="irritability">Раздразнителност</button>
        <button type="button" class="chip${v.withdrawal.focus ? ' selected' : ''}" data-withdrawal="focus">Трудна концентрация</button>
        <button type="button" class="chip${v.withdrawal.hunger ? ' selected' : ''}" data-withdrawal="hunger">Глад за храна</button>
        <button type="button" class="chip${v.withdrawal.other ? ' selected' : ''}" data-withdrawal="other">Друго</button>
      </div>
    </div>` : ''}
    <label class="sheet-field">Бележка (незадължително)
      <input type="text" class="sheet-input" data-field="note" value="${escapeAttr(v.note ?? '')}">
    </label>
    <button type="button" class="btn-big accent" data-action="sheet-done">Готово</button>`;
}

async function onEveningSheetClick(e) {
  const dot = e.target.closest('.dot');
  if (dot) {
    setDotValue(dot);
    return;
  }
  const stepBtn = e.target.closest('[data-action="cig-step"]');
  if (stepBtn) {
    const delta = Number(stepBtn.dataset.delta);
    const next = Math.max(0, (state.sheet.values.cig_count_final ?? 0) + delta);
    state.sheet.values.cig_count_final = next;
    const valueEl = document.getElementById('cig-count-value');
    if (valueEl) valueEl.textContent = String(next);
    return;
  }
  const toggleBtn = e.target.closest('.toggle[data-toggle]');
  if (toggleBtn) {
    const key = toggleBtn.dataset.toggle;
    const next = !(state.sheet.values[key] === true);
    state.sheet.values[key] = next;
    toggleBtn.classList.toggle('on', next);
    return;
  }
  const checkBtn = e.target.closest('.chip[data-withdrawal]');
  if (checkBtn) {
    const key = checkBtn.dataset.withdrawal;
    const next = !(state.sheet.values.withdrawal[key] === true);
    state.sheet.values.withdrawal[key] = next;
    checkBtn.classList.toggle('selected', next);
    return;
  }
  const doneBtn = e.target.closest('[data-action="sheet-done"]');
  if (doneBtn) {
    await finalizeEvening();
  }
}

// Текстовите полета (единствените с клавиатура в двете форми) се записват
// през делегиран 'input' listener на #sheet-root — вижте wireStaticListeners.
function onSheetInput(e) {
  if (!state.sheet) return;
  const field = e.target.dataset.field;
  if (!field) return;
  state.sheet.values[field] = e.target.value;
}

async function finalizeEvening() {
  const v = state.sheet.values;
  const dayStr = state.sheet.dayStr;
  const patch = {
    evening_done_at: new Date().toISOString(),
    cig_count_final: v.cig_count_final, // винаги предзаредено при отваряне, никога undefined
  };
  for (const key of ['mood', 'stress', 'wife_smoked', 'alcohol', 'identity_vote']) {
    if (v[key] !== undefined) patch[key] = v[key];
  }
  if (v.hardest_moment && v.hardest_moment.trim()) patch.hardest_moment = v.hardest_moment.trim();
  if (v.what_helped && v.what_helped.trim()) patch.what_helped = v.what_helped.trim();
  if (v.note && v.note.trim()) patch.note = v.note.trim();
  if (v.withdrawal !== undefined) patch.withdrawal = v.withdrawal; // само за dayNum >= 21
  try {
    await state.db.upsertDay(dayStr, patch);
  } catch (err) {
    console.error('upsertDay (evening) failed', err);
    toast('Грешка при запис.');
    return;
  }
  closeSheet();
  toast('+XP');
  await refresh();
}

// ============================================================
// Общи sheet помощни функции (morning + evening) — точки с група/предзаредена
// стойност и малка escape helper за текстовите value="" атрибути
// ============================================================

function dotsField(group, label, currentValue) {
  return `
    <div class="field-block" data-field="${group}">
      <h3>${label}</h3>
      <div class="dots5">${[1, 2, 3, 4, 5]
        .map((n) => `<button type="button" class="dot${currentValue && n <= currentValue ? ' filled' : ''}" data-value="${n}"></button>`)
        .join('')}</div>
    </div>`;
}

function setDotValue(dotEl) {
  const container = dotEl.closest('[data-field]');
  const group = container.dataset.field;
  const value = Number(dotEl.dataset.value);
  state.sheet.values[group] = value;
  container.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('filled', i < value));
}

function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

// ============================================================
// Event wiring
// ============================================================

function wireStaticListeners() {
  document.getElementById('login-form').addEventListener('submit', onLoginSubmit);
  document.getElementById('sheet-root').addEventListener('click', onSheetClick);
  document.getElementById('sheet-root').addEventListener('input', onSheetInput);
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
  const morningBtn = e.target.closest('[data-action="open-morning"]');
  if (morningBtn) {
    openMorningSheet();
    return;
  }
  const eveningTodayBtn = e.target.closest('[data-action="open-evening-today"]');
  if (eveningTodayBtn) {
    openEveningSheet(today);
    return;
  }
  const eveningYesterdayBtn = e.target.closest('[data-action="open-evening-yesterday"]');
  if (eveningYesterdayBtn) {
    openEveningSheet(shiftDay(today, -1));
    return;
  }
  const tabBtn = e.target.closest('#tabbar button[data-tab]');
  if (tabBtn) {
    switchTab(tabBtn.dataset.tab);
  }
}

document.addEventListener('DOMContentLoaded', boot);
