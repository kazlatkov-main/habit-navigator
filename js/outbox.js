// js/outbox.js — pure опашка; тап се записва локално ПЪРВО, после се изпраща.
export function createOutbox({ storage, send, key = 'outbox_v1' }) {
  const read = () => JSON.parse(storage.getItem(key) ?? '[]');
  const write = (q) => storage.setItem(key, JSON.stringify(q));

  async function flush() {
    let q = read();
    while (q.length) {
      try { await send(q[0]); } catch { break; }
      q = q.slice(1);
      write(q);
    }
  }

  return {
    async add(event) { write([...read(), event]); await flush(); },
    flush,
    pending: () => read().length,
  };
}
