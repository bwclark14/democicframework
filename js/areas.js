/**
 * areas.js
 * Handles the Curriculum Areas view: rendering cards, opening/closing the
 * editor modal, and saving/deleting area documents in Firestore.
 */

import { db, APP_ID }         from './firebase.js';
import { state, escapeHtml, triggerMath } from './state.js';
import {
  collection, doc, addDoc, setDoc, deleteDoc,
} from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js';

// ── Public dropdown updater (called after data changes) ───────────────────────

export function updateDropdowns() {
  const publicAreas = state.curriculumData.filter(
    (area) => (area.status || 'public') === 'public',
  );
  const options =
    '<option value="">Choose an area...</option>' +
    publicAreas
      .map((area) => `<option value="${area.id}">${escapeHtml(area.title)}</option>`)
      .join('');

  ['planner-area-select', 'overview-area-select', 'matrix-area-select'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const prev = el.value;
    el.innerHTML = options;
    el.value = prev;
  });
}

// ── Card grid renderer ────────────────────────────────────────────────────────

export function renderUI() {
  const grid  = document.getElementById('curriculum-grid');
  const empty = document.getElementById('empty-state');

  if (state.curriculumData.length === 0) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  grid.innerHTML = state.curriculumData
    .map(
      (area) => `
    <div class="bg-white border rounded-xl p-5 card flex flex-col h-full relative overflow-hidden">
      ${
        (area.status || 'public') === 'draft'
          ? `<div class="absolute top-0 right-0 bg-amber-500 text-white text-[8px] font-black px-2 py-0.5 uppercase tracking-widest shadow-sm">Draft</div>`
          : `<div class="absolute top-0 right-0 bg-emerald-500 text-white text-[8px] font-black px-2 py-0.5 uppercase tracking-widest shadow-sm">Public</div>`
      }
      <div class="flex justify-between items-start mb-2">
        <h3 class="font-bold text-slate-800 text-lg leading-tight pr-10">${escapeHtml(area.title)}</h3>
        <div class="flex space-x-1">
          <button onclick="openAreaModal('${area.id}')" class="text-indigo-600 p-1.5 hover:bg-indigo-50 rounded transition">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
          </button>
          <button onclick="deleteArea('${area.id}')" class="text-red-600 p-1.5 hover:bg-red-50 rounded transition">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
          </button>
        </div>
      </div>
      <p class="text-sm text-slate-500 line-clamp-2 italic mb-4">"${escapeHtml(area.rationale)}"</p>
      <div class="grid grid-cols-2 gap-2 mt-auto">
        <div class="bg-indigo-50 p-2 rounded text-center">
          <span class="block text-xs font-bold text-indigo-700">${area.bigIdeas?.length || 0}</span>
          <span class="text-[9px] uppercase font-bold text-indigo-400">Big Ideas</span>
        </div>
        <div class="bg-emerald-50 p-2 rounded text-center">
          <span class="block text-xs font-bold text-emerald-700">${area.concepts?.length || 0}</span>
          <span class="text-[9px] uppercase font-bold text-emerald-400">Concepts</span>
        </div>
      </div>
    </div>`,
    )
    .join('');

  triggerMath();
}

// ── Modal helpers ─────────────────────────────────────────────────────────────

window.openAreaModal = (id = null) => {
  const form = document.getElementById('area-form');
  form.reset();
  document.getElementById('area-id').value    = id || '';
  document.getElementById('area-status').value = 'public';
  document.getElementById('concepts-list').innerHTML   = '';
  document.getElementById('big-ideas-list').innerHTML  = '';
  document.getElementById('organisers-list').innerHTML = '';

  if (id) {
    const area = state.curriculumData.find((a) => a.id === id);
    document.getElementById('area-title').value    = area.title;
    document.getElementById('area-rationale').value = area.rationale;
    document.getElementById('area-status').value   = area.status || 'public';
    (area.bigIdeas  || []).forEach((bi) => addBigIdeaRow(bi.title, bi.description));
    (area.concepts  || []).forEach((c)  => addConceptRow(c));
    (area.organisers || []).forEach((o) => addOrganiserRow(o.name));
  } else {
    addBigIdeaRow();
    addConceptRow();
    addOrganiserRow();
  }

  document.getElementById('area-modal').classList.remove('hidden');
};

window.closeAreaModal = () => document.getElementById('area-modal').classList.add('hidden');

// ── Form row builders ─────────────────────────────────────────────────────────

window.addBigIdeaRow = (title = '', description = '') => {
  const container = document.getElementById('big-ideas-list');
  const div = document.createElement('div');
  div.className = 'big-idea-item bg-slate-50 border rounded-lg p-3 space-y-2 relative';
  div.innerHTML = `
    <button type="button" onclick="this.parentElement.remove()" class="absolute top-2 right-2 text-slate-300 hover:text-red-500">&times;</button>
    <input type="text" placeholder="Idea Title" class="bi-title w-full text-sm font-bold bg-transparent border-b border-slate-200 focus:border-indigo-500 focus:ring-0 p-1" value="${escapeHtml(title)}">
    <textarea placeholder="Description" rows="2" class="bi-desc w-full text-xs bg-transparent border-none focus:ring-0 p-1 resize-none">${escapeHtml(description)}</textarea>`;
  container.appendChild(div);
};

window.addConceptRow = (data = null) => {
  const container = document.getElementById('concepts-list');
  const div = document.createElement('div');
  div.className = 'concept-item bg-white border border-slate-200 rounded-lg overflow-hidden';
  div.innerHTML = `
    <div class="p-3 bg-emerald-50/30 border-b space-y-3">
      <div class="flex justify-between items-center">
        <input type="text" placeholder="Concept Name" class="c-title bg-transparent font-bold text-slate-800 border-none focus:ring-0 p-0 w-1/2" value="${escapeHtml(data?.title || '')}">
        <div class="flex items-center space-x-4">
          <button type="button" onclick="toggleProgression(this)" class="text-xs font-bold text-emerald-600 uppercase tracking-tight flex items-center">
            Progression
            <svg class="w-4 h-4 ml-1 rotate-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
          </button>
          <button type="button" onclick="this.closest('.concept-item').remove()" class="text-slate-300 hover:text-red-600 font-bold">&times;</button>
        </div>
      </div>
      <textarea placeholder="Overall Concept Description..." class="c-desc w-full text-xs bg-white border border-emerald-100 rounded-md p-2 focus:ring-emerald-500 min-h-[40px]">${escapeHtml(data?.description || '')}</textarea>
    </div>
    <div class="progression-panel collapse-content">
      <div class="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 bg-white">
        ${[1, 2, 3, 4]
          .map(
            (l) => `
          <div class="space-y-1">
            <label class="text-[10px] font-bold text-slate-400 uppercase">Level ${l}</label>
            <textarea class="c-l${l} w-full text-xs border border-slate-100 rounded p-2 h-24 focus:ring-emerald-500">${escapeHtml(data?.levels?.[`l${l}`] || '')}</textarea>
          </div>`,
          )
          .join('')}
      </div>
    </div>`;
  container.appendChild(div);
};

window.addOrganiserRow = (name = '') => {
  const container = document.getElementById('organisers-list');
  const div = document.createElement('div');
  div.className = 'organiser-item flex items-center space-x-1 bg-amber-50 border border-amber-100 px-2 py-1 rounded-md';
  div.innerHTML = `
    <input type="text" placeholder="Name" class="o-name bg-transparent text-xs font-bold text-amber-800 border-none focus:ring-0 p-0 w-24" value="${escapeHtml(name)}">
    <button type="button" onclick="this.parentElement.remove()" class="text-amber-300 hover:text-red-500 font-bold">&times;</button>`;
  container.appendChild(div);
};

// ── Toggle progression panel (also used in Overview) ─────────────────────────

window.toggleProgression = (btn) => {
  const item =
    btn.closest('.concept-item') ||
    btn.closest('div.bg-white.border.border-slate-200.rounded-xl.overflow-hidden') ||
    btn.closest('.overview-concept-card');
  const panel = item?.querySelector('.progression-panel') || item?.querySelector('.collapse-content');
  const icon  = item?.querySelector('.rotate-icon');
  if (panel) panel.classList.toggle('expanded');
  if (icon)  icon.classList.toggle('expanded');
};

// ── Save / Delete ─────────────────────────────────────────────────────────────

window.saveArea = async () => {
  if (!state.user) return;

  const id        = document.getElementById('area-id').value;
  const title     = document.getElementById('area-title').value;
  const rationale = document.getElementById('area-rationale').value;
  const status    = document.getElementById('area-status').value;
  if (!title) return;

  const bigIdeas = Array.from(document.querySelectorAll('.big-idea-item')).map((item) => ({
    title:       item.querySelector('.bi-title').value,
    description: item.querySelector('.bi-desc').value,
  })).filter((bi) => bi.title.trim());

  const concepts = Array.from(document.querySelectorAll('.concept-item')).map((item) => ({
    title:       item.querySelector('.c-title').value,
    description: item.querySelector('.c-desc').value,
    levels: {
      l1: item.querySelector('.c-l1').value,
      l2: item.querySelector('.c-l2').value,
      l3: item.querySelector('.c-l3').value,
      l4: item.querySelector('.c-l4').value,
    },
  })).filter((c) => c.title.trim());

  const organisers = Array.from(document.querySelectorAll('.organiser-item')).map((item) => ({
    name: item.querySelector('.o-name').value,
  })).filter((o) => o.name.trim());

  const data = { title, rationale, bigIdeas, concepts, organisers, status, updatedAt: new Date().toISOString() };
  const colRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'curriculumAreas');

  try {
    if (id) await setDoc(doc(colRef, id), data, { merge: true });
    else     await addDoc(colRef, data);
    window.closeAreaModal();
  } catch (e) {
    console.error(e);
  }
};

window.deleteArea = async (id) => {
  if (!state.user) return;
  const area = state.curriculumData.find((a) => a.id === id);
  if (!area) return;
  if (!confirm(`Are you sure you want to delete "${area.title}"?`)) return;
  try {
    await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'curriculumAreas', id));
    await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'planningMaps',    id));
  } catch (e) {
    console.error(e);
  }
};
