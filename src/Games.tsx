import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth, usePuzzleCompletions } from "./auth";

// ---- Types matching puzzles/{date}.json (written by scripts/generate_puzzles.py) --

type WordSearchData = {
  size: number;
  grid: string[][];
  words: string[];
};

type CrosswordClue = {
  number: number;
  clue: string;
  answer: string;
  row: number;
  col: number;
  length: number;
};

type CrosswordCell = { letter: string; number: number | null } | null;

type CrosswordData = {
  width: number;
  height: number;
  grid: CrosswordCell[][];
  across: CrosswordClue[];
  down: CrosswordClue[];
};

type PuzzleData = {
  generated_at: string;
  date: string;
  theme: string;
  word_search: WordSearchData;
  crossword: CrosswordData;
};

function cellKey(r: number, c: number) {
  return r + "-" + c;
}

// The archive is UTC-dated (matches how scripts/generate_puzzles.py picks
// the day), so "today" here has to be computed in UTC too, otherwise a
// visitor west of the prime meridian could see a "today" that doesn't have
// an archive file yet.
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDayLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

function recentDates(days: number): string[] {
  const today = new Date(todayISO() + "T00:00:00Z");
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

// ---- Word search ------------------------------------------------------

function WordSearch({ data, onComplete }: { data: WordSearchData; onComplete?: () => void }) {
  const [start, setStart] = useState<{ r: number; c: number } | null>(null);
  const [found, setFound] = useState<Record<string, string>>({}); // cellKey -> word
  const [foundWords, setFoundWords] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState<string[] | null>(null); // invalid-selection flash

  function lineBetween(a: { r: number; c: number }, b: { r: number; c: number }) {
    const dr = b.r - a.r;
    const dc = b.c - a.c;
    const steps = Math.max(Math.abs(dr), Math.abs(dc));
    if (steps === 0) return [a];
    const isStraight = dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc);
    if (!isStraight) return null;
    const sr = dr === 0 ? 0 : dr / Math.abs(dr);
    const sc = dc === 0 ? 0 : dc / Math.abs(dc);
    const cells = [];
    for (let i = 0; i <= steps; i++) {
      cells.push({ r: a.r + sr * i, c: a.c + sc * i });
    }
    return cells;
  }

  function handleCellClick(r: number, c: number) {
    if (!start) {
      setStart({ r, c });
      return;
    }
    if (start.r === r && start.c === c) {
      setStart(null);
      return;
    }
    const line = lineBetween(start, { r, c });
    setStart(null);
    if (!line) return;

    const letters = line.map(({ r, c }) => data.grid[r][c]).join("");
    const reversed = letters.split("").reverse().join("");
    const match = data.words.find((w) => (w === letters || w === reversed) && !foundWords.has(w));

    if (match) {
      const updates: Record<string, string> = {};
      line.forEach(({ r, c }) => {
        updates[cellKey(r, c)] = match;
      });
      setFound((prev) => ({ ...prev, ...updates }));
      setFoundWords((prev) => new Set(prev).add(match));
    } else {
      setFlash(line.map(({ r, c }) => cellKey(r, c)));
      setTimeout(() => setFlash(null), 350);
    }
  }

  const allFound = foundWords.size === data.words.length;

  useEffect(() => {
    if (allFound) onComplete?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allFound]);

  return (
    <div className="flex flex-col md:flex-row gap-6">
      <div className="overflow-auto">
        <div
          className="inline-grid select-none"
          style={{ gridTemplateColumns: `repeat(${data.size}, minmax(0, 1fr))` }}
        >
          {data.grid.map((row, r) =>
            row.map((letter, c) => {
              const key = cellKey(r, c);
              const isFound = key in found;
              const isStart = start && start.r === r && start.c === c;
              const isFlash = flash?.includes(key);
              return (
                <button
                  key={key}
                  onClick={() => handleCellClick(r, c)}
                  className={
                    "w-7 h-7 flex items-center justify-center text-xs font-semibold border border-neutral-900 " +
                    (isFound
                      ? "bg-emerald-900/60 text-emerald-300"
                      : isFlash
                      ? "bg-red-900/60 text-red-300"
                      : isStart
                      ? "bg-neutral-100 text-neutral-900"
                      : "bg-[#111113] text-neutral-300 hover:bg-neutral-800")
                  }
                >
                  {letter}
                </button>
              );
            })
          )}
        </div>
      </div>
      <div className="min-w-[160px]">
        <h4 className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-2">
          Find these words
        </h4>
        <ul className="space-y-1 text-sm">
          {data.words.map((w) => (
            <li
              key={w}
              className={foundWords.has(w) ? "text-neutral-600 line-through" : "text-neutral-300"}
            >
              {w}
            </li>
          ))}
        </ul>
        {allFound && (
          <p className="mt-4 text-sm text-emerald-400">Nice, you found every word.</p>
        )}
        <p className="mt-4 text-xs text-neutral-600">
          Click a start letter, then click the end letter to select a line.
        </p>
      </div>
    </div>
  );
}

// ---- Crossword ----------------------------------------------------------

function Crossword({ data, onComplete }: { data: CrosswordData; onComplete?: () => void }) {
  const [entries, setEntries] = useState<Record<string, string>>({});
  const [active, setActive] = useState<{ r: number; c: number } | null>(null);
  const [direction, setDirection] = useState<"A" | "D">("A");
  const [checked, setChecked] = useState(false);
  // Auto-advance calls .focus() programmatically, which fires the same onFocus
  // handler as a real click. Without this flag, landing on an intersection
  // cell via auto-advance gets misread as "user clicked the active cell again"
  // and incorrectly flips typing direction mid-word.
  const skipToggleRef = useRef(false);

  const clueAt = useMemo(() => {
    // For a given cell + direction, find the clue (word) it belongs to.
    function find(r: number, c: number, dir: "A" | "D") {
      const list = dir === "A" ? data.across : data.down;
      for (const clue of list) {
        if (dir === "A") {
          if (r === clue.row && c >= clue.col && c < clue.col + clue.length) return clue;
        } else {
          if (c === clue.col && r >= clue.row && r < clue.row + clue.length) return clue;
        }
      }
      return null;
    }
    return find;
  }, [data]);

  function focusCell(r: number, c: number, dir: "A" | "D") {
    setActive({ r, c });
    setDirection(dir);
    skipToggleRef.current = true;
    document.getElementById("xw-cell-" + r + "-" + c)?.focus();
  }

  function handleCellFocus(r: number, c: number) {
    if (skipToggleRef.current) {
      skipToggleRef.current = false;
      setActive({ r, c });
      return;
    }
    if (active && active.r === r && active.c === c) {
      const otherDir = direction === "A" ? "D" : "A";
      if (clueAt(r, c, otherDir)) {
        setDirection(otherDir);
        return;
      }
    }
    let dir = direction;
    if (!clueAt(r, c, dir)) dir = dir === "A" ? "D" : "A";
    setActive({ r, c });
    setDirection(dir);
  }

  function step(r: number, c: number, dir: "A" | "D", delta: number) {
    return dir === "A" ? { r, c: c + delta } : { r: r + delta, c };
  }

  function handleChange(r: number, c: number, value: string) {
    const letter = value.slice(-1).toUpperCase();
    if (letter && !/[A-Z]/.test(letter)) return;
    setEntries((prev) => ({ ...prev, [cellKey(r, c)]: letter }));
    if (letter) {
      const next = step(r, c, direction, 1);
      if (data.grid[next.r]?.[next.c]) focusCell(next.r, next.c, direction);
    }
  }

  function handleKeyDown(r: number, c: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !entries[cellKey(r, c)]) {
      const prev = step(r, c, direction, -1);
      if (data.grid[prev.r]?.[prev.c]) focusCell(prev.r, prev.c, direction);
    } else if (e.key === "ArrowRight") {
      if (data.grid[r]?.[c + 1]) focusCell(r, c + 1, "A");
    } else if (e.key === "ArrowLeft") {
      if (data.grid[r]?.[c - 1]) focusCell(r, c - 1, "A");
    } else if (e.key === "ArrowDown") {
      if (data.grid[r + 1]?.[c]) focusCell(r + 1, c, "D");
    } else if (e.key === "ArrowUp") {
      if (data.grid[r - 1]?.[c]) focusCell(r - 1, c, "D");
    }
  }

  const activeClue = active ? clueAt(active.r, active.c, direction) : null;

  function isInActiveClue(r: number, c: number) {
    if (!activeClue) return false;
    if (direction === "A") return r === activeClue.row && c >= activeClue.col && c < activeClue.col + activeClue.length;
    return c === activeClue.col && r >= activeClue.row && r < activeClue.row + activeClue.length;
  }

  const totalCells = data.grid.flat().filter(Boolean).length;
  const filledCells = Object.values(entries).filter(Boolean).length;
  const correctCells = data.grid
    .flatMap((row, r) => row.map((cell, c) => (cell ? entries[cellKey(r, c)] === cell.letter : null)))
    .filter((v) => v !== null);
  const allCorrect = correctCells.length === totalCells && correctCells.every(Boolean);

  // Completion is detected the moment every cell is correct, it doesn't
  // require the player to click "Check answers" first (that button is just
  // for feedback while working through it).
  useEffect(() => {
    if (allCorrect) onComplete?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allCorrect]);

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <div className="overflow-auto">
        <div
          className="inline-grid select-none"
          style={{ gridTemplateColumns: `repeat(${data.width}, minmax(0, 1fr))` }}
        >
          {data.grid.map((row, r) =>
            row.map((cell, c) => {
              if (!cell) {
                return <div key={cellKey(r, c)} className="w-7 h-7 bg-transparent" />;
              }
              const value = entries[cellKey(r, c)] ?? "";
              const isActive = active && active.r === r && active.c === c;
              const inWord = isInActiveClue(r, c);
              const isCorrect = checked && value === cell.letter;
              const isWrong = checked && value && value !== cell.letter;
              return (
                <div key={cellKey(r, c)} className="relative w-7 h-7">
                  {cell.number && (
                    <span className="absolute top-0 left-0.5 text-[8px] text-neutral-600 leading-none z-10">
                      {cell.number}
                    </span>
                  )}
                  <input
                    id={"xw-cell-" + r + "-" + c}
                    value={value}
                    maxLength={1}
                    onFocus={() => handleCellFocus(r, c)}
                    onChange={(e) => handleChange(r, c, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(r, c, e)}
                    className={
                      "w-7 h-7 text-center text-xs font-bold border-2 border-neutral-900 outline-none " +
                      (isCorrect
                        ? "bg-emerald-200 text-emerald-900"
                        : isWrong
                        ? "bg-red-200 text-red-900"
                        : isActive
                        ? "bg-amber-300 text-neutral-900"
                        : inWord
                        ? "bg-amber-100 text-neutral-900"
                        : "bg-white text-neutral-900")
                    }
                  />
                </div>
              );
            })
          )}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={() => setChecked(true)}
            className="text-xs border border-neutral-700 px-3 py-1.5 text-neutral-300 hover:border-neutral-500 hover:text-neutral-100"
          >
            Check answers
          </button>
          <span className="text-xs text-neutral-600">
            {filledCells}/{totalCells} filled
          </span>
          {allCorrect && <span className="text-xs text-emerald-400">All correct!</span>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 min-w-[240px] text-sm">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-2">
            Across
          </h4>
          <ul className="space-y-1">
            {data.across.map((clue) => (
              <li key={"a" + clue.number}>
                <button
                  onClick={() => focusCell(clue.row, clue.col, "A")}
                  className={
                    "text-left hover:text-neutral-100 " +
                    (activeClue === clue ? "text-neutral-100 font-semibold" : "text-neutral-400")
                  }
                >
                  {clue.number}. {clue.clue}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-2">
            Down
          </h4>
          <ul className="space-y-1">
            {data.down.map((clue) => (
              <li key={"d" + clue.number}>
                <button
                  onClick={() => focusCell(clue.row, clue.col, "D")}
                  className={
                    "text-left hover:text-neutral-100 " +
                    (activeClue === clue ? "text-neutral-100 font-semibold" : "text-neutral-400")
                  }
                >
                  {clue.number}. {clue.clue}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ---- Day picker -------------------------------------------------------

function DayPicker({
  selectedDate,
  onSelect,
  completions,
  signedIn,
}: {
  selectedDate: string;
  onSelect: (date: string) => void;
  completions: Record<string, { word_search_completed: boolean; crossword_completed: boolean }>;
  signedIn: boolean;
}) {
  const dates = recentDates(14);
  const today = todayISO();

  return (
    <div className="mb-4">
      <div className="flex gap-1.5 overflow-x-auto pb-2">
        {dates.map((date) => {
          const isSelected = date === selectedDate;
          const c = completions[date];
          return (
            <button
              key={date}
              onClick={() => onSelect(date)}
              className={
                "shrink-0 flex flex-col items-center gap-1 px-2.5 py-1.5 border text-xs " +
                (isSelected
                  ? "border-neutral-100 bg-neutral-900 text-neutral-100"
                  : "border-neutral-800 text-neutral-500 hover:border-neutral-600 hover:text-neutral-300")
              }
            >
              <span>
                {formatDayLabel(date)}
                {date === today ? " · today" : ""}
              </span>
              {signedIn && (
                <span className="flex gap-1">
                  <span
                    title="Word search"
                    className={
                      "w-1.5 h-1.5 rounded-full " +
                      (c?.word_search_completed ? "bg-emerald-400" : "bg-neutral-700")
                    }
                  />
                  <span
                    title="Crossword"
                    className={
                      "w-1.5 h-1.5 rounded-full " +
                      (c?.crossword_completed ? "bg-emerald-400" : "bg-neutral-700")
                    }
                  />
                </span>
              )}
            </button>
          );
        })}
      </div>
      {!signedIn && (
        <p className="text-xs text-neutral-600">Sign in to track which days you've completed.</p>
      )}
    </div>
  );
}

// ---- Top-level Games panel ------------------------------------------------

export default function Games() {
  const { user } = useAuth();
  const { completions, markCompleted } = usePuzzleCompletions(user?.id);

  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [data, setData] = useState<PuzzleData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [tab, setTab] = useState<"wordsearch" | "crossword">("wordsearch");

  useEffect(() => {
    setStatus("loading");
    fetch(`./puzzles/${selectedDate}.json`, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((d: PuzzleData) => {
        setData(d);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, [selectedDate]);

  const isToday = selectedDate === todayISO();

  return (
    <div>
      <DayPicker
        selectedDate={selectedDate}
        onSelect={setSelectedDate}
        completions={completions}
        signedIn={!!user}
      />

      {status === "loading" && <p className="text-sm text-neutral-500 py-8">Loading puzzles...</p>}
      {status === "error" && (
        <p className="text-sm text-neutral-500 py-8">
          {isToday
            ? "Couldn't load today's puzzles yet. They're generated by a scheduled job, if this is a fresh deploy the first run hasn't happened yet."
            : "No archived puzzle found for this day."}
        </p>
      )}

      {status === "ready" && data && (
        <div>
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="font-serif text-xl text-neutral-50">
              {isToday ? "Today's theme" : formatDayLabel(selectedDate)}: {data.theme}
            </h2>
            <div className="flex gap-4 text-sm">
              <button
                onClick={() => setTab("wordsearch")}
                className={tab === "wordsearch" ? "text-neutral-100 font-semibold" : "text-neutral-500 hover:text-neutral-300"}
              >
                Word search
              </button>
              <button
                onClick={() => setTab("crossword")}
                className={tab === "crossword" ? "text-neutral-100 font-semibold" : "text-neutral-500 hover:text-neutral-300"}
              >
                Crossword
              </button>
            </div>
          </div>
          {tab === "wordsearch" ? (
            <WordSearch
              key={selectedDate + "-ws"}
              data={data.word_search}
              onComplete={() => markCompleted(selectedDate, "word_search")}
            />
          ) : (
            <Crossword
              key={selectedDate + "-cw"}
              data={data.crossword}
              onComplete={() => markCompleted(selectedDate, "crossword")}
            />
          )}
        </div>
      )}
    </div>
  );
}
