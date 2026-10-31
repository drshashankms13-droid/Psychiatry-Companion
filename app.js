/* ============================================================
   NIMHANS Question Bank — app logic (multi-paper, cloud-synced)
   No inline event handlers: every interaction goes through the
   delegated listeners at the bottom (data-action="…"), so the page
   can run under a strict Content-Security-Policy.
   ============================================================ */

/* ---------- Resilience: never fail silently ---------- */
function showFatalBanner(message){
  let banner = document.getElementById('fatalBanner');
  if(!banner){
    banner = document.createElement('div');
    banner.id = 'fatalBanner';
    banner.setAttribute('role', 'alert');
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#7a2c22;color:#fff;padding:12px 18px;font-family:sans-serif;font-size:.9rem;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,.3);';
    document.body.appendChild(banner);
  }
  banner.textContent = message + ' ';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'Refresh';
  btn.dataset.action = 'reload';
  btn.style.cssText = 'margin-left:10px;background:#fff;color:#7a2c22;border:none;padding:6px 14px;border-radius:5px;cursor:pointer;font-weight:700;';
  banner.appendChild(btn);
}
window.addEventListener('error', function(e){
  console.error('Unhandled error:', e.error || e.message);
  showFatalBanner('Something went wrong loading part of the app.');
});
window.addEventListener('unhandledrejection', function(e){
  console.error('Unhandled promise rejection:', e.reason);
  showFatalBanner('Something went wrong syncing with the server.');
});

/* ---------- Toasts (replace blocking alert()) ---------- */
function toast(message, kind){
  const region = document.getElementById('toastRegion');
  if(!region) return;
  const el = document.createElement('div');
  el.className = 'toast' + (kind === 'err' ? ' err' : '');
  el.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#${kind === 'err' ? 'i-alert' : 'i-check'}"/></svg><span></span>`;
  el.querySelector('span').textContent = message;
  region.appendChild(el);
  setTimeout(()=> el.remove(), kind === 'err' ? 6000 : 2500);
}

/* ---------- Supabase setup ---------- */
// The anon key is designed to be public; all protection comes from Row Level Security
// (see supabase_setup.sql + supabase_security.sql).
const SUPABASE_URL = 'https://mxqjvjdjnasavrbbxame.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14cWp2amRqbmFzYXZyYmJ4YW1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2NTk5OTksImV4cCI6MjA5OTIzNTk5OX0.IfEzIz3CQN4Qcd4oclgZxxLroH24p5fw_7k4nSTxu2M';
let supabaseClient = null;
try{
  if(!window.supabase) throw new Error('Supabase library did not load (check your internet connection or ad-blocker).');
  // PKCE: Google sends back a one-time ?code= that is exchanged for a session,
  // so access/refresh tokens never appear in the address bar or browser history.
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true }
  });
}catch(e){
  console.error('Supabase init failed:', e);
  showFatalBanner('Could not connect to the sign-in service. Please check your connection and refresh.');
}

/* ---------- Guard against missing data files ---------- */
function dataFilesOk(){
  const missing = [];
  if(typeof PAPERS1 === 'undefined' || typeof PAPERS2 === 'undefined' || typeof PAPERS3 === 'undefined') missing.push('Final Year question data');
  if(typeof NEURO_TOPICS === 'undefined' || typeof PSYCH_TOPICS === 'undefined' || typeof YEAR_DATA === 'undefined') missing.push('First Year question data');
  if(missing.length){
    console.error('Missing data files:', missing);
    showFatalBanner('Some content failed to load (' + missing.join(', ') + '). Please refresh — if this keeps happening, the site files may be incomplete.');
    return false;
  }
  return true;
}

/* ---------- Data files are loaded on demand ----------
   The login page needs none of them, so nothing heavy is downloaded before
   sign-in. Questions load after sign-in; the large answer/notes files load
   only when a view that shows them is opened. */
const DATA_FILES = {
  core: ['final-data.js', 'fy-data.js'],
  fyNotes: ['notes-data.js'],
  fyAnswers: ['answers-data.js'],
  finalAnswers: ['final-answers-data.js']
};
const dataLoads = {};
const dataLoaded = {};
function loadScriptOnce(src){
  return new Promise((resolve, reject)=>{
    const el = document.createElement('script');
    el.src = src;
    el.onload = ()=> resolve();
    el.onerror = ()=>{ el.remove(); reject(new Error('Could not download ' + src)); };
    document.body.appendChild(el);
  });
}
function ensureData(key){
  if(!dataLoads[key]){
    dataLoads[key] = Promise.all(DATA_FILES[key].map(loadScriptOnce))
      .then(()=>{ dataLoaded[key] = true; })
      .catch(e=>{ delete dataLoads[key]; throw e; }); // allow a retry
  }
  return dataLoads[key];
}
// Optional data: empty fallbacks until (or if) the file arrives.
function notesData(){ return typeof TOPIC_NOTES !== 'undefined' ? TOPIC_NOTES : {}; }
function fyAnswerData(){ return typeof ANSWER_DATA !== 'undefined' ? ANSWER_DATA : {}; }
function finalAnswerData(){ return typeof FINAL_ANSWERS !== 'undefined' ? FINAL_ANSWERS : { answers:{}, byQuestion:{} }; }

/* ---------- Lazily built card bodies ----------
   Closed cards get an empty body; its HTML is built the first time the card
   is opened. Keeps big views (Q&A, study notes) fast on phones. */
let LAZY = {};
let lazySeq = 0;
function lazyBody(cls, open, build){
  if(open) return `<div class="${cls}">${build()}</div>`;
  const id = 'lz' + (lazySeq++);
  LAZY[id] = build;
  return `<div class="${cls}" data-lazy="${id}"></div>`;
}
function fillLazy(details){
  const body = details.querySelector(':scope > [data-lazy]');
  if(!body) return;
  const build = LAZY[body.dataset.lazy];
  delete LAZY[body.dataset.lazy];
  body.removeAttribute('data-lazy');
  if(build) body.innerHTML = build();
}
if(typeof finalQid === 'undefined'){ window.finalQid = function(p, t){ return p + '-' + String(t||'').trim().toLowerCase().replace(/\s+/g,' '); }; }

let currentUser = null;

const PAPER_CONFIG = {
  p1: {
    label: 'Core Psychiatry',
    data: () => PAPERS1,
    primaryKinds: [
      {key:'critical', groupLabel:'Critical Essay / Evaluation', sectionTitle:'Critical Essay / Evaluation Questions', allLabel:'All Critical Essay Questions', unitNoun:'questions'},
      {key:'applied', groupLabel:'Applied Knowledge', sectionTitle:'Applied Knowledge (Case-based)', allLabel:'All Applied Knowledge Cases', unitNoun:'cases'}
    ]
  },
  p2: {
    label: 'Recent Advances in Psychiatry & Specialties',
    data: () => PAPERS2,
    primaryKinds: [
      {key:'critical', groupLabel:'Critical Essay / Evaluation', sectionTitle:'Critical Essay / Evaluation Questions', allLabel:'All Critical Essay Questions', unitNoun:'questions'},
      {key:'applied', groupLabel:'Applied Knowledge', sectionTitle:'Applied Knowledge (Case-based)', allLabel:'All Applied Knowledge Cases', unitNoun:'cases'}
    ]
  },
  p3: {
    label: 'Neurology & Consultation-Liaison Psychiatry',
    data: () => PAPERS3,
    primaryKinds: [
      {key:'essay1', groupLabel:'Essay Question 1', sectionTitle:'Essay Question 1', allLabel:'All Essay Question 1 Answers', unitNoun:'questions'},
      {key:'essay2', groupLabel:'Essay Question 2', sectionTitle:'Essay Question 2', allLabel:'All Essay Question 2 Answers', unitNoun:'questions'}
    ]
  },
  'fy-neuro': {
    label: 'Basic Neurosciences',
    mode: 'topic-first',
    data: () => NEURO_TOPICS,
    yearData: () => YEAR_DATA.neuro,
    bodyClass: 'fy-neuro'
  },
  'fy-psych': {
    label: 'Psychology, Sociology & Anthropology',
    mode: 'topic-first',
    data: () => PSYCH_TOPICS,
    yearData: () => YEAR_DATA.psych,
    bodyClass: 'fy-psych'
  }
};

let examLevel = 'final'; // 'final' | 'first'
let FY_TEXT_INDEX = {}; // currentPaper -> Map(normalizedText -> item)
function fyNorm(s){ return (s||'').trim().toLowerCase().replace(/\s+/g,' '); }
function fySection(){ return currentPaper === 'fy-neuro' ? 'neuro' : 'psych'; }

let currentPaper = 'p1';
let currentView = 'year';
let allExpanded = false;
let checklist = {};
let PAPERS = [];
let ITEMS = [];

/* ---------- Paper 3 domain split: Neurology vs Consultation-Liaison Psychiatry ---------- */
const P3_DOMAINS = [
  {
    key: 'neuro',
    label: 'Neurology',
    topics: [
      'Autoimmune & Infectious Neuropsychiatry',
      'Dementia & Neurocognitive Disorders',
      'Epilepsy & Seizure Disorders',
      'Functional Neurological Disorders',
      'Headache & Migraine',
      'Movement Disorders',
      'Neuroscience & Novel Treatments',
      'Sleep Disorders',
      'Stroke & Cerebrovascular Disease',
      'Traumatic Brain Injury & Post-concussion'
    ]
  },
  {
    key: 'cl',
    label: 'Consultation-Liaison Psychiatry',
    topics: [
      'Chronic Illness & Psychosomatic Medicine',
      'COVID-19 Neuropsychiatric Aspects',
      'Endocrine & Metabolic Neuropsychiatry',
      'Forensic & Ethics in Neuropsychiatry',
      'Geriatric Neuropsychiatry',
      "Perinatal & Women's Mental Health",
      'Psychopharmacology & Treatment-Induced Syndromes',
      'Sexual Medicine & Gender Identity'
    ]
  }
];
function domainForTopic(topic){
  for(const d of P3_DOMAINS){ if(d.topics.includes(topic)) return d; }
  return null;
}

/* ---------- Cloud checklist sync ---------- */
// Returns the set of ticked question ids, or null if it could not be loaded.
async function fetchChecklist(paper){
  try{
    const { data, error } = await supabaseClient
      .from('checklist_progress')
      .select('uid')
      .eq('paper', paper);
    if(error) throw error;
    const obj = {};
    (data||[]).forEach(row => { obj[row.uid] = true; });
    return obj;
  }catch(e){
    console.error('Failed to load progress', e);
    return null;
  }
}
// Retries a couple of times so a brief network blip does not show
// everything as unticked (which looks like lost progress).
async function loadChecklistFromCloud(){
  if(!currentUser) return {};
  const paper = currentPaper;
  for(const wait of [0, 1500, 4000]){
    if(wait) await new Promise(r=>setTimeout(r, wait));
    if(paper !== currentPaper) return {};
    const res = await fetchChecklist(paper);
    if(res) return res;
  }
  toast('Could not load your saved ticks — they are safe on the server. Refresh to try again.', 'err');
  return {};
}

async function upsertProgress(uid){
  return supabaseClient.from('checklist_progress').upsert({
    user_id: currentUser.id,
    paper: currentPaper,
    uid: uid,
    updated_at: new Date().toISOString()
  }, { onConflict: 'user_id,paper,uid' });
}

async function deleteProgress(uid){
  return supabaseClient.from('checklist_progress')
    .delete()
    .eq('user_id', currentUser.id)
    .eq('paper', currentPaper)
    .eq('uid', uid);
}

/* ---------- Build flat item list (for counts / search / topics) ---------- */
function buildItems(){
  if(PAPER_CONFIG[currentPaper].mode === 'topic-first'){
    return buildFYItems();
  }
  const items = [];
  const kinds = PAPER_CONFIG[currentPaper].primaryKinds;
  PAPERS.forEach(p=>{
    kinds.forEach(k=>{
      const src = p[k.key];
      if(!src) return;
      items.push({
        uid: p.id + '-' + k.key,
        kind: k.key,
        paper: p,
        text: src.text,
        stem: src.stem,
        subs: src.subs,
        marks: src.marks,
        topic: src.topic
      });
    });
    p.shortNotes.forEach((sn, i)=>{
      items.push({
        uid: p.id + '-sn-' + i,
        kind: 'short',
        paper: p,
        text: sn.text,
        marks: sn.marks,
        topic: sn.topic
      });
    });
  });
  return items;
}

/* ---------- Build flat item list for First Year (topic-first) papers ---------- */
function buildFYItems(){
  const items = [];
  const topics = PAPER_CONFIG[currentPaper].data();
  const textIndex = new Map();

  topics.forEach((t, ti)=>{
    if(t.subgroups){
      let qi = 0;
      t.subgroups.forEach((sg)=>{
        sg.questions.forEach(q=>{
          const item = {
            uid: currentPaper + '-t' + ti + '-' + qi,
            kind: 'fy',
            topic: t.topic,
            subgroup: sg.subgroup,
            text: q.text,
            year: q.year,
            typeLabel: q.type
          };
          items.push(item);
          textIndex.set(fyNorm(item.text), item);
          qi++;
        });
      });
    } else {
      t.questions.forEach((q, qi)=>{
        const item = {
          uid: currentPaper + '-t' + ti + '-' + qi,
          kind: 'fy',
          topic: t.topic,
          text: q.text,
          year: q.year,
          typeLabel: q.type
        };
        items.push(item);
        textIndex.set(fyNorm(item.text), item);
      });
    }
  });

  // Cross-link (and fall back to including) any questions that only appear
  // in the by-sitting dataset, so the two views always share one checklist.
  const yearGroups = PAPER_CONFIG[currentPaper].yearData ? PAPER_CONFIG[currentPaper].yearData() : null;
  if(yearGroups){
    yearGroups.forEach((g, gi)=>{
      g.questions.forEach((q, qi)=>{
        const key = fyNorm(q.text);
        if(!textIndex.has(key)){
          const item = {
            uid: currentPaper + '-y' + gi + '-' + qi,
            kind: 'fy',
            topic: null,
            text: q.text,
            year: g.year,
            typeLabel: q.type
          };
          items.push(item);
          textIndex.set(key, item);
        }
      });
    });
  }

  FY_TEXT_INDEX[currentPaper] = textIndex;
  return items;
}

/* ---------- Helpers ---------- */
function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function slugify(s){ return String(s).replace(/[^a-z0-9]+/gi,'-').toLowerCase(); }
const CHEV = '<svg class="chev icon" aria-hidden="true"><use href="#i-chev"/></svg>';
let hideDone = false;

function matchesSearch(item, q){
  if(!q) return true;
  q = q.toLowerCase();
  const hay = [
    item.text||'', item.stem||'', (item.subs||[]).join(' '),
    item.topic||'', item.subgroup||'',
    item.paper ? item.paper.date : (item.year||''),
    item.paper ? item.paper.sitting : '',
    item.paper ? item.paper.version : ''
  ].join(' ').toLowerCase();
  return hay.includes(q);
}
// Search + the "Hide completed" switch together decide what is shown.
function isVisible(item, q){
  if(hideDone && checklist[item.uid]) return false;
  return matchesSearch(item, q);
}
function isFiltering(q){ return !!q || hideDone; }

/* Progress pills are registered per render so ticking a box can update every
   card that contains it without re-rendering (which would lose scroll/open state). */
let GROUPS = [];
let UID_GROUPS = {};
function registerGroup(items){
  const id = GROUPS.length;
  GROUPS.push(items.map(i=>i.uid));
  items.forEach(i=>{ (UID_GROUPS[i.uid] = UID_GROUPS[i.uid] || []).push(id); });
  return id;
}
function progressPill(items, style){
  const id = registerGroup(items);
  const done = items.filter(i=>checklist[i.uid]).length;
  const total = items.length;
  const pct = total ? Math.round(done/total*100) : 0;
  const complete = total && done === total ? ' complete' : '';
  if(style === 'count'){
    return `<span class="card-count" data-group="${id}" data-style="count">${done}/${total} done</span>`;
  }
  return `<span class="mini-bar" aria-hidden="true" data-bar="${id}"><span style="width:${pct}%"></span></span>`
       + `<span class="pill-progress${complete}" data-group="${id}">${done} / ${total} done</span>`;
}
function refreshGroups(uid){
  (UID_GROUPS[uid] || []).forEach(id=>{
    const uids = GROUPS[id];
    const done = uids.filter(u=>checklist[u]).length;
    const total = uids.length;
    document.querySelectorAll(`[data-group="${id}"]`).forEach(el=>{
      el.textContent = el.dataset.style === 'count' ? `${done}/${total} done` : `${done} / ${total} done`;
      el.classList.toggle('complete', total > 0 && done === total);
    });
    const bar = document.querySelector(`[data-bar="${id}"] span`);
    if(bar) bar.style.width = (total ? Math.round(done/total*100) : 0) + '%';
  });
}

function checkboxHtml(uid){
  const checked = checklist[uid] ? 'checked' : '';
  return `<label class="check"><input type="checkbox" ${checked} data-uid="${esc(uid)}" aria-label="Mark as done"></label>`;
}
function topicBadge(topic){
  if(!topic) return '';
  return `<button type="button" class="badge topic" data-action="jump-topic" data-topic="${esc(topic)}" title="Show all questions on this topic"><svg class="icon" aria-hidden="true"><use href="#i-tag"/></svg>${esc(topic)}</button>`;
}

function questionRowHtml(item, num){
  const done = checklist[item.uid] ? 'done' : '';
  let body = '';
  if(item.subs && item.subs.length){
    const subsHtml = item.subs.map(s=>`<li>${esc(s)}</li>`).join('');
    body = `<span class="stem">${esc(item.stem)}</span><ol>${subsHtml}</ol>`;
  } else {
    body = esc(item.text);
  }
  const numHtml = (num!=null) ? `<span class="qnum">${esc(num)}</span>` : '';
  return `
  <div class="qitem ${done}" data-uid="${esc(item.uid)}">
    ${checkboxHtml(item.uid)}
    <div class="qbody">
      <div class="qtext">${numHtml}${body}</div>
      <div class="qmeta">
        <span class="badge marks">${esc(item.marks)} marks</span>
        ${topicBadge(item.topic)}
        <span class="badge date">${esc(item.paper.date)} · ${esc(item.paper.version)}</span>
      </div>
    </div>
  </div>`;
}

function fyQuestionRowHtml(item, num){
  const done = checklist[item.uid] ? 'done' : '';
  const numHtml = (num!=null) ? `<span class="qnum">${esc(num)}</span>` : '';
  return `
  <div class="qitem ${done}" data-uid="${esc(item.uid)}">
    ${checkboxHtml(item.uid)}
    <div class="qbody">
      <div class="qtext">${numHtml}${esc(item.text)}</div>
      <div class="qmeta">
        ${item.typeLabel ? `<span class="badge marks">${esc(item.typeLabel)}</span>` : ''}
        ${topicBadge(item.topic)}
        ${item.year ? `<span class="badge date">${esc(item.year)}</span>` : ''}
      </div>
    </div>
  </div>`;
}

function emptyNote(text){
  return `<div class="empty-note"><svg class="icon" aria-hidden="true"><use href="#i-inbox"/></svg>${esc(text)}</div>`;
}
function sectionHeading(num, title, count){
  return `<div class="section-heading"><div class="num">${esc(num)}</div><h2>${esc(title)}</h2><div class="section-rule"></div>${count ? `<div class="count">${esc(count)}</div>` : ''}</div>`;
}
function openAttr(q){ return (allExpanded || q) ? 'open' : ''; }

// Saves for the same question run one after another, so a quick
// tick-untick can never reach the server in the wrong order.
const syncChains = {};
function queueSync(uid, task){
  const next = (syncChains[uid] || Promise.resolve()).catch(()=>{}).then(task);
  syncChains[uid] = next;
  next.finally(()=>{ if(syncChains[uid] === next) delete syncChains[uid]; }).catch(()=>{});
  return next;
}

async function toggleItem(uid, row, cb){
  const newState = !!cb.checked;
  checklist[uid] = newState;
  if(row){ row.classList.toggle('done', newState); }
  updateProgress();
  refreshGroups(uid);
  try{
    const { error } = await queueSync(uid, ()=> newState ? upsertProgress(uid) : deleteProgress(uid));
    if(error) throw error;
  }catch(e){
    console.error('Sync failed', e);
    if(checklist[uid] !== newState) return; // already changed again; the newer save decides
    checklist[uid] = !newState;
    if(row){ row.classList.toggle('done', !newState); }
    cb.checked = !newState;
    updateProgress();
    refreshGroups(uid);
    toast('Could not save your progress — check your connection and try again.', 'err');
  }
}

async function clearChecklist(){
  if(!currentUser) return;
  if(!confirm(`Erase all checked-off questions for "${PAPER_CONFIG[currentPaper].label}"? This cannot be undone.`)) return;
  const prev = checklist;
  checklist = {};
  renderAll();
  try{
    const { error } = await supabaseClient.from('checklist_progress')
      .delete()
      .eq('user_id', currentUser.id)
      .eq('paper', currentPaper);
    if(error) throw error;
    toast('Progress erased for this paper.');
  }catch(e){
    console.error('Clear failed', e);
    checklist = prev;
    renderAll();
    toast('Could not erase your progress — check your connection and try again.', 'err');
  }
}

function updateProgress(){
  const total = ITEMS.length;
  const done = ITEMS.filter(i=>checklist[i.uid]).length;
  const pct = total ? Math.round((done/total)*100) : 0;
  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('progressTrack').setAttribute('aria-valuenow', pct);
  document.getElementById('progressLabel').textContent = `${done} / ${total} solved (${pct}%)`;
  const ring = document.getElementById('ovRing');
  if(ring){
    ring.style.setProperty('--p', pct);
    document.getElementById('ovPct').textContent = pct + '%';
    document.getElementById('ovDone').textContent = done;
    document.getElementById('ovLeft').textContent = total - done;
  }
}

/* ---------- Overview card at the top of every view ---------- */
function overviewHtml(){
  const cfg = PAPER_CONFIG[currentPaper];
  const total = ITEMS.length;
  const level = examLevel === 'final' ? 'NIMHANS Final Year' : 'NIMHANS First Year';
  return `<section class="overview" aria-label="Paper overview">
    <div class="ring" id="ovRing" style="--p:0"><div class="ring-inner" id="ovPct">0%</div></div>
    <div>
      <div class="overview-kicker">${esc(level)}</div>
      <h1>${esc(cfg.label)}</h1>
      <div class="overview-stats">
        <span><strong>${total}</strong> questions</span>
        <span><strong id="ovDone">0</strong> done</span>
        <span><strong id="ovLeft">${total}</strong> left</span>
      </div>
    </div>
  </section>`;
}

/* ---------- View: Year-wise ---------- */
function renderYearView(q){
  if(PAPER_CONFIG[currentPaper].mode === 'topic-first'){ return renderFYYearView(q); }
  const papers = [...PAPERS].sort((a,b)=> b.sortKey.localeCompare(a.sortKey));
  const kinds = PAPER_CONFIG[currentPaper].primaryKinds;
  let html = sectionHeading('Y', 'Papers, most recent first', `${papers.length} sittings`);
  let anyVisible = false;

  papers.forEach(p=>{
    const primaryItems = kinds.map(k=> ITEMS.find(i=>i.uid === p.id+'-'+k.key)).filter(Boolean);
    const snItems = ITEMS.filter(i=>i.kind==='short' && i.paper.id===p.id);
    const visPrimary = primaryItems.filter(i=>isVisible(i,q));
    const visSn = snItems.filter(i=>isVisible(i,q));
    if(visPrimary.length===0 && visSn.length===0) return;
    anyVisible = true;

    const paperItems = [...primaryItems, ...snItems];
    html += `<details class="paper-card" ${openAttr(q)}>
      <summary class="card-head">${CHEV}
        <span class="card-title">${esc(p.sitting)} · ${esc(p.version)}</span>
        ${progressPill(paperItems)}
      </summary>
      <div class="card-body">`;
    kinds.forEach(k=>{
      const item = visPrimary.find(i=>i.kind===k.key);
      if(item) html += `<div class="qgroup-label">${esc(k.groupLabel)}</div>` + questionRowHtml(item, 1);
    });
    if(visSn.length){
      html += `<div class="qgroup-label">Short Notes</div>`;
      visSn.forEach((i,idx)=> html += questionRowHtml(i, String.fromCharCode(97+idx)+'.'));
    }
    html += `</div></details>`;
  });

  if(!anyVisible) html += emptyNote(hideDone && !q ? 'Everything here is done — nice work.' : 'No questions match your search.');
  return html;
}

/* ---------- View: Topic-wise ---------- */
function renderTopicView(q){
  if(PAPER_CONFIG[currentPaper].mode === 'topic-first'){ return renderFYTopicView(q); }
  let html = '';
  const kinds = PAPER_CONFIG[currentPaper].primaryKinds;

  kinds.forEach((k, sectionIdx)=>{
    const kindItems = ITEMS.filter(i=>i.kind===k.key).sort((a,b)=> b.paper.sortKey.localeCompare(a.paper.sortKey));
    const kindVis = kindItems.filter(i=>isVisible(i,q));
    html += sectionHeading(sectionIdx+1, k.sectionTitle, `${kindItems.length} ${k.unitNoun}`);
    if(kindVis.length){
      html += `<details class="topic-block" ${openAttr(q)}>
        <summary class="card-head">${CHEV}
          <span class="card-title">${esc(k.allLabel)}</span>
          ${progressPill(kindItems, 'count')}
        </summary>
        <div class="card-body">`;
      kindVis.forEach((i,idx)=> html += questionRowHtml(i, idx+1));
      html += `</div></details>`;
    } else {
      html += emptyNote('No matches.');
    }
  });

  // Short Notes — grouped by topic, topics sorted by frequency desc
  const shortItems = ITEMS.filter(i=>i.kind==='short');
  const topicMap = {};
  shortItems.forEach(i=>{ (topicMap[i.topic] = topicMap[i.topic] || []).push(i); });
  const topics = Object.keys(topicMap).sort((a,b)=> topicMap[b].length - topicMap[a].length || a.localeCompare(b));
  html += sectionHeading(kinds.length+1, 'Short Notes — by Topic', `${shortItems.length} questions · ${topics.length} topics`);

  let anyTopicVisible = false;
  function renderTopicBlock(topic){
    const list = topicMap[topic].sort((a,b)=> b.paper.sortKey.localeCompare(a.paper.sortKey));
    const vis = list.filter(i=>isVisible(i,q));
    if(vis.length===0 && isFiltering(q)) return '';
    anyTopicVisible = true;
    let block = `<details class="topic-block" id="topic-${slugify(topic)}" ${openAttr(q)}>
      <summary class="card-head">${CHEV}
        <span class="card-title">${esc(topic)}</span>
        ${progressPill(list, 'count')}
      </summary>
      <div class="card-body">`;
    vis.forEach((i,idx)=> block += questionRowHtml(i, idx+1));
    block += `</div></details>`;
    return block;
  }

  if(currentPaper === 'p3'){
    P3_DOMAINS.forEach(domain=>{
      const domainTopics = topics.filter(t=> domainForTopic(t) && domainForTopic(t).key === domain.key);
      if(!domainTopics.length) return;
      const inner = domainTopics.map(renderTopicBlock).join('');
      if(!inner) return;
      const domainItems = domainTopics.flatMap(t=>topicMap[t]);
      html += `<details class="domain-block" ${openAttr(q) || 'open'}>
        <summary class="card-head">${CHEV}
          <span class="card-title">${esc(domain.label)}</span>
          ${progressPill(domainItems, 'count')}
        </summary>
        <div class="domain-body">${inner}</div></details>`;
    });
    topics.filter(t=>!domainForTopic(t)).forEach(t=> html += renderTopicBlock(t));
  } else {
    topics.forEach(topic=> html += renderTopicBlock(topic));
  }

  if(!anyTopicVisible && isFiltering(q)) html += emptyNote('No short notes match.');
  return html;
}

/* ---------- View: First Year — Topic-wise ---------- */
function fyNotesPanelHtml(topic){
  const notesHtml = (notesData()[fySection()] || {})[topic] || null;
  if(!notesHtml) return '';
  // notesHtml is trusted, first-party HTML shipped in notes-data.js
  return `<details class="notes-panel">
    <summary>${CHEV}<svg class="icon" aria-hidden="true"><use href="#i-book"/></svg> Study Notes</summary>
    ${lazyBody('notes-content', false, ()=> notesHtml)}
  </details>`;
}
function fyTopicBodyHtml(t, vis){
  // Notes arrive separately; until then leave a slot that is filled on arrival.
  let html = dataLoaded.fyNotes ? fyNotesPanelHtml(t.topic) : `<div class="notes-slot" data-topic="${esc(t.topic)}"></div>`;
  let lastSub = null;
  vis.forEach((i, idx)=>{
    if(t.subgroups && i.subgroup && i.subgroup !== lastSub){
      html += `<div class="qgroup-label">${esc(i.subgroup)}</div>`;
      lastSub = i.subgroup;
    }
    html += fyQuestionRowHtml(i, idx+1);
  });
  return html;
}
function fillNotesSlots(){
  document.querySelectorAll('#app .notes-slot').forEach(el=>{ el.outerHTML = fyNotesPanelHtml(el.dataset.topic); });
}

function renderFYTopicView(q){
  const topics = PAPER_CONFIG[currentPaper].data();
  let html = sectionHeading('T', `${PAPER_CONFIG[currentPaper].label} — by Topic`, `${topics.length} topics`);
  let anyVisible = false;

  topics.forEach((t)=>{
    const topicItems = ITEMS.filter(i=>i.topic===t.topic);
    const vis = topicItems.filter(i=>isVisible(i,q));
    if(vis.length===0 && isFiltering(q)) return;
    anyVisible = true;

    html += `<details class="topic-block" id="topic-${slugify(t.topic)}" ${openAttr(q)}>
      <summary class="card-head">${CHEV}
        <span class="card-title">${esc(t.topic)}</span>
        ${progressPill(topicItems, 'count')}
      </summary>
      ${lazyBody('card-body', !!openAttr(q), ()=> fyTopicBodyHtml(t, vis))}</details>`;
  });

  if(!anyVisible && isFiltering(q)) html += emptyNote('No questions match.');
  return html;
}

/* ---------- View: First Year — by Exam Sitting ---------- */
const FY_MONTH_FULL = {Jan:'January',Feb:'February',Mar:'March',Apr:'April',May:'May',Jun:'June',Jul:'July',Aug:'August',Sep:'September',Oct:'October',Nov:'November',Dec:'December'};
function formatFYSitting(yearStr){
  const m = (yearStr||'').match(/^([A-Za-z]{3})\w*\s+(\d{4})(?:\s*\(S(\d)\))?/);
  if(!m) return yearStr||'';
  const monthFull = FY_MONTH_FULL[m[1]] || m[1];
  return m[3] ? `${monthFull} ${m[2]} · Set ${m[3]}` : `${monthFull} ${m[2]}`;
}

function renderFYYearView(q){
  const yearGroups = PAPER_CONFIG[currentPaper].yearData();
  const textIndex = FY_TEXT_INDEX[currentPaper];
  let html = sectionHeading('Y', `${PAPER_CONFIG[currentPaper].label} — by Exam Sitting`, `${yearGroups.length} sittings`);
  let anyVisible = false;

  yearGroups.forEach((g)=>{
    const list = g.questions.map(qq => textIndex.get(fyNorm(qq.text))).filter(Boolean);
    const vis = list.filter(i=>isVisible(i,q));
    if(vis.length===0 && isFiltering(q)) return;
    anyVisible = true;
    html += `<details class="paper-card" ${openAttr(q)}>
      <summary class="card-head">${CHEV}
        <span class="card-title">${esc(formatFYSitting(g.year))}</span>
        ${progressPill(list)}
      </summary>
      <div class="card-body">`;
    vis.forEach((i,idx)=> html += fyQuestionRowHtml(i, idx+1));
    html += `</div></details>`;
  });

  if(!anyVisible) html += emptyNote(hideDone && !q ? 'Everything here is done — nice work.' : 'No questions match your search.');
  return html;
}

/* ---------- View: First Year — Q&A Mode ---------- */
/* Group items with identical question text (asked in several sittings) into one entry. */
function groupQAItems(items){
  const order = [];
  const byText = new Map();
  items.forEach(i=>{
    const key = fyNorm(i.text);
    if(!byText.has(key)){
      const group = { text:i.text, typeLabel:i.typeLabel, topic:i.topic, uids:[], years:[] };
      byText.set(key, group);
      order.push(group);
    }
    const group = byText.get(key);
    group.uids.push(i.uid);
    if(i.year) group.years.push(i.year);
  });
  return order;
}

function fyQAGroupRowHtml(group, num){
  const answerSet = fyAnswerData()[currentPaper] || {};
  const answeredUid = group.uids.find(u=>answerSet[u]);
  // answers are trusted, first-party HTML shipped in answers-data.js
  const ans = answeredUid ? answerSet[answeredUid] : null;
  const yearBadges = group.years.map(y=>`<span class="badge date">${esc(y)}</span>`).join('');
  return `
  <article class="qa-item">
    <div class="qa-question">
      <span class="qnum">${num}</span>
      <span class="qa-qtext">${esc(group.text)}</span>
      ${group.typeLabel ? `<span class="badge marks">${esc(group.typeLabel)}</span>` : ''}
      ${yearBadges}
    </div>
    <div class="qa-answer">
      ${ans ? ans : '<span class="qa-pending">Answer not added yet — check back soon.</span>'}
    </div>
  </article>`;
}

function renderFYQAView(q){
  const topics = PAPER_CONFIG[currentPaper].data();
  const answerSet = fyAnswerData()[currentPaper] || {};
  let html = sectionHeading('QA', `${PAPER_CONFIG[currentPaper].label} — Question & Answer Mode`);
  let anyVisible = false;

  topics.forEach((t)=>{
    const topicGroups = groupQAItems(ITEMS.filter(i=>i.topic===t.topic));
    const visGroups = topicGroups.filter(g=>matchesSearch({text:g.text, topic:g.topic, year:g.years.join(' ')}, q));
    if(visGroups.length===0 && q) return;
    anyVisible = true;
    const answered = topicGroups.filter(g=>g.uids.some(u=>answerSet[u])).length;
    html += `<details class="topic-block" id="qa-topic-${slugify(t.topic)}" ${openAttr(q)}>
      <summary class="card-head">${CHEV}
        <span class="card-title">${esc(t.topic)}</span>
        <span class="card-count">${answered}/${topicGroups.length} answered</span>
      </summary>
      ${lazyBody('card-body', !!openAttr(q), ()=> visGroups.map((g,idx)=> fyQAGroupRowHtml(g, idx+1)).join(''))}</details>`;
  });

  if(!anyVisible && q) html += emptyNote('No questions match your search.');
  return html;
}

/* ---------- View: Final Year — Q&A Mode ----------
   Each question gets a stable ID from qid.js. Answers (final-answers-data.js,
   built from answers/*.md) can cover several IDs, so differently-worded
   repeats of the same question collapse into one entry with one answer. */
let finalQAFilter = 'all'; // 'all' | 'answered' | 'pending'
const FINAL_KIND_LABEL = { critical:'Critical essay', applied:'Applied case', essay1:'Essay', essay2:'Essay', short:'Short note' };
const STATUS_LABEL = { draft:'Draft — not yet reviewed', reviewed:'Reviewed', verified:'Verified against sources' };
const SOURCE_LABEL = { 'ai-generated':'AI-generated' };

function buildFinalQAGroups(){
  const A = finalAnswerData();
  const groups = new Map();
  ITEMS.forEach(i=>{
    const qid = finalQid(currentPaper, i.text || i.stem);
    const answerId = A.byQuestion[qid] || null;
    const key = answerId ? 'a:' + answerId : 'q:' + qid;
    if(!groups.has(key)){
      groups.set(key, { key, answerId, topic: i.topic, wordings: new Map(), sittings: [], uids: [] });
    }
    const g = groups.get(key);
    if(!g.wordings.has(qid)) g.wordings.set(qid, { text: i.text, stem: i.stem, subs: i.subs, kind: i.kind, marks: i.marks });
    g.sittings.push({ label: `${i.paper.date} · ${i.paper.version}`, sortKey: i.paper.sortKey });
    g.uids.push(i.uid);
  });
  groups.forEach(g=> g.sittings.sort((a,b)=> b.sortKey.localeCompare(a.sortKey)));
  return [...groups.values()];
}

function finalWordingHtml(w){
  if(w.subs && w.subs.length){
    return `<span class="stem">${esc(w.stem)}</span><ol>${w.subs.map(s=>`<li>${esc(s)}</li>`).join('')}</ol>`;
  }
  return esc(w.text || w.stem);
}

function finalQARowHtml(g, num){
  const A = finalAnswerData();
  const ans = g.answerId ? A.answers[g.answerId] : null;
  const words = [...g.wordings.values()];
  const first = words[0];
  const alt = words.slice(1);
  const altHtml = alt.length
    ? `<div class="qa-alt"><span class="qa-alt-label">Also asked as</span><ul>${alt.map(w=>`<li>${finalWordingHtml(w)}</li>`).join('')}</ul></div>` : '';
  const times = g.sittings.length;
  const sittingBadges = g.sittings.map(s=>`<span class="badge date">${esc(s.label)}</span>`).join('');
  let answerHtml;
  if(ans){
    // answers are trusted, first-party HTML generated from answers/*.md
    answerHtml = `
      <div class="ans-meta">
        <span class="badge status-${esc(ans.status)}">${esc(STATUS_LABEL[ans.status] || ans.status)}</span>
        ${ans.source && SOURCE_LABEL[ans.source] ? `<span class="badge source-${esc(ans.source)}" title="Written by AI without source documents; not checked by a person">${esc(SOURCE_LABEL[ans.source])}</span>` : ''}
        ${ans.updated ? `<span class="ans-updated">Updated ${esc(ans.updated)}</span>` : ''}
      </div>
      <div class="ans-exam-label">Exam answer</div>
      <div class="ans-body ans-exam">${ans.exam}</div>
      ${ans.depth && ans.depth.trim() ? `<details class="ans-section ans-depth"><summary>${CHEV} In Depth <span class="ans-hint">additional material beyond the exam answer</span></summary><div class="ans-body">${ans.depth}</div></details>` : ''}
      <details class="ans-section ans-refs"><summary>${CHEV} References</summary><div class="ans-body">${ans.refs}</div></details>`;
  } else {
    answerHtml = '<span class="qa-pending">Answer not added yet — check back soon.</span>';
  }
  return `
  <article class="qa-item" id="qa-${esc(g.key.replace(/[^a-z0-9-]/gi,'-'))}">
    <div class="qa-question">
      <span class="qnum">${num}</span>
      <div class="qa-qtext">${finalWordingHtml(first)}${altHtml}</div>
    </div>
    <div class="qmeta qa-badges">
      <span class="badge marks">${esc(FINAL_KIND_LABEL[first.kind] || '')}${first.marks ? ' · ' + esc(first.marks) + ' marks' : ''}</span>
      <span class="badge freq${times > 1 ? ' repeat' : ''}">Asked ${times}×</span>
      ${sittingBadges}
    </div>
    <div class="qa-answer${ans ? '' : ' pending'}">${answerHtml}</div>
  </article>`;
}

function finalGroupMatches(g, q){
  if(!q) return true;
  const hay = [...g.wordings.values()].map(w=>[w.text||'', w.stem||'', (w.subs||[]).join(' ')].join(' '))
    .concat([g.topic||'', g.sittings.map(s=>s.label).join(' ')]).join(' ').toLowerCase();
  return hay.includes(q.toLowerCase());
}

function renderFinalQAView(q){
  const all = buildFinalQAGroups();
  const answeredCount = all.filter(g=>g.answerId).length;
  let html = sectionHeading('QA', `${PAPER_CONFIG[currentPaper].label} — Question & Answer Mode`, `${answeredCount}/${all.length} answered`);
  const fbtn = (v, label) => `<button type="button" data-action="qa-filter" data-value="${v}" aria-pressed="${finalQAFilter===v}">${label}</button>`;
  html += `<div class="qa-filter" role="group" aria-label="Filter answers">${fbtn('all','All')}${fbtn('answered','Answered')}${fbtn('pending','Not yet answered')}</div>`;

  const shown = all.filter(g=>{
    if(finalQAFilter === 'answered' && !g.answerId) return false;
    if(finalQAFilter === 'pending' && g.answerId) return false;
    return finalGroupMatches(g, q);
  });
  const byTopic = new Map();
  all.forEach(g=>{ const t = g.topic || 'Other'; if(!byTopic.has(t)) byTopic.set(t, []); byTopic.get(t).push(g); });
  const topics = [...byTopic.keys()].sort((a,b)=>{
    const fa = byTopic.get(a).reduce((n,g)=>n+g.sittings.length,0);
    const fb = byTopic.get(b).reduce((n,g)=>n+g.sittings.length,0);
    return fb - fa || a.localeCompare(b);
  });

  let anyVisible = false;
  topics.forEach(t=>{
    const topicAll = byTopic.get(t);
    const vis = shown.filter(g=>(g.topic||'Other')===t).sort((a,b)=> b.sittings.length - a.sittings.length);
    if(!vis.length) return;
    anyVisible = true;
    const answered = topicAll.filter(g=>g.answerId).length;
    html += `<details class="topic-block" id="qa-topic-${slugify(t)}" ${openAttr(q)}>
      <summary class="card-head">${CHEV}
        <span class="card-title">${esc(t)}</span>
        <span class="card-count">${answered}/${topicAll.length} answered</span>
      </summary>
      ${lazyBody('card-body', !!openAttr(q), ()=> vis.map((g,idx)=> finalQARowHtml(g, idx+1)).join(''))}</details>`;
  });

  if(!anyVisible) html += emptyNote(q ? 'No questions match your search.' : (finalQAFilter === 'answered' ? 'No answers added for this paper yet.' : 'Every question here has an answer.'));
  return html;
}

function setQAFilter(v){
  finalQAFilter = (v === 'answered' || v === 'pending') ? v : 'all';
  renderAll();
}

/* ---------- Jump to a topic (from a badge) ---------- */
function jumpToTopic(topic){
  // the target block may be filtered out by an active search, so clear it first
  const searching = !!document.getElementById('searchBox').value;
  if(searching) setSearch('');
  if(currentView !== 'topic') setView('topic');
  else if(searching) renderAll();
  requestAnimationFrame(()=>{
    const el = document.getElementById('topic-' + slugify(topic));
    if(!el) return;
    el.setAttribute('open','');
    const dom = el.closest('.domain-block');
    if(dom) dom.setAttribute('open','');
    el.scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block:'start'});
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
    const sum = el.querySelector('summary');
    if(sum) sum.focus({preventScroll:true});
  });
}

/* ---------- Pressed-state helper for toggle buttons ---------- */
function setPressed(id, on){
  const el = document.getElementById(id);
  if(el) el.setAttribute('aria-pressed', on ? 'true' : 'false');
}
function applyLevelUI(level){
  setPressed('btn-levelFinal', level==='final');
  setPressed('btn-levelFirst', level==='first');
  document.getElementById('finalYearToggle').classList.toggle('hidden', level!=='final');
  document.getElementById('firstYearToggle').classList.toggle('hidden', level!=='first');
  document.getElementById('examLevelLabel').textContent = level==='final' ? 'NIMHANS Final Exam' : 'NIMHANS First Year Exam';
  document.getElementById('btn-qa').classList.remove('hidden');
}
function applyPaperUI(paper){
  setPressed('btn-paper1', paper==='p1');
  setPressed('btn-paper2', paper==='p2');
  setPressed('btn-paper3', paper==='p3');
  setPressed('btn-paperA', paper==='fy-neuro');
  setPressed('btn-paperB', paper==='fy-psych');
  document.body.classList.toggle('paper-2', paper==='p2');
  document.body.classList.toggle('paper-3', paper==='p3');
  document.body.classList.toggle('fy-neuro', paper==='fy-neuro');
  document.body.classList.toggle('fy-psych', paper==='fy-psych');
  document.getElementById('paperSubtitle').textContent = ' · ' + PAPER_CONFIG[paper].label;
  document.getElementById('footerPaper').textContent = 'National Institute of Mental Health & Neuro Sciences · ' + PAPER_CONFIG[paper].label;
  const tc = document.querySelector('meta[name="theme-color"]');
  if(tc) tc.setAttribute('content', getComputedStyle(document.body).getPropertyValue('--brand-deep').trim() || '#0f3b3a');
}
function savedPaperFor(level){
  try{
    if(level === 'final'){
      const saved = localStorage.getItem('nimhans_active_paper_final');
      return (saved==='p1'||saved==='p2'||saved==='p3') ? saved : 'p1';
    }
    const saved = localStorage.getItem('nimhans_active_paper_first');
    return (saved==='fy-neuro'||saved==='fy-psych') ? saved : 'fy-neuro';
  }catch(e){ return level==='final' ? 'p1' : 'fy-neuro'; }
}

/* ---------- Exam level switching (Final Year / First Year) ---------- */
function setLevel(level){
  if(level === examLevel) return;
  examLevel = level;
  applyLevelUI(level);
  try{ localStorage.setItem('nimhans_active_level', level); }catch(e){}
  currentPaper = null; // force setPaper to re-render
  setPaper(savedPaperFor(level));
}

/* ---------- Paper switching ---------- */
async function setPaper(paper){
  if(!PAPER_CONFIG[paper]) return;
  try{
    await setPaperInner(paper);
  }catch(e){
    console.error('setPaper failed:', e);
    document.getElementById('app').innerHTML =
      `<div class="sync-note">Something went wrong switching papers.<button type="button" class="inline-btn" data-action="paper" data-value="${esc(paper)}">Retry</button></div>`;
  }
}

async function setPaperInner(paper){
  closeSidebar();
  if(paper === currentPaper) return;
  currentPaper = paper;
  PAPERS = PAPER_CONFIG[paper].data();
  ITEMS = buildItems();
  applyPaperUI(paper);
  setSearch('');
  try{
    if(['p1','p2','p3'].includes(paper)) localStorage.setItem('nimhans_active_paper_final', paper);
    else localStorage.setItem('nimhans_active_paper_first', paper);
  }catch(e){}
  showLoading();
  checklist = await loadChecklistFromCloud();
  if(paper !== currentPaper) return; // user switched again while loading
  renderAll();
  syncHeaderHeight();
  window.scrollTo({top:0});
}

function showLoading(){
  document.getElementById('app').innerHTML =
    '<div class="sync-note" role="status">Loading your progress…</div>' + '<div class="skeleton"></div>'.repeat(4);
}

/* ---------- View switching ---------- */
function setView(view, silent){
  currentView = view;
  setPressed('btn-year', view==='year');
  setPressed('btn-topic', view==='topic');
  setPressed('btn-qa', view==='qa');
  if(!silent){ renderAll(); closeSidebar(); }
}

function setExpanded(on){
  allExpanded = on;
  setPressed('expandBtn', on);
  setPressed('collapseBtn', !on);
  renderAll();
}

/* ---------- Master render ---------- */
// Which optional data file the current view needs before it can be shown.
function viewNeeds(){
  const fy = PAPER_CONFIG[currentPaper].mode === 'topic-first';
  if(currentView === 'qa') return fy ? 'fyAnswers' : 'finalAnswers';
  return null;
}
const NEED_LABEL = { fyAnswers:'answers', finalAnswers:'answers' };

function renderAll(){
  if(!currentPaper || !PAPER_CONFIG[currentPaper] || !dataLoaded.core) return;
  const container = document.getElementById('app');
  const q = document.getElementById('searchBox').value.trim();
  GROUPS = []; UID_GROUPS = {}; LAZY = {};

  const need = viewNeeds();
  if(need && !dataLoaded[need]){
    container.innerHTML = overviewHtml() + `<div class="sync-note qa-loading" role="status">Loading ${NEED_LABEL[need]}…</div>` + '<div class="skeleton"></div>'.repeat(3);
    updateProgress();
    const view = currentView, paper = currentPaper;
    ensureData(need).then(()=>{
      if(currentView === view && currentPaper === paper) renderAll();
    }).catch(err=>{
      console.error(err);
      if(currentView !== view || currentPaper !== paper) return;
      container.innerHTML = overviewHtml() + `<div class="sync-note">Could not download the ${NEED_LABEL[need]}. Check your connection.<button type="button" class="inline-btn" data-action="rerender">Retry</button></div>`;
      updateProgress();
    });
    return;
  }
  // Study notes are optional extras in the First Year topic view: show the
  // questions straight away and drop the notes in when they arrive.
  if(currentView === 'topic' && PAPER_CONFIG[currentPaper].mode === 'topic-first' && !dataLoaded.fyNotes){
    ensureData('fyNotes').then(fillNotesSlots).catch(err=> console.error(err));
  }

  let html = overviewHtml();
  if(currentView === 'year') html += renderYearView(q);
  else if(currentView === 'qa') html += (PAPER_CONFIG[currentPaper].mode === 'topic-first' ? renderFYQAView(q) : renderFinalQAView(q));
  else html += renderTopicView(q);
  container.innerHTML = html;
  updateProgress();
}

/* ---------- Search ---------- */
let searchTimer = null;
function setSearch(value){
  const box = document.getElementById('searchBox');
  box.value = value;
  document.getElementById('searchClear').classList.toggle('hidden', !value);
}

/* ---------- Auth: sign in / sign out / auth state ---------- */
let isApproved = false;
let isAdmin = false;

function setAuthStatus(text, kind){
  const status = document.getElementById('authStatus');
  status.className = 'auth-status' + (kind ? ' ' + kind : '');
  status.textContent = text;
}

async function handleGoogleSignIn(btn){
  const label = document.getElementById('googleBtnLabel');
  const reset = ()=>{ btn.disabled = false; label.textContent = 'Continue with Google'; };
  if(!supabaseClient){
    setAuthStatus('The sign-in service did not load. Check your internet connection, pause any ad-blocker for this site, then refresh the page.', 'err');
    return;
  }
  btn.disabled = true;
  label.textContent = 'Opening Google…';
  setAuthStatus('');
  try{
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + window.location.pathname }
    });
    if(error) throw error;
    // The page normally leaves for Google within a second. If it is still here, say so.
    setTimeout(()=>{
      if(document.visibilityState !== 'visible') return;
      reset();
      setAuthStatus('Google did not open. If you opened this link inside WhatsApp, Instagram or another app, open it in Chrome or Safari instead and try again.', 'err');
    }, 12000);
  }catch(e){
    console.error('Google sign-in failed to start:', e);
    reset();
    setAuthStatus('Could not start Google sign-in: ' + (e && e.message ? e.message : e) + '. Refresh the page and try again.', 'err');
  }
}

// Google blocks sign-in inside in-app browsers (Instagram, Facebook, LinkedIn…); warn before the click.
(function(){
  if(/FBAN|FBAV|Instagram|LinkedInApp|Line\/|; wv\)/i.test(navigator.userAgent || '')){
    setAuthStatus('You are viewing this inside another app. Google sign-in only works in a normal browser: open this page in Chrome or Safari.', 'err');
  }
})();

async function handleSignOut(){
  rememberAccess(null);
  if(supabaseClient) await supabaseClient.auth.signOut();
}

function onSignedIn(user){
  currentUser = user;
  document.getElementById('authGate').style.display = 'none';
  document.getElementById('userEmail').textContent = user.email || '';
  if(window.location.hash || window.location.search){
    history.replaceState(null, '', window.location.pathname);
  }
  checkAccess();
}

function onSignedOut(){
  currentUser = null;
  isApproved = false;
  isAdmin = false;
  checklist = {};
  document.getElementById('app').innerHTML = '';
  document.getElementById('pendingGate').classList.add('hidden');
  document.getElementById('adminPanel').classList.add('hidden');
  document.getElementById('adminBtn').classList.add('hidden');
  document.getElementById('authGate').style.display = 'flex';
  const gBtn = document.getElementById('googleBtn');
  if(gBtn){ gBtn.disabled = false; document.getElementById('googleBtnLabel').textContent = 'Continue with Google'; }
}

if(supabaseClient){
  supabaseClient.auth.onAuthStateChange((event, session)=>{
    if(session && session.user){
      if(!currentUser || currentUser.id !== session.user.id) onSignedIn(session.user);
    } else {
      onSignedOut();
    }
  });

  // If the return from Google could not be turned into a session, the library
  // silently reports "signed out". Show the real reason instead of just the
  // login screen again, and strip the failed code/tokens from the address bar.
  (async ()=>{
    const cameFromLogin = /[?&#](code|access_token|error|error_description)=/.test(window.location.href);
    let error = null;
    try{ ({ error } = await supabaseClient.auth.initialize()); }catch(e){ error = e; }
    if(!cameFromLogin) return;
    history.replaceState(null, '', window.location.pathname);
    if(error){
      console.error('Sign-in failed:', error);
      setAuthStatus('Sign-in did not complete: ' + (error.message || error) + '. Please try again — if it keeps happening, send this message to the admin.', 'err');
    }
  })();
}

/* Remember (per device) which account was last approved, for offline use. */
function rememberAccess(email){
  try{ email ? localStorage.setItem('pc_access', email.toLowerCase()) : localStorage.removeItem('pc_access'); }catch(e){}
}
function cachedAccess(email){
  try{ return localStorage.getItem('pc_access') === String(email).toLowerCase(); }catch(e){ return false; }
}

/* ---------- Access control ----------
   NOTE: this is a UX gate only. The real enforcement must be Row Level
   Security in Supabase (supabase_security.sql). Anything shipped as a
   static file (question/answer data) is readable without signing in. */
async function checkAccess(){
  if(!currentUser || !currentUser.email){
    showFatalBanner('Signed-in session looks invalid. Please sign in again.');
    return;
  }
  const email = currentUser.email;
  let data, error;
  try{
    ({ data, error } = await supabaseClient
      .from('allowed_users')
      .select('is_admin')
      .eq('email', email)
      .maybeSingle());
  }catch(e){ error = e; }

  if(error){
    console.error('Access check failed', error);
    // Offline or server unreachable: an account approved on this device before
    // can still open its saved copy. (Real protection is Row Level Security.)
    if(cachedAccess(email)){
      isApproved = true;
      isAdmin = false;
      document.getElementById('pendingGate').classList.add('hidden');
      toast("Can't reach the server — opening your saved copy. Ticks will save once you're back online.", 'err');
      bootstrapApp();
      return;
    }
    document.getElementById('app').innerHTML =
      '<div class="sync-note">Couldn\'t reach the server to check your access.<button type="button" class="inline-btn" data-action="check-access">Retry</button></div>';
    return;
  }

  if(data){
    isApproved = true;
    isAdmin = !!data.is_admin;
    rememberAccess(email);
    document.getElementById('pendingGate').classList.add('hidden');
    document.getElementById('adminBtn').classList.toggle('hidden', !isAdmin);
    bootstrapApp();
  } else {
    isApproved = false;
    isAdmin = false;
    rememberAccess(null);
    document.getElementById('adminBtn').classList.add('hidden');
    try{
      const { error: reqErr } = await supabaseClient.from('pending_requests').upsert({ email });
      if(reqErr) console.error(reqErr);
    }catch(e){ console.error(e); }
    document.getElementById('pendingEmail').textContent = email;
    document.getElementById('app').innerHTML = '';
    document.getElementById('pendingGate').classList.remove('hidden');
  }
}

/* ---------- Admin panel ---------- */
let adminReturnFocus = null;
function openAdminPanel(){
  adminReturnFocus = document.activeElement;
  document.getElementById('adminPanel').classList.remove('hidden');
  document.querySelector('#adminPanel .admin-close').focus();
  loadAdminPanel();
}
function closeAdminPanel(){
  document.getElementById('adminPanel').classList.add('hidden');
  if(adminReturnFocus && adminReturnFocus.focus) adminReturnFocus.focus();
}

function adminRowHtml(email, actionsHtml, extra){
  return `<div class="admin-row">
    <span class="aemail">${esc(email)}${extra || ''}</span>
    <span class="actions">${actionsHtml}</span>
  </div>`;
}

async function loadAdminPanel(){
  if(!currentUser || !isAdmin) return;
  const pendingEl = document.getElementById('pendingList');
  const approvedEl = document.getElementById('approvedList');
  pendingEl.innerHTML = '<div class="sync-note">Loading…</div>';
  approvedEl.innerHTML = '<div class="sync-note">Loading…</div>';

  const [{ data: pending, error: pErr }, { data: approved, error: aErr }] = await Promise.all([
    supabaseClient.from('pending_requests').select('email, requested_at').order('requested_at', { ascending: false }),
    supabaseClient.from('allowed_users').select('email, is_admin, added_at').order('added_at', { ascending: false })
  ]);
  if(!currentUser) return; // signed out while in flight
  if(pErr || aErr){ console.error(pErr || aErr); toast('Could not load the access lists.', 'err'); }

  // Emails come from the database: always escaped, never placed inside JS.
  pendingEl.innerHTML = (pending && pending.length)
    ? pending.map(r => adminRowHtml(r.email,
        `<button type="button" data-action="approve" data-email="${esc(r.email)}">Approve</button>
         <button type="button" data-action="reject" data-email="${esc(r.email)}">Reject</button>`)).join('')
    : '<div class="empty-admin">No pending requests.</div>';

  approvedEl.innerHTML = (approved && approved.length)
    ? approved.map(r => adminRowHtml(r.email,
        (r.email === currentUser.email) ? '' : `<button type="button" data-action="revoke" data-email="${esc(r.email)}">Revoke</button>`,
        r.is_admin ? '<span class="badge-admin">admin</span>' : '')).join('')
    : '<div class="empty-admin">No approved users yet.</div>';
}

async function adminAction(fn, okMsg, errMsg){
  try{
    const err = await fn();
    if(err) throw err;
    toast(okMsg);
  }catch(e){
    console.error(e);
    toast(errMsg, 'err');
  }
  await loadAdminPanel();
}
function approveUser(email){
  return adminAction(async ()=>{
    const { error } = await supabaseClient.from('allowed_users').insert({ email });
    if(error && error.code !== '23505') return error; // 23505 = already approved
    const { error: dErr } = await supabaseClient.from('pending_requests').delete().eq('email', email);
    return dErr;
  }, `Approved ${email}`, 'Could not approve — please try again.');
}
function rejectUser(email){
  return adminAction(async ()=>{
    const { error } = await supabaseClient.from('pending_requests').delete().eq('email', email);
    return error;
  }, `Rejected ${email}`, 'Could not reject — please try again.');
}
function revokeUser(email){
  if(!confirm(`Revoke access for ${email}?`)) return;
  return adminAction(async ()=>{
    const { error } = await supabaseClient.from('allowed_users').delete().eq('email', email);
    return error;
  }, `Revoked ${email}`, 'Could not revoke — please try again.');
}

/* ---------- Bootstrap (runs once the user is signed in and approved) ---------- */
async function bootstrapApp(){
  document.getElementById('app').innerHTML = '<div class="sync-note" role="status">Loading questions…</div>' + '<div class="skeleton"></div>'.repeat(4);
  try{
    await ensureData('core');
  }catch(e){
    console.error(e);
    document.getElementById('app').innerHTML =
      '<div class="sync-note">Could not download the questions. Check your connection.<button type="button" class="inline-btn" data-action="bootstrap">Retry</button></div>';
    return;
  }
  if(!dataFilesOk()) return;
  try{
    await bootstrapAppInner();
  }catch(e){
    console.error('bootstrapApp failed:', e);
    document.getElementById('app').innerHTML =
      '<div class="sync-note">Something went wrong loading the app.<button type="button" class="inline-btn" data-action="bootstrap">Retry</button></div>';
  }
}

async function bootstrapAppInner(){
  let startLevel = 'final';
  try{
    const savedLevel = localStorage.getItem('nimhans_active_level');
    if(savedLevel === 'final' || savedLevel === 'first') startLevel = savedLevel;
    hideDone = localStorage.getItem('pc_hide_done') === '1';
  }catch(e){}
  document.getElementById('hideDone').checked = hideDone;

  examLevel = startLevel;
  applyLevelUI(startLevel);
  const startPaper = savedPaperFor(startLevel);
  currentPaper = startPaper;
  PAPERS = PAPER_CONFIG[startPaper].data();
  ITEMS = buildItems();
  applyPaperUI(startPaper);

  showLoading();
  checklist = await loadChecklistFromCloud();
  renderAll();
  syncHeaderHeight();
}

/* ---------- Install as an app (Android/desktop Chrome) ---------- */
let installPrompt = null;
function showInstall(on){
  document.querySelectorAll('[data-action="install-app"]').forEach(b=> b.classList.toggle('hidden', !on));
  document.querySelectorAll('[data-install-section]').forEach(el=> el.classList.toggle('hidden', !on));
}
window.addEventListener('beforeinstallprompt', (e)=>{
  e.preventDefault();          // show our own button instead of the browser's mini-bar
  installPrompt = e;
  showInstall(true);
});
window.addEventListener('appinstalled', ()=>{
  installPrompt = null;
  showInstall(false);
  toast('Installed — open Psych.MD from your home screen.');
});
async function installApp(){
  if(!installPrompt) return;
  const p = installPrompt;
  installPrompt = null;
  showInstall(false);
  try{ await p.prompt(); await p.userChoice; }catch(e){ console.error(e); }
}
if('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('/sw.js').catch(err=> console.error('Service worker registration failed', err));
  });
}

/* ---------- Layout helpers ---------- */
function syncHeaderHeight(){
  const header = document.querySelector('.topbar');
  if(header) document.documentElement.style.setProperty('--header-h', header.offsetHeight + 'px');
}
window.addEventListener('resize', syncHeaderHeight);
window.addEventListener('load', syncHeaderHeight);

function isDrawer(){ return matchMedia('(max-width:900px)').matches; }
function openSidebar(){
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebarBackdrop').classList.add('show');
  document.getElementById('hamburgerBtn').setAttribute('aria-expanded', 'true');
  document.getElementById('searchBox').focus({preventScroll:true});
}
function closeSidebar(){
  const sb = document.getElementById('sidebar');
  const wasOpen = sb.classList.contains('open');
  sb.classList.remove('open');
  document.getElementById('sidebarBackdrop').classList.remove('show');
  document.getElementById('hamburgerBtn').setAttribute('aria-expanded', 'false');
  if(wasOpen && isDrawer()) document.getElementById('hamburgerBtn').focus({preventScroll:true});
}
function toggleSidebar(){
  document.getElementById('sidebar').classList.contains('open') ? closeSidebar() : openSidebar();
}

/* ---------- Theme ---------- */
function effectiveTheme(){
  const t = document.documentElement.getAttribute('data-theme');
  if(t) return t;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function toggleTheme(){
  const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try{ localStorage.setItem('pc_theme', next); }catch(e){}
}

/* ---------- Delegated event wiring ---------- */
document.addEventListener('click', (e)=>{
  const el = e.target.closest('[data-action]');
  if(!el) return;
  const a = el.dataset.action;
  switch(a){
    case 'reload': location.reload(); break;
    case 'google-signin': handleGoogleSignIn(el); break;
    case 'check-access': checkAccess(); break;
    case 'signout': handleSignOut(); break;
    case 'bootstrap': bootstrapApp(); break;
    case 'rerender': renderAll(); break;
    case 'install-app': installApp(); break;
    case 'toggle-sidebar': toggleSidebar(); break;
    case 'close-sidebar': closeSidebar(); break;
    case 'toggle-theme': toggleTheme(); break;
    case 'level': setLevel(el.dataset.value); break;
    case 'paper': setPaper(el.dataset.value); break;
    case 'view': setView(el.dataset.value); break;
    case 'qa-filter': setQAFilter(el.dataset.value); break;
    case 'expand-all': setExpanded(true); break;
    case 'collapse-all': setExpanded(false); break;
    case 'erase': clearChecklist(); break;
    case 'clear-search': setSearch(''); renderAll(); document.getElementById('searchBox').focus(); break;
    case 'jump-topic': e.preventDefault(); jumpToTopic(el.dataset.topic); break;
    case 'top': window.scrollTo({top:0, behavior:'smooth'}); document.getElementById('app').focus({preventScroll:true}); break;
    case 'admin-open': openAdminPanel(); break;
    case 'admin-close': closeAdminPanel(); break;
    case 'admin-backdrop': if(e.target === el) closeAdminPanel(); break;
    case 'approve': if(isAdmin) approveUser(el.dataset.email); break;
    case 'reject': if(isAdmin) rejectUser(el.dataset.email); break;
    case 'revoke': if(isAdmin) revokeUser(el.dataset.email); break;
  }
});

document.getElementById('app').addEventListener('toggle', (e)=>{
  if(e.target.tagName === 'DETAILS' && e.target.open) fillLazy(e.target);
}, true);

document.getElementById('app').addEventListener('change', (e)=>{
  const cb = e.target;
  if(cb.matches('input[type=checkbox][data-uid]')) toggleItem(cb.dataset.uid, cb.closest('.qitem'), cb);
});


document.getElementById('searchBox').addEventListener('input', (e)=>{
  document.getElementById('searchClear').classList.toggle('hidden', !e.target.value);
  clearTimeout(searchTimer);
  searchTimer = setTimeout(renderAll, 160);
});

document.getElementById('hideDone').addEventListener('change', (e)=>{
  hideDone = e.target.checked;
  try{ localStorage.setItem('pc_hide_done', hideDone ? '1' : '0'); }catch(err){}
  renderAll();
});

document.addEventListener('keydown', (e)=>{
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
  if(e.key === 'Escape'){
    if(!document.getElementById('adminPanel').classList.contains('hidden')){ closeAdminPanel(); return; }
    if(document.getElementById('sidebar').classList.contains('open')){ closeSidebar(); return; }
    if(e.target.id === 'searchBox' && e.target.value){ setSearch(''); renderAll(); return; }
  }
  if(e.key === '/' && !typing && currentUser && isApproved){
    e.preventDefault();
    if(isDrawer()) openSidebar(); else document.getElementById('searchBox').focus();
  }
});

let scrollTick = false;
window.addEventListener('scroll', ()=>{
  if(scrollTick) return;
  scrollTick = true;
  requestAnimationFrame(()=>{
    document.getElementById('backToTop').classList.toggle('show', window.scrollY > 900);
    scrollTick = false;
  });
}, {passive:true});
