"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field, buttonClass, inputClass } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    if (!email || !password) {
      setError("E-posta ve şifre gerekli.");
      return;
    }

    setPending(true);
    setError(null);
    const supabase = createClient();
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError || !data.user) {
      setPending(false);
      setError(
        authError?.status === 429
          ? "Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar deneyin."
          : "E-posta veya şifre hatalı.",
      );
      return;
    }

    // Pasif hesap verilere erişemez; içeri almadan çıkış yap ve nedenini söyle.
    const { data: profile } = await supabase.from("profiles").select("is_active").eq("id", data.user.id).maybeSingle();
    if (!profile?.is_active) {
      await supabase.auth.signOut();
      setPending(false);
      setError("Hesabınız henüz aktif değil. Yöneticinizden hesabınızı açmasını isteyin.");
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="E-posta">
        <input name="email" type="email" autoComplete="email" inputMode="email" required maxLength={254} className={inputClass} />
      </Field>
      <Field label="Şifre">
        <input name="password" type="password" autoComplete="current-password" required maxLength={128} className={inputClass} />
      </Field>
      {error && (
        <p role="alert" className="rounded-control bg-debt-soft px-3.5 py-2.5 text-[0.88rem] font-medium text-debt">
          {error}
        </p>
      )}
      <button type="submit" disabled={pending} className={buttonClass("primary", "mt-2 w-full")}>
        {pending ? "Giriş yapılıyor…" : "Giriş yap"}
      </button>
    </form>
  );
}
