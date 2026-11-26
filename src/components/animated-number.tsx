"use client";

import { useEffect, useRef, useState } from "react";
import { money, qty } from "@/lib/format";

/**
 * Sayı. İlk çizimde doğrudan son değer görünür (açılışta sayma animasyonu yok);
 * değer sonradan değişirse (ör. başka cihazdan gelen güncelleme) kısa bir geçişle yeni değere gider.
 */
export function AnimatedNumber({
  value,
  format = "money",
  duration = 280,
}: {
  value: number;
  format?: "money" | "qty";
  duration?: number;
}) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);

  useEffect(() => {
    const start = from.current;
    from.current = value;
    if (start === value) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = reduce ? 1 : Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(start + (value - start) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  // Geçiş sırasında kuruş titremesin: ara değerler tam sayı, son değer tam haliyle.
  const display = shown === value ? (format === "qty" ? Math.round(value) : value) : Math.round(shown);
  return <span className="tnum">{format === "qty" ? qty(display) : money(display)}</span>;
}
