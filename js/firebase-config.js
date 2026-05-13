import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC1GRcrtuas2y-gqKMceiVLp7i55XgRYGA",
  authDomain: "financeiro-686a0.firebaseapp.com",
  projectId: "financeiro-686a0",
  storageBucket: "financeiro-686a0.firebasestorage.app",
  messagingSenderId: "586895715102",
  appId: "1:586895715102:web:86cb196335f11fb47bb70f",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
