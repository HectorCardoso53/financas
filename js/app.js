import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  query,
  orderBy,
  deleteDoc,
  doc,
  updateDoc,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  Chart,
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/+esm";
import { auth, db } from "./firebase-config.js";
import { lerOFX, extrairTransacoes } from "./ofx-reader.js";
import { importarTransacoes, carregarTransacoesOFX } from "./firebase-import.js";

Chart.register(
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
);

const TIMEOUTS = {
  CLICK_RESET: 1000,
  PROFIT_CLICK_RESET: 2000,
  OVERLAY_DISMISS: 4000,
  SECRET_DISMISS: 5000,
  KONAMI_DISMISS: 6000,
  TOAST_DISMISS: 3000,
};

let currentUserId = null;
let financeChart = null;
let incomes = [];
let expenses = [];
let selectedMonth = "";
let selectedYear = "";
let saldoInicial = 0;

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  }[char]));
}

// Easter Eggs
let logoClicks = 0;
let profitClicks = 0;
let clickTimer;
let konamiCode = [];
const konamiSequence = [
  "ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown",
  "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a",
];
let typedText = "";

function showToast(message, type = "error") {
  const existing = document.querySelector(".app-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = "app-toast";
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
    background: ${type === "error" ? "#ef4444" : "#22c55e"};
    color: white; padding: 12px 24px; border-radius: 8px;
    font-size: 14px; font-weight: 500; z-index: 9999;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2); transition: opacity 0.3s;
  `;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, TIMEOUTS.TOAST_DISMISS);
}

window.showToast = showToast;

function validateTransactionInput(description, amount, date) {
  if (!description.trim()) return "Descrição é obrigatória.";
  if (isNaN(amount) || amount <= 0) return "Informe um valor maior que zero.";
  if (!date) return "A data é obrigatória.";
  return null;
}

// Proteção de rota
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "index.html";
  } else {
    currentUserId = user.uid;
    document.getElementById("userEmail").textContent = user.email;
    populateYears();
    loadData();
  }
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

async function loadData() {
  try {
    incomes = [];
    expenses = [];

    const incomesRef = collection(db, "users", currentUserId, "incomes");
    const expensesRef = collection(db, "users", currentUserId, "expenses");

    const [incomeSnap, expenseSnap] = await Promise.all([
      getDocs(query(incomesRef, orderBy("createdAt", "desc"))),
      getDocs(query(expensesRef, orderBy("createdAt", "desc"))),
    ]);

    incomeSnap.forEach((docSnap) => {
      incomes.push({ id: docSnap.id, ...docSnap.data() });
    });
    expenseSnap.forEach((docSnap) => {
      expenses.push({ id: docSnap.id, ...docSnap.data() });
    });

    // Carrega saldo inicial definido pelo usuário
    const configRef = doc(db, "users", currentUserId);
    const configSnap = await getDoc(configRef);
    saldoInicial = configSnap.exists() && configSnap.data().saldoInicial !== undefined ? configSnap.data().saldoInicial : 0;
    const labelEl = document.getElementById("saldoInicialLabel");
    if (labelEl) labelEl.textContent = saldoInicial !== 0 ? `base: ${formatCurrency(saldoInicial)}` : "clique para calibrar";

    // Carrega transações importadas via OFX e mescla no dashboard
    const ofx = await carregarTransacoesOFX(currentUserId, db);
    incomes.push(...ofx.incomes);
    expenses.push(...ofx.expenses);

    updateDashboard();
    renderTransactions();
    await loadCofre();

    // Expõe dados para módulos externos (retrospectiva, etc.)
    window._financeIncomes = incomes;
    window._financeExpenses = expenses;
    window._financeUserId = currentUserId;
    window.dispatchEvent(new CustomEvent('financialDataReady'));
  } catch (err) {
    console.error(err);
    showToast("Erro ao carregar dados. Verifique sua conexão.");
  }
}

// ============ COFRE ============
let cofreTransactions = [];
let cofreModalType = "deposit";

async function loadCofre() {
  const ref = collection(db, "users", currentUserId, "cofreTransactions");
  const snap = await getDocs(query(ref, orderBy("createdAt", "desc")));
  cofreTransactions = [];
  snap.forEach(d => cofreTransactions.push({ id: d.id, ...d.data() }));
  renderCofre();
}

function getCofreBalance() {
  return cofreTransactions.reduce((total, t) =>
    t.type === "deposit" ? total + t.amount : total - t.amount, 0);
}

function renderCofre() {
  document.getElementById("cofreBalance").textContent = formatCurrency(getCofreBalance());

  const el = document.getElementById("cofreHistory");
  if (cofreTransactions.length === 0) {
    el.innerHTML = `<div class="empty-state" style="padding:20px"><p>Nenhuma movimentação ainda</p></div>`;
    return;
  }
  el.innerHTML = cofreTransactions.slice(0, 15).map(t => `
    <div class="cofre-history-item">
      <div>
        <div class="transaction-title">${t.description}</div>
        <div class="transaction-details">${formatDate(t.date)}</div>
      </div>
      <span class="${t.type === "deposit" ? "cofre-deposit-amount" : "cofre-withdraw-amount"}">
        ${t.type === "deposit" ? "+" : "-"} ${formatCurrency(t.amount)}
      </span>
    </div>
  `).join("");
  updateDashboard();
}

// ===== SALDO INICIAL =====
const saldoInicialModal = document.getElementById("saldoInicialModal");
const saldoInicialInput = document.getElementById("saldoInicialInput");
const saldoBancarioInput = document.getElementById("saldoBancarioInput");

applyMaskBRL(saldoInicialInput);
applyMaskBRL(saldoBancarioInput);

function abrirSaldoModal() {
  saldoInicialInput.value = saldoInicial !== 0 ? formatCurrency(Math.abs(saldoInicial)) : "";
  saldoBancarioInput.value = "";
  document.getElementById("calibracaoPreview").classList.add("hidden");
  saldoInicialModal.classList.remove("hidden");
}

document.getElementById("cardSaldo").addEventListener("click", abrirSaldoModal);

document.getElementById("closeSaldoInicialBtn").addEventListener("click", () =>
  saldoInicialModal.classList.add("hidden")
);

saldoInicialModal.addEventListener("click", (e) => {
  if (e.target === saldoInicialModal) saldoInicialModal.classList.add("hidden");
});

// Tabs do saldo modal
document.getElementById("tabCalibar").addEventListener("click", () => {
  document.getElementById("tabCalibar").classList.add("saldo-tab-active");
  document.getElementById("tabDireto").classList.remove("saldo-tab-active");
  document.getElementById("saldoPeloBanco").classList.remove("hidden");
  document.getElementById("saldoDireto").classList.add("hidden");
});

document.getElementById("tabDireto").addEventListener("click", () => {
  document.getElementById("tabDireto").classList.add("saldo-tab-active");
  document.getElementById("tabCalibar").classList.remove("saldo-tab-active");
  document.getElementById("saldoDireto").classList.remove("hidden");
  document.getElementById("saldoPeloBanco").classList.add("hidden");
});

// Calibrar: mostra preview ao digitar
saldoBancarioInput.addEventListener("input", () => {
  const saldoBanco = parseBRL(saldoBancarioInput.value);
  if (!saldoBanco) {
    document.getElementById("calibracaoPreview").classList.add("hidden");
    return;
  }
  const totalReceitas = incomes.reduce((s, i) => s + i.amount, 0);
  const totalDespesas = expenses.filter((e) => e.paid && !e.cartaoDetalhe).reduce((s, e) => s + e.amount, 0);
  const ajuste = saldoBanco - (totalReceitas - totalDespesas - getCofreBalance());
  const preview = document.getElementById("calibracaoPreview");
  preview.classList.remove("hidden");
  preview.innerHTML = `
    Banco: <strong>${formatCurrency(saldoBanco)}</strong><br>
    App calcula: <strong>${formatCurrency(totalReceitas - totalDespesas - getCofreBalance())}</strong><br>
    Ajuste necessário: <span class="preview-resultado">${formatCurrency(ajuste)}</span>
  `;
});

// Salvar calibração
document.getElementById("calibrarSaldoBtn").addEventListener("click", async () => {
  const saldoBanco = parseBRL(saldoBancarioInput.value);
  if (!saldoBanco && saldoBanco !== 0) { showToast("Informe o saldo do banco."); return; }
  const totalReceitas = incomes.reduce((s, i) => s + i.amount, 0);
  const totalDespesas = expenses.filter((e) => e.paid && !e.cartaoDetalhe).reduce((s, e) => s + e.amount, 0);
  const ajuste = saldoBanco - (totalReceitas - totalDespesas - getCofreBalance());
  const ref = doc(db, "users", currentUserId);
  await setDoc(ref, { saldoInicial: ajuste }, { merge: true });
  saldoInicial = ajuste;
  saldoInicialModal.classList.add("hidden");
  document.getElementById("saldoInicialLabel").textContent = `base: ${formatCurrency(ajuste)}`;
  updateDashboard();
  showToast(`Saldo calibrado! Ajuste: ${formatCurrency(ajuste)}`, "success");
});

// Salvar manual
document.getElementById("salvarSaldoInicialBtn").addEventListener("click", async () => {
  const valor = parseBRL(saldoInicialInput.value);
  const ref = doc(db, "users", currentUserId);
  await setDoc(ref, { saldoInicial: valor }, { merge: true });
  saldoInicial = valor;
  saldoInicialModal.classList.add("hidden");
  document.getElementById("saldoInicialLabel").textContent = `base: ${formatCurrency(valor)}`;
  updateDashboard();
  showToast("Saldo inicial salvo!", "success");
});

const cofreModal = document.getElementById("cofreModal");

const cofreFormModal = document.getElementById("cofreFormModal");

function openCofreFormModal(type) {
  cofreModalType = type;
  const isDeposit = type === "deposit";
  document.getElementById("cofreFormIcon").textContent = isDeposit ? "💰" : "💸";
  document.getElementById("cofreModalTitle").textContent = isDeposit ? "Depositar" : "Retirar";
  document.getElementById("cofreModalBalanceDisplay").textContent = formatCurrency(getCofreBalance());
  const btn = document.getElementById("cofreConfirmBtn");
  btn.className = `btn cofre-confirm-btn ${isDeposit ? "btn-cofre-deposit" : "btn-cofre-withdraw"}`;
  btn.innerHTML = isDeposit ? `<i class="bi bi-check-lg"></i> Depositar` : `<i class="bi bi-check-lg"></i> Retirar`;
  document.getElementById("cofreAmount").value = "";
  document.getElementById("cofreDescription").value = "";
  cofreFormModal.classList.remove("hidden");
}

document.getElementById("cofreDepositBtn").addEventListener("click", () => openCofreFormModal("deposit"));
document.getElementById("cofreWithdrawBtn").addEventListener("click", () => openCofreFormModal("withdraw"));

document.getElementById("closeCofreFormBtn").addEventListener("click", () => {
  cofreFormModal.classList.add("hidden");
});

document.getElementById("closeCofreBtn").addEventListener("click", () => {
  cofreModal.classList.add("hidden");
});

cofreModal.addEventListener("click", (e) => {
  if (e.target === cofreModal) cofreModal.classList.add("hidden");
});

document.getElementById("cofreConfirmBtn").addEventListener("click", async () => {
  const amount = parseBRL(document.getElementById("cofreAmount").value);
  const description = document.getElementById("cofreDescription").value.trim();

  if (!amount || amount <= 0) { showToast("Informe um valor válido."); return; }
  if (cofreModalType === "withdraw" && amount > getCofreBalance()) {
    showToast("Saldo insuficiente no cofre."); return;
  }

  try {
    await addDoc(collection(db, "users", currentUserId, "cofreTransactions"), {
      type: cofreModalType,
      amount,
      description: description || (cofreModalType === "deposit" ? "Depósito" : "Retirada"),
      date: getLocalDateString(),
      createdAt: new Date(),
    });
    cofreFormModal.classList.add("hidden");
    showToast(cofreModalType === "deposit" ? "✅ Depositado no cofre!" : "✅ Retirado do cofre!");
    await loadCofre();
  } catch {
    showToast("Erro ao salvar. Tente novamente.");
  }
});

const today = getLocalDateString();
document.getElementById("incomeDate").value = today;
document.getElementById("expenseDate").value = today;

// Adicionar Receita
document.getElementById("incomeForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const description = document.getElementById("incomeDescription").value;
  const amount = parseBRL(document.getElementById("incomeAmount").value);
  const category = document.getElementById("incomeCategory").value;
  const date = document.getElementById("incomeDate").value;

  const validationError = validateTransactionInput(description, amount, date);
  if (validationError) {
    showToast(validationError);
    return;
  }

  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;

  try {
    await addDoc(collection(db, "users", currentUserId, "incomes"), {
      description,
      amount,
      category,
      date,
      createdAt: new Date(),
    });

    e.target.reset();
    document.getElementById("incomeDate").value = today;
    showToast("Receita adicionada com sucesso!", "success");
    loadData();
  } catch {
    showToast("Erro ao adicionar receita. Tente novamente.");
  } finally {
    btn.disabled = false;
  }
});

// Adicionar Despesa
document.getElementById("expenseForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const description = document.getElementById("expenseDescription").value;
  const amount = parseBRL(document.getElementById("expenseAmount").value);
  const category = document.getElementById("expenseCategory").value;
  const date = document.getElementById("expenseDate").value;
  const cartaoId = document.getElementById("expenseCartaoId")?.value || null;

  const validationError = validateTransactionInput(description, amount, date);
  if (validationError) {
    showToast(validationError);
    return;
  }

  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;

  try {
    const expData = {
      description,
      amount,
      category,
      date,
      dueDate: date,
      createdAt: new Date(),
      paid: !cartaoId,
    };
    if (cartaoId) expData.cartaoId = cartaoId;
    await addDoc(collection(db, "users", currentUserId, "expenses"), expData);
    document.getElementById("expenseCartaoId").value = '';

    e.target.reset();
    document.getElementById("expenseDate").value = today;
    showToast("Despesa adicionada com sucesso!", "success");
    loadData();
  } catch {
    showToast("Erro ao adicionar despesa. Tente novamente.");
  } finally {
    btn.disabled = false;
  }
});

// Funções globais usadas pelos modais do dashboard.html
window.saveExpense = async function(data) {
  if (!currentUserId) { showToast("Usuário não autenticado."); return false; }
  const amount = typeof data.amount === 'number' ? data.amount : parseBRL(String(data.amount));
  const validationError = validateTransactionInput(data.description, amount, data.date);
  if (validationError) { showToast(validationError); return false; }
  try {
    const expData = {
      description: data.description,
      amount,
      category: data.category || 'outros',
      date: data.date,
      dueDate: data.date,
      createdAt: new Date(),
      paid: !data.cartaoId,
      recorrente: !!data.recorrente,
    };
    if (data.cartaoId) { expData.cartaoId = data.cartaoId; expData.cartaoDetalhe = true; }
    await addDoc(collection(db, "users", currentUserId, "expenses"), expData);
    showToast("Despesa adicionada com sucesso!", "success");
    loadData();
    return true;
  } catch (err) {
    console.error(err);
    showToast("Erro ao adicionar despesa. Tente novamente.");
    return false;
  }
};

window.saveIncome = async function(data) {
  if (!currentUserId) { showToast("Usuário não autenticado."); return false; }
  const amount = typeof data.amount === 'number' ? data.amount : parseBRL(String(data.amount));
  const validationError = validateTransactionInput(data.description, amount, data.date);
  if (validationError) { showToast(validationError); return false; }
  try {
    await addDoc(collection(db, "users", currentUserId, "incomes"), {
      description: data.description,
      amount,
      category: data.category || 'outros',
      date: data.date,
      createdAt: new Date(),
      recorrente: !!data.recorrente,
    });
    showToast("Receita adicionada com sucesso!", "success");
    loadData();
    return true;
  } catch (err) {
    console.error(err);
    showToast("Erro ao adicionar receita. Tente novamente.");
    return false;
  }
};

function analyzeYear(year) {
  const yearIncomes = incomes.filter((i) => new Date(i.date).getFullYear() === year);
  const yearExpenses = expenses.filter((e) => new Date(e.date).getFullYear() === year);

  const totalIncome = yearIncomes.reduce((s, i) => s + i.amount, 0);
  const totalExpense = yearExpenses.reduce((s, e) => s + e.amount, 0);

  return { totalIncome, totalExpense, balance: totalIncome - totalExpense };
}

function generateAISuggestionByYear(year) {
  const data = analyzeYear(year);

  if (data.totalIncome === 0 && data.totalExpense === 0) {
    return `Analisei ${year} e não encontrei movimentações financeiras ainda.\n\nDica: registre suas receitas e despesas para eu conseguir te ajudar melhor.`;
  }

  const expenseRatio = data.totalExpense / (data.totalIncome || 1);

  let message = `Análise financeira de ${year}\n\n`;
  message += `Receita total: ${formatCurrency(data.totalIncome)}\n`;
  message += `Despesas totais: ${formatCurrency(data.totalExpense)}\n`;
  message += `Saldo final: ${formatCurrency(data.balance)}\n\n`;

  if (expenseRatio > 0.9) {
    message += `Atenção: seus gastos estão muito próximos da sua renda.\nSugestão: reduza despesas em pelo menos 15%.`;
  } else if (expenseRatio > 0.7) {
    message += `Situação controlada.\nTente guardar 10% da sua renda mensal.`;
  } else {
    message += `Excelente controle financeiro.\nConsidere investir parte do valor que sobra.`;
  }

  return message;
}

function analyzeMonthYear(month, year) {
  const monthIncomes = incomes.filter((i) => {
    const [y, m] = i.date.split("-");
    return parseInt(y) === year && parseInt(m) - 1 === month;
  });

  const monthExpenses = expenses.filter((e) => {
    const [y, m] = e.date.split("-");
    return parseInt(y) === year && parseInt(m) - 1 === month;
  });

  const totalIncome = monthIncomes.reduce((s, i) => s + i.amount, 0);
  const totalExpense = monthExpenses.reduce((s, e) => s + e.amount, 0);

  return { totalIncome, totalExpense, balance: totalIncome - totalExpense };
}

function generateAISuggestion() {
  if (selectedYear === "") {
    return `Selecione um ANO para que eu possa analisar suas finanças.`;
  }

  if (selectedMonth !== "") {
    const month = parseInt(selectedMonth);
    const year = parseInt(selectedYear);
    const data = analyzeMonthYear(month, year);

    const monthNames = [
      "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
      "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
    ];

    if (data.totalIncome === 0 && data.totalExpense === 0) {
      return `Não encontrei movimentações em ${monthNames[month]} de ${year}.\nRegistre suas receitas e despesas para análise.`;
    }

    const ratio = data.totalExpense / (data.totalIncome || 1);

    let msg = `Análise de ${monthNames[month]} / ${year}\n\n`;
    msg += `Receitas: ${formatCurrency(data.totalIncome)}\n`;
    msg += `Despesas: ${formatCurrency(data.totalExpense)}\n`;
    msg += `Resultado: ${formatCurrency(data.balance)}\n\n`;

    if (ratio > 0.9) {
      msg += `Alerta: você gastou quase tudo que ganhou neste mês.`;
    } else if (ratio > 0.7) {
      msg += `Situação controlada, mas pode melhorar.`;
    } else {
      msg += `Excelente controle financeiro neste mês.`;
    }

    return msg;
  }

  return generateAISuggestionByYear(parseInt(selectedYear));
}

const robotCoachBtn = document.getElementById("robotCoach");
if (robotCoachBtn) {
  robotCoachBtn.addEventListener("click", () => {
    document.getElementById("robotText").innerText = generateAISuggestion();
    document.getElementById("robotModal").classList.remove("hidden");
  });
}

function closeRobot() {
  document.getElementById("robotModal").classList.add("hidden");
}

document.getElementById("closeRobotBtn").addEventListener("click", closeRobot);
document.getElementById("closeRobotBtn2").addEventListener("click", closeRobot);

function updateDashboard() {
  const filteredIncomes = filterByDate(incomes);
  const filteredExpenses = filterByDate(expenses).filter((e) => e.paid && !e.cartaoDetalhe);

  const totalIncome = filteredIncomes.reduce((sum, item) => sum + item.amount, 0);
  const totalExpense = filteredExpenses.reduce((sum, item) => sum + item.amount, 0);
  const profit = totalIncome - totalExpense;

  const allIncome = incomes.reduce((sum, item) => sum + item.amount, 0);
  const allExpense = expenses.filter((e) => e.paid && !e.cartaoDetalhe).reduce((sum, item) => sum + item.amount, 0);
  const saldoAcumulado = saldoInicial + allIncome - allExpense - getCofreBalance();

  // Carry-forward: saldo acumulado até o início do mês visualizado
  const selMonth = selectedMonth !== "" ? parseInt(selectedMonth) : new Date().getMonth();
  const selYear  = selectedYear  !== "" ? parseInt(selectedYear)  : new Date().getFullYear();
  const isBeforeSelected = (dateStr) => {
    if (!dateStr) return false;
    const [y, m] = dateStr.split("-");
    const dy = parseInt(y), dm = parseInt(m) - 1;
    return dy < selYear || (dy === selYear && dm < selMonth);
  };
  const incBefore = incomes.filter((t) => isBeforeSelected(t.date));
  const expBefore = expenses.filter((t) => t.paid && !t.cartaoDetalhe && isBeforeSelected(t.date));
  const saldoInicialMes = saldoInicial
    + incBefore.reduce((s, t) => s + t.amount, 0)
    - expBefore.reduce((s, t) => s + t.amount, 0);
  window._btlInicialMes = formatCurrency(saldoInicialMes);

  document.getElementById("totalIncome").textContent = formatCurrency(totalIncome);
  document.getElementById("totalExpense").textContent = formatCurrency(totalExpense);
  document.getElementById("totalProfit").textContent = formatCurrency(profit);
  document.getElementById("currentBalance").textContent = formatCurrency(saldoAcumulado);
}

function filterByDate(list) {
  return list.filter((item) => {
    const [year, month] = item.date.split("-");
    const matchMonth = selectedMonth === "" || (parseInt(month) - 1).toString() === selectedMonth;
    const matchYear = selectedYear === "" || year === selectedYear;
    return matchMonth && matchYear;
  });
}

function renderYearlyComparisonChart(year) {
  const canvas = document.getElementById("financeChart");
  if (!canvas) return;

  if (financeChart) {
    financeChart.destroy();
  }

  const ctx = canvas.getContext("2d");

  const incomeGradient = ctx.createLinearGradient(0, 0, 0, 400);
  incomeGradient.addColorStop(0, "rgba(34,197,94,0.4)");
  incomeGradient.addColorStop(1, "rgba(34,197,94,0)");

  const expenseGradient = ctx.createLinearGradient(0, 0, 0, 400);
  expenseGradient.addColorStop(0, "rgba(239,68,68,0.4)");
  expenseGradient.addColorStop(1, "rgba(239,68,68,0)");

  const incomeByMonth = Array(12).fill(0);
  const expenseByMonth = Array(12).fill(0);

  incomes.forEach((i) => {
    const [y, m] = i.date.split("-");
    if (parseInt(y) === year) incomeByMonth[parseInt(m) - 1] += i.amount;
  });

  expenses.forEach((e) => {
    const [y, m] = e.date.split("-");
    if (parseInt(y) === year) expenseByMonth[parseInt(m) - 1] += e.amount;
  });

  financeChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"],
      datasets: [
        {
          label: "Receitas",
          data: incomeByMonth,
          borderColor: "#22c55e",
          backgroundColor: incomeGradient,
          fill: true,
          tension: 0.45,
          borderWidth: 3,
          pointRadius: 5,
          pointBackgroundColor: "#22c55e",
        },
        {
          label: "Despesas",
          data: expenseByMonth,
          borderColor: "#ef4444",
          backgroundColor: expenseGradient,
          fill: true,
          tension: 0.45,
          borderWidth: 3,
          pointRadius: 5,
          pointBackgroundColor: "#ef4444",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: { usePointStyle: true, padding: 20, font: { size: 14 } },
        },
        tooltip: {
          backgroundColor: "#111827",
          padding: 12,
          callbacks: { label: (ctx) => formatCurrency(ctx.raw) },
        },
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          beginAtZero: true,
          grid: { color: "#e5e7eb" },
          ticks: { callback: (v) => formatCurrency(v) },
        },
      },
    },
  });
}

const openChartBtn = document.getElementById("openChartBtn");
const chartModal = document.getElementById("chartModal");

function openChart() {
  if (!chartModal) return;
  if (selectedYear === "") {
    alert("Selecione um ANO para ver o resumo anual");
    return;
  }
  chartModal.classList.remove("hidden");
  setTimeout(() => renderYearlyComparisonChart(parseInt(selectedYear)), 50);
}

if (openChartBtn) openChartBtn.addEventListener("click", openChart);

function closeChart() {
  chartModal.classList.add("hidden");
  if (financeChart) {
    financeChart.destroy();
    financeChart = null;
  }
}

document.getElementById("closeChartBtn")?.addEventListener("click", closeChart);

// Hambúrguer menu
const hamburgerBtn = document.getElementById("hamburgerBtn");
const mobileMenu = document.getElementById("mobileMenu");

hamburgerBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  mobileMenu.classList.toggle("open");
});

document.addEventListener("click", (e) => {
  if (!mobileMenu.contains(e.target) && e.target !== hamburgerBtn) {
    mobileMenu.classList.remove("open");
  }
});

// Botões do menu mobile
const openChartBtnMobile = document.getElementById("openChartBtnMobile");
if (openChartBtnMobile) openChartBtnMobile.addEventListener("click", () => { mobileMenu.classList.remove("open"); openChart(); });

document.getElementById("shortcutIosMobileBtn")?.addEventListener("click", () => {
  mobileMenu.classList.remove("open");
  document.getElementById("shortcutIosSetupBtn").click();
});

document.getElementById("shortcutAndroidMobileBtn")?.addEventListener("click", () => {
  mobileMenu.classList.remove("open");
  document.getElementById("shortcutAndroidSetupBtn").click();
});

document.getElementById("logoutMobileBtn")?.addEventListener("click", () => {
  mobileMenu.classList.remove("open");
  document.getElementById("logoutBtn").click();
});

function scrollToCofre() {
  cofreModal.classList.remove("hidden");
}

document.getElementById("cofreHeaderBtn")?.addEventListener("click", scrollToCofre);

document.getElementById("cofreMobileBtn")?.addEventListener("click", () => {
  mobileMenu.classList.remove("open");
  scrollToCofre();
});

function renderTransactions() {
  const filteredIncomes = filterByDate(incomes);
  const filteredExpenses = filterByDate(expenses);

  const incomeList = document.getElementById("incomeList");

  if (filteredIncomes.length === 0) {
    incomeList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><i class="bi bi-inbox"></i></div>
        <p>Nenhuma receita registrada para o período</p>
      </div>
    `;
  } else {
    incomeList.innerHTML = filteredIncomes
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .map((item) => {
        const safeDescription = escapeHtml(item.description);
        const safeCategoryClass = escapeHtml(item.category);
        const safeCategoryName = escapeHtml(getCategoryName(item.category, "income"));

        const origemBadge = item.importado
          ? `<span class="badge-origem"><i class="bi bi-bank"></i> ${item.origem || "Importado"}</span>`
          : "";

        return `
        <div class="transaction-item" data-date="${item.date}" data-amount="${item.amount}">
          <div class="ti-icon-wrap income"><i class="bi bi-arrow-down-left"></i></div>
          <div class="transaction-info">
            <div class="transaction-title">${safeDescription}${origemBadge}</div>
            <div class="transaction-details">
              <span class="category-badge category-${safeCategoryClass}">${safeCategoryName}</span>
              <span class="ti-date">${formatDate(item.date)}</span>
            </div>
          </div>
          <div class="transaction-actions">
            <div class="transaction-amount income">+${formatCurrency(item.amount)}</div>
            <div class="ti-btns">
              <button class="ti-act-btn" data-edit data-id="${item.id}" data-type="income" title="Editar"><i class="bi bi-pencil"></i></button>
              <button class="ti-act-btn ti-act-del" data-delete data-id="${item.id}" data-type="income" title="Excluir"><i class="bi bi-trash3"></i></button>
            </div>
          </div>
        </div>
      `;
      })
      .join("");
  }

  const expenseList = document.getElementById("expenseList");

  if (filteredExpenses.length === 0) {
    expenseList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><i class="bi bi-inbox"></i></div>
        <p>Nenhuma despesa registrada para o período</p>
      </div>
    `;
  } else {
    expenseList.innerHTML = filteredExpenses
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .map((item) => {
        const safeDescription = escapeHtml(item.description);
        const safeCategoryClass = escapeHtml(item.category);
        const safeCategoryName = escapeHtml(getCategoryName(item.category, "expense"));

        const origemBadgeExp = item.importado
          ? `<span class="badge-origem"><i class="bi bi-bank"></i> ${item.origem || "Importado"}</span>`
          : "";

        return `
        <div class="transaction-item" data-date="${item.date}" data-amount="${item.amount}">
          <div class="ti-icon-wrap expense"><i class="bi bi-arrow-up-right"></i></div>
          <div class="transaction-info">
            <div class="transaction-title">${safeDescription}${origemBadgeExp}</div>
            <div class="transaction-details">
              <span class="category-badge category-${safeCategoryClass}">${safeCategoryName}</span>
              <span class="ti-date">${formatDate(item.date)}</span>
            </div>
          </div>
          <div class="transaction-actions">
            <div class="transaction-amount expense">-${formatCurrency(item.amount)}</div>
            <div class="ti-btns">
              <input type="checkbox" ${item.paid ? "checked" : ""} data-toggle-paid data-id="${item.id}" title="Marcar como paga" />
              <button class="ti-act-btn" data-edit data-id="${item.id}" data-type="expense" title="Editar"><i class="bi bi-pencil"></i></button>
              <button class="ti-act-btn ti-act-del" data-delete data-id="${item.id}" data-type="expense" title="Excluir"><i class="bi bi-trash3"></i></button>
            </div>
          </div>
        </div>
      `;
      })
      .join("");
  }

  // Atualiza widgets do Resumo após renderizar
  if (window.syncResumoWidgets) setTimeout(window.syncResumoWidgets, 20);

  // Expõe dados filtrados para outros módulos (ex: Transações)
  window._txData = { incomes: filteredIncomes, expenses: filteredExpenses };
  if (window.renderTransacoes) setTimeout(window.renderTransacoes, 0);
}

// Event delegation para ações nas listas
document.getElementById("incomeList").addEventListener("click", (e) => {
  const del = e.target.closest("[data-delete]");
  if (del) deleteTransaction(del.dataset.id, del.dataset.type);
  const edit = e.target.closest("[data-edit]");
  if (edit) openEditModal(edit.dataset.id, edit.dataset.type);
});

document.getElementById("expenseList").addEventListener("click", (e) => {
  const del = e.target.closest("[data-delete]");
  if (del) deleteTransaction(del.dataset.id, del.dataset.type);
  const edit = e.target.closest("[data-edit]");
  if (edit) openEditModal(edit.dataset.id, edit.dataset.type);
});

document.getElementById("expenseList").addEventListener("change", (e) => {
  const checkbox = e.target.closest("[data-toggle-paid]");
  if (checkbox) toggleExpensePaid(checkbox.dataset.id, checkbox.checked);
});

// ===== EDITAR TRANSAÇÃO =====
let editingId = null;
let editingType = null;

const INCOME_CATEGORIES = [
  { value: "salario", label: "Salário" },
  { value: "freelance", label: "Freelance" },
  { value: "investimentos", label: "Investimentos" },
  { value: "outros", label: "Outros" },
];

const EXPENSE_CATEGORIES = [
  { value: "alimentacao", label: "Alimentação" },
  { value: "transporte", label: "Transporte" },
  { value: "moradia", label: "Moradia" },
  { value: "lazer", label: "Lazer" },
  { value: "saude", label: "Saúde" },
  { value: "educacao", label: "Educação" },
  { value: "outros", label: "Outros" },
];

const editModal = document.getElementById("editModal");
const editDescription = document.getElementById("editDescription");
const editAmountInput = document.getElementById("editAmount");
const editCategory = document.getElementById("editCategory");
const editDate = document.getElementById("editDate");

applyMaskBRL(editAmountInput);

function openEditModal(id, type) {
  const list = type === "income" ? incomes : expenses;
  const item = list.find((i) => i.id === id);
  if (!item) return;

  editingId = id;
  editingType = type;

  document.getElementById("editModalTitle").textContent = type === "income" ? "Editar Receita" : "Editar Despesa";
  const isIncome = type === "income";
  const hdrIcon = document.getElementById("editModalIcon");
  const hdrEl   = document.getElementById("editModalHeader");
  hdrIcon.innerHTML = isIncome ? '<i class="bi bi-wallet2"></i>' : '<i class="bi bi-receipt"></i>';
  hdrIcon.style.cssText = isIncome
    ? 'background:rgba(16,185,129,0.15);color:#10b981;border-color:rgba(16,185,129,0.25)'
    : 'background:rgba(239,68,68,0.15);color:#ef4444;border-color:rgba(239,68,68,0.25)';
  if (hdrEl) hdrEl.style.setProperty('--nf-glow', isIncome ? 'rgba(16,185,129,0.13)' : 'rgba(239,68,68,0.13)');
  const saveBtn = document.getElementById('editConfirmBtn');
  if (saveBtn) saveBtn.style.cssText = isIncome
    ? 'background:#10b981;color:#fff;width:100%'
    : 'background:#ef4444;color:#fff;width:100%';

  const cats = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  editCategory.innerHTML = cats.map((c) =>
    `<option value="${c.value}" ${item.category === c.value ? "selected" : ""}>${c.label}</option>`
  ).join("");

  editDescription.value = item.description;
  editAmountInput.value = formatCurrency(item.amount);
  editDate.value = item.date;

  const isRec = !!item.recorrente;
  const colorClass = isIncome ? 'pt-green' : 'pt-red';
  [document.getElementById('editTipoUnica'), document.getElementById('editTipoRecorrente')].forEach(b => {
    b.classList.remove('pt-green', 'pt-red');
    b.classList.add(colorClass);
  });
  document.getElementById('editTipoUnica').classList.toggle('pt-active', !isRec);
  document.getElementById('editTipoRecorrente').classList.toggle('pt-active', isRec);

  editModal.classList.remove("hidden");
}

document.getElementById("closeEditBtn").addEventListener("click", () => editModal.classList.add("hidden"));
editModal.addEventListener("click", (e) => { if (e.target === editModal) editModal.classList.add("hidden"); });

document.getElementById('editTipoUnica').addEventListener('click', () => {
  document.getElementById('editTipoUnica').classList.add('pt-active');
  document.getElementById('editTipoRecorrente').classList.remove('pt-active');
});
document.getElementById('editTipoRecorrente').addEventListener('click', () => {
  document.getElementById('editTipoRecorrente').classList.add('pt-active');
  document.getElementById('editTipoUnica').classList.remove('pt-active');
});

document.getElementById("editConfirmBtn").addEventListener("click", async () => {
  const description = editDescription.value.trim();
  const amount = parseBRL(editAmountInput.value);
  const category = editCategory.value;
  const date = editDate.value;
  const recorrente = document.getElementById('editTipoRecorrente').classList.contains('pt-active');

  if (!description || amount <= 0 || !date) {
    showToast("Preencha todos os campos corretamente.", "error");
    return;
  }

  const collectionName = editingType === "income" ? "incomes" : "expenses";
  const ref = doc(db, "users", currentUserId, collectionName, editingId);
  await updateDoc(ref, { description, amount, category, date, recorrente });

  editModal.classList.add("hidden");
  showToast("Transação atualizada!", "success");
  await loadData();
});

// Expõe funções para uso direto pelos modais inline
window.openEditModal = openEditModal;
window.deleteTransaction = deleteTransaction;

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function applyMaskBRL(input) {
  input.addEventListener("input", (e) => {
    const digits = e.target.value.replace(/\D/g, "");
    const num = parseInt(digits || "0") / 100;
    e.target.value = num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  });
  input.addEventListener("focus", (e) => {
    if (e.target.value === "") e.target.value = "R$ 0,00";
  });
  input.addEventListener("blur", (e) => {
    if (e.target.value === "R$ 0,00") e.target.value = "";
  });
}

function parseBRL(value) {
  return parseFloat(value.replace(/[R$\s.]/g, "").replace(",", ".")) || 0;
}

applyMaskBRL(document.getElementById("incomeAmount"));
applyMaskBRL(document.getElementById("expenseAmount"));
applyMaskBRL(document.getElementById("cofreAmount"));

function formatDate(dateString) {
  const date = new Date(dateString + "T00:00:00");
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function getCategoryName(category, type) {
  const categories = {
    income: {
      salario: "Salário", freelance: "Freelance", investimentos: "Investimentos", outros: "Outros",
    },
    expense: {
      alimentacao: "Alimentação", transporte: "Transporte", moradia: "Moradia",
      lazer: "Lazer", saude: "Saúde", educacao: "Educação", outros: "Outros",
    },
  };
  return categories[type][category] || category;
}

// Easter Eggs
document.getElementById("logo").addEventListener("click", () => {
  logoClicks++;
  clearTimeout(clickTimer);
  if (logoClicks >= 3) {
    triggerStonksMode();
    logoClicks = 0;
  }
  clickTimer = setTimeout(() => { logoClicks = 0; }, TIMEOUTS.CLICK_RESET);
});

function triggerStonksMode() {
  const overlay = document.createElement("div");
  overlay.className = "stonks-overlay";
  overlay.innerHTML = `
    <div class="stonks-content">
      <h2 style="font-size: 2.5em; margin-bottom: 20px;">MODO PERFORMANCE ATIVADO</h2>
      <p style="font-size: 1.2em;">Suas finanças estão em crescimento.</p>
      <button class="close-btn" onclick="this.parentElement.parentElement.remove()">
        <i class="bi bi-x-lg"></i>
      </button>
    </div>
  `;
  document.body.appendChild(overlay);
  setTimeout(() => overlay.remove(), TIMEOUTS.OVERLAY_DISMISS);
}

document.getElementById("totalProfit").addEventListener("click", () => {
  profitClicks++;
  clearTimeout(clickTimer);
  if (profitClicks >= 5) {
    showSecretMessage();
    profitClicks = 0;
  }
  clickTimer = setTimeout(() => { profitClicks = 0; }, TIMEOUTS.PROFIT_CLICK_RESET);
});

function showSecretMessage() {
  const messages = [
    "Você está demonstrando excelente controle financeiro.",
    "Continue assim rumo à independência financeira.",
    "O segredo do sucesso é gastar menos do que se ganha.",
    "Foco e disciplina levam à estabilidade financeira.",
    "Cada valor economizado é um passo rumo ao crescimento.",
  ];

  const message = document.createElement("div");
  message.className = "secret-message";
  message.innerHTML = `
    <h3><i class="bi bi-star-fill"></i> Mensagem Especial</h3>
    <p style="font-size: 1.2em; margin: 20px 0;">
      ${messages[Math.floor(Math.random() * messages.length)]}
    </p>
    <p style="font-size: 0.9em; opacity: 0.9;">
      "O dinheiro é apenas uma ferramenta. Ele te levará aonde você quiser, mas não te substituirá como motorista." — Ayn Rand
    </p>
    <button class="close-btn" onclick="this.parentElement.remove()">
      <i class="bi bi-x-lg"></i>
    </button>
  `;
  document.body.appendChild(message);
  setTimeout(() => message.remove(), TIMEOUTS.SECRET_DISMISS);
}

document.addEventListener("keypress", (e) => {
  typedText += e.key.toLowerCase();
  typedText = typedText.slice(-13);
  if (typedText === "hacktheplanet") {
    triggerMatrix();
    typedText = "";
  }
});

function triggerMatrix() {
  const symbols = ["R$", "$", "€", "¥", "£", "₿", "0", "1", "💰", "💵"];
  for (let i = 0; i < 50; i++) {
    setTimeout(() => {
      const char = document.createElement("div");
      char.className = "matrix-char";
      char.textContent = symbols[Math.floor(Math.random() * symbols.length)];
      char.style.left = Math.random() * 100 + "vw";
      char.style.top = "-20px";
      document.body.appendChild(char);
      setTimeout(() => char.remove(), TIMEOUTS.OVERLAY_DISMISS);
    }, i * 100);
  }
}

document.addEventListener("keydown", (e) => {
  konamiCode.push(e.key);
  konamiCode = konamiCode.slice(-10);
  if (konamiCode.join("") === konamiSequence.join("")) {
    triggerKonamiSecret();
    konamiCode = [];
  }
});

function triggerKonamiSecret() {
  const secret = document.createElement("div");
  secret.className = "secret-message";
  secret.innerHTML = `
    <h3>🎮 CÓDIGO KONAMI ATIVADO! 🎮</h3>
    <p style="font-size: 3em; margin: 20px 0;">💎💰💎</p>
    <p style="font-size: 1.3em;">Modo DINHEIRO INFINITO desbloqueado!</p>
    <p style="font-size: 0.9em; margin-top: 15px; opacity: 0.8;">(Apenas na imaginação... continue se esforçando! 😄)</p>
    <p style="font-size: 2em; margin-top: 20px;">🎊 🎉 🎊</p>
    <button class="close-btn" onclick="this.parentElement.remove()">✕</button>
  `;
  document.body.appendChild(secret);
  setTimeout(() => secret.remove(), TIMEOUTS.KONAMI_DISMISS);
}

const filterYear = document.getElementById("filterYear");
const filterMonth = document.getElementById("filterMonth");

function populateYears() {
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  filterYear.innerHTML = "";
  for (let y = currentYear - 5; y <= currentYear + 5; y++) {
    filterYear.innerHTML += `<option value="${y}">${y}</option>`;
  }

  selectedYear = currentYear.toString();
  filterYear.value = selectedYear;
  selectedMonth = currentMonth.toString();
  filterMonth.value = selectedMonth;
}

filterYear.addEventListener("change", (e) => {
  selectedYear = e.target.value;
  updateDashboard();
  renderTransactions();
});

filterMonth.addEventListener("change", (e) => {
  selectedMonth = e.target.value;
  updateDashboard();
  renderTransactions();
});

async function deleteTransaction(id, type) {
  if (!confirm("Deseja realmente excluir?")) return;

  try {
    const ref = doc(db, "users", currentUserId, type === "income" ? "incomes" : "expenses", id);
    await deleteDoc(ref);
    loadData();
  } catch {
    showToast("Erro ao excluir. Tente novamente.");
  }
}

async function toggleExpensePaid(id, paid) {
  try {
    const ref = doc(db, "users", currentUserId, "expenses", id);
    await updateDoc(ref, { paid });
    loadData();
  } catch {
    showToast("Erro ao atualizar status. Tente novamente.");
  }
}

// =====================================================
// Configuracao dos atalhos de voz
// =====================================================

const VOICE_FUNCTION_URL = "https://us-central1-financeiro-686a0.cloudfunctions.net/voiceEntry";

async function openShortcutModal(platform = "ios") {
  document.getElementById("shortcutModal").classList.remove("hidden");
  document.getElementById("shortcutModalTitle").textContent =
    platform === "android" ? "Atalho Android" : "Atalho iPhone";

  const content = document.getElementById("shortcutContent");
  content.innerHTML = `<p style="text-align:center;padding:20px;opacity:0.6;">Gerando seu link seguro...</p>`;

  try {
    const userRef = doc(db, "users", currentUserId);
    const userSnap = await getDoc(userRef);
    let voiceToken = userSnap.exists() ? userSnap.data().voiceToken : null;

    if (!voiceToken) {
      voiceToken = crypto.randomUUID();
      await setDoc(userRef, { voiceToken }, { merge: true });
    }

    const uid = currentUserId;
    const baseUrl = VOICE_FUNCTION_URL;
    const fullUrl = `${baseUrl}?uid=${uid}&token=${voiceToken}&text=TEXTO_DITADO`;

    content.innerHTML = `
      <p style="margin-bottom:18px;">
        Escolha seu celular e siga os passos para registrar receitas e despesas por voz.
        Você só precisa fazer isso <strong>uma vez</strong>.
      </p>

      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin-bottom:18px;">
        <p style="font-size:12px;font-weight:600;color:#64748b;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px;">
          URL completa para conferência
        </p>
        <code style="font-size:11px;word-break:break-all;display:block;line-height:1.6;color:#1e293b;">
          ${fullUrl}
        </code>
        <p style="font-size:12px;color:#64748b;margin-top:10px;line-height:1.5;">
          No app Atalhos, use a URL base abaixo e coloque <code>uid</code>, <code>token</code> e <code>text</code> nos parÃ¢metros de consulta.
        </p>
      </div>

      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:24px;">
        <button id="copyUrlBtn" class="btn" style="flex:1;font-size:13px;">
          <i class="bi bi-clipboard"></i> Copiar URL base
        </button>
        <button id="copyFullUrlBtn" class="btn btn-secondary" style="flex:1;font-size:13px;">
          <i class="bi bi-link-45deg"></i> Copiar completa
        </button>
        <button id="copyUidBtn" class="btn btn-secondary" style="flex:1;font-size:13px;">
          <i class="bi bi-person"></i> Copiar UID
        </button>
        <button id="copyTokenBtn" class="btn btn-secondary" style="flex:1;font-size:13px;">
          <i class="bi bi-key"></i> Copiar Token
        </button>
      </div>

      <div id="iosGuide" style="display:${platform === "android" ? "none" : "block"};">
      <h4 style="margin-bottom:12px;font-size:15px;">Como montar o Atalho no iPhone:</h4>
      <ol style="line-height:2.2;font-size:14px;padding-left:20px;">
        <li>Abra o app <strong>Atalhos</strong> no iPhone</li>
        <li>Toque em <strong>"+"</strong> para criar um novo atalho</li>
        <li>Adicione a ação <strong>"Ditar Texto"</strong> — ela vai transcrever o que você falar</li>
        <li>Adicione a ação <strong>"Obter conteúdo de URL"</strong></li>
        <li>
          No campo URL, cole: <code style="font-size:12px;">${baseUrl}</code><br>
          Toque em <strong>Mostrar Mais</strong> e deixe o método como <strong>GET</strong>.<br>
          Em <em>Parâmetros de consulta</em>, adicione três itens:<br>
          &nbsp;&nbsp;• <code>uid</code> = <code>${uid}</code><br>
          &nbsp;&nbsp;• <code>token</code> = <code>${voiceToken}</code><br>
          &nbsp;&nbsp;• <code>text</code> = <em>variável "Texto Ditado"</em> do passo 3
        </li>
        <li>Adicione a ação <strong>"Obter valor de dicionário"</strong>: chave <code>message</code> de <em>Conteúdos do URL</em></li>
        <li>Adicione a ação <strong>"Mostrar resultado"</strong> usando o valor <code>message</code></li>
        <li>Dê o nome <strong>"Registrar gasto"</strong> e salve</li>
      </ol>
      </div>

      <div id="androidGuide" style="display:${platform === "android" ? "block" : "none"};">
        <h4 style="margin-bottom:12px;font-size:15px;">Se seu celular for Android:</h4>
        <ol style="line-height:2.2;font-size:14px;padding-left:20px;">
          <li>Instale o app <strong>Tasker</strong> ou <strong>Automate</strong></li>
          <li>Crie uma tarefa chamada <strong>"Registrar gasto"</strong></li>
          <li>Adicione uma etapa de <strong>entrada de voz</strong></li>
          <li>Adicione uma etapa <strong>HTTP Request</strong></li>
          <li>
            Metodo: <strong>GET</strong><br>
            URL: <code style="font-size:12px;">${baseUrl}</code><br>
            Parametros:<br>
            &nbsp;&nbsp;• <code>uid</code> = <code>${uid}</code><br>
            &nbsp;&nbsp;• <code>token</code> = <code>${voiceToken}</code><br>
            &nbsp;&nbsp;• <code>text</code> = texto capturado pela voz
          </li>
          <li>Mostre o campo <code>message</code> da resposta</li>
          <li>No Google Assistente, chame: <strong>"Ok Google, registrar gasto"</strong></li>
        </ol>
      </div>

      <div style="background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:12px;margin-top:16px;font-size:13px;">
        <strong>Exemplos de frases:</strong><br>
        "comprei pão 2 reais" · "gastei 50 no mercado" · "recebi 500 de salário"
      </div>
    `;

    document.getElementById("copyUrlBtn").addEventListener("click", () => {
      navigator.clipboard.writeText(baseUrl);
      showToast("URL base copiada!", "success");
    });
    document.getElementById("copyFullUrlBtn").addEventListener("click", () => {
      navigator.clipboard.writeText(fullUrl);
      showToast("URL completa copiada!", "success");
    });
    document.getElementById("copyUidBtn").addEventListener("click", () => {
      navigator.clipboard.writeText(uid);
      showToast("UID copiado!", "success");
    });
    document.getElementById("copyTokenBtn").addEventListener("click", () => {
      navigator.clipboard.writeText(voiceToken);
      showToast("Token copiado!", "success");
    });

  } catch {
    content.innerHTML = `<p style="color:#ef4444;">Erro ao gerar link. Tente novamente.</p>`;
  }
}

function closeShortcutModal() {
  document.getElementById("shortcutModal").classList.add("hidden");
}

document.getElementById("shortcutIosSetupBtn").addEventListener("click", () => openShortcutModal("ios"));
document.getElementById("shortcutAndroidSetupBtn").addEventListener("click", () => openShortcutModal("android"));
document.getElementById("closeShortcutBtn").addEventListener("click", closeShortcutModal);
document.getElementById("closeShortcutBtn2").addEventListener("click", closeShortcutModal);

// =====================================================
// IMPORTAÇÃO OFX
// =====================================================

const ofxFileInput = document.getElementById("ofxFileInput");
const ofxImportBtn = document.getElementById("ofxImportBtn");
const ofxMobileBtn = document.getElementById("ofxMobileBtn");
const ofxResumoModal = document.getElementById("ofxResumoModal");
const ofxResumoContent = document.getElementById("ofxResumoContent");

let ofxTransacoesCache = null;

function triggerOFXImport() {
  mobileMenu.classList.remove("open");
  ofxFileInput.click();
}

if (ofxImportBtn) ofxImportBtn.addEventListener("click", triggerOFXImport);
if (ofxMobileBtn) ofxMobileBtn.addEventListener("click", triggerOFXImport);

const ofxLimparBtn = document.getElementById("ofxLimparBtn");
if (ofxLimparBtn) ofxLimparBtn.addEventListener("click", async () => {
  if (!confirm("Isso vai apagar TODOS os dados (manuais e OFX). Confirma?")) return;
  mostrarProgressoOFX("Limpando base de dados...");
  ofxResumoModal.classList.remove("hidden");
  await deletarTodosManuais();
  await loadData();
  ofxResumoModal.classList.add("hidden");
  showToast("Base de dados limpa! Agora importe os arquivos OFX.", "success");
});

document.getElementById("closeOfxResumoBtn")?.addEventListener("click", () => {
  ofxResumoModal.classList.add("hidden");
  ofxTransacoesCache = null;
});

ofxFileInput.addEventListener("change", async (e) => {
  const arquivo = e.target.files[0];
  if (!arquivo) return;
  e.target.value = "";

  mostrarProgressoOFX("Lendo arquivo...");

  try {
    const texto = await lerOFX(arquivo);
    mostrarProgressoOFX("Interpretando movimentações...");
    const transacoes = extrairTransacoes(texto);

    // Detecta período do arquivo
    const datas = transacoes.map((t) => t.data).sort();
    const dataInicio = formatDate(datas[0]);
    const dataFim = formatDate(datas[datas.length - 1]);

    ofxTransacoesCache = transacoes;
    mostrarConfirmacaoOFX(transacoes.length, dataInicio, dataFim, datas[0], datas[datas.length - 1]);
  } catch (err) {
    ofxResumoModal.classList.add("hidden");
    showToast(err.message || "Erro ao importar OFX. Verifique o arquivo.", "error");
    console.error("Erro OFX:", err);
  }
});

function mostrarConfirmacaoOFX(total, dataInicio, dataFim, dataInicioRaw, dataFimRaw) {
  ofxResumoContent.innerHTML = `
    <div class="ofx-resumo-header">
      <i class="bi bi-file-earmark-arrow-down" style="font-size:1.6em;color:#818cf8"></i>
      <h3>Confirmar importação</h3>
    </div>
    <div class="ofx-periodo-info">
      <div class="ofx-periodo-total">
        <i class="bi bi-file-earmark-text"></i>
        <strong>${total}</strong> movimentações encontradas
      </div>
      <div class="ofx-periodo-datas">
        <i class="bi bi-calendar3" style="color:#818cf8"></i>
        <strong>${dataInicio}</strong>
        <span>→</span>
        <strong>${dataFim}</strong>
      </div>
    </div>
    <div class="ofx-opcoes">
      <button class="ofx-opcao-btn ofx-opcao-mesclar" id="ofxBtnMesclar">
        <i class="bi bi-plus-circle"></i>
        <div>
          <strong>Importar movimentações</strong>
          <span>Adiciona ao histórico sem apagar nada</span>
        </div>
      </button>
    </div>
    <button class="btn ofx-cancelar-btn" id="ofxBtnCancelar">Cancelar</button>
  `;
  ofxResumoModal.classList.remove("hidden");

  document.getElementById("ofxBtnCancelar").addEventListener("click", () => {
    ofxResumoModal.classList.add("hidden");
    ofxTransacoesCache = null;
  });

  document.getElementById("ofxBtnMesclar").addEventListener("click", () =>
    executarImportacaoOFX("mesclar", dataInicioRaw, dataFimRaw)
  );
}

async function executarImportacaoOFX(modo, dataInicio, dataFim) {
  const transacoes = ofxTransacoesCache;
  ofxTransacoesCache = null;

  try {
    if (modo === "limpar") {
      mostrarProgressoOFX("Apagando todos os lançamentos manuais...");
      await deletarTodosManuais();
    } else if (modo === "substituir") {
      mostrarProgressoOFX("Removendo lançamentos manuais do período...");
      await deletarManuaisNoPeriodo(dataInicio, dataFim);
    }

    mostrarProgressoOFX(`Salvando ${transacoes.length} movimentações...`);
    const resumo = await importarTransacoes(currentUserId, transacoes, db);
    mostrarProgressoOFX("Atualizando dashboard...");
    await loadData();
    mostrarResumo(resumo);
  } catch (err) {
    ofxResumoModal.classList.add("hidden");
    showToast(err.message || "Erro ao importar. Tente novamente.", "error");
    console.error("Erro OFX:", err);
  }
}

async function deletarManuaisNoPeriodo(dataInicio, dataFim) {
  const colecoes = ["incomes", "expenses"];
  for (const col of colecoes) {
    const ref = collection(db, "users", currentUserId, col);
    const snap = await getDocs(ref);
    const deletes = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      if (d.date >= dataInicio && d.date <= dataFim) {
        deletes.push(deleteDoc(doc(db, "users", currentUserId, col, docSnap.id)));
      }
    });
    await Promise.all(deletes);
  }
}

async function deletarTodosManuais() {
  // Apaga incomes, expenses E transacoes para começar do zero
  const colecoes = ["incomes", "expenses", "transacoes"];
  for (const col of colecoes) {
    const ref = collection(db, "users", currentUserId, col);
    const snap = await getDocs(ref);
    await Promise.all(snap.docs.map((d) => deleteDoc(doc(db, "users", currentUserId, col, d.id))));
  }
}

// =====================================================
// DIAGNÓSTICO DO BANCO DE DADOS
// =====================================================

const diagnosticoModal = document.getElementById("diagnosticoModal");
const diagnosticoContent = document.getElementById("diagnosticoContent");

document.getElementById("diagnosticoBtn")?.addEventListener("click", () => {
  diagnosticoModal.classList.remove("hidden");
  executarDiagnostico();
});

document.getElementById("closeDiagnosticoBtn")?.addEventListener("click", () => {
  diagnosticoModal.classList.add("hidden");
});

diagnosticoModal?.addEventListener("click", (e) => {
  if (e.target === diagnosticoModal) diagnosticoModal.classList.add("hidden");
});

async function executarDiagnostico() {
  diagnosticoContent.innerHTML = `
    <div class="ofx-progresso">
      <div class="ofx-spinner"></div>
      <p>Contando documentos no Firestore...</p>
    </div>
  `;

  try {
    const uid = currentUserId;
    const fmt = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

    const [snapIncomes, snapExpenses, snapTransacoes, snapCofre] = await Promise.all([
      getDocs(collection(db, "users", uid, "incomes")),
      getDocs(collection(db, "users", uid, "expenses")),
      getDocs(collection(db, "users", uid, "transacoes")),
      getDocs(collection(db, "users", uid, "cofreTransactions")),
    ]);

    const somaCampo = (snap, campo) => snap.docs.reduce((s, d) => s + (d.data()[campo] || 0), 0);

    const totalIncomes = somaCampo(snapIncomes, "amount");
    const totalExpenses = somaCampo(snapExpenses, "amount");

    const transacoesReceitas = snapTransacoes.docs.filter((d) => d.data().tipo === "receita");
    const transacoesDespesas = snapTransacoes.docs.filter((d) => d.data().tipo === "despesa");
    const totalTrReceitas = transacoesReceitas.reduce((s, d) => s + (d.data().valor || 0), 0);
    const totalTrDespesas = transacoesDespesas.reduce((s, d) => s + (d.data().valor || 0), 0);

    const totalCofre = snapCofre.docs.reduce((s, d) => {
      const t = d.data();
      return t.type === "deposit" ? s + t.amount : s - t.amount;
    }, 0);

    const totalGeralReceitas = totalIncomes + totalTrReceitas;
    const totalGeralDespesas = totalExpenses + totalTrDespesas;
    const saldoCalculado = saldoInicial + totalGeralReceitas - totalGeralDespesas - totalCofre;

    const temDuplicata = snapIncomes.size > 0 && snapTransacoes.size > 0;

    diagnosticoContent.innerHTML = `
      <div class="diag-title">
        <i class="bi bi-database-check"></i>
        Diagnóstico do banco de dados
      </div>

      <div class="diag-colecao">
        <div class="diag-colecao-header">
          <span class="diag-colecao-nome"><i class="bi bi-arrow-up-circle" style="color:#4ade80"></i> incomes (manuais)</span>
          <span class="diag-docs-count">${snapIncomes.size} docs</span>
        </div>
        <div class="diag-valores">
          <div class="diag-valor receita">Total: <strong>${fmt(totalIncomes)}</strong></div>
        </div>
      </div>

      <div class="diag-colecao">
        <div class="diag-colecao-header">
          <span class="diag-colecao-nome"><i class="bi bi-arrow-down-circle" style="color:#f87171"></i> expenses (manuais)</span>
          <span class="diag-docs-count">${snapExpenses.size} docs</span>
        </div>
        <div class="diag-valores">
          <div class="diag-valor despesa">Total: <strong>${fmt(totalExpenses)}</strong></div>
        </div>
      </div>

      <div class="diag-colecao">
        <div class="diag-colecao-header">
          <span class="diag-colecao-nome"><i class="bi bi-bank" style="color:#818cf8"></i> transacoes (OFX importado)</span>
          <span class="diag-docs-count">${snapTransacoes.size} docs</span>
        </div>
        <div class="diag-valores">
          <div class="diag-valor receita">Receitas: <strong>${fmt(totalTrReceitas)}</strong></div>
          <div class="diag-valor despesa">Despesas: <strong>${fmt(totalTrDespesas)}</strong></div>
        </div>
      </div>

      <div class="diag-colecao">
        <div class="diag-colecao-header">
          <span class="diag-colecao-nome"><i class="bi bi-safe2" style="color:#f59e0b"></i> cofre</span>
          <span class="diag-docs-count">${snapCofre.size} docs</span>
        </div>
        <div class="diag-valores">
          <div class="diag-valor neutro">Saldo cofre: <strong>${fmt(totalCofre)}</strong></div>
        </div>
      </div>

      <div class="diag-colecao" style="border-color:rgba(255,255,255,0.15)">
        <div class="diag-colecao-header">
          <span class="diag-colecao-nome"><i class="bi bi-calculator" style="color:#f59e0b"></i> Cálculo do saldo</span>
        </div>
        <div class="diag-valores" style="flex-direction:column;gap:4px">
          <div class="diag-valor">Saldo base: <strong style="color:#f59e0b">${fmt(saldoInicial)}</strong></div>
          <div class="diag-valor receita">+ Todas receitas: <strong>${fmt(totalGeralReceitas)}</strong></div>
          <div class="diag-valor despesa">− Todas despesas: <strong>${fmt(totalGeralDespesas)}</strong></div>
          <div class="diag-valor">− Cofre: <strong style="color:#f59e0b">${fmt(totalCofre)}</strong></div>
          <div class="diag-valor" style="border-top:1px solid rgba(255,255,255,0.1);padding-top:6px;margin-top:4px">
            = Saldo final: <strong style="color:#fff;font-size:1.1em">${fmt(saldoCalculado)}</strong>
          </div>
        </div>
      </div>

      ${temDuplicata ? `
      <div class="diag-alerta">
        <i class="bi bi-exclamation-triangle-fill"></i>
        <strong>Atenção:</strong> Você tem lançamentos em <em>incomes/expenses</em> (${snapIncomes.size + snapExpenses.size} docs)
        E também em <em>transacoes</em> (${snapTransacoes.size} docs). Se forem os mesmos períodos, os valores
        estão sendo contados duas vezes. Use <strong>"Limpar base"</strong> e reimporte apenas os OFX.
      </div>
      ` : `
      <div class="diag-ok">
        <i class="bi bi-check-circle-fill"></i>
        Não foram encontradas duplicatas entre lançamentos manuais e OFX.
      </div>
      `}
    `;
  } catch (err) {
    diagnosticoContent.innerHTML = `<p style="color:#f87171">Erro ao carregar diagnóstico: ${err.message}</p>`;
    console.error(err);
  }
}

function mostrarProgressoOFX(mensagem) {
  ofxResumoContent.innerHTML = `
    <div class="ofx-progresso">
      <div class="ofx-spinner"></div>
      <p>${mensagem}</p>
    </div>
  `;
  ofxResumoModal.classList.remove("hidden");
}

function mostrarResumo(resumo) {
  const fmt = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  ofxResumoContent.innerHTML = `
    <div class="ofx-resumo-header">
      <i class="bi bi-check-circle-fill ofx-check-icon"></i>
      <h3>Importação concluída</h3>
    </div>
    <div class="ofx-resumo-stats">
      <div class="ofx-stat">
        <span class="ofx-stat-num">${resumo.total}</span>
        <span class="ofx-stat-label">Encontradas</span>
      </div>
      <div class="ofx-stat ofx-stat-nova">
        <span class="ofx-stat-num">${resumo.novas}</span>
        <span class="ofx-stat-label">Novas</span>
      </div>
      <div class="ofx-stat ofx-stat-ignorada">
        <span class="ofx-stat-num">${resumo.ignoradas}</span>
        <span class="ofx-stat-label">Ignoradas</span>
      </div>
    </div>
    <div class="ofx-resumo-valores">
      <div class="ofx-valor-linha ofx-receita">
        <span><i class="bi bi-arrow-up-circle-fill"></i> Receitas</span>
        <strong>${fmt(resumo.totalReceitas)}</strong>
      </div>
      <div class="ofx-valor-linha ofx-despesa">
        <span><i class="bi bi-arrow-down-circle-fill"></i> Despesas</span>
        <strong>${fmt(resumo.totalDespesas)}</strong>
      </div>
      <div class="ofx-valor-linha ofx-saldo">
        <span><i class="bi bi-gem"></i> Saldo</span>
        <strong>${fmt(resumo.saldo)}</strong>
      </div>
    </div>
    <button class="btn ofx-fechar-btn" id="closeOfxResumoBtn2">Fechar</button>
  `;

  document.getElementById("closeOfxResumoBtn2").addEventListener("click", () => {
    ofxResumoModal.classList.add("hidden");
  });
}
