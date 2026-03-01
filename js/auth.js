import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getAuth,
    signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
    getFirestore,
    doc,
    setDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
const db = getFirestore(app);

// =====================
// 🎯 ELEMENTOS
// =====================

const form = document.getElementById("loginForm");
const msg = document.getElementById("authMessage");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const togglePassword = document.getElementById("togglePassword");
const progressBar = document.getElementById("progressBar");
const button = document.querySelector(".btn");

// =====================
// 🔄 PROGRESS BAR
// =====================

function startLoading() {
    progressBar.style.width = "40%";
    button.disabled = true;

    setTimeout(() => {
        progressBar.style.width = "70%";
    }, 200);
}

function finishLoading() {
    progressBar.style.width = "100%";

    setTimeout(() => {
        progressBar.style.width = "0%";
        button.disabled = false;
    }, 400);
}

// =====================
// 🔐 LOGIN
// =====================

form.addEventListener("submit", async (e) => {
    e.preventDefault();

    msg.textContent = "";

    const email = emailInput.value;
    const password = passwordInput.value;

    startLoading();

    try {

        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // 🔥 SALVA EMAIL DO USUÁRIO NO FIRESTORE
        await setDoc(doc(db, "users", user.uid), {
            email: user.email
        }, { merge: true });

        finishLoading();
        window.location.href = "dashboard.html";

    } catch (error) {
        finishLoading();
        msg.textContent = "❌ Email ou senha inválidos";
    }
});

// =====================
// 👁 TOGGLE SENHA
// =====================

togglePassword.addEventListener("click", () => {
    const isPassword = passwordInput.type === "password";

    passwordInput.type = isPassword ? "text" : "password";

    togglePassword.classList.toggle("bi-eye");
    togglePassword.classList.toggle("bi-eye-slash");
});