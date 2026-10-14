import { route } from "@/lib/api/handler";
import { runJob } from "@/lib/jobs/runner";
import { runScan } from "@/lib/jobs/scan";
import { runSnapshot } from "@/lib/jobs/snapshot";

/** Manual "refresh now". The scheduled worker does this automatically. */
export const POST = route({ rateLimit: 4 }, async () => {
  const snapshot = await runJob("snapshot", () => runSnapshot());
  const scan = await runJob("scan", () => runScan());
  return { snapshot, scan };
});
