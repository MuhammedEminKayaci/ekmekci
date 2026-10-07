"use client";

import { useEffect, useRef, useState } from "react";
import { money, qty } from "@/lib/format";

/** Değer değiştiğinde yumuşakça sayarak yeni değere gider. */
export function AnimatedNumber({
  value,
  format = "money",
  duration = 900,
}: {
  value: number;
  format?: "money" | "qty";
  duration?: number;
}) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ms = reduce ? 0 : duration;
    const start = from.current;
    from.current = value;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = ms === 0 ? 1 : Math.min(1, (t - t0) / ms);
      const eased = 1 - Math.pow(1 - p, 4);
      setShown(start + (value - start) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  const rounded = format === "qty" ? Math.round(shown) : Math.round(shown * 100) / 100;
  // Animasyon sırasında kuruş titremesini önlemek için ara değerler tam sayı.
  const display = shown === value ? rounded : Math.round(shown);
  return <span className="tnum">{format === "qty" ? qty(display) : money(display)}</span>;
}
