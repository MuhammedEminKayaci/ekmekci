// Ürün türü renkleri. Sınıflar tam yazılır ki Tailwind derlerken bulsun.
export const CATEGORY_COLORS = {
  amber: { label: "Sarı", dot: "bg-amber-500", chip: "bg-amber-500/14 text-amber-700 ring-amber-500/30 dark:text-amber-300" },
  emerald: { label: "Yeşil", dot: "bg-emerald-500", chip: "bg-emerald-500/14 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300" },
  sky: { label: "Mavi", dot: "bg-sky-500", chip: "bg-sky-500/14 text-sky-700 ring-sky-500/30 dark:text-sky-300" },
  violet: { label: "Mor", dot: "bg-violet-500", chip: "bg-violet-500/14 text-violet-700 ring-violet-500/30 dark:text-violet-300" },
  rose: { label: "Pembe", dot: "bg-rose-500", chip: "bg-rose-500/14 text-rose-700 ring-rose-500/30 dark:text-rose-300" },
  orange: { label: "Turuncu", dot: "bg-orange-500", chip: "bg-orange-500/14 text-orange-700 ring-orange-500/30 dark:text-orange-300" },
  teal: { label: "Turkuaz", dot: "bg-teal-500", chip: "bg-teal-500/14 text-teal-700 ring-teal-500/30 dark:text-teal-300" },
  indigo: { label: "Lacivert", dot: "bg-indigo-500", chip: "bg-indigo-500/14 text-indigo-700 ring-indigo-500/30 dark:text-indigo-300" },
  lime: { label: "Fıstık", dot: "bg-lime-500", chip: "bg-lime-500/16 text-lime-700 ring-lime-500/30 dark:text-lime-300" },
  fuchsia: { label: "Fuşya", dot: "bg-fuchsia-500", chip: "bg-fuchsia-500/14 text-fuchsia-700 ring-fuchsia-500/30 dark:text-fuchsia-300" },
} as const;

export type CategoryColor = keyof typeof CATEGORY_COLORS;
export const COLOR_KEYS = Object.keys(CATEGORY_COLORS) as CategoryColor[];

export function categoryColor(key: string | null | undefined) {
  return CATEGORY_COLORS[(key as CategoryColor) in CATEGORY_COLORS ? (key as CategoryColor) : "emerald"];
}
