// Veri değişikliği yayını. Açık sayfa (dinleyici) varken saniyede bir veritabanı sürümüne bakan
// TEK paylaşılan döngü çalışır; kaç kişi bağlı olursa olsun tek sorgu. Sürüm değişince bütün
// dinleyicilere bildirilir. Dinleyici kalmayınca döngü durur.

import { dataVersion } from "@/lib/db";

type Listener = (version: number) => void;
type State = { listeners: Set<Listener>; version: number | null; timer: ReturnType<typeof setInterval> | null; busy: boolean };

const g = globalThis as unknown as { __ekmekciChanges?: State };
const state: State = (g.__ekmekciChanges ??= { listeners: new Set(), version: null, timer: null, busy: false });

const INTERVAL = 1000;

async function tick() {
  if (state.busy) return;
  state.busy = true;
  try {
    const v = await dataVersion();
    if (state.version !== null && v !== state.version) {
      state.version = v;
      for (const fn of state.listeners) fn(v);
    } else {
      state.version = v;
    }
  } catch (err) {
    console.error("[canli]", (err as Error).message);
  } finally {
    state.busy = false;
  }
}

/** Güncel sürüm (gerekirse hemen okunur). */
export async function currentVersion(): Promise<number> {
  if (state.version === null) await tick();
  return state.version ?? 0;
}

/** Değişiklik dinler; dönen fonksiyon dinlemeyi bırakır. */
export function subscribe(fn: Listener): () => void {
  state.listeners.add(fn);
  if (!state.timer) state.timer = setInterval(tick, INTERVAL);
  return () => {
    state.listeners.delete(fn);
    if (state.listeners.size === 0 && state.timer) {
      clearInterval(state.timer);
      state.timer = null;
      state.version = null; // yeniden başlayınca taban sürüm baştan okunur
    }
  };
}
