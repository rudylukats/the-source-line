import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";

// ---- Session tracking ----------------------------------------------------

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  return { session, loading, user: session?.user ?? null };
}

// ---- Per-user source preferences ------------------------------------------

export function useSourcePreferences(userId: string | null | undefined) {
  const [excludedSources, setExcludedSources] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId) {
      setExcludedSources([]);
      setLoaded(true);
      return;
    }
    let cancelled = false;
    setLoaded(false);
    supabase
      .from("user_source_preferences")
      .select("excluded_sources")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setExcludedSources(data?.excluded_sources ?? []);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function toggleSource(source: string) {
    if (!userId) return;
    const next = excludedSources.includes(source)
      ? excludedSources.filter((s) => s !== source)
      : [...excludedSources, source];
    setExcludedSources(next); // optimistic update
    const { error } = await supabase.from("user_source_preferences").upsert({
      user_id: userId,
      excluded_sources: next,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      // Roll back on failure
      setExcludedSources(excludedSources);
    }
  }

  // GDPR: lets a signed-in user erase their stored preferences data immediately,
  // without needing to contact the site owner.
  async function deletePreferences() {
    if (!userId) return;
    await supabase.from("user_source_preferences").delete().eq("user_id", userId);
    setExcludedSources([]);
  }

  return { excludedSources, toggleSource, deletePreferences, loaded };
}

// ---- Puzzle completion tracking --------------------------------------------

export type PuzzleCompletion = {
  puzzle_date: string;
  word_search_completed: boolean;
  crossword_completed: boolean;
};

export function usePuzzleCompletions(userId: string | null | undefined) {
  const [completions, setCompletions] = useState<Record<string, PuzzleCompletion>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId) {
      setCompletions({});
      setLoaded(true);
      return;
    }
    let cancelled = false;
    setLoaded(false);
    supabase
      .from("puzzle_completions")
      .select("puzzle_date, word_search_completed, crossword_completed")
      .eq("user_id", userId)
      .then(({ data }) => {
        if (cancelled) return;
        const map: Record<string, PuzzleCompletion> = {};
        (data ?? []).forEach((row: PuzzleCompletion) => {
          map[row.puzzle_date] = row;
        });
        setCompletions(map);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function markCompleted(date: string, kind: "word_search" | "crossword") {
    if (!userId) return;
    const existing = completions[date];
    // Already recorded, no need to write again.
    if (kind === "word_search" && existing?.word_search_completed) return;
    if (kind === "crossword" && existing?.crossword_completed) return;

    const next: PuzzleCompletion = {
      puzzle_date: date,
      word_search_completed: kind === "word_search" ? true : existing?.word_search_completed ?? false,
      crossword_completed: kind === "crossword" ? true : existing?.crossword_completed ?? false,
    };
    setCompletions((prev) => ({ ...prev, [date]: next })); // optimistic
    const { error } = await supabase.from("puzzle_completions").upsert({
      user_id: userId,
      puzzle_date: date,
      word_search_completed: next.word_search_completed,
      crossword_completed: next.crossword_completed,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      // Roll back on failure
      setCompletions((prev) => {
        const rolled = { ...prev };
        if (existing) rolled[date] = existing;
        else delete rolled[date];
        return rolled;
      });
    }
  }

  async function deleteCompletions() {
    if (!userId) return;
    await supabase.from("puzzle_completions").delete().eq("user_id", userId);
    setCompletions({});
  }

  return { completions, markCompleted, deleteCompletions, loaded };
}

// ---- Sign in / sign up modal ----------------------------------------------

export function AuthModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (mode === "signup" && password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onClose();
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) {
          const msg = error.message.toLowerCase();
          if (msg.includes("already registered") || msg.includes("already exists") || msg.includes("user already")) {
            throw new Error("An account with this email already exists. Try signing in instead.");
          }
          throw error;
        }
        setNotice("Check your email to confirm your account, then sign in.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm border border-neutral-800 bg-[#111113] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-lg text-neutral-50">
            {mode === "signin" ? "Sign in" : "Create account"}
          </h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-200 text-sm">
            Close
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#0b0b0c] border border-neutral-800 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:border-neutral-500"
            />
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#0b0b0c] border border-neutral-800 px-3 py-2 pr-16 text-sm text-neutral-100 focus:outline-none focus:border-neutral-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-neutral-500 hover:text-neutral-200"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>
          {mode === "signup" && (
            <div>
              <label className="block text-xs text-neutral-500 mb-1">Confirm password</label>
              <input
                type={showPassword ? "text" : "password"}
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-[#0b0b0c] border border-neutral-800 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:border-neutral-500"
              />
            </div>
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}
          {notice && <p className="text-xs text-emerald-400">{notice}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full bg-neutral-100 text-neutral-900 text-sm font-semibold py-2 hover:bg-neutral-300 disabled:opacity-50"
          >
            {busy ? "Please wait..." : mode === "signin" ? "Sign in" : "Sign up"}
          </button>
        </form>
        <button
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
            setNotice(null);
            setConfirmPassword("");
            setShowPassword(false);
          }}
          className="mt-4 text-xs text-neutral-500 hover:text-neutral-300"
        >
          {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}

// ---- Header account widget -------------------------------------------------

export function AccountWidget() {
  const { user, loading } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);

  if (loading) return null;

  if (!user) {
    return (
      <>
        <button onClick={() => setModalOpen(true)} className="hover:text-neutral-100">
          Sign in
        </button>
        {modalOpen && <AuthModal onClose={() => setModalOpen(false)} />}
      </>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="hidden lg:inline text-neutral-500 text-xs">{user.email}</span>
      <button onClick={() => supabase.auth.signOut()} className="hover:text-neutral-100">
        Sign out
      </button>
    </div>
  );
}


// ---- Privacy / data controls -----------------------------------------------
// Self-service handling of GDPR data-subject requests: deleting the
// preferences row is instant (governed by RLS, no admin key needed). Deleting
// the underlying login (email + password) requires Supabase's admin API,
// which needs a service-role key that must never live in client code, so
// that path routes to a pre-filled email to the site owner instead.

export function PrivacyControls() {
  const { user } = useAuth();
  const { deletePreferences } = useSourcePreferences(user?.id);
  const { deleteCompletions } = usePuzzleCompletions(user?.id);
  const [status, setStatus] = useState<string | null>(null);

  if (!user) {
    return (
      <p className="text-sm text-neutral-400 leading-relaxed">
        Sign in to manage or delete your account data.
      </p>
    );
  }

  async function handleDeletePreferences() {
    if (!window.confirm("Delete your saved source preferences and puzzle history? This can't be undone.")) return;
    await Promise.all([deletePreferences(), deleteCompletions()]);
    setStatus("Your saved preferences and puzzle history have been deleted.");
  }

  const mailBody =
    "Please delete my account and all associated data." + String.fromCharCode(10, 10) +
    "Account email: " + user.email;
  const mailtoHref =
    "mailto:rudylukats@gmail.com?subject=" +
    encodeURIComponent("Account deletion request") +
    "&body=" +
    encodeURIComponent(mailBody);

  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-400 leading-relaxed">Signed in as {user.email}.</p>
      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleDeletePreferences}
          className="text-xs border border-neutral-700 px-3 py-1.5 text-neutral-300 hover:border-neutral-500 hover:text-neutral-100"
        >
          Delete my saved data
        </button>
        <a
          href={mailtoHref}
          className="text-xs border border-neutral-700 px-3 py-1.5 text-neutral-300 hover:border-neutral-500 hover:text-neutral-100"
        >
          Request full account deletion
        </a>
      </div>
      {status && <p className="text-xs text-emerald-400">{status}</p>}
    </div>
  );
}
