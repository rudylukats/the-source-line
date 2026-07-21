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
from datetime import datetime, timedelta, timezone
from html import unescape

import feedparser

FEEDS = {
    # --- original five ---
    "Dropsite News": "https://www.dropsitenews.com/feed",
    "ProPublica": "https://www.propublica.org/feeds/propublica/main",
    "ICIJ": "https://www.icij.org/feed/",
    "Al Jazeera": "https://www.aljazeera.com/xml/rss/all.xml",
    "The Markup": "https://themarkup.org/feeds/rss.xml",
    # --- added, feed URLs verified working ---
    "OCCRP": "https://www.occrp.org/en/feed",
    "Bellingcat": "https://www.bellingcat.com/feed/",
    "The Intercept": "https://theintercept.com/feed/?rss",
    "The Lever": "https://www.levernews.com/rss/",
    "404 Media": "https://www.404media.co/rss/",
    "Rest of World": "https://restofworld.org/feed/latest/",
    # --- added, NOT verified. Watch the Action log for a WARNING on these. ---
    "Reveal": "https://revealnews.org/feed/",
}

# Not enabled: The Bureau of Investigative Journalism and OpenSecrets returned
# nothing at /feed, /rss or /feed.xml, so they may no longer publish RSS. If you
# find working URLs, add them above and they will flow through automatically.

MAX_ARTICLES = 60
# Lower cap now that there are many more sources, so no single prolific outlet
# (Al Jazeera publishes dozens a day) can occupy a large share of the page.
PER_SOURCE_MAX = 8
# Drop anything older than this. A feed can keep responding long after an outlet
# stops publishing to it (Reveal's feed served items up to 15 months old), and
# without this one dead feed puts year-old stories on the front page.
MAX_AGE_DAYS = 30
# If almost nothing is fresh (feeds down, outage), top back up with older items
# rather than shipping an empty page.
MIN_ARTICLES = 12
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
    cutoff = (datetime.now(timezone.utc) - timedelta(days=MAX_AGE_DAYS)).isoformat()
    by_source = {}
    all_seen = {}  # every item we saw, unfiltered, used only as a fallback

    for name, url in FEEDS.items():
        try:
            items = fetch_source(name, url)
            items.sort(key=lambda a: a["published"], reverse=True)
            for item in items:
                all_seen.setdefault(item["id"], item)

            fresh = [a for a in items if a["published"] >= cutoff]
            stale = len(items) - len(fresh)
            fresh = fresh[:PER_SOURCE_MAX]
            by_source[name] = fresh

            msg = f"{name}: {len(fresh)} items"
            if stale:
                msg += f" ({stale} older than {MAX_AGE_DAYS}d skipped)"
            if items and not fresh:
                msg += "  <-- nothing recent, feed may be abandoned"
            print(msg)
        except Exception as exc:
            print(f"ERROR fetching {name}: {exc}", file=sys.stderr)

    # Dedupe across sources (same story syndicated twice), keeping first seen
    used = set()
    for name in list(by_source):
        kept = []
        for item in by_source[name]:
            if item["id"] in used:
                continue
            used.add(item["id"])
            kept.append(item)
        if kept:
            by_source[name] = kept
        else:
            del by_source[name]

    # Balance the running order across sources. Sorting purely by recency lets a
    # high-frequency outlet own the whole page: Al Jazeera posts dozens of stories
    # a day, so its items are always "1h ago" while ProPublica's newest is days
    # old and sinks out of view. Instead, go round-robin: every source's newest
    # story first (those sorted newest-first among themselves), then everyone's
    # second story, and so on.
    articles = []
    depth = 0
    while True:
        round_items = [items[depth] for items in by_source.values() if depth < len(items)]
        if not round_items:
            break
        round_items.sort(key=lambda a: a["published"], reverse=True)
        articles.extend(round_items)
        depth += 1
    articles = articles[:MAX_ARTICLES]

    # Safety net: never ship a near-empty page just because feeds went quiet.
    if len(articles) < MIN_ARTICLES:
        print(
            f"WARNING: only {len(articles)} fresh articles, topping up with older ones",
            file=sys.stderr,
        )
        older = sorted(
            (a for a in all_seen.values() if a["id"] not in used),
            key=lambda a: a["published"],
            reverse=True,
        )
        for item in older:
            if len(articles) >= MIN_ARTICLES:
                break
            articles.append(item)
            used.add(item["id"])

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
