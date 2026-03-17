/**
 * competencies.js
 * Handles the Competencies view: rendering cards, opening/closing the
 * editor modal, and saving/deleting competency documents in Firestore.
 */

import { db, APP_ID }          from './firebase.js';
import { state, escapeHtml, triggerMath } from './state.js';
import {
  collection, doc, addDoc, setDoc, deleteDoc,
} from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js';

// ── Card grid renderer ────────────────────────────────────────────────────────

export function renderCompetenciesUI() {
  const grid = document.getElementById('competency-grid');

  if (state.competencyData.length === 0) {
    grid.innerHTML = '';
    return;
  }

  grid.innerHTML = state.competencyData
    .map(
      (comp) => `
    <div class="bg-white border rounded-xl p-5 card border-l-4 border-l-violet-500">
      <div class="flex justify-between items-start mb-2">
        <h3 class="font-bold text-slate-800 text-lg leading-tight">${escapeHtml(comp.title)}</h3>
        <div class="flex space-x-1">
          <button onclick="openCompetencyModal('${comp.id}')" class="text-violet-600 p-1.5 hover:bg-violet-50 rounded transition">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
          </button>
          <button onclick="deleteCompetency('${comp.id}')" class="text-red-600 p-1.5 hover:bg-red-50 rounded transition">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
          </button>
        </div>
      </div>
      <p class="text-xs text-slate-500 mb-4 line-clamp-3">${escapeHtml(comp.description)}</p>
    </div>`,
    )
    .join('');

  triggerMath();
}

// ── Info overlay (read-only view) ─────────────────────────────────────────────

window.showCompInfo = (id) => {
  const comp = state.competencyData.find((c) => c.id === id);
  if (!comp) return;

  document.getElementById('comp-info-title').innerText = comp.title;
  document.getElementById('comp-info-desc').innerText  = comp.description;

  const list = document.getElementById('comp-info-indicators');
  list.innerHTML = (comp.indicators || [])
    .map(
      (ind) => `
    <li class="flex items-start gap-2 text-xs text-slate-600 bg-slate-50 p-2 rounded border border-slate-100">
      <span class="text-violet-500 font-bold mt-0.5">•</span>
      <span>${escapeHtml(ind.text)}</span>
    </li>`,
    )
    .join('');

  if (!comp.indicators?.length) {
    list.innerHTML = '<li class="text-xs text-slate-400 italic">No indicator statements defined.</li>';
  }

  document.getElementById('comp-info-overlay').classList.remove('hidden');
};

window.closeCompInfo = () => document.getElementById('comp-info-overlay').classList.add('hidden');

// ── Modal helpers ─────────────────────────────────────────────────────────────

window.openCompetencyModal = (id = null) => {
  const form = document.getElementById('competency-form');
  form.reset();
  document.getElementById('comp-id').value = id || '';
  document.getElementById('indicators-list').innerHTML = '';

  if (id) {
    const comp = state.competencyData.find((c) => c.id === id);
    document.getElementById('comp-title').value       = comp.title;
    document.getElementById('comp-description').value = comp.description;
    (comp.indicators || []).forEach((ind) => addIndicatorRow(ind.text));
  } else {
    addIndicatorRow();
  }

  document.getElementById('competency-modal').classList.remove('hidden');
};

window.closeCompetencyModal = () =>
  document.getElementById('competency-modal').classList.add('hidden');

// ── Form row builder ──────────────────────────────────────────────────────────

window.addIndicatorRow = (text = '') => {
  const container = document.getElementById('indicators-list');
  const div = document.createElement('div');
  div.className = 'indicator-item flex items-center space-x-2 bg-slate-50 p-2 rounded-lg border group';
  div.innerHTML = `
    <input type="text" placeholder="Indicator statement" class="ind-text w-full text-sm bg-transparent border-none focus:ring-0 p-0" value="${escapeHtml(text)}">
    <button type="button" onclick="this.parentElement.remove()" class="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition">&times;</button>`;
  container.appendChild(div);
};

// ── Save / Delete ─────────────────────────────────────────────────────────────

window.saveCompetency = async () => {
  if (!state.user) return;

  const id          = document.getElementById('comp-id').value;
  const title       = document.getElementById('comp-title').value;
  const description = document.getElementById('comp-description').value;
  if (!title) return;

  const indicators = Array.from(document.querySelectorAll('.indicator-item'))
    .map((item) => ({ text: item.querySelector('.ind-text').value }))
    .filter((i) => i.text.trim());

  const data = { title, description, indicators, updatedAt: new Date().toISOString() };
  const colRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'competencies');

  try {
    if (id) await setDoc(doc(colRef, id), data, { merge: true });
    else     await addDoc(colRef, data);
    window.closeCompetencyModal();
  } catch (e) {
    console.error(e);
  }
};

window.deleteCompetency = async (id) => {
  if (!confirm('Delete this competency?')) return;
  try {
    await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'competencies', id));
  } catch (e) {
    console.error(e);
  }
};
