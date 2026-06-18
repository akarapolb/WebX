/**
 * เส้นทางติดตามสถานะเรื่องร้องเรียน (สาธารณะ ค้นด้วย ref)
 */
export default {
  routes: [
    {
      method: 'GET',
      path: '/complaints/track/:ref',
      handler: 'complaint.track',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/complaints/submit',
      handler: 'complaint.submit',
      config: { auth: false },
    },
  ],
};
