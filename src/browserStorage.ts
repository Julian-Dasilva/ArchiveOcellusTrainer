export type SavedStorage = Pick<Storage, "getItem" | "setItem"> & Readonly<{ kept(): boolean }>;

const TAB_KEY = "archive-ocellus:tab-storage";

function tabValues(): Map<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(window.name);
  } catch {
    return new Map();
  }
  const values: unknown = typeof parsed === "object" && parsed !== null && TAB_KEY in parsed ? parsed[TAB_KEY] : null;
  if (typeof values !== "object" || values === null) return new Map();
  return new Map(Object.entries(values).flatMap(([key, value]) => (typeof value === "string" ? [[key, value] as const] : [])));
}

function writeTab(values: ReadonlyMap<string, string>): void {
  window.name = values.size === 0 ? "" : JSON.stringify({ [TAB_KEY]: Object.fromEntries(values) });
}

// window.name outlives the page's own reloads and navigations in this tab, and needs no Web Storage.
class TabStorage implements SavedStorage {
  readonly #trusted: Storage | null;

  constructor(trusted: Storage | null) {
    this.#trusted = trusted;
  }

  kept(): boolean {
    return this.#trusted !== null && tabValues().size === 0;
  }

  getItem(key: string): string | null {
    const tabbed = tabValues().get(key);
    if (tabbed !== undefined) return tabbed;
    try {
      return this.#trusted?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  setItem(key: string, value: string): void {
    const tab = tabValues();
    try {
      if (this.#trusted) {
        this.#trusted.setItem(key, value);
        tab.delete(key);
        writeTab(tab);
        return;
      }
    } catch {}
    writeTab(tab.set(key, value));
  }
}

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
    return new TabStorage(this.#trusted);
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
// The returned storage saves to the browser's own, or to this tab when the browser refuses, and says which.
export function keepStorageUsable(): SavedStorage {
  const storage = trustedStorage();
  if (storage instanceof PageStorage) return storage.saved();
  const page = new PageStorage(storage);
  Object.defineProperty(window, "localStorage", { configurable: true, value: page });
  return page.saved();
}
