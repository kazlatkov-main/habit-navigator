// js/outbox.js — pure опашка; тап се записва локално ПЪРВО, после се изпраща.
export function createOutbox({ storage, send, key = 'outbox_v1' }) {
  const read = () => { try { const v = JSON.parse(storage.getItem(key) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
  const write = (q) => storage.setItem(key, JSON.stringify(q));

  let flushing = null;
  async function drain() {
    while (true) {
      const q = read();
      if (!q.length) return;
      try { await send(q[0]); } catch { return; }
      write(read().slice(1));
    }
  }
  function flush() {
    if (!flushing) flushing = drain().finally(() => { flushing = null; });
    return flushing;
  }

  // Merge extra fields into a still-queued event (bonus metrics arrive seconds
  // after the tap). Refuses the head while a flush is in flight — that entry may
  // already be sent server-side and about to dequeue, so a merge would be lost;
  // the caller falls back to a server-side update instead.
  function amend(clientId, extra) {
    const q = read();
    const i = q.findIndex((e) => e.client_id === clientId);
    if (i === -1) return false;
    if (i === 0 && flushing) return false;
    q[i] = { ...q[i], ...extra };
    write(q);
    return true;
  }

  return {
    async add(event) { write([...read(), event]); await flush(); },
    amend,
    flush,
    pending: () => read().length,
  };
}
