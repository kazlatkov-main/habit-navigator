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

  // onConflict изисква user_id в payload-а за conflict-detection при upsert.
  const uid = async () => (await sb.auth.getSession()).data.session.user.id;

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
    saveSettings: async (patch) => one(sb.from('settings').upsert({ user_id: await uid(), ...patch }, { onConflict: 'user_id' }).select().single()),
    upsertDay: async (day, patch) => one(sb.from('habit_days').upsert({ user_id: await uid(), day, ...patch }, { onConflict: 'user_id,day' }).select().single()),
    addCraving: (event) => outbox.add({ client_id: crypto.randomUUID(), ...event }),
    outboxPending: () => outbox.pending(),
    flushOutbox: () => outbox.flush(),
  };
}
