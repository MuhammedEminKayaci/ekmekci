import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

// Giriş ve canlı güncelleme için. Giriş tarayıcıdan doğrudan Supabase'e yapıldığı için
// deneme sınırı her ziyaretçinin kendi adresine göre işler (sunucu adresine göre değil).
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
