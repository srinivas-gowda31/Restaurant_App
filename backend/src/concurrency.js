// Runs fn over items with at most `limit` in flight at once — unbounded Promise.all against
// a free-tier API (HF router) or a burst of DB writes both tend to trip rate limits/latency
// spikes; a small worker pool keeps throughput high without hammering either.
export async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;

  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
