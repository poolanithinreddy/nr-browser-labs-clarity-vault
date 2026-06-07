// Text cleaning utilities

const smartQuotesMap = {
  '\u2018': "'", '\u2019': "'", '\u201C': '"', '\u201D': '"', '\u2014': '-', '\u2013': '-', '\u00A0': ' '
};

export function normalizeQuotes(str) {
  return str.replace(/[\u2018\u2019\u201C\u201D\u2014\u2013\u00A0]/g, (c) => smartQuotesMap[c] || c);
}

export function stripBullets(str) {
  return str.replace(/^[\s\u2022\-*\u25CF]+/gm, '').trim();
}

export function collapseWhitespace(str) {
  return str.replace(/\s+/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim();
}

export function cleanText(str) {
  return collapseWhitespace(stripBullets(normalizeQuotes(str)));
}

export function detectType(text) {
  const t = text || '';
  const codeHints = /\b(function|const|let|var|class|def|return|=>|;|\{\}|<\/?[a-z][^>]*>)\b|\{|\}|`|;|\n\s{2,}/i;
  const priceHints = /\$\d|\d+\s?(USD|EUR|GBP|INR|JPY)|\bprice\b|\bMRP\b/i;
  const studyHints = /\b(study|research|paper|abstract|method|results|conclusion)\b/i;
  if (codeHints.test(t)) return 'code';
  if (priceHints.test(t)) return 'price';
  if (studyHints.test(t)) return 'study';
  return t.length > 500 ? 'article' : 'text';
}

export function autoTags(text, domain) {
  const tags = new Set();
  const t = (text || '').toLowerCase();
  if (detectType(text) === 'code') tags.add('code');
  if (/\bprice|deal|discount|\$\d/.test(t)) tags.add('price');
  if (/\bapi|dev|stack overflow|github|npm|docker|kubernetes|react|node\b/.test(t) || /stackoverflow\.com|github\.com/.test(domain)) tags.add('dev');
  if (/\bstudy|research|paper|doi\.org|arxiv\.org\b/.test(t)) tags.add('study');
  return Array.from(tags);
}
