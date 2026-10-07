"use client";

import { useSyncExternalStore } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";
import { cx } from "@/components/ui";

type Toast = { id: number; tone: "ok" | "error"; text: string };

let items: Toast[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Uygulamanın her yerinden kısa bildirim gösterir. */
export function toast(text: string, tone: Toast["tone"] = "ok") {
  const id = ++seq;
  items = [...items.slice(-2), { id, tone, text }];
  emit();
  setTimeout(() => {
    items = items.filter((t) => t.id !== id);
    emit();
  }, tone === "error" ? 6000 : 3200);
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

const EMPTY: Toast[] = [];

export function Toaster() {
  const list = useSyncExternalStore(subscribe, () => items, () => EMPTY);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(9rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4 lg:bottom-20"
    >
      {list.map((t) => (
        <div
          key={t.id}
          role={t.tone === "error" ? "alert" : "status"}
          className={cx(
            "neu animate-toast pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl px-4 py-3 text-[0.92rem] font-semibold",
            t.tone === "ok" ? "text-ink" : "text-debt",
          )}
        >
          {t.tone === "ok" ? (
            <CircleCheck size={20} className="shrink-0 text-brand" />
          ) : (
            <CircleAlert size={20} className="shrink-0" />
          )}
          {t.text}
        </div>
      ))}
    </div>
  );
}
