/**
 * state.js
 * Centralised reactive state and small utility functions shared across modules.
 */

// ── Application state ────────────────────────────────────────────────────────
export const state = {
  user:               null,
  curriculumData:     [],
  competencyData:     [],
  allPlanningData:    {},
  currentPlannerData: null,
  currentPlannerLevel: 1,
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
