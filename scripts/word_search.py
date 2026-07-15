"""Word search grid generator.

Places a list of words into an NxN grid in any of 8 directions, allowing
words to cross each other when letters agree, then fills the remaining
cells with random letters. Pure stdlib, no dependencies.
"""

import random

DIRECTIONS = [
    (0, 1),   # right
    (0, -1),  # left
    (1, 0),   # down
    (-1, 0),  # up
    (1, 1),   # down-right
    (1, -1),  # down-left
    (-1, 1),  # up-right
    (-1, -1),  # up-left
]

ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def _fits(grid, word, row, col, dr, dc):
    size = len(grid)
    for i, ch in enumerate(word):
        r = row + dr * i
        c = col + dc * i
        if not (0 <= r < size and 0 <= c < size):
            return False
        existing = grid[r][c]
        if existing is not None and existing != ch:
            return False
    return True


def _place(grid, word, row, col, dr, dc):
    for i, ch in enumerate(word):
        r = row + dr * i
        c = col + dc * i
        grid[r][c] = ch


def generate_word_search(words, size, rng=None):
    """Returns (grid, placed_words).

    grid is a list of `size` lists of single uppercase characters.
    placed_words is a list of dicts: {word, row, col, dr, dc} describing
    where each word landed (used by the frontend to validate a player's
    selection). Words that can't be fit after enough attempts are skipped
    and simply omitted from placed_words.
    """
    rng = rng or random.Random()
    words = sorted({w.upper() for w in words}, key=len, reverse=True)

    grid = [[None for _ in range(size)] for _ in range(size)]
    placed_words = []

    for word in words:
        if len(word) > size:
            continue
        candidates = list(DIRECTIONS)
        rng.shuffle(candidates)
        placed = False
        for dr, dc in candidates:
            positions = [(r, c) for r in range(size) for c in range(size)]
            rng.shuffle(positions)
            for row, col in positions:
                if _fits(grid, word, row, col, dr, dc):
                    _place(grid, word, row, col, dr, dc)
                    placed_words.append(
                        {"word": word, "row": row, "col": col, "dr": dr, "dc": dc}
                    )
                    placed = True
                    break
            if placed:
                break

    for r in range(size):
        for c in range(size):
            if grid[r][c] is None:
                grid[r][c] = rng.choice(ALPHABET)

    return grid, placed_words


if __name__ == "__main__":
    from word_bank import THEMES

    rng = random.Random(42)
    theme, entries = next(iter(THEMES.items()))
    words = [w for w, _ in entries][:12]
    grid, placed = generate_word_search(words, 14, rng)

    print(f"Theme: {theme}")
    print(f"Placed {len(placed)} / {len(words)} words")
    for row in grid:
        print(" ".join(row))
