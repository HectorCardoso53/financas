import { auth, db } from './firebase-config.js';
import {
  collection, getDocs, query, where
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

let currentUser = null;

onAuthStateChanged(auth, user => {
  currentUser = user;
  if (user) loadCats();
});

function fmtBRL(val) {
  return 'R$ ' + Number(val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

async function loadCats() {
  if (!currentUser) return;
  const snap = await getDocs(
    query(collection(db, 'users', currentUser.uid, 'categorias'), where('tipo', '==', 'despesa'))
  );
  const cats = snap.docs.map(d => d.data().nome).filter(Boolean).sort();
  const chipsEl = document.getElementById('rel-cat-chips');
  if (!chipsEl) return;
  const extra = cats.map(c =>
    `<button class="rel-chip" data-cat="${escHtml(c)}">${escHtml(c)}</button>`
  ).join('');
  chipsEl.innerHTML =
    `<button class="rel-chip rel-chip-active" data-cat=""><i class="bi bi-pencil"></i> Todas</button>` + extra;

  chipsEl.querySelectorAll('.rel-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      chipsEl.querySelectorAll('.rel-chip').forEach(b => b.classList.remove('rel-chip-active'));
      btn.classList.add('rel-chip-active');
    });
  });
}

async function applyFilter() {
  if (!currentUser) return;

  const startVal = document.getElementById('rel-date-start')?.value;
  const endVal   = document.getElementById('rel-date-end')?.value;
  const catChip  = document.querySelector('#rel-cat-chips .rel-chip-active');
  const cat      = catChip ? catChip.dataset.cat : '';
  const desc     = (document.getElementById('rel-desc-filter')?.value || '').trim().toLowerCase();
  const sit      = document.querySelector('#rel-sit-group .rel-tog-active')?.dataset.val || 'todas';
  const ordenar  = document.getElementById('rel-ordenar')?.value || 'venc-asc';

  const resultsEl = document.getElementById('rel-results');
  if (resultsEl) resultsEl.innerHTML = '<div class="rel-loading"><div class="ofx-spinner"></div><p>Carregando...</p></div>';

  const uid = currentUser.uid;
  const queries = [];
  if (startVal) {
    queries.push(getDocs(query(
      collection(db, 'users', uid, 'expenses'),
      where('date', '>=', startVal),
      where('date', '<=', endVal || '9999-12-31')
    )));
    queries.push(getDocs(query(
      collection(db, 'users', uid, 'incomes'),
      where('date', '>=', startVal),
      where('date', '<=', endVal || '9999-12-31')
    )));
  } else {
    queries.push(getDocs(collection(db, 'users', uid, 'expenses')));
    queries.push(getDocs(collection(db, 'users', uid, 'incomes')));
  }

  const [eSnap, iSnap] = await Promise.all(queries);
  let expenses = eSnap.docs.map(d => ({ id: d.id, tipo: 'despesa', ...d.data() }));
  let incomes  = iSnap.docs.map(d => ({ id: d.id, tipo: 'receita', ...d.data() }));

  // Filtros locais
  if (cat) {
    expenses = expenses.filter(t => (t.category || '').toLowerCase() === cat.toLowerCase());
    incomes  = incomes.filter(t => (t.category || '').toLowerCase() === cat.toLowerCase());
  }
  if (desc) {
    const re = new RegExp(desc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    expenses = expenses.filter(t => re.test(t.description || ''));
    incomes  = incomes.filter(t => re.test(t.description || ''));
  }
  if (sit === 'efetivadas') expenses = expenses.filter(t => t.paid);
  if (sit === 'pendentes')  expenses = expenses.filter(t => !t.paid);

  let all = [...expenses, ...incomes];

  // Ordenação
  all.sort((a, b) => {
    if (ordenar === 'venc-asc')   return (a.date || '') < (b.date || '') ? -1 : 1;
    if (ordenar === 'venc-desc')  return (a.date || '') > (b.date || '') ? -1 : 1;
    if (ordenar === 'valor-desc') return (b.amount || 0) - (a.amount || 0);
    if (ordenar === 'valor-asc')  return (a.amount || 0) - (b.amount || 0);
    if (ordenar === 'desc-asc')   return (a.description || '') < (b.description || '') ? -1 : 1;
    return 0;
  });

  renderResults(all);
}

function renderResults(txs) {
  const el = document.getElementById('rel-results');
  if (!el) return;

  if (!txs.length) {
    el.innerHTML = `<div class="rel-results-empty"><i class="bi bi-search"></i><p>Nenhuma transação encontrada.</p></div>`;
    return;
  }

  const totalDesp = txs.filter(t => t.tipo === 'despesa').reduce((s, t) => s + (t.amount || 0), 0);
  const totalRec  = txs.filter(t => t.tipo === 'receita').reduce((s, t) => s + (t.amount || 0), 0);
  const saldo     = totalRec - totalDesp;

  el.innerHTML = `
    <div class="rel-res-summary">
      <div class="rel-res-sum-item">
        <span class="rel-res-sum-label">Receitas</span>
        <span class="rel-res-sum-val" style="color:#10b981">${fmtBRL(totalRec)}</span>
      </div>
      <div class="rel-res-sum-item">
        <span class="rel-res-sum-label">Despesas</span>
        <span class="rel-res-sum-val" style="color:#ef4444">${fmtBRL(totalDesp)}</span>
      </div>
      <div class="rel-res-sum-item">
        <span class="rel-res-sum-label">Saldo</span>
        <span class="rel-res-sum-val" style="color:${saldo >= 0 ? '#10b981' : '#ef4444'}">${fmtBRL(saldo)}</span>
      </div>
      <span class="rel-res-count">${txs.length} transação(ões)</span>
    </div>
    <div class="rel-res-table-wrap">
      <table class="rel-res-table">
        <thead>
          <tr>
            <th>Data</th>
            <th>Descrição</th>
            <th>Categoria</th>
            <th>Tipo</th>
            <th style="text-align:right">Valor</th>
          </tr>
        </thead>
        <tbody>
          ${txs.map(t => {
            const isRec = t.tipo === 'receita';
            const dateFmt = t.date
              ? new Date(t.date + 'T00:00:00').toLocaleDateString('pt-BR')
              : '—';
            return `<tr>
              <td class="rel-td-date">${escHtml(dateFmt)}</td>
              <td>${escHtml(t.description || '—')}</td>
              <td><span class="rel-td-cat">${escHtml(t.category || 'outros')}</span></td>
              <td><span class="rel-td-tipo ${isRec ? 'rel-tipo-rec' : 'rel-tipo-desp'}">${isRec ? 'Receita' : 'Despesa'}</span></td>
              <td class="rel-td-amt ${isRec ? 'rel-amt-rec' : 'rel-amt-desp'}">${fmtBRL(t.amount)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

document.addEventListener('DOMContentLoaded', () => {
  const view = document.getElementById('view-relatorios');
  if (!view) return;

  // Sincroniza datas com o filtro global (mês/ano do header)
  function syncDatesFromFilter() {
    const fm = document.getElementById('filterMonth');
    const fy = document.getElementById('filterYear');
    const month = fm ? parseInt(fm.value) : new Date().getMonth();
    const year  = fy ? parseInt(fy.value)  : new Date().getFullYear();
    const m = String(month + 1).padStart(2, '0');
    const y = String(year);
    const lastDay = new Date(year, month + 1, 0).getDate();
    const startEl = document.getElementById('rel-date-start');
    const endEl   = document.getElementById('rel-date-end');
    if (startEl) startEl.value = `${y}-${m}-01`;
    if (endEl)   endEl.value   = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;
  }

  syncDatesFromFilter();

  // Re-sincroniza quando o filtro do dashboard muda
  ['filterMonth', 'filterYear'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
      syncDatesFromFilter();
      if (!view.classList.contains('hidden')) applyFilter();
    });
  });

  // Quando a view aparece, aplica automaticamente
  new MutationObserver(() => {
    if (!view.classList.contains('hidden')) { syncDatesFromFilter(); applyFilter(); }
  }).observe(view, { attributes: true, attributeFilter: ['class'] });

  // Tab switching
  view.addEventListener('click', e => {
    const tab = e.target.closest('[data-rel-tab]');
    if (tab) {
      view.querySelectorAll('[data-rel-tab]').forEach(t => t.classList.remove('rel-tab-active'));
      tab.classList.add('rel-tab-active');
      view.querySelectorAll('.rel-panel').forEach(p => p.classList.add('hidden'));
      document.getElementById('rel-panel-' + tab.dataset.relTab)?.classList.remove('hidden');
      return;
    }

    // Single-select toggle rows
    const tog = e.target.closest('.rel-tog');
    if (tog) {
      const group = tog.dataset.group;
      if (group) {
        document.getElementById(group)?.querySelectorAll('.rel-tog')
          .forEach(t => t.classList.remove('rel-tog-active'));
        tog.classList.add('rel-tog-active');
      }
      return;
    }
  });

  // Apply
  document.getElementById('rel-apply-btn')?.addEventListener('click', applyFilter);

  // Clear
  document.getElementById('rel-clear-btn')?.addEventListener('click', () => {
    if (startEl) startEl.value = `${y}-${m}-01`;
    if (endEl)   endEl.value   = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;
    view.querySelectorAll('.rel-toggle-row').forEach(row => {
      const first = row.querySelector('.rel-tog');
      row.querySelectorAll('.rel-tog').forEach(t => t.classList.remove('rel-tog-active'));
      if (first) first.classList.add('rel-tog-active');
    });
    view.querySelectorAll('#rel-cat-chips .rel-chip').forEach((b, i) => {
      b.classList.toggle('rel-chip-active', i === 0);
    });
    const descEl = document.getElementById('rel-desc-filter');
    if (descEl) descEl.value = '';
    const resultsEl = document.getElementById('rel-results');
    if (resultsEl) resultsEl.innerHTML = `<div class="rel-results-empty">
      <i class="bi bi-funnel"></i><p>Clique em <strong>Aplicar filtro</strong> para ver os resultados.</p></div>`;
  });

  // Observe visibility
  new MutationObserver(() => {
    if (!view.classList.contains('hidden') && currentUser) loadCats();
  }).observe(view, { attributes: true, attributeFilter: ['class'] });
});
