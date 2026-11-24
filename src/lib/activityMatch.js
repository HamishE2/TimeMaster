// Local, dependency-free matching of free-text entry notes to a project's
// costed activities. Everything runs in the browser (the app is a static
// page), so "semantic" matching is built from normalisation, stemming,
// acronyms, a consulting synonym table, typo tolerance and word weighting:
// words shared by many of a project's activities ("Copilot", "session")
// count for less than the words that tell activities apart.

const STOPWORDS = new Set(
  `a an and the of for to on in with at by from into re about my our your
  their this that these those some more draft drafted drafting work worked
  working update updated updating review reviewed reviewing finalise
  finalised finalize finalized prep prepped prepare prepared preparing build
  built building create created creating write wrote writing continue
  continued continuing team teams ran run running deliver delivered
  delivering x1 x2 x3 up minute second mins min sec hour`
    .split(/\s+/)
    .filter(Boolean),
);

// Notes made only of these words can't be tied to one activity.
export const VAGUE_TERMS = [
  'deliverable',
  'deliverables',
  'work',
  'admin',
  'administration',
  'stuff',
  'misc',
  'miscellaneous',
  'tasks',
  'task',
  'project work',
  'project',
  'internal',
  'catch up',
  'catchup',
  'general',
  'bau',
  'various',
  'other',
  'things',
  'items',
  'activities',
  'documents',
  'docs',
  'content',
  'outputs',
  'materials',
  'meeting',
  'meetings',
  'emails',
];

// Phrases in the same group name the same kind of deliverable. Names follow
// the Transformation & Change activity catalogue and common shorthand.
export const SYNONYM_GROUPS = [
  [
    'quick reference guide',
    'qrg',
    'quick ref guide',
    'cheat sheet',
    'job aid',
    'tip sheet',
    'prompt card',
  ],
  ['user guide', 'how to guide', 'manual'],
  ['day in the life guide', 'ditl'],
  [
    'facilitator guide',
    'facilitator notes',
    'facilitator pack',
    'demo notes',
    'demo runbook',
    'run sheet',
    'speaker notes',
    'presenter notes',
    'session script',
  ],
  ['train the trainer', 'ttt'],
  ['workshop', 'design session'],
  [
    'communication',
    'comms',
    'email',
    'announcement',
    'newsletter',
    'comms plan',
    'communications plan',
    'yammer post',
    'viva engage post',
  ],
  [
    'change impact assessment',
    'change impact and readiness assessment',
    'cia',
    'impact assessment',
    'impact analysis',
  ],
  [
    'stakeholder analysis',
    'stakeholder map',
    'stakeholder mapping',
    'stakeholder engagement',
  ],
  ['champion', 'champions network', 'champion network', 'champion toolkit'],
  ['community of practice', 'cop', 'centre of excellence', 'coe'],
  ['presentation', 'deck', 'slide', 'ppt', 'powerpoint', 'slide deck'],
  ['survey', 'pulse survey', 'questionnaire', 'poll', 'feedback form'],
  [
    'adoption plan',
    'change plan',
    'adoption strategy',
    'change strategy',
    'change management plan',
  ],
  [
    'dashboard',
    'status report',
    'usage report',
    'analytics',
    'dashboard analysis',
  ],
  [
    'project governance',
    'project management',
    'pm',
    'governance',
    'status meeting',
    'steerco',
    'steering committee',
  ],
  ['discovery', 'interview', 'current state', 'current state assessment'],
  ['persona', 'scenario', 'use case', 'prompt library'],
  [
    'video',
    'recording',
    'demo video',
    'screen recording',
    'walkthrough video',
    'learning video',
  ],
  [
    'intranet',
    'sharepoint page',
    'sharepoint site',
    'landing page',
    'training hub',
    'learning hub',
  ],
  ['elearning', 'online module', 'learning module', 'lms module'],
  [
    'dropin',
    'drop in clinic',
    'office hours',
    'floor walking',
    'floorwalking',
    'clinic',
  ],
  ['hypercare', 'post launch support', 'lite hypercare'],
  ['readiness assessment', 'change readiness'],
  ['training needs analysis', 'tna', 'learning needs analysis'],
  ['showcase', 'show and tell'],
  ['playbook', 'runbook', 'handbook'],
  ['faq', 'frequently asked questions'],
  ['golive', 'launch', 'cutover', 'rollout'],
  ['kickoff', 'kick off meeting', 'project kickoff'],
  ['consulting qa', 'quality assurance', 'qa', 'peer review'],
  ['masterclass', 'prompting masterclass', 'prompting session'],
  ['tip', 'weekly tip', 'tip of the week'],
  [
    'escape room',
    'prompt a thon',
    'promptathon',
    'hackathon',
    'engagement event',
  ],
];

const DEFAULT_THRESHOLD = 0.7;
const AMBIGUOUS_FLOOR = 0.4;
const MARGIN = 0.1;

// Hyphenated or spaced compounds ("kick-off", "drop in", "e-learning")
// become one word so every spelling compares equal.
const COMPOUNDS =
  /\b(kick|drop|check|sign|walk|follow|roll|go|e|lead|hand|set|deep)[\s-]+(off|ins?|ups?|through|out|live|learning|over|dive)\b/g;

export function normalise(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(COMPOUNDS, '$1$2')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function stem(word) {
  const w = word;
  if (w.length <= 3)
    return w.endsWith('s') && w.length === 3 && !/[aeiou]/.test(w)
      ? w.slice(0, -1)
      : w;
  if (w.endsWith('ies') && w.length > 4) return `${w.slice(0, -3)}y`;
  if (w.endsWith('sses')) return w.slice(0, -2);
  if (
    w.endsWith('s') &&
    !w.endsWith('ss') &&
    !w.endsWith('us') &&
    !w.endsWith('is')
  )
    return w.slice(0, -1);
  return w;
}

const words = (text) =>
  normalise(text)
    .split(' ')
    .filter((t) => t && !/^\d+$/.test(t))
    .map(stem);
const significant = (tokens) => tokens.filter((t) => !STOPWORDS.has(t));
// Synonym phrases only lose true function words, so "run sheet" keeps "run".
const FUNCTION_WORDS = new Set(
  'a an and the of for to on in with at by from into'.split(' '),
);
const contentWords = (tokens) => tokens.filter((t) => !FUNCTION_WORDS.has(t));
const initials = (tokens) => tokens.map((t) => t[0]).join('');

function levenshtein(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      best = Math.min(best, row[j]);
    }
    if (best > max) return max + 1;
    prev = row;
  }
  return prev[b.length];
}

// 1 for an exact token, a little less for typos and abbreviations ("ref").
// `a` is the note's word and `b` the activity's. Prefix abbreviations only run
// one way: a note may shorten an activity word ("ref" for "reference"), but an
// activity word never matches a longer note word that merely starts with it
// ("Comms" is not "committee", "Plan" is not "planet").
// Synonym groups use the strict form so "run" never reads as "runbook".
// "planning" → "plan", "tested" → "test", "mapping" → "map": -ing/-ed
// forms share a root with the plain word, unlike "planet" or "committee".
const inflectionRoot = (w) => {
  const m = /^(.{3,}?)(?:ing|ed)$/.exec(w);
  if (!m) return w;
  const r = m[1];
  return r.length >= 4 && r.at(-1) === r.at(-2) ? r.slice(0, -1) : r;
};

function tokenSimilarity(a, b, { prefix = true } = {}) {
  if (a === b) return 1;
  if (a.length >= 3 && b.length >= 3 && inflectionRoot(a) === inflectionRoot(b))
    return 0.9;
  const short = a.length <= b.length ? a : b,
    long = short === a ? b : a;
  if (prefix && short === a && a.length >= 3 && b.length >= 6 && b.startsWith(a))
    return 0.85;
  if (short.length < 4) return 0;
  const allowed = long.length >= 8 ? 2 : 1;
  return levenshtein(a, b, allowed) <= allowed ? 0.85 : 0;
}

const containsPhrase = (tokens, phrase, options) => {
  if (!phrase.length || phrase.length > tokens.length) return false;
  for (let i = 0; i + phrase.length <= tokens.length; i += 1)
    if (
      phrase.every((p, j) => tokenSimilarity(tokens[i + j], p, options) >= 0.85)
    )
      return true;
  return false;
};

const GROUPS = SYNONYM_GROUPS.map((group) =>
  group.map((phrase) => contentWords(words(phrase))).filter((p) => p.length),
);

const exactPhrase = (tokens, phrase) =>
  tokens.some((_, i) => phrase.every((p, j) => tokens[i + j] === p));

// Notes may contain typos; activity names are typed with care, so they only
// join a group on exact words ("learning video" is not "elearning").
const groupsIn = (tokens, { fuzzy = true } = {}) => {
  const found = new Set();
  GROUPS.forEach((phrases, index) => {
    if (
      phrases.some((p) =>
        fuzzy
          ? containsPhrase(tokens, p, { prefix: false })
          : exactPhrase(tokens, p),
      )
    )
      found.add(index);
  });
  return found;
};

// Initials of every 2–6 word run, with and without small words, so
// "community of practice" offers "cop" and "quick reference guide" "qrg".
const runInitials = (tokens) => {
  const out = new Set();
  for (let i = 0; i < tokens.length; i += 1)
    for (let n = 2; n <= 6 && i + n <= tokens.length; n += 1)
      out.add(initials(tokens.slice(i, i + n)));
  return out;
};

export function activityKeys(activity) {
  const raw = String(activity?.name ?? '');
  // "Quick reference guides (QRGs)" carries its own acronym alias.
  const bracketed = [...raw.matchAll(/\(([^)]+)\)/g)].map((m) => m[1]);
  const base = raw.replace(/\([^)]*\)/g, ' ');
  const aliases = (Array.isArray(activity?.aliases) ? activity.aliases : [])
    .concat(bracketed)
    .map((alias) => String(alias ?? ''))
    .filter((alias) => normalise(alias));
  const texts = [base, ...aliases];
  const phrases = texts
    .map((text) => significant(words(text)))
    .filter((tokens) => tokens.length);
  const acronyms = new Set();
  for (const text of texts) {
    const all = words(text);
    for (const a of runInitials(all)) acronyms.add(a);
    for (const a of runInitials(significant(all))) acronyms.add(a);
  }
  // A short single word such as "QRGs" is itself an acronym.
  for (const tokens of phrases)
    if (tokens.length === 1 && tokens[0].length <= 5) acronyms.add(tokens[0]);
  const vocabulary = new Set(phrases.flat());
  const groups = new Set();
  for (const tokens of phrases)
    for (const g of groupsIn(tokens, { fuzzy: false })) groups.add(g);
  return { id: activity?.id ?? null, phrases, vocabulary, acronyms, groups };
}

const VAGUE = new Set(VAGUE_TERMS.map((t) => words(t).join(' ')));
const isVagueText = (tokens) => {
  const text = tokens.join(' ');
  if (!text || VAGUE.has(text)) return true;
  return tokens.every((t) => VAGUE.has(t) || STOPWORDS.has(t));
};

// Rarer words across this project's activities carry more weight.
function weightsFor(keyList) {
  const df = new Map();
  for (const keys of keyList)
    for (const token of keys.vocabulary)
      df.set(token, (df.get(token) || 0) + 1);
  const n = Math.max(1, keyList.length);
  const weight = (token) => Math.log(1 + n / (df.get(token) || 0.5));
  const vocabulary = [...df.keys()];
  weight.known = (token) =>
    df.has(token) || vocabulary.some((v) => tokenSimilarity(token, v) > 0);
  return weight;
}

// `noteSide` says whether `token` is from the note (pool = activity words)
// or from the activity (pool = note words), so prefixes run the right way.
const bestSimilarity = (token, pool, noteSide = true) => {
  let best = 0;
  for (const other of pool) {
    const sim = noteSide
      ? tokenSimilarity(token, other)
      : tokenSimilarity(other, token);
    if (sim > best) best = sim;
    if (best === 1) break;
  }
  return best;
};

function scoreActivity(note, keys, weight) {
  const { tokens, sig, groups, initialsSet } = note;
  let best = { score: 0, reason: null };
  const consider = (score, reason) => {
    if (score > best.score) best = { score, reason };
  };
  for (const phrase of keys.phrases)
    if (phrase.length > 1 && containsPhrase(tokens, phrase))
      consider(1, 'name');

  // Precision: how much of the note this activity explains.
  // Recall: how much of the activity's name the note mentions.
  let noteHit = 0,
    noteTotal = 0;
  for (const token of sig) {
    // Words no activity uses can't tell activities apart, so they only
    // dilute the score a little.
    const w =
      weight.known(token) || keys.acronyms.has(token) ? weight(token) : 0.3;
    noteTotal += w;
    const acronymHit = token.length >= 2 && keys.acronyms.has(token) ? 0.95 : 0;
    noteHit += w * Math.max(acronymHit, bestSimilarity(token, keys.vocabulary));
  }
  // Recall is taken per name or alias, so an alias isn't diluted by the
  // activity's main name.
  let recall = 0;
  for (const phrase of keys.phrases) {
    let hit = 0,
      total = 0;
    for (const token of phrase) {
      const w = weight(token);
      total += w;
      hit += w * bestSimilarity(token, sig, false);
    }
    if (total) recall = Math.max(recall, hit / total);
  }
  // A note acronym ("CIA", "TTT") that spells out this activity's name.
  for (const token of sig)
    if (
      token.length >= 3 &&
      keys.acronyms.has(token) &&
      !keys.vocabulary.has(token)
    )
      consider(0.92, 'acronym');
  // Acronyms in the activity name ("QRG") spelled out in the note.
  for (const acronym of keys.acronyms)
    if (
      acronym.length >= 3 &&
      keys.vocabulary.has(acronym) &&
      initialsSet.has(acronym)
    )
      consider(0.95, 'acronym');
  let wordScore = 0;
  if (noteTotal) {
    const precision = noteHit / noteTotal;
    if (precision > 0) wordScore = 0.95 * (0.7 * precision + 0.3 * recall);
    consider(wordScore, 'words');
  }
  // A shared synonym group is strong evidence; word overlap breaks ties
  // between activities that fall in the same group.
  if ([...keys.groups].some((g) => groups.has(g)))
    consider(0.78 + 0.2 * wordScore, 'synonym');
  return best;
}

export function matchActivity(
  note,
  activities,
  { threshold = DEFAULT_THRESHOLD } = {},
) {
  const list = (Array.isArray(activities) ? activities : []).filter(
    (a) => a?.id,
  );
  const tokens = words(note),
    sig = significant(tokens);
  const empty = { activityId: null, candidates: [] };
  if (!sig.length)
    return { status: tokens.length ? 'vague' : 'none', ...empty };
  const vague = isVagueText(sig);
  if (vague) return { status: 'vague', ...empty };
  const keyList = list.map(activityKeys),
    weight = weightsFor(keyList),
    noteInfo = {
      tokens,
      sig,
      groups: groupsIn(tokens),
      initialsSet: runInitials(sig),
    };
  const candidates = list
    .map((activity, index) => {
      const { score, reason } = scoreActivity(noteInfo, keyList[index], weight);
      return {
        activityId: activity.id,
        score: Math.round(score * 1000) / 1000,
        reason,
      };
    })
    .filter((c) => c.score >= AMBIGUOUS_FLOOR)
    .sort((a, b) => b.score - a.score);
  const [first, second] = candidates;
  if (
    first &&
    first.score >= threshold &&
    (!second || first.score - second.score >= MARGIN)
  )
    return { status: 'match', activityId: first.activityId, candidates };
  if (first) return { status: 'ambiguous', activityId: null, candidates };
  return { status: 'none', activityId: null, candidates };
}

// Tag value meaning "this entry is not a costed activity".
export const NOT_COSTED = 'none';
// The same bucket seen from the project: time that isn't charged to a
// costed activity is costed against the project's General bucket.
export const GENERAL_BUCKET = NOT_COSTED;

// An explicit tag that still points at an activity always wins, and the
// NOT_COSTED tag stops auto-matching for that entry.
export function resolveEntryActivity(note, activities, taggedId) {
  const list = Array.isArray(activities) ? activities : [];
  if (taggedId === NOT_COSTED)
    return { activityId: null, source: 'tag', status: 'none' };
  if (taggedId && list.some((a) => a?.id === taggedId))
    return { activityId: taggedId, source: 'tag', status: 'match' };
  const result = matchActivity(note, list);
  return {
    activityId: result.activityId,
    source: result.activityId ? 'auto' : null,
    status: result.status,
  };
}

// ---- Several activities in one entry ----------------------------------
// "3 QRGs and a user guide" covers two costed activities. The note is cut
// into parts, each part is matched on its own and carries a quantity, and
// the entry's hours are split between the activities by quantity.

const SEPARATORS =
  /\s*(?:[,;\n+&/]|\band\b|\bplus\b|\bthen\b|\bas well as\b)\s*/i;
const NUMBER_WORDS = {
  a: 1,
  an: 1,
  one: 1,
  single: 1,
  two: 2,
  couple: 2,
  pair: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  dozen: 12,
};

// Hours named in a part: "2h QRGs", "30 min workshop", "1:30 build",
// "1.5 hours". Null when the part names no duration.
const DURATION =
  /(?:^|[^\d.:])(\d{1,2}):([0-5]\d)(?![\d:])|(\d+(?:\.\d+)?)\s?(h|hr|hrs|hours?|m|mins?|minutes?)\b/gi;
export function partHours(text) {
  let total = 0,
    found = false;
  for (const m of String(text ?? '').matchAll(DURATION)) {
    found = true;
    total += m[1] != null
      ? Number(m[1]) + Number(m[2]) / 60
      : /^h/i.test(m[4])
        ? Number(m[3])
        : Number(m[3]) / 60;
  }
  return found && total > 0 ? Math.round(total * 100) / 100 : null;
}

// Numbers that count something other than the deliverable: "for 20 people",
// "page 10", "QRG for 3 teams".
const NOT_A_COUNT_BEFORE =
  /\b(?:for|with|of|page|p|to|from|about|around|over|under|at|on|by|per|version|v|round|week|day|step|phase|level|sprint)\s*$/;
const NOT_A_COUNT_AFTER =
  /^\s*(?:people|persons?|teams?|staff|attendees|participants|users|learners|pages?|slides?|mins?|minutes?|hrs?|hours?|h|m|am|pm|days?|weeks?|months?|years?|%|percent)\b/;

// Quantity named in a part: "3 QRGs", "x2 sessions", "QRG x3", "two guides".
// Durations are hours, not quantities.
export function partQuantity(text) {
  const t = String(text ?? '')
    .toLowerCase()
    .replace(DURATION, ' ');
  const explicit =
    t.match(/(?:^|\s)[x×]\s?(\d{1,3})\b/) ||
    t.match(/\b(\d{1,3})\s?[x×](?:\s|$)/);
  if (explicit) return Math.max(1, Math.min(999, Number(explicit[1])));
  for (const m of t.matchAll(/\b(\d{1,3})(?=\s+[a-z])/g)) {
    const before = t.slice(0, m.index),
      after = t.slice(m.index + m[0].length);
    if (/\d[.:]$/.test(before) || /^[.:]\d/.test(after)) continue;
    if (NOT_A_COUNT_BEFORE.test(before) || NOT_A_COUNT_AFTER.test(after))
      continue;
    return Math.max(1, Math.min(999, Number(m[1])));
  }
  const word = t.match(
    /\b(a|an|one|single|two|couple|pair|three|four|five|six|seven|eight|nine|ten|dozen)\b/,
  );
  return word ? NUMBER_WORDS[word[1]] : 1;
}

export function matchActivities(note, activities) {
  const list = Array.isArray(activities) ? activities : [];
  const pieces = String(note ?? '')
    .split(SEPARATORS)
    .map((piece) => piece.trim())
    .filter((piece) => normalise(piece));
  if (!pieces.length) return { status: 'none', parts: [] };
  const whole = matchActivity(note, list);
  if (pieces.length === 1)
    return {
      status: whole.status,
      parts: [
        {
          text: pieces[0],
          quantity: partQuantity(pieces[0]),
          hours: partHours(pieces[0]),
          activityId: whole.activityId,
          status: whole.status,
          candidates: whole.candidates,
        },
      ],
    };
  let parts = pieces.map((text) => {
    const result = matchActivity(text, list);
    return {
      text,
      quantity: partQuantity(text),
      hours: partHours(text),
      activityId: result.activityId,
      status: result.status,
      candidates: result.candidates,
    };
  });
  // Parts naming the same activity ("facilitator and demo notes") are one.
  const merged = [];
  for (const part of parts) {
    const same =
      part.activityId &&
      merged.find((other) => other.activityId === part.activityId);
    if (same) {
      const explicit = (p) => /\d|\b[x×]/i.test(p.text);
      same.quantity =
        explicit(same) && explicit(part)
          ? same.quantity + part.quantity
          : Math.max(same.quantity, part.quantity);
      same.hours =
        same.hours != null || part.hours != null
          ? (same.hours || 0) + (part.hours || 0)
          : null;
      same.text = `${same.text} and ${part.text}`;
    } else merged.push({ ...part });
  }
  parts = merged;
  const matched = parts.filter((p) => p.activityId);
  // "QRGs for HR": a part that matches nothing is context, not an activity.
  if (matched.length) parts = parts.filter((p) => p.status !== 'none');
  // The whole note may still name one activity better than its pieces do.
  if (
    whole.status === 'match' &&
    (matched.length === 0 || (matched.length === 1 && parts.length === 1))
  )
    return {
      status: 'match',
      parts: [
        {
          text: String(note).trim(),
          quantity: partQuantity(note),
          hours: null,
          activityId: whole.activityId,
          status: 'match',
          candidates: whole.candidates,
        },
      ],
    };
  const status =
    matched.length && matched.length === parts.length
      ? 'match'
      : matched.length
        ? 'partial'
        : parts.some((p) => p.status === 'ambiguous')
          ? 'ambiguous'
          : parts.some((p) => p.status === 'vague')
            ? 'vague'
            : 'none';
  return { status, parts };
}

const round2 = (n) => Math.round(n * 100) / 100;

// Shares `total` hours by weight in whole units of `unit` hours, using the
// largest remainder so the shares always add up exactly. Null if a share
// would be empty.
function allocate(total, weights, unit) {
  const units = Math.round(total / unit),
    sum = [...weights.values()].reduce((a, b) => a + b, 0);
  if (!sum || Math.abs(units * unit - total) > 1e-9) return null;
  const rows = [...weights].map(([key, weight], order) => {
    const exact = (units * weight) / sum;
    return { key, order, whole: Math.floor(exact), frac: exact - Math.floor(exact) };
  });
  let left = units - rows.reduce((n, r) => n + r.whole, 0);
  [...rows]
    .sort((a, b) => b.frac - a.frac || a.order - b.order)
    .forEach((row) => {
      if (left > 0) {
        row.whole += 1;
        left -= 1;
      }
    });
  if (rows.some((r) => r.whole <= 0)) return null;
  return Object.fromEntries(rows.map((r) => [r.key, round2(r.whole * unit)]));
}

// Splits `hours` across the parts. Hours named in a part ("2h QRGs") are
// used as given; the rest is shared by quantity ("3 QRGs and a user guide").
// Parts still waiting for an answer go to NOT_COSTED until the person picks
// an activity. Shares are in quarter hours where every activity can still
// get one, otherwise in hundredths, and always sum to `hours`.
export function suggestSplit(hours, parts) {
  const total = Number(hours);
  if (!Number.isFinite(total) || total <= 0) return {};
  const list = Array.isArray(parts) ? parts : [];
  const weights = new Map(),
    named = new Map();
  for (const part of list) {
    const key = part.activityId || NOT_COSTED,
      h = Number(part.hours);
    if (Number.isFinite(h) && h > 0) named.set(key, (named.get(key) || 0) + h);
    else
      weights.set(
        key,
        (weights.get(key) || 0) + Math.max(1, Number(part.quantity) || 1),
      );
  }
  if (!weights.size && !named.size) return { [NOT_COSTED]: round2(total) };
  // Named hours are exact; quantities share what they leave. If the named
  // hours fill (or overrun) the entry, they are scaled to it.
  const namedSum = [...named.values()].reduce((a, b) => a + b, 0);
  const exact = new Map();
  if (namedSum && (namedSum >= total - 0.005 || !weights.size)) {
    for (const [key, h] of named) exact.set(key, (total * h) / namedSum);
  } else {
    for (const [key, h] of named) exact.set(key, h);
    const rest = total - namedSum,
      sum = [...weights.values()].reduce((a, b) => a + b, 0);
    for (const [key, w] of weights)
      exact.set(key, (exact.get(key) || 0) + (rest * w) / sum);
  }
  for (const [key, h] of exact) if (h <= 0) exact.delete(key);
  // Too small to divide (0.01h across three activities): the main one gets it.
  if (total < 0.01 * exact.size) {
    const [top] = [...exact].sort((a, b) => b[1] - a[1])[0];
    return { [top]: round2(total) };
  }
  return (
    allocate(total, exact, 0.25) ||
    allocate(total, exact, 0.01) ||
    { [[...exact].sort((a, b) => b[1] - a[1])[0][0]]: round2(total) }
  );
}

// Cleans a stored split against the current activities and entry hours:
// unknown activities become NOT_COSTED, invalid shares are dropped, and a
// total that no longer matches the entry (the hours were edited) is scaled.
export function normaliseSplit(split, hours, activities) {
  const total = Number(hours);
  if (!split || typeof split !== 'object' || Array.isArray(split)) return null;
  if (!Number.isFinite(total) || total <= 0) return null;
  const ids = new Set(
    (Array.isArray(activities) ? activities : []).map((a) => a?.id),
  );
  const clean = {};
  for (const [key, value] of Object.entries(split)) {
    const share = Number(value);
    if (!Number.isFinite(share) || share <= 0) continue;
    const id = key === NOT_COSTED || ids.has(key) ? key : NOT_COSTED;
    clean[id] = round2((clean[id] || 0) + share);
  }
  // Shares that round to nothing carry no hours (and would divide by zero).
  for (const key of Object.keys(clean)) if (clean[key] <= 0) delete clean[key];
  const keys = Object.keys(clean);
  if (!keys.length) return null;
  const sum = keys.reduce((n, k) => n + clean[k], 0);
  if (Math.abs(sum - total) <= 0.01) return clean;
  // Rescale to the edited hours in whole hundredths so every share stays
  // positive and the shares add up; too few hundredths for every share
  // leaves the hours with the largest one.
  const target = round2(total),
    largest = keys.reduce((a, b) => (clean[a] >= clean[b] ? a : b));
  return (
    (target > 0 && allocate(target, new Map(Object.entries(clean)), 0.01)) || {
      [largest]: target > 0 ? target : total,
    }
  );
}

// Makes a split add up to the entry's exact hours (an H:MM entry such as
// 0:20 is 0.333…h), putting the sub-cent residue on the largest share, so
// costing hours always agree with the project's hours.
function exactShares(split, total) {
  const keys = Object.keys(split);
  if (!keys.length) return split;
  const residue = total - keys.reduce((n, k) => n + split[k], 0);
  if (!residue) return split;
  const largest = keys.reduce((a, b) => (split[a] >= split[b] ? a : b));
  return { ...split, [largest]: split[largest] + residue };
}

// One call for budgets and the UI: the entry's hours by activity, always
// summing to `hours` (an empty split only when there are no hours).
// `tag` is a manual pick — an activity ID, GENERAL_BUCKET, or a stored
// split — and always wins over the note.
export function resolveEntryActivities(note, activities, tag, hours) {
  const list = Array.isArray(activities) ? activities : [];
  const total = Number(hours);
  const none = { split: {}, source: null, status: 'none', parts: [] };
  if (!Number.isFinite(total) || total <= 0) return none;
  if (tag === NOT_COSTED)
    return {
      split: { [NOT_COSTED]: total },
      source: 'tag',
      status: 'none',
      parts: [],
    };
  if (typeof tag === 'string' && list.some((a) => a?.id === tag))
    return {
      split: { [tag]: total },
      source: 'tag',
      status: 'match',
      parts: [],
    };
  const stored = normaliseSplit(tag, total, list);
  if (stored)
    return {
      split: exactShares(stored, total),
      source: 'tag',
      status: 'match',
      parts: [],
    };
  const result = matchActivities(note, list);
  const resolved = result.parts.some((p) => p.activityId);
  // Nothing picked and nothing matched ("meeting", "int call", no note):
  // the hours go to the General bucket, and `status` still says why so the
  // UI can offer a manual pick.
  return {
    split: resolved
      ? exactShares(suggestSplit(total, result.parts), total)
      : { [GENERAL_BUCKET]: total },
    source: resolved ? 'auto' : 'default',
    status: result.status,
    parts: result.parts,
  };
}
