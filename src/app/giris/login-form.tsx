"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Field, buttonClass, inputClass } from "@/components/ui";
import { signIn, type SignInState } from "@/lib/actions";

const INITIAL: SignInState = { error: null };

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, INITIAL);
  const inactive = useSearchParams().get("pasif") === "1";
  const error = state.error ?? (inactive ? "Hesabınız aktif değil. Yöneticinizden hesabınızı açmasını isteyin." : null);

  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="E-posta">
        <input name="email" type="email" autoComplete="email" inputMode="email" required maxLength={254} className={inputClass} />
      </Field>
      <Field label="Şifre">
        <input name="password" type="password" autoComplete="current-password" required maxLength={128} className={inputClass} />
      </Field>
      {error && (
        <p role="alert" className="rounded-control bg-debt-soft px-3.5 py-2.5 text-small font-medium text-debt">
          {error}
        </p>
      )}
      <button type="submit" disabled={pending} className={buttonClass("primary", "mt-2 w-full")}>
        {pending ? "Giriş yapılıyor…" : "Giriş yap"}
      </button>
    </form>
  );
}
