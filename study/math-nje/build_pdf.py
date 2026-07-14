from pathlib import Path
import glob
import re

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parent
SOURCE_DIR = ROOT / "source"
OUTPUT = ROOT / "latest.pdf"
FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
    "/usr/share/fonts/truetype/nanum/NanumBarunGothic.ttf",
]

font_path = next((p for p in FONT_CANDIDATES if Path(p).exists()), None)
if font_path is None:
    raise FileNotFoundError("Nanum Korean font was not found")

pdfmetrics.registerFont(TTFont("Nanum", font_path))
PAGE_W, PAGE_H = A4
LEFT = 15 * mm
RIGHT = 15 * mm
TOP = 15 * mm
BOTTOM = 14 * mm
MAX_WIDTH = PAGE_W - LEFT - RIGHT

parts = [Path(p) for p in sorted(glob.glob(str(SOURCE_DIR / "part-*.txt")))]
if not parts:
    raise FileNotFoundError("No source/part-*.txt files")
text = "".join(p.read_text(encoding="utf-8") for p in parts)
pages = text.split("\f")
if pages and not pages[-1].strip():
    pages.pop()

c = canvas.Canvas(str(OUTPUT), pagesize=A4, pageCompression=1)
c.setTitle("2027 수능 수학 N제 최신 완성본")
c.setAuthor("OpenAI")
c.setSubject("평가원형 초고난도 수학 N제 영구 보관용 GitHub 미러")
seen_items = set()


def wrap_line(line: str, font_size: float):
    if not line:
        return [""]
    result = []
    current = ""
    for ch in line.expandtabs(4):
        candidate = current + ch
        if current and pdfmetrics.stringWidth(candidate, "Nanum", font_size) > MAX_WIDTH:
            result.append(current)
            current = ch
        else:
            current = candidate
    result.append(current)
    return result


for page_index, page in enumerate(pages, start=1):
    raw_lines = page.replace("\r", "").split("\n")
    nonblank = [ln.strip() for ln in raw_lines if ln.strip()]
    first = nonblank[0] if nonblank else ""
    match = re.match(r"^(\d+)번", first)
    if match:
        item_no = int(match.group(1))
        if item_no not in seen_items:
            key = f"item-{item_no}"
            c.bookmarkPage(key)
            c.addOutlineEntry(f"{item_no}번", key, level=0, closed=False)
            seen_items.add(item_no)

    estimated = max(1, sum(max(1, len(ln) // 70 + 1) for ln in raw_lines))
    if estimated <= 55:
        font_size, leading = 9.2, 12.0
    elif estimated <= 68:
        font_size, leading = 8.2, 10.5
    else:
        font_size, leading = 7.3, 9.0

    c.setFont("Nanum", font_size)
    y = PAGE_H - TOP
    for raw in raw_lines:
        wrapped = wrap_line(raw.rstrip(), font_size)
        for line in wrapped:
            if y < BOTTOM + leading:
                c.setFont("Nanum", 7)
                c.drawRightString(PAGE_W - RIGHT, 8 * mm, f"{page_index}")
                c.showPage()
                c.setFont("Nanum", font_size)
                y = PAGE_H - TOP
            c.drawString(LEFT, y, line)
            y -= leading
    c.setFont("Nanum", 7)
    c.drawRightString(PAGE_W - RIGHT, 8 * mm, f"{page_index}")
    c.showPage()

c.save()
print(f"Built {OUTPUT} from {len(parts)} source parts and {len(pages)} source pages")
