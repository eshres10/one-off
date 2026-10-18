/** Saves made while signed out live in localStorage until sign-in merges them into the account. */
const KEY = 'oneoff:saved';
const EVENT = 'oneoff:saved-change';

export function readLocalSaves(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function writeLocalSaves(ids: string[]) {
  try {
    if (ids.length) localStorage.setItem(KEY, JSON.stringify(ids.slice(0, 100)));
    else localStorage.removeItem(KEY);
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // Storage blocked: the save just won't persist.
  }
}

/** Toggles a local save and returns the new state. Newest first. */
export function toggleLocalSave(id: string): boolean {
  const list = readLocalSaves();
  const has = list.includes(id);
  writeLocalSaves(has ? list.filter((x) => x !== id) : [id, ...list]);
  return !has;
}

export function onLocalSavesChange(fn: () => void) {
  window.addEventListener(EVENT, fn);
  window.addEventListener('storage', fn);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener('storage', fn);
  };
}
