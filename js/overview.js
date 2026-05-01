/**
 * overview.js
 * Renders the read-only Overview page for a selected curriculum area.
 */

import { state, escapeHtml, triggerMath, LEVELS } from './state.js';

export function renderOverview() {
  const areaId    = document.getElementById('overview-area-select').value;
  const container = document.getElementById('overview-content');

  if (!areaId) {
    container.innerHTML =
      '<div class="py-20 text-center text-slate-400">Select a curriculum area to generate the overview.</div>';
    return;
  }

  const area = state.curriculumData.find((a) => a.id === areaId);
  if (!area || (area.status || 'public') === 'draft') {
    container.innerHTML =
      '<div class="py-20 text-center text-slate-400">This area is currently a draft and cannot be viewed in the overview.</div>';
    return;
  }

  // Gather competency IDs referenced by any planning bundle in this area
  const planning    = state.allPlanningData[areaId] || { mappings: {} };
  const usedCompIds = new Set();
  if (planning.mappings) {
    Object.values(planning.mappings).forEach((m) => {
      if (m?.groups) {
        m.groups.forEach((g) => { if (g?.competencyId) usedCompIds.add(g.competencyId); });
      }
    });
  }
  const relevantCompetencies = state.competencyData.filter((c) => usedCompIds.has(c.id));

  container.innerHTML = `
    <section class="space-y-6">
      <div class="space-y-2">
        <h2 class="text-4xl font-extrabold text-slate-900 border-l-4 border-indigo-600 pl-4">${escapeHtml(area.title)}</h2>
        <p class="text-xs font-bold text-slate-400 uppercase tracking-widest pl-5">Curriculum Area Overview</p>
      </div>
      <div class="bg-indigo-50/50 p-6 rounded-2xl border border-indigo-100/50">
        <h4 class="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2">Rationale</h4>
        <p class="text-slate-800 leading-relaxed italic text-lg">"${escapeHtml(area.rationale)}"</p>
      </div>
    </section>

    ${
      relevantCompetencies.length > 0
        ? `
    <section class="space-y-4">
      <h3 class="text-xl font-bold text-slate-800 flex items-center gap-2">
        <span class="p-1.5 bg-violet-100 text-violet-600 rounded-lg">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
        </span>
        Core Competencies
      </h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        ${relevantCompetencies
          .map(
            (c) => `
          <div onclick="showCompInfo('${c.id}')" class="p-4 bg-white border border-slate-100 rounded-xl shadow-sm hover:border-violet-300 hover:shadow-md transition cursor-pointer group">
            <h4 class="font-bold text-violet-700 text-sm mb-1 group-hover:text-violet-800">${escapeHtml(c.title)}</h4>
            <p class="text-xs text-slate-600">${escapeHtml(c.description)}</p>
          </div>`,
          )
          .join('')}
      </div>
    </section>`
        : ''
    }

    <section class="space-y-4">
      <h3 class="text-xl font-bold text-slate-800 flex items-center gap-2">
        <span class="p-1.5 bg-amber-100 text-amber-600 rounded-lg">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
        </span>
        Subject Organisers
      </h3>
      <div class="flex flex-wrap gap-2">
        ${(area.organisers || [])
          .map(
            (o) =>
              `<span class="px-4 py-2 bg-white border border-slate-200 rounded-full text-xs font-bold text-slate-700 shadow-sm">${escapeHtml(o.name)}</span>`,
          )
          .join('')}
      </div>
    </section>

    <section class="space-y-4">
      <h3 class="text-xl font-bold text-slate-800">Big Ideas</h3>
      <div class="space-y-3">
        ${(area.bigIdeas || [])
          .map(
            (bi) => `
          <div class="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm text-lg">
            <button onclick="toggleProgression(this)" class="w-full flex justify-between items-center p-4 text-left hover:bg-slate-50 transition">
              <h4 class="font-bold text-indigo-700">${escapeHtml(bi.title)}</h4>
              <svg class="w-5 h-5 text-slate-400 rotate-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
            </button>
            <div class="collapse-content bg-slate-50/30">
              <div class="p-4 border-t border-slate-100">
                <p class="text-sm text-slate-600 leading-relaxed">${escapeHtml(bi.description)}</p>
              </div>
            </div>
          </div>`,
          )
          .join('')}
      </div>
    </section>

    <section class="space-y-4">
      <h3 class="text-xl font-bold text-slate-800">Strand Development</h3>
      <div class="space-y-4">
        ${(area.concepts || [])
          .map((c) => {
            const applicable = c.applicableLevels ?? LEVELS.map(lv=>lv.key);
            const cols = applicable.length;
            const gridCls = cols === 1 ? 'grid-cols-1'
                          : cols === 2 ? 'grid-cols-2'
                          : cols === 3 ? 'grid-cols-3'
                                       : 'grid-cols-2 lg:grid-cols-4';
            return `
          <div class="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm overview-concept-card">
            <button onclick="toggleProgression(this)" class="w-full flex justify-between items-start p-4 text-left hover:bg-slate-50 transition">
              <div class="space-y-1 pr-8">
                <h4 class="text-base font-bold text-emerald-800">${escapeHtml(c.title)}</h4>
                ${c.description ? `<p class="text-sm text-slate-500 leading-relaxed">${escapeHtml(c.description)}</p>` : ''}
                <div class="flex gap-1.5 flex-wrap">
                  ${applicable.map((l) => `<span class="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-100 uppercase">${l}</span>`).join('')}
                </div>
              </div>
              <svg class="w-5 h-5 text-slate-400 mt-1 rotate-icon shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
            </button>
            <div class="collapse-content">
              <div class="border-t border-slate-100">
                <div class="grid ${gridCls} divide-x divide-slate-100">
                  ${applicable.map((lk) => `
                    <div class="p-4 space-y-2">
                      <div class="flex items-center gap-1.5">
                        <span class="h-5 w-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold">${LEVELS.find(lv=>lv.key===lk)?.label.charAt(0) ?? lk.toUpperCase()}</span>
                        <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest">${LEVELS.find(lv=>lv.key===lk)?.label ?? lk}</span>
                      </div>
                      <p class="text-xs text-slate-700 leading-relaxed">${escapeHtml(c.levels[lk]) || '<span class="text-slate-300 italic">No statement defined.</span>'}</p>
                    </div>`).join('')}
                </div>
              </div>
            </div>
          </div>`;
          })
          .join('')}
      </div>
    </section>`;

  triggerMath();
}

// ── Expose to window for inline onchange handler in index.html ────────────────
window.renderOverview = renderOverview;
