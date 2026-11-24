// Local, dependency-free matching of free-text entry notes to a project's
// costed activities. Everything runs in the browser (the app is a static
// page), so "semantic" matching is built from normalisation, stemming,
// acronyms, a consulting synonym table and typo-tolerant token comparison.

const STOPWORDS = new Set(
  'a an and the of for to on in with at by from into re about my our my your their this that these those some more draft drafted drafting work worked working on update updated updating review reviewed reviewing finalise finalised finalize finalized prep prepped prepare prepared preparing build built building create created creating write wrote writing continue continued continuing team teams'.split(
    ' ',
  ),
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
];

// Phrases in the same group name the same kind of deliverable.
export const SYNONYM_GROUPS = [
  [
    'quick reference guide',
    'qrg',
    'quick ref guide',
    'cheat sheet',
    'job aid',
    'tip sheet',
    'how to guide',
    'user guide',
  ],
  [
    'facilitator guide',
    'facilitator notes',
    'facilitator pack',
    'run sheet',
    'speaker notes',
    'presenter notes',
    'session script',
  ],
  [
    'training',
    'training session',
    'trainings',
    'course',
    'class',
    'lesson',
    'end user training',
  ],
  ['train the trainer', 'ttt'],
  ['workshop', 'workshops', 'working session', 'design session'],
  [
    'communication',
    'comms',
    'email',
    'announcement',
    'newsletter',
    'message',
    'comms plan',
    'communication plan',
    'yammer post',
    'viva engage post',
  ],
  ['change impact assessment', 'cia', 'impact assessment', 'impact analysis'],
  [
    'stakeholder analysis',
    'stakeholder map',
    'stakeholder mapping',
    'stakeholder engagement',
    'stakeholder',
  ],
  ['champion', 'champions network', 'champion network', 'champions'],
  [
    'presentation',
    'deck',
    'slide',
    'slides',
    'ppt',
    'powerpoint',
    'slide deck',
  ],
  ['survey', 'pulse survey', 'questionnaire', 'poll', 'feedback form'],
  [
    'adoption plan',
    'change plan',
    'adoption strategy',
    'change strategy',
    'change management plan',
  ],
  [
    'report',
    'reporting',
    'status report',
    'dashboard',
    'metrics',
    'usage report',
    'analytics',
  ],
  [
    'project management',
    'pm',
    'governance',
    'status meeting',
    'steerco',
    'steering committee',
    'planning',
  ],
  [
    'discovery',
    'interview',
    'interviews',
    'current state',
    'current state assessment',
    'persona',
    'personas',
  ],
  ['video', 'recording', 'demo video', 'screen recording', 'walkthrough video'],
  [
    'intranet',
    'sharepoint page',
    'sharepoint site',
    'hub',
    'landing page',
    'learning hub',
  ],
  ['elearning', 'e learning', 'online module', 'learning module', 'lms module'],
  [
    'office hours',
    'drop in',
    'drop in clinic',
    'floor walking',
    'floorwalking',
    'hypercare',
    'clinic',
  ],
  [
    'use case',
    'use cases',
    'scenario',
    'scenarios',
    'prompt library',
    'prompt guide',
  ],
  ['readiness assessment', 'readiness', 'change readiness'],
  ['training needs analysis', 'tna', 'learning needs analysis'],
  ['showcase', 'demo', 'demonstration', 'show and tell'],
  ['playbook', 'runbook', 'handbook', 'guidelines'],
  ['faq', 'faqs', 'frequently asked questions', 'q and a'],
  ['go live', 'launch', 'cutover', 'rollout'],
];

const DEFAULT_THRESHOLD = 0.75;
const AMBIGUOUS_FLOOR = 0.45;
const MARGIN = 0.12;

export function normalise(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function stem(word) {
  let w = word;
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
    w = w.slice(0, -1);
  return w;
}

const words = (text) => normalise(text).split(' ').filter(Boolean).map(stem);
const significant = (tokens) => tokens.filter((t) => !STOPWORDS.has(t));
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
// Prefix abbreviations are only trusted against an activity's own words;
// synonym groups use the strict form so "run" never reads as "runbook".
function tokenSimilarity(a, b, { prefix = true } = {}) {
  if (a === b) return 1;
  const short = a.length <= b.length ? a : b,
    long = short === a ? b : a;
  if (prefix && short.length >= 3 && long.length >= 6 && long.startsWith(short))
    return 0.85;
  if (short.length < 4) return 0;
  const allowed = long.length >= 8 ? 2 : 1;
  return levenshtein(a, b, allowed) <= allowed ? 0.85 : 0;
}

const containsPhrase = (tokens, phrase, options) => {
  if (!phrase.length || phrase.length > tokens.length) return false;
  for (let i = 0; i + phrase.length <= tokens.length; i += 1)
    if (
      phrase.every((p, j) => tokenSimilarity(p, tokens[i + j], options) >= 0.85)
    )
      return true;
  return false;
};

const GROUPS = SYNONYM_GROUPS.map((group) => group.map(words));

const groupsIn = (tokens) => {
  const found = new Set();
  GROUPS.forEach((phrases, index) => {
    if (phrases.some((p) => containsPhrase(tokens, p, { prefix: false })))
      found.add(index);
  });
  return found;
};

// Initials of every 2–5 token run, so "quick reference guides" offers "qrg".
const runInitials = (tokens) => {
  const out = new Set();
  for (let i = 0; i < tokens.length; i += 1)
    for (let n = 2; n <= 5 && i + n <= tokens.length; n += 1)
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
  const phrases = [base, ...aliases]
    .map((text) => significant(words(text)))
    .filter((tokens) => tokens.length);
  const acronyms = new Set();
  for (const tokens of phrases) {
    if (tokens.length >= 2) acronyms.add(initials(tokens));
    if (tokens.length === 1 && tokens[0].length <= 5) acronyms.add(tokens[0]);
  }
  const groups = new Set();
  for (const tokens of phrases) for (const g of groupsIn(tokens)) groups.add(g);
  return { id: activity?.id ?? null, phrases, acronyms, groups };
}

const isVagueText = (tokens) => {
  const text = tokens.join(' ');
  if (!text) return true;
  const vague = new Set(VAGUE_TERMS.map((t) => words(t).join(' ')));
  if (vague.has(text)) return true;
  return tokens.every((t) => vague.has(t) || STOPWORDS.has(t));
};

function scoreActivity(noteTokens, noteSig, noteGroups, noteInitials, keys) {
  let best = { score: 0, reason: null };
  const consider = (score, reason) => {
    if (score > best.score) best = { score, reason };
  };
  for (const phrase of keys.phrases) {
    if (containsPhrase(noteTokens, phrase))
      consider(phrase.length > 1 || phrase[0].length > 2 ? 1 : 0.9, 'name');
    // Partial overlap: share of the activity's words present in the note.
    let hit = 0;
    for (const token of phrase) {
      const sim = Math.max(0, ...noteSig.map((n) => tokenSimilarity(token, n)));
      hit += sim;
    }
    if (phrase.length) consider((hit / phrase.length) * 0.85, 'words');
  }
  for (const acronym of keys.acronyms) {
    if (acronym.length < 2) continue;
    if (noteSig.includes(acronym)) consider(0.95, 'acronym');
    else if (acronym.length >= 3 && noteInitials.has(acronym))
      consider(0.95, 'acronym');
  }
  for (const g of keys.groups) if (noteGroups.has(g)) consider(0.9, 'synonym');
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
  const noteTokens = words(note),
    noteSig = significant(noteTokens);
  const empty = { activityId: null, candidates: [] };
  if (!noteSig.length)
    return { status: noteTokens.length ? 'vague' : 'none', ...empty };
  const noteGroups = groupsIn(noteTokens),
    noteInitials = runInitials(noteSig);
  const candidates = list
    .map((activity) => {
      const { score, reason } = scoreActivity(
        noteTokens,
        noteSig,
        noteGroups,
        noteInitials,
        activityKeys(activity),
      );
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
  if (first && (second || !isVagueText(noteSig)))
    return { status: 'ambiguous', activityId: null, candidates };
  return {
    status: isVagueText(noteSig) ? 'vague' : 'none',
    activityId: null,
    candidates,
  };
}

// Tag value meaning "this entry is not a costed activity".
export const NOT_COSTED = 'none';

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
