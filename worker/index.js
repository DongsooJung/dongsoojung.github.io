import { handlers } from './handlers.mjs';
import { handleRequest, runDailyCollect } from './platform.mjs';

export default {
  fetch(request, env) {
    return handleRequest(request, env, handlers);
  },
  async scheduled(_event, env) {
    const response = await runDailyCollect(env, handlers);
    if (!response.ok) throw new Error(`daily-collect HTTP ${response.status}`);
  },
};
