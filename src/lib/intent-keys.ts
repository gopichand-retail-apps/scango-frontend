// Stable intent keys (Stage B pattern): a key is created when the user confirms an intent, reused for every
// retry of that intent, replaced when its payload changes, and discarded after a confirmed result or when
// the session ends. Kept in memory only.
export interface IntentKeys {
  keyFor(kind: string, payload: unknown): string;
  confirm(kind: string): void;
  clear(): void;
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stable((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

export function createIntentKeys(newId: () => string = () => crypto.randomUUID()): IntentKeys {
  const pending = new Map<string, { fingerprint: string; key: string }>();
  return {
    keyFor(kind, payload) {
      const fingerprint = JSON.stringify(stable(payload));
      const current = pending.get(kind);
      if (current?.fingerprint === fingerprint) return current.key;
      const key = newId();
      pending.set(kind, { fingerprint, key });
      return key;
    },
    confirm(kind) {
      pending.delete(kind);
    },
    clear() {
      pending.clear();
    },
  };
}
