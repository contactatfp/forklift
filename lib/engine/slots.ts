/**
 * One gate for every sandbox this process opens, across jobs. Solari caps
 * concurrent sessions per org (sandboxes and recording browsers share the cap),
 * and two floors started a minute apart would otherwise stampede create().
 */

type Waiter = () => void;

const globalSlots = globalThis as unknown as {
  forkliftSlots?: { inUse: number; queue: Waiter[] };
};

function slots() {
  if (!globalSlots.forkliftSlots) globalSlots.forkliftSlots = { inUse: 0, queue: [] };
  return globalSlots.forkliftSlots;
}

export function slotLimit(): number {
  return Math.max(1, Number(process.env.FORKLIFT_BAY_CONCURRENCY || 1) || 1);
}

export function slotsWaiting(): number {
  return slots().queue.length;
}

export async function withSlot<T>(onWait: (ahead: number) => void, fn: () => Promise<T>): Promise<T> {
  const s = slots();
  if (s.inUse >= slotLimit()) {
    onWait(s.queue.length);
    await new Promise<void>((resolve) => s.queue.push(resolve));
  }
  s.inUse += 1;
  try {
    return await fn();
  } finally {
    s.inUse -= 1;
    const next = s.queue.shift();
    if (next) next();
  }
}
