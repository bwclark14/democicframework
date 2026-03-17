/**
 * app.js
 * Application entry point.
 * Handles Firebase auth, Firestore real-time listeners, and view switching.
 */

import { auth, db, APP_ID }   from './firebase.js';
import { state, triggerMath } from './state.js';
import { renderUI, updateDropdowns } from './areas.js';
import { renderCompetenciesUI }      from './competencies.js';
import { renderPlannerGrid }         from './planner.js';
import { renderOverview }            from './overview.js';
import { renderMatrix, updateMatrixFilters } from './matrix.js';
import { renderExplorer, updateExplorerDropdown } from './explorer.js';

import { signInAnonymously, onAuthStateChanged }
  from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js';
import { collection, doc, onSnapshot }
  from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js';

// ── Auth ──────────────────────────────────────────────────────────────────────

onAuthStateChanged(auth, (u) => {
  state.user = u;
  if (u) {
    document.getElementById('user-display-id').innerText = `ID: ${u.uid.substring(0, 8)}`;
    document.getElementById('user-info').classList.remove('hidden');
    document.getElementById('loading-overlay').classList.add('hidden');
    listenToData();
  } else {
    signInAnonymously(auth);
  }
});

// ── Firestore real-time listeners ─────────────────────────────────────────────

function listenToData() {
  // Curriculum areas
  const areasRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'curriculumAreas');
  onSnapshot(areasRef, (snapshot) => {
    state.curriculumData = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderUI();
    updateDropdowns();
    updateExplorerDropdown();
  });

  // Competencies
  const compRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'competencies');
  onSnapshot(compRef, (snapshot) => {
    state.competencyData = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderCompetenciesUI();
    if (!isHidden('view-planner'))       renderPlannerGrid();
    if (!isHidden('view-overview'))      renderOverview();
    if (!isHidden('view-matrix'))        renderMatrix();
  });

  // Planning maps
  const planRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'planningMaps');
  onSnapshot(planRef, (snapshot) => {
    snapshot.docs.forEach((d) => {
      state.allPlanningData[d.id] = d.data();
    });
    if (!isHidden('view-matrix'))   renderMatrix();
    if (!isHidden('view-planner'))  renderPlannerGrid();
    if (!isHidden('view-overview')) renderOverview();
    if (!isHidden('view-explorer')) renderExplorer();
  });
}

// ── View switching ────────────────────────────────────────────────────────────

const VIEWS = ['designer', 'planner', 'overview', 'matrix', 'competencies', 'explorer'];

window.switchView = (view) => {
  VIEWS.forEach((v) => {
    document.getElementById(`view-${v}`).classList.add('hidden');
    document.getElementById(`nav-${v}`).classList.remove('bg-white', 'shadow-sm', 'text-indigo-600');
    document.getElementById(`nav-${v}`).classList.add('text-slate-500');
  });

  document.getElementById(`view-${view}`).classList.remove('hidden');
  document.getElementById(`nav-${view}`).classList.add('bg-white', 'shadow-sm', 'text-indigo-600');
  document.getElementById(`nav-${view}`).classList.remove('text-slate-500');

  // For views with an area select, auto-pick the first option when nothing
  // is selected so the user sees content immediately on first visit.
  if (view === 'overview' || view === 'matrix') {
    const selectId = view === 'overview' ? 'overview-area-select' : 'matrix-area-select';
    const sel = document.getElementById(selectId);
    if (sel && !sel.value && sel.options.length > 1) {
      sel.value = sel.options[1].value;
    }
  }

  if (view === 'overview')     renderOverview();
  if (view === 'matrix')       updateMatrixFilters();
  if (view === 'competencies') renderCompetenciesUI();
  if (view === 'planner')      renderPlannerGrid();
  if (view === 'explorer')     updateExplorerDropdown();

  setTimeout(triggerMath, 100);
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns true when the given view element is currently hidden. */
function isHidden(id) {
  return document.getElementById(id)?.classList.contains('hidden') ?? true;
}
