// Tiny local classifier (no deps).
// Heuristic token weights + softmax normalization. Improves over the naive thresholds.

const OPINION_WORDS = {
  'i think': 2.0, 'we think': 2.0, 'i feel': 1.6, 'we feel': 1.6, 'in my opinion': 2.2,
  'i believe': 1.8, 'we believe': 1.8, 'should': 0.9, 'could': 0.8, 'likely': 1.0,
  'seems': 1.0, 'appears': 0.9, 'arguably': 1.2, 'probably': 1.1
};
const PROMO_WORDS = {
  'sponsored': 2.2, 'affiliate': 1.8, 'deal': 1.4, 'discount': 1.6, 'buy now': 2.0,
  'limited time': 2.0, 'partner': 1.2, 'advertisement': 2.2, 'ad ': 1.0, 'ad\n': 1.0
};
const TOXIC_WORDS = {
  'hate': 2.0, 'idiot': 2.4, 'stupid': 2.0, 'dumb': 1.8, 'loser': 1.6,
  'moron': 2.2, 'nazi': 2.6, 'racist': 2.4, 'kill yourself': 3.0, 'shut up': 1.6
};

function scoreByLexicon(t, lex) {
  let s = 0;
  for (const [k, w] of Object.entries(lex)) {
    const re = new RegExp(`(^|\b)${k.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}(\b|$)`, 'g');
    const matches = t.match(re);
    if (matches) s += matches.length * w;
  }
  return s;
}

function softmax(obj) {
  const vals = Object.values(obj);
  const max = Math.max(...vals, 0);
  const exps = Object.fromEntries(Object.entries(obj).map(([k,v])=>[k, Math.exp((v - max))]));
  const sum = Object.values(exps).reduce((a,b)=>a+b,0) || 1;
  return Object.fromEntries(Object.entries(exps).map(([k,v])=>[k, v/sum]));
}

export async function loadModel(){
  await Promise.resolve();
  return {
    async predict(text){
      const t = (text||'').toLowerCase();
      // Lexicon-based scores
      const sOpinion = scoreByLexicon(t, OPINION_WORDS);
      const sPromo = scoreByLexicon(t, PROMO_WORDS);
      const sToxic = scoreByLexicon(t, TOXIC_WORDS);
      // Length prior: very long blocks lean neutral unless strong signals
      const lenPrior = Math.min((t.length||0) / 800, 1.0) * 0.4; // 0..0.4
      // Base scores (logits)
      const logits = {
        'Opinion': sOpinion,
        'Promotional': sPromo,
        'Potentially Toxic': sToxic,
        'Neutral/Factual': 0.5 + lenPrior
      };
      const probs = softmax(logits);
      // Nudge Neutral upward if nothing else is confident
      const maxOther = Math.max(probs['Opinion'], probs['Promotional'], probs['Potentially Toxic']);
      if (maxOther < 0.55) {
        probs['Neutral/Factual'] = Math.max(probs['Neutral/Factual'], 0.6);
      }
      return probs;
    }
  };
}
