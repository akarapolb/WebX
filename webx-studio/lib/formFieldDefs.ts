// Field list + submit/track wiring per Form-block-eligible content type.
// Hand-duplicated verbatim from public-site/lib/formFieldDefs.ts (same
// convention as SLUGGED_PLURALS/interpolate() — these are two separate npm
// packages, no shared module boundary between them). Only the picker/
// preview here actually needs this (labels, field kinds, whether a type
// has tracking) — the real submit/track network logic lives in public-site.
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
  resultKey: "ref" | "username" | "id";
  submitEndpoint: string;
  submitMultipartEndpoint?: string;
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
  },
};
