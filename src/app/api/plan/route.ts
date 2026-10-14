import { route } from "@/lib/api/handler";
import { getPlanView } from "@/lib/plan/service";

export const GET = route({}, async ({ user }) => getPlanView(user.id));
