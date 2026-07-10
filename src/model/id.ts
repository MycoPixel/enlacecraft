let counter = 1;

/** Monotonically increasing id, unique for the lifetime of the page. */
export function nextId(): string {
  return String(counter++);
}
