class MemoryStorage implements Storage {
  [name: string]: unknown;
  readonly #items = new Map<string, string>();

  get length(): number {
    return this.#items.size;
  }

  clear(): void {
    this.#items.clear();
  }

  getItem(key: string): string | null {
    return this.#items.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.#items.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.#items.delete(key);
  }

  setItem(key: string, value: string): void {
    this.#items.set(key, String(value));
  }
}

const PROBE_KEY = "archive-ocellus:storage-probe";

// The SDK reads and writes window.localStorage without a guard, so storage the browser refuses or has no room left in would throw inside it.
export function keepStorageUsable(): void {
  try {
    const storage = window.localStorage;
    storage.setItem(PROBE_KEY, PROBE_KEY);
    const read = storage.getItem(PROBE_KEY);
    storage.removeItem(PROBE_KEY);
    if (read === PROBE_KEY) return;
  } catch {}
  Object.defineProperty(window, "localStorage", { configurable: true, value: new MemoryStorage() });
}
