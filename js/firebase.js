/**
 * firebase.js
 * Initialises the Firebase app, Auth, and Firestore instances.
 * All other modules import {auth, db} from here.
 */

import { initializeApp }  from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js';
import { getAuth }        from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js';
import { getFirestore }   from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js';

const firebaseConfig = {
  apiKey:            'AIzaSyC3pqJakqLfpqMNuovxyfPsTtFFq8HH0UI',
  authDomain:        'curriculumorg-93da4.firebaseapp.com',
  projectId:         'curriculumorg-93da4',
  storageBucket:     'curriculumorg-93da4.firebasestorage.app',
  messagingSenderId: '736761700669',
  appId:             '1:736761700669:web:97ed08c68ea682ee516554',
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db   = getFirestore(app);

/** Shared Firestore collection root used by all modules. */
export const APP_ID = 'curriculum-org-master-2024';
