import type { Metadata } from "next";
import { Brand } from "@/components/brand";
import { Credit } from "@/components/credit";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Giriş" };

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-[25rem]">
        <div className="mb-8 flex justify-center">
          <Brand />
        </div>
        <div className="neu rounded-tile p-6 sm:p-8">
          <h1 className="font-display text-[1.6rem] font-semibold tracking-tight">Giriş yap</h1>
          <p className="mt-1 mb-6 text-ink-2">Hesabınız yöneticiniz tarafından açılır.</p>
          <LoginForm />
        </div>
      </div>
      <Credit />
    </main>
  );
}
