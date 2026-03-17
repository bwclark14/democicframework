/**
 * matrix.js
 * Renders the progression matrix table for a selected curriculum area.
 */

import { state, escapeHtml, triggerMath } from './state.js';

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

// ── Table renderer ────────────────────────────────────────────────────────────

export function renderMatrix() {
  const areaId  = document.getElementById('matrix-area-select').value;
  const oFilter = document.getElementById('matrix-organiser-select').value;
  const levels  = Array.from(document.querySelectorAll('.matrix-level-cb:checked')).map(
    (cb) => cb.value,
  );
  const container = document.getElementById('matrix-container');

  if (!areaId) {
    container.innerHTML =
      '<div class="py-20 text-center text-slate-400">Select an area to view the progression matrix.</div>';
    return;
  }

  const area = state.curriculumData.find((a) => a.id === areaId);
  if (!area || (area.status || 'public') === 'draft') {
    container.innerHTML =
      '<div class="py-20 text-center text-slate-400">This area is currently a draft and cannot be viewed in the matrix.</div>';
    return;
  }

  const planning = state.allPlanningData[areaId] || { mappings: {} };

  let html = `
    <table class="w-full text-left matrix-table table-fixed">
      <thead>
        <tr class="bg-slate-100 border-b">
          <th class="p-4 text-xs font-bold text-slate-600 uppercase w-48">Concept / Organiser</th>
          ${levels
            .map(
              (l) =>
                `<th class="p-4 text-xs font-bold text-slate-600 uppercase">Level ${l.substring(1)}</th>`,
            )
            .join('')}
        </tr>
      </thead>
      <tbody class="divide-y">`;

  area.concepts.forEach((concept) => {
    // Concept row (level descriptions)
    html += `
      <tr class="bg-indigo-50/20">
        <td class="p-4 align-top border-r bg-white font-black text-slate-900 text-sm uppercase">${escapeHtml(concept.title)}</td>
        ${levels
          .map(
            (l) => `
          <td class="p-4 align-top border-r">
            <div class="p-3 bg-white rounded-lg border text-[11px] text-slate-700 leading-relaxed">${escapeHtml(concept.levels[l]) || 'N/A'}</div>
          </td>`,
          )
          .join('')}
      </tr>`;

    // Organiser rows (planning bundles)
    const orgs = oFilter
      ? [area.organisers.find((o) => o.name === oFilter)]
      : area.organisers || [];

    orgs.filter(Boolean).forEach((org) => {
      html += `
        <tr>
          <td class="p-4 py-3 border-r pl-8 bg-slate-50 font-bold text-slate-700 text-xs">${escapeHtml(org.name)}</td>
          ${levels
            .map((l) => {
              const m = planning.mappings[`${concept.title}_${org.name}_L${l.substring(1)}`] || { groups: [] };
              return `
              <td class="p-4 py-3 align-top border-r">
                <div class="space-y-4">
                  ${(m.groups || [])
                    .map((g) => {
                      const comp = state.competencyData.find((c) => c.id === g.competencyId);
                      return `
                      <div class="border-l-2 border-slate-200 pl-3 py-1 space-y-2">
                        <div class="flex items-center gap-2 flex-wrap">
                          ${g.name ? `<span class="text-[10px] font-bold text-indigo-700">${escapeHtml(g.name)}</span>` : ''}
                          ${comp ? `<button onclick="showCompInfo('${comp.id}')" class="text-[8px] font-bold text-violet-600 bg-violet-50 px-1.5 rounded border border-violet-100 uppercase hover:bg-violet-100 transition">${escapeHtml(comp.title)}</button>` : ''}
                        </div>
                        ${
                          (g.knowItems || []).some((k) => k.trim())
                            ? `
                        <div>
                          <span class="text-[8px] font-bold text-indigo-400 uppercase tracking-tighter block">Know:</span>
                          <ul class="list-disc list-outside ml-3 text-[10px] text-slate-700 space-y-1">
                            ${g.knowItems.filter((v) => v.trim()).map((v) => `<li>${escapeHtml(v)}</li>`).join('')}
                          </ul>
                        </div>`
                            : ''
                        }
                        ${
                          (g.doItems || []).some((d) => d.trim())
                            ? `
                        <div>
                          <span class="text-[8px] font-bold text-emerald-400 uppercase tracking-tighter block">Do:</span>
                          <ul class="list-disc list-outside ml-3 text-[10px] text-slate-700 font-medium space-y-1">
                            ${g.doItems.filter((v) => v.trim()).map((v) => `<li>${escapeHtml(v)}</li>`).join('')}
                          </ul>
                        </div>`
                            : ''
                        }
                      </div>`;
                    })
                    .join('')}
                </div>
              </td>`;
            })
            .join('')}
        </tr>`;
    });
  });

  container.innerHTML = html + '</tbody></table>';
  triggerMath();
}
