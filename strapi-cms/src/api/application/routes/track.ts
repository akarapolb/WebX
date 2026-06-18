/**
 * เส้นทางตรวจสอบสถานะใบสมัคร (สาธารณะ ค้นด้วย ref)
 */
export default {
  routes: [
    {
      method: 'GET',
      path: '/applications/track/:ref',
      handler: 'application.track',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/applications/submit',
      handler: 'application.submit',
      config: { auth: false },
    },
  ],
};
