// WebX site kit — shown in place of a block that calls the CMS from the
// visitor's browser (AI assistant, feedback form) when the published copy has
// no reachable CMS (lib/publicCms.ts CMS_REACHABLE). Templates style it via
// `className` (default "wx-offline").
import type { Locale } from "@/lib/cms";

const NAMES = {
  assistant: { th: "ผู้ช่วย AI", en: "The AI assistant" },
  form: { th: "แบบฟอร์มความคิดเห็น", en: "The feedback form" },
};
const TEXT = {
  th: "ตัวอย่างสาธารณะนี้ไม่ได้เชื่อมต่อระบบ CMS จึงปิดฟังก์ชันนี้ไว้ ใช้งานได้บนระบบ WebX เต็มรูปแบบ",
  en: "This public preview runs without the CMS, so this feature is switched off. It works on the full WebX installation.",
};

export default function OfflineNote({ locale, what, className = "wx-offline", textClassName = "muted" }: {
  locale: Locale; what: "assistant" | "form"; className?: string; textClassName?: string;
}) {
  return (
    <div className={className} role="note">
      <h3>{NAMES[what][locale]}</h3>
      <p className={textClassName} style={{ margin: 0 }}>{TEXT[locale]}</p>
    </div>
  );
}
