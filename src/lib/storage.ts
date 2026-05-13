type StorageScope = "local" | "session";

function getStorage(scope: StorageScope): Storage | null {
  if (typeof window === "undefined") return null;
  return scope === "local" ? window.localStorage : window.sessionStorage;
}

export function readStorage(key: string, scope: StorageScope = "local"): string | null {
  try {
    return getStorage(scope)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string, scope: StorageScope = "local"): void {
  try {
    getStorage(scope)?.setItem(key, value);
  } catch {
    // no-op
  }
}

export function removeStorage(key: string, scope: StorageScope = "local"): void {
  try {
    getStorage(scope)?.removeItem(key);
  } catch {
    // no-op
  }
}
