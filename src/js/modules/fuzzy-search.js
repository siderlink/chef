/* fuzzy-search.js - Smart product search with fuzzy matching */
window.FuzzySearch = (function() {

  function normalize(s) {
    return String(s || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    const m = a.length, n = b.length;
    const dp = [];
    for (let i = 0; i <= m; i++) { dp[i] = [i]; }
    for (let j = 0; j <= n; j++) { dp[0][j] = j; }
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i-1] === b[j-1] ? 0 : 1;
        dp[i][j] = Math.min(dp[i-1][j] + 1, dp[i][j-1] + 1, dp[i-1][j-1] + cost);
      }
    }
    return dp[m][n];
  }

  function tokenize(s) {
    return normalize(s).split(' ').filter(Boolean);
  }

  function matchScore(query, text) {
    const qNorm = normalize(query);
    const tNorm = normalize(text);
    if (!qNorm || !tNorm) return 0;

    if (tNorm.includes(qNorm)) return 100;

    const words = tokenize(query);
    const textWords = tNorm.split(' ');
    let allWordsMatch = true;
    let totalWordScore = 0;

    for (const w of words) {
      let wordFound = false;
      for (const tw of textWords) {
        if (tw.includes(w)) { wordFound = true; totalWordScore += 100; break; }
        const dist = levenshtein(w, tw);
        const threshold = w.length <= 2 ? 0 : w.length <= 4 ? 1 : 2;
        if (dist <= threshold) { wordFound = true; totalWordScore += Math.max(0, 80 - dist * 20); break; }
      }
      if (!wordFound) {
        let bestSubMatch = 0;
        for (const tw of textWords) {
          if (tw.length < 3) continue;
          for (let len = Math.max(3, w.length - 1); len <= w.length + 1; len++) {
            for (let start = 0; start <= tw.length - len; start++) {
              const sub = tw.substring(start, start + len);
              const d = levenshtein(w, sub);
              if (d <= 1) bestSubMatch = Math.max(bestSubMatch, 70 - d * 20);
            }
          }
        }
        if (bestSubMatch > 0) { totalWordScore += bestSubMatch; }
        else { allWordsMatch = false; break; }
      }
    }

    if (!allWordsMatch) return 0;
    return totalWordScore / words.length;
  }

  function filter(items, query, getFields) {
    if (!query || !query.trim()) return items;
    return items
      .map(item => {
        const fields = getFields(item);
        let bestScore = 0;
        for (const f of fields) {
          const score = matchScore(query, f);
          if (score > bestScore) bestScore = score;
        }
        return { item, score: bestScore };
      })
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(r => r.item);
  }

  return { normalize, matchScore, filter, levenshtein };
})();
