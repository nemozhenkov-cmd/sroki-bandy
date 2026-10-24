// At most one request runs at a time; a burst schedules one trailing refresh.
export function createRefreshQueue(run) {
  let running = null;
  let pending = null;
  return function refresh(key) {
    pending = key;
    if (!running) {
      running = Promise.resolve().then(async () => {
        try {
          while (pending !== null) {
            const next = pending;
            pending = null;
            await run(next);
          }
        } finally {
          running = null;
        }
      });
    }
    return running;
  };
}
