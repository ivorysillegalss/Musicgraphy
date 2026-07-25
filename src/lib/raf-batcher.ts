type Fn = () => void;
let queued = new Set<Fn>();
let scheduled = false;

function flush() {
  scheduled = false;
  const copy = Array.from(queued);
  queued.clear();
  for (const fn of copy) fn();
}

export function schedule(fn: Fn) {
  queued.add(fn);
  if (!scheduled) {
    scheduled = true;
    requestAnimationFrame(flush);
  }
}

export default schedule;
