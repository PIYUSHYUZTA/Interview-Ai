/**
 * The seven chapters of the immersive landing (docs/immersive-experience-plan.md, section 3).
 * Each chapter owns `length` viewport-heights of scroll and two camera keys (where the shot starts and
 * where it ends); the rig flies one spline through all of them. World units are metres; chapters sit
 * along -z, so the camera always travels forward into the building.
 */
export type Vec3 = readonly [number, number, number];
export type CameraKey = { position: Vec3; target: Vec3 };
export type Chapter = {
  id: string;
  label: string;
  lines: readonly string[]; // headline, one entry per masked line
  body: string;
  length: number; // vh of scroll
  align: 'left' | 'right' | 'bottom';
  still: string; // Cycles still for reduced motion and the low tier (placeholders until Phase 3–6 renders exist)
  keys: readonly [CameraKey, CameraKey];
};

export const CHAPTERS: readonly Chapter[] = [
  {
    id: 'arrival', label: 'Arrival', align: 'left', length: 160, still: '/media/instrument-loop-poster.webp',
    lines: ['Every great answer', 'has an architecture.'],
    body: 'Practise real interviews with an AI interviewer that listens, follows up and shows you how your thinking holds together.',
    keys: [{ position: [0, 15, 4], target: [0, 0, -1] }, { position: [3, 3.2, 9], target: [0, 1, -2] }],
  },
  {
    id: 'pavilion', label: 'The Pavilion', align: 'right', length: 200, still: '/media/instrument-listen.webp',
    lines: ['An interviewer', 'that thinks with you.'],
    body: 'Built around the role and your résumé. The interview adapts as you speak instead of reading down a fixed script.',
    keys: [{ position: [10, 4.5, -7], target: [0, 2.2, -18] }, { position: [-2.2, 1.8, -10.5], target: [1, 2, -20] }],
  },
  {
    id: 'room', label: 'The Room', align: 'left', length: 200, still: '/media/hero-film-poster.webp',
    lines: ['A room built', 'for conversation.'],
    body: 'You answer out loud. The interviewer hears your whole answer before it responds, with lip movement driven by its own voice.',
    keys: [{ position: [0, 1.5, -27], target: [0, 1.3, -35] }, { position: [1.4, 1.3, -31], target: [0, 1.2, -35] }],
  },
  {
    id: 'thinking', label: 'The Thinking', align: 'right', length: 200, still: '/media/instrument-adapt.webp',
    lines: ['Every follow-up starts', 'with what you said.'],
    body: 'Your answer becomes the input. Follow-up questions branch from its substance, probing a decision or a trade-off.',
    keys: [{ position: [7, 2.4, -44], target: [0, 2, -50] }, { position: [4, 3.4, -55], target: [0, 2, -50] }],
  },
  {
    id: 'landscape', label: 'The Landscape', align: 'left', length: 200, still: '/media/instrument-develop.webp',
    lines: ['See the shape', 'of your performance.'],
    body: 'Each skill is scored against evidence from your answers, so strengths and gaps read at a glance. Shown here with example data.',
    keys: [{ position: [-10, 9, -57], target: [0, 1, -68] }, { position: [10, 6.5, -76], target: [0, 1.2, -68] }],
  },
  {
    id: 'drawings', label: 'The Drawing Set', align: 'right', length: 180, still: '/media/instrument-develop.webp',
    lines: ['Leave with', 'a set of plans.'],
    body: 'A report that shows its working: question-by-question evidence, clear priorities and a practice roadmap.',
    keys: [{ position: [0, 2.2, -79], target: [0, 1.8, -86] }, { position: [-1, 2, -83], target: [0, 1.8, -86] }],
  },
  {
    id: 'daylight', label: 'Daylight', align: 'bottom', length: 160, still: '/media/instrument-loop-poster.webp',
    lines: ['Walk in', 'prepared.'],
    body: 'Bring your experience. Find your words. Take the next step with a clearer direction.',
    keys: [{ position: [0, 1.6, -92], target: [0, 1.8, -102] }, { position: [0, 1.6, -96], target: [0, 1.8, -103] }],
  },
];

/** World anchor of each chapter's set. */
export const ANCHORS: readonly Vec3[] = [[0, 0, 0], [0, 0, -18], [0, 0, -35], [0, 0, -50], [0, 0, -68], [0, 0, -86], [0, 0, -102]];

/** Example skill scores for the landscape (clearly labelled as example data in the copy). */
export const EXAMPLE_SKILLS = [
  { name: 'Structure', score: .82 }, { name: 'Evidence', score: .64 }, { name: 'Depth', score: .71 },
  { name: 'Clarity', score: .88 }, { name: 'Trade-offs', score: .52 }, { name: 'Ownership', score: .76 },
] as const;
