"use client";

import { useState, useTransition } from "react";
import { Plus, Power } from "lucide-react";
import { toast } from "@/components/toast";
import { Button, cx, inputClass } from "@/components/ui";
import { createDriver, renameDriver, setDriverActive } from "@/lib/actions";

type Driver = { id: number; name: string; is_owner: boolean; is_active: boolean };

/** Dağıtıcı ekle, adını değiştir, pasife al (silinmez: geçmiş kayıtlar korunur). */
export function DriversManage({ drivers }: { drivers: Driver[] }) {
  const [name, setName] = useState("");
  const [pending, start] = useTransition();

  function add(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await createDriver(name);
      if (res.ok) {
        toast(`${name.trim()} eklendi.`);
        setName("");
      } else toast(res.error, "error");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-small text-ink-2">
        Adı değiştirmek için üzerine yazın. Ayrılan şoförü pasife alın; geçmiş kayıtları silinmez.
      </p>
      <ul className="flex flex-col gap-2.5">
        {drivers.map((d) => (
          <DriverRow key={d.id} driver={d} />
        ))}
      </ul>
      <form onSubmit={add} className="flex gap-2.5">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          placeholder="Yeni şoför adı"
          aria-label="Yeni şoför adı"
          className={inputClass}
        />
        <Button type="submit" variant="primary" disabled={pending || !name.trim()} className="shrink-0">
          <Plus size={18} /> Ekle
        </Button>
      </form>
    </div>
  );
}

function DriverRow({ driver }: { driver: Driver }) {
  const [name, setName] = useState(driver.name);
  const [pending, start] = useTransition();

  function commit() {
    if (name.trim() === driver.name || !name.trim()) {
      setName(driver.name);
      return;
    }
    start(async () => {
      const res = await renameDriver(driver.id, name);
      if (res.ok) toast("Ad kaydedildi.");
      else {
        toast(res.error, "error");
        setName(driver.name);
      }
    });
  }

  return (
    <li className={cx("flex items-center gap-2.5 rounded-2xl p-2", driver.is_active ? "neu-sm" : "bg-bg-deep/60 opacity-70")}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
        maxLength={60}
        disabled={pending}
        aria-label={`${driver.name} adı`}
        className={cx(inputClass, "min-h-11 font-semibold")}
      />
      {driver.is_owner ? (
        <span className="shrink-0 rounded-full bg-brand-soft px-3 py-1.5 text-label font-semibold text-brand-deep dark:text-brand">
          İşletme
        </span>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await setDriverActive(driver.id, !driver.is_active);
              if (res.ok) toast(driver.is_active ? `${driver.name} pasife alındı.` : `${driver.name} tekrar aktif.`);
              else toast(res.error, "error");
            })
          }
          className={cx(
            "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-label font-semibold transition-colors",
            driver.is_active ? "text-ink-2 hover:bg-debt-soft hover:text-debt" : "text-brand-deep hover:bg-brand-soft",
          )}
        >
          <Power size={15} /> {driver.is_active ? "Pasife al" : "Aktifleştir"}
        </button>
      )}
    </li>
  );
}
