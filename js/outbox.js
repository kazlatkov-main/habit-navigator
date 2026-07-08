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

  return {
    async add(event) { write([...read(), event]); await flush(); },
    flush,
    pending: () => read().length,
  };
}
