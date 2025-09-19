// public/config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyADRM_83skeLeGK4Mf67rzCRTcdDjOptY0",
  authDomain: "shweshop-mm.firebaseapp.com",
  projectId: "shweshop-mm",
  storageBucket: "shweshop-mm.firebasestorage.app",
  messagingSenderId: "361216212375",
  appId: "1:361216212375:web:fed19b7fe4072000c298d2",
  measurementId: "G-WBJJZZNLX6",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
