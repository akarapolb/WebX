"use client";
// Previously a bare <form> with no onSubmit — a real submit fell back to a
// GET against the current URL, putting the citizen's email into the address
// bar/history. This isn't wired to a real subscriber list yet (no such
// content type exists), so rather than fabricate a fake "subscribed!"
// message (the exact bug just fixed on the contact forms), it's honest
// about not being ready — which also, as a side effect, closes the leak.
import { useState, type FormEvent } from "react";

export default function NewsletterForm({ placeholder }: { placeholder: string }) {
  const [shown, setShown] = useState(false);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setShown(true);
  }

  return (
    <form className="newsletter" onSubmit={handleSubmit}>
      <input type="email" placeholder={placeholder} aria-label={placeholder} required />
      <button type="submit" aria-label="สมัครรับข่าวสาร">→</button>
      {shown && (
        <p role="status" style={{ width: "100%", fontSize: 12.5, opacity: 0.85, marginTop: 6 }}>
          ระบบสมัครรับข่าวสารทางอีเมลอยู่ระหว่างการพัฒนา ขออภัยในความไม่สะดวก
        </p>
      )}
    </form>
  );
}
