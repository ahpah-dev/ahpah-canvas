export type FrameScheduler = {
  request: (callback: () => void) => number;
  cancel: (id: number) => void;
};

/** Keep the newest input, commit once per display frame, and never lose a gesture's last move. */
export function createFrameQueue<T>(consume: (value: T) => void, scheduler: FrameScheduler) {
  let frame: number | undefined;
  let pending: { value: T } | undefined;
  const flush = () => {
    if (frame !== undefined) scheduler.cancel(frame);
    frame = undefined;
    const next = pending;
    pending = undefined;
    if (next) consume(next.value);
  };
  return {
    push(value: T) {
      pending = { value };
      if (frame === undefined) frame = scheduler.request(flush);
    },
    flush,
    cancel() {
      if (frame !== undefined) scheduler.cancel(frame);
      frame = undefined;
      pending = undefined;
    },
  };
}

type PersistenceScheduler = {
  set: (callback: () => void, delay: number) => number;
  clear: (id: number) => void;
};

/** Serialize only changed keys after input settles, with a bounded save delay during streams. */
export function createDeferredPersistence(
  storage: Pick<Storage, "setItem">,
  scheduler: PersistenceScheduler,
  onResult: (failed: boolean) => void,
  { delay = 350, maxWait = 1500 } = {},
) {
  const pending = new Map<string, unknown>();
  const committed = new Map<string, unknown>();
  let trailing: number | undefined;
  let deadline: number | undefined;
  const clearTimers = () => {
    if (trailing !== undefined) scheduler.clear(trailing);
    if (deadline !== undefined) scheduler.clear(deadline);
    trailing = deadline = undefined;
  };
  const flush = () => {
    clearTimers();
    if (!pending.size) return;
    for (const [key, value] of pending) {
      try {
        storage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
        committed.set(key, value);
        pending.delete(key);
      } catch {
        // Keep failed snapshots available for the next edit or lifecycle flush.
      }
    }
    onResult(pending.size > 0);
  };
  return {
    schedule(key: string, value: unknown) {
      if (committed.has(key) && Object.is(committed.get(key), value)) {
        const reverted = pending.delete(key);
        if (reverted && !pending.size) {
          clearTimers();
          onResult(false);
        }
        return;
      }
      pending.set(key, value);
      if (trailing !== undefined) scheduler.clear(trailing);
      trailing = scheduler.set(flush, delay);
      if (deadline === undefined) deadline = scheduler.set(flush, maxWait);
    },
    flush,
    cancel: clearTimers,
  };
}

export function isNearScrollBottom(element: Pick<HTMLElement, "scrollHeight" | "scrollTop" | "clientHeight">) {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= 64;
}
