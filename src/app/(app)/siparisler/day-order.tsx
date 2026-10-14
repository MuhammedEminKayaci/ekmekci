"use client";

import { useState, useTransition } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDownAZ, ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import { toast } from "@/components/toast";
import { Button, cx } from "@/components/ui";
import { reorderDay } from "@/lib/actions";

type Item = { id: number; name: string };

/** Günün müşteri sırasını sürükle-bırak ya da ↑↓ ile düzenler; "Sırayı kaydet" ile yazar. */
export function DayOrder({ day, items, onClose }: { day: string; items: Item[]; onClose: () => void }) {
  const [list, setList] = useState(items);
  const [saving, start] = useTransition();
  const changed = list.some((it, i) => it.id !== items[i]?.id);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function move(from: number, to: number) {
    if (to < 0 || to >= list.length) return;
    setList((l) => arrayMove(l, from, to));
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = list.findIndex((x) => x.id === active.id);
    const to = list.findIndex((x) => x.id === over.id);
    move(from, to);
  }

  function save() {
    start(async () => {
      const res = await reorderDay(
        day,
        list.map((x) => x.id),
      );
      if (res.ok) {
        toast("Müşteri sırası kaydedildi.");
        onClose();
      } else toast(res.error, "error");
    });
  }

  return (
    <div className="animate-fade px-3 pb-4 sm:px-6 sm:pb-6">
      <div className="mb-4 flex flex-col gap-3 rounded-2xl bg-brand-soft/60 px-4 py-3 text-[0.9rem] text-ink-2 sm:flex-row sm:items-center sm:justify-between">
        <p>
          Müşteriyi soldaki <GripVertical size={15} className="inline align-[-2px]" /> tutamaktan tutup sürükleyin ya da
          sağdaki oklarla taşıyın. Bitince <b className="text-ink">Sırayı kaydet</b>&apos;e basın.
        </p>
        <button
          type="button"
          onClick={() => setList((l) => [...l].sort((a, b) => a.name.localeCompare(b.name, "tr")))}
          className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg px-2 py-1 text-[0.85rem] font-semibold text-brand-deep hover:bg-brand-soft sm:self-auto dark:text-brand"
        >
          <ArrowDownAZ size={16} /> A–Z sırala
        </button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={list.map((x) => x.id)} strategy={verticalListSortingStrategy}>
          <ol className="flex flex-col gap-2">
            {list.map((it, i) => (
              <SortableRow
                key={it.id}
                item={it}
                index={i}
                last={i === list.length - 1}
                onUp={() => move(i, i - 1)}
                onDown={() => move(i, i + 1)}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>

      <div className="neu sticky bottom-[calc(9.5rem+env(safe-area-inset-bottom))] z-20 mt-5 grid grid-cols-2 gap-2.5 rounded-2xl p-2.5 sm:flex sm:justify-end lg:bottom-20">
        <Button onClick={onClose} disabled={saving}>
          Vazgeç
        </Button>
        <Button variant="primary" onClick={save} disabled={saving || !changed}>
          {saving ? "Kaydediliyor…" : changed ? "Sırayı kaydet" : "Değişiklik yok"}
        </Button>
      </div>
    </div>
  );
}

function SortableRow({
  item,
  index,
  last,
  onUp,
  onDown,
}: {
  item: Item;
  index: number;
  last: boolean;
  onUp: () => void;
  onDown: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cx(
        "flex min-h-14 items-center gap-2 rounded-2xl pr-2 pl-1 sm:gap-3",
        isDragging ? "neu relative z-10 scale-[1.02] ring-2 ring-brand" : "neu-sm",
      )}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`${item.name} — sürükleyerek taşı`}
        className="grid size-11 shrink-0 cursor-grab touch-none place-items-center rounded-xl text-ink-3 hover:text-ink active:cursor-grabbing"
      >
        <GripVertical size={20} />
      </button>
      <span className="tnum grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft text-[0.85rem] font-bold text-brand-deep dark:text-brand">
        {index + 1}
      </span>
      <span className="min-w-0 flex-1 truncate text-[1rem] font-semibold">{item.name}</span>
      <span className="flex shrink-0 gap-1">
        <button
          type="button"
          onClick={onUp}
          disabled={index === 0}
          aria-label={`${item.name} yukarı taşı`}
          className="grid size-10 place-items-center rounded-xl text-ink-2 transition-colors hover:bg-brand-soft hover:text-ink disabled:opacity-30"
        >
          <ChevronUp size={20} />
        </button>
        <button
          type="button"
          onClick={onDown}
          disabled={last}
          aria-label={`${item.name} aşağı taşı`}
          className="grid size-10 place-items-center rounded-xl text-ink-2 transition-colors hover:bg-brand-soft hover:text-ink disabled:opacity-30"
        >
          <ChevronDown size={20} />
        </button>
      </span>
    </li>
  );
}
