const g = globalThis as unknown as { __secure?: Map<string, string> };
const store = (g.__secure ??= new Map());
export async function getItemAsync(k: string) { return store.get(k) ?? null; }
export async function setItemAsync(k: string, v: string) { store.set(k, v); }
export async function deleteItemAsync(k: string) { store.delete(k); }
