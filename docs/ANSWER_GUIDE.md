# Answer writing guide — Final Year (Papers 1–3)

This guide defines what every Final Year answer on the site must look like. It applies to answers written by a person or by an AI assistant. If an answer does not meet this guide, it stays at `status: draft`.

## 1. Where answers live

```
answers/
  _TEMPLATE.md                     ← copy this to start a new answer (ignored by the build)
  parkinsons-psychiatric-aspects.md
  ketamine-in-psychiatry.md
  ...
```

- **One file per question family**, named in lowercase with hyphens. The file name is the answer's ID.
- The file's `covers:` list holds the question IDs it answers. Find IDs in `docs/QUESTION_INDEX.md` (every question) or `docs/PRIORITY.md` (repeated questions already grouped).
- A question may be covered by **only one** answer file. Differently worded repeats — and the same question appearing in two papers — go in one `covers:` list.
- Never edit `final-answers-data.js` by hand. Run `npm run build` (see section 6).

## 2. File format

```markdown
---
title: Psychiatric aspects of Parkinson's disease
covers:
  - p3-1a2b3c4d
  - p3-5e6f7a8b
status: draft
updated: 2026-10-15
reviewer:
---

## Exam skeleton
...
## Full answer
...
## References
...
```

| Field | Meaning |
| --- | --- |
| `title` | Short descriptive title for the family |
| `covers` | Question IDs (one per line, `  - id`) |
| `status` | `draft`, `reviewed` or `verified` (see section 5) |
| `updated` | Date of last substantive change, `YYYY-MM-DD` |
| `reviewer` | Name/initials of the person who reviewed it (blank while draft) |

The three `##` sections are required and must use exactly these headings. Inside them, use `###` and `####` for sub-headings, Markdown tables, numbered and bulleted lists.

## 3. Depth standard

### Exam skeleton — what you write in the exam hall

- Fits on **about one printed page** (350–600 words).
- Mirrors the structure of the full answer, so revising it recalls the full content.
- Contains: one-line definition → headings in exam order → the **key numbers, trials, doses and criteria** under each heading → one table or flowchart → one-line conclusion.
- Written so it can be reproduced in roughly 15 minutes for a 10-mark short note, scaled up for 20–30 mark essays (more headings, not longer sentences).

### Full answer — for understanding

Target **2,000–3,500 words** for an essay or critical question, **1,200–2,000** for a short note. Cover every relevant item below, in this order, and say explicitly when an item does not apply:

1. **Introduction** — definition, origin of the concept (who, when), why it matters.
2. **Epidemiology** — prevalence and incidence with numbers; Indian data (NMHS, ICMR, Indian studies) wherever they exist.
3. **Classification / concepts** — ICD-11 and DSM-5-TR positions, and where they differ.
4. **Aetiology and mechanism** — written as causal chains (A → B → C), not lists of words.
5. **Clinical features** — phenomenology, subtypes, course.
6. **Assessment** — history, examination, scales (with what they measure), investigations with the reason for each.
7. **Differential diagnosis** — as a table with the distinguishing feature for each.
8. **Management** — stepwise and guideline-anchored; drug **doses**, durations, monitoring, special populations (pregnancy, elderly, children, medical comorbidity), psychological and social treatment.
9. **Evidence** — landmark trials and meta-analyses: **author, year, design, sample size, main result**.
10. **Critical appraisal** — controversies, limitations of the evidence, competing views. **Mandatory** for any question phrased "critically evaluate", "comment on", or a statement in quotes.
11. **Indian context** — Mental Healthcare Act 2017, RPwD Act 2016, NDPS, BNS 2023, POCSO, national programmes (NMHP/DMHP, Tele-MANAS, National Suicide Prevention Strategy), service realities, cultural factors.
12. **Recent advances** — developments from roughly the last five years, labelled as established or investigational.
13. **Conclusion** — two to four sentences that take a position.

Applied (case-based) questions: answer **each sub-question in order** under its own heading, using the patient's details; then add the general principles.

### Writing rules

- Every number, dose, criterion and trial result must be traceable to a reference in the References section.
- Prefer tables for comparisons and flowcharts (written as `Step → Step → Step`) for algorithms.
- Paraphrase sources. Do not copy textbook passages; quote at most a short phrase where exact wording matters (e.g. a legal definition), with the source.
- Use current terminology (ICD-11 names first; older names in brackets).
- Mark uncertainty honestly: "evidence is mixed", "not approved in India", "check current status".

## 4. References

- List every source used, numbered, in the format: *Author/Organisation. Title. Edition/Journal, year; chapter or pages.*
- Preferred hierarchy: Indian Psychiatric Society clinical practice guidelines → national/international guidelines (NICE, CANMAT/ISBD, APA, WFSBP, Maudsley Prescribing Guidelines) → standard textbooks (Kaplan & Sadock, New Oxford Textbook of Psychiatry, Lishman's Organic Psychiatry, Stahl) → primary trials and meta-analyses → Indian legislation (India Code).
- Cite the edition and chapter so a reviewer can check the page.
- Textbook PDFs used while writing must stay **outside the repository** (the `sources/` folder is git-ignored). Never commit copyrighted books.

## 5. Status and review

| Status | Meaning | Who sets it |
| --- | --- | --- |
| `draft` | Written but not checked by a person | Author (including AI drafts) |
| `reviewed` | A psychiatry resident/consultant has read it for accuracy and completeness | Reviewer, adding `reviewer:` |
| `verified` | Every number, dose and trial has been checked against the cited sources | Reviewer |

The site shows the status as a coloured badge on every answer, so readers know how far to trust it. An AI-written answer is always `draft` until a person reviews it.

## 6. Building and publishing

```bash
npm install        # once
npm run build      # regenerates final-answers-data.js and docs/QUESTION_INDEX.md
```

The build stops with an error if an answer covers an unknown or already-covered question ID, has an invalid status, or is missing a required section. Commit the answer file **and** the regenerated `final-answers-data.js` and `docs/QUESTION_INDEX.md` together.

If a question's wording is edited in `final-data.js`, its ID changes; the build will name the orphaned ID so the answer's `covers:` list can be updated from `docs/QUESTION_INDEX.md`.

## 7. Workflow per topic cluster

1. Pick the next cluster from `docs/PRIORITY.md` (repeated questions first, then the most-examined topics).
2. Gather sources for that cluster (chapters, guidelines, key papers) into `sources/` locally — or upload them to the AI session.
3. Write or generate the answers as `draft`, one file per question family.
4. `npm run build`, check the answers on the site locally (open `index.html` via a local server), commit on a branch, open a pull request.
5. A reviewer reads the pull request, fixes errors, sets `reviewed`/`verified`, and merges.
