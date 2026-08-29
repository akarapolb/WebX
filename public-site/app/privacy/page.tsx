import type { Metadata } from "next";

// A single shared /privacy route — every tenant links here identically (the
// contact form's required PDPA consent checkbox, the cookie banner) and none
// of them had a page behind the link at all. Written to describe what this
// codebase actually collects and where it actually goes (contact-message
// rows via the contact form; consent-log rows via the cookie banner — see
// templates/orst/ContactInteractive.tsx and components/CookieConsent.tsx),
// not generic filler — a citizen ticking a "collected per this policy" box
// deserves a policy that describes the real system, not placeholder text.
export const metadata: Metadata = {
  title: "นโยบายความเป็นส่วนตัว",
  description: "นโยบายคุ้มครองข้อมูลส่วนบุคคล (PDPA) สำหรับผู้ใช้งานเว็บไซต์หน่วยงาน",
};

export default function PrivacyPage() {
  return (
    <main id="main-content" style={{ maxWidth: 760, margin: "0 auto", padding: "48px 24px 96px", lineHeight: 1.75, fontSize: 15.5 }}>
      <p style={{ fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase", color: "#767c86", marginBottom: 8 }}>
        Privacy Policy
      </p>
      <h1 style={{ fontSize: 32, marginBottom: 8 }}>นโยบายความเป็นส่วนตัวและการคุ้มครองข้อมูลส่วนบุคคล</h1>
      <p style={{ color: "#767c86", marginBottom: 40 }}>
        ปรับปรุงล่าสุด: สิงหาคม 2569 · จัดทำตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)
      </p>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 20, marginBottom: 10 }}>ข้อมูลที่เว็บไซต์นี้เก็บรวบรวม</h2>
        <p style={{ marginBottom: 12 }}>เว็บไซต์นี้เก็บรวบรวมข้อมูลส่วนบุคคลจากท่านในสองกรณีเท่านั้น:</p>
        <ul style={{ paddingLeft: 22, marginBottom: 12 }}>
          <li style={{ marginBottom: 8 }}>
            <b>เมื่อท่านกรอกแบบฟอร์มติดต่อเรา</b> — ชื่อ อีเมล เบอร์โทรศัพท์ (หากระบุ) เรื่องที่ติดต่อ และข้อความที่ท่านเขียน
            จะถูกส่งเข้าระบบหลังบ้านของหน่วยงานเพื่อให้เจ้าหน้าที่ติดต่อกลับตามช่องทางที่ท่านระบุ
          </li>
          <li>
            <b>เมื่อท่านเลือกการตั้งค่าคุกกี้</b> — ระบบจะบันทึกการตัดสินใจของท่าน (ยอมรับทั้งหมด/เฉพาะที่จำเป็น) พร้อมวันเวลา
            หน้าเว็บที่ท่านอยู่ และประเภทเบราว์เซอร์ เพื่อเป็นหลักฐานการขอความยินยอมตามที่กฎหมายกำหนด
          </li>
        </ul>
        <p>เว็บไซต์นี้ไม่เก็บรหัสผ่าน ข้อมูลบัตรเครดิต หรือข้อมูลอ่อนไหวใด ๆ จากผู้เยี่ยมชมทั่วไป</p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 20, marginBottom: 10 }}>วัตถุประสงค์ในการใช้ข้อมูล</h2>
        <p>
          ข้อมูลจากแบบฟอร์มติดต่อใช้เพื่อตอบคำถาม ดำเนินการตามคำร้อง หรือติดต่อกลับท่านเท่านั้น
          ข้อมูลความยินยอมคุกกี้ใช้เพื่อจดจำการตั้งค่าของท่านในการเข้าชมครั้งถัดไป และเป็นหลักฐานการขอความยินยอมตาม PDPA
          หน่วยงานจะไม่นำข้อมูลของท่านไปใช้เพื่อวัตถุประสงค์ทางการตลาด หรือเปิดเผยต่อบุคคลภายนอกที่ไม่เกี่ยวข้อง
          เว้นแต่กรณีที่กฎหมายกำหนด
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 20, marginBottom: 10 }}>ระยะเวลาการเก็บรักษาข้อมูล</h2>
        <p>
          ข้อความติดต่อจะถูกเก็บไว้เท่าที่จำเป็นต่อการดำเนินการตามคำร้องของท่านและเพื่อการตรวจสอบภายในหน่วยงาน
          หลังจากนั้นจะถูกลบหรือทำให้ไม่สามารถระบุตัวตนได้ตามรอบการจัดเก็บของหน่วยงาน
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 20, marginBottom: 10 }}>สิทธิของเจ้าของข้อมูลภายใต้ PDPA</h2>
        <p style={{ marginBottom: 12 }}>ท่านมีสิทธิ:</p>
        <ul style={{ paddingLeft: 22 }}>
          <li style={{ marginBottom: 6 }}>ขอเข้าถึงและขอรับสำเนาข้อมูลส่วนบุคคลของท่าน</li>
          <li style={{ marginBottom: 6 }}>ขอให้แก้ไขข้อมูลที่ไม่ถูกต้อง หรือลบข้อมูลของท่าน</li>
          <li style={{ marginBottom: 6 }}>ถอนความยินยอมที่เคยให้ไว้ ได้ตลอดเวลา</li>
          <li>ร้องเรียนต่อสำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคล หากเห็นว่าหน่วยงานไม่ปฏิบัติตามกฎหมาย</li>
        </ul>
      </section>

      <section>
        <h2 style={{ fontSize: 20, marginBottom: 10 }}>การใช้สิทธิและการติดต่อ</h2>
        <p>
          ท่านสามารถใช้สิทธิข้างต้น หรือสอบถามเกี่ยวกับการคุ้มครองข้อมูลส่วนบุคคลได้ผ่านช่องทาง "ติดต่อเรา"
          ของหน่วยงานที่ท่านกำลังติดต่อ ตามที่ระบุไว้ในเมนูหลักของเว็บไซต์
        </p>
      </section>
    </main>
  );
}
