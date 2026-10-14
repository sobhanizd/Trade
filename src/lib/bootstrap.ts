import { ensureDefaultAssets } from "@/lib/market/assets";
import { syncStrategyDefinitions } from "@/lib/settings/service";

let done: Promise<void> | null = null;

/** Idempotent reference-data setup (default assets, strategy definitions). */
export function bootstrap() {
  if (!done) done = (async () => {
    await ensureDefaultAssets();
    await syncStrategyDefinitions();
  })().catch((e) => {
    done = null;
    throw e;
  });
  return done;
}
