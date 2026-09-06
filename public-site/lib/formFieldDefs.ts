// Field list + submit/track wiring per Form-block-eligible content type.
// Hand-duplicated verbatim in webx-studio/lib/formFieldDefs.ts (same
// convention as SLUGGED_PLURALS/interpolate() — these are two separate npm
// packages, no shared module boundary between them). Which fields a form
// shows is fixed per content type here, NOT admin-configurable in the
// Visual Builder sidebar — matches block.faq's "framing config only"
// precedent (see strapi-cms/src/components/block/faq.json).
export type FormFieldKind = "text" | "email" | "tel" | "textarea" | "select" | "nid" | "file";

export type FormField = {
  key: string;
  label: string;
  kind: FormFieldKind;
  required: boolean;
  options?: { value: string; label: string }[];
  maxFileMB?: number;
};

export type FormTypeDef = {
  uid: string;
  pluralName: string;
  label: string;
  hasFile: boolean;
  fileFieldKey?: string;
  hasTracking: boolean;
  /** what the success screen shows: "ref"/"username" render a copyable reference, "id" is a plain thank-you */
  resultKey: "ref" | "username" | "id";
  submitEndpoint: string;
  submitMultipartEndpoint?: string;
  /** ":ref" placeholder, tenant-scoped like every other public API call — the caller must still append ?tenant=<key> */
  trackEndpoint?: string;
  isAnonymousToggleable?: boolean;
  fields: FormField[];
};

export const FORM_FIELD_DEFS: Record<string, FormTypeDef> = {
  "api::contact-message.contact-message": {
    uid: "api::contact-message.contact-message",
    pluralName: "contact-messages",
    label: "ติดต่อเรา",
    hasFile: false,
    hasTracking: false,
    resultKey: "id",
    submitEndpoint: "/api/contact-messages",
    fields: [
      { key: "name", label: "ชื่อ-นามสกุล", kind: "text", required: true },
      { key: "email", label: "อีเมล", kind: "email", required: true },
      { key: "phone", label: "โทรศัพท์", kind: "tel", required: false },
      { key: "subject", label: "หัวข้อ", kind: "text", required: true },
      { key: "message", label: "ข้อความ", kind: "textarea", required: true },
    ],
  },

  "api::complaint.complaint": {
    uid: "api::complaint.complaint",
    pluralName: "complaints",
    label: "ร้องเรียน / แจ้งเบาะแส",
    hasFile: true,
    fileFieldKey: "attachment",
    hasTracking: true,
    resultKey: "ref",
    submitEndpoint: "/api/complaints",
    submitMultipartEndpoint: "/api/complaints/submit",
    trackEndpoint: "/api/complaints/track/:ref",
    isAnonymousToggleable: true,
    fields: [
      {
        key: "type", label: "ประเภทเรื่อง", kind: "select", required: true,
        options: [
          { value: "บริการล่าช้า/ไม่ได้รับบริการ", label: "บริการล่าช้า / ไม่ได้รับบริการ" },
          { value: "พฤติกรรมเจ้าหน้าที่", label: "พฤติกรรมเจ้าหน้าที่" },
          { value: "ปัญหาระบบ/เว็บไซต์/แอป", label: "ปัญหาระบบ / เว็บ / แอป" },
          { value: "ข้อมูลส่วนบุคคล (PDPA)", label: "ข้อมูลส่วนบุคคล (PDPA)" },
          { value: "ทุจริต/ไม่โปร่งใส", label: "ทุจริต / ไม่โปร่งใส" },
          { value: "อื่นๆ", label: "อื่น ๆ" },
        ],
      },
      { key: "subject", label: "หัวข้อเรื่อง", kind: "text", required: true },
      { key: "detail", label: "รายละเอียด", kind: "textarea", required: true },
      { key: "name", label: "ชื่อ-นามสกุล", kind: "text", required: true },
      { key: "email", label: "อีเมล", kind: "email", required: true },
      { key: "phone", label: "โทรศัพท์", kind: "tel", required: false },
      { key: "attachment", label: "แนบไฟล์ (ถ้ามี)", kind: "file", required: false, maxFileMB: 5 },
    ],
    // `agency` intentionally NOT listed — strapi-cms/src/api/complaint/controllers/complaint.ts's
    // submit() (multipart/file-attached path) whitelists fields and silently drops it. Omitting it
    // here avoids a submission-dependent data-loss bug without touching the backend controller.
  },

  "api::application.application": {
    uid: "api::application.application",
    pluralName: "applications",
    label: "สมัครงาน",
    hasFile: true,
    fileFieldKey: "resume",
    hasTracking: true,
    resultKey: "ref",
    submitEndpoint: "/api/applications",
    submitMultipartEndpoint: "/api/applications/submit",
    trackEndpoint: "/api/applications/track/:ref",
    fields: [
      { key: "position", label: "ตำแหน่งที่สมัคร", kind: "text", required: true },
      { key: "jobId", label: "รหัสอ้างอิงตำแหน่งงาน (ถ้ามี)", kind: "text", required: false },
      { key: "name", label: "ชื่อ-นามสกุล", kind: "text", required: true },
      { key: "email", label: "อีเมล", kind: "email", required: true },
      { key: "phone", label: "โทรศัพท์", kind: "tel", required: true },
      { key: "note", label: "ข้อความเพิ่มเติม", kind: "textarea", required: false },
      { key: "resume", label: "แนบเรซูเม่ (ถ้ามี)", kind: "file", required: false, maxFileMB: 5 },
    ],
    // application.ts's submit() (multipart/resume-attached path) also drops `date` — same known,
    // accepted gap as complaint's `agency` above; track-mode may show a blank date in that case.
  },

  "api::registration.registration": {
    uid: "api::registration.registration",
    pluralName: "registrations",
    label: "ลงทะเบียนผู้ใช้งาน",
    hasFile: false,
    hasTracking: false,
    resultKey: "username",
    submitEndpoint: "/api/registrations",
    fields: [
      {
        key: "utype", label: "ประเภทผู้ใช้งาน", kind: "select", required: true,
        options: [
          { value: "ประชาชน", label: "ประชาชน" },
          { value: "เจ้าหน้าที่รัฐ", label: "เจ้าหน้าที่รัฐ" },
          { value: "นิติบุคคล", label: "นิติบุคคล" },
        ],
      },
      { key: "firstname", label: "ชื่อ", kind: "text", required: true },
      { key: "lastname", label: "นามสกุล", kind: "text", required: true },
      { key: "email", label: "อีเมล", kind: "email", required: true },
      { key: "phone", label: "โทรศัพท์", kind: "tel", required: true },
      { key: "nidMasked", label: "เลขประจำตัวประชาชน (13 หลัก)", kind: "nid", required: true },
    ],
    // No password field anywhere (lifecycles.ts always strips it server-side regardless) — no
    // account/credential flow is actually being created here, so v1 doesn't pretend to collect one.
  },
};

export const STAGE_LABELS = ["รับเรื่องแล้ว", "กำลังดำเนินการ", "กำลังดำเนินการ", "ดำเนินการเสร็จสิ้น"];

const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** matches site/DGA-Website/assets/complaint.js's own today() format — neither lifecycle sets this server-side */
export function todayTH(): string {
  const d = new Date();
  return d.getDate() + " " + TH_MONTHS[d.getMonth()] + " " + (d.getFullYear() + 543);
}

/** "1234567890123" -> "1-••••-•••••-••-3", matching register.js's exact masking format */
export function maskNid(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length !== 13) return "";
  return d[0] + "-••••-•••••-••-" + d[12];
}
