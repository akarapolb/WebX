/**
 * assist — PUBLIC AI helpers for the citizen-facing site (no login).
 * auth:false but the controller rate-limits per IP + degrades gracefully (503)
 * when no LLM gateway is configured. Provider-agnostic via LiteLLM.
 */
export default {
  routes: [
    { method: 'POST', path: '/assist/simplify', handler: 'assist.simplify', config: { auth: false } },
    { method: 'POST', path: '/assist/translate', handler: 'assist.translate', config: { auth: false } },
    { method: 'POST', path: '/assist/find', handler: 'assist.find', config: { auth: false } },
  ],
};
