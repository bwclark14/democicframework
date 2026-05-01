/**
 * matrix.js
 * Two view modes × two orientations:
 *
 *  Mode         | Normal (concepts as rows)          | Transposed (levels as rows)
 *  -------------|------------------------------------|---------------------------------
 *  conceptual   | concept row + desc + org sub-rows  | level row + desc + org sub-rows
 *  knowdo       | concept rows with bundle cells     | level rows with bundle cells
 *
 * Bundles are always sorted by sequenceTag then name.
 * Sequence badge suppressed when every bundle in a cell is tagged 1.
 * Linked bundles highlighted in teal.
 */

import { state, escapeHtml, triggerMath, LEVELS, levelByKey } from './state.js';

// ── Module state ──────────────────────────────────────────────────────────────

let matrixViewMode  = 'conceptual'; // 'conceptual' | 'knowdo'
let matrixTransposed = false;        // false = concepts as rows, true = levels as rows

// ── Mode / orientation toggles ────────────────────────────────────────────────

window.setMatrixViewMode = (mode) => {
  matrixViewMode = mode;
  document.getElementById('matrix-mode-conceptual').classList.toggle('active-mode', mode === 'conceptual');
  document.getElementById('matrix-mode-knowdo').classList.toggle('active-mode', mode === 'knowdo');
  renderMatrix();
};

window.setMatrixTransposed = (transposed) => {
  matrixTransposed = transposed;
  document.getElementById('matrix-orient-normal').classList.toggle('active-mode', !transposed);
  document.getElementById('matrix-orient-transposed').classList.toggle('active-mode', transposed);
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
  const isLinked = !!g.linkedFrom;
  const display  = isLinked ? resolveLinkedGroupForMatrix(g) ?? g : g;

  const comp     = state.competencyData.find((c) => c.id === (display.competencyId || g.competencyId));
  const tag      = g.sequenceTag ?? 1;
  const colCls   = seqColour(tag);
  const knowItems = (display.knowItems || []).filter((v) => v.trim());
  const doItems   = (display.doItems   || []).filter((v) => v.trim());
  const hasKnow  = knowItems.length > 0;
  const hasDo    = doItems.length > 0;
  const elaborations = (display.elaborations || []).filter((e) => e.trim());
  const hasElabs = elaborations.length > 0;
  const hasBody  = hasKnow || hasDo || comp;

  const borderCls = isLinked ? 'border-teal-300 ring-1 ring-teal-100' : 'border-slate-200';
  const bgTop     = isLinked ? 'bg-teal-50/40' : 'bg-slate-50/60';
  const bgBody    = isLinked ? 'bg-teal-50/20 border-teal-100' : 'bg-white border-slate-100';

  // Linked source attribution
  const linkedAttr = isLinked && g.linkedFrom ? `
    <div class="flex items-center gap-1 text-[8px] text-teal-600 font-semibold mt-1">
      <svg class="w-2.5 h-2.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>
      ${escapeHtml(getAreaTitle(g.linkedFrom.areaId))} — ${escapeHtml(g.linkedFrom.conceptTitle)}
    </div>` : '';

  // Know column
  const knowCol = hasKnow ? `
    <div class="flex-1 min-w-0">
      <span class="text-[8px] font-black text-indigo-400 uppercase tracking-widest block mb-1.5">Know</span>
      <ul class="space-y-1.5">
        ${knowItems.map((v) => `
          <li class="flex items-start gap-1.5 text-[11px] text-slate-700 leading-snug">
            <span class="mt-1 w-1.5 h-1.5 rounded-full bg-indigo-300 shrink-0"></span>
            <span>${escapeHtml(v)}</span>
          </li>`).join('')}
      </ul>
    </div>` : '';

  // Do column
  const doCol = hasDo ? `
    <div class="flex-1 min-w-0">
      <span class="text-[8px] font-black text-emerald-500 uppercase tracking-widest block mb-1.5">Do</span>
      <ul class="space-y-1.5">
        ${doItems.map((v) => `
          <li class="flex items-start gap-1.5 text-[11px] text-slate-700 font-medium leading-snug">
            <span class="mt-1 w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"></span>
            <span>${escapeHtml(v)}</span>
          </li>`).join('')}
      </ul>
    </div>` : '';

  // Vertical divider between Know and Do when both present
  const divider = hasKnow && hasDo
    ? `<div class="w-px bg-slate-200 self-stretch mx-1 shrink-0"></div>`
    : '';

  return `
    <div class="w-full border rounded-lg overflow-hidden bundle-card ${borderCls}">

      <!-- Bundle header: seq badge + name (click to toggle) + badges -->
      <div class="w-full px-3 pt-2.5 pb-2 ${bgTop} flex items-start gap-2">
        ${showSeqBadge
          ? `<span class="inline-flex items-center justify-center w-5 h-5 rounded border text-[9px] font-black ${colCls} shrink-0 mt-0.5">${tag}</span>`
          : ''}
        <div class="flex-1 min-w-0">
          ${hasBody
            ? `<button type="button" onclick="toggleBundle(this.closest('.bundle-card'))"
                class="group flex items-start gap-1 text-left w-full">
                <span class="text-[11px] font-bold text-slate-700 break-words leading-snug group-hover:text-indigo-600 transition-colors">${escapeHtml(display.name || g.name || 'Unnamed sub-strand')}</span>
                <svg class="w-3 h-3 text-slate-400 group-hover:text-indigo-400 rotate-icon expanded shrink-0 mt-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
              </button>`
            : `<span class="text-[11px] font-bold text-slate-700 break-words leading-snug">${escapeHtml(display.name || g.name || 'Unnamed sub-strand')}</span>`
          }
          ${linkedAttr}
        </div>
        ${isLinked
          ? `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 bg-teal-50 border border-teal-200 rounded text-[8px] font-black text-teal-600 uppercase tracking-widest shrink-0">
               <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>
               Linked
             </span>`
          : ''}
        ${hasElabs
          ? `<button type="button"
              onclick="event.stopPropagation(); showElaborations(${JSON.stringify(elaborations)}, ${JSON.stringify(display.name || g.name || '')})"
              class="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 border border-amber-200 rounded text-[8px] font-black text-amber-600 uppercase tracking-widest shrink-0 hover:bg-amber-100 transition">
              <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              ${elaborations.length} elaboration${elaborations.length === 1 ? '' : 's'}
            </button>`
          : ''}
      </div>

      <!-- Bundle body: Know and Do side by side, collapsible -->
      ${hasBody ? `
      <div class="bundle-body collapse-content">
        <div class="border-t ${bgBody} px-3 py-2.5">
          ${comp ? `<div class="mb-2"><button onclick="showCompInfo('${comp.id}')" class="text-[8px] font-bold text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded border border-violet-100 uppercase hover:bg-violet-100 transition">${escapeHtml(comp.title)}</button></div>` : ''}
          <div class="flex gap-3">
            ${knowCol}
            ${divider}
            ${doCol}
          </div>
        </div>
      </div>` : ''}
    </div>`;
}

function resolveLinkedGroupForMatrix(group) {
  if (!group.linkedFrom) return null;
  const { areaId, conceptTitle, organiserName, level, bundleIndex } = group.linkedFrom;
  const planning = state.allPlanningData[areaId];
  if (!planning?.mappings) return null;
  return planning.mappings[`${conceptTitle}_${organiserName}_L${level}`]?.groups?.[bundleIndex] ?? null;
}

function getAreaTitle(areaId) {
  return state.curriculumData.find((a) => a.id === areaId)?.title || 'Unknown area';
}

// ── Toggle bundle collapse ────────────────────────────────────────────────────

window.toggleBundle = (card) => {
  const body = card?.querySelector('.bundle-body');
  const icon = card?.querySelector('.rotate-icon');
  if (body) body.classList.toggle('expanded');
  if (icon) icon.classList.toggle('expanded');
};

// ── Filter dropdowns ──────────────────────────────────────────────────────────

export function updateMatrixFilters() {
  const areaId  = document.getElementById('matrix-area-select').value;
  const oSelect = document.getElementById('matrix-organiser-select');
  const cList   = document.getElementById('matrix-concept-list');

  if (!areaId) { renderMatrix(); return; }

  const area = state.curriculumData.find((a) => a.id === areaId);
  if (!area) return;

  oSelect.innerHTML =
    '<option value="">All Organisers</option>' +
    (area.organisers || []).map((o) => `<option value="${escapeHtml(o.name)}">${escapeHtml(o.name)}</option>`).join('');

  const prev = new Set(Array.from(document.querySelectorAll('.matrix-concept-cb:checked')).map((cb) => cb.value));
  cList.innerHTML = (area.concepts || []).map((c) => `
    <label class="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg cursor-pointer hover:border-indigo-400 transition text-xs font-medium text-slate-700 select-none">
      <input type="checkbox" class="matrix-concept-cb rounded text-indigo-600"
        value="${escapeHtml(c.title)}"
        ${prev.size === 0 || prev.has(c.title) ? 'checked' : ''}
        onchange="renderMatrix()">
      ${escapeHtml(c.title)}
    </label>`).join('');
  document.getElementById('matrix-concept-filter-row').classList.remove('hidden');

  renderMatrix();
}

// ── Shared context builder ────────────────────────────────────────────────────

function getMatrixContext() {
  const areaId  = document.getElementById('matrix-area-select').value;
  const oFilter = document.getElementById('matrix-organiser-select').value;
  const levels  = Array.from(document.querySelectorAll('.matrix-level-cb:checked')).map((cb) => cb.value);
  const selectedConcepts = new Set(Array.from(document.querySelectorAll('.matrix-concept-cb:checked')).map((cb) => cb.value));
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
  const concepts = selectedConcepts.size > 0
    ? (area.concepts || []).filter((c) => selectedConcepts.has(c.title))
    : (area.concepts || []);

  return { area, concepts, planning, orgs, oFilter, levels, container };
}

// ── Bundle cell helper ────────────────────────────────────────────────────────

function bundleCellHtml(groups) {
  const sorted = [...(groups || [])].sort((a, b) => {
    const d = (a.sequenceTag ?? 1) - (b.sequenceTag ?? 1);
    return d !== 0 ? d : (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
  });
  const allOne = sorted.every((g) => (g.sequenceTag ?? 1) === 1);
  return sorted.map((g) => buildBundleHtml(g, !allOne)).join('');
}

// ── Reusable cell renderers ───────────────────────────────────────────────────

/** Returns a <td> with the concept-level description, or a "not applicable" cell. */
function descCell(concept, l, extraCls = '') {
  const applicable = new Set(concept.applicableLevels ?? LEVELS.map((lv) => lv.key));
  if (!applicable.has(l)) {
    return `<td class="p-3 align-top border-r border-slate-200 last:border-r-0 bg-slate-50/50 ${extraCls}"><span class="text-[9px] text-slate-300 italic">Not applicable</span></td>`;
  }
  return `<td class="p-3 align-top border-r border-slate-200 last:border-r-0 ${extraCls}"><p class="text-xs text-slate-600 leading-relaxed">${escapeHtml(concept.levels[l]) || '<span class="text-slate-300 italic">—</span>'}</p></td>`;
}

/** Returns a <td> with sorted bundles for a concept × organiser × level cell.
 *  Common bundles (key _ALL_) are shown first with a teal divider. */
function bundleCell(concept, org, l, planning, extraCls = '') {
  const applicable = new Set(concept.applicableLevels ?? LEVELS.map((lv) => lv.key));
  if (!applicable.has(l)) {
    return `<td class="p-3 align-top border-r border-slate-100 last:border-r-0 bg-slate-50/30 ${extraCls}"></td>`;
  }
  const lNum = levelByKey(l).plannerNum;

  // Common bundles (ALL key)
  const commonM   = planning.mappings[`${concept.title}_ALL_L${lNum}`] || { groups: [] };
  const commonHtml = bundleCellHtml(commonM.groups);

  // Organiser-specific bundles
  const specificM  = planning.mappings[`${concept.title}_${org.name}_L${lNum}`] || { groups: [] };
  const specificHtml = bundleCellHtml(specificM.groups);

  const hasCommon   = commonM.groups.length > 0;
  const hasSpecific = specificM.groups.length > 0;

  if (!hasCommon && !hasSpecific) {
    return `<td class="p-3 align-top border-r border-slate-100 last:border-r-0 ${extraCls}"></td>`;
  }

  let inner = '';
  if (hasCommon) {
    inner += `<div class="space-y-2">${commonHtml}</div>`;
    if (hasSpecific) {
      inner += `<div class="flex items-center gap-2 my-2">
        <div class="flex-1 border-t border-teal-100"></div>
        <span class="text-[8px] font-black text-teal-500 uppercase tracking-widest shrink-0">${escapeHtml(org.name)}</span>
        <div class="flex-1 border-t border-teal-100"></div>
      </div>`;
    }
  }
  if (hasSpecific) {
    inner += `<div class="space-y-2">${specificHtml}</div>`;
  }

  return `<td class="p-3 align-top border-r border-slate-100 last:border-r-0 ${extraCls}">${inner}</td>`;
}

/** Returns merged HTML combining common + organiser-specific bundles. */
function mergedBundlesHtml(concept, orgName, l, planning) {
  const lNum = levelByKey(l).plannerNum;
  const commonM    = planning.mappings[`${concept.title}_ALL_L${lNum}`] || { groups: [] };
  const specificM  = planning.mappings[`${concept.title}_${orgName}_L${lNum}`] || { groups: [] };
  const commonHtml   = bundleCellHtml(commonM.groups);
  const specificHtml = bundleCellHtml(specificM.groups);
  const hasCommon   = commonM.groups.length > 0;
  const hasSpecific = specificM.groups.length > 0;
  if (!hasCommon && !hasSpecific) return '<span class="text-[10px] text-slate-300">—</span>';
  let html = '';
  if (hasCommon)   { html += `<div class="space-y-2">${commonHtml}</div>`; }
  if (hasCommon && hasSpecific) {
    html += `<div class="flex items-center gap-2 my-2">
      <div class="flex-1 border-t border-teal-100"></div>
      <span class="text-[8px] font-black text-teal-500 uppercase tracking-widest shrink-0">${escapeHtml(orgName)}</span>
      <div class="flex-1 border-t border-teal-100"></div>
    </div>`;
  }
  if (hasSpecific) { html += `<div class="space-y-2">${specificHtml}</div>`; }
  return html;
}
// ════════════════════════════════════════════════════════════════════════════

function renderConceptualNormal(ctx) {
  const { concepts, planning, orgs, levels, container } = ctx;

  const toolbar = collapseToolbar();

  let html = `<table class="w-full text-left matrix-table table-fixed border-collapse">
    <thead><tr>
      <th class="p-3 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-r border-slate-200 bg-slate-50 w-44">Concept</th>
      ${levels.map((l) => `<th class="p-3 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-r border-slate-200 bg-slate-50 last:border-r-0">${levelByKey(l).label}</th>`).join('')}
    </tr></thead>
    <tbody>`;

  concepts.forEach((concept, cIdx) => {
    const collapseId = `concept-rows-${cIdx}`;
    html += `
      <tr class="border-t-2 border-indigo-200 bg-indigo-50/30">
        <td class="p-3 align-top border-r border-slate-200">
          <button onclick="toggleConceptRows('${collapseId}', this)" class="flex items-start gap-2 w-full text-left">
            <svg class="w-4 h-4 text-indigo-400 rotate-icon expanded shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
            <span class="font-black text-slate-800 text-sm uppercase tracking-tight leading-snug">${escapeHtml(concept.title)}</span>
          </button>
        </td>
        ${levels.map((l) => descCell(concept, l)).join('')}
      </tr>`;

    orgs.forEach((org) => {
      html += `
        <tr class="concept-collapsible-row border-t border-slate-100 hover:bg-slate-50/40" data-collapse-id="${collapseId}">
          <td class="p-3 pl-8 align-top border-r border-slate-100 bg-slate-50/60"><span class="text-xs font-semibold text-slate-500">${escapeHtml(org.name)}</span></td>
          ${levels.map((l) => bundleCell(concept, org, l, planning)).join('')}
        </tr>`;
    });
  });

  container.innerHTML = toolbar + html + '</tbody></table>';
}

// ════════════════════════════════════════════════════════════════════════════
// CONCEPTUAL — TRANSPOSED  (rows = levels, cols = concepts)
// ════════════════════════════════════════════════════════════════════════════

function renderConceptualTransposed(ctx) {
  const { concepts, planning, orgs, levels, container } = ctx;

  const toolbar = collapseToolbar();

  let html = `<table class="w-full text-left matrix-table table-fixed border-collapse">
    <thead><tr>
      <th class="p-3 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-r border-slate-200 bg-slate-50 w-36">Level</th>
      ${concepts.map((c) => `<th class="p-3 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-r border-slate-200 bg-slate-50 last:border-r-0">${escapeHtml(c.title)}</th>`).join('')}
    </tr></thead>
    <tbody>`;

  levels.forEach((l, lIdx) => {
    const collapseId = `level-rows-${lIdx}`;
    const lv = levelByKey(l);

    // Level header row — always visible, contains the level description per concept
    html += `
      <tr class="border-t-2 border-indigo-200 bg-indigo-50/30">
        <td class="p-3 align-top border-r border-slate-200">
          <button onclick="toggleConceptRows('${collapseId}', this)" class="flex items-start gap-2 w-full text-left">
            <svg class="w-4 h-4 text-indigo-400 rotate-icon expanded shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
            <span class="font-black text-slate-800 text-sm uppercase tracking-tight leading-snug">${lv.label}</span>
          </button>
        </td>
        ${concepts.map((concept) => descCell(concept, l)).join('')}
      </tr>`;

    // Organiser sub-rows — collapsible
    orgs.forEach((org) => {
      html += `
        <tr class="concept-collapsible-row border-t border-slate-100 hover:bg-slate-50/40" data-collapse-id="${collapseId}">
          <td class="p-3 pl-8 align-top border-r border-slate-100 bg-slate-50/60"><span class="text-xs font-semibold text-slate-500">${escapeHtml(org.name)}</span></td>
          ${concepts.map((concept) => bundleCell(concept, org, l, planning)).join('')}
        </tr>`;
    });
  });

  container.innerHTML = toolbar + html + '</tbody></table>';
}

// ════════════════════════════════════════════════════════════════════════════
// KNOW & DO — NORMAL  (rows = concepts, cols = levels)
// ════════════════════════════════════════════════════════════════════════════

function renderKnowDoNormal(ctx) {
  const { concepts, planning, orgs, oFilter, levels, container } = ctx;
  const allOrgs = !oFilter;

  let html = `<table class="w-full text-left matrix-table table-fixed border-collapse">
    <thead><tr>
      <th class="p-3 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-r border-slate-200 bg-slate-50 w-44">${allOrgs ? 'Strand / Organiser' : 'Concept'}</th>
      ${levels.map((l) => `<th class="p-3 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-r border-slate-200 bg-slate-50 last:border-r-0">${levelByKey(l).label}</th>`).join('')}
    </tr></thead>
    <tbody class="divide-y">`;

  concepts.forEach((concept) => {
    const applicable = new Set(concept.applicableLevels ?? LEVELS.map((lv) => lv.key));

    if (allOrgs) {
      html += `<tr class="bg-indigo-50/30">
        <td colspan="${levels.length + 1}" class="px-4 py-2 font-black text-slate-800 text-sm uppercase border-b border-indigo-100">${escapeHtml(concept.title)}</td>
      </tr>`;
      orgs.forEach((org) => {
        const hasAny = levels.some((l) => {
          if (!applicable.has(l)) return false;
          const lNum = levelByKey(l).plannerNum;
          const cm = planning.mappings[`${concept.title}_ALL_L${lNum}`] || { groups: [] };
          const sm = planning.mappings[`${concept.title}_${org.name}_L${lNum}`] || { groups: [] };
          return [...cm.groups, ...sm.groups].some((g) => hasContent(g));
        });
        if (!hasAny) return;
        html += `<tr>
          <td class="p-3 pl-8 align-top border-r bg-slate-50 text-xs font-bold text-slate-600">${escapeHtml(org.name)}</td>
          ${levels.map((l) => {
            if (!applicable.has(l)) return `<td class="p-3 align-top border-r bg-slate-50/40"></td>`;
            return `<td class="p-3 align-top border-r"><div class="space-y-2">${mergedBundlesHtml(concept, org.name, l, planning)}</div></td>`;
          }).join('')}
        </tr>`;
      });
    } else {
      const org = orgs[0];
      const hasAny = levels.some((l) => {
        if (!applicable.has(l)) return false;
        const m = planning.mappings[`${concept.title}_${org.name}_L${levelByKey(l).plannerNum}`] || { groups: [] };
        return (m.groups || []).some((g) => hasContent(g));
      });
      html += `<tr class="${hasAny ? '' : 'opacity-40'}">
        <td class="p-4 align-top border-r bg-white font-black text-slate-900 text-sm uppercase">${escapeHtml(concept.title)}</td>
        ${levels.map((l) => {
          if (!applicable.has(l)) return `<td class="p-3 align-top border-r bg-slate-50/40"><span class="text-[9px] text-slate-300 italic">Not applicable</span></td>`;
          return `<td class="p-3 align-top border-r"><div class="space-y-2">${mergedBundlesHtml(concept, org.name, l, planning)}</div></td>`;
        }).join('')}
      </tr>`;
    }
  });

  container.innerHTML = html + '</tbody></table>';
}

// ════════════════════════════════════════════════════════════════════════════
// KNOW & DO — TRANSPOSED  (rows = levels, cols = concepts)
// ════════════════════════════════════════════════════════════════════════════

function renderKnowDoTransposed(ctx) {
  const { concepts, planning, orgs, oFilter, levels, container } = ctx;
  const allOrgs = !oFilter;

  let html = `<table class="w-full text-left matrix-table table-fixed border-collapse">
    <thead><tr>
      <th class="p-3 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-r border-slate-200 bg-slate-50 w-36">${allOrgs ? 'Level / Organiser' : 'Level'}</th>
      ${concepts.map((c) => `<th class="p-3 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-r border-slate-200 bg-slate-50 last:border-r-0">${escapeHtml(c.title)}</th>`).join('')}
    </tr></thead>
    <tbody class="divide-y">`;

  levels.forEach((l) => {
    const lv = levelByKey(l);

    if (allOrgs) {
      html += `<tr class="bg-indigo-50/30">
        <td colspan="${concepts.length + 1}" class="px-4 py-2 font-black text-slate-800 text-sm uppercase border-b border-indigo-100">${lv.label}</td>
      </tr>`;
      orgs.forEach((org) => {
        const hasAny = concepts.some((concept) => {
          const applicable = new Set(concept.applicableLevels ?? LEVELS.map((lv2) => lv2.key));
          if (!applicable.has(l)) return false;
          const cm = planning.mappings[`${concept.title}_ALL_L${lv.plannerNum}`] || { groups: [] };
          const sm = planning.mappings[`${concept.title}_${org.name}_L${lv.plannerNum}`] || { groups: [] };
          return [...cm.groups, ...sm.groups].some((g) => hasContent(g));
        });
        if (!hasAny) return;
        html += `<tr>
          <td class="p-3 pl-8 align-top border-r bg-slate-50 text-xs font-bold text-slate-600">${escapeHtml(org.name)}</td>
          ${concepts.map((concept) => {
            const applicable = new Set(concept.applicableLevels ?? LEVELS.map((lv2) => lv2.key));
            if (!applicable.has(l)) return `<td class="p-3 align-top border-r bg-slate-50/40"></td>`;
            return `<td class="p-3 align-top border-r"><div class="space-y-2">${mergedBundlesHtml(concept, org.name, l, planning)}</div></td>`;
          }).join('')}
        </tr>`;
      });
    } else {
      const org = orgs[0];
      const hasAny = concepts.some((concept) => {
        const applicable = new Set(concept.applicableLevels ?? LEVELS.map((lv2) => lv2.key));
        if (!applicable.has(l)) return false;
        const m = planning.mappings[`${concept.title}_${org.name}_L${lv.plannerNum}`] || { groups: [] };
        return (m.groups || []).some((g) => hasContent(g));
      });
      html += `<tr class="${hasAny ? '' : 'opacity-40'}">
        <td class="p-4 align-top border-r bg-white font-black text-slate-900 text-sm uppercase">${lv.label}</td>
        ${concepts.map((concept) => {
          const applicable = new Set(concept.applicableLevels ?? LEVELS.map((lv2) => lv2.key));
          if (!applicable.has(l)) return `<td class="p-3 align-top border-r bg-slate-50/40"><span class="text-[9px] text-slate-300 italic">Not applicable</span></td>`;
          return `<td class="p-3 align-top border-r"><div class="space-y-2">${mergedBundlesHtml(concept, org.name, l, planning)}</div></td>`;
        }).join('')}
      </tr>`;
    }
  });

  container.innerHTML = html + '</tbody></table>';
}

// ── Collapse toolbar (only used in conceptual views) ──────────────────────────

function collapseToolbar() {
  return `
    <div class="flex items-center justify-end px-3 py-2 border-b border-slate-200 bg-slate-50/60">
      <button onclick="toggleAllConceptRows(true)"
        class="text-[11px] font-semibold text-slate-500 hover:text-slate-700 px-2.5 py-1 rounded hover:bg-slate-100 transition flex items-center gap-1.5">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
        Expand all
      </button>
      <span class="text-slate-300 mx-1">|</span>
      <button onclick="toggleAllConceptRows(false)"
        class="text-[11px] font-semibold text-slate-500 hover:text-slate-700 px-2.5 py-1 rounded hover:bg-slate-100 transition flex items-center gap-1.5">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"/></svg>
        Collapse all
      </button>
    </div>`;
}

// ── Collapse toggle handlers ──────────────────────────────────────────────────

window.toggleConceptRows = (collapseId, btn) => {
  const rows = document.querySelectorAll(`.concept-collapsible-row[data-collapse-id="${collapseId}"]`);
  const icon = btn.querySelector('.rotate-icon');
  const isExpanded = icon.classList.contains('expanded');
  rows.forEach((r) => { r.style.display = isExpanded ? 'none' : ''; });
  icon.classList.toggle('expanded', !isExpanded);
};

window.toggleAllConceptRows = (expand) => {
  document.querySelectorAll('.concept-collapsible-row').forEach((r) => { r.style.display = expand ? '' : 'none'; });
  document.querySelectorAll('#matrix-container .rotate-icon').forEach((icon) => {
    icon.classList.toggle('expanded', expand);
  });
};

// ── Utility ───────────────────────────────────────────────────────────────────

function hasContent(g) {
  return (g.knowItems || []).some((k) => k.trim()) || (g.doItems || []).some((d) => d.trim());
}

// ── Main entry point ──────────────────────────────────────────────────────────

export function renderMatrix() {
  const ctx = getMatrixContext();
  if (!ctx) return;

  if (matrixViewMode === 'knowdo') {
    matrixTransposed ? renderKnowDoTransposed(ctx) : renderKnowDoNormal(ctx);
  } else {
    matrixTransposed ? renderConceptualTransposed(ctx) : renderConceptualNormal(ctx);
  }

  triggerMath();
}

// ── Elaboration overlay ───────────────────────────────────────────────────────

window.showElaborations = (elaborations, bundleName) => {
  const modal    = document.getElementById('elaboration-modal');
  const title    = document.getElementById('elaboration-modal-title');
  const subtitle = document.getElementById('elaboration-modal-subtitle');
  const content  = document.getElementById('elaboration-modal-content');
  if (!modal) return;
  title.textContent    = escapeHtmlStr(bundleName) || 'Sub-Strand Elaborations';
  subtitle.textContent = `${elaborations.length} elaboration${elaborations.length === 1 ? '' : 's'}`;
  content.innerHTML    = elaborations.map((e, i) => `
    <div class="flex items-start gap-3 bg-amber-50/60 border border-amber-100 rounded-lg p-3">
      <span class="text-[10px] font-black text-amber-400 uppercase tracking-widest mt-0.5 shrink-0">${i + 1}</span>
      <p class="text-sm text-slate-700 leading-relaxed">${escapeHtmlStr(e)}</p>
    </div>`).join('');
  modal.classList.remove('hidden');
};

window.closeElaborationModal = () => {
  document.getElementById('elaboration-modal')?.classList.add('hidden');
};

// Close on backdrop click
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('elaboration-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) window.closeElaborationModal();
  });
});

function escapeHtmlStr(text) {
  const d = document.createElement('div');
  d.textContent = text || '';
  return d.innerHTML;
}

// ── Expose to window for inline onchange handlers ─────────────────────────────
window.updateMatrixFilters = updateMatrixFilters;
window.renderMatrix        = renderMatrix;
