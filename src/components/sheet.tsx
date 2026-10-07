"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/** Mobilde alttan açılan, masaüstünde ortada duran pencere (native <dialog>). */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="neu m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-tile p-0 text-ink sm:m-auto sm:max-w-lg sm:rounded-tile"
    >
      <div className="flex max-h-[92dvh] flex-col">
        <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3 sm:px-6">
          <h2 className="font-display text-[1.25rem] font-semibold tracking-tight">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="neu-sm grid size-10 place-items-center rounded-full text-ink-2 active:neu-pressed"
            aria-label="Kapat"
          >
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-6">
          {open && children}
        </div>
      </div>
    </dialog>
  );
}
