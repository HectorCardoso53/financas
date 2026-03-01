import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  deleteDoc,
  doc,
  updateDoc,
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

const firebaseConfig = {
  apiKey: "AIzaSyC1GRcrtuas2y-gqKMceiVLp7i55XgRYGA",
  authDomain: "financeiro-686a0.firebaseapp.com",
  projectId: "financeiro-686a0",
  storageBucket: "financeiro-686a0.firebasestorage.app",
  messagingSenderId: "586895715102",
  appId: "1:586895715102:web:86cb196335f11fb47bb70f",
};

// Inicializa Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const db = getFirestore(app);
let currentUserId = null;
let financeChart = null;

// Proteção de rota
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "index.html";
  } else {
    currentUserId = user.uid;

    document.getElementById("userEmail").textContent = user.email;

    populateYears(); // 👈 AQUI
    loadData();
  }
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

async function loadData() {
  incomes = [];
  expenses = [];

  const incomesRef = collection(db, "users", currentUserId, "incomes");
  const expensesRef = collection(db, "users", currentUserId, "expenses");

  const incomeSnap = await getDocs(
    query(incomesRef, orderBy("createdAt", "desc")),
  );
  incomeSnap.forEach((docSnap) => {
    incomes.push({ id: docSnap.id, ...docSnap.data() });
  });

  const expenseSnap = await getDocs(
    query(expensesRef, orderBy("createdAt", "desc")),
  );
  expenseSnap.forEach((docSnap) => {
    expenses.push({ id: docSnap.id, ...docSnap.data() });
  });

  updateDashboard();
  renderTransactions();
}

let incomes = [];
let expenses = [];

let selectedMonth = "";
let selectedYear = "";

// Easter Eggs Variables
let logoClicks = 0;
let profitClicks = 0;
let clickTimer;
let konamiCode = [];
const konamiSequence = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
];
let typedText = "";

// Inicializar data de hoje nos inputs
const today = new Date().toISOString().split("T")[0];
document.getElementById("incomeDate").value = today;
document.getElementById("expenseDate").value = today;

// Adicionar Receita
document.getElementById("incomeForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  await addDoc(collection(db, "users", currentUserId, "incomes"), {
    description: incomeDescription.value,
    amount: parseFloat(incomeAmount.value),
    category: incomeCategory.value,
    date: document.getElementById("incomeDate").value,
    createdAt: new Date(),
  });

  document.getElementById("incomeForm").reset();
  loadData();
});

// Adicionar Despesa
document.getElementById("expenseForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const description = document.getElementById("expenseDescription").value;
  const amount = parseFloat(document.getElementById("expenseAmount").value);
  const category = document.getElementById("expenseCategory").value;
  const date = document.getElementById("expenseDate").value;

  await addDoc(collection(db, "users", currentUserId, "expenses"), {
    description,
    amount,
    category,
    date,
    dueDate: date,
    createdAt: new Date(),
    paid: false,
  });

  document.getElementById("expenseForm").reset();
  loadData();
});

function analyzeYear(year) {
  const yearIncomes = incomes.filter((i) => {
    return new Date(i.date).getFullYear() === year;
  });

  const yearExpenses = expenses.filter((e) => {
    return new Date(e.date).getFullYear() === year;
  });

  const totalIncome = yearIncomes.reduce((s, i) => s + i.amount, 0);
  const totalExpense = yearExpenses.reduce((s, e) => s + e.amount, 0);

  return {
    totalIncome,
    totalExpense,
    balance: totalIncome - totalExpense,
  };
}

function generateAISuggestionByYear(year) {
  const data = analyzeYear(year);

  if (data.totalIncome === 0 && data.totalExpense === 0) {
    return `Analisei ${year} e não encontrei movimentações financeiras ainda.

Dica: registre suas receitas e despesas para eu conseguir te ajudar melhor.`;
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

  return {
    totalIncome,
    totalExpense,
    balance: totalIncome - totalExpense,
  };
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
      "Janeiro",
      "Fevereiro",
      "Março",
      "Abril",
      "Maio",
      "Junho",
      "Julho",
      "Agosto",
      "Setembro",
      "Outubro",
      "Novembro",
      "Dezembro",
    ];

    if (data.totalIncome === 0 && data.totalExpense === 0) {
      return `Não encontrei movimentações em ${monthNames[month]} de ${year}.
Registre suas receitas e despesas para análise.`;
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

  const year = parseInt(selectedYear);
  return generateAISuggestionByYear(year);
}

const robot = document.getElementById("robotCoach");

robot.addEventListener("click", () => {
  const text = document.getElementById("robotText");

  // 🤖 agora analisa mês + ano automaticamente
  text.innerText = generateAISuggestion();

  document.getElementById("robotModal").classList.remove("hidden");
});

window.closeRobot = function () {
  document.getElementById("robotModal").classList.add("hidden");
};

// Atualizar Dashboard
function updateDashboard() {
  const filteredIncomes = filterByDate(incomes);
  const filteredExpenses = filterByDate(expenses).filter((e) => e.paid);

  const totalIncome = filteredIncomes.reduce(
    (sum, item) => sum + item.amount,
    0,
  );
  const totalExpense = filteredExpenses.reduce(
    (sum, item) => sum + item.amount,
    0,
  );
  const profit = totalIncome - totalExpense;

  document.getElementById("totalIncome").textContent =
    formatCurrency(totalIncome);
  document.getElementById("totalExpense").textContent =
    formatCurrency(totalExpense);
  document.getElementById("totalProfit").textContent = formatCurrency(profit);
  document.getElementById("currentBalance").textContent =
    formatCurrency(profit);
}

function filterByDate(list) {
  return list.filter((item) => {
    const [year, month] = item.date.split("-");

    const matchMonth =
      selectedMonth === "" ||
      (parseInt(month) - 1).toString() === selectedMonth;

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

  // 🎨 Gradientes
  const incomeGradient = ctx.createLinearGradient(0, 0, 0, 400);
  incomeGradient.addColorStop(0, "rgba(34,197,94,0.4)");
  incomeGradient.addColorStop(1, "rgba(34,197,94,0)");

  const expenseGradient = ctx.createLinearGradient(0, 0, 0, 400);
  expenseGradient.addColorStop(0, "rgba(239,68,68,0.4)");
  expenseGradient.addColorStop(1, "rgba(239,68,68,0)");

  const incomeByMonth = Array(12).fill(0);
  const expenseByMonth = Array(12).fill(0);

  // 🔥 CORREÇÃO AQUI (sem Date())
  incomes.forEach((i) => {
    const [y, m] = i.date.split("-");
    if (parseInt(y) === year) {
      incomeByMonth[parseInt(m) - 1] += i.amount;
    }
  });

  expenses.forEach((e) => {
    const [y, m] = e.date.split("-");
    if (parseInt(y) === year) {
      expenseByMonth[parseInt(m) - 1] += e.amount;
    }
  });

  financeChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: [
        "Jan",
        "Fev",
        "Mar",
        "Abr",
        "Mai",
        "Jun",
        "Jul",
        "Ago",
        "Set",
        "Out",
        "Nov",
        "Dez",
      ],
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
          labels: {
            usePointStyle: true,
            padding: 20,
            font: { size: 14 },
          },
        },
        tooltip: {
          backgroundColor: "#111827",
          padding: 12,
          callbacks: {
            label: (ctx) => formatCurrency(ctx.raw),
          },
        },
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          beginAtZero: true,
          grid: { color: "#e5e7eb" },
          ticks: {
            callback: (v) => formatCurrency(v),
          },
        },
      },
    },
  });
}
const openChartBtn = document.getElementById("openChartBtn");
const chartModal = document.getElementById("chartModal");

if (openChartBtn && chartModal) {
  openChartBtn.addEventListener("click", () => {
    if (selectedYear === "") {
      alert("Selecione um ANO para ver o resumo anual ");
      return;
    }

    chartModal.classList.remove("hidden");

    // ⏱️ espera o modal aparecer na tela
    setTimeout(() => {
      renderYearlyComparisonChart(parseInt(selectedYear));
    }, 50);
  });
}

window.closeChart = function () {
  chartModal.classList.add("hidden");

  if (financeChart) {
    financeChart.destroy();
    financeChart = null;
  }
};

// Renderizar Transações
function renderTransactions() {
  const filteredIncomes = filterByDate(incomes);
  const filteredExpenses = filterByDate(expenses);

  // ===== RECEITAS =====
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
      .map(
        (item) => `
                <div class="transaction-item">
                    <div class="transaction-info">
                        <div class="transaction-title">
                            ${item.description}
                            <span class="category-badge category-${item.category}">
                                ${getCategoryName(item.category, "income")}
                            </span>
                        </div>
                        <div class="transaction-details">
                            ${formatDate(item.date)}
                        </div>
                    </div>
                    <div class="transaction-amount income">
                        +${formatCurrency(item.amount)}
                    </div>
                    <button class="btn btn-delete"
  onclick="deleteTransaction('${item.id}', 'income')">
  <i class="bi bi-trash"></i>
</button>

                </div>
            `,
      )
      .join("");
  }

  // ===== DESPESAS =====
  const expenseList = document.getElementById("expenseList");

  if (filteredExpenses.length === 0) {
    expenseList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">
    <i class="bi bi-inbox"></i>
</div>
                <p>Nenhuma despesa registrada para o período</p>
            </div>
        `;
  } else {
    expenseList.innerHTML = filteredExpenses
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .map(
        (item) => `
    <div class="transaction-item">
      <div class="transaction-info">
        <div class="transaction-title">
          ${item.description}
          <span class="category-badge category-${item.category}">
            ${getCategoryName(item.category, "expense")}
          </span>
        </div>
        <div class="transaction-details">
          ${formatDate(item.date)}
        </div>
      </div>

      <div style="display:flex;align-items:center;gap:10px;">

        <input 
          type="checkbox" 
          ${item.paid ? "checked" : ""} 
          onchange="toggleExpensePaid('${item.id}', this.checked)"
        />

        <div class="transaction-amount expense">
          -${formatCurrency(item.amount)}
        </div>

        <button class="btn btn-delete"
          onclick="deleteTransaction('${item.id}', 'expense')">
          <i class="bi bi-trash"></i>
        </button>

      </div>
    </div>
`,
      )
      .join("");
  }
}

// Utilitários
function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDate(dateString) {
  const date = new Date(dateString + "T00:00:00");
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getCategoryName(category, type) {
  const categories = {
    income: {
      salario: "Salário",
      freelance: "Freelance",
      investimentos: "Investimentos",
      outros: "Outros",
    },
    expense: {
      alimentacao: "Alimentação",
      transporte: "Transporte",
      moradia: "Moradia",
      lazer: "Lazer",
      saude: "Saúde",
      educacao: "Educação",
      outros: "Outros",
    },
  };
  return categories[type][category] || category;
}

// 2. Modo STONKS (3 cliques no logo)
document.getElementById("logo").addEventListener("click", () => {
  logoClicks++;
  clearTimeout(clickTimer);

  if (logoClicks >= 3) {
    triggerStonksMode();
    logoClicks = 0;
  }

  clickTimer = setTimeout(() => {
    logoClicks = 0;
  }, 1000);
});

function triggerStonksMode() {
  const overlay = document.createElement("div");
  overlay.className = "stonks-overlay";
  overlay.innerHTML = `
        <div class="stonks-content">
            <h2 style="font-size: 2.5em; margin-bottom: 20px;">MODO PERFORMANCE ATIVADO</h2>
            <p style="font-size: 1.2em;">
                Suas finanças estão em crescimento.
            </p>
            <button class="close-btn" onclick="this.parentElement.parentElement.remove()">
                <i class="bi bi-x-lg"></i>
            </button>
        </div>
    `;
  document.body.appendChild(overlay);

  setTimeout(() => overlay.remove(), 4000);
}

// 4. Mensagem Secreta (5 cliques no lucro)
document.getElementById("totalProfit").addEventListener("click", () => {
  profitClicks++;
  clearTimeout(clickTimer);

  if (profitClicks >= 5) {
    showSecretMessage();
    profitClicks = 0;
  }

  clickTimer = setTimeout(() => {
    profitClicks = 0;
  }, 2000);
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
        <h3>
            <i class="bi bi-star-fill"></i>
            Mensagem Especial
        </h3>

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

  setTimeout(() => {
    message.remove();
  }, 5000);
}

// 5. Matrix das Finanças (digite "hacktheplanet")
document.addEventListener("keypress", (e) => {
  typedText += e.key.toLowerCase();
  typedText = typedText.slice(-13); // Mantém apenas os últimos 13 caracteres

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

      setTimeout(() => char.remove(), 4000);
    }, i * 100);
  }
}

// 6. Konami Code
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
                <p style="font-size: 1.3em;">
                    Modo DINHEIRO INFINITO desbloqueado!
                </p>
                <p style="font-size: 0.9em; margin-top: 15px; opacity: 0.8;">
                    (Apenas na imaginação... continue se esforçando! 😄)
                </p>
                <p style="font-size: 2em; margin-top: 20px;">🎊 🎉 🎊</p>
                <button class="close-btn" onclick="this.parentElement.remove()">✕</button>
            `;
  document.body.appendChild(secret);

  setTimeout(() => {
    secret.remove();
  }, 6000);
}
function populateYears() {
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth(); // 0 a 11

  // Preenche anos (ex: de 2020 até +5 anos)
  filterYear.innerHTML = "";

  for (let y = currentYear - 5; y <= currentYear + 5; y++) {
    filterYear.innerHTML += `<option value="${y}">${y}</option>`;
  }

  // 👉 seleciona ANO ATUAL
  selectedYear = currentYear.toString();
  filterYear.value = selectedYear;

  // 👉 seleciona MÊS ATUAL
  selectedMonth = currentMonth.toString();
  filterMonth.value = selectedMonth;

  updateDashboard();
  renderTransactions();
}

const filterYear = document.getElementById("filterYear");
const filterMonth = document.getElementById("filterMonth");

filterYear.addEventListener("change", (e) => {
  selectedYear = e.target.value;

  console.log("Ano selecionado:", selectedYear);

  updateDashboard();
  renderTransactions();
});

document.getElementById("filterMonth").addEventListener("change", (e) => {
  selectedMonth = e.target.value;
  updateDashboard();
  renderTransactions();
});

async function deleteTransaction(id, type) {
  if (!confirm("Deseja realmente excluir?")) return;

  const ref = doc(
    db,
    "users",
    currentUserId,
    type === "income" ? "incomes" : "expenses",
    id,
  );

  await deleteDoc(ref);
  loadData();
}

window.deleteTransaction = deleteTransaction;

async function toggleExpensePaid(id, paid) {
  const ref = doc(db, "users", currentUserId, "expenses", id);
  await updateDoc(ref, { paid });

  loadData(); // 🔥 Atualiza tudo automaticamente
}

window.toggleExpensePaid = toggleExpensePaid;
updateDashboard();
renderTransactions();
