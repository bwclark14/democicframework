/**
 * planner.js
 * Handles the "Know and Do" planner view: bundle cards, level tabs,
 * real-time editing, and auto-saving to Firestore.
 */

import { db, APP_ID }                                from './firebase.js';
import { state, escapeHtml, triggerMath, getSafeId, updateMathPreview } from './state.js';
import { doc, setDoc, onSnapshot }
  from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js';

let autoSaveTimeout = null;

// ── Level tab switching ───────────────────────────────────────────────────────

window.switchPlannerLevel = (level) => {
  state.currentPlannerLevel = level;
  document.querySelectorAll('.level-tab').forEach((tab) => {
    tab.classList.remove('active');
    if (tab.id === `tab-l${level}`) tab.classList.add('active');
  });
  renderPlannerGrid();
};

// ── Area selection ────────────────────────────────────────────────────────────

window.loadPlannerData = async () => {
  const areaId = document.getElementById('planner-area-select').value;

  if (!areaId) {
    document.getElementById('planner-concept-container').classList.add('hidden');
    document.getElementById('planner-organiser-container').classList.add('hidden');
    document.getElementById('planner-grid-container').classList.add('hidden');
    return;
  }

  const area = state.curriculumData.find((a) => a.id === areaId);
  if (!area) return;

  document.getElementById('planner-concept-select').innerHTML = area.concepts
    .map((c) => `<option value="${escapeHtml(c.title)}">${escapeHtml(c.title)}</option>`)
    .join('');

  document.getElementById('planner-organiser-select').innerHTML = area.organisers
    .map((o) => `<option value="${escapeHtml(o.name)}">${escapeHtml(o.name)}</option>`)
    .join('');

  document.getElementById('planner-concept-container').classList.remove('hidden');
  document.getElementById('planner-organiser-container').classList.remove('hidden');
  document.getElementById('planner-grid-container').classList.remove('hidden');

  const planDocRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'planningMaps', areaId);
  onSnapshot(planDocRef, (snap) => {
    state.currentPlannerData = snap.exists() ? snap.data() : { mappings: {} };
    renderPlannerGrid();
  });
};

// ── Grid renderer ─────────────────────────────────────────────────────────────

export function renderPlannerGrid() {
  const areaId       = document.getElementById('planner-area-select').value;
  const conceptTitle = document.getElementById('planner-concept-select').value;
  const organiserName = document.getElementById('planner-organiser-select').value;

  if (!areaId || !conceptTitle || !organiserName || !state.currentPlannerData) return;

  const area = state.curriculumData.find((a) => a.id === areaId);
  if (!area) return;

  const concept = area.concepts.find((c) => c.title === conceptTitle);
  if (concept) {
    document.getElementById('planner-header-title').innerText = concept.title;
    document.getElementById('planner-header-desc').innerText  = concept.description || '';
    document.getElementById('planner-level-desc').innerText   =
      concept.levels[`l${state.currentPlannerLevel}`] || 'No level progression statement defined.';
    document.getElementById('planner-context-level-num').innerText = state.currentPlannerLevel;
  }

  const container = document.getElementById('planner-active-level-view');
  container.innerHTML = '';

  const key = `${conceptTitle}_${organiserName}_L${state.currentPlannerLevel}`;
  if (!state.currentPlannerData.mappings[key]) {
    state.currentPlannerData.mappings[key] = {
      groups: [{ sequence: 1, name: '', knowItems: [''], doItems: [''], competencyId: '' }],
    };
  }

  const levelData = state.currentPlannerData.mappings[key];
  const grid = document.createElement('div');
  grid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 items-start';

  const addBtn = document.createElement('button');
  addBtn.onclick = () => addPlannerGroup(key);
  addBtn.className =
    'group border-2 border-dashed border-slate-300 rounded-xl p-8 hover:border-indigo-400 hover:bg-indigo-50 transition flex flex-col items-center justify-center space-y-2 h-full min-h-[300px]';
  addBtn.innerHTML = `
    <div class="p-3 bg-white rounded-full shadow-sm group-hover:scale-110 transition">
      <svg class="w-6 h-6 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
      </svg>
    </div>
    <span class="font-bold text-slate-500 group-hover:text-indigo-600">New Bundle</span>`;

  (levelData.groups || []).forEach((group, index) => {
    grid.appendChild(createPlannerGroupEl(key, index, group));
  });
  grid.appendChild(addBtn);
  container.appendChild(grid);
  triggerMath();
}

// ── Bundle card builder ───────────────────────────────────────────────────────

function createPlannerGroupEl(key, index, group) {
  const safeId = getSafeId(key, index);
  const compOptions =
    '<option value="">-- No Competency --</option>' +
    state.competencyData
      .map(
        (c) =>
          `<option value="${c.id}" ${group.competencyId === c.id ? 'selected' : ''}>${escapeHtml(c.title)}</option>`,
      )
      .join('');

  const div = document.createElement('div');
  div.className = 'bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col h-full';
  div.innerHTML = `
    <div class="p-3 bg-slate-50 border-b flex justify-between items-center">
      <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Bundle ${group.sequence || index + 1}</span>
      <button onclick="removePlannerGroup('${key}', ${index})" class="text-slate-300 hover:text-red-500 p-1">&times;</button>
    </div>
    <div class="p-4 space-y-4">
      <div class="space-y-1">
        <label class="text-[9px] font-bold text-slate-500 uppercase tracking-wide">Bundle Name</label>
        <input type="text" oninput="updatePlannerValue('${key}', ${index}, 'name', this.value)"
          class="w-full text-xs font-bold border border-slate-200 bg-white rounded-lg px-2.5 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          placeholder="e.g. Core Fundamentals" value="${escapeHtml(group.name || '')}">
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
          <button onclick="addPlannerItem('${key}', ${index}, 'knowItems')" class="text-[10px] text-indigo-500 font-bold hover:underline">+ Add Know</button>
        </div>
        <div class="space-y-2" id="know-items-${safeId}"></div>
      </div>
      <div class="space-y-3 pt-2 border-t">
        <div class="flex justify-between items-center">
          <label class="text-[10px] font-bold text-emerald-600 uppercase tracking-wide">Do</label>
          <button onclick="addPlannerItem('${key}', ${index}, 'doItems')" class="text-[10px] text-indigo-500 font-bold hover:underline">+ Add Do</button>
        </div>
        <div class="space-y-2" id="do-items-${safeId}"></div>
      </div>
    </div>`;

  setTimeout(() => {
    const kContainer = document.getElementById(`know-items-${safeId}`);
    const dContainer = document.getElementById(`do-items-${safeId}`);
    if (kContainer && dContainer) {
      kContainer.innerHTML = '';
      dContainer.innerHTML = '';
      (group.knowItems || []).forEach((item, i) =>
        kContainer.appendChild(createItemInput(key, index, 'knowItems', i, item)),
      );
      (group.doItems || []).forEach((item, i) =>
        dContainer.appendChild(createItemInput(key, index, 'doItems', i, item)),
      );
      triggerMath();
    }
  }, 0);

  return div;
}

// ── Statement input builder ───────────────────────────────────────────────────

function createItemInput(key, bundleIndex, listType, itemIndex, value) {
  const safeId    = getSafeId(key, bundleIndex);
  const previewId = `preview-${safeId}-${listType}-${itemIndex}`;
  const div = document.createElement('div');
  div.className =
    'group/item bg-slate-50 border border-slate-100 rounded-lg p-2 transition hover:bg-white hover:border-slate-200 hover:shadow-sm';
  div.innerHTML = `
    <div class="flex items-center space-x-2">
      <textarea
        onblur="cleanupEmptyItems('${key}', ${bundleIndex}, '${listType}')"
        oninput="updatePlannerItemValue('${key}', ${bundleIndex}, '${listType}', ${itemIndex}, this.value, '${previewId}')"
        class="flex-1 text-[11px] bg-transparent border-none focus:ring-0 p-0 resize-none min-h-[1.5rem]"
        placeholder="Type statement..." rows="1">${escapeHtml(value)}</textarea>
      <button onclick="removePlannerItem('${key}', ${bundleIndex}, '${listType}', ${itemIndex})"
        class="text-slate-300 hover:text-red-500 text-xs opacity-0 group-hover/item:opacity-100 transition-opacity">&times;</button>
    </div>
    <div class="math-preview hidden" id="${previewId}"></div>`;
  return div;
}

// ── Planner mutation helpers (exposed to window for inline handlers) ───────────

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
  autoSaveTimeout = setTimeout(() => savePlannerState(), 800);
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
  autoSaveTimeout = setTimeout(() => savePlannerState(), 800);
};

window.addPlannerGroup = (key) => {
  if (!state.currentPlannerData.mappings[key]) {
    state.currentPlannerData.mappings[key] = { groups: [] };
  }
  state.currentPlannerData.mappings[key].groups.push({
    sequence:    state.currentPlannerData.mappings[key].groups.length + 1,
    name:        '',
    knowItems:   [''],
    doItems:     [''],
    competencyId: '',
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
    // Keep allPlanningData in sync immediately so the matrix and overview
    // reflect changes without waiting for the collection snapshot round-trip.
    state.allPlanningData[areaId] = state.currentPlannerData;
  } catch (e) {
    console.error(e);
  }
}
