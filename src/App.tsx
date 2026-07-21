import { useEffect, useState } from "react";
import { AccountWidget, useAuth, useSourcePreferences, PrivacyControls } from "./auth";
import Games from "./Games";

type Source =
  | "Dropsite News"
  | "ProPublica"
  | "ICIJ"
  | "Al Jazeera"
  | "The Markup"
  | "OCCRP"
  | "Bellingcat"
  | "The Intercept"
  | "The Lever"
  | "404 Media"
  | "Rest of World"
  | "Reveal";
type Category = "World" | "Investigations" | "Tech";

const SOURCE_STYLES: Record<Source, string> = {
  "Dropsite News": "text-[#e8a33d] border-[#e8a33d]/40",
  "ProPublica": "text-[#5ec8e8] border-[#5ec8e8]/40",
  "ICIJ": "text-[#8fd694] border-[#8fd694]/40",
  "Al Jazeera": "text-[#e8666a] border-[#e8666a]/40",
  "The Markup": "text-[#c99bf0] border-[#c99bf0]/40",
  "OCCRP": "text-[#f2a0c4] border-[#f2a0c4]/40",
  "Bellingcat": "text-[#5fd0bd] border-[#5fd0bd]/40",
  "The Intercept": "text-[#f08a4b] border-[#f08a4b]/40",
  "The Lever": "text-[#d9c94f] border-[#d9c94f]/40",
  "404 Media": "text-[#8fa6f5] border-[#8fa6f5]/40",
  "Rest of World": "text-[#b6dd5f] border-[#b6dd5f]/40",
  "Reveal": "text-[#c98f6a] border-[#c98f6a]/40",
};

const SOURCES: Source[] = [
  "Al Jazeera",
  "Dropsite News",
  "Bellingcat",
  "ProPublica",
  "ICIJ",
  "OCCRP",
  "The Intercept",
  "The Lever",
  "Reveal",
  "The Markup",
  "404 Media",
  "Rest of World",
];

// Categories are derived from source, not from per-article feed data. The
// feeds themselves don't carry usable topic tags across all 5 sources (Al
// Jazeera's <category> field is just "News"/"Show Types"/"Sport", ProPublica's
// is real but US-policy-specific, not this taxonomy), so this is a source-level
// approximation, not a per-article classification. It'll misfire on outliers
// (e.g. an Al Jazeera tech story still shows under World).
const SOURCE_CATEGORY: Record<Source, Category> = {
  // World: international news and on-the-ground conflict reporting
  "Al Jazeera": "World",
  "Dropsite News": "World",
  "Bellingcat": "World",
  // Investigations: accountability and long-form investigative newsrooms
  "ICIJ": "Investigations",
  "ProPublica": "Investigations",
  "OCCRP": "Investigations",
  "The Intercept": "Investigations",
  "The Lever": "Investigations",
  "Reveal": "Investigations",
  // Tech: technology, platforms and surveillance
  "The Markup": "Tech",
  "404 Media": "Tech",
  "Rest of World": "Tech",
};

const CATEGORIES: Category[] = ["World", "Investigations", "Tech"];

type Article = {
  id: string;
  source: Source;
  headline: string;
  excerpt: string;
  link: string;
  published: string;
  featured?: boolean;
};

type FeedData = {
  generated_at: string;
  articles: Article[];
};

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function SourceTag({ source }: { source: Source }) {
  const style = SOURCE_STYLES[source] ?? "text-neutral-400 border-neutral-700";
  return (
    <span
      className={`inline-block text-[11px] font-semibold uppercase tracking-wide border rounded-sm px-1.5 py-0.5 ${style}`}
    >
      {source}
    </span>
  );
}

function FeaturedCard({ article }: { article: Article }) {
  return (
    <a
      href={article.link}
      target="_blank"
      rel="noopener noreferrer"
      className="group block border-t border-neutral-800 pt-4 first:border-t-0 first:pt-0 md:border-t-0 md:pt-0"
    >
      <SourceTag source={article.source} />
      <h2 className="mt-2 font-serif text-xl leading-snug text-neutral-50 group-hover:text-neutral-300">
        {article.headline}
      </h2>
      {article.excerpt && (
        <p className="mt-2 text-sm text-neutral-400 leading-relaxed">{article.excerpt}</p>
      )}
      <span className="mt-2 inline-block text-xs text-neutral-500">{timeAgo(article.published)}</span>
    </a>
  );
}

function ListRow({ article }: { article: Article }) {
  return (
    <a
      href={article.link}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col gap-1 border-b border-neutral-800 py-3 first:pt-0 sm:flex-row sm:items-baseline sm:gap-3"
    >
      <div className="flex items-center gap-2 sm:w-40 sm:shrink-0">
        <SourceTag source={article.source} />
      </div>
      <h3 className="flex-1 text-[15px] leading-snug text-neutral-100 group-hover:text-neutral-400">
        {article.headline}
      </h3>
      <span className="text-xs text-neutral-500 sm:w-14 sm:text-right sm:shrink-0">
        {timeAgo(article.published)}
      </span>
    </a>
  );
}

export default function App() {
  const [view, setView] = useState<"news" | "games">("news");
  const [activeSource, setActiveSource] = useState<Source | "All">("All");
  const [activeCategory, setActiveCategory] = useState<Category | "All">("All");
  const [feed, setFeed] = useState<FeedData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    fetch("./articles.json", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: FeedData) => {
        setFeed(data);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  const { user } = useAuth();
  const { excludedSources, toggleSource } = useSourcePreferences(user?.id);

  const articles = feed?.articles ?? [];
  const featured = articles
    .filter((a) => a.featured)
    .filter((a) => !excludedSources.includes(a.source));
  const rest = articles
    .filter((a) => !a.featured)
    .filter((a) => !excludedSources.includes(a.source))
    .filter((a) => activeSource === "All" || a.source === activeSource)
    .filter((a) => activeCategory === "All" || SOURCE_CATEGORY[a.source] === activeCategory);

  const latestLabel = [
    activeCategory !== "All" ? activeCategory : null,
    activeSource !== "All" ? activeSource : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="min-h-screen bg-[#0b0b0c] text-neutral-100 font-sans">
      {/* Header */}
      <header className="border-b border-neutral-800">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-start justify-between">
          <div>
            <h1 className="m-0 font-serif text-2xl font-bold tracking-tight text-neutral-50">
              THE SOURCE LINE
            </h1>
            <p className="mt-1 text-sm italic text-neutral-500 max-w-md">
              For the people who want real, independent journalism without the corporate fluff.
            </p>
          </div>
          <nav className="hidden md:flex items-center gap-5 text-sm text-neutral-400">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(activeCategory === cat ? "All" : cat)}
                className={`hover:text-neutral-100 ${
                  activeCategory === cat ? "text-neutral-100 font-semibold" : ""
                }`}
              >
                {cat}
              </button>
            ))}
            <button
              onClick={() => setView(view === "games" ? "news" : "games")}
              className={`hover:text-neutral-100 ${view === "games" ? "text-neutral-100 font-semibold" : ""}`}
            >
              Games
            </button>
            <a href="#sources-panel" className="hover:text-neutral-100">Sources</a>
            <a href="#about-panel" className="hover:text-neutral-100">About</a>
            <a href="#privacy-panel" className="hover:text-neutral-100">Privacy</a>
            <AccountWidget />
          </nav>
        </div>
        {/* source filter strip */}
        {view === "news" && (
        <div className="border-t border-neutral-900 bg-[#0e0e10]">
          <div className="mx-auto max-w-6xl px-4 py-2 flex flex-wrap items-center gap-2 text-xs">
            <button
              onClick={() => setActiveSource("All")}
              className={`px-2 py-1 rounded-sm border ${
                activeSource === "All"
                  ? "border-neutral-500 text-neutral-100"
                  : "border-neutral-800 text-neutral-500 hover:text-neutral-300"
              }`}
            >
              All Sources
            </button>
            {SOURCES.map((s) => (
              <button
                key={s}
                onClick={() => setActiveSource(s)}
                className={`px-2 py-1 rounded-sm border ${SOURCE_STYLES[s]} ${
                  activeSource === s ? "opacity-100" : "opacity-50 hover:opacity-90"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        )}
      </header>

      {/* Body */}
      {view === "games" ? (
        <div className="mx-auto max-w-6xl px-4 py-6">
          <Games />
        </div>
      ) : (
      <div className="mx-auto max-w-6xl px-4 py-6 grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8">
        <main>
          {status === "loading" && (
            <p className="text-sm text-neutral-500 py-8">Loading latest headlines...</p>
          )}
          {status === "error" && (
            <p className="text-sm text-neutral-500 py-8">
              Couldn't load articles.json yet. It's written by a scheduled job that runs every 3
              hours, if this is a fresh deploy the first run hasn't happened yet.
            </p>
          )}

          {status === "ready" && (
            <>
              {/* Featured */}
              {featured.length > 0 && (
                <section className="grid grid-cols-1 md:grid-cols-3 gap-6 pb-8 mb-8 border-b border-neutral-800">
                  {featured.map((a) => (
                    <FeaturedCard key={a.id} article={a} />
                  ))}
                </section>
              )}

              {/* Dense list */}
              <section>
                <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-2">
                  Latest{latestLabel ? ` — ${latestLabel}` : ""}
                </h2>
                <div>
                  {rest.length === 0 ? (
                    <p className="text-sm text-neutral-500 py-4">No articles match these filters yet.</p>
                  ) : (
                    rest.map((a) => <ListRow key={a.id} article={a} />)
                  )}
                </div>
              </section>
            </>
          )}
        </main>

        {/* Sidebar */}
        <aside className="space-y-6">
          <div className="lg:sticky lg:top-6 space-y-6">
            <div id="about-panel" className="border border-neutral-800 p-4 scroll-mt-6">
              <h3 className="font-serif text-base text-neutral-100 mb-2">About this site</h3>
              <p className="text-sm text-neutral-400 leading-relaxed">
                Headlines and excerpts are aggregated from independent and investigative newsrooms.
                Every item links out to the original report. We don't republish full articles.
                World/Investigations/Tech tags above are assigned by source, not per article, so
                treat them as a loose guide rather than a precise topic filter.
              </p>
            </div>

            <div id="sources-panel" className="border border-neutral-800 p-4 scroll-mt-6">
              <h3 className="font-serif text-base text-neutral-100 mb-3">Sources</h3>
              {user && (
                <p className="text-xs text-neutral-600 mb-3">
                  Uncheck a source to hide it from your feed. Only you see this.
                </p>
              )}
              <ul className="space-y-2 text-sm">
                {SOURCES.map((s) => (
                  <li key={s} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      {user && (
                        <input
                          type="checkbox"
                          checked={!excludedSources.includes(s)}
                          onChange={() => toggleSource(s)}
                          className="accent-neutral-100"
                        />
                      )}
                      <span className={SOURCE_STYLES[s].split(" ")[0]}>{s}</span>
                    </span>
                    <span className="text-xs text-neutral-600">{SOURCE_CATEGORY[s]}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div id="privacy-panel" className="border border-neutral-800 p-4 scroll-mt-6 space-y-3">
              <h3 className="font-serif text-base text-neutral-100 mb-1">Privacy policy</h3>

              <p className="text-sm text-neutral-400 leading-relaxed">
                If you create an account, we store your email and password (handled by our
                authentication provider, Supabase, never in plain text), the list of sources
                you've chosen to hide, and which daily puzzles you've completed. That's it. We
                don't collect names, locations, or browsing history, and articles.json itself
                carries no personal data.
              </p>

              <p className="text-sm text-neutral-400 leading-relaxed">
                Page-view analytics come from Cloudflare Web Analytics, which is cookie-free by
                design. It doesn't set cookies, doesn't track you across sites, and doesn't
                identify individual visitors, it only gives us an aggregate visit count.
              </p>

              <p className="text-sm text-neutral-400 leading-relaxed">
                Account data is processed on the basis of your consent when you sign up, used
                solely to let you sign in and keep your source preferences, and kept only while
                your account exists. We don't sell or share it with advertisers or other third
                parties. Supabase (our database and login provider) and Cloudflare (hosting and
                analytics) act as data processors on our behalf.
              </p>

              <p className="text-sm text-neutral-400 leading-relaxed">
                The site doesn't use tracking or advertising cookies. Signing in stores a login
                session in your browser so you stay signed in, this is required for the login
                feature to work and isn't used to track you.
              </p>

              <p className="text-sm text-neutral-400 leading-relaxed">
                You can access, correct, or delete your data at any time. Delete your saved
                preferences and puzzle history instantly below, or request full account deletion
                (removes your login entirely) and we'll action it promptly. You can also reach us
                directly at rudylukats@gmail.com with any privacy question.
              </p>

              <PrivacyControls />
            </div>
          </div>
        </aside>
      </div>
      )}

      {/* Footer */}
      <footer className="border-t border-neutral-800 mt-10">
        <div className="mx-auto max-w-6xl px-4 py-6 text-xs text-neutral-500 leading-relaxed">
          <p>
            The Source Line is a news aggregator. Headlines, excerpts, and links point to reporting
            produced by the original publishers listed above. All rights to full article text, images,
            and video belong to those publishers.
            {feed?.generated_at && (
              <> Last updated {new Date(feed.generated_at).toLocaleString()}.</>
            )}
          </p>
          <p className="mt-2">
            <a href="#privacy-panel" className="underline hover:text-neutral-300">Privacy policy</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
