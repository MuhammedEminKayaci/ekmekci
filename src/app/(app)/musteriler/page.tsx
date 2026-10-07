import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { CustomerList, type CustomerItem } from "./customer-list";

export const metadata: Metadata = { title: "Müşteriler" };

type Search = Promise<{ yeni?: string }>;

async function Customers({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase
    .from("customer_overview")
    .select("id, name, type, address, is_active, current_price, balance, last_entry_date")
    .order("name");

  return <CustomerList customers={(data ?? []) as CustomerItem[]} openNew={sp.yeni === "1"} />;
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <Skeleton className="h-12 w-60" />
        <Skeleton className="h-11 w-40" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-tile" />
        ))}
      </div>
      <Skeleton className="h-96 rounded-tile" />
    </div>
  );
}

export default function CustomersPage({ searchParams }: PageProps<"/musteriler">) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Customers searchParams={searchParams as Search} />
    </Suspense>
  );
}
