#!/usr/bin/env python3
"""
Hourly public-news builder for GORICS.CLOUD News.

Privacy stance:
- Uses only public RSS/Atom feeds.
- Does not read, store, transmit, or infer visitor/user personal data.
- Removes common personal-data patterns from RSS text before publishing.
- Publishes headlines, short snippets, source labels, original links, and timestamps only.
"""

from __future__ import annotations

import email.utils
import hashlib
import html
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


ROOT = Path(__file__).resolve().parents[1]
OUT_PATH = ROOT / "data" / "news.json"

USER_AGENT = (
    "Mozilla/5.0 (compatible; GORICS-NewsBot/1.0; "
    "+https://gorics.github.io/website/)"
)
REQUEST_TIMEOUT = 18
MAX_PER_THEME = 45
MAX_TOTAL = 420

THEMES: dict[str, list[str]] = {
    "종합": [
        "https://news.google.com/rss?hl=ko&gl=KR&ceid=KR:ko",
    ],
    "정치·사회": [
        "https://news.google.com/rss/search?q=%EC%A0%95%EC%B9%98%20OR%20%EC%82%AC%ED%9A%8C%20when:1d&hl=ko&gl=KR&ceid=KR:ko",
        "https://news.google.com/rss/search?q=%EB%8C%80%ED%95%9C%EB%AF%BC%EA%B5%AD%20%EC%A0%95%EC%B1%85%20when:1d&hl=ko&gl=KR&ceid=KR:ko",
    ],
    "경제·금융": [
        "https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=ko&gl=KR&ceid=KR:ko",
        "https://news.google.com/rss/search?q=%EA%B2%BD%EC%A0%9C%20OR%20%EA%B8%88%EC%9C%B5%20OR%20%EC%A6%9D%EC%8B%9C%20when:1d&hl=ko&gl=KR&ceid=KR:ko",
    ],
    "국제": [
        "https://news.google.com/rss/headlines/section/topic/WORLD?hl=ko&gl=KR&ceid=KR:ko",
    ],
    "AI·테크": [
        "https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=ko&gl=KR&ceid=KR:ko",
        "https://news.google.com/rss/search?q=AI%20OR%20%EC%9D%B8%EA%B3%B5%EC%A7%80%EB%8A%A5%20OR%20%EB%B0%98%EB%8F%84%EC%B2%B4%20when:1d&hl=ko&gl=KR&ceid=KR:ko",
    ],
    "과학": [
        "https://news.google.com/rss/headlines/section/topic/SCIENCE?hl=ko&gl=KR&ceid=KR:ko",
    ],
    "건강": [
        "https://news.google.com/rss/headlines/section/topic/HEALTH?hl=ko&gl=KR&ceid=KR:ko",
    ],
    "문화·엔터": [
        "https://news.google.com/rss/headlines/section/topic/ENTERTAINMENT?hl=ko&gl=KR&ceid=KR:ko",
        "https://news.google.com/rss/search?q=%EB%AC%B8%ED%99%94%20OR%20%EC%98%81%ED%99%94%20OR%20%EA%B3%B5%EC%97%B0%20when:1d&hl=ko&gl=KR&ceid=KR:ko",
    ],
    "스포츠": [
        "https://news.google.com/rss/headlines/section/topic/SPORTS?hl=ko&gl=KR&ceid=KR:ko",
    ],
    "교육·입시": [
        "https://news.google.com/rss/search?q=%EA%B5%90%EC%9C%A1%20OR%20%EC%9E%85%EC%8B%9C%20OR%20%EC%88%98%EB%8A%A5%20when:7d&hl=ko&gl=KR&ceid=KR:ko",
    ],
}

PERSONAL_DATA_PATTERNS = [
    re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"),
    re.compile(r"\b(?:\+?82[-.\s]?)?0?1[016789][-.\s]?\d{3,4}[-.\s]?\d{4}\b"),
    re.compile(r"\b\d{2,3}[-.\s]?\d{3,4}[-.\s]?\d{4}\b"),
    re.compile(r"\b\d{6}[-\s]?[1-4]\d{6}\b"),
    re.compile(r"\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b"),
    re.compile(r"(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)[^\n]{0,30}(?:로|길)\s?\d{1,4}(?:-\d{1,4})?"),
]

TAG_HINTS = {
    "AI": ["AI", "인공지능", "오픈AI", "챗GPT", "반도체", "엔비디아", "로봇"],
    "경제": ["금리", "증시", "환율", "물가", "부동산", "수출", "실적", "경제"],
    "정책": ["정부", "국회", "정책", "법안", "대통령", "총리", "교육부"],
    "국제": ["미국", "중국", "일본", "유럽", "러시아", "우크라이나", "이스라엘"],
    "건강": ["의료", "병원", "건강", "백신", "감염", "질병"],
    "교육": ["교육", "입시", "수능", "대학", "학교", "학생"],
    "스포츠": ["축구", "야구", "농구", "배구", "올림픽", "월드컵"],
}


@dataclass
class NewsItem:
    title: str
    link: str
    source: str
    theme: str
    published_at: str
    summary: str
    tags: list[str]
    id: str
    score: float


def strip_html(raw: str) -> str:
    text = re.sub(r"<[^>]+>", " ", raw or "")
    text = html.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def sanitize_text(text: str, limit: int = 320) -> str:
    cleaned = strip_html(text)
    for pattern in PERSONAL_DATA_PATTERNS:
        cleaned = pattern.sub("[비공개]", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if len(cleaned) > limit:
        cleaned = cleaned[: limit - 1].rstrip() + "…"
    return cleaned


def normalize_title(title: str) -> str:
    title = sanitize_text(title, 180)
    title = re.sub(r"\s+-\s+[^-]{1,40}$", "", title)
    return title.strip(" -|·")


def parse_datetime(value: str) -> datetime:
    if not value:
        return datetime.now(timezone.utc)
    try:
        parsed = email.utils.parsedate_to_datetime(value)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except Exception:
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
        except Exception:
            return datetime.now(timezone.utc)


def guess_tags(text: str, theme: str) -> list[str]:
    tags = [theme]
    for tag, words in TAG_HINTS.items():
        if any(word.lower() in text.lower() for word in words):
            tags.append(tag)
    result: list[str] = []
    for tag in tags:
        if tag not in result:
            result.append(tag)
    return result[:5]


def item_hash(title: str, link: str) -> str:
    return hashlib.sha256(f"{title}|{link}".encode("utf-8")).hexdigest()[:16]


def fetch_xml(url: str) -> ET.Element | None:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT) as response:
            payload = response.read()
        return ET.fromstring(payload)
    except (urllib.error.URLError, TimeoutError, ET.ParseError, ValueError) as exc:
        print(f"[WARN] feed failed: {url} -> {exc}", file=sys.stderr)
        return None


def text_of(parent: ET.Element, names: Iterable[str]) -> str:
    for name in names:
        found = parent.find(name)
        if found is not None and found.text:
            return found.text.strip()
    return ""


def source_of(item: ET.Element) -> str:
    for child in list(item):
        if child.tag.lower().endswith("source"):
            return (child.text or "").strip() or child.attrib.get("url", "").strip()
    return ""


def iter_feed_items(root: ET.Element, theme: str) -> Iterable[NewsItem]:
    channel_items = root.findall(".//item")
    atom_entries = root.findall(".//{http://www.w3.org/2005/Atom}entry")
    raw_items = channel_items or atom_entries

    now = datetime.now(timezone.utc)
    for raw in raw_items:
        title = normalize_title(text_of(raw, ["title", "{http://www.w3.org/2005/Atom}title"]))
        if not title:
            continue

        link = text_of(raw, ["link", "guid", "{http://www.w3.org/2005/Atom}id"])
        for child in list(raw):
            if child.tag.endswith("link") and child.attrib.get("href"):
                link = child.attrib["href"]
                break
        if not link:
            continue

        published_raw = text_of(
            raw,
            ["pubDate", "published", "updated", "{http://www.w3.org/2005/Atom}published", "{http://www.w3.org/2005/Atom}updated"],
        )
        published = parse_datetime(published_raw)
        age_hours = max((now - published).total_seconds() / 3600, 0.0)

        description = text_of(raw, ["description", "summary", "{http://www.w3.org/2005/Atom}summary"])
        summary = sanitize_text(description, 360)
        if summary == title:
            summary = ""

        source = sanitize_text(source_of(raw), 80) or "공개 RSS"
        combined = f"{title} {summary} {source}"
        tags = guess_tags(combined, theme)

        score = max(0.0, 100.0 - age_hours) + (8.0 if theme in {"종합", "AI·테크", "경제·금융"} else 0.0)

        yield NewsItem(
            title=title,
            link=link,
            source=source,
            theme=theme,
            published_at=published.isoformat().replace("+00:00", "Z"),
            summary=summary,
            tags=tags,
            id=item_hash(title, link),
            score=round(score, 3),
        )


def collect_news() -> dict:
    seen: set[str] = set()
    by_theme: dict[str, list[NewsItem]] = {theme: [] for theme in THEMES}

    for theme, urls in THEMES.items():
        for url in urls:
            root = fetch_xml(url)
            if root is None:
                continue
            for item in iter_feed_items(root, theme):
                key = re.sub(r"\W+", "", item.title.lower())[:80]
                if key in seen:
                    continue
                seen.add(key)
                by_theme[theme].append(item)
            time.sleep(0.6)

    final_by_theme: dict[str, list[dict]] = {}
    all_items: list[NewsItem] = []
    for theme, items in by_theme.items():
        items.sort(key=lambda n: (n.score, n.published_at), reverse=True)
        selected = items[:MAX_PER_THEME]
        final_by_theme[theme] = [item.__dict__ for item in selected]
        all_items.extend(selected)

    all_items.sort(key=lambda n: (n.score, n.published_at), reverse=True)
    all_items = all_items[:MAX_TOTAL]

    return {
        "site": "GORICS.CLOUD NEWS",
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "privacy": {
            "collects_personal_data": False,
            "uses_cookies": False,
            "uses_analytics": False,
            "source": "public RSS only",
            "sanitization": "email/phone/id/card/address-like patterns are redacted before publishing",
        },
        "theme_order": list(THEMES.keys()),
        "total": len(all_items),
        "items": [item.__dict__ for item in all_items],
        "themes": final_by_theme,
    }


def main() -> int:
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = collect_news()

    if payload["total"] == 0 and OUT_PATH.exists():
        print("[WARN] no new items; keeping existing news.json", file=sys.stderr)
        return 0

    tmp = OUT_PATH.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(OUT_PATH)

    print(f"[OK] wrote {payload['total']} items to {OUT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
