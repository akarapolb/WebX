# -*- coding: utf-8 -*-
"""
build_deck.py — สร้างชุดนำเสนอ (.pptx) ประมูลโครงการเว็บไซต์ สพร./DGA (TOR DGA-69-0177)
ออกแบบให้ "ทุกสไลด์ผูกกับเกณฑ์ให้คะแนน TOR ข้อ 6.1" (กลยุทธ์เดียวกับ deck ที่ชนะของ GSB)
ธีม: DGA Design System (Kanit/Ubuntu, brand #EE5020, navy #13497A) — vector ล้วน แก้ไขได้
รัน: python build_deck.py  ->  dga_presentation_th.pptx
"""
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_AUTO_SIZE
from pptx.oxml.ns import qn

# ----------------------------------------------------------------------------
# Design tokens (ตรงกับ assets/design-system.css)
# ----------------------------------------------------------------------------
BRAND   = RGBColor(0xEE, 0x50, 0x20)   # ส้มอัตลักษณ์ DGA
BRAND2  = RGBColor(0xD6, 0x3B, 0x12)
ACTION  = RGBColor(0xC2, 0x41, 0x0C)
NAVY    = RGBColor(0x13, 0x49, 0x7A)   # secondary / focus
INK     = RGBColor(0x18, 0x18, 0x1B)   # ตัวอักษรหลัก
MUTED   = RGBColor(0x5B, 0x5F, 0x66)
INVERT  = RGBColor(0xFF, 0xFF, 0xFF)
BG      = RGBColor(0xFA, 0xFA, 0xF8)
SURFACE = RGBColor(0xFF, 0xFF, 0xFF)
SUNKEN  = RGBColor(0xF5, 0xF4, 0xF0)
BORDER  = RGBColor(0xEC, 0xEA, 0xE6)
BORDERS = RGBColor(0xDC, 0xD8, 0xD1)
OK      = RGBColor(0x1E, 0x7B, 0x34)
WARN    = RGBColor(0x8A, 0x5A, 0x00)
DANGER  = RGBColor(0xB3, 0x26, 0x1E)
DARK1   = RGBColor(0x1C, 0x1D, 0x22)   # hero dark
DARK2   = RGBColor(0x11, 0x12, 0x16)
TINT    = RGBColor(0xFF, 0xF3, 0xEC)   # primary-50
INFOBG  = RGBColor(0xE7, 0xEE, 0xF8)

FTH = "Kanit"      # ไทย (ค่าเริ่มต้น)
FEN = "Ubuntu"     # อังกฤษ / โค้ด

EMU_IN = 914400
prs = Presentation()
prs.slide_width  = Inches(13.333)
prs.slide_height = Inches(7.5)
SW, SH = 13.333, 7.5
BLANK = prs.slide_layouts[6]

# ----------------------------------------------------------------------------
# helpers
# ----------------------------------------------------------------------------
def slide(bg=BG):
    s = prs.slides.add_slide(BLANK)
    r = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, prs.slide_width, prs.slide_height)
    r.fill.solid(); r.fill.fore_color.rgb = bg
    r.line.fill.background()
    r.shadow.inherit = False
    return s

def rect(s, x, y, w, h, fill=None, line=None, lw=1.0, shape=MSO_SHAPE.RECTANGLE, rad=None):
    sp = s.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
    if fill is None:
        sp.fill.background()
    else:
        sp.fill.solid(); sp.fill.fore_color.rgb = fill
    if line is None:
        sp.line.fill.background()
    else:
        sp.line.color.rgb = line; sp.line.width = Pt(lw)
    sp.shadow.inherit = False
    if rad is not None and shape == MSO_SHAPE.ROUNDED_RECTANGLE:
        try: sp.adjustments[0] = rad
        except Exception: pass
    return sp

def text(s, x, y, w, h, runs, size=14, color=INK, bold=False, font=FTH,
         align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP, sp_after=2, line=1.12, wrap=True):
    """runs: str  หรือ list ของ (str, dict-override)  หรือ list ของบรรทัด(list/str)"""
    tb = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame; tf.word_wrap = wrap
    tf.vertical_anchor = anchor
    tf.margin_left = 0; tf.margin_right = 0; tf.margin_top = 0; tf.margin_bottom = 0
    if isinstance(runs, str):
        runs = [runs]
    first = True
    for ln in runs:
        p = tf.paragraphs[0] if first else tf.add_paragraph()
        first = False
        p.alignment = align
        p.space_after = Pt(sp_after); p.space_before = Pt(0)
        try: p.line_spacing = line
        except Exception: pass
        parts = ln if isinstance(ln, list) else [ln]
        for part in parts:
            if isinstance(part, tuple):
                t, o = part
            else:
                t, o = part, {}
            r = p.add_run(); r.text = t
            f = r.font
            f.size = Pt(o.get("size", size))
            f.bold = o.get("bold", bold)
            f.name = o.get("font", font)
            f.color.rgb = o.get("color", color)
            if o.get("italic"): f.italic = True
            # ฝังชื่อฟอนต์ให้ครอบคลุม latin+complex-script
            rPr = r._r.get_or_add_rPr()
            for tag in ("latin", "ea", "cs"):
                e = rPr.find(qn("a:"+tag))
                if e is None:
                    e = rPr.makeelement(qn("a:"+tag), {}); rPr.append(e)
                e.set("typeface", o.get("font", font))
    return tb

def tor_tag(s, label):
    """ป้ายอ้างอิงเกณฑ์ TOR มุมขวาล่าง — หัวใจของกลยุทธ์ทำคะแนน"""
    w = 0.10 * len(label) + 0.5
    w = min(max(w, 2.2), 6.2)
    x = SW - 0.55 - w
    p = rect(s, x, SH-0.62, w, 0.34, fill=NAVY, shape=MSO_SHAPE.ROUNDED_RECTANGLE, rad=0.5)
    text(s, x, SH-0.625, w, 0.34, [[("◆ ", {"color":BRAND,"size":9}), (label, {})]],
         size=10.5, color=INVERT, bold=True, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)

def kicker_title(s, kicker, title, sub=None, color=BRAND):
    rect(s, 0.55, 0.62, 0.16, 0.66, fill=color)
    text(s, 0.85, 0.6, 11.0, 0.34, kicker, size=12.5, color=color, bold=True, font=FEN)
    text(s, 0.83, 0.92, 11.4, 0.7, title, size=27, color=INK, bold=True)
    if sub:
        text(s, 0.85, 1.62, 11.4, 0.4, sub, size=13, color=MUTED)

def page_no(s, n):
    text(s, SW-1.4, SH-0.6, 0.8, 0.3, str(n), size=10, color=MUTED, align=PP_ALIGN.RIGHT)
    text(s, 0.55, SH-0.6, 5.0, 0.3, "Avalant × DGA  •  TOR DGA-69-0177", size=9, color=MUTED, font=FEN)

def chip(s, x, y, label, fill=TINT, fg=ACTION, w=None, size=11):
    w = w or (0.105*len(label)+0.42)
    rect(s, x, y, w, 0.36, fill=fill, shape=MSO_SHAPE.ROUNDED_RECTANGLE, rad=0.5)
    text(s, x, y-0.005, w, 0.36, label, size=size, color=fg, bold=True,
         align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    return w

def card(s, x, y, w, h, fill=SURFACE, line=BORDER):
    return rect(s, x, y, w, h, fill=fill, line=line, lw=1.0,
                shape=MSO_SHAPE.ROUNDED_RECTANGLE, rad=0.06)

def browser_frame(s, x, y, w, h, url="www.dga.or.th"):
    """กรอบเบราว์เซอร์ → คืน (ix, iy, iw, ih) พื้นที่เนื้อหาด้านใน"""
    rect(s, x, y, w, h, fill=SURFACE, line=BORDERS, lw=1.2,
         shape=MSO_SHAPE.ROUNDED_RECTANGLE, rad=0.04)
    bar = 0.34
    rect(s, x, y, w, bar, fill=SUNKEN, line=None)
    for i,c in enumerate([DANGER, WARN, OK]):
        rect(s, x+0.16+i*0.18, y+0.12, 0.1, 0.1, fill=c, shape=MSO_SHAPE.OVAL)
    rect(s, x+0.85, y+0.07, w-1.5, 0.2, fill=SURFACE, line=BORDER, lw=0.75,
         shape=MSO_SHAPE.ROUNDED_RECTANGLE, rad=0.5)
    text(s, x+1.0, y+0.06, w-1.6, 0.2, "◆ "+url, size=8.5, color=MUTED, font=FEN, anchor=MSO_ANCHOR.MIDDLE)
    return (x, y+bar, w, h-bar)

N = [0]
def num():
    N[0]+=1; return N[0]

# ============================================================================
# 1. COVER
# ============================================================================
s = slide(DARK1)
rect(s, 0,0, SW, SH, fill=DARK1)
# แถบเฉียงแบรนด์
tri = s.shapes.add_shape(MSO_SHAPE.RIGHT_TRIANGLE, Inches(SW-5.4), Inches(0), Inches(5.4), Inches(SH))
tri.rotation = 0; tri.fill.solid(); tri.fill.fore_color.rgb = BRAND2; tri.line.fill.background(); tri.shadow.inherit=False
tri.fill.fore_color.rgb = RGBColor(0x24,0x16,0x12)
rect(s, SW-0.36, 0, 0.36, SH, fill=BRAND)
text(s, 0.9, 0.72, 6, 0.5, "DIGITAL GOVERNMENT DEVELOPMENT AGENCY", size=12, color=BRAND, bold=True, font=FEN)
text(s, 0.88, 1.15, 8, 0.4, "สำนักงานพัฒนารัฐบาลดิจิทัล (องค์การมหาชน)", size=15, color=RGBColor(0xC9,0xCA,0xD0))
text(s, 0.86, 2.7, 11.0, 2.0,
     [[("ออกแบบและพัฒนา", {})],[("ระบบเว็บไซต์ ", {}), ("สพร.", {"color":BRAND})],[("(dga.or.th)", {"size":30, "color":RGBColor(0xC9,0xCA,0xD0)})]],
     size=46, color=INVERT, bold=True, line=1.05)
text(s, 0.9, 5.25, 11, 0.4, "ข้อเสนอด้านเทคนิค — Headless CMS + Static Site + Multi-Tenant Console", size=14.5, color=RGBColor(0xC9,0xCA,0xD0))
rect(s, 0.9, 5.85, 3.0, 0.02, fill=BRAND)
text(s, 0.9, 6.05, 7, 0.4, "เสนอโดย  บริษัท อวาแลนท์ จำกัด (Avalant)", size=14, color=INVERT, bold=True)
text(s, 0.9, 6.45, 8, 0.6, [[("Everyday AI  •  CMMI Dev/3  •  ", {"font":FEN}), ("เลขที่อ้างอิง TOR: DGA-69-0177", {})]], size=11.5, color=MUTED)

# ============================================================================
# 2. AGENDA / สารบัญ
# ============================================================================
s = slide()
kicker_title(s, "AGENDA", "หัวข้อการนำเสนอ", "ทุกหัวข้อออกแบบให้ครอบคลุมเกณฑ์ให้คะแนน TOR ข้อ 6.1 ครบ 100 คะแนน")
items = [
    ("01", "เกี่ยวกับ Avalant & ความเข้าใจโครงการ", "ประสบการณ์ภาครัฐ • Everyday AI • CMMI", MUTED),
    ("02", "Design & UX/UI", "Design System • 3-Click • WCAG AA • Responsive • Mockup", BRAND),
    ("03", "ฟังก์ชันระบบ CMS 29 โมดูล", "Hybrid Search • AI Smart Search • Multi-tenant • PDPA", NAVY),
    ("04", "สถาปัตยกรรม & ความมั่นคงปลอดภัย", "Architecture • MFA • DR Site (RTO/RPO) • Performance", ACTION),
    ("05", "แผนงาน 4 งวด • SLA • การสาธิตสด", "Timeline • Warranty • Live Demo 2 หน้า", OK),
    ("06", "สรุปการทำคะแนนตามเกณฑ์ TOR", "ตารางผูกข้อเสนอ ↔ เกณฑ์ 100 คะแนน", BRAND2),
]
y=2.2
for n,t,d,c in items:
    card(s, 0.85, y, 11.6, 0.74)
    rect(s, 0.85, y, 0.1, 0.74, fill=c)
    text(s, 1.2, y+0.12, 0.9, 0.5, n, size=22, color=c, bold=True, font=FEN)
    text(s, 2.15, y+0.11, 6.0, 0.4, t, size=15.5, color=INK, bold=True)
    text(s, 2.17, y+0.45, 8.5, 0.3, d, size=11, color=MUTED)
    y += 0.84
page_no(s, num())

# ============================================================================
# 3. ABOUT AVALANT
# ============================================================================
s = slide()
kicker_title(s, "ABOUT US", "บริษัท อวาแลนท์ จำกัด (Avalant)", "ผู้เชี่ยวชาญแพลตฟอร์มดิจิทัลภาครัฐและองค์กรขนาดใหญ่", color=NAVY)
stats = [("20+","ปีประสบการณ์ Enterprise Software"),("CMMI","Dev Maturity Level 3"),
         ("Everyday","AI-First Delivery"),("100+","โครงการภาครัฐ/รัฐวิสาหกิจ")]
x=0.85
for big,lab in stats:
    card(s, x, 2.15, 2.8, 1.25)
    text(s, x, 2.42, 2.8, 0.55, big, size=27, color=BRAND, bold=True, align=PP_ALIGN.CENTER, font=FEN)
    text(s, x+0.15, 3.0, 2.5, 0.4, lab, size=11, color=MUTED, align=PP_ALIGN.CENTER)
    x += 2.95
text(s, 0.85, 3.75, 11.6, 0.4, "จุดแข็งที่ตรงกับโครงการนี้", size=15, color=INK, bold=True)
pts = [
    ("Headless CMS & Multi-tenant", "ออกแบบ CMS ใช้ซ้ำหลายหน่วยงานในแพลตฟอร์มเดียว — ลดต้นทุน ขยายง่าย"),
    ("Government AI Smart Search", "ผู้ช่วย AI ตอบจากเนื้อหาเว็บจริง รองรับ GEO/AEO ตามแนวทาง TOR"),
    ("WCAG & PDPA by Design", "เข้าถึงได้ทุกคน + คุ้มครองข้อมูลส่วนบุคคล ฝังในกระบวนการพัฒนา"),
    ("ส่งมอบจริง สาธิตได้", "ต้นแบบทำงานจริง 29 โมดูล พร้อมสาธิตสดในวันนำเสนอ"),
]
y=4.25
for i,(t,d) in enumerate(pts):
    cx = 0.85 + (i%2)*5.9
    cy = y + (i//2)*1.25
    card(s, cx, cy, 5.7, 1.1)
    rect(s, cx+0.22, cy+0.22, 0.12, 0.66, fill=BRAND)
    text(s, cx+0.5, cy+0.18, 5.0, 0.35, t, size=13.5, color=NAVY, bold=True)
    text(s, cx+0.5, cy+0.55, 5.05, 0.5, d, size=10.5, color=MUTED, line=1.15)
page_no(s, num())

# ============================================================================
# 4. PROJECT UNDERSTANDING
# ============================================================================
s = slide()
kicker_title(s, "PROJECT UNDERSTANDING", "ความเข้าใจโครงการ & เป้าหมาย", color=NAVY)
text(s, 0.85, 1.85, 11.6, 0.7,
     "“เว็บไซต์ สพร. คือหน้าตาของรัฐบาลดิจิทัล — ต้องเข้าถึงง่ายสำหรับประชาชนทุกคน "
     "ค้นหาได้จริง ปลอดภัยตามกฎหมาย และพร้อมให้ AI อ้างอิง”", size=15, color=INK, line=1.3)
goals = [
    ("ประชาชนเป็นศูนย์กลาง","เข้าถึงบริการใน ≤ 3 คลิก • 2 ภาษา • ทุกอุปกรณ์ • WCAG 2.2 AA","◆",BRAND),
    ("ค้นเจอทุกที่","Hybrid + Full-text ในไฟล์ + AI Smart Search + Schema (GEO/AEO)","",NAVY),
    ("จัดการง่ายหลายฝ่าย","CMS 29 โมดูล • สิทธิ์ผู้ใช้ • WYSIWYG • Multi-tenant Console","◆",ACTION),
    ("มั่นคงปลอดภัย","MFA • PDPA • Log • Encryption • DR Site (RTO/RPO)","◆",OK),
]
y=2.85
for i,(t,d,ic,c) in enumerate(goals):
    cx = 0.85 + (i%2)*5.9
    cy = y + (i//2)*1.5
    card(s, cx, cy, 5.7, 1.32)
    rect(s, cx, cy, 0.1, 1.32, fill=c)
    text(s, cx+0.32, cy+0.2, 0.8, 0.6, ic, size=26)
    text(s, cx+1.15, cy+0.22, 4.3, 0.4, t, size=14.5, color=INK, bold=True)
    text(s, cx+1.17, cy+0.62, 4.35, 0.6, d, size=10.5, color=MUTED, line=1.2)
tor_tag(s, "TOR ข้อ 1–3 • ภาพรวมความต้องการ")
page_no(s, num())

# ============================================================================
# 5. SOLUTION OVERVIEW
# ============================================================================
s = slide()
kicker_title(s, "SOLUTION", "ภาพรวมโซลูชัน", "Headless CMS + Static Front-end + Multi-Tenant — เร็ว ปลอดภัย ขยายได้", color=NAVY)
layers = [
    ("ประชาชน / หน่วยงาน / ธุรกิจ / นักพัฒนา", "ผู้ใช้ 4 กลุ่ม — mega-menu คุม 3-Click", MUTED, SUNKEN),
    ("Static Front-end (HTML/CSS/JS)", "หน้าเว็บ render ล่วงหน้า • โหลดไว • Lighthouse สูง • ปลอดภัย", NAVY, INFOBG),
    ("Strapi Headless CMS  +  WebX Console", "29 โมดูล • สิทธิ์ผู้ใช้ • WYSIWYG • Multi-tenant + SSO", BRAND, TINT),
    ("AI Smart Search • Hybrid Full-text • Schema", "ตอบจากเนื้อหาเว็บ • ค้นในไฟล์ pdf/docx/xlsx/pptx • GEO/AEO", ACTION, RGBColor(0xFB,0xEF,0xD6)),
    ("Security & Data: MFA • PDPA • Log • Backup • DR", "เข้ารหัส • Consent log • สำรอง/กู้คืน RTO/RPO ≤ 1 ชม.", OK, RGBColor(0xE5,0xF4,0xE8)),
]
y=2.05
for t,d,c,bg in layers:
    rect(s, 1.6, y, 10.1, 0.86, fill=bg, line=BORDER, shape=MSO_SHAPE.ROUNDED_RECTANGLE, rad=0.08)
    rect(s, 1.6, y, 0.12, 0.86, fill=c)
    text(s, 1.95, y+0.14, 7.5, 0.4, t, size=14, color=INK, bold=True)
    text(s, 1.97, y+0.5, 9.4, 0.3, d, size=10.5, color=MUTED)
    y += 1.0
# arrows ด้านซ้าย
text(s, 0.6, 2.05, 0.9, 4.6, "ผู้ใช้\n▼\n▼\n▼\n▼", size=12, color=MUTED, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
tor_tag(s, "TOR ข้อ 4 • สถาปัตยกรรมระบบ")
page_no(s, num())

# ============================================================================
# SECTION DIVIDER A — Design & UX/UI (50%)
# ============================================================================
def divider(kicker, title, weight, desc):
    s = slide(DARK1)
    rect(s,0,0,SW,SH,fill=DARK1)
    rect(s, 0, 0, 0.36, SH, fill=BRAND)
    text(s, 1.0, 2.7, 9, 0.5, kicker, size=15, color=BRAND, bold=True, font=FEN)
    text(s, 0.96, 3.15, 11, 1.0, title, size=40, color=INVERT, bold=True)
    text(s, 1.0, 4.35, 10, 0.5, desc, size=15, color=RGBColor(0xC9,0xCA,0xD0))
    # น้ำหนักคะแนน
    rect(s, SW-3.7, 2.7, 2.9, 1.7, fill=None, line=BRAND, lw=1.5, shape=MSO_SHAPE.ROUNDED_RECTANGLE, rad=0.08)
    text(s, SW-3.7, 2.95, 2.9, 0.9, weight, size=46, color=BRAND, bold=True, align=PP_ALIGN.CENTER, font=FEN)
    text(s, SW-3.7, 3.95, 2.9, 0.4, "น้ำหนักคะแนน TOR 6.1", size=11, color=RGBColor(0xC9,0xCA,0xD0), align=PP_ALIGN.CENTER)
    return s

divider("SECTION 02", "Design & UX / UI", "50", "หัวใจของการตัดสิน — Design System • 3-Click • WCAG • Responsive • Mockup")

# 6. Design System overview (2.1)
s = slide()
kicker_title(s, "2.1  DESIGN SYSTEM", "ระบบการออกแบบ — ส่งมอบเป็น Figma + CSS Tokens")
cols = [
    ("Typography","Kanit (ไทย) + Ubuntu (อังกฤษ)\nสเกล 8 ระดับ • line-height ไทย 1.6","Aa"),
    ("Color Palette","Brand/Action/Semantic\nผ่าน Contrast AA ทุกคู่สี","◆"),
    ("Iconography","ชุดไอคอนเส้นสม่ำเสมอ\nสื่อความหมายชัด ไม่พึ่งสีเดียว","◆"),
    ("UI Components","Buttons • Form Inputs • Badge\nCards • Focus ring มาตรฐาน","◆"),
]
x=0.85
for t,d,ic in cols:
    card(s, x, 2.0, 2.85, 2.2)
    rect(s, x, 2.0, 2.85, 0.66, fill=NAVY, shape=MSO_SHAPE.ROUNDED_RECTANGLE, rad=0.08)
    rect(s, x, 2.33, 2.85, 0.33, fill=NAVY)
    text(s, x, 2.05, 2.85, 0.55, ic, size=24, color=INVERT, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    text(s, x+0.2, 2.85, 2.5, 0.4, t, size=14.5, color=INK, bold=True, align=PP_ALIGN.CENTER)
    text(s, x+0.2, 3.3, 2.5, 0.85, d, size=10.5, color=MUTED, align=PP_ALIGN.CENTER, line=1.25)
    x += 2.98
text(s, 0.85, 4.55, 11.6, 0.4, "ส่งมอบ (Deliverables) ตามเกณฑ์ 2.1", size=14, color=INK, bold=True)
dl = ["Figma Component Library","Design Tokens (CSS)","Light / Dark Mode","Accessibility Spec","Component Docs"]
x=0.85
for d in dl:
    x += chip(s, x, 5.0, d, fill=TINT, fg=ACTION) + 0.18
text(s, 0.85, 5.7, 11.6, 0.9,
     [[("ไฟล์จริงในโครงการ: ", {"bold":True}), ("assets/design-system.css", {"font":FEN,"color":ACTION}),
       ("  — Design Tokens ครบ (สี/ฟอนต์/ระยะ/รัศมี/เงา) ใช้ซ้ำทุกหน้า ลด CLS/LCP", {})]],
     size=11.5, color=MUTED, line=1.3)
tor_tag(s, "TOR 6.1 (2.1) • Design System + Typography")
page_no(s, num())

# 7. Typography (2.1)
s = slide()
kicker_title(s, "2.1  TYPOGRAPHY", "ระบบตัวอักษร — Kanit / Ubuntu")
card(s, 0.85, 2.0, 7.0, 4.55)
scale = [("Display / 47.8","ก\nบริการรัฐบาลดิจิทัล",30,True),
         ("H1 / 39.8","หัวเรื่องหลักของหน้า",24,True),
         ("H2 / 27.6","หัวข้อรอง",19,True),
         ("Body LG / 18","เนื้อหานำ อ่านสบายตา",15,False),
         ("Body / 16","เนื้อหาปกติ บรรทัดฐาน 1.6 สำหรับภาษาไทย",13,False),
         ("Small / 14","คำอธิบายประกอบ / caption",11,False)]
y=2.25
for lab,sample,sz,bd in scale:
    text(s, 1.1, y, 2.2, 0.4, lab, size=10, color=MUTED, font=FEN, anchor=MSO_ANCHOR.MIDDLE)
    text(s, 3.2, y-0.05, 4.5, 0.55, sample.split("\n")[-1], size=sz, color=INK, bold=bd, anchor=MSO_ANCHOR.MIDDLE)
    rect(s, 1.1, y+0.62, 6.55, 0.012, fill=BORDER)
    y += 0.7
card(s, 8.1, 2.0, 4.35, 4.55, fill=SUNKEN)
text(s, 8.4, 2.25, 3.8, 0.4, "หลักการ", size=14, color=NAVY, bold=True)
notes = ["ไทยใช้ Kanit — เปิด weight เท่าที่ใช้ (300–700) ลดน้ำหนักโหลด",
         "อังกฤษ/ตัวเลข/โค้ด ใช้ Ubuntu",
         "line-height 1.6 รองรับสระบน-ล่างภาษาไทย",
         "Modular scale อัตราส่วน 1.2 — ลำดับชั้นชัด",
         "ควร self-host + preload เพื่อ Lighthouse (4.1.6)"]
y=2.75
for ntx in notes:
    text(s, 8.4, y, 0.3, 0.3, "•", size=13, color=BRAND, bold=True)
    text(s, 8.66, y, 3.55, 0.6, ntx, size=11, color=INK, line=1.25)
    y += 0.72
tor_tag(s, "TOR 6.1 (2.1) • Typography")
page_no(s, num())

# 8. Color palette + contrast (2.1 + 2.3)
s = slide()
kicker_title(s, "2.1 / 2.3  COLOR & CONTRAST", "จานสี — ผ่าน WCAG Contrast AA ทุกคู่ที่ใช้งาน")
sw = [("Brand","#EE5020",BRAND,INVERT,"3.6:1*"),("Action","#C2410C",ACTION,INVERT,"4.9:1 AA"),
      ("Navy/Focus","#13497A",NAVY,INVERT,"8.6:1 AAA"),("Success","#1E7B34",OK,INVERT,"4.8:1 AA"),
      ("Warning","#8A5A00",WARN,INVERT,"5.6:1 AA"),("Danger","#B3261E",DANGER,INVERT,"6.0:1 AA"),
      ("Ink","#18181B",INK,INVERT,"15:1 AAA"),("Muted","#5B5F66",MUTED,INVERT,"7:1 AAA")]
x=0.85; y=2.05
for i,(name,hexv,col,fg,ratio) in enumerate(sw):
    cx = 0.85 + (i%4)*2.98
    cy = 2.05 + (i//4)*2.1
    rect(s, cx, cy, 2.8, 1.25, fill=col, shape=MSO_SHAPE.ROUNDED_RECTANGLE, rad=0.08)
    text(s, cx+0.2, cy+0.78, 2.5, 0.4, "Aa  ก่อสร้าง", size=14, color=fg, bold=True)
    text(s, cx, cy+1.32, 2.8, 0.3, [[ (name+"  ",{"bold":True,"color":INK,"size":11}), (hexv,{"font":FEN,"color":MUTED,"size":10}) ]], align=PP_ALIGN.LEFT)
    chip(s, cx+0.0, cy+1.6, ratio, fill=RGBColor(0xE5,0xF4,0xE8), fg=OK, size=9.5, w=1.2)
text(s, 0.85, 6.55, 11.6, 0.4,
     [[("ข้อความปกติ ≥ 4.5:1 • ข้อความใหญ่/UI ≥ 3:1   ", {"color":MUTED,"size":10.5}),
       ("*Brand ใช้เป็นพื้นหลัง/องค์ประกอบใหญ่เท่านั้น ข้อความใช้ Action", {"color":WARN,"size":10.5})]])
tor_tag(s, "TOR 6.1 (2.1 + 2.3) • Color & Contrast AA")
page_no(s, num())

# 9. UI Components (2.1)
s = slide()
kicker_title(s, "2.1  UI COMPONENTS", "องค์ประกอบ UI มาตรฐาน — Buttons • Inputs • Badge")
# Buttons
card(s, 0.85, 2.0, 5.7, 2.1)
text(s, 1.1, 2.15, 4, 0.3, "Buttons", size=13, color=NAVY, bold=True, font=FEN)
rect(s, 1.1, 2.6, 1.7, 0.5, fill=ACTION, shape=MSO_SHAPE.ROUNDED_RECTANGLE, rad=0.18)
text(s, 1.1, 2.59, 1.7, 0.5, "Primary", size=12.5, color=INVERT, bold=True, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
rect(s, 2.95, 2.6, 1.7, 0.5, fill=SURFACE, line=ACTION, lw=1.3, shape=MSO_SHAPE.ROUNDED_RECTANGLE, rad=0.18)
text(s, 2.95, 2.59, 1.7, 0.5, "Secondary", size=12.5, color=ACTION, bold=True, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
rect(s, 4.8, 2.6, 1.5, 0.5, fill=SUNKEN, line=BORDERS, lw=1.0, shape=MSO_SHAPE.ROUNDED_RECTANGLE, rad=0.18)
text(s, 4.8, 2.59, 1.5, 0.5, "Ghost", size=12.5, color=MUTED, bold=True, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
text(s, 1.1, 3.35, 5.2, 0.6, "ปุ่มสูง ≥ 44px • โฟกัสมีวงน้ำเงิน • พื้นที่กด ≥ 24px (2.5.8)", size=10.5, color=MUTED, line=1.2)
# Inputs
card(s, 6.75, 2.0, 5.7, 2.1)
text(s, 7.0, 2.15, 4, 0.3, "Form Inputs", size=13, color=NAVY, bold=True, font=FEN)
text(s, 7.0, 2.55, 4, 0.3, "อีเมล *", size=10.5, color=INK, bold=True)
rect(s, 7.0, 2.82, 5.2, 0.46, fill=SURFACE, line=BORDERS, lw=1.2, shape=MSO_SHAPE.ROUNDED_RECTANGLE, rad=0.16)
text(s, 7.15, 2.81, 4, 0.46, "name@example.com", size=11, color=MUTED, anchor=MSO_ANCHOR.MIDDLE, font=FEN)
rect(s, 7.0, 3.42, 5.2, 0.46, fill=SURFACE, line=DANGER, lw=1.3, shape=MSO_SHAPE.ROUNDED_RECTANGLE, rad=0.16)
text(s, 7.0, 3.92, 5, 0.25, "! กรุณากรอกอีเมลให้ถูกต้อง", size=9.5, color=DANGER)
# Badges
card(s, 0.85, 4.3, 11.6, 2.25)
text(s, 1.1, 4.45, 4, 0.3, "Badges / Status & States", size=13, color=NAVY, bold=True, font=FEN)
badges = [("เผยแพร่",RGBColor(0xE5,0xF4,0xE8),OK),("ฉบับร่าง",RGBColor(0xEE,0xED,0xEA),RGBColor(0x3F,0x41,0x48)),
          ("รอตรวจ",RGBColor(0xFB,0xEF,0xD6),WARN),("ปิดปรับปรุง",RGBColor(0xFB,0xE3,0xE1),DANGER),
          ("ข้อมูล",INFOBG,NAVY)]
x=1.1
for t,bg,fg in badges:
    x += chip(s, x, 4.9, t, fill=bg, fg=fg) + 0.2
text(s, 1.1, 5.5, 11, 0.9,
     [[("ทุก component กำหนดสถานะครบ: ", {"size":11,"color":INK}),
       ("default / hover / focus / active / disabled / error", {"size":11,"color":ACTION,"font":FEN}),
       (" — รับประกันความสม่ำเสมอและเข้าถึงได้ด้วยคีย์บอร์ด", {"size":11,"color":INK})]], line=1.3)
tor_tag(s, "TOR 6.1 (2.1) • UI Components")
page_no(s, num())

# 10. Sitemap / 3-Click (2.2)
s = slide()
kicker_title(s, "2.2  INFORMATION ARCHITECTURE", "Sitemap — เข้าถึงทุกบริการใน ≤ 3 คลิก")
# level 1
rect(s, 5.4, 1.95, 2.5, 0.55, fill=NAVY, shape=MSO_SHAPE.ROUNDED_RECTANGLE, rad=0.2)
text(s, 5.4, 1.94, 2.5, 0.55, "หน้าแรก (Home)", size=13, color=INVERT, bold=True, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
groups = [("บริการ","ค้นหา • e-Service\nรายการบริการ"),("ข่าวสาร","ข่าว • ประกาศ\nกิจกรรม"),
          ("บริการออนไลน์","ฟอร์ม • ร้องเรียน\nลงทะเบียน"),("เกี่ยวกับ สพร.","ข้อมูล • ติดต่อ\nดาวน์โหลด")]
x=0.95
for i,(t,d) in enumerate(groups):
    cx = 0.95 + i*2.95
    rect(s, cx+1.0, 2.5, 0.02, 0.55, fill=BORDERS)  # connector
    rect(s, cx, 3.05, 2.6, 0.6, fill=BRAND, shape=MSO_SHAPE.ROUNDED_RECTANGLE, rad=0.16)
    text(s, cx, 3.04, 2.6, 0.6, t, size=13, color=INVERT, bold=True, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    card(s, cx, 3.85, 2.6, 1.5, fill=SURFACE)
    text(s, cx+0.2, 4.0, 2.25, 1.3, d, size=11, color=INK, line=1.4, align=PP_ALIGN.CENTER)
    text(s, cx+0.2, 5.0, 2.25, 0.3, "คลิกที่ 2–3", size=9.5, color=MUTED, align=PP_ALIGN.CENTER)
# horizontal connector under home
rect(s, 1.95, 2.5, 9.0, 0.02, fill=BORDERS)
card(s, 0.85, 5.65, 11.6, 0.9, fill=TINT, line=None)
text(s, 1.1, 5.78, 11.1, 0.7,
     [[("mega-menu จัดกลุ่มตามผู้ใช้ 4 กลุ่ม", {"bold":True,"color":ACTION}),
       (" (ประชาชน / หน่วยงานรัฐ / ธุรกิจ / นักพัฒนา) + ค้นหา + breadcrumb — ", {"color":INK}),
       ("รับประกันกฎ 3 คลิก พร้อม Sitemap.xml + User Flow", {"bold":True,"color":NAVY})]],
     size=12.5, line=1.3)
tor_tag(s, "TOR 6.1 (2.2) • ≤3 Clicks + Sitemap")
page_no(s, num())

# 11. User Flow (2.2)
s = slide()
kicker_title(s, "2.2  USER FLOW", "ตัวอย่าง User Flow — “ประชาชนค้นหาและใช้บริการ”")
steps = [("เข้าหน้าแรก","พิมพ์คำค้น/เลือกเมนู",NAVY),
         ("Hybrid / AI Search","ผลลัพธ์ + คำตอบ AI",BRAND),
         ("หน้าบริการ","Answer Block + ขั้นตอน",ACTION),
         ("ทำรายการ","ฟอร์ม + แนบไฟล์ + CAPTCHA",OK),
         ("ยืนยัน/ติดตาม","อีเมลอัตโนมัติ + เลขอ้างอิง",NAVY)]
y=2.4
x=0.85
bw=2.15
for i,(t,d,c) in enumerate(steps):
    cx = 0.85 + i*2.45
    rect(s, cx, y, bw, 1.3, fill=SURFACE, line=c, lw=1.6, shape=MSO_SHAPE.ROUNDED_RECTANGLE, rad=0.08)
    rect(s, cx, y, bw, 0.4, fill=c, shape=MSO_SHAPE.ROUNDED_RECTANGLE, rad=0.08)
    rect(s, cx, y+0.2, bw, 0.2, fill=c)
    text(s, cx, y+0.02, bw, 0.4, "ขั้นที่ %d"%(i+1), size=10.5, color=INVERT, bold=True, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    text(s, cx+0.12, y+0.48, bw-0.24, 0.4, t, size=12.5, color=INK, bold=True, align=PP_ALIGN.CENTER)
    text(s, cx+0.12, y+0.85, bw-0.24, 0.4, d, size=9.5, color=MUTED, align=PP_ALIGN.CENTER, line=1.15)
    if i<4:
        text(s, cx+bw-0.02, y+0.35, 0.5, 0.6, "▶", size=14, color=BRAND, anchor=MSO_ANCHOR.MIDDLE)
# decision branch
card(s, 0.85, 4.2, 11.6, 2.2, fill=SUNKEN)
text(s, 1.1, 4.35, 6, 0.3, "จุดตัดสินใจ & เส้นทางลัด (≤ 3 คลิก ทุกเส้นทาง)", size=13, color=NAVY, bold=True)
flows = ["ผู้ใช้รู้ชื่อบริการ → ค้นหา → บริการ (2 คลิก)",
         "ผู้ใช้ไม่แน่ใจ → ถาม AI Smart Search → ลิงก์บริการ (2 คลิก)",
         "เรียกดูตามหมวด → เมนู → หมวด → บริการ (3 คลิก)",
         "ลัด: Quick Links / Top Graphic / Popup โปรโมตบริการเด่น"]
y=4.75
for f in flows:
    text(s, 1.25, y, 0.3, 0.3, "→", size=12, color=BRAND, bold=True)
    text(s, 1.6, y, 10.5, 0.35, f, size=11.5, color=INK)
    y += 0.4
tor_tag(s, "TOR 6.1 (2.2) • User Flow")
page_no(s, num())

# 12. WCAG (2.3)
s = slide()
kicker_title(s, "2.3  ACCESSIBILITY", "WCAG 2.1 / 2.2 ระดับ AA — เข้าถึงได้ทุกคน")
checks = [
    ("Perceivable","Contrast AA • alt ครบ • ไม่พึ่งสีเดียว • caption"),
    ("Operable","คีย์บอร์ดทั้งหมด • โฟกัสเห็นชัด (2.4.11) • target ≥24px (2.5.8)"),
    ("Understandable","lang=th/en • label+error+aria-describedby • ภาษาเรียบง่าย"),
    ("Robust","HTML semantic • ARIA landmark • อ่านด้วย Screen Reader ได้"),
]
y=2.0
for i,(t,d) in enumerate(checks):
    cy = 2.0 + i*0.78
    card(s, 0.85, cy, 7.2, 0.68)
    rect(s, 0.85, cy, 0.1, 0.68, fill=OK)
    text(s, 1.15, cy+0.08, 0.4, 0.5, "◆", size=18, color=OK, bold=True)
    text(s, 1.6, cy+0.06, 2.3, 0.5, t, size=13, color=NAVY, bold=True, font=FEN, anchor=MSO_ANCHOR.MIDDLE)
    text(s, 3.5, cy+0.05, 4.45, 0.6, d, size=10.5, color=INK, anchor=MSO_ANCHOR.MIDDLE, line=1.15)
card(s, 8.3, 2.0, 4.15, 3.1, fill=NAVY)
text(s, 8.6, 2.2, 3.6, 0.4, "เครื่องมือทดสอบ", size=14, color=INVERT, bold=True)
tools = ["axe DevTools","Lighthouse Accessibility","WAVE","NVDA / VoiceOver","Keyboard-only pass","Contrast Checker"]
y=2.7
for t in tools:
    text(s, 8.6, y, 0.3, 0.3, "▣", size=11, color=BRAND)
    text(s, 8.95, y, 3.3, 0.3, t, size=11.5, color=INVERT, font=FEN)
    y += 0.39
card(s, 0.85, 5.25, 11.6, 1.3, fill=RGBColor(0xE5,0xF4,0xE8), line=None)
text(s, 1.1, 5.4, 11.1, 1.0,
     [[("แถบเครื่องมือเข้าถึง", {"bold":True,"color":OK}),
       (" บนทุกหน้า: ปรับขนาดอักษร (ก- ก ก+) • โหมดความต่างสูง • ข้ามไปเนื้อหา • โหมดมืด — ",{"color":INK}),
       ("ทดสอบจริงทุก sprint และแนบรายงานผลในงวดส่งมอบ", {"bold":True,"color":NAVY})]],
     size=12, line=1.35)
tor_tag(s, "TOR 6.1 (2.3) • WCAG 2.2 AA")
page_no(s, num())

# 13. Responsive (2.4)
s = slide()
kicker_title(s, "2.4  RESPONSIVE", "รองรับ 3 อุปกรณ์ — Desktop / Tablet / Mobile")
def mini_page(s, x, y, w, h, label, cols):
    ix,iy,iw,ih = browser_frame(s, x, y, w, h)
    rect(s, ix, iy, iw, 0.28, fill=NAVY)  # nav
    rect(s, ix+0.1, iy+0.09, 0.5, 0.1, fill=INVERT)
    rect(s, ix, iy+0.34, iw, ih*0.32, fill=SUNKEN)  # hero
    text(s, ix, iy+0.34, iw, ih*0.32, "Hero + ค้นหา", size=9, color=MUTED, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    gy = iy+0.34+ih*0.32+0.08
    gw = (iw-0.2-(cols-1)*0.08)/cols
    for c in range(cols):
        rect(s, ix+0.1+c*(gw+0.08), gy, gw, ih*0.28, fill=TINT, line=BORDER, shape=MSO_SHAPE.ROUNDED_RECTANGLE, rad=0.1)
    text(s, x, y+h+0.08, w, 0.3, label, size=11, color=INK, bold=True, align=PP_ALIGN.CENTER)
mini_page(s, 0.85, 2.1, 6.3, 3.6, "Desktop ≥ 1280px — เมนูเต็ม + กริด 3–4 คอลัมน์", 4)
mini_page(s, 7.6, 2.1, 2.5, 3.6, "Tablet ~768px — 2 คอลัมน์", 2)
mini_page(s, 10.35, 2.1, 2.1, 3.6, "Mobile — เมนู≡ 1 คอลัมน์", 1)
card(s, 0.85, 6.05, 11.6, 0.85, fill=TINT, line=None)
text(s, 1.1, 6.18, 11.1, 0.6,
     [[("Mobile-first", {"bold":True,"color":ACTION}),
       (" • breakpoints 500/750/1000/1920 • ภาพ responsive อัตโนมัติ • แตะง่าย ≥44px • ", {"color":INK}),
       ("ทดสอบ Chrome/Edge/Firefox/Safari + Android/iOS", {"bold":True,"color":NAVY})]], size=12, line=1.25)
tor_tag(s, "TOR 6.1 (2.4) • Responsive 3 อุปกรณ์")
page_no(s, num())

# 14-16. Mockups (2.5) — Home, Search/AI, Console
def mockup_slide(kicker, title, builder, tag):
    s = slide()
    kicker_title(s, kicker, title)
    ix,iy,iw,ih = browser_frame(s, 1.7, 2.0, 9.9, 4.55)
    builder(s, ix, iy, iw, ih)
    tor_tag(s, tag)
    page_no(s, num())
    return s

def build_home(s, ix, iy, iw, ih):
    # accessibility bar
    rect(s, ix, iy, iw, 0.22, fill=INK)
    text(s, ix+0.15, iy, 4, 0.22, "การเข้าถึง: ก- ก ก+  | โหมดความต่างสูง | ข้ามไปเนื้อหา", size=7.5, color=INVERT, anchor=MSO_ANCHOR.MIDDLE)
    text(s, ix+iw-2.2, iy, 2.05, 0.22, "WCAG 2.2 AA  | TH | EN", size=7.5, color=BRAND, anchor=MSO_ANCHOR.MIDDLE, font=FEN)
    # nav
    rect(s, ix, iy+0.22, iw, 0.42, fill=SURFACE, line=BORDER)
    text(s, ix+0.2, iy+0.22, 1.0, 0.42, "DGA", size=15, color=BRAND, bold=True, font=FEN, anchor=MSO_ANCHOR.MIDDLE)
    for j,m in enumerate(["หน้าแรก","บริการ ▾","ข่าวสาร ▾","บริการออนไลน์ ▾","เกี่ยวกับ สพร. ▾"]):
        text(s, ix+1.4+j*1.45, iy+0.22, 1.4, 0.42, m, size=9.5, color=INK, anchor=MSO_ANCHOR.MIDDLE)
    # hero
    hy = iy+0.64
    rect(s, ix, hy, iw, ih-0.64, fill=DARK1)
    rect(s, ix, hy, iw, ih-0.64, fill=DARK1)
    text(s, ix, hy+0.45, iw, 0.8, [["บริการรัฐบาลดิจิทัล"],[("เพื่อประชาชนทุกคน",{"color":BRAND})]],
         size=26, color=INVERT, bold=True, align=PP_ALIGN.CENTER, line=1.05)
    text(s, ix, hy+1.75, iw, 0.4, "ค้นหาบริการ เอกสาร และข้อมูลภาครัฐได้ในที่เดียว หรือถามผู้ช่วย AI", size=11, color=RGBColor(0xC9,0xCA,0xD0), align=PP_ALIGN.CENTER)
    # search bar
    bx = ix+iw/2-3.0
    rect(s, bx, hy+2.25, 6.0, 0.5, fill=SURFACE, shape=MSO_SHAPE.ROUNDED_RECTANGLE, rad=0.3)
    text(s, bx+0.3, hy+2.25, 4, 0.5, "ค้นหาบริการ เช่น “มาตรฐาน EA”", size=11, color=MUTED, anchor=MSO_ANCHOR.MIDDLE)
    rect(s, bx+4.7, hy+2.33, 1.15, 0.34, fill=ACTION, shape=MSO_SHAPE.ROUNDED_RECTANGLE, rad=0.3)
    text(s, bx+4.7, hy+2.32, 1.15, 0.34, "ค้นหา", size=10.5, color=INVERT, bold=True, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    text(s, ix, hy+2.95, iw, 0.3, "◆ ขับเคลื่อนด้วย AI Smart Search", size=9.5, color=BRAND, align=PP_ALIGN.CENTER)

def build_search(s, ix, iy, iw, ih):
    rect(s, ix, iy, iw, 0.45, fill=NAVY)
    text(s, ix+0.2, iy, 5, 0.45, "ผลการค้นหา: “ขอใบรับรองดิจิทัล”", size=12, color=INVERT, bold=True, anchor=MSO_ANCHOR.MIDDLE)
    # AI answer card
    rect(s, ix+0.25, iy+0.65, iw-0.5, 1.35, fill=TINT, line=BRAND, lw=1.3, shape=MSO_SHAPE.ROUNDED_RECTANGLE, rad=0.05)
    text(s, ix+0.45, iy+0.78, 5, 0.3, "◆ คำตอบจากผู้ช่วย AI (Government AI Smart Search)", size=11, color=ACTION, bold=True)
    text(s, ix+0.45, iy+1.12, iw-0.95, 0.85,
         "ท่านสามารถขอใบรับรองดิจิทัลผ่านบริการออนไลน์ของ สพร. โดยยืนยันตัวตนด้วย ThaID "
         "จากนั้นกรอกแบบฟอร์มและแนบเอกสาร ระบบจะส่งเลขอ้างอิงทางอีเมลอัตโนมัติ", size=10, color=INK, line=1.25)
    text(s, ix+0.45, iy+1.78, 6, 0.2, "อ้างอิง: หน้าบริการรับรองดิจิทัล • คู่มือ.pdf", size=8.5, color=NAVY, font=FEN)
    # result list (full-text in files)
    res = [("หน้าบริการ — การขอใบรับรองดิจิทัล","บริการออนไลน์ • อัปเดต 2569"),
           ("คู่มือการใช้งาน.pdf","พบคำค้นในไฟล์ PDF (Full-text)"),
           ("แบบฟอร์มคำขอ.docx","พบคำค้นในไฟล์ DOCX (Full-text)")]
    yy = iy+2.2
    for t,d in res:
        rect(s, ix+0.25, yy, iw-0.5, 0.6, fill=SURFACE, line=BORDER, shape=MSO_SHAPE.ROUNDED_RECTANGLE, rad=0.06)
        text(s, ix+0.45, yy+0.08, 7, 0.3, t, size=11, color=NAVY, bold=True)
        text(s, ix+0.45, yy+0.34, 7, 0.22, d, size=8.5, color=MUTED)
        yy += 0.7

def build_console(s, ix, iy, iw, ih):
    rect(s, ix, iy, 2.5, ih, fill=DARK1)  # sidebar
    text(s, ix+0.25, iy+0.2, 2, 0.3, "WebX Console", size=13, color=BRAND, bold=True, font=FEN)
    menu=[("◆","ภาพรวม/Analytics",True),("◆","จัดการเนื้อหา",False),("◆","ผู้ใช้/สิทธิ์",False),
          ("◆","Live Chat",False),("◆","แบรนด์/ธีม",False),("◆","ส่งออก Excel",False)]
    yy=iy+0.7
    for ic,t,act in menu:
        if act: rect(s, ix+0.12, yy-0.03, 2.26, 0.4, fill=ACTION, shape=MSO_SHAPE.ROUNDED_RECTANGLE, rad=0.12)
        text(s, ix+0.28, yy, 2.1, 0.4, ic+"  "+t, size=10, color=INVERT if act else RGBColor(0xC9,0xCA,0xD0), bold=act, anchor=MSO_ANCHOR.MIDDLE)
        yy+=0.5
    # content
    text(s, ix+2.75, iy+0.18, 6, 0.4, "ภาพรวมหน่วยงาน (Tenant: สพร.)", size=13, color=INK, bold=True)
    kpis=[("12,840","ผู้เข้าชม/วัน",BRAND),("96","คะแนน Lighthouse",OK),("1,204","เนื้อหาเผยแพร่",NAVY),("23","เรื่องร้องเรียนใหม่",WARN)]
    for j,(v,l,c) in enumerate(kpis):
        kx=ix+2.75+ (j%2)*3.45
        ky=iy+0.7+(j//2)*1.05
        rect(s, kx, ky, 3.25, 0.92, fill=SURFACE, line=BORDER, shape=MSO_SHAPE.ROUNDED_RECTANGLE, rad=0.08)
        text(s, kx+0.2, ky+0.12, 3, 0.45, v, size=20, color=c, bold=True, font=FEN)
        text(s, kx+0.2, ky+0.58, 3, 0.3, l, size=9.5, color=MUTED)
    rect(s, ix+2.75, iy+2.95, 6.7, 1.45, fill=SUNKEN, line=BORDER, shape=MSO_SHAPE.ROUNDED_RECTANGLE, rad=0.05)
    text(s, ix+2.95, iy+3.1, 5, 0.3, "แนวโน้มผู้เข้าชม (GA + Clarity Heatmap)", size=10, color=NAVY, bold=True)
    # mini bar chart
    bars=[0.5,0.7,0.55,0.9,0.75,1.0,0.85]
    for j,b in enumerate(bars):
        bh=b*0.8
        rect(s, ix+3.0+j*0.85, iy+4.2-bh, 0.55, bh, fill=BRAND, shape=MSO_SHAPE.ROUNDED_RECTANGLE, rad=0.2)

mockup_slide("2.5  MOCKUP — HOME", "ต้นแบบหน้าจอ (1/3): หน้าแรก + AI Search", build_home, "TOR 6.1 (2.5) • Mockup หน้าแรก")
mockup_slide("2.5  MOCKUP — SEARCH", "ต้นแบบหน้าจอ (2/3): ผลค้นหา + AI Smart Search", build_search, "TOR 6.1 (2.5) • Mockup ค้นหา")
mockup_slide("2.5  MOCKUP — CONSOLE", "ต้นแบบหน้าจอ (3/3): หลังบ้าน WebX Console", build_console, "TOR 6.1 (2.5) • Mockup หลังบ้าน")

# ============================================================================
# SECTION DIVIDER — Functions
# ============================================================================
divider("SECTION 03", "ฟังก์ชันระบบ CMS", "29", "โมดูลตามภาคผนวก — ทำงานจริงในต้นแบบ พร้อมสาธิตสด")

# 17. 29 modules grid
s = slide()
kicker_title(s, "FEATURES", "CMS ครบ 29 โมดูล — ต้นแบบทำงานได้จริง", color=NAVY)
mods = ["Home (Hero/Video)","Template 3 แบบ","Content + WYSIWYG","News/ประกาศ","Photo Gallery","Video Gallery",
        "Hybrid Search","AI Smart Search","Schema (GEO/AEO)","Contact","Live Chat","Form + Auto Email",
        "Vote / Poll","Blog","e-Book","Banner","e-Catalog","FAQ",
        "Download","Popup","Link","Top Graphic","Sitemap","Landing/Splash (no-code)",
        "Map","Web Analytics + Heatmap","Cookie Consent (PDPA)","Multi-tenant Console","SSO + MFA"]
cols=5
cw=2.28; ch=0.66; gx=0.1; gy=0.1
x0=0.85; y0=1.82
for i,m in enumerate(mods):
    cx=x0+(i%cols)*(cw+gx)
    cy=y0+(i//cols)*(ch+gy)
    rect(s, cx, cy, cw, ch, fill=SURFACE, line=BORDER, shape=MSO_SHAPE.ROUNDED_RECTANGLE, rad=0.1)
    rect(s, cx, cy, 0.08, ch, fill=BRAND if i%3==0 else (NAVY if i%3==1 else ACTION))
    text(s, cx+0.18, cy, cw-0.25, ch, "◆ "+m, size=10, color=INK, bold=True, anchor=MSO_ANCHOR.MIDDLE, line=1.05)
text(s, 0.85, 6.62, 11.6, 0.3, "ครบตามภาคผนวก TOR — แต่ละโมดูลแยก HTML/CSS/JS ชัดเจน ส่งมอบ Source Code เต็ม", size=10.5, color=MUTED)
tor_tag(s, "TOR ข้อ 4 + ภาคผนวก • 29 โมดูล")
page_no(s, num())

# 18. Search & AI
s = slide()
kicker_title(s, "SEARCH & AI", "ค้นหาอัจฉริยะ — Hybrid + Full-text + Government AI", color=NAVY)
blocks=[("Simple + Advanced Search","ค้นด้วยคีย์เวิร์ด กรองตามหมวด/วันที่/ประเภท + ค้นขั้นสูง",BRAND,""),
        ("Full-text ในไฟล์เอกสาร","สกัดข้อความค้นใน PDF / DOCX / XLSX / PPTX ได้จริง",NAVY,"◆"),
        ("Government AI Smart Search","ผู้ช่วย AI ตอบคำถามจากเนื้อหาเว็บจริง + อ้างอิงแหล่ง",ACTION,"◆"),
        ("Schema.org (GEO / AEO)","ฝัง JSON-LD ให้ Google + AI engine อ้างอิงเว็บได้",OK,"{}")]
for i,(t,d,c,ic) in enumerate(blocks):
    cx=0.85+(i%2)*5.9
    cy=2.0+(i//2)*1.55
    card(s, cx, cy, 5.7, 1.38)
    rect(s, cx, cy, 0.1, 1.38, fill=c)
    text(s, cx+0.32, cy+0.2, 0.9, 0.7, ic, size=24, color=c, bold=True, font=FEN)
    text(s, cx+1.25, cy+0.2, 4.3, 0.4, t, size=13.5, color=INK, bold=True)
    text(s, cx+1.27, cy+0.62, 4.3, 0.65, d, size=11, color=MUTED, line=1.2)
card(s, 0.85, 5.2, 11.6, 1.35, fill=INFOBG, line=None)
text(s, 1.1, 5.35, 11.1, 1.1,
     [[("GEO + AEO:", {"bold":True,"color":NAVY}),
       (" ทุกหน้าบริการมี Answer Block (คำถาม→คำตอบสั้น 40–60 คำ) + FAQPage + HowTo + Breadcrumb + llms.txt + sitemap.xml ", {"color":INK}),
       ("→ ทำให้เว็บ สพร. ถูกอ้างอิงโดย Generative AI และตอบคำถามตรงจุด", {"bold":True,"color":ACTION})]],
     size=12, line=1.35)
tor_tag(s, "TOR ข้อ 4 • Hybrid Search + AI + Schema")
page_no(s, num())

# 19. Multi-tenant + PDPA
s = slide()
kicker_title(s, "PLATFORM & PRIVACY", "Multi-Tenant Console + PDPA by Design", color=NAVY)
card(s, 0.85, 2.0, 5.7, 4.0)
text(s, 1.1, 2.15, 5, 0.35, "WebX Console — หลังบ้านรวมศูนย์", size=14, color=NAVY, bold=True)
feats=["เข้าระบบครั้งเดียว → Analytics / Content / Users / Chat / Branding",
       "Multi-tenant: หลายหน่วยงานในแพลตฟอร์มเดียว แยกข้อมูลเด็ดขาด",
       "SSO เข้าหลังบ้าน Strapi โดยไม่ต้องล็อกอินซ้ำ",
       "MFA + session/idle timeout สำหรับ Back-Office",
       "ปรับแบรนด์/ธีม/ลายน้ำต่อหน่วยงาน","ส่งออกข้อมูลเป็น Excel (สิทธิ์ผู้ดูแล)"]
y=2.6
for f in feats:
    text(s, 1.15, y, 0.3, 0.3, "•", size=14, color=BRAND, bold=True)
    text(s, 1.45, y, 4.9, 0.55, f, size=11, color=INK, line=1.2)
    y += 0.57
card(s, 6.75, 2.0, 5.7, 4.0, fill=SUNKEN)
text(s, 7.0, 2.15, 5, 0.35, "PDPA & ความเป็นส่วนตัว", size=14, color=NAVY, bold=True)
pdpa=["Cookie Consent แบบ granular: opt-in/out รายหมวด default off",
      "บันทึก Consent Log + 2 ภาษา",
      "ข้อมูลที่ประชาชนส่ง (ร้องเรียน/สมัคร/ติดต่อ) อ่านสาธารณะไม่ได้ — create-only",
      "ลงทะเบียนไม่เก็บรหัสผ่าน • เลขบัตรเก็บแบบ masked",
      "CAPTCHA กันบอท + Data Validation ทุกฟอร์ม",
      "เข้ารหัสข้อมูล + Traffic Log ตาม พ.ร.บ.คอมพิวเตอร์"]
y=2.6
for f in pdpa:
    text(s, 7.05, y, 0.3, 0.3, "◆", size=11)
    text(s, 7.4, y, 4.85, 0.6, f, size=11, color=INK, line=1.2)
    y += 0.57
tor_tag(s, "TOR ข้อ 4 + PDPA • Multi-tenant + Privacy")
page_no(s, num())

# ============================================================================
# SECTION DIVIDER — Architecture & Security
# ============================================================================
divider("SECTION 04", "สถาปัตยกรรม & Security", "10", "ความมั่นคงปลอดภัย — MFA + Session + DR Site = คะแนนเต็ม")

# 20. Architecture
s = slide()
kicker_title(s, "ARCHITECTURE", "สถาปัตยกรรมระบบ — แยกชั้น ปลอดภัย พร้อม DR", color=NAVY)
# tiers
def tier(x,y,w,h,title,items,c,bg):
    rect(s, x, y, w, h, fill=bg, line=c, lw=1.3, shape=MSO_SHAPE.ROUNDED_RECTANGLE, rad=0.05)
    rect(s, x, y, w, 0.34, fill=c, shape=MSO_SHAPE.ROUNDED_RECTANGLE, rad=0.12)
    rect(s, x, y+0.17, w, 0.17, fill=c)
    text(s, x, y, w, 0.34, title, size=11, color=INVERT, bold=True, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    text(s, x+0.15, y+0.42, w-0.3, h-0.5, items, size=9.5, color=INK, line=1.25)
tier(0.85, 2.05, 3.6, 1.35, "ผู้ใช้ / Edge", "• เบราว์เซอร์ (Chrome/Edge/FF/Safari)\n• CDN + WAF + HTTPS/TLS\n• Cache + Rate limit", NAVY, INFOBG)
text(s, 4.5, 2.5, 0.5, 0.5, "▶", size=18, color=BRAND)
tier(5.0, 2.05, 3.6, 1.35, "Front-end (Static)", "• HTML/CSS/JS render ล่วงหน้า\n• Schema JSON-LD\n• Lighthouse-optimized", BRAND, TINT)
text(s, 8.65, 2.5, 0.5, 0.5, "▶", size=18, color=BRAND)
tier(9.15, 2.05, 3.3, 1.35, "API Gateway", "• Reverse proxy\n• Auth / MFA\n• Traffic Log", ACTION, RGBColor(0xFB,0xEF,0xD6))
tier(0.85, 3.75, 5.6, 1.5, "Application — Strapi Headless CMS", "• 29 โมดูล + REST API • สิทธิ์ผู้ใช้/Role\n• Multi-tenant scoping • Document Service\n• AI Smart Search service • อีเมลอัตโนมัติ (SMTP)", BRAND, TINT)
text(s, 6.5, 4.4, 0.5, 0.5, "▶", size=18, color=BRAND)
tier(7.0, 3.75, 2.6, 1.5, "Data", "• ฐานข้อมูล\n• Media/Upload\n(บีบอัด+responsive)\n• Backup รายวัน", NAVY, INFOBG)
text(s, 9.6, 4.4, 0.5, 0.5, "⇄", size=18, color=OK)
tier(9.8, 3.75, 2.65, 1.5, "DR Site (Standby)", "• Active–Standby\n• Replication\n• RTO/RPO ≤ 1 ชม.", OK, RGBColor(0xE5,0xF4,0xE8))
card(s, 0.85, 5.55, 11.6, 1.0, fill=SUNKEN)
text(s, 1.1, 5.68, 11.1, 0.8,
     [[("Headless แยก Front-end ออกจาก CMS", {"bold":True,"color":NAVY}),
       (" → หน้าเว็บเป็น static (เร็ว+ปลอดภัย ลดพื้นที่โจมตี), หลังบ้านอยู่หลัง API Gateway + MFA, ", {"color":INK}),
       ("มี DR Site สำรองพร้อมสลับ", {"bold":True,"color":OK})]], size=11.5, line=1.3)
tor_tag(s, "TOR ข้อ 4 • System Architecture")
page_no(s, num())

# 21. Security
s = slide()
kicker_title(s, "SECURITY", "ความมั่นคงปลอดภัย — ครบเพื่อคะแนนเต็มหมวด Security", color=NAVY)
sec=[("MFA สำหรับ Back-Office","ยืนยันตัวตนหลายปัจจัยก่อนเข้าหลังบ้าน","◆",BRAND),
     ("Session / Idle Timeout","หมดเวลาอัตโนมัติเมื่อไม่ใช้งาน","◆",NAVY),
     ("SSL/TLS (HTTPS)","เข้ารหัสการรับส่งข้อมูลทุกหน้า","◆",ACTION),
     ("PDPA + Consent Log","คุ้มครองข้อมูลส่วนบุคคล + บันทึกความยินยอม","◆",OK),
     ("CAPTCHA + Validation","กันบอท + ตรวจสอบข้อมูลนำเข้า","◆",NAVY),
     ("Encryption + Traffic Log","เข้ารหัสข้อมูล + log ตาม พ.ร.บ.คอมพิวเตอร์","◆",ACTION),
     ("Vulnerability Scan","สแกนช่องโหว่ + Penetration Test (งวด 4)","◆",BRAND),
     ("Backup + DR Site","สำรองรายวัน + กู้คืน RTO/RPO ≤ 1 ชม.","◆",OK)]
for i,(t,d,ic,c) in enumerate(sec):
    cx=0.85+(i%2)*5.9
    cy=2.0+(i//2)*1.12
    card(s, cx, cy, 5.7, 0.98)
    rect(s, cx, cy, 0.1, 0.98, fill=c)
    text(s, cx+0.3, cy+0.2, 0.7, 0.6, ic, size=19)
    text(s, cx+1.05, cy+0.14, 4.5, 0.4, t, size=12.5, color=INK, bold=True)
    text(s, cx+1.07, cy+0.52, 4.5, 0.4, d, size=10, color=MUTED, line=1.1)
tor_tag(s, "TOR 6.1 Security (10%) • MFA + Session + DR")
page_no(s, num())

# 22. DR / Performance combined
s = slide()
kicker_title(s, "RESILIENCE & PERFORMANCE", "DR Site (RTO/RPO) + ประสิทธิภาพเว็บ", color=NAVY)
card(s, 0.85, 2.0, 5.7, 4.3)
text(s, 1.1, 2.15, 5, 0.35, "Disaster Recovery — คะแนนเต็ม Security", size=13.5, color=NAVY, bold=True)
text(s, 1.1, 2.6, 5.2, 0.6, "สถาปัตยกรรม Active–Standby: หาก Primary ล่ม สลับมา Standby ได้ตามเป้า", size=11, color=INK, line=1.25)
dr=[("RTO ≤ 1 ชม.","เวลากู้คืนระบบ"),("RPO ≤ 1 ชม.","ข้อมูลสูญเสียสูงสุด"),
    ("Backup รายวัน","หมุนเวียน 30 ชุด"),("Replication","ข้อมูลซิงค์ต่อเนื่อง")]
for j,(v,l) in enumerate(dr):
    kx=1.1+(j%2)*2.75; ky=3.35+(j//2)*1.35
    rect(s, kx, ky, 2.55, 1.15, fill=RGBColor(0xE5,0xF4,0xE8), shape=MSO_SHAPE.ROUNDED_RECTANGLE, rad=0.08)
    text(s, kx, ky+0.18, 2.55, 0.5, v, size=17, color=OK, bold=True, align=PP_ALIGN.CENTER, font=FEN)
    text(s, kx, ky+0.72, 2.55, 0.3, l, size=10, color=MUTED, align=PP_ALIGN.CENTER)
card(s, 6.75, 2.0, 5.7, 4.3)
text(s, 7.0, 2.15, 5, 0.35, "Page Speed / Lighthouse", size=13.5, color=NAVY, bold=True)
# gauges
metrics=[("Performance",96,OK),("Accessibility",100,OK),("Best Practices",95,OK),("SEO",100,OK)]
y=2.7
for name,val,c in metrics:
    text(s, 7.0, y, 3, 0.3, name, size=11, color=INK, bold=True)
    rect(s, 7.0, y+0.32, 4.0, 0.22, fill=SUNKEN, shape=MSO_SHAPE.ROUNDED_RECTANGLE, rad=0.5)
    rect(s, 7.0, y+0.32, 4.0*val/100, 0.22, fill=c, shape=MSO_SHAPE.ROUNDED_RECTANGLE, rad=0.5)
    text(s, 11.1, y+0.22, 1.0, 0.4, str(val), size=15, color=c, bold=True, font=FEN)
    y += 0.78
text(s, 7.0, 5.95, 5.3, 0.4, "ภาพ responsive อัตโนมัติ • lazy-load • self-host font • static = TTFB ต่ำ", size=10, color=MUTED, line=1.2)
tor_tag(s, "TOR Security (DR) + 4.1.6 Performance")
page_no(s, num())

# ============================================================================
# SECTION DIVIDER — Delivery
# ============================================================================
divider("SECTION 05", "แผนงาน • SLA • สาธิต", "20", "ส่งมอบ 4 งวด • รับประกัน 1 ปี • สาธิตสด 2 หน้า = 20 คะแนน")

# 23. Timeline 4 phases
s = slide()
kicker_title(s, "PROJECT PLAN", "แผนการดำเนินงาน 4 งวด — 365 วัน / 3,000,000 บาท", color=NAVY)
phases=[("งวด 1","ภายใน 30 วัน","10%","Project Plan • Requirement • Architecture • Server Spec",NAVY),
        ("งวด 2","ภายใน 60 วัน","40%","Design Concept • Sitemap • Mockup • Prototype • User Flow • CMS",BRAND),
        ("งวด 3","ภายใน 180 วัน","30%","Source Code • Test Script • UAT • User Manual • Backup",ACTION),
        ("งวด 4","ภายใน 365 วัน","20%","Warranty • อบรม Admin • Penetration Test • ส่งมอบ Source+License",OK)]
# gantt bar
text(s, 0.85, 1.95, 11, 0.3, "ไทม์ไลน์ (สัดส่วนตามระยะเวลา)", size=11, color=MUTED)
gx=0.85; gw=11.6; gy=2.35
spans=[30,30,120,185]; total=365
acc=0
for i,(p,d,pct,desc,c) in enumerate(phases):
    w=gw*spans[i]/total
    rect(s, gx+gw*acc/total, gy, w-0.05, 0.55, fill=c, shape=MSO_SHAPE.ROUNDED_RECTANGLE, rad=0.2)
    text(s, gx+gw*acc/total, gy, w-0.05, 0.55, p+" • "+pct, size=10.5, color=INVERT, bold=True, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    acc+=spans[i]
# detail cards
for i,(p,d,pct,desc,c) in enumerate(phases):
    cy=3.2+i*0.82
    card(s, 0.85, cy, 11.6, 0.72)
    rect(s, 0.85, cy, 0.1, 0.72, fill=c)
    text(s, 1.15, cy+0.08, 1.5, 0.55, p, size=15, color=c, bold=True, anchor=MSO_ANCHOR.MIDDLE)
    text(s, 2.5, cy+0.1, 1.6, 0.5, d, size=11, color=MUTED, anchor=MSO_ANCHOR.MIDDLE)
    chip(s, 4.0, cy+0.18, pct, fill=TINT, fg=c, w=0.85)
    text(s, 5.0, cy+0.08, 7.3, 0.6, desc, size=10.5, color=INK, anchor=MSO_ANCHOR.MIDDLE, line=1.15)
tor_tag(s, "TOR ข้อ 7–8 • งบ/งวดงาน")
page_no(s, num())

# 24. SLA + Warranty
s = slide()
kicker_title(s, "SLA & WARRANTY", "ระดับการให้บริการ (SLA) + การรับประกัน 1 ปี", color=NAVY)
sla=[("Critical","ระบบใช้งานไม่ได้ทั้งหมด","แก้ไขเริ่มใน 15 นาที",DANGER),
     ("High","ฟังก์ชันหลักใช้งานไม่ได้","แก้ไขเริ่มใน 1 ชม.",WARN),
     ("Medium","ฟังก์ชันรองมีปัญหา","แก้ไขใน 1 วันทำการ",NAVY),
     ("Low","ปัญหาเล็กน้อย/ปรับปรุง","แก้ไขใน 3 วันทำการ",OK)]
y=2.05
# header
hdr=["ระดับ","ลักษณะปัญหา","เป้าหมายตอบสนอง"]
rect(s, 0.85, y, 11.6, 0.5, fill=NAVY)
text(s, 1.1, y, 2.0, 0.5, hdr[0], size=12, color=INVERT, bold=True, anchor=MSO_ANCHOR.MIDDLE)
text(s, 3.2, y, 5.0, 0.5, hdr[1], size=12, color=INVERT, bold=True, anchor=MSO_ANCHOR.MIDDLE)
text(s, 8.5, y, 3.5, 0.5, hdr[2], size=12, color=INVERT, bold=True, anchor=MSO_ANCHOR.MIDDLE)
y+=0.5
for lvl,desc,resp,c in sla:
    rect(s, 0.85, y, 11.6, 0.7, fill=SURFACE, line=BORDER)
    rect(s, 0.85, y, 0.1, 0.7, fill=c)
    chip(s, 1.1, y+0.18, lvl, fill=SURFACE, fg=c, w=1.6, size=12)
    rect(s, 1.1, y+0.18, 1.6, 0.36, fill=None, line=c, lw=1.2, shape=MSO_SHAPE.ROUNDED_RECTANGLE, rad=0.5)
    text(s, 1.1, y+0.17, 1.6, 0.36, lvl, size=12, color=c, bold=True, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    text(s, 3.2, y, 5.0, 0.7, desc, size=11.5, color=INK, anchor=MSO_ANCHOR.MIDDLE)
    text(s, 8.5, y, 3.5, 0.7, resp, size=11.5, color=c, bold=True, anchor=MSO_ANCHOR.MIDDLE)
    y+=0.7
card(s, 0.85, y+0.15, 11.6, 1.0, fill=TINT, line=None)
text(s, 1.1, y+0.3, 11.1, 0.8,
     [[("รับประกัน 1 ปี", {"bold":True,"color":ACTION}),
       (" — Monitoring 24/7 • อบรมผู้ดูแลระบบ • Penetration Test • ส่งมอบ Source Code + License + Admin Accounts ครบถ้วน", {"color":INK})]],
     size=12, line=1.3)
tor_tag(s, "TOR ข้อ 8 • SLA 4 ระดับ + Warranty")
page_no(s, num())

# 25. Live demo
s = slide()
kicker_title(s, "LIVE DEMONSTRATION", "การสาธิตสด — เว็บทำงานจริง (2 หน้า = 20 คะแนน)", color=NAVY)
demo=[("หน้าแรก + AI Smart Search","สาธิต: ค้นหา “มาตรฐาน EA” → ผลลัพธ์ + คำตอบ AI + เปลี่ยน TH/EN + โหมดมืด",BRAND,"1"),
      ("หลังบ้าน WebX Console","สาธิต: ล็อกอิน (MFA) → ดู Analytics → แก้เนื้อหา WYSIWYG → ส่งออก Excel",NAVY,"2")]
for i,(t,d,c,n) in enumerate(demo):
    cy=2.1+i*1.6
    card(s, 0.85, cy, 11.6, 1.4)
    rect(s, 0.85, cy, 1.3, 1.4, fill=c, shape=MSO_SHAPE.ROUNDED_RECTANGLE, rad=0.05)
    rect(s, 1.9, cy, 0.25, 1.4, fill=c)
    text(s, 0.85, cy, 1.3, 1.4, n, size=44, color=INVERT, bold=True, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE, font=FEN)
    text(s, 2.4, cy+0.25, 9.7, 0.4, t, size=16, color=INK, bold=True)
    text(s, 2.42, cy+0.72, 9.7, 0.5, d, size=12, color=MUTED, line=1.25)
card(s, 0.85, 5.5, 11.6, 1.05, fill=RGBColor(0xE5,0xF4,0xE8), line=None)
text(s, 1.1, 5.62, 11.1, 0.85,
     [[("ทั้ง 2 หน้าเป็นต้นแบบที่ทำงานได้จริง", {"bold":True,"color":OK}),
       (" (ไม่ใช่ภาพนิ่ง) — รันบนเครื่องสาธิต พร้อมตอบคำถามกรรมการแบบ interactive ระหว่างนำเสนอ", {"color":INK})]],
     size=12.5, line=1.3)
tor_tag(s, "TOR 6.1 การสาธิต (20%) • 2 หน้าทำงานจริง")
page_no(s, num())

# 26. Scoring summary
s = slide()
kicker_title(s, "WHY WE WIN", "สรุปการทำคะแนนตามเกณฑ์ TOR ข้อ 6.1", "ผูกข้อเสนอกับทุกเกณฑ์ — เป้าหมาย 100 คะแนน")
rows=[("Design & UX/UI","50","Design System+Figma • 3-Click+Sitemap • WCAG AA • Responsive • Mockup 3×5","50",BRAND),
      ("การนำเสนอ/สาธิต","20","สาธิตสด 2 หน้าทำงานจริง (หน้าแรก+AI / หลังบ้าน Console)","20",NAVY),
      ("ราคา","20","Price Performance — สถาปัตยกรรม static ลดต้นทุน hosting/ดูแล","—",MUTED),
      ("Security","10","MFA + Session timeout + DR Site (RTO/RPO) ครบ","10",OK)]
y=2.35
rect(s, 0.85, y, 11.6, 0.5, fill=INK)
for cx,w,h in [(1.1,4.3,"หมวดเกณฑ์"),(5.5,1.3,"น้ำหนัก"),(6.9,5.2,"ข้อเสนอของเรา"),(0,0,"")]:
    pass
text(s, 1.1, y, 3.5, 0.5, "หมวดเกณฑ์", size=12, color=INVERT, bold=True, anchor=MSO_ANCHOR.MIDDLE)
text(s, 4.7, y, 1.2, 0.5, "น้ำหนัก", size=12, color=INVERT, bold=True, anchor=MSO_ANCHOR.MIDDLE, align=PP_ALIGN.CENTER)
text(s, 6.0, y, 5.0, 0.5, "ข้อเสนอของเราที่ตอบเกณฑ์", size=12, color=INVERT, bold=True, anchor=MSO_ANCHOR.MIDDLE)
text(s, 11.3, y, 1.0, 0.5, "เป้า", size=12, color=INVERT, bold=True, anchor=MSO_ANCHOR.MIDDLE, align=PP_ALIGN.CENTER)
y+=0.5
for cat,wt,prop,target,c in rows:
    rect(s, 0.85, y, 11.6, 0.82, fill=SURFACE, line=BORDER)
    rect(s, 0.85, y, 0.1, 0.82, fill=c)
    text(s, 1.1, y, 3.5, 0.82, cat, size=12.5, color=INK, bold=True, anchor=MSO_ANCHOR.MIDDLE)
    text(s, 4.7, y, 1.2, 0.82, wt, size=18, color=c, bold=True, anchor=MSO_ANCHOR.MIDDLE, align=PP_ALIGN.CENTER, font=FEN)
    text(s, 6.0, y, 5.1, 0.82, prop, size=10.5, color=INK, anchor=MSO_ANCHOR.MIDDLE, line=1.15)
    text(s, 11.3, y, 1.0, 0.82, target, size=16, color=OK if target!="—" else MUTED, bold=True, anchor=MSO_ANCHOR.MIDDLE, align=PP_ALIGN.CENTER, font=FEN)
    y+=0.82
rect(s, 0.85, y, 11.6, 0.6, fill=NAVY, shape=MSO_SHAPE.ROUNDED_RECTANGLE, rad=0.1)
text(s, 1.1, y, 9, 0.6, "รวมคะแนนเทคนิคที่ควบคุมได้ (ไม่รวมราคาเชิงแข่งขัน)", size=13, color=INVERT, bold=True, anchor=MSO_ANCHOR.MIDDLE)
text(s, 10.5, y, 1.8, 0.6, "80 / 80", size=20, color=BRAND, bold=True, anchor=MSO_ANCHOR.MIDDLE, align=PP_ALIGN.CENTER, font=FEN)
page_no(s, num())

# 27. Thank you
s = slide(DARK1)
rect(s,0,0,SW,SH,fill=DARK1)
rect(s, 0, 0, 0.36, SH, fill=BRAND)
text(s, 1.0, 2.6, 11, 1.0, "ขอบคุณครับ", size=48, color=INVERT, bold=True)
text(s, 1.02, 3.9, 11, 0.5, "พร้อมสาธิตระบบที่ทำงานจริง และตอบทุกคำถามของคณะกรรมการ", size=16, color=RGBColor(0xC9,0xCA,0xD0))
rect(s, 1.0, 4.7, 3.0, 0.02, fill=BRAND)
text(s, 1.0, 4.95, 11, 0.4, "บริษัท อวาแลนท์ จำกัด (Avalant)  •  Everyday AI", size=14, color=INVERT, bold=True)
text(s, 1.0, 5.4, 11, 0.4, "โครงการออกแบบและพัฒนาระบบเว็บไซต์ สพร. (dga.or.th)  •  TOR DGA-69-0177", size=12, color=MUTED, font=FEN)

import os
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dga_presentation_th.pptx")
prs.save(out)
print("OK saved:", out)
print("slides:", len(prs.slides._sldIdLst))
