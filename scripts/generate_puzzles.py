"""Generates the day's word search and crossword and writes puzzles.json.

Deterministic per UTC day: everyone who visits the site on a given day sees
the same puzzle, and it rotates automatically at UTC midnight. Themes cycle
through the word bank in order (not random) so the same theme doesn't repeat
back-to-back by chance, then loops.

Run manually with: python scripts/generate_puzzles.py
"""

import json
import random
from datetime import datetime, timezone

from word_bank import THEMES
from word_search import generate_word_search
from crossword import generate_crossword

WORD_SEARCH_SIZE = 14
WORD_SEARCH_COUNT = 12
CROSSWORD_WORD_COUNT = 18


def pick_theme(today):
    themes = list(THEMES.items())
    epoch_day = (today - datetime(2026, 1, 1, tzinfo=timezone.utc).date()).days
    index = epoch_day % len(themes)
    return themes[index]


def main():
    today = datetime.now(timezone.utc).date()
    theme_name, entries = pick_theme(today)

    seed = int(today.strftime("%Y%m%d"))
    rng = random.Random(seed)

    ws_words = [w for w, _ in entries][:WORD_SEARCH_COUNT]
    ws_grid, ws_placed = generate_word_search(ws_words, WORD_SEARCH_SIZE, random.Random(seed))
    word_search = {
        "size": WORD_SEARCH_SIZE,
        "grid": ws_grid,
        "words": [p["word"] for p in ws_placed],
    }

    cw_entries = entries[:CROSSWORD_WORD_COUNT]
    crossword = generate_crossword(cw_entries, attempts=40, rng=random.Random(seed + 1))

    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "date": today.isoformat(),
        "theme": theme_name,
        "word_search": word_search,
        "crossword": crossword,
    }

    with open("puzzles.json", "w") as f:
        json.dump(output, f, indent=2)

    print(f"Theme: {theme_name}")
    print(f"Word search: {len(word_search['words'])}/{WORD_SEARCH_COUNT} words placed")
    print(
        f"Crossword: {crossword['placed_count']}/{CROSSWORD_WORD_COUNT} words placed, "
        f"{crossword['width']}x{crossword['height']} grid, skipped: {crossword['skipped']}"
    )


if __name__ == "__main__":
    main()
