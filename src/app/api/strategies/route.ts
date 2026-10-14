import { route } from "@/lib/api/handler";
import { getStrategyConfigs } from "@/lib/settings/service";

export const GET = route({}, async ({ user }) => {
  const configs = await getStrategyConfigs(user.id);
  return {
    strategies: configs.map((c) => ({
      id: c.def.id, name: c.def.name, version: c.def.version, summary: c.def.summary, description: c.def.description, rules: c.def.rules,
      intendedTimeframes: c.def.intendedTimeframes, paramSpecs: c.def.params, enabled: c.enabled, params: c.params, timeframes: c.timeframes,
    })),
  };
});
