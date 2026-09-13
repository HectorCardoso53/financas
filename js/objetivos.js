import { auth, db } from './firebase-config.js';
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

let currentUser = null;
let unsubscribe = null;
let editingId = null;
let depositingId = null;
let depositingMode = 'depositar';
let objeList = [];

function showConfirm(msg, onOk, title = 'Confirmar exclusão') {
  const modal = document.getElementById('deleteConfirmModal');
  const msgEl = document.getElementById('delConfirmMsg');
  const titleEl = document.getElementById('delConfirmTitle');
  const okBtn = document.getElementById('delConfirmOk');
  const cancelBtn = document.getElementById('delConfirmCancel');
  if (!modal) { if (confirm(msg)) onOk(); return; }
  titleEl.textContent = title;
  msgEl.textContent = msg;
  modal.classList.remove('hidden');
  const close = () => modal.classList.add('hidden');
  const onClickOk = () => { close(); onOk(); okBtn.removeEventListener('click', onClickOk); cancelBtn.removeEventListener('click', onClickCancel); };
  const onClickCancel = () => { close(); okBtn.removeEventListener('click', onClickOk); cancelBtn.removeEventListener('click', onClickCancel); };
  okBtn.addEventListener('click', onClickOk);
  cancelBtn.addEventListener('click', onClickCancel);
}

const ICONS = [
  'bi-bullseye','bi-airplane','bi-house-door','bi-car-front','bi-phone',
  'bi-laptop','bi-mortarboard','bi-people','bi-heart','bi-piggy-bank',
  'bi-trophy','bi-music-note-beamed','bi-book','bi-globe','bi-hospital',
  'bi-gift','bi-bicycle','bi-camera','bi-briefcase','bi-graph-up-arrow',
  'bi-shield-check','bi-bank','bi-stars','bi-tools','bi-controller',
  'bi-bag','bi-watch','bi-sun','bi-tree','bi-balloon'
];
const COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316','#6366f1','#84cc16','#06b6d4','#a855f7'];

function fmtBRL(v) {
  return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseBRL(s) {
  return parseFloat((s || '0').replace(/[^\d,]/g, '').replace(',', '.')) || 0;
}

function applyMask(el) {
  el.addEventListener('input', () => {
    const v = el.value.replace(/\D/g, '');
    if (!v) { el.value = ''; return; }
    const n = parseInt(v, 10);
    el.value = 'R$ ' + (n / 100).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  });
}

onAuthStateChanged(auth, user => {
  currentUser = user;
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  if (user) listenObjetivos();
});

function listenObjetivos() {
  const ref = collection(db, 'users', currentUser.uid, 'objetivos');
  unsubscribe = onSnapshot(query(ref, orderBy('criadoEm', 'asc')), snap => {
    renderCards(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

function renderCards(objs) {
  const grid = document.getElementById('obj-grid');
  const empty = document.getElementById('obj-empty');
  if (!grid) return;

  objeList = objs;

  if (!objs.length) {
    grid.innerHTML = '';
    if (empty) empty.classList.remove('hidden');
    return;
  }
  if (empty) empty.classList.add('hidden');

  grid.innerHTML = objs.map(o => {
    const meta    = o.meta || 0;
    const atual   = o.saldoAtual || 0;
    const pct     = meta > 0 ? Math.min(100, Math.round((atual / meta) * 100)) : 0;
    const faltam  = Math.max(0, meta - atual);

    const today   = new Date();
    let mesesFaltam = 0;
    let idealMes  = 0;
    if (o.prazo) {
      const prazo = new Date(o.prazo + 'T00:00:00');
      mesesFaltam = Math.max(0, Math.ceil((prazo - today) / (1000 * 60 * 60 * 24 * 30)));
      idealMes    = mesesFaltam > 0 ? faltam / mesesFaltam : faltam;
    }

    const temPrazo = !!o.prazo;
    const prazoFmt = temPrazo
      ? new Date(o.prazo + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })
      : '';

    const cor = o.cor || '#3b82f6';
    const dash = 2 * Math.PI * 42;
    const dashOk = (pct / 100) * dash;

    return `<div class="obj-card" data-id="${o.id}">
      <div class="obj-card-top">
        <div class="obj-card-avatar" style="background:${cor}22;color:${cor}"><i class="bi ${o.icone || 'bi-bullseye'}"></i></div>
        <div class="obj-card-info">
          <div class="obj-card-nome">${escHtml(o.nome || 'Objetivo')}</div>
          <div class="obj-card-sub">${escHtml(o.descricao || '')}</div>
        </div>
        <div class="obj-card-actions">
          <button class="obj-action-btn obj-btn-menu" title="Opções" data-id="${o.id}"><i class="bi bi-three-dots-vertical"></i></button>
        </div>
      </div>
      <div class="obj-card-body">
        <div class="obj-card-stats">
          <div class="obj-stat"><span class="obj-stat-label">Objetivo</span><span class="obj-stat-val">${fmtBRL(meta)}</span></div>
          ${temPrazo ? `
          <div class="obj-stat"><span class="obj-stat-label">Espero alcançar em</span><span class="obj-stat-val obj-stat-date">${prazoFmt}${mesesFaltam > 0 ? `<span class="obj-stat-meses">faltam ${mesesFaltam} mese${mesesFaltam !== 1 ? 's' : ''}</span>` : ''}</span></div>
          <div class="obj-stat"><span class="obj-stat-label">Ideal por mês</span><span class="obj-stat-val">${fmtBRL(idealMes)}</span></div>
          ` : `
          <div class="obj-stat"><span class="obj-stat-label">Prazo</span><span class="obj-stat-val" style="color:rgba(255,255,255,0.35);font-weight:500">Sem prazo definido</span></div>
          `}
        </div>
        <div class="obj-card-ring">
          <svg viewBox="0 0 100 100" width="110" height="110">
            <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="10"/>
            <circle cx="50" cy="50" r="42" fill="none" stroke="${cor}" stroke-width="10"
              stroke-dasharray="${dashOk.toFixed(2)} ${dash.toFixed(2)}"
              stroke-linecap="round"
              transform="rotate(-90 50 50)"/>
            <text x="50" y="46" text-anchor="middle" dominant-baseline="middle" font-size="16" font-weight="700" fill="${cor}">${pct}%</text>
            <text x="50" y="63" text-anchor="middle" dominant-baseline="middle" font-size="7.5" fill="rgba(255,255,255,0.5)">${fmtBRL(atual)}</text>
            <text x="50" y="73" text-anchor="middle" dominant-baseline="middle" font-size="6.5" fill="rgba(255,255,255,0.3)">faltam ${fmtBRL(faltam)}</text>
          </svg>
        </div>
      </div>
      <div class="obj-ctx-menu hidden" data-id="${o.id}">
        <button class="obj-ctx-item obj-ctx-dep" data-id="${o.id}"><i class="bi bi-plus-circle"></i> Depositar</button>
        <button class="obj-ctx-item obj-ctx-ret" data-id="${o.id}"><i class="bi bi-dash-circle"></i> Retirar</button>
        <div class="obj-ctx-divider"></div>
        <button class="obj-ctx-item obj-ctx-edit" data-id="${o.id}"><i class="bi bi-pencil"></i> Editar</button>
        <button class="obj-ctx-item obj-ctx-del" data-id="${o.id}"><i class="bi bi-trash3"></i> Excluir</button>
      </div>
    </div>`;
  }).join('');

  // Events
  grid.querySelectorAll('.obj-btn-menu').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.id;
      grid.querySelectorAll('.obj-ctx-menu').forEach(m => {
        if (m.dataset.id !== id) m.classList.add('hidden');
      });
      grid.querySelector(`.obj-ctx-menu[data-id="${id}"]`)?.classList.toggle('hidden');
    });
  });
  grid.querySelectorAll('.obj-ctx-dep').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); openDeposit(btn.dataset.id, 'depositar'); });
  });
  grid.querySelectorAll('.obj-ctx-ret').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); openDeposit(btn.dataset.id, 'retirar'); });
  });
  grid.querySelectorAll('.obj-ctx-edit').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); openEdit(btn.dataset.id); });
  });
  grid.querySelectorAll('.obj-ctx-del').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      showConfirm('Este objetivo e todo o progresso salvo serão removidos permanentemente.', async () => {
        await deleteDoc(doc(db, 'users', currentUser.uid, 'objetivos', btn.dataset.id));
      }, 'Excluir objetivo');
    });
  });
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ===== MODAL NOVO / EDITAR =====
let selectedIcon = 'bi-bullseye';
let selectedColor = '#3b82f6';

function buildIconPicker() {
  const el = document.getElementById('obj-icon-picker');
  if (!el) return;
  el.innerHTML = ICONS.map(ic =>
    `<button class="obj-ico-btn${ic === selectedIcon ? ' obj-ico-active' : ''}" data-ico="${ic}"><i class="bi ${ic}"></i></button>`
  ).join('');
  el.querySelectorAll('.obj-ico-btn').forEach(b => {
    b.addEventListener('click', () => {
      selectedIcon = b.dataset.ico;
      el.querySelectorAll('.obj-ico-btn').forEach(x => x.classList.remove('obj-ico-active'));
      b.classList.add('obj-ico-active');
      updatePreview();
    });
  });
}

function buildColorPicker() {
  const el = document.getElementById('obj-color-picker');
  if (!el) return;
  el.innerHTML = COLORS.map(c =>
    `<button class="obj-col-btn${c === selectedColor ? ' obj-col-active' : ''}" data-col="${c}" style="background:${c}"></button>`
  ).join('');
  el.querySelectorAll('.obj-col-btn').forEach(b => {
    b.addEventListener('click', () => {
      selectedColor = b.dataset.col;
      el.querySelectorAll('.obj-col-btn').forEach(x => x.classList.remove('obj-col-active'));
      b.classList.add('obj-col-active');
      updatePreview();
    });
  });
}

function updatePreview() {
  const prev = document.getElementById('obj-modal-preview');
  if (prev) {
    prev.style.background = selectedColor + '22';
    prev.style.color = selectedColor;
  }
}

function openNew() {
  editingId = null;
  selectedIcon = '🎯';
  selectedColor = '#3b82f6';
  document.getElementById('obj-modal-title').textContent = 'Novo Objetivo';
  document.getElementById('obj-form').reset();
  buildIconPicker();
  buildColorPicker();
  updatePreview();
  const today = new Date();
  const nextYear = new Date(today.getFullYear() + 1, today.getMonth(), 1);
  const prazoEl = document.getElementById('obj-prazo');
  if (prazoEl) prazoEl.value = nextYear.toISOString().slice(0, 10);
  document.getElementById('obj-modal').classList.remove('hidden');
}

function openEdit(id) {
  if (!currentUser) return;
  const card = document.querySelector(`.obj-card[data-id="${id}"]`);
  if (!card) return;
  editingId = id;

  // Read from rendered card is fragile — re-fetch from Firestore snapshot instead via stored data
  // We'll parse from the rendered card's title / stats
  const nome = card.querySelector('.obj-card-nome')?.textContent || '';
  const descricao = card.querySelector('.obj-card-sub')?.textContent || '';

  document.getElementById('obj-modal-title').textContent = 'Editar Objetivo';
  document.getElementById('obj-nome').value = nome;
  document.getElementById('obj-descricao').value = descricao;

  // Fetch fresh data
  import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js").then(({ getDoc, doc: fdoc }) => {
    getDoc(fdoc(db, 'users', currentUser.uid, 'objetivos', id)).then(snap => {
      if (!snap.exists()) return;
      const d = snap.data();
      selectedIcon = d.icone || '🎯';
      selectedColor = d.cor || '#3b82f6';
      document.getElementById('obj-nome').value = d.nome || '';
      document.getElementById('obj-descricao').value = d.descricao || '';
      document.getElementById('obj-meta').value = d.meta ? fmtBRL(d.meta) : '';
      document.getElementById('obj-saldo-ini').value = d.saldoInicial ? fmtBRL(d.saldoInicial) : '';
      document.getElementById('obj-prazo').value = d.prazo || '';
      buildIconPicker();
      buildColorPicker();
      updatePreview();
    });
  });

  buildIconPicker();
  buildColorPicker();
  updatePreview();
  document.getElementById('obj-modal').classList.remove('hidden');
}

async function saveObjetivo() {
  if (!currentUser) return;
  const nome = document.getElementById('obj-nome').value.trim();
  if (!nome) { document.getElementById('obj-nome').focus(); return; }
  const meta     = parseBRL(document.getElementById('obj-meta').value);
  const saldoIni = parseBRL(document.getElementById('obj-saldo-ini').value);
  const prazo    = document.getElementById('obj-prazo').value || null;
  const descricao = document.getElementById('obj-descricao').value.trim();

  const data = { nome, descricao, meta, prazo, icone: selectedIcon, cor: selectedColor };

  if (editingId) {
    await updateDoc(doc(db, 'users', currentUser.uid, 'objetivos', editingId), data);
  } else {
    data.saldoInicial = saldoIni;
    data.saldoAtual   = saldoIni;
    data.criadoEm     = serverTimestamp();
    data.depositos    = [];
    await addDoc(collection(db, 'users', currentUser.uid, 'objetivos'), data);
    // Saldo inicial desconta do banco
    if (saldoIni > 0 && window.saveExpense) {
      const hoje = new Date().toISOString().split('T')[0];
      await window.saveExpense({ description: `Objetivo: ${nome}`, amount: saldoIni, category: 'outros', date: hoje });
    }
  }
  closeModal('obj-modal');
}

// ===== MODAL DEPOSITAR =====
function openDeposit(id, mode = 'depositar') {
  depositingId = id;
  depositingMode = mode;
  const card = document.querySelector(`.obj-card[data-id="${id}"]`);
  const nome  = card?.querySelector('.obj-card-nome')?.textContent || 'Objetivo';
  const avatarEl = card?.querySelector('.obj-card-avatar');
  const iconeClass = avatarEl?.querySelector('i')?.className || 'bi bi-bullseye';
  const cor = avatarEl?.style.color || '#3b82f6';

  document.getElementById('dep-obj-nome').textContent = nome;
  const av = document.getElementById('dep-obj-avatar');
  if (av) { av.innerHTML = `<i class="${iconeClass}"></i>`; av.style.color = cor; av.style.background = cor + '22'; }
  document.getElementById('dep-valor').value = '';
  document.getElementById('dep-obs').value = '';
  document.getElementById('dep-mensal').checked = false;
  const dateEl = document.getElementById('dep-data');
  if (dateEl) dateEl.value = new Date().toISOString().slice(0, 10);

  const isRet = mode === 'retirar';
  const titleEl = document.getElementById('dep-modal-title');
  const saveBtn = document.getElementById('dep-save-btn');
  if (titleEl) titleEl.textContent = isRet ? 'Retirar' : 'Depositar';
  if (saveBtn) {
    saveBtn.style.background = isRet
      ? 'linear-gradient(135deg,#ef4444,#dc2626)'
      : 'linear-gradient(135deg,#10b981,#059669)';
  }
  document.getElementById('dep-modal').classList.remove('hidden');
}

async function saveDeposito() {
  if (!currentUser || !depositingId) return;
  const valor = parseBRL(document.getElementById('dep-valor').value);
  if (!valor) { document.getElementById('dep-valor').focus(); return; }
  const obs    = document.getElementById('dep-obs').value.trim();
  const data   = document.getElementById('dep-data').value || new Date().toISOString().split('T')[0];
  const mensal = document.getElementById('dep-mensal').checked;

  const ref = doc(db, 'users', currentUser.uid, 'objetivos', depositingId);
  const { getDoc, updateDoc: upd, arrayUnion } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const atual = snap.data().saldoAtual || 0;

  const isRet = depositingMode === 'retirar';
  const deposito = { valor, obs, data, mensal, tipo: depositingMode, criadoEm: new Date().toISOString() };
  const novoSaldo = isRet ? Math.max(0, atual - valor) : atual + valor;
  await upd(ref, {
    saldoAtual: novoSaldo,
    depositos: arrayUnion(deposito)
  });

  // Reflete no saldo bancário
  const nomeObj = objeList.find(o => o.id === depositingId)?.nome || 'Objetivo';
  if (isRet) {
    if (window.saveIncome) await window.saveIncome({ description: `Retirada: ${nomeObj}`, amount: valor, category: 'outros', date: data });
  } else {
    if (window.saveExpense) await window.saveExpense({ description: `Objetivo: ${nomeObj}`, amount: valor, category: 'outros', date: data });
  }

  closeModal('dep-modal');
}

function closeModal(id) {
  document.getElementById(id)?.classList.add('hidden');
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  const view = document.getElementById('view-objetivos');
  if (!view) return;

  // Novo objetivo
  document.getElementById('obj-new-btn')?.addEventListener('click', openNew);
  document.getElementById('obj-close-btn')?.addEventListener('click', () => closeModal('obj-modal'));
  document.getElementById('obj-save-btn')?.addEventListener('click', saveObjetivo);
  document.getElementById('obj-modal')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeModal('obj-modal'); });

  // Depositar
  document.getElementById('dep-close-btn')?.addEventListener('click', () => closeModal('dep-modal'));
  document.getElementById('dep-save-btn')?.addEventListener('click', saveDeposito);
  document.getElementById('dep-modal')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeModal('dep-modal'); });

  // Toggle sem prazo
  document.getElementById('obj-sem-prazo-btn')?.addEventListener('click', () => {
    const prazoEl = document.getElementById('obj-prazo');
    if (prazoEl) prazoEl.value = '';
  });

  // Máscaras
  applyMask(document.getElementById('obj-meta'));
  applyMask(document.getElementById('obj-saldo-ini'));
  applyMask(document.getElementById('dep-valor'));

  // Fecha menu de contexto ao clicar fora
  document.addEventListener('click', () => {
    document.querySelectorAll('.obj-ctx-menu').forEach(m => m.classList.add('hidden'));
  });

  // Ativa quando navega para a view
  new MutationObserver(() => {
    if (!view.classList.contains('hidden') && currentUser) listenObjetivos();
  }).observe(view, { attributes: true, attributeFilter: ['class'] });
});
