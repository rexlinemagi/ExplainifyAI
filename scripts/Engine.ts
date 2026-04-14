// scripts/Engine.ts
import enData from '../assets/datasets/cs_data_en.json';
import hiData from '../assets/datasets/cs_data_hi.json';
import mlData from '../assets/datasets/cs_data_ml.json';
import taData from '../assets/datasets/cs_data_ta.json';
import teData from '../assets/datasets/cs_data_te.json';

// ─────────────────────────────────────────────────────────────────────────────
//  RAW DATASET TYPES  (matches the actual JSON structure)
// ─────────────────────────────────────────────────────────────────────────────
interface RawMCQ {
  question: string;
  translatedQ?: string;   // added by quiz_question_translator.py
  options: string[];
  answer: string;         // full option text | "B" | "D)"
}

interface RawTrueFalse {
  question: string;
  translatedQ?: string;   // added by quiz_question_translator.py
  answer: string;         // "True" | "False"
}

interface RawQuiz {
  mcq: RawMCQ[];
  true_false: RawTrueFalse[];
}

interface RawEntry {
  topic: string;
  prompt?: string;
  response: string;
  quiz: RawQuiz;
}

// ─────────────────────────────────────────────────────────────────────────────
//  OUTPUT TYPES  (consumed by quiz.tsx and quizSetup.tsx)
// ─────────────────────────────────────────────────────────────────────────────
export interface QuizQuestion {
  q: string;
  translatedQ?: string;   // translated question text — undefined for English users
  options: string[];
  correct: number;        // zero-based index — always remapped after shuffle
  type: 'mcq' | 'tf';
  topicLabel?: string;
}

export interface EngineResult {
  topic: string;
  response: string;
  quiz: QuizQuestion[];
}

// Returned alongside findExplanation when there are fuzzy matches
export interface FuzzySuggestion {
  topic: string;
  label: string;          // human-readable e.g. "tcp ip"
  distance: number;
}

export interface FindExplanationResult {
  result: EngineResult | null;
  suggestions: FuzzySuggestion[];   // empty when exact match found
}

// ─────────────────────────────────────────────────────────────────────────────
//  DATASET REGISTRY
// ─────────────────────────────────────────────────────────────────────────────
const datasets: Record<string, RawEntry[]> = {
  en: enData as RawEntry[],
  ta: taData as RawEntry[],
  hi: hiData as RawEntry[],
  ml: mlData as RawEntry[],
  te: teData as RawEntry[],
};

const getDataset = (lang: string): RawEntry[] => datasets[lang] ?? datasets['en'];

// ─────────────────────────────────────────────────────────────────────────────
//  ANSWER → CORRECT INDEX RESOLVER
// ─────────────────────────────────────────────────────────────────────────────
const resolveCorrectIndex = (answer: string, options: string[]): number => {
  if (!options || options.length === 0) return 0;

  // Guard: coerce any undefined/non-string options to empty string
  const safeOptions = options.map(o => (typeof o === 'string' ? o : String(o ?? '')));
  // Guard: coerce answer too
  const trimmed = (typeof answer === 'string' ? answer : String(answer ?? '')).trim();

  // 1. Exact text match
  const exactIdx = safeOptions.findIndex(
    (o) => o.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  if (exactIdx !== -1) return exactIdx;

  // 2. Prefix match
  const partialIdx = safeOptions.findIndex(
    (o) => o.trim().toLowerCase().startsWith(trimmed.toLowerCase()),
  );
  if (partialIdx !== -1) return partialIdx;

  // 3. Single letter: "B", "b", "B)", "b)" → index 1
  const letterMatch = trimmed.match(/^([A-Da-d])\)?$/);
  if (letterMatch) {
    const idx = letterMatch[1].toUpperCase().charCodeAt(0) - 65;
    if (idx >= 0 && idx < safeOptions.length) return idx;
  }

  // 4. Option starts with "B)" style prefix
  const letterOnly = trimmed.replace(/\)$/, '').toUpperCase();
  if (letterOnly.length === 1 && /[A-D]/.test(letterOnly)) {
    const prefixIdx = safeOptions.findIndex(
      (o) => o.trim().toUpperCase().startsWith(letterOnly + ')'),
    );
    if (prefixIdx !== -1) return prefixIdx;
  }

  console.warn(`⚠️ Could not resolve answer "${answer}" in options:`, options);
  return 0;
};

// ─────────────────────────────────────────────────────────────────────────────
//  FISHER-YATES SHUFFLE  (Knuth, 1969)
//  Used for both the question pool order AND individual MCQ option arrays.
// ─────────────────────────────────────────────────────────────────────────────
const shuffle = <T>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Shuffle MCQ options and remap the correct index.
// Customised extension: saves the correct option text before shuffling,
// finds it again after to ensure the correct index is always accurate.
const shuffleOptions = (q: QuizQuestion): QuizQuestion => {
  if (q.type !== 'mcq') return q;          // T/F is always True/False — never shuffle
  const correctText = q.options[q.correct];
  const shuffled    = shuffle(q.options);
  return {
    ...q,
    options: shuffled,
    correct: shuffled.indexOf(correctText),
  };
};

// ─────────────────────────────────────────────────────────────────────────────
//  DATASET ENTRY → FLAT QuizQuestion[]
// ─────────────────────────────────────────────────────────────────────────────
const toQuizQuestions = (rawQuiz: RawQuiz, topicLabel?: string): QuizQuestion[] => {
  if (!rawQuiz) return [];
  const out: QuizQuestion[] = [];

  for (const m of rawQuiz.mcq ?? []) {
    if (!m || !m.options || m.options.length === 0) continue;
    if (!m.question || !m.answer) continue;
    out.push({
      q:           m.question,
      translatedQ: m.translatedQ,
      options:     m.options,
      correct:     resolveCorrectIndex(m.answer, m.options),
      type:        'mcq',
      topicLabel,
    });
  }

  for (const tf of rawQuiz.true_false ?? []) {
    if (!tf || !tf.question || !tf.answer) continue;
    const isTrue = tf.answer.trim().toLowerCase() === 'true';
    out.push({
      q:           tf.question,
      translatedQ: tf.translatedQ,
      options:     ['True', 'False'],
      correct:     isTrue ? 0 : 1,
      type:        'tf',
      topicLabel,
    });
  }

  return out;
};

// ─────────────────────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const normalizeQuery = (query: string): string => {
  const fillers = [
    'what is', 'what are', 'explain', 'define', 'meaning of',
    'tell me about', 'describe', 'how does', 'how do',
  ];
  let q = query.toLowerCase();
  fillers.forEach((f) => { q = q.replace(new RegExp(`\\b${f}\\b`, 'g'), ''); });
  return q.replace(/[^\w\s]/g, '').trim();
};

const levenshtein = (a: string, b: string): number => {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: n + 1 }, (_, i) =>
    Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = b[i - 1] === a[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i][j - 1], dp[i - 1][j]);
    }
  }
  return dp[n][m];
};

const readable = (topic: string) => topic.replace(/_/g, ' ').toLowerCase();

// ─────────────────────────────────────────────────────────────────────────────
//  PUBLIC: findExplanation
//  Returns { result, suggestions }.
//  result is non-null on exact match. suggestions is non-empty on fuzzy match.
//  Both are empty/null when nothing found at all.
// ─────────────────────────────────────────────────────────────────────────────
export const findExplanation = (
  query: string,
  langCode = 'en',
): FindExplanationResult => {
  if (!query.trim()) return { result: null, suggestions: [] };

  const dataset    = getDataset(langCode);
  const normalised = normalizeQuery(query);

  const sorted = [...dataset].sort(
    (a, b) => (b.topic?.length ?? 0) - (a.topic?.length ?? 0),
  );

  // Pass 1: exact / substring match
  for (const item of sorted) {
    if (!item.topic || item.topic === 'general') continue;
    const rt = readable(item.topic);
    if (normalised.includes(rt) || rt.includes(normalised)) {
      return {
        result: {
          topic:    item.topic,
          response: item.response,
          quiz:     toQuizQuestions(item.quiz, readable(item.topic)),
        },
        suggestions: [],
      };
    }
  }

  // Pass 2: extended Levenshtein — collect all matches within distance ≤ 2,
  // sort ascending by distance, return top 3.
  if (normalised.length > 3) {
    const candidates: Array<{ item: RawEntry; distance: number }> = [];

    for (const item of sorted) {
      if (!item.topic || item.topic === 'general') continue;
      const d = levenshtein(normalised, readable(item.topic));
      if (d <= 2) candidates.push({ item, distance: d });
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => a.distance - b.distance);
      return {
        result: null,
        suggestions: candidates.slice(0, 3).map(({ item, distance }) => ({
          topic:    item.topic,
          label:    readable(item.topic),
          distance,
        })),
      };
    }
  }

  return { result: null, suggestions: [] };
};

// ─────────────────────────────────────────────────────────────────────────────
//  PUBLIC: findTopicsInText
// ─────────────────────────────────────────────────────────────────────────────
export const findTopicsInText = (rawText: string, langCode = 'en'): string[] => {
  if (!rawText.trim()) return [];
  const dataset = getDataset(langCode);
  const lower   = rawText.toLowerCase();
  const found   = new Set<string>();
  for (const item of dataset) {
    if (!item.topic || item.topic === 'general') continue;
    if (lower.includes(readable(item.topic))) {
      found.add(item.topic.replace(/_/g, ' ').toUpperCase());
    }
  }
  return [...found];
};

// ─────────────────────────────────────────────────────────────────────────────
//  PUBLIC: getTopicSuggestions
// ─────────────────────────────────────────────────────────────────────────────
export const getTopicSuggestions = (langCode = 'en', count = 8): string[] => {
  const dataset = getDataset(langCode);
  const valid = dataset
    .filter((d) => d.topic && d.topic !== 'general')
    .map((d) => d.topic.replace(/_/g, ' '));
  return shuffle([...new Set(valid)]).slice(0, count);
};

// ─────────────────────────────────────────────────────────────────────────────
//  PUBLIC: buildCombinedQuiz
//  Shuffles both the option order (MCQ) and the question pool order.
// ─────────────────────────────────────────────────────────────────────────────
export const buildCombinedQuiz = (
  topicNames: string[],
  langCode = 'en',
  limit = 10,
): QuizQuestion[] => {
  const dataset = getDataset(langCode);
  const pool: QuizQuestion[] = [];

  for (const topicName of topicNames) {
    const entry = dataset.find((d) => {
      if (!d.topic || d.topic === 'general') return false;
      return (
        readable(d.topic) === topicName.toLowerCase().replace(/_/g, ' ') ||
        d.topic.toLowerCase() === topicName.toLowerCase()
      );
    });

    if (!entry || !entry.quiz) continue;

    const label     = entry.topic.replace(/_/g, ' ');
    const questions = toQuizQuestions(entry.quiz, label);
    pool.push(...questions.map(shuffleOptions));
  }

  if (pool.length === 0) {
    console.warn('⚠️ buildCombinedQuiz: no questions found for topics:', topicNames);
  }

  return shuffle(pool).slice(0, limit);
};

// ─────────────────────────────────────────────────────────────────────────────
//  PUBLIC: buildSingleTopicQuiz
//  For quiz cards in learn.tsx — same shuffle logic, single topic.
// ─────────────────────────────────────────────────────────────────────────────
export const buildSingleTopicQuiz = (
  topicName: string,
  langCode = 'en',
): QuizQuestion[] => {
  const dataset = getDataset(langCode);

  const entry = dataset.find((d) => {
    if (!d.topic || d.topic === 'general') return false;
    return (
      readable(d.topic) === topicName.toLowerCase().replace(/_/g, ' ') ||
      d.topic.toLowerCase() === topicName.toLowerCase()
    );
  });

  if (!entry || !entry.quiz) return [];

  const label     = entry.topic.replace(/_/g, ' ');
  const questions = toQuizQuestions(entry.quiz, label);
  return shuffle(questions.map(shuffleOptions));
};