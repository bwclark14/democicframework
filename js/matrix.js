/**
 * matrix.js
 * Two matrix view modes:
 *   conceptual  – concept rows with level-description cells, then organiser
 *                 sub-rows showing bundles (original view)
 *   knowdo      – concept rows only; cells contain Know & Do bundles grouped
 *                 by organiser when "All Organisers" is selected
 *
 * Bundles are always sorted numerically by sequenceTag.
 * Sequence badge is suppressed when every bundle in a cell is tagged 1.
 */

import { state, escapeHtml, triggerMath } from './state.js';

// ── Module state ──────────────────────────────────────────────────────────────

let matrixViewMode = 'conceptual'; // 'conceptual' | 'knowdo'

// ── View mode toggle ──────────────────────────────────────────────────────────

window.setMatrixViewMode = (mode) => {
  matrixViewMode = mode;
  document.getElementById('matrix-mode-conceptual').classList.toggle('active-mode', mode === 'conceptual');
  document.getElementById('matrix-mode-knowdo').classList.toggle('active-mode', mode === 'knowdo');
  renderMatrix();
};

// ── Sequence tag colour helper ────────────────────────────────────────────────

function seqColour(tag) {
  return tag === 1 ? 'bg-indigo-100 text-indigo-700 border-indigo-200'
       : tag === 2 ? 'bg-amber-100 text-amber-700 border-amber-200'
                   : 'bg-emerald-100 text-emerald-700 border-emerald-200';
}

// ── Bundle HTML (shared by matrix and explorer) ───────────────────────────────

export function buildBundleHtml(g, showSeqBadge = true) {
  const comp    = state.competencyData.find((c) => c.id === g.competencyId);
  const tag     = g.sequenceTag ?? 1;
  const colCls  = seqColour(tag);
  const hasKnow = (g.knowItems || []).some((k) => k.trim());
  const hasDo   = (g.doItems   || []).some((d) => d.trim());
  const hasBody = hasKnow || hasDo || comp;

  return `
    <div class="border border-slate-200 rounded-lg overflow-hidden bundle-card">
      <button type="button" onclick="toggleBundle(this)"
        class="w-full flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 transition text-left">
        ${showSeqBadge
          ? `<span class="inline-flex items-center justify-center w-5 h-5 rounded border text-[9px] font-black ${colCls} shrink-0">${tag}</span>`
          : ''}
        <span class="text-[11px] font-bold text-slate-700 flex-1 truncate">${escapeHtml(g.name || 'Unnamed bundle')}</span>
        ${hasBody ? `<svg class="w-3.5 h-3.5 text-slate-400 rotate-icon shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>` : ''}
      </button>
      ${hasBody ? `
      <div class="bundle-body collapse-content">
        <div class="p-3 space-y-2 border-t border-slate-100">
          ${comp ? `<button onclick="showCompInfo('${comp.id}')" class="text-[8px] font-bold text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded border border-violet-100 uppercase hover:bg-violet-100 transition">${escapeHtml(comp.title)}</button>` : ''}
          ${hasKnow ? `
          <div>
            <span class="text-[8px] font-bold text-indigo-400 uppercase tracking-tighter block mb-1">Know:</span>
            <ul class="list-disc list-outside ml-3 text-[10px] text-slate-700 space-y-1">
              ${g.knowItems.filter((v) => v.trim()).map((v) => `<li>${escapeHtml(v)}</li>`).join('')}
            </ul>
          </div>` : ''}
          ${hasDo ? `
          <div>
            <span class="text-[8px] font-bold text-emerald-500 uppercase tracking-tighter block mb-1">Do:</span>
            <ul class="list-disc list-outside ml-3 text-[10px] text-slate-700 font-medium space-y-1">
              ${g.doItems.filter((v) => v.trim()).map((v) => `<li>${escapeHtml(v)}</li>`).join('')}
            </ul>
          </div>` : ''}
        </div>
      </div>` : ''}
    </div>`;
}

// ── Toggle bundle collapse ────────────────────────────────────────────────────

window.toggleBundle = (btn) => {
  const card = btn.closest('.bundle-card');
  const body = card?.querySelector('.bundle-body');
  const icon = card?.querySelector('.rotate-icon');
  if (body) body.classList.toggle('expanded');
  if (icon) icon.classList.toggle('expanded');
};

// ── Filter dropdowns ──────────────────────────────────────────────────────────

export function updateMatrixFilters() {
  const areaId  = document.getElementById('matrix-area-select').value;
  const oSelect = document.getElementById('matrix-organiser-select');

  if (!areaId) { renderMatrix(); return; }

  const area = state.curriculumData.find((a) => a.id === areaId);
  if (!area) return;

  oSelect.innerHTML =
    '<option value="">All Organisers</option>' +
    (area.organisers || [])
      .map((o) => `<option value="${escapeHtml(o.name)}">${escapeHtml(o.name)}</option>`)
      .join('');

  renderMatrix();
}

// ── Shared guard / setup ──────────────────────────────────────────────────────

function getMatrixContext() {
  const areaId  = document.getElementById('matrix-area-select').value;
  const oFilter = document.getElementById('matrix-organiser-select').value;
  const levels  = Array.from(document.querySelectorAll('.matrix-level-cb:checked')).map((cb) => cb.value);
  const container = document.getElementById('matrix-container');

  if (!areaId) {
    container.innerHTML = '<div class="py-20 text-center text-slate-400">Select an area to view the progression matrix.</div>';
    return null;
  }
  const area = state.curriculumData.find((a) => a.id === areaId);
  if (!area || (area.status || 'public') === 'draft') {
    container.innerHTML = '<div class="py-20 text-center text-slate-400">This area is currently a draft and cannot be viewed in the matrix.</div>';
    return null;
  }
  const planning = state.allPlanningData[areaId] || { mappings: {} };
  const orgs = oFilter
    ? [area.organisers.find((o) => o.name === oFilter)].filter(Boolean)
    : (area.organisers || []);

  return { area, planning, orgs, oFilter, levels, container };
}

// ── Helper: sort and render a list of bundles into HTML ───────────────────────

function bundleCellHtml(groups) {
  const sorted = [...(groups || [])].sort((a, b) => (a.sequenceTag ?? 1) - (b.sequenceTag ?? 1));
  const allOne = sorted.every((g) => (g.sequenceTag ?? 1) === 1);
  return sorted.map((g) => buildBundleHtml(g, !allOne)).join('');
}

// ══════════════════════════════════════════════════════════════════════════════
// CONCEPTUAL VIEW
// ══════════════════════════════════════════════════════════════════════════════

function renderConceptualMatrix(ctx) {
  const { area, planning, orgs, levels, container } = ctx;

  let html = `
    <table class="w-full text-left matrix-table table-fixed">
      <thead>
        <tr class="bg-slate-100 border-b">
          <th class="p-4 text-xs font-bold text-slate-600 uppercase w-48">Concept / Organiser</th>
          ${levels.map((l) => `<th class="p-4 text-xs font-bold text-slate-600 uppercase">Level ${l.substring(1)}</th>`).join('')}
        </tr>
      </thead>
      <tbody class="divide-y">`;

  area.concepts.forEach((concept) => {
    // Concept descriptor row
    html += `
      <tr class="bg-indigo-50/20">
        <td class="p-4 align-top border-r bg-white font-black text-slate-900 text-sm uppercase">${escapeHtml(concept.title)}</td>
        ${levels.map((l) => `
          <td class="p-4 align-top border-r">
            <div class="p-3 bg-white rounded-lg border text-[11px] text-slate-700 leading-relaxed">${escapeHtml(concept.levels[l]) || 'N/A'}</div>
          </td>`).join('')}
      </tr>`;

    // Organiser sub-rows
    orgs.forEach((org) => {
      html += `
        <tr>
          <td class="p-4 py-3 border-r pl-8 bg-slate-50 font-bold text-slate-700 text-xs">${escapeHtml(org.name)}</td>
          ${levels.map((l) => {
            const m = planning.mappings[`${concept.title}_${org.name}_L${l.substring(1)}`] || { groups: [] };
            return `<td class="p-3 align-top border-r"><div class="space-y-2">${bundleCellHtml(m.groups)}</div></td>`;
          }).join('')}
        </tr>`;
    });
  });

  container.innerHTML = html + '</tbody></table>';
}

// ══════════════════════════════════════════════════════════════════════════════
// KNOW & DO VIEW
// ══════════════════════════════════════════════════════════════════════════════

function renderKnowDoMatrix(ctx) {
  const { area, planning, orgs, oFilter, levels, container } = ctx;
  const allOrgs = !oFilter; // true when "All Organisers" is selected

  let html = `
    <table class="w-full text-left matrix-table table-fixed">
      <thead>
        <tr class="bg-slate-100 border-b">
          <th class="p-4 text-xs font-bold text-slate-600 uppercase w-48">Concept${allOrgs ? ' / Organiser' : ''}</th>
          ${levels.map((l) => `<th class="p-4 text-xs font-bold text-slate-600 uppercase">Level ${l.substring(1)}</th>`).join('')}
        </tr>
      </thead>
      <tbody class="divide-y">`;

  area.concepts.forEach((concept) => {

    if (allOrgs) {
      // ── Concept header row (no level descriptions) ──
      html += `
        <tr class="bg-indigo-50/30">
          <td colspan="${levels.length + 1}" class="px-4 py-2 font-black text-slate-800 text-sm uppercase border-b border-indigo-100">
            ${escapeHtml(concept.title)}
          </td>
        </tr>`;

      // One sub-row per organiser
      orgs.forEach((org) => {
        // Skip organiser if it has no bundles across any selected level
        const hasAny = levels.some((l) => {
          const m = planning.mappings[`${concept.title}_${org.name}_L${l.substring(1)}`] || { groups: [] };
          return (m.groups || []).some((g) => hasContent(g));
        });
        if (!hasAny) return;

        html += `
          <tr>
            <td class="p-3 pl-8 align-top border-r bg-slate-50 text-xs font-bold text-slate-600">${escapeHtml(org.name)}</td>
            ${levels.map((l) => {
              const m = planning.mappings[`${concept.title}_${org.name}_L${l.substring(1)}`] || { groups: [] };
              const bundles = bundleCellHtml(m.groups);
              return `<td class="p-3 align-top border-r"><div class="space-y-2">${bundles || '<span class="text-[10px] text-slate-300">—</span>'}</div></td>`;
            }).join('')}
          </tr>`;
      });

    } else {
      // ── Single organiser: concept is the row, cells hold bundles directly ──
      const org = orgs[0];
      const hasAny = levels.some((l) => {
        const m = planning.mappings[`${concept.title}_${org.name}_L${l.substring(1)}`] || { groups: [] };
        return (m.groups || []).some((g) => hasContent(g));
      });

      html += `
        <tr class="${hasAny ? '' : 'opacity-40'}">
          <td class="p-4 align-top border-r bg-white font-black text-slate-900 text-sm uppercase">${escapeHtml(concept.title)}</td>
          ${levels.map((l) => {
            const m = planning.mappings[`${concept.title}_${org.name}_L${l.substring(1)}`] || { groups: [] };
            const bundles = bundleCellHtml(m.groups);
            return `<td class="p-3 align-top border-r"><div class="space-y-2">${bundles || '<span class="text-[10px] text-slate-300">—</span>'}</div></td>`;
          }).join('')}
        </tr>`;
    }
  });

  container.innerHTML = html + '</tbody></table>';
}

// ── Utility: does a bundle have any displayable content? ──────────────────────

function hasContent(g) {
  return (g.knowItems || []).some((k) => k.trim())
      || (g.doItems   || []).some((d) => d.trim());
}

// ── Main entry point ──────────────────────────────────────────────────────────

export function renderMatrix() {
  const ctx = getMatrixContext();
  if (!ctx) return;

  if (matrixViewMode === 'knowdo') {
    renderKnowDoMatrix(ctx);
  } else {
    renderConceptualMatrix(ctx);
  }

  triggerMath();
}

// ── Expose to window for inline onchange handlers ─────────────────────────────
window.updateMatrixFilters = updateMatrixFilters;
window.renderMatrix        = renderMatrix;
