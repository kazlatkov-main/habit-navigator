# Свободна бележка в tap bonus sheet-а — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добави опционално свободнотекстово поле (`note`) към споделения bonus sheet на бързия тап, за да улови качествения контекст („защо") на всяко изпушване/устояване — без да пипа ≤10с core тапа.

**Architecture:** Bonus sheet-ът е споделен от „Изпуших" и „Устоях" (`renderBonusSheet`, `forKind`). Логиката за строене на bonus payload-а се извлича в чиста, тестваема функция `bonusExtra(forKind, values)` в `js/logic.js`; UI-ят (`finalizeBonus`) я вика. Текстът се записва в **съществуващата** колона `craving_events.note` през вече наличния път `updateCraving` (online: server UPDATE; offline: `outbox.amend`). Контекстът успех/неуспех идва от `kind` на реда — не се добавя отделен флаг.

**Tech Stack:** Vanilla ES modules, `node --test`, Supabase (supabase-js v2), без build стъпка.

## Global Constraints

- **Език:** UI текст на български; кодът (имена/коментари) на английски. ~1 EN на 100 BG в прозата.
- **Нула миграция, нула db.js промяна:** колоната `craving_events.note` съществува (миграция `001_init.sql`) и е в `CRAVING_EVENTS_COLUMNS` (CSV export). НЕ се добавя нова колона/флаг.
- **≤10с core тапът е неприкосновен:** полето живее само в опционалния bonus sheet (принцип №7 — триенето убива логването). Бележка-само (без emotion/satisfaction/resist_worked) също се записва.
- **`logic.js` е чист:** без DOM, без мрежа, без `Date.now()` в изчисленията — `bonusExtra` е чиста функция.
- **Съществуващите тестове остават зелени:** база = 24 logic + 9 outbox (`node --test`).
- **Path caveat:** папката съдържа интервал (`Personal Projects`) — кавички в shell команди.

## Design / Context (вместо отделен spec — малък обхват)

- **Обхват:** само bonus sheet-ът (една промяна покрива и двата тапа). Сутрешният чекин и вечерният вход НЕ се пипат (вечерният вече има `note` + `hardest_moment` + `what_helped`).
- **Формат:** `<textarea>` (по-голямо поле) — съзнателен избор за тази фаза (North Star: приоритет №1 е да учим системата на богати данни; по-късно се стеснява).
- **Контекстен промпт** (насочва правилното съдържание + кодира намерението на входа):
  - `smoked` → „Какво се случи? Какво го предизвика?"
  - `resisted` → „Какво ти помогна да устоиш?"
- **Съхранение „правилно" + анализ-готовност:** бележката каца на същия `craving_events` ред, който носи `kind` (smoked=неуспех / resisted=успех), `trigger`, `intensity`, `emotion`, `ts`. Анализ: `WHERE kind='resisted'` (успех) / `WHERE kind='smoked'` (неуспех).
- **Тестово покритие:** `bonusExtra` (нов unit тест — доказва правилно строене на payload-а вкл. `note`); offline merge на произволни extra полета е вече покрит от outbox тест #6; online UPDATE е тривиален Supabase `.update(extra)`. UI wiring (textarea → `onSheetInput` → `values.note`) се верифицира ръчно в браузър.
- **Извън обхват (YAGNI):** сутрешен note; отделен success/failure флаг (дублира `kind`); LLM-анализ на бележките (по-късен Тиер-1 „Преглед и адаптация").

---

## Task 1: Чиста функция `bonusExtra` (с `note`) + unit тестове

**Files:**
- Modify: `js/logic.js` (добавя export в края, преди последния ред)
- Test: `tests/logic.test.mjs` (добавя import + нов describe/тестове)

**Interfaces:**
- Produces: `bonusExtra(forKind: 'smoked'|'resisted', values: object) → object` — строи bonus payload-а: `emotion` ако е зададено; `satisfaction` само при `smoked`; `resist_worked` само при `resisted` (вкл. `0`); `note` ако е непразен след `trim()`. Връща `{}` ако нищо валидно.

- [ ] **Step 1: Напиши падащите тестове**

Добави в началото на `tests/logic.test.mjs` нов import ред (`test`/`assert` вече са импортирани там), после добави тестовете в края на файла:

```js
import { bonusExtra } from '../js/logic.js';

test('bonusExtra: note (smoked) се включва и се trim-ва', () => {
  assert.deepEqual(
    bonusExtra('smoked', { note: '  кафе + клиент закъсня  ' }),
    { note: 'кафе + клиент закъсня' },
  );
});

test('bonusExtra: note (resisted) се включва', () => {
  assert.deepEqual(bonusExtra('resisted', { note: 'излязох навън' }), { note: 'излязох навън' });
});

test('bonusExtra: празен/whitespace note се пропуска', () => {
  assert.deepEqual(bonusExtra('smoked', { note: '   ' }), {});
  assert.deepEqual(bonusExtra('smoked', {}), {});
});

test('bonusExtra: note се комбинира с emotion + satisfaction (smoked)', () => {
  assert.deepEqual(
    bonusExtra('smoked', { emotion: 'напрежение', satisfaction: 2, note: 'по навик' }),
    { emotion: 'напрежение', satisfaction: 2, note: 'по навик' },
  );
});

test('bonusExtra: resist_worked=0 се включва; satisfaction се игнорира при resisted', () => {
  assert.deepEqual(
    bonusExtra('resisted', { resist_worked: 0, satisfaction: 5, note: 'пих вода' }),
    { resist_worked: 0, note: 'пих вода' },
  );
});

test('bonusExtra: satisfaction само за smoked; resist_worked само за resisted', () => {
  assert.deepEqual(bonusExtra('smoked', { satisfaction: 3 }), { satisfaction: 3 });
  assert.deepEqual(bonusExtra('smoked', { resist_worked: 2 }), {});
  assert.deepEqual(bonusExtra('resisted', { satisfaction: 3 }), {});
});
```

- [ ] **Step 2: Пусни тестовете — увери се, че падат**

Run: `cd "$HOME/Desktop/Personal Projects/Simplexity-Habit" && node --test tests/logic.test.mjs`
Expected: FAIL — `SyntaxError` / `bonusExtra is not exported` (функцията още не съществува).

- [ ] **Step 3: Имплементирай `bonusExtra` в `js/logic.js`**

Добави преди края на файла (след `totalXp`):

```js
// Строи payload-а за bonus update-а от избраните стойности. Чиста функция —
// UI-ят (finalizeBonus) я вика; тестваема без DOM. `note` е свободен текст
// (контекст „защо"); контекстът успех/неуспех идва от kind на реда, не оттук.
export function bonusExtra(forKind, values = {}) {
  const extra = {};
  if (values.emotion) extra.emotion = values.emotion;
  if (forKind === 'smoked' && values.satisfaction) extra.satisfaction = values.satisfaction;
  if (forKind === 'resisted' && values.resist_worked !== undefined) extra.resist_worked = values.resist_worked;
  const note = values.note?.trim();
  if (note) extra.note = note;
  return extra;
}
```

- [ ] **Step 4: Пусни тестовете — увери се, че минават**

Run: `cd "$HOME/Desktop/Personal Projects/Simplexity-Habit" && node --test tests/logic.test.mjs`
Expected: PASS — всички (стари 24 + новите 6) зелени.

- [ ] **Step 5: Commit**

```bash
cd "$HOME/Desktop/Personal Projects/Simplexity-Habit"
git add js/logic.js tests/logic.test.mjs
git commit -m "feat(logic): bonusExtra pure fn with free-text note support"
```

---

## Task 2: Окабели `note` в bonus sheet-а (UI) + CSS + ръчна верификация

**Files:**
- Modify: `js/app.js` (import; `renderBonusSheet`; `finalizeBonus`)
- Modify: `css/style.css` (textarea правило)

**Interfaces:**
- Consumes: `bonusExtra(forKind, values)` от Task 1.
- UI: `<textarea data-field="note">` се улавя автоматично от съществуващия делегиран `onSheetInput` листенер (`state.sheet.values.note = e.target.value`); няма нова логика за улавяне.

- [ ] **Step 1: Импортирай `bonusExtra` в `js/app.js`**

Замени import блока от `./logic.js` (редове 4–16) така, че да включва `bonusExtra`:

```js
import {
  dayNumber,
  ceilingForDay,
  levelForXp,
  streak,
  taichiQualifies,
  cleanQualifies,
  daysMap,
  totalXp,
  computeBadges,
  liveMetrics,
  HEALTH_MILESTONES,
  bonusExtra,
} from './logic.js';
```

- [ ] **Step 2: Добави textarea + контекстен промпт в `renderBonusSheet`**

В `renderBonusSheet` (около ред 1103–1128), веднага след реда `const detail = forKind === 'smoked' ? ... : ...;`, добави:

```js
  const notePrompt = forKind === 'smoked'
    ? 'Какво се случи? Какво го предизвика?'
    : 'Какво ти помогна да устоиш?';
```

После, в template литерала, вмъкни `note` полето **между** `${detail}` и бутона `Запиши`:

```js
        ${detail}
        <label class="sheet-field">${notePrompt}
          <textarea class="sheet-input" data-field="note" rows="3" placeholder="по желание — няколко думи"></textarea>
        </label>
        <button type="button" class="btn-big accent" data-action="sheet-done">Запиши</button>
```

(textarea-та се рендира празна — bonus sheet-ът не се пре-рендира при input, така че няма нужда от escape на стойност.)

- [ ] **Step 3: Използвай `bonusExtra` във `finalizeBonus`**

В `finalizeBonus` (около ред 1151–1171) замени ръчното строене на `extra`:

```js
async function finalizeBonus() {
  if (state.sheet.submitting) return;
  state.sheet.submitting = true;
  const { clientId, forKind, values } = state.sheet;
  const extra = bonusExtra(forKind, values);
  if (!Object.keys(extra).length) {
    closeSheet(); // nothing picked — the core row is already saved
    return;
  }
  try {
    await state.db.updateCraving(clientId, extra);
    toast('Записано ✓');
  } catch (err) {
    console.error('bonus update failed', err);
    toast('Грешка при запис.');
  }
  closeSheet();
}
```

- [ ] **Step 4: Добави textarea CSS в `css/style.css`**

След правилото `.sheet-input:focus { ... }` (около ред 482) добави:

```css
textarea.sheet-input { min-height: 4.5rem; resize: vertical; line-height: 1.4; }
```

- [ ] **Step 5: Пусни целия тест пакет — увери се, че всичко е зелено**

Run: `cd "$HOME/Desktop/Personal Projects/Simplexity-Habit" && node --test`
Expected: PASS — 30 logic + 9 outbox (нищо счупено; app.js няма unit тестове).

- [ ] **Step 6: Ръчна верификация в браузър (end-to-end)**

```bash
cd "$HOME/Desktop/Personal Projects/Simplexity-Habit" && python3 -m http.server 8000
```
После в браузър на `http://localhost:8000`: login → тап **ИЗПУШИХ** → на bonus екрана виж промпта „Какво се случи? Какво го предизвика?" + textarea → напиши текст → **Запиши** (toast „Записано ✓"). Повтори за **УСТОЯХ** (промпт „Какво ти помогна да устоиш?").

Потвърди, че бележката е записана с правилния контекст — през Supabase заявка (проект `tyzceelibcdifboqbqze`):
```sql
select ts, kind, trigger, note
from craving_events
where note is not null
order by ts desc limit 5;
```
Expected: последните редове имат `note` = въведения текст, с `kind` = `smoked`/`resisted` според тапа. (Или през бутона „Износ JSON" в таб „Данни".)

- [ ] **Step 7: Commit**

```bash
cd "$HOME/Desktop/Personal Projects/Simplexity-Habit"
git add js/app.js css/style.css
git commit -m "feat(ui): optional free-text note in tap bonus sheet (context-aware prompt)"
```

---

## Забележки за изпълнителя

- **Двата пътя на записа вече работят** (нищо за пипане в db.js): online → `updateCraving` прави `sb.from('craving_events').update(extra)`; offline → `outbox.amend(clientId, extra)` merge-ва `note` в чакащия ред, после `insert` при flush. Идемпотентно през `unique(user_id, client_id)`.
- **Ако Step 6 SQL върне празно** докато си offline — редът чака в outbox-а; върни мрежата (или изчакай 60с auto-flush) и провери пак.
- **Не разширявай обхвата** — сутрешен note, отделен флаг, textarea в core тапа = извън тази стъпка (виж Global Constraints / Design).
