# Psychiatry Companion — notes for AI assistants

Static site (no framework) listing NIMHANS MD Psychiatry previous-year questions, with sign-in via Supabase.

## Files

- `index.html` — page, all CSS, script tags (data files are NOT script tags: `app.js` loads them on demand via `DATA_FILES`/`ensureData`) (strict CSP: scripts must be local files or jsdelivr). `vendor/` holds self-hosted third-party scripts (Supabase JS).
- `app.js` — all UI logic. Views: year-wise, topic-wise, Q&A (`renderFYQAView` for First Year, `renderFinalQAView` for Final Year).
- `final-data.js` — Final Year questions (`PAPERS1/2/3`). `fy-data.js` — First Year questions.
- `answers-data.js` — First Year answers (hand-maintained HTML strings keyed by item uid).
- `manifest.json`, `sw.js`, `icons/` — installable app (PWA). `sw.js` is network-first for same-origin files (fresh when online, cached copy offline); it never touches Supabase/Google requests. Icons are rendered from `icons/icon.svg`.
- Admin corrections to answers live in the Supabase table `answer_edits` (`supabase_answer_edits.sql`), not in the files: they override `answers/*.md` / `answers-data.js` on display and are cleaned with `vendor/purify-*.min.js` (DOMPurify). If you rewrite an answer in `answers/`, check whether an admin correction for it exists.
- `qid.js` — stable Final Year question IDs (`finalQid(paper, text)`), shared by the site and the build script.
- `answers/*.md` — **Final Year answers, one Markdown file per question family.** Source of truth.
- `final-answers-data.js` — GENERATED from `answers/*.md` by `npm run build:answers`. Never edit by hand.
- `docs/QUESTION_INDEX.md` — GENERATED list of every Final Year question with its ID.
- `docs/PRIORITY.md` — repeated question families and topic frequency (what to answer first).
- `docs/ANSWER_GUIDE.md` — **the required template, depth standard, citation and review rules. Read it before writing any answer.**

## Writing Final Year answers

1. Read `docs/ANSWER_GUIDE.md` in full.
2. Copy `answers/_TEMPLATE.md` to `answers/<family-name>.md`; fill `covers:` with IDs from `docs/QUESTION_INDEX.md` / `docs/PRIORITY.md`.
3. Base content on the sources the user provides; cite edition + chapter. Paraphrase — never paste textbook text. Never commit source PDFs (`sources/` is git-ignored).
4. Always set `status: draft`. Only a human reviewer sets `reviewed` or `verified`.
5. Run `npm run build:answers`; it must pass. Commit the answer file together with the regenerated `final-answers-data.js` and `docs/QUESTION_INDEX.md`.

## Testing locally

Serve the folder (`python3 -m http.server`) and open it. Content is behind sign-in; for local visual checks you can call `onSignedIn`/`setLevel('final')`, `setPaper('p3')`, `setView('qa')` from the console after stubbing the access check.
