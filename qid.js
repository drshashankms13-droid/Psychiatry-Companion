/* Stable IDs for Final Year questions.
   The same function runs in the browser (app.js) and in the build script
   (scripts/build-answers.js), so an answer file's `covers:` list always
   matches what the site renders. Changing a question's wording in
   final-data.js changes its ID — the build script will report the
   orphaned ID so the answer can be re-linked. */
(function (root) {
  function finalNorm(s) {
    return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }
  // FNV-1a 32-bit over UTF-16 code units, as 8 hex chars.
  function fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return ('00000000' + h.toString(16)).slice(-8);
  }
  function finalQid(paper, text) {
    return paper + '-' + fnv1a(finalNorm(text));
  }
  const api = { finalNorm, finalQid };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof window !== 'undefined' ? window : globalThis);
