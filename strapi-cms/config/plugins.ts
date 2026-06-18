import type { Core } from '@strapi/strapi';

/**
 * Plugins config
 * upload — เปิดการบีบอัด/ปรับขนาดภาพอัตโนมัติ (TOR ภาคผนวก ก ข้อ 6.3 Image Optimization)
 *   • sizeOptimization: บีบอัดไฟล์ภาพให้เล็กลงอัตโนมัติ (sharp)
 *   • responsiveDimensions: สร้างภาพหลายขนาด (thumbnail/small/medium/large) ตาม breakpoints
 *   • autoOrientation: หมุนภาพตาม EXIF ให้ถูกทิศอัตโนมัติ
 *   → frontend เลือกใช้ขนาดที่เหมาะสม ลด LCP/แบนด์วิดท์ (ช่วยคะแนน Performance/Lighthouse ข้อ 4.1.6)
 */
const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Plugin => ({
  upload: {
    config: {
      sizeOptimization: true,
      responsiveDimensions: true,
      autoOrientation: true,
      breakpoints: {
        xlarge: 1920,
        large: 1000,
        medium: 750,
        small: 500,
        xsmall: 64,
      },
    },
  },
  // อีเมล: ใช้ SMTP จริงผ่าน nodemailer (TOR 13.5 Auto Email, 13.6 แจ้งเตือน admin)
  // ตั้งค่า SMTP_HOST/PORT/USER/PASS/FROM ใน .env ตอน production; ถ้าไม่ตั้ง ระบบจะ log แทน (ไม่ล้ม)
  email: {
    config: {
      provider: 'nodemailer',
      providerOptions: {
        host: env('SMTP_HOST', 'localhost'),
        port: env.int('SMTP_PORT', 587),
        secure: env.bool('SMTP_SECURE', false),
        auth: env('SMTP_USER') ? { user: env('SMTP_USER'), pass: env('SMTP_PASS') } : undefined,
        ignoreTLS: !env('SMTP_USER'),
      },
      settings: {
        defaultFrom: env('SMTP_FROM', 'no-reply@dga.or.th'),
        defaultReplyTo: env('SMTP_FROM', 'no-reply@dga.or.th'),
      },
    },
  },
});

export default config;
