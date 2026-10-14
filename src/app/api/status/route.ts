import { route } from "@/lib/api/handler";
import { getSystemStatus } from "@/lib/status";

export const GET = route({}, async () => getSystemStatus());
