# Навигатор — Habit Navigator

30-дневен gamified habit dashboard за два навика едновременно: тай-чи всеки ден и отказване от цигари с taper график. Статичен сайт (без build стъпка), който говори директно със Supabase; целта е освен подкрепа за навика, да събере чист личен dataset за бъдеща habit платформа.

Пълна спецификация: [`docs/superpowers/specs/2026-07-08-habit-navigator-design.md`](docs/superpowers/specs/2026-07-08-habit-navigator-design.md).

## Стек

- **Frontend:** vanilla HTML/CSS/JS (ES modules), без build стъпка, mobile-first, тъмна тема, на български.
- **Графики:** Chart.js 4 (CDN).
- **Backend:** Supabase (Postgres + Auth + Row Level Security), през `supabase-js` v2 (CDN ESM).
- **Домейн логика:** чисти модули (`js/logic.js`, `js/outbox.js`), тествани с вградения Node test runner.
- **Хостинг:** GitHub Pages (статично).

Бързите тапове „Устоях/Изпуших" минават през localStorage outbox → не се губят при лоша мрежа; всеки носи `client_id` за dedup на сървъра.

## Локален старт

Няма build. Сервирай папката като статични файлове:

```bash
python3 -m http.server 8000
# отвори http://localhost:8000
```

## Тестове

Чистата логика (дни, тавани, XP, нива, вериги, значки, метрики, outbox) е покрита с `node --test`:

```bash
node --test tests/*.mjs
# или, от корена на repo-то: node --test
```

> Бележка: `node --test tests/` (директория като аргумент) е счупено на Node 25.x — интерпретира се като модул за зареждане. Използвай `node --test tests/*.mjs` или `node --test`.

## Supabase setup

Ако възстановяваш проекта от нулата:

1. **Проект:** създай нов Supabase проект (free tier е достатъчен).
2. **Схема:** приложи миграцията [`supabase/migrations/001_init.sql`](supabase/migrations/001_init.sql) (три таблици — `settings`, `habit_days`, `craving_events` — с CHECK ограничения, RLS включен и по една „own rows" политика на таблица).
3. **Config:** попълни `js/config.js` с `SUPABASE_URL` и `SUPABASE_ANON_KEY` (publishable / anon ключът е публичен по дизайн — RLS пази данните).
4. **Потребител (ръчно през Dashboard):** Authentication → Users → **Add user** → email + парола, **Auto Confirm User = ON**. После Authentication → Providers/Sign-In → **изключи** „Allow new users to sign up" (приложението е за един потребител).

## Deploy (GitHub Pages)

Repo-то е публично (кодът няма тайни — anon ключът е публичен по дизайн). Deploy = push към `main`:

```bash
git push
```

GitHub Pages сервира сайта от корена на `main`. Live адрес:

```
https://<owner>.github.io/habit-navigator/
```

## На телефона

Отвори live адреса в Safari (iOS) или Chrome (Android) → **Share / меню** → **Add to Home Screen**. Приложението стартира на цял екран, тъмна тема, готово за ежедневния чекин.

## Export на dataset-а

Таб **Данни**:

- **Изтегли JSON** → `habit-navigator-export-YYYY-MM-DD.json` (`{ settings, days, events, exported_at }`).
- **Изтегли CSV** → два файла: `habit_days.csv` и `craving_events.csv` (готови за анализ; текстовите полета са escape-нати по CSV правилата).
