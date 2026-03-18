/**
 * state.js
 * Centralised reactive state and small utility functions shared across modules.
 */

// ── Level definitions — single source of truth ────────────────────────────────
/**
 * All curriculum levels in display order.
 * key        — Firestore field key (e.g. "l0") and checkbox value
 * label      — full display name shown in tabs, headers, matrix columns
 * short      — abbreviated label for tight spaces
 * plannerNum — integer stored in state.currentPlannerLevel and Firestore keys (_L0, _L1…)
 */
export const LEVELS = [
  { key: 'l0', label: 'Early',   short: 'E', plannerNum: 0 },
  { key: 'l1', label: 'First',   short: '1', plannerNum: 1 },
  { key: 'l2', label: 'Second',  short: '2', plannerNum: 2 },
  { key: 'l3', label: 'Third',   short: '3', plannerNum: 3 },
  { key: 'l4', label: 'Fourth',  short: '4', plannerNum: 4 },
];

/** Look up a level by its key string (e.g. 'l0') */
export function levelByKey(key) {
  return LEVELS.find((l) => l.key === key) ?? LEVELS[1];
}

/** Look up a level by its plannerNum integer (e.g. 0, 1, 2…) */
export function levelByNum(num) {
  return LEVELS.find((l) => l.plannerNum === num) ?? LEVELS[1];
}

// ── Application state ────────────────────────────────────────────────────────
export const state = {
  user:               null,
  curriculumData:     [],
  competencyData:     [],
  allPlanningData:    {},
  currentPlannerData: null,
  currentPlannerLevel: 1,   // plannerNum of the active level tab
};

// ── Utilities ─────────────────────────────────────────────────────────────────

/**
 * Escape a string for safe insertion into innerHTML.
 * @param {string} text
 * @returns {string}
 */
export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

/**
 * Re-render KaTeX math in the document body (or a given element).
 * No-ops gracefully if KaTeX is not yet loaded.
 * @param {HTMLElement} [root=document.body]
 */
export function triggerMath(root = document.body) {
  if (typeof renderMathInElement === 'function') {
    renderMathInElement(root, {
      delimiters: [
        { left: '$$', right: '$$', display: true  },
        { left: '$',  right: '$',  display: false },
      ],
      throwOnError: false,
    });
  }
}

/**
 * Produce a DOM-safe ID string for a planner bundle element.
 * @param {string} key
 * @param {number} bundleIndex
 * @returns {string}
 */
export function getSafeId(key, bundleIndex) {
  return `bundle-${key.replace(/[^a-zA-Z0-9]/g, '-')}-${bundleIndex}`;
}

/**
 * Update the inline KaTeX preview element for a statement input.
 * @param {string} id   - DOM id of the preview element
 * @param {string} text - Raw statement text (may contain $…$ math)
 */
export function updateMathPreview(id, text) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = escapeHtml(text) || '<span class="text-slate-300 italic text-[10px]">...</span>';
  if (typeof renderMathInElement === 'function') {
    renderMathInElement(el, {
      delimiters: [
        { left: '$$', right: '$$', display: true  },
        { left: '$',  right: '$',  display: false },
      ],
      throwOnError: false,
    });
  }
}
