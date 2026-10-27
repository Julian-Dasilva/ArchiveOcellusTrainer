export function loadAttempts<T>(remaining: number, load: () => Promise<T>): Promise<T> {
  return load().catch((error: unknown) => {
    if (remaining <= 1) return Promise.reject(error);
    return loadAttempts(remaining - 1, load);
  });
}
