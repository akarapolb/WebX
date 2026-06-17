/**
 * เส้นทาง Search / AI (สาธารณะ) — scope ตาม tenant โดย middleware
 */
export default {
  routes: [
    { method: 'GET', path: '/search', handler: 'search.search', config: { auth: false } },
    { method: 'GET', path: '/ai/answer', handler: 'search.answer', config: { auth: false } },
  ],
};
