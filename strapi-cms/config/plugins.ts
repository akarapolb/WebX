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
});

export default config;
