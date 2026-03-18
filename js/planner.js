/**
 * planner.js
 * Handles the "Know and Do" planner view.
 * Supports two editing modes:
 *   - Card view:  one card per bundle (original layout)
 *   - Grid view:  rows = bundle names, columns = sequence tags (1/2/3),
 *                 cells contain the Know/Do statement editors
 */

import { db, APP_ID }                                          from './firebase.js';
import { state, escapeHtml, triggerMath, getSafeId, updateMathPreview, LEVELS, levelByNum } from './state.js';
import { doc, setDoc, onSnapshot }
  from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js';

let autoSaveTimeout  = null;
let currentViewMode  = 'card'; // 'card' | 'grid'

// ── Sequence tag colour classes ───────────────────────────────────────────────

function seqBtnCls(active) {
  return active
    ? 'bg-indigo-600 text-white border-indigo-600'
    : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-400';
}

// ── Level tab switching ───────────────────────────────────────────────────────

window.switchPlannerLevel = (level) => {
  state.currentPlannerLevel = level;
  document.querySelectorAll('.level-tab').forEach((tab) => {
    tab.classList.remove('active');
    if (tab.id === `tab-l${level}`) tab.classList.add('active');
  });
  renderPlannerGrid();
};

// ── View mode toggle ──────────────────────────────────────────────────────────

window.setPlannerViewMode = (mode) => {
  currentViewMode = mode;
  document.getElementById('planner-mode-card').classList.toggle('active-mode', mode === 'card');
  document.getElementById('planner-mode-grid').classList.toggle('active-mode', mode === 'grid');
  renderPlannerGrid();
};

// ── Area selection ────────────────────────────────────────────────────────────

let _plannerUnsubscribe    = null; // holds the current onSnapshot unsubscribe fn
let organiserFilterEnabled = false; // whether the organiser-specific section is active

window.toggleOrganiserFilter = () => {
  organiserFilterEnabled = !organiserFilterEnabled;

  // Update toggle button appearance
  const btn   = document.getElementById('planner-organiser-toggle-btn');
  const knob  = document.getElementById('planner-organiser-toggle-knob');
  const oBox  = document.getElementById('planner-organiser-container');

  btn.setAttribute('aria-checked', organiserFilterEnabled ? 'true' : 'false');
  btn.style.backgroundColor = organiserFilterEnabled ? 'var(--color-accent, #0d9488)' : '';
  btn.classList.toggle('bg-teal-500', organiserFilterEnabled);
  btn.classList.toggle('bg-slate-200', !organiserFilterEnabled);
  knob.classList.toggle('translate-x-5', organiserFilterEnabled);
  knob.classList.toggle('translate-x-0.5', !organiserFilterEnabled);

  if (organiserFilterEnabled) {
    oBox.classList.remove('hidden');
  } else {
    oBox.classList.add('hidden');
  }

  renderPlannerGrid();
};

window.loadPlannerData = async () => {
  const areaId = document.getElementById('planner-area-select').value;

  // Unsubscribe any previous listener
  if (_plannerUnsubscribe) { _plannerUnsubscribe(); _plannerUnsubscribe = null; }

  if (!areaId) {
    state.currentPlannerData = null;
    document.getElementById('planner-concept-container').classList.add('hidden');
    document.getElementById('planner-organiser-toggle-row').classList.add('hidden');
    document.getElementById('planner-organiser-container').classList.add('hidden');
    document.getElementById('planner-grid-container').classList.add('hidden');
    return;
  }

  const area = state.curriculumData.find((a) => a.id === areaId);
  if (!area) return;

  // Preserve current concept selection across re-loads
  const prevConcept   = document.getElementById('planner-concept-select').value;
  const prevOrganiser = document.getElementById('planner-organiser-select').value;

  document.getElementById('planner-concept-select').innerHTML = area.concepts
    .map((c) => `<option value="${escapeHtml(c.title)}">${escapeHtml(c.title)}</option>`)
    .join('');
  document.getElementById('planner-organiser-select').innerHTML = area.organisers
    .map((o) => `<option value="${escapeHtml(o.name)}">${escapeHtml(o.name)}</option>`)
    .join('');

  // Restore previous selections if they still exist in the new area
  if (prevConcept && area.concepts.some((c) => c.title === prevConcept)) {
    document.getElementById('planner-concept-select').value = prevConcept;
  }
  if (prevOrganiser && area.organisers.some((o) => o.name === prevOrganiser)) {
    document.getElementById('planner-organiser-select').value = prevOrganiser;
  }

  document.getElementById('planner-concept-container').classList.remove('hidden');
  document.getElementById('planner-organiser-toggle-row').classList.remove('hidden');
  document.getElementById('planner-grid-container').classList.remove('hidden');

  // Seed currentPlannerData immediately from allPlanningData so renderPlannerGrid
  // doesn't have to wait for the snapshot round-trip on first render
  state.currentPlannerData = state.allPlanningData[areaId] ?? { mappings: {} };
  renderPlannerGrid();

  const planDocRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'planningMaps', areaId);
  _plannerUnsubscribe = onSnapshot(planDocRef, (snap) => {
    state.currentPlannerData = snap.exists() ? snap.data() : { mappings: {} };
    renderPlannerGrid();
  });
};

// ── Main renderer — dispatches to card or grid mode ───────────────────────────

export function renderPlannerGrid() {
  const areaId       = document.getElementById('planner-area-select').value;
  const conceptTitle = document.getElementById('planner-concept-select').value;

  if (!areaId || !conceptTitle || !state.currentPlannerData) return;

  const area = state.curriculumData.find((a) => a.id === areaId);
  if (!area) return;

  const organiserName = organiserFilterEnabled
    ? document.getElementById('planner-organiser-select').value
    : null;

  const concept    = area.concepts.find((c) => c.title === conceptTitle);
  const applicable = new Set(concept?.applicableLevels ?? LEVELS.map(lv => lv.key));

  // Update level tabs — dim non-applicable ones
  LEVELS.forEach((lv) => {
    const tab = document.getElementById(`tab-${lv.key}`);
    if (!tab) return;
    const isApplicable = applicable.has(lv.key);
    tab.disabled = !isApplicable;
    tab.classList.toggle('opacity-30', !isApplicable);
    tab.classList.toggle('cursor-not-allowed', !isApplicable);
  });

  // If current level is not applicable, switch to first applicable
  if (!applicable.has(`l${state.currentPlannerLevel}`)) {
    const firstLv = LEVELS.find((lv) => applicable.has(lv.key));
    const first   = firstLv?.plannerNum;
    if (first !== undefined) {
      state.currentPlannerLevel = first;
      document.querySelectorAll('.level-tab').forEach((t) => t.classList.remove('active'));
      document.getElementById(`tab-l${first}`)?.classList.add('active');
    }
  }

  if (concept) {
    document.getElementById('planner-header-title').innerText    = concept.title;
    document.getElementById('planner-header-desc').innerText     = concept.description || '';
    document.getElementById('planner-level-desc').innerText      =
      concept.levels[`l${state.currentPlannerLevel}`] || 'No level progression statement defined.';
    document.getElementById('planner-context-level-num').innerText = levelByNum(state.currentPlannerLevel).label;
  }

  const container = document.getElementById('planner-active-level-view');
  container.innerHTML = '';

  // If level not applicable, show notice
  if (!applicable.has(`l${state.currentPlannerLevel}`)) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center py-16 text-center gap-3">
        <div class="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
          <svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg>
        </div>
        <p class="text-sm font-semibold text-slate-500">This concept does not apply to the ${levelByNum(state.currentPlannerLevel).label} level</p>
        <p class="text-xs text-slate-400">Update the concept's applicable levels in the Areas editor to enable this level.</p>
      </div>`;
    return;
  }

  const levelNum  = state.currentPlannerLevel;
  const commonKey = `${conceptTitle}_ALL_L${levelNum}`;

  if (!state.currentPlannerData.mappings[commonKey]) {
    state.currentPlannerData.mappings[commonKey] = { groups: [] };
  }

  // ── Section 1: Common bundles ──────────────────────────────────────────────
  const commonSection = document.createElement('div');
  commonSection.className = 'space-y-4';
  commonSection.innerHTML = `
    <div class="flex items-center gap-3 flex-wrap">
      <div class="flex items-center gap-2 px-3 py-1.5 bg-teal-50 border border-teal-200 rounded-lg">
        <svg class="w-4 h-4 text-teal-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
        <span class="text-xs font-black text-teal-700 uppercase tracking-wide">Common — applies to all organisers</span>
      </div>
      <span class="text-xs text-slate-400">These bundles appear in every organiser's matrix cells.</span>
    </div>`;
  const commonContainer = document.createElement('div');
  if (currentViewMode === 'grid') {
    renderGridMode(commonKey, commonContainer);
  } else {
    renderCardMode(commonKey, commonContainer);
  }
  commonSection.appendChild(commonContainer);
  container.appendChild(commonSection);

  // ── Section 2: Organiser-specific (only when toggle is on) ─────────────────
  if (organiserFilterEnabled && organiserName) {
    const specificKey = `${conceptTitle}_${organiserName}_L${levelNum}`;
    if (!state.currentPlannerData.mappings[specificKey]) {
      state.currentPlannerData.mappings[specificKey] = { groups: [] };
    }

    const divider = document.createElement('div');
    divider.className = 'flex items-center gap-3 py-2';
    divider.innerHTML = `
      <div class="flex-1 border-t border-slate-200"></div>
      <div class="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-lg shrink-0">
        <svg class="w-4 h-4 text-indigo-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/></svg>
        <span class="text-xs font-black text-indigo-700 uppercase tracking-wide">Specific to: ${escapeHtml(organiserName)}</span>
      </div>
      <div class="flex-1 border-t border-slate-200"></div>`;

    const specificContainer = document.createElement('div');
    if (currentViewMode === 'grid') {
      renderGridMode(specificKey, specificContainer);
    } else {
      renderCardMode(specificKey, specificContainer);
    }

    container.appendChild(divider);
    container.appendChild(specificContainer);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// CARD MODE
// ════════════════════════════════════════════════════════════════════════════

function renderCardMode(key, container) {
  const levelData = state.currentPlannerData.mappings[key];
  const grid = document.createElement('div');
  grid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 items-start';

  // ── New bundle button
  const addBtn = document.createElement('button');
  addBtn.onclick = () => addPlannerGroup(key);
  addBtn.className =
    'group border-2 border-dashed border-slate-300 rounded-xl p-6 hover:border-indigo-400 hover:bg-indigo-50 transition flex flex-col items-center justify-center space-y-2 min-h-[160px]';
  addBtn.innerHTML = `
    <div class="p-3 bg-white rounded-full shadow-sm group-hover:scale-110 transition">
      <svg class="w-6 h-6 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
      </svg>
    </div>
    <span class="font-bold text-slate-500 group-hover:text-indigo-600 text-sm">New Bundle</span>`;

  // ── Link existing bundle button
  const linkBtn = document.createElement('button');
  linkBtn.onclick = () => openLinkBundleModal(key);
  linkBtn.className =
    'group border-2 border-dashed border-teal-200 rounded-xl p-6 hover:border-teal-400 hover:bg-teal-50 transition flex flex-col items-center justify-center space-y-2 min-h-[160px]';
  linkBtn.innerHTML = `
    <div class="p-3 bg-white rounded-full shadow-sm group-hover:scale-110 transition">
      <svg class="w-6 h-6 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
      </svg>
    </div>
    <span class="font-bold text-slate-500 group-hover:text-teal-600 text-sm">Link Bundle</span>`;

  (levelData.groups || []).forEach((group, index) => {
    grid.appendChild(createCardEl(key, index, group));
  });
  grid.appendChild(addBtn);
  grid.appendChild(linkBtn);
  container.appendChild(grid);
  triggerMath();
}

function createCardEl(key, index, group) {
  const safeId      = getSafeId(key, index);
  const isCollapsed = group._collapsed ?? false;
  const tag         = group.sequenceTag ?? 1;
  const isLinked    = !!group.linkedFrom;

  const tagColour = tag === 1 ? 'bg-indigo-100 text-indigo-700 border-indigo-200'
                  : tag === 2 ? 'bg-amber-100 text-amber-700 border-amber-200'
                              : 'bg-emerald-100 text-emerald-700 border-emerald-200';

  // For linked bundles, resolve the source data
  const resolvedGroup = isLinked ? resolveLinkedBundle(group) : group;

  const div = document.createElement('div');
  div.className = `bg-white border rounded-xl shadow-sm overflow-hidden flex flex-col ${
    isLinked ? 'border-teal-300 ring-1 ring-teal-200' : 'border-slate-200'
  }`;

  if (isLinked) {
    // ── Read-only linked card ──────────────────────────────────────────────
    const srcArea = state.curriculumData.find((a) => a.id === group.linkedFrom.areaId);
    div.innerHTML = `
      <div class="p-3 bg-teal-50 border-b border-teal-200 flex items-center gap-2 cursor-pointer select-none"
           onclick="toggleCardCollapse('${key}', ${index})">
        <span class="inline-flex items-center justify-center w-5 h-5 rounded border text-[9px] font-black ${tagColour} shrink-0">${tag}</span>
        <span class="text-xs font-bold text-slate-700 flex-1 min-w-0 break-words leading-snug">${escapeHtml(resolvedGroup?.name || group.linkedFrom.bundleName || 'Linked bundle')}</span>
        <svg class="w-3.5 h-3.5 text-teal-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>
        <svg class="w-4 h-4 text-slate-400 rotate-icon shrink-0 ${isCollapsed ? '' : 'expanded'}"
             fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
        </svg>
        <button onclick="event.stopPropagation(); removePlannerGroup('${key}', ${index})"
          class="text-slate-300 hover:text-red-500 p-0.5 shrink-0">&times;</button>
      </div>
      <div class="card-body ${isCollapsed ? '' : 'expanded'} collapse-content">
        <div class="px-4 py-2 bg-teal-50/60 border-b border-teal-100 flex items-center gap-1.5">
          <svg class="w-3 h-3 text-teal-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>
          <span class="text-[9px] font-black text-teal-600 uppercase tracking-widest">Linked from</span>
          <span class="text-[9px] text-teal-700 font-semibold">${escapeHtml(srcArea?.title || 'Unknown area')} — ${escapeHtml(group.linkedFrom.conceptTitle)}</span>
        </div>
        <div class="p-4 space-y-3 opacity-75 pointer-events-none select-none" id="linked-preview-${safeId}">
          <p class="text-[10px] text-slate-400 italic">Content is read-only. Edit in the original curriculum area.</p>
        </div>
      </div>`;

    setTimeout(() => {
      const preview = document.getElementById(`linked-preview-${safeId}`);
      if (preview && resolvedGroup) {
        renderLinkedPreview(preview, resolvedGroup);
      }
    }, 0);

    return div;
  }

  // ── Editable card (original) ──────────────────────────────────────────────
  const compOptions =
    '<option value="">-- No Competency --</option>' +
    state.competencyData
      .map((c) => `<option value="${c.id}" ${group.competencyId === c.id ? 'selected' : ''}>${escapeHtml(c.title)}</option>`)
      .join('');

  div.innerHTML = `
    <!-- Card header: always visible, click to collapse -->
    <div class="p-3 bg-slate-50 border-b flex items-center gap-2 cursor-pointer select-none"
         onclick="toggleCardCollapse('${key}', ${index})">
      <span class="inline-flex items-center justify-center w-5 h-5 rounded border text-[9px] font-black ${tagColour} shrink-0">${tag}</span>
      <span class="text-xs font-bold text-slate-700 flex-1 min-w-0 break-words leading-snug">${escapeHtml(group.name || 'Unnamed bundle')}</span>
      <svg class="w-4 h-4 text-slate-400 rotate-icon shrink-0 ${isCollapsed ? '' : 'expanded'}"
           fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
      </svg>
      <button onclick="event.stopPropagation(); removePlannerGroup('${key}', ${index})"
        class="text-slate-300 hover:text-red-500 p-0.5 shrink-0">&times;</button>
    </div>

    <!-- Card body: collapsible -->
    <div class="card-body ${isCollapsed ? '' : 'expanded'} collapse-content">
      <div class="p-4 space-y-4">
        <div class="space-y-1">
          <label class="text-[9px] font-bold text-slate-500 uppercase tracking-wide">Bundle Name</label>
          <input type="text"
            oninput="updatePlannerValue('${key}', ${index}, 'name', this.value); this.closest('.bg-white').querySelector('.break-words').textContent = this.value || 'Unnamed bundle'"
            class="w-full text-xs font-bold border border-slate-200 bg-white rounded-lg px-2.5 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            placeholder="e.g. Core Fundamentals" value="${escapeHtml(group.name || '')}">
        </div>
        <div class="space-y-1">
          <label class="text-[9px] font-bold text-slate-500 uppercase tracking-wide">Sequence Tag</label>
          <div class="flex gap-2">
            ${[1, 2, 3].map((n) => `
              <button type="button"
                onclick="updatePlannerValue('${key}', ${index}, 'sequenceTag', ${n}); renderPlannerGrid()"
                class="flex-1 text-xs font-bold border rounded-lg py-1.5 transition ${seqBtnCls(tag === n)}">
                ${n}
              </button>`).join('')}
          </div>
        </div>
        <div class="space-y-1">
          <label class="text-[9px] font-bold text-violet-600 uppercase tracking-wide">Aligned Competency</label>
          <select onchange="updatePlannerValue('${key}', ${index}, 'competencyId', this.value)"
            class="w-full text-[10px] border border-slate-200 bg-white rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-violet-500">
            ${compOptions}
          </select>
        </div>
        <div class="space-y-3 pt-2 border-t">
          <div class="flex justify-between items-center">
            <label class="text-[10px] font-bold text-indigo-600 uppercase tracking-wide">Know</label>
            <button onclick="addPlannerItem('${key}', ${index}, 'knowItems')"
              class="text-[10px] text-indigo-500 font-bold hover:underline">+ Add Know</button>
          </div>
          <div class="space-y-2" id="know-items-${safeId}"></div>
        </div>
        <div class="space-y-3 pt-2 border-t">
          <div class="flex justify-between items-center">
            <label class="text-[10px] font-bold text-emerald-600 uppercase tracking-wide">Do</label>
            <button onclick="addPlannerItem('${key}', ${index}, 'doItems')"
              class="text-[10px] text-indigo-500 font-bold hover:underline">+ Add Do</button>
          </div>
          <div class="space-y-2" id="do-items-${safeId}"></div>
        </div>
      </div>
    </div>`;

  setTimeout(() => {
    populateItemContainers(key, index, group, safeId);
  }, 0);

  return div;
}

window.toggleCardCollapse = (key, index) => {
  if (!state.currentPlannerData.mappings[key]) return;
  const g = state.currentPlannerData.mappings[key].groups[index];
  g._collapsed = !(g._collapsed ?? false);
  renderPlannerGrid();
};

// ════════════════════════════════════════════════════════════════════════════
// GRID MODE
// ════════════════════════════════════════════════════════════════════════════

function renderGridMode(key, container) {
  const groups = state.currentPlannerData.mappings[key].groups || [];

  // Collect unique bundle names (preserving order of first appearance)
  const bundleNames = [];
  groups.forEach((g) => {
    const name = g.name?.trim() || '';
    if (name && !bundleNames.includes(name)) bundleNames.push(name);
    else if (!name) {
      // unnamed bundles get a placeholder so they still appear
      const placeholder = `__unnamed_${groups.indexOf(g)}`;
      bundleNames.push(placeholder);
    }
  });

  // For each name × seq tag, find the matching group (first match wins)
  const SEQ = [1, 2, 3];

  const seqHeaderCls = [
    'bg-indigo-50 text-indigo-700',
    'bg-amber-50 text-amber-700',
    'bg-emerald-50 text-emerald-700',
  ];

  const wrapper = document.createElement('div');
  wrapper.className = 'space-y-4';

  // ── Add-bundle row ──
  const addRow = document.createElement('div');
  addRow.className = 'flex items-center gap-3';
  addRow.innerHTML = `
    <input id="grid-new-bundle-name" type="text" placeholder="New bundle name…"
      class="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 w-64">
    <button onclick="addGridBundle('${key}')"
      class="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition">
      + Add Bundle
    </button>`;
  wrapper.appendChild(addRow);

  if (bundleNames.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'text-sm text-slate-400 italic py-8 text-center';
    empty.textContent = 'No bundles yet. Add one above.';
    wrapper.appendChild(empty);
    container.appendChild(wrapper);
    return;
  }

  // ── Table ──
  const tableWrap = document.createElement('div');
  tableWrap.className = 'overflow-x-auto rounded-xl border border-slate-200 shadow-sm';

  let html = `<table class="w-full text-left table-fixed border-collapse">
    <thead>
      <tr class="border-b bg-slate-50">
        <th class="p-3 text-xs font-bold text-slate-600 uppercase w-44">Bundle</th>
        ${SEQ.map((n, i) => `
          <th class="p-3 text-xs font-bold uppercase ${seqHeaderCls[i]}">
            <span class="flex items-center gap-1.5">
              <span class="w-4 h-4 rounded border text-[9px] font-black inline-flex items-center justify-center ${seqHeaderCls[i]} border-current">${n}</span>
              Sequence ${n}
            </span>
          </th>`).join('')}
        <th class="p-3 w-8"></th>
      </tr>
    </thead>
    <tbody class="divide-y">`;

  bundleNames.forEach((rawName) => {
    const displayName = rawName.startsWith('__unnamed_') ? '' : rawName;

    html += `<tr class="hover:bg-slate-50/50">
      <td class="p-3 align-top border-r">
        <input type="text"
          value="${escapeHtml(displayName)}"
          placeholder="Bundle name"
          onchange="renameGridBundle('${key}', '${escapeHtml(rawName)}', this.value)"
          class="w-full text-xs font-bold border border-slate-200 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-indigo-500">
      </td>`;

    SEQ.forEach((seqTag) => {
      // Find the group that matches this name+seqTag, or null
      const gIdx = groups.findIndex(
        (g) => (g.name?.trim() || '') === (rawName.startsWith('__unnamed_') ? '' : rawName)
             && (g.sequenceTag ?? 1) === seqTag,
      );
      const g = gIdx >= 0 ? groups[gIdx] : null;
      const safeId = g ? getSafeId(key, gIdx) : null;

      html += `<td class="p-3 align-top border-r min-w-[180px]">`;

      if (g) {
        // Competency select
        const compOptions = '<option value="">— No Competency —</option>' +
          state.competencyData.map((c) =>
            `<option value="${c.id}" ${g.competencyId === c.id ? 'selected' : ''}>${escapeHtml(c.title)}</option>`
          ).join('');

        html += `
          <div class="space-y-2" id="grid-cell-${safeId}">
            <select onchange="updatePlannerValue('${key}', ${gIdx}, 'competencyId', this.value)"
              class="w-full text-[9px] border border-slate-200 bg-white rounded px-1.5 py-1 focus:ring-1 focus:ring-violet-500 mb-1">
              ${compOptions}
            </select>
            <div class="space-y-1">
              <span class="text-[8px] font-black text-indigo-500 uppercase tracking-widest">Know</span>
              <div id="grid-know-${safeId}" class="space-y-1"></div>
              <button onclick="addPlannerItem('${key}', ${gIdx}, 'knowItems')"
                class="text-[9px] text-indigo-400 font-bold hover:underline">+ Know</button>
            </div>
            <div class="space-y-1 pt-1 border-t border-slate-100">
              <span class="text-[8px] font-black text-emerald-500 uppercase tracking-widest">Do</span>
              <div id="grid-do-${safeId}" class="space-y-1"></div>
              <button onclick="addPlannerItem('${key}', ${gIdx}, 'doItems')"
                class="text-[9px] text-emerald-500 font-bold hover:underline">+ Do</button>
            </div>
          </div>`;
      } else {
        // Empty cell — clicking creates the group
        html += `
          <button onclick="addGridCell('${key}', '${escapeHtml(rawName.startsWith('__unnamed_') ? '' : rawName)}', ${seqTag})"
            class="w-full h-full min-h-[60px] rounded-lg border-2 border-dashed border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 transition text-[10px] text-slate-400 hover:text-indigo-500 font-bold flex items-center justify-center">
            + Add
          </button>`;
      }

      html += `</td>`;
    });

    // Row delete (removes all groups with this bundle name)
    html += `
      <td class="p-2 align-top text-center">
        <button onclick="removeGridBundleRow('${key}', '${escapeHtml(rawName)}')"
          class="text-slate-300 hover:text-red-500 font-bold text-sm">&times;</button>
      </td>
    </tr>`;
  });

  html += `</tbody></table>`;
  tableWrap.innerHTML = html;
  wrapper.appendChild(tableWrap);
  container.appendChild(wrapper);

  // Populate statement inputs after DOM is ready
  setTimeout(() => {
    bundleNames.forEach((rawName) => {
      SEQ.forEach((seqTag) => {
        const gIdx = groups.findIndex(
          (g) => (g.name?.trim() || '') === (rawName.startsWith('__unnamed_') ? '' : rawName)
               && (g.sequenceTag ?? 1) === seqTag,
        );
        if (gIdx < 0) return;
        const g      = groups[gIdx];
        const safeId = getSafeId(key, gIdx);
        const kEl    = document.getElementById(`grid-know-${safeId}`);
        const dEl    = document.getElementById(`grid-do-${safeId}`);
        if (kEl) {
          kEl.innerHTML = '';
          (g.knowItems || []).forEach((item, i) =>
            kEl.appendChild(createItemInput(key, gIdx, 'knowItems', i, item, true)));
        }
        if (dEl) {
          dEl.innerHTML = '';
          (g.doItems || []).forEach((item, i) =>
            dEl.appendChild(createItemInput(key, gIdx, 'doItems', i, item, true)));
        }
      });
    });
    triggerMath();
  }, 0);
}

// ── Grid-mode bundle operations ───────────────────────────────────────────────

window.addGridBundle = (key) => {
  const nameEl = document.getElementById('grid-new-bundle-name');
  const name   = nameEl?.value?.trim() || '';
  if (!state.currentPlannerData.mappings[key]) return;
  // Add a single group for seq 1 as the starter
  state.currentPlannerData.mappings[key].groups.push({
    sequence:    state.currentPlannerData.mappings[key].groups.length + 1,
    name,
    knowItems:   [''],
    doItems:     [''],
    competencyId: '',
    sequenceTag:  1,
  });
  if (nameEl) nameEl.value = '';
  renderPlannerGrid();
  savePlannerState();
};

window.addGridCell = (key, bundleName, seqTag) => {
  if (!state.currentPlannerData.mappings[key]) return;
  state.currentPlannerData.mappings[key].groups.push({
    sequence:    state.currentPlannerData.mappings[key].groups.length + 1,
    name:        bundleName,
    knowItems:   [''],
    doItems:     [''],
    competencyId: '',
    sequenceTag:  seqTag,
  });
  renderPlannerGrid();
  savePlannerState();
};

window.renameGridBundle = (key, oldName, newName) => {
  if (!state.currentPlannerData.mappings[key]) return;
  const actualOld = oldName.startsWith('__unnamed_') ? '' : oldName;
  state.currentPlannerData.mappings[key].groups.forEach((g) => {
    if ((g.name?.trim() || '') === actualOld) g.name = newName;
  });
  renderPlannerGrid();
  savePlannerState();
};

window.removeGridBundleRow = (key, rawName) => {
  if (!confirm('Remove all bundles in this row?')) return;
  const actualName = rawName.startsWith('__unnamed_') ? '' : rawName;
  state.currentPlannerData.mappings[key].groups =
    state.currentPlannerData.mappings[key].groups.filter(
      (g) => (g.name?.trim() || '') !== actualName,
    );
  renderPlannerGrid();
  savePlannerState();
};

// ════════════════════════════════════════════════════════════════════════════
// SHARED HELPERS
// ════════════════════════════════════════════════════════════════════════════

function populateItemContainers(key, index, group, safeId) {
  const kContainer = document.getElementById(`know-items-${safeId}`);
  const dContainer = document.getElementById(`do-items-${safeId}`);
  if (kContainer && dContainer) {
    kContainer.innerHTML = '';
    dContainer.innerHTML = '';
    (group.knowItems || []).forEach((item, i) =>
      kContainer.appendChild(createItemInput(key, index, 'knowItems', i, item)));
    (group.doItems || []).forEach((item, i) =>
      dContainer.appendChild(createItemInput(key, index, 'doItems', i, item)));
    triggerMath();
  }
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

function createItemInput(key, bundleIndex, listType, itemIndex, value, compact = false) {
  const safeId    = getSafeId(key, bundleIndex);
  const previewId = `preview-${safeId}-${listType}-${itemIndex}`;
  const div = document.createElement('div');

  if (compact) {
    // Grid mode: slightly more compact but still readable
    div.className = 'group/item flex items-start gap-1.5';
    div.innerHTML = `
      <textarea
        onblur="cleanupEmptyItems('${key}', ${bundleIndex}, '${listType}')"
        oninput="updatePlannerItemValue('${key}', ${bundleIndex}, '${listType}', ${itemIndex}, this.value, '${previewId}'); autoResizeTA(this)"
        class="flex-1 text-xs bg-white border border-slate-200 rounded-md px-2 py-1.5 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 focus:bg-white resize-none leading-snug"
        placeholder="Statement…" rows="2">${escapeHtml(value)}</textarea>
      <button onclick="removePlannerItem('${key}', ${bundleIndex}, '${listType}', ${itemIndex})"
        class="text-slate-300 hover:text-red-500 text-sm opacity-0 group-hover/item:opacity-100 mt-1 shrink-0">&times;</button>`;
  } else {
    // Card mode: full-width, clearly readable
    div.className = 'group/item bg-white border border-slate-200 rounded-lg transition focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 hover:border-slate-300';
    div.innerHTML = `
      <div class="flex items-start gap-2 p-2.5">
        <textarea
          onblur="cleanupEmptyItems('${key}', ${bundleIndex}, '${listType}')"
          oninput="updatePlannerItemValue('${key}', ${bundleIndex}, '${listType}', ${itemIndex}, this.value, '${previewId}'); autoResizeTA(this)"
          class="flex-1 text-sm bg-transparent border-none focus:ring-0 p-0 resize-none leading-relaxed"
          placeholder="Type statement…" rows="2">${escapeHtml(value)}</textarea>
        <button onclick="removePlannerItem('${key}', ${bundleIndex}, '${listType}', ${itemIndex})"
          class="text-slate-300 hover:text-red-500 text-sm opacity-0 group-hover/item:opacity-100 transition-opacity mt-0.5 shrink-0">&times;</button>
      </div>
      <div class="math-preview px-2.5 pb-1.5 hidden" id="${previewId}"></div>`;
  }

  // Auto-resize after the element is inserted into the DOM
  setTimeout(() => {
    const ta = div.querySelector('textarea');
    if (ta) autoResize(ta);
  }, 0);

  return div;
}

// Exposed to window so inline oninput handlers can call it
window.autoResizeTA = (el) => autoResize(el);

// ── Mutation helpers ──────────────────────────────────────────────────────────

window.cleanupEmptyItems = (key, bundleIndex, listType) => {
  if (!state.currentPlannerData.mappings[key]) return;
  const list     = state.currentPlannerData.mappings[key].groups[bundleIndex][listType];
  const filtered = list.filter((item, idx) => item.trim() !== '' || idx === list.length - 1);
  if (filtered.length === 0) filtered.push('');
  state.currentPlannerData.mappings[key].groups[bundleIndex][listType] = filtered;
  savePlannerState();
};

window.updatePlannerItemValue = (key, bundleIndex, listType, itemIndex, value, previewId) => {
  if (!state.currentPlannerData.mappings[key]) return;
  state.currentPlannerData.mappings[key].groups[bundleIndex][listType][itemIndex] = value;
  updateMathPreview(previewId, value);
  clearTimeout(autoSaveTimeout);
  autoSaveTimeout = setTimeout(() => savePlannerState(), 2500);
};

window.addPlannerItem = (key, bundleIndex, listType) => {
  if (!state.currentPlannerData.mappings[key]) return;
  state.currentPlannerData.mappings[key].groups[bundleIndex][listType].push('');
  renderPlannerGrid();
  savePlannerState();
};

window.removePlannerItem = (key, bundleIndex, listType, itemIndex) => {
  if (!state.currentPlannerData.mappings[key]) return;
  state.currentPlannerData.mappings[key].groups[bundleIndex][listType].splice(itemIndex, 1);
  if (state.currentPlannerData.mappings[key].groups[bundleIndex][listType].length === 0) {
    state.currentPlannerData.mappings[key].groups[bundleIndex][listType] = [''];
  }
  renderPlannerGrid();
  savePlannerState();
};

window.updatePlannerValue = (key, index, field, value) => {
  if (!state.currentPlannerData.mappings[key]) return;
  state.currentPlannerData.mappings[key].groups[index][field] = value;
  clearTimeout(autoSaveTimeout);
  autoSaveTimeout = setTimeout(() => savePlannerState(), 2500);
};

window.addPlannerGroup = (key) => {
  if (!state.currentPlannerData.mappings[key]) {
    state.currentPlannerData.mappings[key] = { groups: [] };
  }
  state.currentPlannerData.mappings[key].groups.push({
    sequence:     state.currentPlannerData.mappings[key].groups.length + 1,
    name:         '',
    knowItems:    [''],
    doItems:      [''],
    competencyId: '',
    sequenceTag:  1,
  });
  renderPlannerGrid();
  savePlannerState();
};

window.removePlannerGroup = (key, index) => {
  if (!confirm('Remove this bundle?')) return;
  state.currentPlannerData.mappings[key].groups.splice(index, 1);
  renderPlannerGrid();
  savePlannerState();
};

// ── Persistence ───────────────────────────────────────────────────────────────

async function savePlannerState() {
  const areaId = document.getElementById('planner-area-select').value;
  if (!areaId || !state.user) return;
  const planDocRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'planningMaps', areaId);
  try {
    await setDoc(planDocRef, state.currentPlannerData, { merge: true });
    state.allPlanningData[areaId] = state.currentPlannerData;
  } catch (e) {
    console.error(e);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// LINKED BUNDLE SUPPORT
// ════════════════════════════════════════════════════════════════════════════

/** Resolve a linked bundle's group data from allPlanningData. Returns null if not found. */
function resolveLinkedBundle(group) {
  if (!group.linkedFrom) return null;
  const { areaId, conceptTitle, organiserName, level, bundleIndex } = group.linkedFrom;
  const planning = state.allPlanningData[areaId];
  if (!planning?.mappings) return null;
  const key = `${conceptTitle}_${organiserName}_L${level}`;
  const m   = planning.mappings[key];
  if (!m?.groups) return null;
  return m.groups[bundleIndex] ?? null;
}

/** Render a read-only preview of a resolved bundle's know/do items into a container element. */
function renderLinkedPreview(container, g) {
  const hasKnow = (g.knowItems || []).some((k) => k.trim());
  const hasDo   = (g.doItems   || []).some((d) => d.trim());
  container.innerHTML = '';
  if (!hasKnow && !hasDo) {
    container.innerHTML = '<p class="text-[10px] text-slate-400 italic">No statements in source bundle.</p>';
    return;
  }
  if (hasKnow) {
    const d = document.createElement('div');
    d.innerHTML = `
      <span class="text-[8px] font-black text-indigo-400 uppercase tracking-widest block mb-1">Know:</span>
      <ul class="list-disc list-outside ml-3 text-[10px] text-slate-600 space-y-1">
        ${g.knowItems.filter((v) => v.trim()).map((v) => `<li>${escapeHtml(v)}</li>`).join('')}
      </ul>`;
    container.appendChild(d);
  }
  if (hasDo) {
    const d = document.createElement('div');
    d.innerHTML = `
      <span class="text-[8px] font-black text-emerald-500 uppercase tracking-widest block mb-1">Do:</span>
      <ul class="list-disc list-outside ml-3 text-[10px] text-slate-600 font-medium space-y-1">
        ${g.doItems.filter((v) => v.trim()).map((v) => `<li>${escapeHtml(v)}</li>`).join('')}
      </ul>`;
    container.appendChild(d);
  }
}

// ── Link picker modal ─────────────────────────────────────────────────────────

let _linkTargetKey = null; // the planner mapping key we're adding a link to

window.openLinkBundleModal = (key) => {
  _linkTargetKey = key;

  // Populate area select — exclude the current area
  const currentAreaId = document.getElementById('planner-area-select').value;
  const sel = document.getElementById('link-area-select');
  sel.innerHTML = '<option value="">Choose an area\u2026</option>' +
    state.curriculumData
      .filter((a) => a.id !== currentAreaId && (a.status || 'public') === 'public')
      .map((a) => `<option value="${a.id}">${escapeHtml(a.title)}</option>`)
      .join('');

  // Reset downstream rows
  ['link-concept-row','link-organiser-row','link-bundles-row','link-empty-msg'].forEach((id) => {
    document.getElementById(id).classList.add('hidden');
  });

  document.getElementById('link-bundle-modal').classList.remove('hidden');
};

window.closeLinkBundleModal = () => {
  document.getElementById('link-bundle-modal').classList.add('hidden');
  _linkTargetKey = null;
};

window.linkPickerAreaChanged = () => {
  const areaId = document.getElementById('link-area-select').value;
  ['link-concept-row','link-organiser-row','link-bundles-row','link-empty-msg'].forEach((id) => {
    document.getElementById(id).classList.add('hidden');
  });
  if (!areaId) return;

  const area = state.curriculumData.find((a) => a.id === areaId);
  if (!area) return;

  document.getElementById('link-concept-select').innerHTML =
    '<option value="">Choose a concept\u2026</option>' +
    (area.concepts || []).map((c) => `<option value="${escapeHtml(c.title)}">${escapeHtml(c.title)}</option>`).join('');
  document.getElementById('link-concept-row').classList.remove('hidden');
};

window.linkPickerConceptChanged = () => {
  ['link-organiser-row','link-bundles-row','link-empty-msg'].forEach((id) => {
    document.getElementById(id).classList.add('hidden');
  });
  const areaId = document.getElementById('link-area-select').value;
  const area   = state.curriculumData.find((a) => a.id === areaId);
  if (!area) return;
  if (!document.getElementById('link-concept-select').value) return;

  document.getElementById('link-organiser-select').innerHTML =
    '<option value="">Choose an organiser\u2026</option>' +
    (area.organisers || []).map((o) => `<option value="${escapeHtml(o.name)}">${escapeHtml(o.name)}</option>`).join('');
  document.getElementById('link-organiser-row').classList.remove('hidden');
};

window.linkPickerOrganiserChanged = () => {
  document.getElementById('link-bundles-row').classList.add('hidden');
  document.getElementById('link-empty-msg').classList.add('hidden');

  const areaId    = document.getElementById('link-area-select').value;
  const concept   = document.getElementById('link-concept-select').value;
  const organiser = document.getElementById('link-organiser-select').value;
  if (!areaId || !concept || !organiser || !_linkTargetKey) return;

  // Derive level from current planner key  e.g. "ConceptA_OrgB_L2" → "2"
  const levelMatch = _linkTargetKey.match(/_L(\d)$/);
  const level      = levelMatch ? levelMatch[1] : '1';

  const srcKey   = `${concept}_${organiser}_L${level}`;
  const planning = state.allPlanningData[areaId] || { mappings: {} };
  const m        = planning.mappings[srcKey] || { groups: [] };
  const bundles  = (m.groups || []).filter((g) => !g.linkedFrom); // can't link a link

  const list = document.getElementById('link-bundles-list');
  if (bundles.length === 0) {
    list.innerHTML = '';
    document.getElementById('link-empty-msg').classList.remove('hidden');
    return;
  }

  list.innerHTML = bundles.map((g, i) => {
    const tag     = g.sequenceTag ?? 1;
    const tagCls  = tag === 1 ? 'bg-indigo-100 text-indigo-700 border-indigo-200'
                  : tag === 2 ? 'bg-amber-100 text-amber-700 border-amber-200'
                              : 'bg-emerald-100 text-emerald-700 border-emerald-200';
    const hasKnow = (g.knowItems || []).some((k) => k.trim());
    const hasDo   = (g.doItems   || []).some((d) => d.trim());
    return `
      <div class="border border-slate-200 rounded-lg overflow-hidden">
        <div class="flex items-center gap-2 px-3 py-2 bg-slate-50">
          <span class="inline-flex items-center justify-center w-5 h-5 rounded border text-[9px] font-black ${tagCls} shrink-0">${tag}</span>
          <span class="text-xs font-bold text-slate-700 flex-1">${escapeHtml(g.name || 'Unnamed bundle')}</span>
          <button onclick="confirmLinkBundle('${areaId}','${escapeHtml(concept)}','${escapeHtml(organiser)}','${level}',${i},'${escapeHtml(g.name || '')}')"
            class="px-3 py-1 bg-teal-600 text-white text-[10px] font-bold rounded-md hover:bg-teal-700 transition">
            Link
          </button>
        </div>
        ${hasKnow || hasDo ? `
        <div class="px-3 pb-2 pt-1 space-y-1 text-[10px] text-slate-500">
          ${hasKnow ? `<div><span class="font-bold text-indigo-400">Know: </span>${g.knowItems.filter(v=>v.trim()).join(' · ')}</div>` : ''}
          ${hasDo   ? `<div><span class="font-bold text-emerald-500">Do: </span>${g.doItems.filter(v=>v.trim()).join(' · ')}</div>` : ''}
        </div>` : ''}
      </div>`;
  }).join('');

  document.getElementById('link-bundles-row').classList.remove('hidden');
};

window.confirmLinkBundle = (srcAreaId, conceptTitle, organiserName, level, bundleIndex, bundleName) => {
  if (!_linkTargetKey || !state.currentPlannerData) return;
  if (!state.currentPlannerData.mappings[_linkTargetKey]) {
    state.currentPlannerData.mappings[_linkTargetKey] = { groups: [] };
  }
  state.currentPlannerData.mappings[_linkTargetKey].groups.push({
    sequence:    state.currentPlannerData.mappings[_linkTargetKey].groups.length + 1,
    name:        bundleName,
    sequenceTag: 1,
    linkedFrom: { areaId: srcAreaId, conceptTitle, organiserName, level, bundleIndex, bundleName },
  });
  closeLinkBundleModal();
  renderPlannerGrid();
  savePlannerState();
};

// ── Expose to window for inline onchange handlers ─────────────────────────────
window.renderPlannerGrid = renderPlannerGrid;
