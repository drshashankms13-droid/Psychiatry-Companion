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
- Never edit `final-answers-data.js` by hand. Run `npm run build:answers` (see section 6).

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

## Exam answer
...
## In depth
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

### Exam answer — always visible on the site

The answer a student learns and writes in the exam. It sits between a bare skeleton and a textbook chapter.

- **Length:** about **800–1,300 words** for a 10-mark short note (roughly double a bare skeleton); up to about **1,800** for 20–30 mark essays and applied cases.
- **Structure:** definition → mechanism → the core clinical content (usually one comparison table) → assessment → management as steps or a flowchart → key evidence named briefly → a conclusion that takes a position.
- Includes the **key numbers, criteria, trials and drug doses** an examiner expects to see.
- No "why it matters" or motivational preamble — start with the definition.
- Use the heading **Mechanism** (not "mechanism in one line").
- No "Pitfalls" section.

### In depth — shown behind the "In Depth" toggle

Additional material for understanding. **It must not repeat anything already in the Exam answer** — no restated definitions, tables or management steps. A reader opens it to learn what the Exam answer leaves out.

Target **1,500–3,000 words of new content**. Use these headings, in this order, skipping any that would only repeat the Exam answer:

1. **Background** — origin of the concept (who, when), historical development.
2. **Epidemiology** — figures *not* in the exam answer: global burden, Indian data (NMHS, ICMR, Indian studies), risk factors; plus the sources of the frequencies quoted in the exam answer.
3. **Classification and criteria** — ICD-11 and DSM-5-TR positions, specific diagnostic criteria, where they differ.
4. **Mechanism in detail** — causal chains (A → B → C), neurotransmitter tables, models.
5. **Clinical features in detail** — phenomenology, subtypes, course, examples.
6. **Assessment in detail** — scales and what they measure, investigations with the reason for each.
7. **Differential diagnosis** — a table with the distinguishing feature for each.
8. **Management details** — doses, cautions, interactions, special populations (pregnancy, elderly, children, medical comorbidity) not given in the exam answer.
9. **Evidence table** — landmark trials and meta-analyses: author, year, design, sample size, main result.
10. **Critical appraisal** — controversies, limitations of the evidence, competing views. **Mandatory** for any question phrased "critically evaluate", "comment on", or a statement in quotes.
11. **Indian context** — Mental Healthcare Act 2017, RPwD Act 2016, NDPS, BNS 2023, POCSO, national programmes (NMHP/DMHP, Tele-MANAS, National Suicide Prevention Strategy), service realities, cultural factors.
12. **Recent advances** — developments from roughly the last five years, labelled as established or investigational.

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
npm run build:answers      # regenerates final-answers-data.js and docs/QUESTION_INDEX.md
```

The build stops with an error if an answer covers an unknown or already-covered question ID, has an invalid status, or is missing a required section. Commit the answer file **and** the regenerated `final-answers-data.js` and `docs/QUESTION_INDEX.md` together.

If a question's wording is edited in `final-data.js`, its ID changes; the build will name the orphaned ID so the answer's `covers:` list can be updated from `docs/QUESTION_INDEX.md`.

## 7. Workflow per topic cluster

1. Pick the next cluster from `docs/PRIORITY.md` (repeated questions first, then the most-examined topics).
2. Gather sources for that cluster (chapters, guidelines, key papers) into `sources/` locally — or upload them to the AI session.
3. Write or generate the answers as `draft`, one file per question family.
4. `npm run build:answers`, check the answers on the site locally (open `index.html` via a local server), commit on a branch, open a pull request.
5. A reviewer reads the pull request, fixes errors, sets `reviewed`/`verified`, and merges.
