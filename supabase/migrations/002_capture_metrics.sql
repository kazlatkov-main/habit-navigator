-- supabase/migrations/002_capture_metrics.sql
-- Capture-side metrics (spec: Метрики-за-проследяване-на-навик, principles 2/3/4/6):
--   emotion        — emotional state at the cue; decides which intervention fits
--                    (environment design vs reward revaluation). Nullable: bonus step.
--   satisfaction   — experienced reward AFTER smoking (1-5). Paired with intensity
--                    (craving BEFORE) it forms the extinction curve (RPE).
--   resist_worked  — did the craving drop after the substitute? (0 no / 1 partly /
--                    2 yes). Measures substitute effectiveness, not just presence.
--   taichi_automaticity — daily 1-5 self-report; the real build curve (~66-day
--                    line), separate brain system from enjoyment/quality.
alter table public.craving_events
  add column emotion text check (emotion in
    ('спокойствие','напрежение','скука','тъга','гняв','радост')),
  add column satisfaction int check (satisfaction between 1 and 5),
  add column resist_worked int check (resist_worked between 0 and 2);

alter table public.habit_days
  add column taichi_automaticity int check (taichi_automaticity between 1 and 5);
