/**
 * explorer.js
 * Level Explorer view: select area → organiser → level → concepts,
 * then renders a matrix with sequence numbers (1/2/3) as columns
 * and selected concepts as rows, with collapsible bundles in each cell.
 */

import { state, escapeHtml, triggerMath } from './state.js';
import { buildBundleHtml }               from './matrix.js';

// ── Step cascade ──────────────────────────────────────────────────────────────

window.explorerAreaChanged = () => {
  const areaId = document.getElementById('explorer-area-select').value;

  // Reset downstream selects and output
  ['explorer-organiser-row', 'explorer-level-row', 'explorer-concepts-row', 'explorer-output'].forEach((id) => {
    document.getElementById(id).classList.add('hidden');
  });
  document.getElementById('explorer-run-btn').classList.add('hidden');

  if (!areaId) return;
  const area = state.curriculumData.find((a) => a.id === areaId);
  if (!area) return;

  const oSel = document.getElementById('explorer-organiser-select');
  oSel.innerHTML = '<option value="">Choose an organiser…</option>' +
    (area.organisers || []).map((o) =>
      `<option value="${escapeHtml(o.name)}">${escapeHtml(o.name)}</option>`
    ).join('');
  document.getElementById('explorer-organiser-row').classList.remove('hidden');
};

window.explorerOrganiserChanged = () => {
  const orgVal = document.getElementById('explorer-organiser-select').value;
  ['explorer-level-row', 'explorer-concepts-row', 'explorer-output'].forEach((id) => {
    document.getElementById(id).classList.add('hidden');
  });
  document.getElementById('explorer-run-btn').classList.add('hidden');
  if (!orgVal) return;
  document.getElementById('explorer-level-row').classList.remove('hidden');
};

window.explorerLevelChanged = () => {
  const level  = document.getElementById('explorer-level-select').value;
  const areaId = document.getElementById('explorer-area-select').value;
  ['explorer-concepts-row', 'explorer-output'].forEach((id) => {
    document.getElementById(id).classList.add('hidden');
  });
  document.getElementById('explorer-run-btn').classList.add('hidden');
  if (!level || !areaId) return;

  const area = state.curriculumData.find((a) => a.id === areaId);
  if (!area) return;

  const container = document.getElementById('explorer-concepts-list');
  container.innerHTML = (area.concepts || []).map((c, i) => `
    <label class="flex items-center gap-2 px-3 py-2 bg-white border rounded-lg cursor-pointer hover:border-indigo-400 transition">
      <input type="checkbox" class="explorer-concept-cb rounded text-indigo-600" value="${escapeHtml(c.title)}">
      <span class="text-sm font-medium text-slate-700">${escapeHtml(c.title)}</span>
    </label>`).join('');

  document.getElementById('explorer-concepts-row').classList.remove('hidden');
  document.getElementById('explorer-run-btn').classList.remove('hidden');
};

window.runExplorer = () => {
  const areaId = document.getElementById('explorer-area-select').value;
  const org    = document.getElementById('explorer-organiser-select').value;
  const level  = document.getElementById('explorer-level-select').value;
  const selectedConcepts = Array.from(
    document.querySelectorAll('.explorer-concept-cb:checked')
  ).map((cb) => cb.value);

  const output = document.getElementById('explorer-output');

  if (!areaId || !org || !level || selectedConcepts.length === 0) {
    output.innerHTML = '<p class="text-slate-400 text-sm italic">Select at least one concept to view the explorer.</p>';
    output.classList.remove('hidden');
    return;
  }

  const area     = state.curriculumData.find((a) => a.id === areaId);
  const planning = state.allPlanningData[areaId] || { mappings: {} };
  const SEQ_TAGS = [1, 2, 3];

  // For each concept × sequence tag, collect matching bundles
  const rows = selectedConcepts.map((conceptTitle) => {
    const concept = area?.concepts.find((c) => c.title === conceptTitle);
    const key     = `${conceptTitle}_${org}_L${level}`;
    const m       = planning.mappings[key] || { groups: [] };

    const cells = SEQ_TAGS.map((tag) => {
      const bundles = (m.groups || []).filter((g) => (g.sequenceTag ?? 1) === tag);
      return bundles.map((g, i) => buildBundleHtml(g, `ex-${conceptTitle}-${tag}-${i}`)).join('') ||
        '<span class="text-[10px] text-slate-300 italic">—</span>';
    });

    return { conceptTitle, levelDesc: concept?.levels[`l${level}`] || '', cells };
  });

  const seqColours = [
    'bg-indigo-50 text-indigo-700',
    'bg-amber-50 text-amber-700',
    'bg-emerald-50 text-emerald-700',
  ];

  let html = `
    <div class="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
      <table class="w-full text-left table-fixed">
        <thead>
          <tr class="border-b">
            <th class="p-4 text-xs font-bold text-slate-600 uppercase w-52 bg-slate-50">Concept</th>
            ${SEQ_TAGS.map((t, i) => `
              <th class="p-4 text-xs font-bold uppercase ${seqColours[i]}">
                <span class="inline-flex items-center gap-1.5">
                  <span class="w-5 h-5 rounded border inline-flex items-center justify-center font-black text-[10px] ${seqColours[i]} border-current">${t}</span>
                  Sequence ${t}
                </span>
              </th>`).join('')}
          </tr>
        </thead>
        <tbody class="divide-y">
          ${rows.map((row) => `
            <tr>
              <td class="p-4 align-top border-r bg-white">
                <div class="font-bold text-slate-800 text-sm mb-1">${escapeHtml(row.conceptTitle)}</div>
                ${row.levelDesc ? `<div class="text-[10px] text-slate-500 italic leading-relaxed">${escapeHtml(row.levelDesc)}</div>` : ''}
              </td>
              ${row.cells.map((cell) => `
                <td class="p-3 align-top border-r">
                  <div class="space-y-2">${cell}</div>
                </td>`).join('')}
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  output.innerHTML = html;
  output.classList.remove('hidden');
  triggerMath();
};

// ── Dropdown population (called when area data changes) ───────────────────────

export function updateExplorerDropdown() {
  const sel  = document.getElementById('explorer-area-select');
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = '<option value="">Choose an area…</option>' +
    state.curriculumData
      .filter((a) => (a.status || 'public') === 'public')
      .map((a) => `<option value="${a.id}">${escapeHtml(a.title)}</option>`)
      .join('');
  sel.value = prev;
}

export function renderExplorer() {
  updateExplorerDropdown();
  // Re-run if filters are already set
  const areaId = document.getElementById('explorer-area-select').value;
  if (areaId) runExplorer();
}

// ── Expose to window ──────────────────────────────────────────────────────────
window.renderExplorer = renderExplorer;
