# The Source Line

A static news aggregator. Headlines and excerpts are pulled from RSS feeds
every 3 hours by a GitHub Actions workflow, written to `articles.json`, and
rendered by the static page in `index.html`. No server, no build step needed
to view a headline update, GitHub Pages just serves the files as-is.

## What's in here

- `index.html` — the site. A bundled React app that fetches `articles.json`
  at load time and renders it. This file only needs to be rebuilt when you
  change the design, not when articles update.
- `articles.json` — the current headline data. Right now it's seeded with
  placeholder text so the site isn't empty on first deploy. It gets
  overwritten by the first successful run of the fetch workflow.
- `scripts/fetch_articles.py` — pulls the five RSS feeds, cleans up the text,
  dedupes, sorts newest-first, writes `articles.json`.
- `requirements.txt` — the one Python dependency (`feedparser`) the script needs.
- `.github/workflows/fetch-articles.yml` — runs the script every 3 hours and
  commits the updated `articles.json` if anything changed.

## Publishing this

1. Create a new **public** repo on GitHub.
2. Push everything in this folder to it (keep the folder structure, `.github`
   included, it's easy to miss since it starts with a dot).
3. In the repo, go to **Settings > Actions > General > Workflow permissions**
   and select **"Read and write permissions."** This step is easy to miss
   and the fetch job will fail with a 403 on push if you skip it, since
   GitHub locks the default token to read-only on new repos.
4. Go to **Settings > Pages**, set Source to "Deploy from a branch," branch
   `main`, folder `/root`. Save.
5. Go to the **Actions** tab, open "Fetch articles," and click **"Run
   workflow"** to trigger it manually the first time rather than waiting up
   to 3 hours for the schedule. Check the run for errors.
6. Visit `https://yourusername.github.io/repo-name`. `articles.json` should
   now have real headlines instead of the placeholder set.

## Changing the schedule

Edit the `cron` line in `.github/workflows/fetch-articles.yml`. It's
currently `13 */3 * * *`, every 3 hours at :13 past the hour. The odd
minute offset avoids the delay pileup GitHub's scheduler tends to have
right at the top of the hour.

## Adding or swapping a source

Add a name/URL pair to the `FEEDS` dict at the top of
`scripts/fetch_articles.py`, and add a matching entry to `SOURCE_STYLES` and
`SOURCES` in `src/App.tsx` if you want it to get its own color-coded tag and
filter button (requires rebuilding `index.html` through the web-artifacts
build/bundle scripts, this part isn't automatic).
