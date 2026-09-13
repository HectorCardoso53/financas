import { auth, db } from './firebase-config.js';
import {
  collection, addDoc, deleteDoc, doc, getDoc, onSnapshot, updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

let currentUser = null;
let unsubCards = null;
let allExpenses = [];

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

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (user) listenCards();
});

function listenCards() {
  if (unsubCards) unsubCards();
  const uid = currentUser.uid;
  let cards = [];

  const doRender = () => { renderCards(cards, allExpenses); populateCardSelect(cards); };

  const unsubC = onSnapshot(collection(db, 'users', uid, 'cartoes'), snap => {
    cards = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    doRender();
  });
  const unsubE = onSnapshot(collection(db, 'users', uid, 'expenses'), snap => {
    allExpenses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    doRender();
  });

  // Re-renderiza quando o filtro de mês/ano muda
  const onFilterChange = () => doRender();
  document.getElementById('filterMonth')?.addEventListener('change', onFilterChange);
  document.getElementById('filterYear')?.addEventListener('change', onFilterChange);

  unsubCards = () => { unsubC(); unsubE(); };
}

const BANK_COLORS = {
  'Bradesco': '#cc0000', 'Itaú': '#f97316', 'Nubank': '#7c3aed',
  'Banco Pan': '#2563eb', 'Santander': '#ec0000', 'Banco do Brasil': '#facc15',
  'Caixa': '#166534', 'Inter': '#f97316', 'C6 Bank': '#1a1a1a',
  'XP': '#1a1a1a', 'Sicoob': '#007a3d', 'Outros': '#6b7280'
};

const BANK_LOGOS = {
  'Banco do Brasil': 'banco-do-brasil-5.png',
  'Bradesco':        'bradesco.png',
  'Banco Pan':       'pan.png',
  'Sicoob':          'sicoob.png',
};
const FLAG_LOGOS = {
  'Visa':       'visa-17.png',
  'Mastercard': 'mastercard-18 (1).png',
};
const MONTHS = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];

function fmtBRL(val) {
  return 'R$ ' + Number(val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function nextMonthStr(day, addMonth = 0) {
  if (!day) return 'A definir';
  const d = parseInt(day);
  const fm = document.getElementById('filterMonth');
  const fy = document.getElementById('filterYear');
  if (fm && fy) {
    const m = (parseInt(fm.value) + addMonth) % 12;
    return `${d}/${MONTHS[m]}.`;
  }
  const today = new Date();
  const thisMonth = (today.getDate() > d
    ? (today.getMonth() + 1) % 12
    : today.getMonth() + addMonth) % 12;
  return `${d}/${MONTHS[thisMonth]}.`;
}

function renderCard(card, expenses = []) {
  const bankColor   = BANK_COLORS[card.banco] || '#6b7280';
  const bankInitial = (card.banco || 'C').charAt(0).toUpperCase();
  const bankLogo    = BANK_LOGOS[card.banco];
  const flagLogo    = FLAG_LOGOS[card.bandeira];

  const bankIconHTML = bankLogo
    ? `<img src="assets/logos_bancos/${encodeURIComponent(bankLogo)}" class="cc-bank-logo-img" alt="${card.banco}">`
    : `<span style="font-size:1.1rem;font-weight:800;color:rgba(255,255,255,0.7)">${bankInitial}</span>`;

  const flagHTML = flagLogo
    ? `<img src="assets/logos_bancos/${encodeURIComponent(flagLogo)}" class="cc-flag-logo-img" alt="${card.bandeira}">`
    : `<span class="cc-flag" style="color:rgba(255,255,255,0.4)">${card.bandeira}</span>`;

  // Despesas vinculadas a este cartão
  const fm = document.getElementById('filterMonth');
  const fy = document.getElementById('filterYear');
  const selMonth = fm ? parseInt(fm.value) : new Date().getMonth(); // 0-indexed
  const selYear  = fy ? parseInt(fy.value)  : new Date().getFullYear();

  // Todas as despesas do cartão — separar compras de pagamentos de fatura
  const allCardExp = expenses.filter(e => e.cartaoId === card.id);
  const purchases = allCardExp.filter(e => !e.isFaturaPagamento);
  const pendingFaturaPayments = allCardExp.filter(e => e.isFaturaPagamento && !e.paid);

  // Fatura atual = valor total informado manualmente pelo usuário
  const totalDivida = Number(card.faturaAnterior) || 0;

  // Compras do mês selecionado (apenas informativo — não somam à fatura)
  const cardExpenses = purchases.filter(e => {
    if (!e.date) return true;
    const [y, m] = e.date.split('-');
    return parseInt(y) === selYear && parseInt(m) - 1 === selMonth;
  });
  const faturaMes = cardExpenses.reduce((s, e) => s + (e.amount || 0), 0);

  const limite     = Number(card.limite) || 0;
  const dispLimite = Math.max(0, limite - totalDivida);
  const pct        = limite > 0 ? Math.min(100, Math.round(totalDivida / limite * 100)) : 0;

  const fechStr = nextMonthStr(card.fechamento);
  const vencStr = nextMonthStr(card.vencimento, 1);

  // ---- lista de despesas do cartão (mês selecionado) ----
  const comprasHTML = cardExpenses.length
    ? cardExpenses.sort((a, b) => (a.date || '') > (b.date || '') ? 1 : -1).map(e => {
        const dateFmt = e.date
          ? new Date(e.date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
          : '';
        const paid = !!e.paid;
        return `
          <div class="cc-compra-row${paid ? ' cc-compra-paid' : ''}">
            <div class="cc-compra-info">
              <span class="cc-compra-desc">${e.description || '—'}</span>
              <span class="cc-compra-parcs">${dateFmt} &nbsp;·&nbsp; ${e.category || ''}</span>
            </div>
            <div class="cc-compra-right">
              <span class="cc-compra-val">${fmtBRL(e.amount)}</span>
              <button class="cc-icon-btn compra-pay-btn" data-expense-id="${e.id}" data-paid="${paid}" title="${paid ? 'Desfazer pagamento' : 'Marcar como pago'}">
                <i class="bi ${paid ? 'bi-check-circle-fill' : 'bi-circle'}"></i>
              </button>
              <button class="cc-icon-btn compra-edit-btn" data-expense-id="${e.id}" title="Editar">
                <i class="bi bi-pencil"></i>
              </button>
              <button class="cc-icon-btn compra-delete-btn" data-expense-id="${e.id}" title="Remover">
                <i class="bi bi-trash3"></i>
              </button>
            </div>
          </div>`;
      }).join('')
    : `<div class="cc-compras-empty"><i class="bi bi-receipt"></i> Nenhuma compra neste mês</div>`;

  // ---- pagamentos de fatura pendentes ----
  const pendingFaturaHTML = pendingFaturaPayments.length
    ? `<div class="cc-divider"></div>
       <div class="cc-compras-header">
         <i class="bi bi-hourglass-split" style="color:#f59e0b"></i> Pagamento pendente
         <span style="margin-left:auto;color:#f59e0b;font-size:1em;opacity:0.9;font-weight:700">${fmtBRL(pendingFaturaPayments.reduce((s, p) => s + p.amount, 0))}</span>
       </div>
       <div class="cc-compras-list">
         ${pendingFaturaPayments.map(p => {
           const df = p.date ? new Date(p.date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '';
           return `<div class="cc-compra-row">
             <div class="cc-compra-info">
               <span class="cc-compra-desc" style="color:#fbbf24"><i class="bi bi-cash"></i> Pagamento da fatura</span>
               <span class="cc-compra-parcs">${df} &nbsp;·&nbsp; desconta do saldo ao confirmar</span>
             </div>
             <div class="cc-compra-right">
               <span class="cc-compra-val" style="color:#fbbf24">${fmtBRL(p.amount)}</span>
               <button class="cc-icon-btn cc-fatura-pay-btn" data-expense-id="${p.id}" data-amount="${p.amount}" data-card-id="${card.id}" title="Confirmar pagamento — desconta do saldo">
                 <i class="bi bi-circle"></i>
               </button>
               <button class="cc-icon-btn compra-delete-btn" data-expense-id="${p.id}" title="Cancelar pagamento">
                 <i class="bi bi-trash3"></i>
               </button>
             </div>
           </div>`;
         }).join('')}
       </div>`
    : '';

  return `
    <div class="cc-card" data-card-id="${card.id}" style="--cc-color:${bankColor}">

      <!-- Header -->
      <div class="cc-header">
        <div class="cc-bank-icon" style="background:rgba(255,255,255,0.07)">${bankIconHTML}</div>
        <div class="cc-bank-info">
          <div class="cc-bank-name">${card.nome}</div>
          <div class="cc-bank-sub">
            ${flagHTML}
            <span class="cc-bank-label">${card.banco}</span>
          </div>
        </div>
        <div class="cc-header-btns">
          <button class="cc-icon-btn cc-add-btn" data-card-id="${card.id}" title="Adicionar compra">
            <i class="bi bi-plus-lg"></i>
          </button>
          <button class="cc-icon-btn cc-list-btn" data-card-id="${card.id}" title="Ver compras">
            <i class="bi bi-list-ul"></i>
          </button>
          <button class="cc-icon-btn cc-edit-card-btn" data-card-id="${card.id}" title="Editar cartão">
            <i class="bi bi-pencil"></i>
          </button>
          <button class="cc-icon-btn cc-del-card-btn card-delete-btn" data-card-id="${card.id}" title="Remover cartão">
            <i class="bi bi-three-dots-vertical"></i>
          </button>
        </div>
      </div>

      <!-- Stats -->
      <div class="cc-stats">
        <div class="cc-stat">
          <div class="cc-stat-label">Fatura atual</div>
          <div class="cc-stat-val cc-stat-used">${fmtBRL(totalDivida)}</div>
        </div>
        <div class="cc-stat cc-stat-center">
          <div class="cc-stat-label">Compras no mês</div>
          <div class="cc-stat-val" style="color:rgba(255,255,255,0.45)">${fmtBRL(faturaMes)}</div>
        </div>
        <div class="cc-stat cc-stat-right">
          <div class="cc-stat-label">Limite disp.</div>
          <div class="cc-stat-val">${limite > 0 ? fmtBRL(dispLimite) : 'A definir'}</div>
        </div>
      </div>

      <!-- Progress bar -->
      <div class="cc-bar-wrap">
        <div class="cc-bar-track">
          <div class="cc-bar-fill" style="width:${pct}%"></div>
        </div>
        <span class="cc-bar-pct">${pct}%</span>
      </div>

      <!-- Divider -->
      <div class="cc-divider"></div>

      <!-- Account info -->
      <div class="cc-info-row">
        <div class="cc-info-item">
          <div class="cc-info-label">Conta</div>
          <div class="cc-info-val">Corrente</div>
        </div>
        <div class="cc-info-item cc-info-center">
          <div class="cc-info-label">Fechamento</div>
          <div class="cc-info-val">${fechStr}</div>
        </div>
        <div class="cc-info-item cc-info-right">
          <div class="cc-info-label">Vencimento</div>
          <div class="cc-info-val">${vencStr}</div>
        </div>
      </div>

      <!-- Divider -->
      <div class="cc-divider"></div>

      <!-- Invoice row -->
      <div class="cc-invoice">
        <span class="cc-invoice-label">Compras registradas no mês</span>
        <span class="cc-invoice-val">${fmtBRL(faturaMes)}</span>
      </div>

      <!-- Pagamentos de fatura pendentes -->
      ${pendingFaturaHTML}

      <!-- Seção: registrar pagamento da fatura -->
      <div class="cc-pay-section">
        <span class="cc-pay-label">Registrar pagamento</span>
        <div class="cc-pay-row">
          <input type="text" class="cc-pay-input" data-card-id="${card.id}" placeholder="R$ 0,00" inputmode="numeric">
          <button class="cc-pay-confirm-btn" data-card-id="${card.id}" data-card-name="${card.nome}">
            <i class="bi bi-check-lg"></i> Pagar
          </button>
        </div>
      </div>

      <!-- Compras panel (collapsible) -->
      <div class="cc-compras-panel" id="cc-panel-${card.id}" style="display:none">
        <div class="cc-compras-header">
          <i class="bi bi-receipt"></i> Compras do mês (${cardExpenses.length})
          <span style="margin-left:auto;font-size:0.78em;opacity:0.5">${cardExpenses.filter(e=>!e.paid).length} pendente${cardExpenses.filter(e=>!e.paid).length !== 1 ? 's' : ''}</span>
        </div>
        <div class="cc-compras-list">${comprasHTML}</div>
      </div>

    </div>`;
}

function renderVencimentos(cards) {
  const el = document.getElementById('resumo-vencimentos');
  if (!el) return;
  const today = new Date();
  const dia = today.getDate();
  const items = cards
    .filter(c => c.vencimento)
    .map(c => {
      let diff = parseInt(c.vencimento) - dia;
      if (diff < 0) diff += 31;
      return { ...c, diff };
    })
    .sort((a, b) => a.diff - b.diff)
    .slice(0, 5);
  if (!items.length) {
    el.innerHTML = '<div class="venc-empty">Nenhum vencimento cadastrado</div>';
    return;
  }
  el.innerHTML = items.map(c => {
    const bankColor = BANK_COLORS[c.banco] || '#6b7280';
    const bankLogo  = BANK_LOGOS[c.banco];
    const urgente   = c.diff <= 3;
    const label     = c.diff === 0 ? 'Hoje!' : c.diff === 1 ? 'Amanhã' : `${c.diff} dias`;
    const badgeInner = bankLogo
      ? `<img src="assets/logos_bancos/${encodeURIComponent(bankLogo)}" style="width:22px;height:22px;object-fit:contain" alt="${c.banco}">`
      : (c.banco || 'C').charAt(0).toUpperCase();
    const badgeBg = bankLogo ? 'rgba(255,255,255,0.07)' : bankColor;
    return `<div class="venc-row">
      <div class="ct-bank-badge" style="background:${badgeBg};width:34px;height:34px;border-radius:8px;font-size:0.8em;flex-shrink:0;display:flex;align-items:center;justify-content:center">${badgeInner}</div>
      <div style="flex:1;min-width:0">
        <div class="venc-nome">${c.nome}</div>
        <div class="venc-meta">Dia ${c.vencimento}</div>
      </div>
      <div class="venc-badge" style="background:${urgente?'rgba(239,68,68,0.15)':'rgba(255,255,255,0.07)'};color:${urgente?'#ef4444':'rgba(255,255,255,0.55)'}">
        ${label}
      </div>
    </div>`;
  }).join('');
}

function renderCards(cards, expenses = []) {
  renderVencimentos(cards);

  const container = document.getElementById('cartoes-list');
  if (!container) return;

  if (cards.length === 0) {
    container.innerHTML = `<div class="cc-empty"><i class="bi bi-credit-card"></i><p>Nenhum cartão cadastrado.<br>Clique em <strong>+ Novo Cartão</strong> para começar.</p></div>`;
    return;
  }

  container.innerHTML = cards.map(c => renderCard(c, expenses)).join('');

  // Mark installment as paid / unpaid
  container.querySelectorAll('.compra-pay-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const expId = btn.dataset.expenseId;
      const nowPaid = btn.dataset.paid === 'true';
      await updateDoc(doc(db, 'users', currentUser.uid, 'expenses', expId), { paid: !nowPaid });
    });
  });

  // Edit purchase → abre modal de edição via função global do app.js
  container.querySelectorAll('.compra-edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.openEditModal) window.openEditModal(btn.dataset.expenseId, 'expense');
    });
  });

  // Delete purchase
  container.querySelectorAll('.compra-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showConfirm('Esta despesa será removida permanentemente do cartão.', async () => {
        await deleteDoc(doc(db, 'users', currentUser.uid, 'expenses', btn.dataset.expenseId));
      }, 'Remover despesa');
    });
  });

  // Delete card
  container.querySelectorAll('.card-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showConfirm('O cartão e todas as compras vinculadas serão removidos permanentemente.', async () => {
        await deleteDoc(doc(db, 'users', currentUser.uid, 'cartoes', btn.dataset.cardId));
      }, 'Remover cartão');
    });
  });

  // Add purchase → open modal and pre-select card
  container.querySelectorAll('.cc-add-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const modal = document.getElementById('novaDespesaCartaoModal');
      if (modal) {
        modal.classList.remove('hidden');
        const sel = document.getElementById('nc-cartao');
        if (sel) sel.value = btn.dataset.cardId;
        if (window.buildFaturaChips) window.buildFaturaChips(document.getElementById('nc-date')?.value);
      }
    });
  });

  // Edit card
  container.querySelectorAll('.cc-edit-card-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const card = cards.find(c => c.id === btn.dataset.cardId);
      if (card && window.openEditCardModal) window.openEditCardModal(card);
    });
  });

  // Toggle compras panel
  container.querySelectorAll('.cc-list-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const panel = document.getElementById('cc-panel-' + btn.dataset.cardId);
      if (!panel) return;
      const isOpen = panel.style.display !== 'none';
      panel.style.display = isOpen ? 'none' : 'block';
      btn.querySelector('i').className = isOpen ? 'bi bi-list-ul' : 'bi bi-x-lg';
    });
  });

  // Máscara BRL nos inputs de pagamento de fatura
  container.querySelectorAll('.cc-pay-input').forEach(input => {
    input.addEventListener('input', function () {
      const v = this.value.replace(/\D/g, '');
      if (!v) { this.value = ''; return; }
      const n = parseInt(v, 10);
      this.value = 'R$ ' + (n / 100).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    });
  });

  // Registrar pagamento da fatura (cria despesa pendente)
  container.querySelectorAll('.cc-pay-confirm-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const cardId = btn.dataset.cardId;
      const cardName = btn.dataset.cardName;
      const input = btn.closest('.cc-pay-row')?.querySelector('.cc-pay-input');
      if (!input) return;
      const raw = (input.value || '').replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
      const amount = parseFloat(raw) || 0;
      if (amount <= 0) { input.focus(); return; }
      const today = new Date();
      const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      btn.disabled = true;
      try {
        await addDoc(collection(db, 'users', currentUser.uid, 'expenses'), {
          description: `Fatura: ${cardName}`,
          amount,
          category: 'outros',
          date,
          dueDate: date,
          createdAt: new Date(),
          paid: false,
          cartaoId: cardId,
          isFaturaPagamento: true,
        });
        input.value = '';
        if (window.showToast) window.showToast('Pagamento registrado! Confirme ao efetuar.', 'success');
      } catch (err) {
        console.error(err);
        if (window.showToast) window.showToast('Erro ao registrar pagamento.', 'error');
      } finally {
        btn.disabled = false;
      }
    });
  });

  // Confirmar pagamento de fatura (desconta do saldo + reduz fatura)
  container.querySelectorAll('.cc-fatura-pay-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const expenseId = btn.dataset.expenseId;
      const amount = parseFloat(btn.dataset.amount);
      const cardId = btn.dataset.cardId;
      btn.disabled = true;
      try {
        await updateDoc(doc(db, 'users', currentUser.uid, 'expenses', expenseId), { paid: true });
        const cardRef = doc(db, 'users', currentUser.uid, 'cartoes', cardId);
        const cardSnap = await getDoc(cardRef);
        if (cardSnap.exists()) {
          const novaFatura = Math.max(0, (cardSnap.data().faturaAnterior || 0) - amount);
          await updateDoc(cardRef, { faturaAnterior: novaFatura });
        }
        if (window.showToast) window.showToast('Pagamento confirmado! Saldo atualizado.', 'success');
      } catch (err) {
        console.error(err);
        if (window.showToast) window.showToast('Erro ao confirmar pagamento.', 'error');
        btn.disabled = false;
      }
    });
  });
}

function populateCardSelect(cards) {
  const opts = cards.map(c => `<option value="${c.id}">${c.nome} (${c.banco} · ${c.bandeira})</option>`).join('');

  // Seletor do modal "Despesa no Cartão"
  const sel = document.getElementById('nc-cartao');
  if (sel) {
    const curr = sel.value;
    sel.innerHTML = '<option value="">— Selecione o cartão —</option>' + opts;
    if (curr) sel.value = curr;
  }

  // Seletor do modal "Nova Despesa" (opcional)
  const nd = document.getElementById('nd-cartao');
  if (nd) {
    const curr2 = nd.value;
    nd.innerHTML = '<option value="">— Débito / Dinheiro —</option>' + opts;
    if (curr2) nd.value = curr2;
  }
}

// Exposed globally for use by inline script
window.cardsModule = {
  async addCard(data) {
    if (!currentUser) return;
    await addDoc(collection(db, 'users', currentUser.uid, 'cartoes'), data);
  },
  async updateCard(id, data) {
    if (!currentUser) return;
    await updateDoc(doc(db, 'users', currentUser.uid, 'cartoes', id), data);
  },
};
