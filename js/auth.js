import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";

const form = document.getElementById("loginForm");
const msg = document.getElementById("authMessage");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const togglePassword = document.getElementById("togglePassword");
const progressBar = document.getElementById("progressBar");
const button = document.querySelector(".btn");

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

form.addEventListener("submit", async (e) => {
    e.preventDefault();

    msg.textContent = "";

    const email = emailInput.value;
    const password = passwordInput.value;

    startLoading();

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

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

togglePassword.addEventListener("click", () => {
    const isPassword = passwordInput.type === "password";

    passwordInput.type = isPassword ? "text" : "password";

    togglePassword.classList.toggle("bi-eye");
    togglePassword.classList.toggle("bi-eye-slash");
});
