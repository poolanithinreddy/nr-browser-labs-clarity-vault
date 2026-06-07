// Lightweight TextRank summarizer

function splitSentences(text){
  return (text||'')
    .replace(/\s+/g,' ')
    .split(/(?<=[.!?])\s+(?=[A-Z"'(\[])/)
    .map(s=>s.trim()).filter(Boolean);
}

function tokenize(s){
  return s.toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(w=>w && w.length>2);
}

function similarity(a,b){
  const A = new Set(tokenize(a));
  const B = new Set(tokenize(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (Math.log(A.size+1) + Math.log(B.size+1));
}

export function summarize(text, opts={}){
  const maxSentences = opts.maxSentences || 4;
  const sents = splitSentences(text);
  if (sents.length <= maxSentences) return text || '';
  const n = sents.length;
  const scores = new Array(n).fill(1);
  const damping = 0.85;
  const iterations = 12;
  // Build similarity matrix (sparse)
  const sim = Array.from({length:n}, ()=>new Map());
  for (let i=0;i<n;i++){
    for (let j=i+1;j<n;j++){
      const w = similarity(sents[i], sents[j]);
      if (w>0){ sim[i].set(j,w); sim[j].set(i,w); }
    }
  }
  // Power iteration
  for (let it=0; it<iterations; it++){
    const next = new Array(n).fill(1-damping);
    for (let i=0;i<n;i++){
      let sum = 0;
      sim[i].forEach((w,j)=>{
        const out = Array.from(sim[j].values()).reduce((a,b)=>a+b,0) || 1;
        sum += (w / out) * scores[j];
      });
      next[i] += damping * sum;
    }
    for (let i=0;i<n;i++) scores[i] = next[i];
  }
  // Select top-k and return in original order
  const idxs = scores.map((s,i)=>[s,i]).sort((a,b)=>b[0]-a[0]).slice(0, maxSentences).map(([,i])=>i).sort((a,b)=>a-b);
  return idxs.map(i=>sents[i]).join(' ');
}
