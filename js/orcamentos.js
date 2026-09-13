import { auth, db } from './firebase-config.js';
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp, query, where, getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

let currentUser = null;
let unsubOrc = null;
let orcamentos = [];
let abaAtiva = 'despesa';
let soPersonalizados = false;
let editingOrcId = null;

const COLORS = ['#ef4444','#f97316','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ec4899','#14b8a6','#6366f1','#84cc16'];
const ICONS  = ['bi-percent','bi-house-door','bi-car-front','bi-cart3','bi-heart-pulse',
                 'bi-mortarboard','bi-lightning','bi-phone','bi-people','bi-music-note-beamed',
                 'bi-airplane','bi-controller','bi-briefcase','bi-basket','bi-cup-hot',
                 'bi-graph-up-arrow','bi-shield-check','bi-bicycle','bi-camera','bi-gift'];

let selIcon  = 'bi-percent';
let selColor = '#ef4444';

function fmtBRL(v) {
  return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function parseBRL(s) {
  return parseFloat((s || '0').replace(/[^\d,]/g, '').replace(',', '.')) || 0;
}
function applyMask(el) {
  if (!el) return;
  el.addEventListener('input', () => {
    const v = el.value.replace(/\D/g, '');
    if (!v) { el.value = ''; return; }
    el.value = 'R$ ' + (parseInt(v, 10) / 100).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  });
}
function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

onAuthStateChanged(auth, user => {
  currentUser = user;
  if (unsubOrc) { unsubOrc(); unsubOrc = null; }
  if (user) listenOrcamentos();
});

function listenOrcamentos() {
  const ref = collection(db, 'users', currentUser.uid, 'orcamentos');
  unsubOrc = onSnapshot(ref, snap => {
    orcamentos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    refreshView();
  });
}

function getMonthRange() {
  const m = parseInt(document.getElementById('filterMonth')?.value ?? new Date().getMonth());
  const y = parseInt(document.getElementById('filterYear')?.value  ?? new Date().getFullYear());
  const pad = n => String(n).padStart(2, '0');
  const last = new Date(y, m + 1, 0).getDate();
  return { start: `${y}-${pad(m + 1)}-01`, end: `${y}-${pad(m + 1)}-${pad(last)}` };
}

async function calcActuals() {
  if (!currentUser) return { expenses: [], incomes: [] };
  const { start, end } = getMonthRange();
  const uid = currentUser.uid;
  const [eSnap, iSnap] = await Promise.all([
    getDocs(query(collection(db, 'users', uid, 'expenses'), where('date', '>=', start), where('date', '<=', end))),
    getDocs(query(collection(db, 'users', uid, 'incomes'),  where('date', '>=', start), where('date', '<=', end)))
  ]);
  return {
    expenses: eSnap.docs.map(d => d.data()),
    incomes:  iSnap.docs.map(d => d.data())
  };
}

async function refreshView() {
  const view = document.getElementById('view-orcamentos');
  if (!view || view.classList.contains('hidden')) return;
  const { expenses, incomes } = await calcActuals();
  renderTabela(expenses, incomes);
}

function renderTabela(expenses, incomes) {
  const tbody = document.getElementById('orc-tbody');
  const tipo  = abaAtiva;
  const txAll = tipo === 'despesa' ? expenses : incomes;

  // Total geral de transações no mês
  const totalTx = txAll.reduce((s, t) => s + (t.amount || 0), 0);

  let rows = orcamentos.filter(o => o.tipo === tipo);
  if (soPersonalizados) rows = rows.filter(o => !o.geral);

  // Sempre inclui o "geral"
  const geralOrc = orcamentos.find(o => o.tipo === tipo && o.geral);

  const allRows = [];

  // Linha geral
  const geralMeta = geralOrc?.meta || 0;
  const geralDesp = totalTx;
  const geralSaldo = geralMeta - geralDesp;
  const geralPrev  = geralSaldo; // simplificado
  const geralPct   = geralMeta > 0 ? Math.min(100, Math.round((geralDesp / geralMeta) * 100)) : (geralDesp > 0 ? 100 : 0);

  if (!soPersonalizados) {
    allRows.push({
      id: geralOrc?.id || '__geral__',
      geral: true,
      nome: 'Orçamento geral',
      sub: 'Considerado no saldo previsto',
      cor: geralOrc?.cor || '#ef4444',
      icone: geralOrc?.icone || 'bi-percent',
      meta: geralMeta,
      gasto: geralDesp,
      saldo: geralSaldo,
      previsto: geralPrev,
      pct: geralPct,
      tipo
    });
  }

  // Linhas personalizadas
  const customRows = rows.filter(o => !o.geral);
  for (const o of customRows) {
    const catTx = txAll.filter(t => (t.category || '').toLowerCase() === (o.categoria || '').toLowerCase());
    const gasto = catTx.reduce((s, t) => s + (t.amount || 0), 0);
    const saldo = (o.meta || 0) - gasto;
    const pct   = o.meta > 0 ? Math.min(100, Math.round((gasto / o.meta) * 100)) : (gasto > 0 ? 100 : 0);
    allRows.push({
      id: o.id, geral: false,
      nome: o.nome, sub: o.categoria || '',
      cor: o.cor || '#3b82f6', icone: o.icone || 'bi-tag',
      meta: o.meta || 0, gasto, saldo, previsto: saldo, pct, tipo
    });
  }

  if (!tbody) return;
  tbody.innerHTML = allRows.map(r => {
    const over = r.pct >= 100;
    const barColor = over ? '#ef4444' : (r.cor || '#10b981');
    return `<tr class="orc-row" data-id="${r.id}">
      <td class="orc-td-desc">
        <div class="orc-desc-inner">
          <div class="orc-avatar" style="background:${r.cor}22;color:${r.cor}"><i class="bi ${r.icone}"></i></div>
          <div>
            <div class="orc-nome">${escHtml(r.nome)}</div>
            <div class="orc-sub">${escHtml(r.sub)}</div>
          </div>
        </div>
      </td>
      <td class="orc-td">${fmtBRL(r.meta)}</td>
      <td class="orc-td">${fmtBRL(r.gasto)}</td>
      <td class="orc-td orc-saldo ${r.saldo < 0 ? 'orc-neg' : ''}">${fmtBRL(r.saldo)}</td>
      <td class="orc-td orc-prev">${fmtBRL(r.previsto)}</td>
      <td class="orc-td-util">
        <div class="orc-bar-wrap">
          <div class="orc-bar-fill" style="width:${r.pct}%;background:${barColor}">
            <span class="orc-bar-pct">${r.pct}%</span>
          </div>
        </div>
      </td>
      <td class="orc-td-acoes">
        ${!r.geral ? `<button class="orc-act-btn orc-act-edit" data-id="${r.id}" title="Editar"><i class="bi bi-pencil"></i></button>
        <button class="orc-act-btn orc-act-del" data-id="${r.id}" title="Excluir"><i class="bi bi-trash3"></i></button>` : ''}
      </td>
    </tr>`;
  }).join('') || `<tr><td colspan="7" class="orc-empty-row">Nenhum orçamento cadastrado.</td></tr>`;

  // Bind actions
  tbody.querySelectorAll('.orc-act-edit').forEach(btn => {
    btn.addEventListener('click', () => openEditOrc(btn.dataset.id));
  });
  tbody.querySelectorAll('.orc-act-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (confirm('Excluir orçamento?'))
        await deleteDoc(doc(db, 'users', currentUser.uid, 'orcamentos', btn.dataset.id));
    });
  });

  // Footer
  const totalMeta  = allRows.reduce((s, r) => s + r.meta, 0);
  const totalGasto = allRows.reduce((s, r) => s + r.gasto, 0);
  const totalDisp  = totalMeta - totalGasto;
  const totPct     = totalMeta > 0 ? Math.min(100, Math.round((totalGasto / totalMeta) * 100)) : 0;
  const label      = tipo === 'despesa' ? 'Despesas' : 'Receitas';
  const footBarColor = totPct >= 100 ? '#ef4444' : '#10b981';

  const fMeta  = document.getElementById('orc-foot-meta');
  const fGasto = document.getElementById('orc-foot-gasto');
  const fDisp  = document.getElementById('orc-foot-disp');
  const fBar   = document.getElementById('orc-foot-bar');
  const fLabel = document.getElementById('orc-foot-label');
  if (fMeta)  fMeta.textContent  = fmtBRL(totalMeta);
  if (fGasto) fGasto.textContent = fmtBRL(totalGasto);
  if (fDisp)  fDisp.textContent  = fmtBRL(totalDisp);
  if (fLabel) fLabel.textContent = label + ':';
  if (fBar)   { fBar.style.width = totPct + '%'; fBar.style.background = footBarColor; }
}

// ===== MODAL =====
function buildPickers() {
  const ip = document.getElementById('orc-icon-picker');
  if (ip) {
    ip.innerHTML = ICONS.map(ic =>
      `<button type="button" class="obj-ico-btn${ic === selIcon ? ' obj-ico-active' : ''}" data-ico="${ic}"><i class="bi ${ic}"></i></button>`
    ).join('');
    ip.querySelectorAll('.obj-ico-btn').forEach(b => {
      b.addEventListener('click', () => {
        selIcon = b.dataset.ico;
        ip.querySelectorAll('.obj-ico-btn').forEach(x => x.classList.remove('obj-ico-active'));
        b.classList.add('obj-ico-active');
        updateOrcPreview();
      });
    });
  }
  const cp = document.getElementById('orc-color-picker');
  if (cp) {
    cp.innerHTML = COLORS.map(c =>
      `<button type="button" class="obj-col-btn${c === selColor ? ' obj-col-active' : ''}" data-col="${c}" style="background:${c}"></button>`
    ).join('');
    cp.querySelectorAll('.obj-col-btn').forEach(b => {
      b.addEventListener('click', () => {
        selColor = b.dataset.col;
        cp.querySelectorAll('.obj-col-btn').forEach(x => x.classList.remove('obj-col-active'));
        b.classList.add('obj-col-active');
        updateOrcPreview();
      });
    });
  }
}

function updateOrcPreview() {
  const p = document.getElementById('orc-modal-preview');
  if (p) { p.innerHTML = `<i class="bi ${selIcon}"></i>`; p.style.background = selColor + '22'; p.style.color = selColor; }
}

function openNewOrc() {
  editingOrcId = null;
  selIcon  = 'bi-percent';
  selColor = '#ef4444';
  document.getElementById('orc-modal-title').textContent = 'Novo Orçamento';
  document.getElementById('orc-form').reset();
  document.getElementById('orc-tipo').value = abaAtiva;
  buildPickers();
  updateOrcPreview();
  document.getElementById('orc-modal').classList.remove('hidden');
}

function openEditOrc(id) {
  const o = orcamentos.find(x => x.id === id);
  if (!o) return;
  editingOrcId = id;
  selIcon  = o.icone  || 'bi-percent';
  selColor = o.cor    || '#ef4444';
  document.getElementById('orc-modal-title').textContent = 'Editar Orçamento';
  document.getElementById('orc-nome').value     = o.nome || '';
  document.getElementById('orc-meta').value     = o.meta ? fmtBRL(o.meta) : '';
  document.getElementById('orc-tipo').value     = o.tipo || 'despesa';
  document.getElementById('orc-categoria').value = o.categoria || '';
  buildPickers();
  updateOrcPreview();
  document.getElementById('orc-modal').classList.remove('hidden');
}

async function saveOrc() {
  if (!currentUser) return;
  const nome = document.getElementById('orc-nome').value.trim();
  if (!nome) { document.getElementById('orc-nome').focus(); return; }
  const meta      = parseBRL(document.getElementById('orc-meta').value);
  const tipo      = document.getElementById('orc-tipo').value;
  const categoria = document.getElementById('orc-categoria').value.trim();
  const data = { nome, meta, tipo, categoria, icone: selIcon, cor: selColor };

  if (editingOrcId) {
    await updateDoc(doc(db, 'users', currentUser.uid, 'orcamentos', editingOrcId), data);
  } else {
    data.criadoEm = serverTimestamp();
    data.geral = false;
    await addDoc(collection(db, 'users', currentUser.uid, 'orcamentos'), data);
  }
  closeOrcModal();
}

function closeOrcModal() {
  document.getElementById('orc-modal')?.classList.add('hidden');
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  const view = document.getElementById('view-orcamentos');
  if (!view) return;

  // Tabs
  view.querySelectorAll('.orc-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      view.querySelectorAll('.orc-tab').forEach(t => t.classList.remove('orc-tab-active'));
      tab.classList.add('orc-tab-active');
      abaAtiva = tab.dataset.tipo;
      const label = abaAtiva === 'despesa' ? 'Despesas' : 'Receitas';
      const thGasto = document.getElementById('orc-th-gasto');
      if (thGasto) thGasto.textContent = label;
      refreshView();
    });
  });

  // Toggle personalizados
  document.getElementById('orc-toggle-custom')?.addEventListener('change', e => {
    soPersonalizados = e.target.checked;
    refreshView();
  });

  // Novo
  document.getElementById('orc-new-btn')?.addEventListener('click', openNewOrc);

  // Modal
  document.getElementById('orc-close-btn')?.addEventListener('click', closeOrcModal);
  document.getElementById('orc-save-btn')?.addEventListener('click', saveOrc);
  document.getElementById('orc-modal')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeOrcModal(); });

  // Máscara
  applyMask(document.getElementById('orc-meta'));

  // Atualiza ao trocar mês/ano
  document.getElementById('filterMonth')?.addEventListener('change', refreshView);
  document.getElementById('filterYear')?.addEventListener('change', refreshView);

  // Observer de visibilidade
  new MutationObserver(() => {
    if (!view.classList.contains('hidden') && currentUser) refreshView();
  }).observe(view, { attributes: true, attributeFilter: ['class'] });
});
