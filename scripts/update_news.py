#!/usr/bin/env python3
"""
Hourly public-news builder for GORICS.CLOUD News.

Privacy stance:
- Uses only public RSS/Atom feeds.
- Does not read, store, transmit, or infer visitor/user personal data.
- Removes common sensitive personal-data patterns from RSS text before publishing.
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
    "Mozilla/5.0 (compatible; GORICS-NewsBot/2.0; "
    "+https://gorics.github.io/website/)"
)
REQUEST_TIMEOUT = 20
MAX_PER_THEME = 80
MAX_TOTAL = 1000
SLEEP_BETWEEN_FEEDS = 0.35


def google_topic(topic: str) -> str:
    return f"https://news.google.com/rss/headlines/section/topic/{topic}?hl=ko&gl=KR&ceid=KR:ko"


def google_search(query: str, days: int = 1) -> str:
    encoded = urllib.parse.quote(f"({query}) when:{days}d", safe="")
    return f"https://news.google.com/rss/search?q={encoded}&hl=ko&gl=KR&ceid=KR:ko"


THEMES: dict[str, list[str]] = {
    "종합": [
        "https://news.google.com/rss?hl=ko&gl=KR&ceid=KR:ko",
        google_search("속보 OR 단독 OR 긴급 OR 발표 OR 논란 OR 확산", 1),
    ],
    "정치·사회": [
        google_topic("NATION"),
        google_search("정치 OR 국회 OR 정부 OR 정책 OR 대통령 OR 총리", 1),
        google_search("사회 OR 사건 OR 검찰 OR 경찰 OR 재판 OR 안전", 1),
    ],
    "경제·금융": [
        google_topic("BUSINESS"),
        google_search("경제 OR 금융 OR 증시 OR 코스피 OR 환율 OR 금리 OR 물가", 1),
        google_search("반도체 OR 배터리 OR 수출 OR 실적 OR 기업 OR 스타트업", 1),
    ],
    "국제": [
        google_topic("WORLD"),
        google_search("미국 OR 중국 OR 일본 OR 유럽 OR 러시아 OR 우크라이나", 1),
        google_search("중동 OR 이스라엘 OR 국제정세 OR 외교 OR 무역", 1),
    ],
    "AI·테크": [
        google_topic("TECHNOLOGY"),
        google_search("AI OR 인공지능 OR 생성형AI OR 챗GPT OR 오픈AI OR 반도체", 1),
        google_search("빅테크 OR 엔비디아 OR 로봇 OR 클라우드 OR 사이버보안", 1),
    ],
    "과학": [
        google_topic("SCIENCE"),
        google_search("과학 OR 우주 OR 연구 OR NASA OR 양자 OR 바이오", 3),
    ],
    "건강": [
        google_topic("HEALTH"),
        google_search("건강 OR 의료 OR 의대 OR 병원 OR 감염병 OR 백신 OR 식약처", 2),
    ],
    "문화·엔터": [
        google_topic("ENTERTAINMENT"),
        google_search("문화 OR 영화 OR 공연 OR 드라마 OR 음악 OR 웹툰 OR OTT", 1),
    ],
    "스포츠": [
        google_topic("SPORTS"),
        google_search("축구 OR 야구 OR 농구 OR 배구 OR 골프 OR 올림픽 OR 월드컵", 1),
    ],
    "교육·입시": [
        google_search("교육 OR 입시 OR 수능 OR 모의고사 OR 대학 OR 교육부", 7),
        google_search("고3 OR 재수 OR 사교육 OR 대입 OR 정시 OR 수시", 7),
    ],
    "기후·환경": [
        google_search("기후 OR 환경 OR 폭염 OR 장마 OR 미세먼지 OR 탄소 OR 에너지", 2),
    ],
    "부동산": [
        google_search("부동산 OR 아파트 OR 전세 OR 월세 OR 재건축 OR 청약", 2),
    ],
    "자동차·모빌리티": [
        google_search("자동차 OR 전기차 OR 현대차 OR 기아 OR 테슬라 OR 모빌리티", 2),
    ],
    "게임·콘텐츠": [
        google_search("게임 OR e스포츠 OR 넥슨 OR 엔씨 OR 크래프톤 OR 콘텐츠", 2),
    ],
    "생활·트렌드": [
        google_search("생활 OR 소비 OR 트렌드 OR 여행 OR 날씨 OR 음식 OR 유통", 2),
    ],
}

PERSONAL_DATA_PATTERNS = [
    re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"),
    re.compile(r"\b(?:\+?82[-.\s]?)?0?1[016789][-.\s]?\d{3,4}[-.\s]?\d{4}\b"),
    re.compile(r"\b\d{2,3}[-.\s]?\d{3,4}[-.\s]?\d{4}\b"),
    re.compile(r"\b\d{6}[-\s]?[1-4]\d{6}\b"),
    re.compile(r"\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b"),
    re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b"),
    re.compile(r"\b(?:[A-Za-z0-9_-]{20,}\.){1,2}[A-Za-z0-9_-]{20,}\b"),
    re.compile(r"(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)[^\n]{0,30}(?:로|길)\s?\d{1,4}(?:-\d{1,4})?"),
]

TAG_HINTS = {
    "속보": ["속보", "긴급", "단독", "발표", "확산", "급등", "급락"],
    "AI": ["AI", "인공지능", "오픈AI", "챗GPT", "생성형", "반도체", "엔비디아", "로봇"],
    "경제": ["금리", "증시", "환율", "물가", "부동산", "수출", "실적", "경제", "코스피"],
    "정책": ["정부", "국회", "정책", "법안", "대통령", "총리", "교육부"],
    "국제": ["미국", "중국", "일본", "유럽", "러시아", "우크라이나", "이스라엘", "중동"],
    "건강": ["의료", "병원", "건강", "백신", "감염", "질병", "식약처"],
    "교육": ["교육", "입시", "수능", "대학", "학교", "학생", "정시", "수시"],
    "스포츠": ["축구", "야구", "농구", "배구", "올림픽", "월드컵", "골프"],
    "환경": ["기후", "환경", "폭염", "장마", "탄소", "에너지", "미세먼지"],
}

TRACKING_PARAMS = {
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "fbclid", "gclid", "mc_cid", "mc_eid", "igshid", "ref", "spm",
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


def clean_link(url: str) -> str:
    url = html.unescape((url or "").strip())
    try:
        parsed = urllib.parse.urlsplit(url)
        query = [
            (k, v)
            for k, v in urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
            if k.lower() not in TRACKING_PARAMS
        ]
        return urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, parsed.path, urllib.parse.urlencode(query), ""))
    except Exception:
        return url


def source_from_url(url: str) -> str:
    try:
        host = urllib.parse.urlsplit(url).netloc.lower().removeprefix("www.")
        return host or "공개 RSS"
    except Exception:
        return "공개 RSS"


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
    lower = text.lower()
    tags = [theme]
    for tag, words in TAG_HINTS.items():
        if any(word.lower() in lower for word in words):
            tags.append(tag)
    result: list[str] = []
    for tag in tags:
        if tag not in result:
            result.append(tag)
    return result[:6]


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


def source_of(item: ET.Element, fallback_url: str) -> str:
    for child in list(item):
        if child.tag.lower().endswith("source"):
            return (child.text or "").strip() or child.attrib.get("url", "").strip()
    return source_from_url(fallback_url)


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
        link = clean_link(link)
        if not link:
            continue

        published_raw = text_of(
            raw,
            ["pubDate", "published", "updated", "{http://www.w3.org/2005/Atom}published", "{http://www.w3.org/2005/Atom}updated"],
        )
        published = parse_datetime(published_raw)
        age_hours = max((now - published).total_seconds() / 3600, 0.0)

        description = text_of(raw, ["description", "summary", "{http://www.w3.org/2005/Atom}summary"])
        summary = sanitize_text(description, 420)
        if summary == title:
            summary = ""

        source = sanitize_text(source_of(raw, link), 80) or "공개 RSS"
        combined = f"{title} {summary} {source}"
        tags = guess_tags(combined, theme)

        hot_bonus = 0.0
        if any(word in combined for word in ("속보", "긴급", "단독")):
            hot_bonus += 18.0
        if theme in {"종합", "AI·테크", "경제·금융", "정치·사회"}:
            hot_bonus += 8.0
        if age_hours <= 6:
            hot_bonus += 6.0

        score = max(0.0, 120.0 - age_hours * 2.2) + hot_bonus

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


def normalized_title_key(title: str) -> str:
    key = re.sub(r"[^0-9A-Za-z가-힣]+", "", title.lower())
    return key[:100]


def collect_news() -> dict:
    seen_titles: set[str] = set()
    seen_links: set[str] = set()
    by_theme: dict[str, list[NewsItem]] = {theme: [] for theme in THEMES}

    for theme, urls in THEMES.items():
        for url in urls:
            root = fetch_xml(url)
            if root is None:
                continue
            for item in iter_feed_items(root, theme):
                title_key = normalized_title_key(item.title)
                link_key = item.link
                if title_key in seen_titles or link_key in seen_links:
                    continue
                seen_titles.add(title_key)
                seen_links.add(link_key)
                by_theme[theme].append(item)
            time.sleep(SLEEP_BETWEEN_FEEDS)

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
            "source": "public RSS/Atom only",
            "sanitization": "email/phone/id/card/ip/token/address-like patterns are redacted before publishing",
            "visitor_tracking": "none",
        },
        "theme_order": list(THEMES.keys()),
        "feed_count": sum(len(urls) for urls in THEMES.values()),
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
