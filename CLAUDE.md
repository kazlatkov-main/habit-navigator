# Simplexity Habit — CLAUDE.md
*Last updated: 2026-07-16 · Owner: Kris Kazlatkov (kazlatkov@gmail.com)*

---

## A · What this folder is
**Simplexity Habit** — the customer-facing habit-change product (brand name). This repo is its running prototype, historically named **Habit-Navigator**: a gamified 30-day habit dashboard, built and live. It is the anti-dependency habit tool for KAN clients, and its first real dataset (Kris = client #1, tai-chi + quit-smoking). Stage: **live prototype, single real user, collecting data.**

Note: display/brand name is "Simplexity Habit"; the stable technical slug stays **`habit-navigator`** (repo, URL, Pinecone `project` tag) — do NOT rename the slug without a deliberate migration (it would force re-tagging + schema churn).

## B · The Goal
- **Why it exists:** give KAN clients a tool that builds autonomy, not dependency — a tracker that closes the loop (review → adapt), not just logs streaks. Product spec = the 5 maintenance pillars (see Memory Map).
- **Done looks like:** installable app (PWA) clients open in one tap; captures the habit-loop signals (cue/craving/response/reward) with graded friction; feeds a clean dataset back to the KAN platform.
- **Out of scope (now):** the customer RAG-bot (future — IDEA-041, needs curated public corpus + GDPR scoping); multi-habit generalization beyond the current tai-chi/smoking case.

## C · Stack
- **Frontend:** static site (GitHub Pages), no build step — `index.html` + ES modules; `supabase-js` v2 + Chart.js via CDN.
- **PWA:** installable (`manifest.webmanifest` + `icons/`); **no service worker yet** → offline-open not built (only "add to home screen").
- **Backend:** Supabase (Postgres + Auth + RLS "own rows only"). 3 tables: `craving_events` (append-only gold), `habit_days`, `settings`.
- **Domain logic:** pure ES modules (XP, streaks, badges, metrics, taper caps) with `node --test`.
- **Run locally** (path has a space — quote it):
  - Tests: `cd "$HOME/Desktop/Personal Projects/Simplexity-Habit" && node --test tests/logic.test.mjs`
  - Serve: `cd "$HOME/Desktop/Personal Projects/Simplexity-Habit" && python3 -m http.server 8000`
- **Key paths:** `index.html`, `js/`, `css/`, `tests/`, `supabase/`, `docs/superpowers/` (build spec + plan — historical, reference old `~/code` path).

## D · Decisions
*One line each.*
- `2026-07-09` — Open registration kept intentional (multi-user via RLS `auth.uid() = user_id`), not single-user.
- `2026-07-16` — Moved from `~/code/habit-navigator` to `~/Desktop/Personal Projects/Simplexity-Habit/`; same git repo (origin unchanged), display name → "Simplexity Habit", slug stays `habit-navigator`.
- `2026-07-16` — CLAUDE.md lives in the public repo (Kris approved) — no secrets here, only structure + pointers.

## E · Memory Map (the science lives in the wiki — this only points to it)
The habit science is **shared knowledge** in the Simplexity wiki (`~/Simplexity/wiki/vault/`), synced to Pinecone + graph-linked. This manual references it; it is NOT copied here (single source of truth).
- **Start here — cluster MOC:** `~/Simplexity/wiki/vault/Concepts/Simplexity-Habit-MOC.md`
- **Product spec (what to build):** `Методология-за-поддръжка.md` (5 pillars → app features), `Дизайн-на-дашборд-за-промяна-на-навик.md`, `Карта-на-навиците-Habit-Scorecard.md`, `Метрики-за-проследяване-на-навик.md`
- **Theory (why):** `Система-за-устойчиви-навици.md`, `Невробиология-на-навика.md`, `Стъпка-1..4-*.md`, `Поддръжка-1..5-*.md`
- **This product's wiki page:** `Simplexity/Habit-Navigator.md` · **The plan it tracks:** `Personal/Тай-чи и без цигари — 30-дневен план.md`
- **Query semantically:** `pinecone_cli.py query --project habit-navigator` (or skill `project-brief`).

## F · References
- **Repo (public):** github.com/kazlatkov-main/habit-navigator · **Live:** kazlatkov-main.github.io/habit-navigator
- **Supabase:** project holds `craving_events` / `habit_days` / `settings` (RLS).
- **Backlog:** `~/Business/Business/ideas.md` — IDEA-041 (customer RAG-bot chunking), IDEA-042 (auto-wrapup).

## G · Project-specific overrides
- **Language:** respond to Kris in Bulgarian; IT/AI terms in English. All code (names, comments) in English.
- **GDPR:** no client health data in the app's LLM prompts or in this repo. The future customer bot must use a **curated public corpus**, never the full wiki (personal/clinical/business-internal pages) — see IDEA-041.
- **Anti-dependency tone (KAN north star #1):** the app (and future bot) is a tool, not a substitute for the therapist, not a compliance crutch.
- **Project tag rule:** app-design wiki pages (Scorecard, Метрики, Дизайн-на-дашборд, Habit-Navigator, the plan) carry `project: [habit-navigator]`; the general habit science stays untagged (shared knowledge, reached by wikilink hop).
- **Path caveat:** folder path contains a space (`Personal Projects`) — always quote it in shell commands.
