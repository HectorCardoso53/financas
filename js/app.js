import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    getFirestore,
    collection,
    addDoc,
    getDocs,
    query,
    orderBy,
    deleteDoc,
    doc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";


const firebaseConfig = {
    apiKey: "AIzaSyC1GRcrtuas2y-gqKMceiVLp7i55XgRYGA",
    authDomain: "financeiro-686a0.firebaseapp.com",
    projectId: "financeiro-686a0",
    storageBucket: "financeiro-686a0.firebasestorage.app",
    messagingSenderId: "586895715102",
    appId: "1:586895715102:web:86cb196335f11fb47bb70f"
};

// Inicializa Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const db = getFirestore(app);
let currentUserId = null;


// Proteção de rota
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = "index.html";
    } else {
        currentUserId = user.uid;

        // 👇 MOSTRAR EMAIL
        document.getElementById('userEmail').textContent = user.email;

        loadData();
    }
});


document.getElementById('logoutBtn').addEventListener('click', async () => {
    await signOut(auth);
    window.location.href = "index.html";
});

async function loadData() {
    incomes = [];
    expenses = [];

    const incomesRef = collection(db, "users", currentUserId, "incomes");
    const expensesRef = collection(db, "users", currentUserId, "expenses");

    const incomeSnap = await getDocs(query(incomesRef, orderBy("createdAt", "desc")));
    incomeSnap.forEach(docSnap => {
        incomes.push({ id: docSnap.id, ...docSnap.data() });
    });

    const expenseSnap = await getDocs(query(expensesRef, orderBy("createdAt", "desc")));
    expenseSnap.forEach(docSnap => {
        expenses.push({ id: docSnap.id, ...docSnap.data() });
    });

    updateDashboard();
    renderTransactions();
}



let incomes = [];
let expenses = [];


let selectedMonth = '';
let selectedYear = '';


// Easter Eggs Variables
let logoClicks = 0;
let profitClicks = 0;
let clickTimer;
let konamiCode = [];
const konamiSequence = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
let typedText = '';

// Inicializar data de hoje nos inputs
const today = new Date().toISOString().split('T')[0];
document.getElementById('incomeDate').value = today;
document.getElementById('expenseDate').value = today;

// Adicionar Receita
document.getElementById('incomeForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    await addDoc(
        collection(db, "users", currentUserId, "incomes"),
        {
            description: incomeDescription.value,
            amount: parseFloat(incomeAmount.value),
            category: incomeCategory.value,
            date: incomeDate.value,
            createdAt: new Date()
        }
    );

    document.getElementById('incomeForm').reset();
    incomeDate.value = today;

    loadData();
});

// Adicionar Despesa
document.getElementById('expenseForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    await addDoc(
        collection(db, "users", currentUserId, "expenses"),
        {
            description: expenseDescription.value,
            amount: parseFloat(expenseAmount.value),
            category: expenseCategory.value,
            date: expenseDate.value,
            createdAt: new Date()
        }
    );

    document.getElementById('expenseForm').reset();
    expenseDate.value = today;

    loadData();
});


function getMonthYear(dateString) {
    const d = new Date(dateString);
    return {
        month: d.getMonth(),
        year: d.getFullYear()
    };
}


// Deletar Transação
async function deleteTransaction(id, type) {
    if (!confirm("Deseja realmente excluir?")) return;

    const ref = doc(
        db,
        "users",
        currentUserId,
        type === "income" ? "incomes" : "expenses",
        id
    );

    await deleteDoc(ref);
    loadData();
}




// Atualizar Dashboard
function updateDashboard() {
    const filteredIncomes = filterByDate(incomes);
    const filteredExpenses = filterByDate(expenses);

    const totalIncome = filteredIncomes.reduce((sum, item) => sum + item.amount, 0);
    const totalExpense = filteredExpenses.reduce((sum, item) => sum + item.amount, 0);
    const profit = totalIncome - totalExpense;

    document.getElementById('totalIncome').textContent = formatCurrency(totalIncome);
    document.getElementById('totalExpense').textContent = formatCurrency(totalExpense);
    document.getElementById('totalProfit').textContent = formatCurrency(profit);
    document.getElementById('currentBalance').textContent = formatCurrency(profit);
}



function filterByDate(list) {
    return list.filter(item => {
        const date = new Date(item.date);
        const matchMonth = selectedMonth === '' || date.getMonth().toString() === selectedMonth;
        const matchYear = selectedYear === '' || date.getFullYear().toString() === selectedYear;

        return matchMonth && matchYear;
    });
}


// Renderizar Transações
function renderTransactions() {

    const filteredIncomes = filterByDate(incomes);
    const filteredExpenses = filterByDate(expenses);

    // ===== RECEITAS =====
    const incomeList = document.getElementById('incomeList');

    if (filteredIncomes.length === 0) {
        incomeList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📭</div>
                <p>Nenhuma receita registrada para o período</p>
            </div>
        `;
    } else {
        incomeList.innerHTML = filteredIncomes
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .map(item => `
                <div class="transaction-item">
                    <div class="transaction-info">
                        <div class="transaction-title">
                            ${item.description}
                            <span class="category-badge category-${item.category}">
                                ${getCategoryName(item.category, 'income')}
                            </span>
                        </div>
                        <div class="transaction-details">
                            ${formatDate(item.date)}
                        </div>
                    </div>
                    <div class="transaction-amount income">
                        +${formatCurrency(item.amount)}
                    </div>
                    <button class="btn btn-delete" onclick="deleteTransaction(${item.id}, 'income')">
                        🗑️
                    </button>
                </div>
            `)
            .join('');
    }

    // ===== DESPESAS =====
    const expenseList = document.getElementById('expenseList');

    if (filteredExpenses.length === 0) {
        expenseList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📭</div>
                <p>Nenhuma despesa registrada para o período</p>
            </div>
        `;
    } else {
        expenseList.innerHTML = filteredExpenses
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .map(item => `
                <div class="transaction-item">
                    <div class="transaction-info">
                        <div class="transaction-title">
                            ${item.description}
                            <span class="category-badge category-${item.category}">
                                ${getCategoryName(item.category, 'expense')}
                            </span>
                        </div>
                        <div class="transaction-details">
                            ${formatDate(item.date)}
                        </div>
                    </div>
                    <div class="transaction-amount expense">
                        -${formatCurrency(item.amount)}
                    </div>
                    <button class="btn btn-delete" onclick="deleteTransaction(${item.id}, 'expense')">
                        🗑️
                    </button>
                </div>
            `)
            .join('');
    }
}


// Utilitários
function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
}

function formatDate(dateString) {
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

function getCategoryName(category, type) {
    const categories = {
        income: {
            salario: '💼 Salário',
            freelance: '💻 Freelance',
            investimentos: '📊 Investimentos',
            outros: '🎯 Outros'
        },
        expense: {
            alimentacao: '🍔 Alimentação',
            transporte: '🚗 Transporte',
            moradia: '🏠 Moradia',
            lazer: '🎮 Lazer',
            saude: '💊 Saúde',
            educacao: '📚 Educação',
            outros: '📦 Outros'
        }
    };
    return categories[type][category] || category;
}

// ============= EASTER EGGS =============

// 1. Chuva de Moedas
function triggerCoinRain() {
    const coins = ['💰', '🪙', '💵', '💴', '💶', '💷', '💸'];

    for (let i = 0; i < 40; i++) {
        setTimeout(() => {
            const coin = document.createElement('div');
            coin.className = 'coin';
            coin.textContent = coins[Math.floor(Math.random() * coins.length)];
            coin.style.left = Math.random() * 100 + 'vw';
            coin.style.top = '-50px';
            document.body.appendChild(coin);

            setTimeout(() => coin.remove(), 2000);
        }, i * 80);
    }
}

// 2. Modo STONKS (3 cliques no logo)
document.getElementById('logo').addEventListener('click', () => {
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
    const overlay = document.createElement('div');
    overlay.className = 'stonks-overlay';
    overlay.innerHTML = `
                <div class="stonks-content">
                    <h2 style="font-size: 3em; margin-bottom: 20px;">📈 STONKS! 📈</h2>
                    <div class="stonks-meme">🚀📊💎</div>
                    <p style="font-size: 2em; color: #00ff00; font-weight: bold;">
                        TO THE MOON! 🌙
                    </p>
                    <p style="margin-top: 20px; font-size: 1.2em;">
                        Suas finanças estão ON FIRE! 🔥
                    </p>
                    <button class="close-btn" onclick="this.parentElement.parentElement.remove()">✕</button>
                </div>
            `;
    document.body.appendChild(overlay);

    setTimeout(() => {
        overlay.remove();
    }, 4000);
}

// 3. Foguete do Lucro
function triggerRocket() {
    const rocket = document.createElement('div');
    rocket.className = 'rocket';
    rocket.textContent = '🚀';
    rocket.style.left = '50%';
    rocket.style.bottom = '-100px';
    document.body.appendChild(rocket);

    setTimeout(() => rocket.remove(), 3000);
}

// 4. Mensagem Secreta (5 cliques no lucro)
document.getElementById('totalProfit').addEventListener('click', () => {
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
        "💎 Você é um mestre das finanças!",
        "🏆 Continue assim rumo à independência financeira!",
        "⭐ O segredo do sucesso: gastar menos que ganha!",
        "🎯 Foco e disciplina levam à riqueza!",
        "💪 Cada centavo economizado é um passo rumo ao sucesso!"
    ];

    const message = document.createElement('div');
    message.className = 'secret-message';
    message.innerHTML = `
                <h3>🎉 MENSAGEM SECRETA! 🎉</h3>
                <p style="font-size: 1.2em; margin: 20px 0;">
                    ${messages[Math.floor(Math.random() * messages.length)]}
                </p>
                <p style="font-size: 0.9em; opacity: 0.9;">
                    "O dinheiro é apenas uma ferramenta. Ele te levará aonde você quiser, mas não te substituirá como motorista." - Ayn Rand
                </p>
                <button class="close-btn" onclick="this.parentElement.remove()">✕</button>
            `;
    document.body.appendChild(message);

    setTimeout(() => {
        message.remove();
    }, 5000);
}

// 5. Matrix das Finanças (digite "hacktheplanet")
document.addEventListener('keypress', (e) => {
    typedText += e.key.toLowerCase();
    typedText = typedText.slice(-13); // Mantém apenas os últimos 13 caracteres

    if (typedText === 'hacktheplanet') {
        triggerMatrix();
        typedText = '';
    }
});

function triggerMatrix() {
    const symbols = ['R$', '$', '€', '¥', '£', '₿', '0', '1', '💰', '💵'];

    for (let i = 0; i < 50; i++) {
        setTimeout(() => {
            const char = document.createElement('div');
            char.className = 'matrix-char';
            char.textContent = symbols[Math.floor(Math.random() * symbols.length)];
            char.style.left = Math.random() * 100 + 'vw';
            char.style.top = '-20px';
            document.body.appendChild(char);

            setTimeout(() => char.remove(), 4000);
        }, i * 100);
    }
}

// 6. Konami Code
document.addEventListener('keydown', (e) => {
    konamiCode.push(e.key);
    konamiCode = konamiCode.slice(-10);

    if (konamiCode.join('') === konamiSequence.join('')) {
        triggerKonamiSecret();
        konamiCode = [];
    }
});

function triggerKonamiSecret() {
    const secret = document.createElement('div');
    secret.className = 'secret-message';
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
    const yearSelect = document.getElementById('filterYear');
    const currentYear = new Date().getFullYear();

    yearSelect.innerHTML = '<option value="">Todos</option>';

    for (let y = currentYear - 5; y <= currentYear + 5; y++) {
        const option = document.createElement('option');
        option.value = y;
        option.textContent = y;
        yearSelect.appendChild(option);
    }
}

document.getElementById('filterMonth').addEventListener('change', (e) => {
    selectedMonth = e.target.value;
    updateDashboard();
    renderTransactions();
});

document.getElementById('filterYear').addEventListener('change', (e) => {
    selectedYear = e.target.value;
    updateDashboard();
    renderTransactions();
});


function updateComparison() {
    if (selectedMonth === '' || selectedYear === '') {
        document.getElementById('compareIncome').textContent = 'Selecione mês e ano';
        document.getElementById('compareExpense').textContent = '-';
        document.getElementById('compareBalance').textContent = '-';
        return;
    }

    const month = parseInt(selectedMonth);
    const year = parseInt(selectedYear);

    // Mês atual
    const currentIncomes = incomes.filter(i => {
        const d = getMonthYear(i.date);
        return d.month === month && d.year === year;
    });

    const currentExpenses = expenses.filter(e => {
        const d = getMonthYear(e.date);
        return d.month === month && d.year === year;
    });

    // Mês anterior
    let prevMonth = month - 1;
    let prevYear = year;

    if (prevMonth < 0) {
        prevMonth = 11;
        prevYear--;
    }

    const prevIncomes = incomes.filter(i => {
        const d = getMonthYear(i.date);
        return d.month === prevMonth && d.year === prevYear;
    });

    const prevExpenses = expenses.filter(e => {
        const d = getMonthYear(e.date);
        return d.month === prevMonth && d.year === prevYear;
    });

    const curIncomeTotal = currentIncomes.reduce((s, i) => s + i.amount, 0);
    const curExpenseTotal = currentExpenses.reduce((s, e) => s + e.amount, 0);

    const prevIncomeTotal = prevIncomes.reduce((s, i) => s + i.amount, 0);
    const prevExpenseTotal = prevExpenses.reduce((s, e) => s + e.amount, 0);

    const curBalance = curIncomeTotal - curExpenseTotal;
    const prevBalance = prevIncomeTotal - prevExpenseTotal;

    updateCompareUI('compareIncome', curIncomeTotal - prevIncomeTotal);
    updateCompareUI('compareExpense', curExpenseTotal - prevExpenseTotal);
    updateCompareUI('compareBalance', curBalance - prevBalance);
}


populateYears();


