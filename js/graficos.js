import { auth, db } from './firebase-config.js';
import {
  collection, getDocs, query, where
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

let currentUser = null;
let activeGrafTab = 'despesas';
let allExpenses = [];
let allIncomes  = [];
let grafCatFilter = '';

let chartRanking = null, chartRec = null, chartEvol = null;
let chartSeis = null, chartCatLine = null, chartCatPie = null, chartDC = null;

const MONTHS_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

const CAT_COLORS = {
  alimentacao:'#10b981', transporte:'#f59e0b', moradia:'#6366f1',
  saude:'#ef4444', educacao:'#3b82f6', lazer:'#8b5cf6', outros:'#6b7280',
  salario:'#10b981', freelance:'#3b82f6', investimentos:'#8b5cf6',
};
const PALETTE = ['#3b82f6','#10b981','#8b5cf6','#ef4444','#f59e0b','#ec4899','#14b8a6','#f97316','#84cc16','#6b7280'];

function fmtBRL(val) {
  return 'R$ ' + Number(val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function normStr(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, '');
}

function catColor(name) {
  const key = normStr(name);
  if (CAT_COLORS[key]) return CAT_COLORS[key];
  const h = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
  return PALETTE[Math.abs(h) % PALETTE.length];
}

function destroyChart(inst) {
  if (inst) try { inst.destroy(); } catch (_) {}
}

function themeDefaults() {
  const light = document.body.classList.contains('light-mode');
  return {
    grid:  light ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)',
    ticks: light ? 'rgba(0,0,0,0.4)'  : 'rgba(255,255,255,0.4)',
  };
}

onAuthStateChanged(auth, user => {
  currentUser = user;
  if (user) loadData();
});

async function loadData() {
  if (!currentUser) return;
  const uid = currentUser.uid;
  const sixAgo = new Date();
  sixAgo.setMonth(sixAgo.getMonth() - 6);
  const since = sixAgo.toISOString().split('T')[0];

  const [eSnap, iSnap] = await Promise.all([
    getDocs(query(collection(db, 'users', uid, 'expenses'), where('date', '>=', since))),
    getDocs(query(collection(db, 'users', uid, 'incomes'),  where('date', '>=', since))),
  ]);

  allExpenses = eSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  allIncomes  = iSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderGraficos();
}

function getActiveData() {
  return activeGrafTab === 'receitas' ? allIncomes : allExpenses;
}

function getCurrentMonthYear() {
  const mEl = document.getElementById('filterMonth');
  const yEl = document.getElementById('filterYear');
  const now  = new Date();
  const month = mEl ? parseInt(mEl.value) + 1 : now.getMonth() + 1;
  const year  = yEl ? parseInt(yEl.value)     : now.getFullYear();
  return {
    month: isNaN(month) ? now.getMonth() + 1 : month,
    year:  isNaN(year)  ? now.getFullYear()  : year,
  };
}

function filterMonth(txs) {
  const { month, year } = getCurrentMonthYear();
  return txs.filter(t => {
    const d = new Date(t.date + 'T00:00:00');
    return d.getMonth() + 1 === month && d.getFullYear() === year;
  });
}

function renderGraficos() {
  const view = document.getElementById('view-graficos');
  if (!view || view.classList.contains('hidden')) return;

  const data  = getActiveData();
  const month = filterMonth(data);
  const label = activeGrafTab === 'receitas' ? 'Receitas' : 'Despesas';
  const accentColor = activeGrafTab === 'receitas' ? '#10b981' : '#ef4444';

  buildRanking(month, accentColor);
  buildRecorrencia(month, accentColor);
  buildEvolucao(data, label, accentColor);
  buildSeisMeses(data, label, accentColor);
  buildCatLine(month);
  buildCatPie(month, label);
  buildDebitoCredito(month);
  populateCatSelect(month);
}

/* ── 1. Ranking categorias ── */
function buildRanking(txs, accent) {
  const ctx = document.getElementById('grafRankingChart');
  if (!ctx || !window.Chart) return;
  destroyChart(chartRanking);

  const { grid, ticks } = themeDefaults();
  const catMap = {};
  txs.forEach(t => { const k = t.category || 'outros'; catMap[k] = (catMap[k] || 0) + (t.amount || 0); });

  const sorted = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
  const labels = sorted.map(([k]) => k);
  const values = sorted.map(([, v]) => v);
  const total  = values.reduce((s, v) => s + v, 0);
  const colors = labels.map(l => catColor(l) + 'cc');

  chartRanking = new window.Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderRadius: 4, borderSkipped: false }] },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmtBRL(c.raw) } } },
      scales: {
        x: { grid: { color: grid }, ticks: { color: ticks, font: { size: 10 },
             callback: v => v >= 1000 ? (v/1000).toFixed(1)+'k' : v } },
        y: { grid: { display: false }, ticks: { color: ticks, font: { size: 11 } } },
      },
    },
  });

  const topEl = document.getElementById('graf-ranking-top');
  if (topEl && sorted.length) {
    const [topName, topVal] = sorted[0];
    const col = catColor(topName);
    topEl.innerHTML = `<div class="graf-top-card">
      <div class="graf-top-icon" style="background:${col}"><i class="bi bi-tag-fill"></i></div>
      <div><div class="graf-top-name">${topName}</div><div class="graf-top-val">${fmtBRL(topVal)}</div></div>
    </div>`;
  }

  const sumEl = document.getElementById('graf-ranking-summary');
  if (sumEl) sumEl.textContent =
    `Essas categorias totalizam ${fmtBRL(total)}. Elas representam 100% do total de ${fmtBRL(total)}.`;
}

/* ── 2. Por recorrência ── */
function buildRecorrencia(txs, accent) {
  const ctx = document.getElementById('grafRecorrenciaChart');
  if (!ctx || !window.Chart) return;
  destroyChart(chartRec);

  const total    = txs.reduce((s, t) => s + (t.amount || 0), 0);
  const fixas    = txs.filter(t => t.recorrente).reduce((s, t) => s + (t.amount || 0), 0);
  const variaveis = total - fixas;
  const hasData  = total > 0;

  const labels = fixas > 0 ? ['Variáveis', 'Fixas'] : ['Variáveis'];
  const values = fixas > 0 ? [variaveis, fixas] : [hasData ? total : 1];
  const colors = [accent + 'cc', '#818cf8cc'];

  chartRec = new window.Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: hasData ? colors : ['#33333388'], borderWidth: 0, hoverOffset: 6 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '72%',
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => hasData ? fmtBRL(c.raw) : '' } } },
    },
  });

  const center = document.getElementById('graf-rec-center');
  if (center) center.innerHTML = `${fmtBRL(total)}<br><small>Total</small>`;

  const leg = document.getElementById('graf-rec-legend');
  if (leg) {
    const items = fixas > 0
      ? [['Variáveis', variaveis, accent], ['Fixas', fixas, '#818cf8']]
      : [['Variáveis', total, accent]];
    leg.innerHTML = items.map(([n, v, c]) =>
      `<div class="graf-leg-row">
        <span class="graf-leg-dot" style="background:${c}"></span>
        <span class="graf-leg-name">${n}</span>
        <span class="graf-leg-val">${fmtBRL(v)}</span>
        <i class="bi bi-chevron-right graf-leg-arrow"></i>
      </div>`
    ).join('');
  }
}

/* ── 3. Evolução 7 dias ── */
function buildEvolucao(txs, label, accent) {
  const ctx = document.getElementById('grafEvolucaoChart');
  if (!ctx || !window.Chart) return;
  destroyChart(chartEvol);

  const { grid, ticks } = themeDefaults();
  const today = new Date();
  const labels7 = [], data7 = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    labels7.push(d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }));
    data7.push(txs.filter(t => t.date === key).reduce((s, t) => s + (t.amount || 0), 0));
  }

  chartEvol = new window.Chart(ctx, {
    type: 'line',
    data: { labels: labels7, datasets: [{
      label, data: data7,
      borderColor: accent, backgroundColor: accent + '22',
      fill: true, tension: 0.4, pointRadius: 4, pointHoverRadius: 6,
      pointBackgroundColor: accent, borderWidth: 2,
    }]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmtBRL(c.raw) } } },
      scales: {
        x: { grid: { color: grid }, ticks: { color: ticks, font: { size: 11 } } },
        y: { grid: { color: grid }, ticks: { color: ticks, font: { size: 11 },
             callback: v => v >= 1000 ? (v/1000).toFixed(1)+'k' : v } },
      },
    },
  });
}

/* ── 4. Últimos 6 meses ── */
function buildSeisMeses(txs, label, accent) {
  const ctx = document.getElementById('grafSeisMesesChart');
  if (!ctx || !window.Chart) return;
  destroyChart(chartSeis);

  const { grid, ticks } = themeDefaults();
  const today = new Date();
  const labels6 = [], data6 = [];

  for (let i = 5; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const m = d.getMonth() + 1, y = d.getFullYear();
    labels6.push(MONTHS_SHORT[d.getMonth()] + '/' + String(y).slice(-2));
    data6.push(txs
      .filter(t => { const dt = new Date(t.date + 'T00:00:00'); return dt.getMonth()+1 === m && dt.getFullYear() === y; })
      .reduce((s, t) => s + (t.amount || 0), 0));
  }

  chartSeis = new window.Chart(ctx, {
    type: 'bar',
    data: { labels: labels6, datasets: [{
      label, data: data6,
      backgroundColor: accent + 'bb', borderRadius: 6, borderSkipped: false,
    }]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmtBRL(c.raw) } } },
      scales: {
        x: { grid: { color: grid }, ticks: { color: ticks, font: { size: 11 } } },
        y: { grid: { color: grid }, ticks: { color: ticks, font: { size: 11 },
             callback: v => v >= 1000 ? (v/1000).toFixed(1)+'k' : v } },
      },
    },
  });
}

/* ── 5. Categoria – linha diária ── */
function buildCatLine(txs) {
  const ctx = document.getElementById('grafCatChart');
  if (!ctx || !window.Chart) return;
  destroyChart(chartCatLine);

  const { grid, ticks } = themeDefaults();
  const { month, year } = getCurrentMonthYear();
  const daysInMonth = new Date(year, month, 0).getDate();

  const filtered = grafCatFilter
    ? txs.filter(t => normStr(t.category) === normStr(grafCatFilter))
    : txs;

  const total = filtered.reduce((s, t) => s + (t.amount || 0), 0);
  const totEl = document.getElementById('graf-cat-total');
  if (totEl) totEl.textContent = fmtBRL(total);

  const labels = Array.from({ length: daysInMonth }, (_, i) => String(i+1).padStart(2,'0'));
  const data = Array(daysInMonth).fill(0);
  filtered.forEach(t => {
    const d = new Date(t.date + 'T00:00:00');
    if (d.getMonth()+1 === month && d.getFullYear() === year) data[d.getDate()-1] += t.amount || 0;
  });

  const color = '#818cf8';

  chartCatLine = new window.Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{
      data, borderColor: color, backgroundColor: color + '1a',
      fill: true, tension: 0.3, pointRadius: 3, pointHoverRadius: 5,
      pointBackgroundColor: color, borderWidth: 2,
    }]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmtBRL(c.raw) } } },
      scales: {
        x: { grid: { color: grid }, ticks: { color: ticks, font: { size: 10 }, maxTicksLimit: 10 } },
        y: { grid: { color: grid }, ticks: { color: ticks, font: { size: 10 },
             callback: v => v >= 1000 ? (v/1000).toFixed(1)+'k' : v } },
      },
    },
  });
}

/* ── 6. Por categoria – donut ── */
function buildCatPie(txs, label) {
  const ctx = document.getElementById('grafCatPieChart');
  if (!ctx || !window.Chart) return;
  destroyChart(chartCatPie);

  const catMap = {};
  txs.forEach(t => { const k = t.category || 'outros'; catMap[k] = (catMap[k] || 0) + (t.amount || 0); });

  const entries = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
  const labels = entries.map(([k]) => k);
  const values = entries.map(([, v]) => v);
  const colors = labels.map(l => catColor(l) + 'cc');
  const total  = values.reduce((s, v) => s + v, 0);
  const hasData = total > 0;

  chartCatPie = new window.Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{
      data: hasData ? values : [1],
      backgroundColor: hasData ? colors : ['#33333388'],
      borderWidth: 0, hoverOffset: 6,
    }]},
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '70%',
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => hasData ? fmtBRL(c.raw) : '' } } },
    },
  });

  const center = document.getElementById('graf-cat-pie-center');
  if (center) center.innerHTML = `${fmtBRL(total)}<br><small>Total</small>`;

  // Legend
  const legEl = document.getElementById('graf-cat-pie-legend');
  if (legEl) {
    legEl.innerHTML = entries.slice(0, 5).map(([n, v]) =>
      `<div class="graf-leg-row">
        <span class="graf-leg-dot" style="background:${catColor(n)}"></span>
        <span class="graf-leg-name">${n}</span>
        <span class="graf-leg-val">${fmtBRL(v)}</span>
        <i class="bi bi-chevron-right graf-leg-arrow"></i>
      </div>`
    ).join('');
  }
}

/* ── 7. Débito x Crédito ── */
function buildDebitoCredito(txs) {
  const ctx = document.getElementById('grafDCChart');
  if (!ctx || !window.Chart) return;
  destroyChart(chartDC);

  const debito  = txs.filter(t =>  t.importado).reduce((s, t) => s + (t.amount || 0), 0);
  const credito = txs.filter(t => !t.importado).reduce((s, t) => s + (t.amount || 0), 0);
  const total   = debito + credito;
  const hasData = total > 0;

  chartDC = new window.Chart(ctx, {
    type: 'doughnut',
    data: { labels: ['Débito', 'Crédito'], datasets: [{
      data: hasData ? [debito || 0.001, credito || 0.001] : [1, 0],
      backgroundColor: hasData ? ['#f87171cc', '#818cf8cc'] : ['#33333388', 'transparent'],
      borderWidth: 0, hoverOffset: 6,
    }]},
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '72%',
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => hasData ? fmtBRL(c.raw) : '' } } },
    },
  });

  const center = document.getElementById('graf-dc-center');
  if (center) center.innerHTML = `${fmtBRL(total)}<br><small>Total</small>`;

  const leg = document.getElementById('graf-dc-legend');
  if (leg) {
    leg.innerHTML = [['Débito', debito, '#f87171'], ['Crédito', credito, '#818cf8']].map(([n, v, c]) =>
      `<div class="graf-leg-row">
        <span class="graf-leg-dot" style="background:${c}"></span>
        <span class="graf-leg-name">${n}</span>
        <span class="graf-leg-val">${fmtBRL(v)}</span>
        <i class="bi bi-chevron-right graf-leg-arrow"></i>
      </div>`
    ).join('');
  }
}

function populateCatSelect(txs) {
  const sel = document.getElementById('graf-cat-select');
  if (!sel) return;
  const cats = [...new Set(txs.map(t => t.category).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">Todas</option>' + cats.map(c => `<option value="${c}">${c}</option>`).join('');
  sel.value = grafCatFilter;
  sel.onchange = () => {
    grafCatFilter = sel.value;
    buildCatLine(filterMonth(getActiveData()));
  };
}

document.addEventListener('DOMContentLoaded', () => {
  const view = document.getElementById('view-graficos');
  if (!view) return;

  view.addEventListener('click', e => {
    const tab = e.target.closest('[data-graf-tab]');
    if (!tab) return;
    view.querySelectorAll('[data-graf-tab]').forEach(t => t.classList.remove('graf-tab-active'));
    tab.classList.add('graf-tab-active');
    activeGrafTab = tab.dataset.grafTab;
    grafCatFilter = '';
    renderGraficos();
  });

  new MutationObserver(() => {
    if (!view.classList.contains('hidden')) {
      if (currentUser) loadData();
      else renderGraficos();
    }
  }).observe(view, { attributes: true, attributeFilter: ['class'] });

  ['filterMonth', 'filterYear'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
      if (!view.classList.contains('hidden')) renderGraficos();
    });
  });
});
