import { auth, db } from './firebase-config.js';
import {
  collection, addDoc, getDocs, deleteDoc, doc, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

let currentUser = null;
let allCategories = [];
let selectedCatId = null;
let activeTipo = 'despesa';
let pickedIcon = 'bi-tag-fill';
let pickedColor = '#10b981';
let modalMode = 'cat';
let modalParentId = '';

const DEFAULTS = {
  despesa: [
    { nome: 'Alimentação', icone: 'bi-basket2-fill',     cor: '#10b981' },
    { nome: 'Transporte',  icone: 'bi-bus-front-fill',   cor: '#f59e0b' },
    { nome: 'Moradia',     icone: 'bi-house-fill',        cor: '#6366f1' },
    { nome: 'Saúde',       icone: 'bi-heart-pulse-fill', cor: '#ef4444' },
    { nome: 'Educação',    icone: 'bi-mortarboard-fill', cor: '#3b82f6' },
    { nome: 'Lazer',       icone: 'bi-controller',        cor: '#8b5cf6' },
    { nome: 'Outros',      icone: 'bi-three-dots',        cor: '#6b7280' },
  ],
  receita: [
    { nome: 'Salário',       icone: 'bi-briefcase-fill',  cor: '#10b981' },
    { nome: 'Freelance',     icone: 'bi-laptop',          cor: '#3b82f6' },
    { nome: 'Investimentos', icone: 'bi-graph-up-arrow',  cor: '#8b5cf6' },
    { nome: 'Outros',        icone: 'bi-three-dots',      cor: '#6b7280' },
  ],
  conta: [
    { nome: 'Corrente', icone: 'bi-bank2',           cor: '#3b82f6' },
    { nome: 'Poupança', icone: 'bi-piggy-bank-fill', cor: '#10b981' },
  ],
};

const PRESET_ICONS = [
  'bi-basket2-fill','bi-bus-front-fill','bi-house-fill','bi-heart-pulse-fill',
  'bi-mortarboard-fill','bi-controller','bi-briefcase-fill','bi-laptop',
  'bi-graph-up-arrow','bi-tag-fill','bi-scissors','bi-tools',
  'bi-cup-hot-fill','bi-music-note-beamed','bi-camera-fill','bi-phone-fill',
  'bi-car-front-fill','bi-shop','bi-percent','bi-currency-dollar',
  'bi-wallet2','bi-shield-fill','bi-piggy-bank-fill','bi-bank2',
];

const PRESET_COLORS = [
  '#10b981','#3b82f6','#8b5cf6','#ef4444','#f59e0b',
  '#ec4899','#6b7280','#14b8a6','#f97316','#84cc16',
];

function fmtBRL(val) {
  return 'R$ ' + Number(val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function normStr(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, '');
}

function calcTotals() {
  const totals = {};
  const parseList = (listId) => {
    const list = document.getElementById(listId);
    if (!list) return;
    list.querySelectorAll('.transaction-item').forEach(row => {
      let catClass = 'outros';
      row.querySelector('.category-badge')?.classList.forEach(c => {
        if (c !== 'category-badge' && c.startsWith('category-')) catClass = c.replace('category-', '');
      });
      const amtStr = row.querySelector('.transaction-amount')?.textContent?.trim() || '';
      const amt = parseFloat(amtStr.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
      totals[normStr(catClass)] = (totals[normStr(catClass)] || 0) + amt;
    });
  };
  parseList('expenseList');
  parseList('incomeList');
  return totals;
}

onAuthStateChanged(auth, user => {
  currentUser = user;
  if (user) listenCategories();
});

async function seedDefaults() {
  if (!currentUser) return;
  const ref = collection(db, 'users', currentUser.uid, 'categorias');
  for (const tipo of ['despesa', 'receita', 'conta']) {
    for (const cat of DEFAULTS[tipo]) {
      await addDoc(ref, { ...cat, tipo });
    }
  }
}

function listenCategories() {
  const ref = collection(db, 'users', currentUser.uid, 'categorias');
  onSnapshot(ref, async snap => {
    if (snap.empty) { await seedDefaults(); return; }
    const cats = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    for (const cat of cats) {
      const sub = await getDocs(collection(db, 'users', currentUser.uid, 'categorias', cat.id, 'subcategorias'));
      cat.subcategorias = sub.docs.map(d => ({ id: d.id, ...d.data() }));
    }
    allCategories = cats;
    renderCategorias();
  });
}

function renderCategorias() {
  const view = document.getElementById('view-categorias');
  if (!view || view.classList.contains('hidden')) return;

  const cats = allCategories.filter(c => c.tipo === activeTipo);
  const totals = calcTotals();

  const list = document.getElementById('cat-list');
  if (!list) return;

  list.innerHTML = cats.length === 0
    ? '<div class="cat-empty"><i class="bi bi-tag"></i><p>Nenhuma categoria.<br>Clique em <strong>+ Nova Categoria</strong>.</p></div>'
    : cats.map(cat => {
        const total = totals[normStr(cat.nome)] || 0;
        const sel = cat.id === selectedCatId;
        return `<div class="cat-row${sel ? ' cat-row-active' : ''}" data-cat-id="${cat.id}">
          <div class="cat-row-left">
            <div class="cat-row-icon" style="background:${cat.cor}"><i class="bi ${cat.icone}"></i></div>
            <span class="cat-nome">${cat.nome}</span>
          </div>
          <div class="cat-row-right">
            <span class="cat-total-val">${fmtBRL(total)}</span>
            <button class="cat-act-btn cat-sub-btn" data-cat-id="${cat.id}" title="Subcategorias"><i class="bi bi-list-ul"></i></button>
            <button class="cat-act-btn cat-del-btn" data-cat-id="${cat.id}" title="Remover"><i class="bi bi-three-dots-vertical"></i></button>
          </div>
        </div>`;
      }).join('');

  const totalSum = cats.reduce((s, c) => s + (totals[normStr(c.nome)] || 0), 0);
  const countEl = document.getElementById('cat-count');
  const totalEl = document.getElementById('cat-total');
  if (countEl) countEl.textContent = `Categorias (${cats.length})`;
  if (totalEl) totalEl.textContent = fmtBRL(totalSum);

  list.querySelectorAll('.cat-row').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.closest('.cat-act-btn')) return;
      selectedCatId = selectedCatId === row.dataset.catId ? null : row.dataset.catId;
      renderCategorias();
    });
  });

  list.querySelectorAll('.cat-sub-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      selectedCatId = btn.dataset.catId;
      renderCategorias();
    });
  });

  list.querySelectorAll('.cat-del-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('Remover esta categoria e suas subcategorias?')) return;
      const catId = btn.dataset.catId;
      const subSnap = await getDocs(collection(db, 'users', currentUser.uid, 'categorias', catId, 'subcategorias'));
      for (const d of subSnap.docs) {
        await deleteDoc(doc(db, 'users', currentUser.uid, 'categorias', catId, 'subcategorias', d.id));
      }
      await deleteDoc(doc(db, 'users', currentUser.uid, 'categorias', catId));
      if (selectedCatId === catId) selectedCatId = null;
    });
  });

  if (selectedCatId) {
    const sel = cats.find(c => c.id === selectedCatId);
    if (sel) renderSubPanel(sel);
    else closeSubPanel();
  } else {
    closeSubPanel();
  }
}

function renderSubPanel(cat) {
  const right = document.getElementById('cat-right');
  if (!right) return;
  right.classList.remove('hidden');

  const title = document.getElementById('cat-sub-title');
  if (title) title.textContent = `Subcategorias de ${cat.nome}`;

  const addBtn = document.getElementById('cat-sub-add-btn');
  if (addBtn) addBtn.onclick = () => openModal('sub', cat.id);

  const subs = cat.subcategorias || [];
  const list = document.getElementById('cat-sub-list');
  if (!list) return;

  list.innerHTML = subs.length === 0
    ? '<div class="cat-empty"><i class="bi bi-receipt"></i><p>Nenhuma subcategoria.</p></div>'
    : subs.map(sub => `<div class="cat-row">
        <div class="cat-row-left">
          <div class="cat-row-icon" style="background:${sub.cor}"><i class="bi ${sub.icone}"></i></div>
          <span class="cat-nome">${sub.nome}</span>
        </div>
        <div class="cat-row-right">
          <span class="cat-total-val">${fmtBRL(0)}</span>
          <button class="cat-act-btn cat-sub-del-btn" data-cat-id="${cat.id}" data-sub-id="${sub.id}" title="Remover"><i class="bi bi-three-dots-vertical"></i></button>
        </div>
      </div>`).join('');

  const countEl = document.getElementById('cat-sub-count');
  const totalEl = document.getElementById('cat-sub-total');
  if (countEl) countEl.textContent = `Subcategorias (${subs.length})`;
  if (totalEl) totalEl.textContent = fmtBRL(0);

  list.querySelectorAll('.cat-sub-del-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('Remover esta subcategoria?')) return;
      await deleteDoc(doc(db, 'users', currentUser.uid, 'categorias', btn.dataset.catId, 'subcategorias', btn.dataset.subId));
    });
  });
}

function closeSubPanel() {
  document.getElementById('cat-right')?.classList.add('hidden');
}

function openModal(mode, parentId = '') {
  const modal = document.getElementById('novaCategoriaModal');
  if (!modal) return;
  modalMode = mode;
  modalParentId = parentId;
  document.getElementById('cat-modal-title').textContent = mode === 'sub' ? 'Nova Subcategoria' : 'Nova Categoria';
  const nameEl = document.getElementById('cat-modal-nome');
  if (nameEl) nameEl.value = '';
  pickedIcon = 'bi-tag-fill';
  pickedColor = '#10b981';
  buildIconPicker(document.getElementById('cat-icon-picker'));
  buildColorPicker(document.getElementById('cat-color-picker'));
  updatePreview();
  modal.classList.remove('hidden');
  setTimeout(() => nameEl?.focus(), 80);
}

function buildIconPicker(el) {
  if (!el) return;
  el.innerHTML = PRESET_ICONS.map(ic =>
    `<div class="cat-icon-opt${ic === pickedIcon ? ' cat-opt-sel' : ''}" data-icon="${ic}"><i class="bi ${ic}"></i></div>`
  ).join('');
  el.querySelectorAll('.cat-icon-opt').forEach(opt => {
    opt.addEventListener('click', () => {
      pickedIcon = opt.dataset.icon;
      el.querySelectorAll('.cat-icon-opt').forEach(o => o.classList.remove('cat-opt-sel'));
      opt.classList.add('cat-opt-sel');
      updatePreview();
    });
  });
}

function buildColorPicker(el) {
  if (!el) return;
  el.innerHTML = PRESET_COLORS.map(c =>
    `<div class="cat-color-opt${c === pickedColor ? ' cat-opt-sel' : ''}" data-color="${c}" style="background:${c}"></div>`
  ).join('');
  el.querySelectorAll('.cat-color-opt').forEach(opt => {
    opt.addEventListener('click', () => {
      pickedColor = opt.dataset.color;
      el.querySelectorAll('.cat-color-opt').forEach(o => o.classList.remove('cat-opt-sel'));
      opt.classList.add('cat-opt-sel');
      updatePreview();
    });
  });
}

function updatePreview() {
  const prev = document.getElementById('cat-preview-icon');
  if (prev) {
    prev.style.background = pickedColor;
    prev.innerHTML = `<i class="bi ${pickedIcon}"></i>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('cat-add-btn')?.addEventListener('click', () => openModal('cat'));

  const modal = document.getElementById('novaCategoriaModal');
  if (modal) {
    document.getElementById('closeCatModal')?.addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });
  }

  document.getElementById('cat-save-btn')?.addEventListener('click', async () => {
    if (!currentUser) return;
    const nome = (document.getElementById('cat-modal-nome')?.value || '').trim();
    if (!nome) { document.getElementById('cat-modal-nome')?.focus(); return; }
    const data = { nome, icone: pickedIcon, cor: pickedColor };
    if (modalMode === 'sub' && modalParentId) {
      await addDoc(collection(db, 'users', currentUser.uid, 'categorias', modalParentId, 'subcategorias'), data);
    } else {
      await addDoc(collection(db, 'users', currentUser.uid, 'categorias'), { ...data, tipo: activeTipo });
    }
    modal?.classList.add('hidden');
  });

  const view = document.getElementById('view-categorias');
  if (view) {
    view.addEventListener('click', e => {
      const tab = e.target.closest('[data-cat-tab]');
      if (!tab) return;
      view.querySelectorAll('[data-cat-tab]').forEach(t => t.classList.remove('cat-tab-active'));
      tab.classList.add('cat-tab-active');
      activeTipo = tab.dataset.catTab;
      selectedCatId = null;
      renderCategorias();
    });

    new MutationObserver(() => {
      if (!view.classList.contains('hidden')) renderCategorias();
    }).observe(view, { attributes: true, attributeFilter: ['class'] });

    ['filterMonth', 'filterYear'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', () => {
        if (!view.classList.contains('hidden')) setTimeout(renderCategorias, 400);
      });
    });
  }
});
