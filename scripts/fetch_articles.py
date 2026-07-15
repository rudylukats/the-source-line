#!/usr/bin/env python3
"""
Pulls RSS feeds from independent/investigative news sources and writes
articles.json for The Source Line static site.

Run manually:   python scripts/fetch_articles.py
Run on schedule: .github/workflows/fetch-articles.yml (every 3 hours)
"""

import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from html import unescape

import feedparser

FEEDS = {
    "Dropsite News": "https://www.dropsitenews.com/feed",
    "ProPublica": "https://www.propublica.org/feeds/propublica/main",
    "ICIJ": "https://www.icij.org/feed/",
    "Al Jazeera": "https://www.aljazeera.com/xml/rss/all.xml",
    "The Markup": "https://themarkup.org/feeds/rss.xml",
}

MAX_ARTICLES = 60
PER_SOURCE_MAX = 18
MAX_EXCERPT_LEN = 220
FEATURED_COUNT = 3

TAG_RE = re.compile(r"<[^>]+>")


def clean_text(raw):
    if not raw:
        return ""
    text = unescape(TAG_RE.sub("", raw)).strip()
    text = re.sub(r"\s+", " ", text)
    if len(text) > MAX_EXCERPT_LEN:
        text = text[:MAX_EXCERPT_LEN].rsplit(" ", 1)[0] + "..."
    return text


def article_id(link):
    return hashlib.sha1(link.encode("utf-8")).hexdigest()[:12]


def parse_published(entry):
    for key in ("published_parsed", "updated_parsed"):
        val = getattr(entry, key, None)
        if val:
            return datetime(*val[:6], tzinfo=timezone.utc)
    # No real timestamp in the feed (some feeds include pinned/promo items,
    # e.g. a "Donate" link, with no pubDate). Push these to the back instead
    # of letting them masquerade as the newest thing in the feed.
    return datetime(1970, 1, 1, tzinfo=timezone.utc)


def fetch_source(name, url):
    parsed = feedparser.parse(url)
    if parsed.bozo and not parsed.entries:
        print(f"WARNING: failed to parse {name} ({url}): {parsed.bozo_exception}", file=sys.stderr)
        return []

    items = []
    for entry in parsed.entries:
        link = entry.get("link")
        title = clean_text(entry.get("title", ""))
        if not link or not title:
            continue
        summary = entry.get("summary", "") or entry.get("description", "")
        items.append(
            {
                "id": article_id(link),
                "source": name,
                "headline": title,
                "excerpt": clean_text(summary),
                "link": link,
                "published": parse_published(entry).isoformat(),
            }
        )
    return items


def main():
    all_items = []
    for name, url in FEEDS.items():
        try:
            items = fetch_source(name, url)
            # Cap per source so one prolific outlet (e.g. a wire service)
            # can't crowd out the others, keep each source's own newest first
            items.sort(key=lambda a: a["published"], reverse=True)
            items = items[:PER_SOURCE_MAX]
            print(f"{name}: {len(items)} items (capped at {PER_SOURCE_MAX})")
            all_items.extend(items)
        except Exception as exc:
            print(f"ERROR fetching {name}: {exc}", file=sys.stderr)

    # Dedupe by id (hash of link), sort newest first, cap list length
    dedup = {item["id"]: item for item in all_items}
    articles = sorted(dedup.values(), key=lambda a: a["published"], reverse=True)
    articles = articles[:MAX_ARTICLES]

    for i, article in enumerate(articles):
        article["featured"] = i < FEATURED_COUNT

    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "articles": articles,
    }

    with open("articles.json", "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"Wrote {len(articles)} articles to articles.json")


if __name__ == "__main__":
    main()
