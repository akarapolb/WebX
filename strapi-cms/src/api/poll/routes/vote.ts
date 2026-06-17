/* เส้นทางโหวตโพล (สาธารณะ) */
export default {
  routes: [
    { method: 'POST', path: '/polls/:documentId/vote', handler: 'poll.vote', config: { auth: false } },
  ],
};
