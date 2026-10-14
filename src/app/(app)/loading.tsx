import { Skeleton } from "@/components/ui";
import type { Dict } from "@/lib/i18n";
import { getL } from "@/lib/i18n/server";

const L = {
  en: { loading: "Loading" },
  fa: { loading: "در حال بارگذاری" },
} satisfies Dict<unknown>;

export default async function Loading() {
  const t = await getL(L);
  return (
    <div className="space-y-4" aria-busy="true" aria-label={t.loading}>
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
      <Skeleton className="h-80" />
    </div>
  );
}
