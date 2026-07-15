"""Crossword grid generator.

Greedy, intersection-based placement: sorts words longest-first, places the
first word, then places each following word wherever it crosses an
already-placed word at a matching letter, subject to standard crossword
adjacency rules (no two parallel words touching without crossing, no
accidental word-extension at either end). Runs several randomized attempts
and keeps whichever produced the most placed words. Words that never find a
valid spot are dropped and reported separately, this is expected: not every
themed word list will fully interlock. Pure stdlib, no dependencies.
"""

import random


def _can_place(grid, word, row, col, direction):
    dr, dc = (0, 1) if direction == "A" else (1, 0)

    # Nothing should immediately precede or follow the word in its own
    # direction, otherwise placing it would silently extend an existing word.
    before = (row - dr, col - dc)
    after = (row + dr * len(word), col + dc * len(word))
    if before in grid or after in grid:
        return False

    has_intersection = False
    for i, ch in enumerate(word):
        r, c = row + dr * i, col + dc * i
        current = grid.get((r, c))
        if current is not None:
            if current != ch:
                return False
            has_intersection = True
        else:
            # An empty cell along this word's path must not run flush
            # against another word, that would create an unintended,
            # unchecked adjacent letter sequence.
            if direction == "A":
                if (r - 1, c) in grid or (r + 1, c) in grid:
                    return False
            else:
                if (r, c - 1) in grid or (r, c + 1) in grid:
                    return False
    return has_intersection


def _place(grid, word, row, col, direction):
    dr, dc = (0, 1) if direction == "A" else (1, 0)
    for i, ch in enumerate(word):
        grid[(row + dr * i, col + dc * i)] = ch


def _score(grid, word, row, col, direction):
    dr, dc = (0, 1) if direction == "A" else (1, 0)
    return sum(1 for i in range(len(word)) if (row + dr * i, col + dc * i) in grid)


def _try_build(entries, rng):
    words = list(entries)
    rng.shuffle(words)
    words.sort(key=lambda wc: -len(wc[0]))  # stable: keeps shuffle order within a length

    grid = {}
    placed = []
    skipped = []

    for word, clue in words:
        if not placed:
            _place(grid, word, 0, 0, "A")
            placed.append({"word": word, "clue": clue, "row": 0, "col": 0, "dir": "A"})
            continue

        candidates = []
        for i, ch in enumerate(word):
            for (r, c), gch in list(grid.items()):
                if gch != ch:
                    continue
                row_a, col_a = r, c - i
                if _can_place(grid, word, row_a, col_a, "A"):
                    candidates.append((row_a, col_a, "A"))
                row_d, col_d = r - i, c
                if _can_place(grid, word, row_d, col_d, "D"):
                    candidates.append((row_d, col_d, "D"))

        if not candidates:
            skipped.append(word)
            continue

        best_score = max(_score(grid, word, *cand) for cand in candidates)
        best = [cand for cand in candidates if _score(grid, word, *cand) == best_score]
        row, col, direction = rng.choice(best)
        _place(grid, word, row, col, direction)
        placed.append({"word": word, "clue": clue, "row": row, "col": col, "dir": direction})

    return grid, placed, skipped


def _finalize(grid, placed):
    rows = [r for r, _ in grid]
    cols = [c for _, c in grid]
    min_r, min_c = min(rows), min(cols)
    height = max(rows) - min_r + 1
    width = max(cols) - min_c + 1

    cell_letters = {(r - min_r, c - min_c): ch for (r, c), ch in grid.items()}
    norm_placed = [{**p, "row": p["row"] - min_r, "col": p["col"] - min_c} for p in placed]

    numbers = {}
    next_number = 1
    for r in range(height):
        for c in range(width):
            if (r, c) not in cell_letters:
                continue
            starts_across = (c == 0 or (r, c - 1) not in cell_letters) and (
                c + 1 < width and (r, c + 1) in cell_letters
            )
            starts_down = (r == 0 or (r - 1, c) not in cell_letters) and (
                r + 1 < height and (r + 1, c) in cell_letters
            )
            if starts_across or starts_down:
                numbers[(r, c)] = next_number
                next_number += 1

    across, down = [], []
    for p in norm_placed:
        entry = {
            "number": numbers.get((p["row"], p["col"])),
            "clue": p["clue"],
            "answer": p["word"],
            "row": p["row"],
            "col": p["col"],
            "length": len(p["word"]),
        }
        (across if p["dir"] == "A" else down).append(entry)

    across.sort(key=lambda e: e["number"])
    down.sort(key=lambda e: e["number"])

    grid_out = [
        [
            {"letter": cell_letters[(r, c)], "number": numbers.get((r, c))}
            if (r, c) in cell_letters
            else None
            for c in range(width)
        ]
        for r in range(height)
    ]

    return {"width": width, "height": height, "grid": grid_out, "across": across, "down": down}


def generate_crossword(entries, attempts=25, rng=None):
    """entries: list of (WORD, clue) tuples, word uppercase alpha-only."""
    rng = rng or random.Random()
    best = None
    best_count = -1
    for _ in range(attempts):
        grid, placed, skipped = _try_build(entries, random.Random(rng.random()))
        if len(placed) > best_count:
            best_count = len(placed)
            best = (grid, placed, skipped)

    grid, placed, skipped = best
    result = _finalize(grid, placed)
    result["placed_count"] = len(placed)
    result["skipped"] = skipped
    return result


if __name__ == "__main__":
    from word_bank import THEMES

    rng = random.Random(42)
    theme, entries = list(THEMES.items())[2]
    result = generate_crossword(entries[:18], attempts=25, rng=rng)

    print(f"Theme: {theme}")
    print(f"Placed {result['placed_count']} / 18 words, skipped: {result['skipped']}")
    print(f"Grid: {result['width']} x {result['height']}")
    for row in result["grid"]:
        print(" ".join(cell["letter"] if cell else "." for cell in row))
    print("Across:")
    for e in result["across"]:
        print(f"  {e['number']}. {e['clue']} ({e['length']}) = {e['answer']}")
    print("Down:")
    for e in result["down"]:
        print(f"  {e['number']}. {e['clue']} ({e['length']}) = {e['answer']}")
