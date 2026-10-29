export type SavedStorage = Pick<Storage, "getItem" | "setItem">;

const REFUSED: SavedStorage = {
  getItem: () => {
    throw new DOMException("This browser refuses storage", "SecurityError");
  },
  setItem: () => {
    throw new DOMException("This browser refuses storage", "SecurityError");
  },
};

class PageStorage implements Storage {
  [name: string]: unknown;
  readonly #trusted: Storage | null;
  readonly #unsaved = new Map<string, string | null>();

  constructor(trusted: Storage | null) {
    this.#trusted = trusted;
  }

  get length(): number {
    return this.#keys().length;
  }

  clear(): void {
    for (const key of this.#keys()) this.removeItem(key);
  }

  getItem(key: string): string | null {
    if (this.#unsaved.has(key)) return this.#unsaved.get(key) ?? null;
    return this.#trusted?.getItem(key) ?? null;
  }

  key(index: number): string | null {
    return this.#keys()[index] ?? null;
  }

  removeItem(key: string): void {
    this.#write(key, null, (trusted) => trusted.removeItem(key));
  }

  setItem(key: string, value: string): void {
    this.#write(key, String(value), (trusted) => trusted.setItem(key, String(value)));
  }

  #write(key: string, value: string | null, save: (trusted: Storage) => void): void {
    if (this.#trusted) {
      try {
        save(this.#trusted);
        this.#unsaved.delete(key);
        return;
      } catch {}
    }
    this.#unsaved.set(key, value);
  }

  saved(): SavedStorage {
    return this.#trusted ?? REFUSED;
  }

  #keys(): string[] {
    const keys = new Set<string>();
    const trusted = this.#trusted;
    for (let index = 0; trusted && index < trusted.length; index++) {
      const key = trusted.key(index);
      if (key !== null) keys.add(key);
    }
    for (const [key, value] of this.#unsaved) {
      if (value === null) keys.delete(key);
      else keys.add(key);
    }
    return [...keys];
  }
}

const PROBE_KEY = "archive-ocellus:storage-probe";

function trustedStorage(): Storage | null {
  try {
    const storage = window.localStorage;
    storage.setItem(PROBE_KEY, PROBE_KEY);
    const read = storage.getItem(PROBE_KEY);
    storage.removeItem(PROBE_KEY);
    return read === PROBE_KEY ? storage : null;
  } catch {
    return null;
  }
}

// The SDK reads and writes window.localStorage without a guard, so storage the browser refuses or has no room left in would throw inside it.
// The returned storage is the browser's own, which throws when it refuses, for a store that tells the player its saves won't be kept.
export function keepStorageUsable(): SavedStorage {
  const storage = trustedStorage();
  if (storage instanceof PageStorage) return storage.saved();
  const page = new PageStorage(storage);
  Object.defineProperty(window, "localStorage", { configurable: true, value: page });
  return page.saved();
}
