export default {
  routes: [
    { method: 'GET', path: '/media-meta', handler: 'media-meta.list', config: { auth: false, policies: ['global::admin-only'] } },
    { method: 'PUT', path: '/media-meta/:id', handler: 'media-meta.update', config: { auth: false, policies: ['global::admin-only'] } },
    { method: 'DELETE', path: '/media-meta/:id', handler: 'media-meta.remove', config: { auth: false, policies: ['global::admin-only'] } },
  ],
};
