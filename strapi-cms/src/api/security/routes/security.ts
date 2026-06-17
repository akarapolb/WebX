/* เส้นทางความปลอดภัย (สาธารณะ): หน้า MFA gate + ออก CAPTCHA */
export default {
  routes: [
    { method: 'GET', path: '/mfa', handler: 'security.mfaPage', config: { auth: false } },
    { method: 'POST', path: '/mfa/verify', handler: 'security.mfaVerify', config: { auth: false } },
    { method: 'GET', path: '/captcha', handler: 'security.captcha', config: { auth: false } },
  ],
};
