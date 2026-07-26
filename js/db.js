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
    addCraving: async (event) => {
      const client_id = crypto.randomUUID();
      await outbox.add({ client_id, ...event });
      return client_id; // handle for the optional bonus update that may follow
    },
    // Bonus metrics arrive seconds after the tap. Ladder: server update first
    // (online the row is usually flushed by then); 0 rows → the event is still
    // queued → amend it locally; amend refused (flushed in between / head
    // mid-send) → one server retry. RLS scopes the update to own rows.
    updateCraving: async (client_id, extra) => {
      const upd = () => one(sb.from('craving_events').update(extra).eq('client_id', client_id).select('id'));
      try {
        if ((await upd()).length) return;
      } catch { /* offline — fall through to the local queue */ }
      if (outbox.amend(client_id, extra)) return;
      if (!(await upd()).length) throw new Error('craving event not found for bonus update');
    },
    outboxPending: () => outbox.pending(),
    flushOutbox: () => outbox.flush(),
  };
}
