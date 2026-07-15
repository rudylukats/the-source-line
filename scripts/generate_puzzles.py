"""Generates a day's word search and crossword.

Deterministic per UTC day: everyone who visits the site on a given day sees
the same puzzle, and it rotates automatically at UTC midnight. Themes cycle
through the word bank in order (not random) so the same theme doesn't repeat
back-to-back by chance, then loops.

Writes two files:
  - puzzles/{date}.json   a permanent archive entry, one per day, never
                           overwritten. This is what lets a player go back
                           and do a previous day's puzzle later.
  - puzzles.json          a copy of today's puzzle at the repo root, kept for
                           a simple/stable "today" fetch path from the site.

Run manually with: python scripts/generate_puzzles.py
Backfill or regenerate a specific day with: python scripts/generate_puzzles.py --date 2026-07-10
"""

import argparse
import json
import os
import random
from datetime import date as date_cls
from datetime import datetime, timezone

from word_bank import THEMES
from word_search import generate_word_search
from crossword import generate_crossword

WORD_SEARCH_SIZE = 14
WORD_SEARCH_COUNT = 12
CROSSWORD_WORD_COUNT = 18
ARCHIVE_DIR = "puzzles"


def pick_theme(target_date):
    themes = list(THEMES.items())
    epoch_day = (target_date - date_cls(2026, 1, 1)).days
    index = epoch_day % len(themes)
    return themes[index]


def generate_for_date(target_date):
    theme_name, entries = pick_theme(target_date)
    seed = int(target_date.strftime("%Y%m%d"))

    ws_words = [w for w, _ in entries][:WORD_SEARCH_COUNT]
    ws_grid, ws_placed = generate_word_search(ws_words, WORD_SEARCH_SIZE, random.Random(seed))
    word_search = {
        "size": WORD_SEARCH_SIZE,
        "grid": ws_grid,
        "words": [p["word"] for p in ws_placed],
    }

    cw_entries = entries[:CROSSWORD_WORD_COUNT]
    crossword = generate_crossword(cw_entries, attempts=40, rng=random.Random(seed + 1))

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "date": target_date.isoformat(),
        "theme": theme_name,
        "word_search": word_search,
        "crossword": crossword,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--date",
        help="YYYY-MM-DD to generate (for backfilling the archive). Defaults to today (UTC).",
    )
    args = parser.parse_args()

    target_date = (
        date_cls.fromisoformat(args.date) if args.date else datetime.now(timezone.utc).date()
    )
    today = datetime.now(timezone.utc).date()

    output = generate_for_date(target_date)

    os.makedirs(ARCHIVE_DIR, exist_ok=True)
    archive_path = os.path.join(ARCHIVE_DIR, f"{target_date.isoformat()}.json")
    with open(archive_path, "w") as f:
        json.dump(output, f, indent=2)

    if target_date == today:
        with open("puzzles.json", "w") as f:
            json.dump(output, f, indent=2)

    crossword = output["crossword"]
    print(f"Date: {target_date.isoformat()}  Theme: {output['theme']}")
    print(f"Word search: {len(output['word_search']['words'])}/{WORD_SEARCH_COUNT} words placed")
    print(
        f"Crossword: {crossword['placed_count']}/{CROSSWORD_WORD_COUNT} words placed, "
        f"{crossword['width']}x{crossword['height']} grid, skipped: {crossword['skipped']}"
    )
    print(f"Wrote {archive_path}" + (" and puzzles.json" if target_date == today else ""))


if __name__ == "__main__":
    main()
