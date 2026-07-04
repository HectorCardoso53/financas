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

    updateDashboard();
    renderTransactions();
    await loadCofre();
  } catch {
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

  const validationError = validateTransactionInput(description, amount, date);
  if (validationError) {
    showToast(validationError);
    return;
  }

  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;

  try {
    await addDoc(collection(db, "users", currentUserId, "expenses"), {
      description,
      amount,
      category,
      date,
      dueDate: date,
      createdAt: new Date(),
      paid: true,
    });

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
  const filteredExpenses = filterByDate(expenses).filter((e) => e.paid);

  const totalIncome = filteredIncomes.reduce((sum, item) => sum + item.amount, 0);
  const totalExpense = filteredExpenses.reduce((sum, item) => sum + item.amount, 0);
  const profit = totalIncome - totalExpense;

  const saldo = profit - getCofreBalance();
  document.getElementById("totalIncome").textContent = formatCurrency(totalIncome);
  document.getElementById("totalExpense").textContent = formatCurrency(totalExpense);
  document.getElementById("totalProfit").textContent = formatCurrency(saldo);
  document.getElementById("currentBalance").textContent = formatCurrency(saldo);
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
  if (selectedYear === "") {
    alert("Selecione um ANO para ver o resumo anual");
    return;
  }
  chartModal.classList.remove("hidden");
  setTimeout(() => renderYearlyComparisonChart(parseInt(selectedYear)), 50);
}

if (openChartBtn) openChartBtn.addEventListener("click", openChart);

const openChartBtnHeader = document.getElementById("openChartBtnHeader");
if (openChartBtnHeader) openChartBtnHeader.addEventListener("click", openChart);

function closeChart() {
  chartModal.classList.add("hidden");
  if (financeChart) {
    financeChart.destroy();
    financeChart = null;
  }
}

document.getElementById("closeChartBtn").addEventListener("click", closeChart);

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

        return `
        <div class="transaction-item">
          <div class="transaction-info">
            <div class="transaction-title">
              ${safeDescription}
              <span class="category-badge category-${safeCategoryClass}">
                ${safeCategoryName}
              </span>
            </div>
            <div class="transaction-details">${formatDate(item.date)}</div>
          </div>
          <div class="transaction-amount income">+${formatCurrency(item.amount)}</div>
          <button class="btn btn-delete" data-delete data-id="${item.id}" data-type="income">
            <i class="bi bi-trash"></i>
          </button>
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

        return `
        <div class="transaction-item">
          <div class="transaction-info">
            <div class="transaction-title">
              ${safeDescription}
              <span class="category-badge category-${safeCategoryClass}">
                ${safeCategoryName}
              </span>
            </div>
            <div class="transaction-details">${formatDate(item.date)}</div>
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <input type="checkbox" ${item.paid ? "checked" : ""} data-toggle-paid data-id="${item.id}" />
            <div class="transaction-amount expense">-${formatCurrency(item.amount)}</div>
            <button class="btn btn-delete" data-delete data-id="${item.id}" data-type="expense">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </div>
      `;
      })
      .join("");
  }
}

// Event delegation para ações nas listas
document.getElementById("incomeList").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-delete]");
  if (btn) deleteTransaction(btn.dataset.id, btn.dataset.type);
});

document.getElementById("expenseList").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-delete]");
  if (btn) deleteTransaction(btn.dataset.id, btn.dataset.type);
});

document.getElementById("expenseList").addEventListener("change", (e) => {
  const checkbox = e.target.closest("[data-toggle-paid]");
  if (checkbox) toggleExpensePaid(checkbox.dataset.id, checkbox.checked);
});

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
