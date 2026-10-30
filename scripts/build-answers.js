#!/usr/bin/env node
/* Build Final Year answers.
 *
 *   answers/*.md  ──►  final-answers-data.js   (loaded by index.html)
 *                 └─►  docs/QUESTION_INDEX.md  (every question with its ID)
 *
 * Usage:  npm install   (once)
 *         npm run build:answers
 *
 * The build fails if an answer covers an unknown question ID, if two answers
 * cover the same question, or if a required field/section is missing.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { marked } = require('marked');
const { finalQid } = require('../qid.js');

const ROOT = path.resolve(__dirname, '..');
const ANSWERS_DIR = path.join(ROOT, 'answers');
const OUT_JS = path.join(ROOT, 'final-answers-data.js');
const OUT_INDEX = path.join(ROOT, 'docs', 'QUESTION_INDEX.md');

const STATUSES = ['draft', 'reviewed', 'verified'];
const SOURCES = ['', 'ai-generated']; // provenance tag shown as a badge on the site
const REQUIRED_SECTIONS = ['Exam answer', 'In depth', 'References'];

/* ---------- load question data ---------- */
function loadPapers() {
  const src = fs.readFileSync(path.join(ROOT, 'final-data.js'), 'utf8');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(src + '\n;this.__p = {p1: PAPERS1, p2: PAPERS2, p3: PAPERS3};', ctx);
  return ctx.__p;
}

function collectQuestions(papers) {
  const byId = new Map();
  for (const [paper, sittings] of Object.entries(papers)) {
    for (const s of sittings) {
      const entries = [];
      for (const k of ['critical', 'applied', 'essay1', 'essay2']) {
        if (s[k]) entries.push({ kind: k, ...s[k] });
      }
      (s.shortNotes || []).forEach(sn => entries.push({ kind: 'short', ...sn }));
      for (const e of entries) {
        const text = e.text || e.stem;
        const id = finalQid(paper, text);
        if (!byId.has(id)) {
          byId.set(id, { id, paper, text, kind: e.kind, marks: e.marks, topic: e.topic, sittings: [] });
        }
        byId.get(id).sittings.push(`${s.sitting} ${s.version}`);
      }
    }
  }
  return byId;
}

/* ---------- minimal front-matter parser (scalars + "- item" lists) ---------- */
function parseFrontMatter(raw, file) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) throw new Error(`${file}: missing front matter (--- ... ---)`);
  const meta = {};
  let listKey = null;
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const li = line.match(/^\s+-\s+(.*)$/);
    if (li && listKey) { meta[listKey].push(li[1].trim()); continue; }
    const kv = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (!kv) throw new Error(`${file}: cannot parse front-matter line: ${line}`);
    const [, key, val] = kv;
    if (val === '') { meta[key] = []; listKey = key; }
    else { meta[key] = val.replace(/^["']|["']$/g, ''); listKey = null; }
  }
  return { meta, body: m[2] };
}

function splitSections(body, file) {
  const parts = {};
  const re = /^## +(.+?)\s*$/gm;
  const heads = [];
  let mm;
  while ((mm = re.exec(body))) heads.push({ title: mm[1], start: mm.index, end: re.lastIndex });
  heads.forEach((h, i) => {
    const next = i + 1 < heads.length ? heads[i + 1].start : body.length;
    parts[h.title] = body.slice(h.end, next).trim();
  });
  for (const s of REQUIRED_SECTIONS) {
    if (!(s in parts)) throw new Error(`${file}: missing section "## ${s}"`);
  }
  return parts;
}

/* ---------- main ---------- */
function main() {
  const questions = collectQuestions(loadPapers());
  const answers = {};
  const byQuestion = {};
  const errors = [];

  const files = fs.existsSync(ANSWERS_DIR)
    ? fs.readdirSync(ANSWERS_DIR).filter(f => f.endsWith('.md') && !f.startsWith('_')).sort()
    : [];

  for (const f of files) {
    try {
      const raw = fs.readFileSync(path.join(ANSWERS_DIR, f), 'utf8');
      const { meta, body } = parseFrontMatter(raw, f);
      const id = path.basename(f, '.md');
      if (meta.id && meta.id !== id) throw new Error(`${f}: id "${meta.id}" must match file name "${id}"`);
      if (!meta.title) throw new Error(`${f}: missing title`);
      if (!Array.isArray(meta.covers) || !meta.covers.length) throw new Error(`${f}: covers must list at least one question ID`);
      if (!STATUSES.includes(meta.status)) throw new Error(`${f}: status must be one of ${STATUSES.join(', ')}`);
      const source = typeof meta.source === 'string' ? meta.source : '';
      if (!SOURCES.includes(source)) throw new Error(`${f}: source must be blank or one of ${SOURCES.filter(Boolean).join(', ')}`);
      for (const q of meta.covers) {
        if (!questions.has(q)) errors.push(`${f}: covers unknown question ID ${q} (question wording may have changed — see docs/QUESTION_INDEX.md)`);
        else if (byQuestion[q]) errors.push(`${f}: question ${q} is already covered by ${byQuestion[q]}`);
        else byQuestion[q] = id;
      }
      const sec = splitSections(body, f);
      answers[id] = {
        title: meta.title,
        status: meta.status,
        updated: meta.updated || '',
        reviewer: meta.reviewer || '',
        source,
        covers: meta.covers,
        exam: marked.parse(sec['Exam answer']),
        depth: marked.parse(sec['In depth']),
        refs: marked.parse(sec['References'])
      };
    } catch (e) {
      errors.push(e.message);
    }
  }

  if (errors.length) {
    console.error('Build failed:\n  ' + errors.join('\n  '));
    process.exit(1);
  }

  const header = '/* GENERATED by scripts/build-answers.js from answers/*.md — do not edit by hand. */\n';
  fs.writeFileSync(OUT_JS, header + 'const FINAL_ANSWERS = ' + JSON.stringify({ answers, byQuestion }) + ';\n');

  // Question index for authors
  const labels = { p1: 'Paper 1 — Core Psychiatry', p2: 'Paper 2 — Recent Advances & Specialties', p3: 'Paper 3 — Neurology & CL Psychiatry' };
  const kindLabel = { critical: 'Critical', applied: 'Applied', essay1: 'Essay', essay2: 'Essay', short: 'Short note' };
  let md = '# Final Year question index\n\nGenerated by `npm run build:answers`. Use the **ID** in an answer file\'s `covers:` list.\n\n';
  const all = [...questions.values()];
  md += `**${all.length} distinct questions · ${Object.keys(byQuestion).length} answered · ${files.length} answer files**\n\n`;
  for (const p of ['p1', 'p2', 'p3']) {
    const rows = all.filter(q => q.paper === p)
      .sort((a, b) => (a.topic || '').localeCompare(b.topic || '') || b.sittings.length - a.sittings.length);
    md += `## ${labels[p]}\n\n| ID | Question | Type | Asked | Topic | Answer |\n| --- | --- | --- | --- | --- | --- |\n`;
    for (const q of rows) {
      const t = q.text.replace(/\|/g, '/').replace(/\s+/g, ' ');
      const short = t.length > 140 ? t.slice(0, 137) + '…' : t;
      md += `| \`${q.id}\` | ${short} | ${kindLabel[q.kind]} | ${q.sittings.length} | ${q.topic || ''} | ${byQuestion[q.id] ? '`' + byQuestion[q.id] + '`' : '—'} |\n`;
    }
    md += '\n';
  }
  fs.mkdirSync(path.dirname(OUT_INDEX), { recursive: true });
  fs.writeFileSync(OUT_INDEX, md);

  console.log(`Built ${Object.keys(answers).length} answers covering ${Object.keys(byQuestion).length}/${all.length} questions.`);
}

main();
