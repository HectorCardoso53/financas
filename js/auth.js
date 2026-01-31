import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getAuth,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// 🔑 CONFIG DO FIREBASE
const firebaseConfig = {
    apiKey: "AIzaSyC1GRcrtuas2y-gqKMceiVLp7i55XgRYGA",
    authDomain: "financeiro-686a0.firebaseapp.com",
    projectId: "financeiro-686a0",
    storageBucket: "financeiro-686a0.firebasestorage.app",
    messagingSenderId: "586895715102",
    appId: "1:586895715102:web:86cb196335f11fb47bb70f"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Elementos
const form = document.getElementById('loginForm');
const registerBtn = document.getElementById('registerBtn');
const msg = document.getElementById('authMessage');

const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');

// LOGIN
form.addEventListener('submit', (e) => {
    e.preventDefault();

    const email = emailInput.value;
    const password = passwordInput.value;

    signInWithEmailAndPassword(auth, email, password)
        .then(() => {
            window.location.href = "dashboard.html";
        })
        .catch(() => {
            msg.textContent = "❌ Email ou senha inválidos";
        });
});


