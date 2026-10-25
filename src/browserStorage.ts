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

// The SDK reads and writes window.localStorage without a guard, so storage the browser refuses would throw inside it.
export function keepStorageUsable(): void {
  try {
    void window.localStorage;
  } catch {
    Object.defineProperty(window, "localStorage", { configurable: true, value: new MemoryStorage() });
  }
}
