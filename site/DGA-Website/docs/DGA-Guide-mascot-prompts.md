# DGA Guide — Mascot Prompt Pack (สำหรับ Midjourney / DALL·E / Firefly)

ใช้สร้างมาสคอต 3D จริง 1 ตัวหลัก + 8 ท่าทาง ในสไตล์เดียวกัน
> เคล็ดลับความต่อเนื่อง: สร้าง **ตัวหลัก** ก่อน เลือกภาพที่ชอบ แล้วใช้เป็น reference
> - Midjourney: ใส่ภาพ + `--cref <url> --cw 90 --sref <url>` ทุกท่า, ใช้ `--ar 1:1`
> - DALL·E/Firefly: ขึ้นต้นทุกท่าด้วย **STYLE BLOCK** เดิม แล้วต่อด้วยท่านั้น ๆ

---

## STYLE BLOCK (วางนำหน้าทุก prompt)
```
A high-quality 3D mascot character named "DGA Guide", a friendly and trustworthy digital
government information assistant for Thailand. Semi-human assistant (NOT a robot), warm and
approachable face, calm helpful expression, subtle Thai identity, gender-neutral, inclusive.
Smart professional civic outfit: deep navy blazer, white shirt, soft blue-gray tones, subtle
orange accents. Wears a digital ID badge with a small shield/search symbol. Clean premium
modern civic-technology style, rounded friendly forms, soft realistic studio lighting, smooth
matte 3D render, octane render quality. Color palette: deep navy blue, white, soft blue-gray,
subtle orange. Transparent background, full character visible, centered.
```

## NEGATIVE / ห้ามมี (ต่อท้าย หรือใส่ใน negative prompt)
```
no text, no letters, no speech bubble, no government logo, no cartoon child style, no anime,
no sci-fi robot, no toy-like mascot, no exaggerated futuristic design, no helmet, no cluttered
background, not creepy, no extra fingers, no distorted face.
```
Midjourney: `--no text, logo, robot, anime, toy, child` `--ar 1:1 --v 6.1 --style raw`

---

## 1) ภาพหลัก (Main Avatar)
`[STYLE BLOCK]` + 
```
Hero portrait, head-and-shoulders, facing forward with a gentle confident smile, looking at
the viewer, hands not visible. The definitive brand avatar. Subtle floating data-connection
nodes near the shoulders.
```

## 8 ท่าทางการใช้งาน (Action Set)
ใส่ `[STYLE BLOCK]` นำหน้าทุกท่า แล้วต่อด้วย:

1. **Greeting / Welcome** — `friendly welcoming pose, one hand raised in a warm wave, open posture, bright kind smile.`
2. **Searching** — `searching pose, holding a glowing magnifying-glass / search icon, curious focused expression, looking slightly to the side.`
3. **Explaining a service** — `explaining pose, one open hand presenting beside a floating document/service card icon, attentive friendly expression.`
4. **Recommending a service** — `recommending pose, pointing toward a highlighted floating app/service card with a small orange star or check, encouraging smile.`
5. **Trusted official information** — `reassuring pose, hand over chest near the ID badge, a soft glowing shield icon floating beside, calm trustworthy expression.`
6. **Helping user ask a question** — `inviting pose, gesturing toward the viewer with an open palm beside a floating question / chat icon, patient encouraging look.`
7. **Success / Completed** — `celebrating success pose, thumbs-up or gentle fist of approval, a floating green check-circle, happy satisfied smile.`
8. **Contact / Support** — `supportive pose, friendly gesture beside a floating headset / phone / mail icon, helpful caring expression.`

---

## การนำไปใช้บนเว็บ
- Export **PNG พื้นหลังโปร่ง** ขนาด ~512–1024px (ต่อท่า)
- วางที่ `assets/image/` เช่น `guide-main.png`, `guide-greeting.png`, `guide-search.png` …
- จุดที่ใช้ได้: avatar หัวแชต "DGA Guide", ปุ่มลอย "ถาม AI", สถานะแชต (ค้นหา/สำเร็จ),
  empty state, หน้า 404, แบนเนอร์ช่วยเหลือ
- ปัจจุบันเว็บใช้เวอร์ชัน `assets/image/dga-guide.svg` (วาดชั่วคราว) — แทนที่ด้วย PNG 3D ได้เลย
