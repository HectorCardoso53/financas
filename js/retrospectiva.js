import {
  doc,
  getDoc,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "./firebase-config.js";

const MONTH_NAMES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const MONTH_SHORT  = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const CAT_NAMES = {
  alimentacao:'Alimentação', transporte:'Transporte', moradia:'Moradia',
  lazer:'Lazer', saude:'Saúde', educacao:'Educação',
  salario:'Salário', freelance:'Freelance', investimentos:'Investimentos', outros:'Outros',
};

function fmt(val) {
  return 'R$ ' + Math.abs(val).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function monthKey(year, month) {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function computeSummary(incomes, expenses, year, month) {
  const prefix = monthKey(year, month) + '-';
  const mInc = incomes.filter(t => t.date && t.date.startsWith(prefix));
  const mExp = expenses.filter(t => t.date && t.date.startsWith(prefix));
  const receitas = mInc.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
  const despesas = mExp.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
  const catMap = {};
  mExp.forEach(t => { const c = t.category || 'outros'; catMap[c] = (catMap[c] || 0) + (parseFloat(t.amount) || 0); });
  const topCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([cat, val]) => ({ cat, name: CAT_NAMES[cat] || cat, val }));
  const economia = receitas > 0 ? (receitas - despesas) / receitas * 100 : 0;
  return { year, month, key: monthKey(year, month), receitas, despesas, resultado: receitas - despesas, economia, topCats, total: mInc.length + mExp.length };
}

function deltaTag(curr, prev, higherIsBetter) {
  if (!prev || prev === 0) return '';
  const pct = ((curr - prev) / Math.abs(prev)) * 100;
  if (Math.abs(pct) < 0.5) return '';
  const good = higherIsBetter ? pct > 0 : pct < 0;
  const cls  = good ? 'cmp-better' : 'cmp-worse';
  const sign = pct > 0 ? '+' : '';
  return `<span class="retro-delta ${cls}">${sign}${pct.toFixed(0)}%</span>`;
}

function calcScore(curr, prev) {
  if (!prev) return null;
  let s = 0;
  if (curr.receitas  >= prev.receitas)  s++;
  if (curr.despesas  <= prev.despesas)  s++;
  if (curr.resultado >= prev.resultado) s++;
  return s;
}

function scoreHtml(score) {
  if (score === null) return '';
  const cfg = [
    { icon: '😟', num: '0/3', label: 'Nenhuma métrica melhorou — hora de revisar os gastos',   color:'#ef4444', bg:'rgba(239,68,68,0.1)'   },
    { icon: '🙁', num: '1/3', label: '1 métrica melhorou — ainda dá para ajustar mais',          color:'#f59e0b', bg:'rgba(245,158,11,0.1)'  },
    { icon: '🙂', num: '2/3', label: '2 métricas melhoraram — bom progresso, continue assim!',   color:'#3b82f6', bg:'rgba(59,130,246,0.1)'  },
    { icon: '🎯', num: '3/3', label: 'Você evoluiu em tudo! Mês excelente',                      color:'#10b981', bg:'rgba(16,185,129,0.1)'  },
  ];
  const c = cfg[score];
  return `<div class="retro-score-wrap" style="background:${c.bg};border-color:${c.color}30">
    <div class="retro-score-emoji">${c.icon}</div>
    <div>
      <div class="retro-score-num" style="color:${c.color}">${c.num} métricas melhores</div>
      <div class="retro-score-lbl">${c.label}</div>
    </div>
  </div>`;
}

function buildInsight(curr, prev) {
  if (curr.total === 0) return 'Nenhuma transação registrada neste mês.';
  if (!prev) {
    if (curr.resultado < 0) return `Você gastou ${fmt(Math.abs(curr.resultado))} a mais do que recebeu este mês.`;
    return `Você economizou ${curr.economia.toFixed(1)}% da sua renda — sobrou ${fmt(curr.resultado)}.`;
  }
  if (curr.resultado < 0) {
    return `Você fechou no negativo. Reduza ${curr.topCats[0]?.name || 'as despesas variáveis'} no próximo mês.`;
  }
  if (prev.despesas > 0) {
    const pct = (curr.despesas - prev.despesas) / prev.despesas * 100;
    if (pct >  15) return `Despesas subiram ${pct.toFixed(0)}% vs. mês anterior. Vale revisar o que aumentou.`;
    if (pct < -10) return `Você cortou ${Math.abs(pct).toFixed(0)}% nas despesas vs. mês anterior. Continue!`;
  }
  if (curr.economia > 20) return `Taxa de economia de ${curr.economia.toFixed(1)}% — ótima disciplina financeira!`;
  if (curr.topCats.length && curr.despesas > 0) {
    const pct = curr.topCats[0].val / curr.despesas * 100;
    if (pct > 40) return `${curr.topCats[0].name} consumiu ${pct.toFixed(0)}% das suas despesas este mês.`;
  }
  return null;
}

let retroChart = null;
let activePeriod = null;

async function openModal(curr, prev) {
  activePeriod = curr;
  const userId = window._financeUserId;

  // Title
  const cName = MONTH_NAMES[curr.month];
  const cTitle = cName.charAt(0).toUpperCase() + cName.slice(1);
  if (prev) {
    const pName = MONTH_NAMES[prev.month];
    const pTitle = pName.charAt(0).toUpperCase() + pName.slice(1);
    document.getElementById('retroModalTitle').textContent = `${pTitle} → ${cTitle}`;
    const yearTag = prev.year !== curr.year ? `${prev.year} → ${curr.year}` : curr.year;
    document.getElementById('retroModalSub').textContent = `${yearTag} · comparação mensal`;
  } else {
    document.getElementById('retroModalTitle').textContent = `${cTitle} ${curr.year}`;
    document.getElementById('retroModalSub').textContent = 'sem mês anterior disponível';
  }

  // Score
  document.getElementById('retroScoreWrap').innerHTML = scoreHtml(calcScore(curr, prev));

  // Comparison table
  function row(label, prevVal, currVal, higherIsBetter, fmtFn) {
    const pStr = prevVal !== null ? fmtFn(prevVal) : '—';
    const cStr = fmtFn(currVal);
    const delta = prevVal !== null ? deltaTag(currVal, prevVal, higherIsBetter) : '';
    const good  = prevVal !== null && ((higherIsBetter && currVal >= prevVal) || (!higherIsBetter && currVal <= prevVal));
    const cColor = prevVal !== null ? (good ? '#10b981' : '#ef4444') : '#f8fafc';
    return `<div class="retro-cmp-row">
      <div class="retro-cmp-metric">${label}</div>
      <div class="retro-cmp-prev">${pStr}</div>
      <div class="retro-cmp-curr" style="color:${cColor}">${cStr}${delta ? ' ' + delta : ''}</div>
    </div>`;
  }

  document.getElementById('retroCmpTable').innerHTML = `
    <div class="retro-cmp-head">
      <div></div>
      <div class="retro-cmp-month">${prev ? MONTH_SHORT[prev.month] : ''}</div>
      <div class="retro-cmp-month">${MONTH_SHORT[curr.month]}</div>
    </div>
    ${row('Receitas',    prev ? prev.receitas  : null, curr.receitas,  true,  fmt)}
    ${row('Despesas',    prev ? prev.despesas  : null, curr.despesas,  false, fmt)}
    ${row('Resultado',   prev ? prev.resultado : null, curr.resultado, true,  v => (v >= 0 ? '+' : '') + fmt(v))}
    ${row('% Economizado', prev && prev.receitas > 0 ? prev.economia : null, curr.economia, true, v => v.toFixed(1) + '%')}`;

  // Top categories
  const catLbl = document.getElementById('retroCatLbl');
  const catCmp = document.getElementById('retroCatCompare');
  if (curr.topCats.length > 0) {
    catLbl.style.display = '';
    const maxVal = curr.topCats[0].val;
    const prevMap = {};
    if (prev) prev.topCats.forEach(c => { prevMap[c.cat] = c.val; });
    catCmp.innerHTML = curr.topCats.map(c => {
      const pv = prevMap[c.cat] ?? null;
      const d  = pv !== null ? deltaTag(c.val, pv, false) : '';
      return `<div class="retro-cat-row">
        <div class="retro-cat-name">${c.name}</div>
        <div class="retro-cat-bar-wrap"><div class="retro-cat-bar" style="width:${(c.val / maxVal * 100).toFixed(1)}%"></div></div>
        <div class="retro-cat-val">${fmt(c.val)}${d ? ' ' + d : ''}</div>
      </div>`;
    }).join('');
  } else {
    catLbl.style.display = 'none';
    catCmp.innerHTML = '';
  }

  // Insight
  const insight = buildInsight(curr, prev);
  const insEl   = document.getElementById('retroInsight');
  if (insight) {
    insEl.style.display = 'flex';
    document.getElementById('retroInsightText').textContent = insight;
  } else {
    insEl.style.display = 'none';
  }

  // Nota salva
  const notaInput = document.getElementById('retroNotaInput');
  notaInput.value = '';
  if (userId) {
    try {
      const snap = await getDoc(doc(db, 'users', userId, 'notas', curr.key));
      if (snap.exists()) notaInput.value = snap.data().texto || '';
    } catch (_) {}
  }

  document.getElementById('retroModal').classList.remove('hidden');
}

function buildChart(chartSummaries) {
  const canvas = document.getElementById('retroChart');
  if (!canvas) return;
  if (retroChart) { retroChart.destroy(); retroChart = null; }

  const C = window.Chart;
  if (!C) return;

  const incBg  = chartSummaries.map(() => 'rgba(16,185,129,0.6)');
  const expBg  = chartSummaries.map(() => 'rgba(239,68,68,0.6)');
  const incBdr = chartSummaries.map(() => '#10b981');
  const expBdr = chartSummaries.map(() => '#ef4444');

  retroChart = new C(canvas, {
    type: 'bar',
    data: {
      labels: chartSummaries.map(s => MONTH_SHORT[s.month]),
      datasets: [
        { label: 'Receitas', data: chartSummaries.map(s => s.receitas),
          backgroundColor: incBg, borderColor: incBdr, borderWidth: 1.5, borderRadius: 5, borderSkipped: false },
        { label: 'Despesas', data: chartSummaries.map(s => s.despesas),
          backgroundColor: expBg, borderColor: expBdr, borderWidth: 1.5, borderRadius: 5, borderSkipped: false },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cursor: 'pointer',
      onClick(_, elements) {
        if (!elements.length) return;
        const i    = elements[0].index;
        const curr = chartSummaries[i];
        const prev = i > 0 ? chartSummaries[i - 1] : null;
        // Highlight selected group
        incBg.fill('rgba(16,185,129,0.55)');
        expBg.fill('rgba(239,68,68,0.55)');
        incBg[i] = 'rgba(16,185,129,1)';
        expBg[i] = 'rgba(239,68,68,1)';
        retroChart.update('none');
        openModal(curr, prev);
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1a3050',
          titleColor: '#94a3b8',
          bodyColor: '#f1f5f9',
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.raw)}`,
          },
        },
      },
      scales: {
        x: {
          ticks: { color: 'rgba(255,255,255,0.48)', font: { size: 11 } },
          grid: { display: false },
          border: { display: false },
        },
        y: {
          ticks: {
            color: 'rgba(255,255,255,0.32)',
            font: { size: 10 },
            callback: v => v >= 1000 ? 'R$' + (v / 1000).toFixed(0) + 'k' : 'R$' + v,
          },
          grid: { color: 'rgba(255,255,255,0.05)' },
          border: { display: false },
        },
      },
    },
  });
}

function init() {
  const incomes  = window._financeIncomes  || [];
  const expenses = window._financeExpenses || [];
  const now = new Date();
  const summaries = [];
  for (let i = 0; i < 6; i++) {
    let m = now.getMonth() - i, y = now.getFullYear();
    if (m < 0) { m += 12; y--; }
    summaries.push(computeSummary(incomes, expenses, y, m));
  }
  buildChart(summaries.slice().reverse()); // oldest → newest

  document.getElementById('retroSaveBtn').addEventListener('click', async () => {
    const userId = window._financeUserId;
    if (!userId || !activePeriod) return;
    const btn   = document.getElementById('retroSaveBtn');
    const texto = document.getElementById('retroNotaInput').value.trim();
    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Salvando...';
    try {
      await setDoc(doc(db, 'users', userId, 'notas', activePeriod.key), { texto, updatedAt: new Date().toISOString() });
      btn.innerHTML = '<i class="bi bi-check2"></i> Salvo!';
      setTimeout(() => { btn.innerHTML = '<i class="bi bi-check-lg"></i> Salvar anotação'; btn.disabled = false; }, 1800);
    } catch (_) {
      btn.innerHTML = '<i class="bi bi-check-lg"></i> Salvar anotação';
      btn.disabled = false;
    }
  });
}

window.addEventListener('financialDataReady', init);
