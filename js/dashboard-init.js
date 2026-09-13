(function() {
  function observeEl(id, cb) {
    var target = document.getElementById(id);
    if (!target) return;
    new MutationObserver(cb).observe(target, { childList: true, characterData: true, subtree: true });
  }

  function navigate(direction) {
    var fm = document.getElementById('filterMonth');
    var fy = document.getElementById('filterYear');
    var m = parseInt(fm.value);
    var y = parseInt(fy.value);
    m += direction;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    fm.value = m;
    fy.value = y;
    fm.dispatchEvent(new Event('change'));
  }
  document.addEventListener('DOMContentLoaded', function() {
    var prev = document.getElementById('prevMonthBtn');
    var next = document.getElementById('nextMonthBtn');
    if (prev) prev.addEventListener('click', function() { navigate(-1); });
    if (next) next.addEventListener('click', function() { navigate(1); });

    // Toggle pt-btn groups (único / recorrente)
    document.body.addEventListener('click', function(e) {
      var btn = e.target.closest('.pt-btn');
      if (!btn) return;
      var group = btn.closest('.pt-btns');
      if (!group) return;
      group.querySelectorAll('.pt-btn').forEach(function(b) { b.classList.remove('pt-active'); });
      btn.classList.add('pt-active');
    });

    // ===== AVATAR: inicial do email =====
    function updateAvatar() {
      var emailEl = document.getElementById('userEmail');
      var initial = document.getElementById('userAvatarInitial');
      var circle  = document.getElementById('userAvatarCircle');
      if (!emailEl || !initial) return;
      var email = (emailEl.textContent || '').trim();
      if (email && email.includes('@')) {
        initial.textContent = email.charAt(0).toUpperCase();
        if (circle) circle.title = email;
      }
    }
    observeEl('userEmail', updateAvatar);
    setTimeout(updateAvatar, 1500);
    setTimeout(updateAvatar, 3000);

    // ===== PAINEL DE PERFIL =====
    var profilePanel = document.getElementById('profilePanel');
    var avatarCircle = document.getElementById('userAvatarCircle');
    var ppClose = document.getElementById('profilePanelClose');
    var ppLogoutBtn = document.getElementById('ppLogoutBtn');

    function openProfilePanel() {
      var email = (document.getElementById('userEmail').textContent || '').trim();
      var name  = email.includes('@') ? email.split('@')[0] : '';
      var letter = name ? name.charAt(0).toUpperCase() : '?';
      document.getElementById('ppAvatar').textContent = letter;
      document.getElementById('ppName').textContent   = name;
      document.getElementById('ppEmail').textContent  = email;
      profilePanel.classList.add('open');
    }

    if (avatarCircle && profilePanel) {
      avatarCircle.style.cursor = 'pointer';
      avatarCircle.addEventListener('click', function(e) {
        e.stopPropagation();
        profilePanel.classList.toggle('open');
        if (profilePanel.classList.contains('open')) openProfilePanel();
      });
      ppClose && ppClose.addEventListener('click', function(e) {
        e.stopPropagation();
        profilePanel.classList.remove('open');
      });
      ppLogoutBtn && ppLogoutBtn.addEventListener('click', function() {
        document.getElementById('logoutBtn').click();
      });
      document.addEventListener('click', function() {
        profilePanel.classList.remove('open');
      });
      profilePanel.addEventListener('click', function(e) { e.stopPropagation(); });
    }

    // ===== BOTÃO + dropdown =====
    var addBtn = document.getElementById('addBtn');
    var addDropdown = document.getElementById('addDropdown');
    if (addBtn && addDropdown) {
      addBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        var isOpen = addDropdown.classList.toggle('open');
        addBtn.classList.toggle('open', isOpen);
      });
      document.addEventListener('click', function() {
        addDropdown.classList.remove('open');
        addBtn.classList.remove('open');
      });
    }

    // ===== MODAIS DO + =====
    function openModal(id) {
      var m = document.getElementById(id);
      if (!m) return;
      m.classList.remove('hidden');
      var fm = document.getElementById('filterMonth');
      var fy = document.getElementById('filterYear');
      if (fm && fy) {
        var filterM = parseInt(fm.value) + 1;
        var filterY = parseInt(fy.value);
        var today = new Date();
        var curM = today.getMonth() + 1;
        var curY = today.getFullYear();
        var dateForModal;
        if (filterM === curM && filterY === curY) {
          dateForModal = getLocalToday();
        } else {
          dateForModal = filterY + '-' + String(filterM).padStart(2,'0') + '-01';
        }
        ['nd-date','nr-date','nc-date'].forEach(function(dateId) {
          var el = m.querySelector('#' + dateId);
          if (el) el.value = dateForModal;
        });
      }
      if (id === 'novaDespesaCartaoModal') buildFaturaChips(document.getElementById('nc-date') && document.getElementById('nc-date').value);
    }
    function closeModal(id){ var m = document.getElementById(id); if(m) m.classList.add('hidden'); }

    // Chips de mês da fatura no modal de cartão
    var MESES_PT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    function buildFaturaChips(selectedDate) {
      var chipsEl = document.getElementById('ncMesChips');
      if (!chipsEl) return;
      var today = new Date();
      var chips = [];
      for (var i = 0; i < 3; i++) {
        var d = new Date(today.getFullYear(), today.getMonth() + i, 1);
        var m = d.getMonth(); var y = d.getFullYear();
        var label = i === 0 ? 'Este mês' : i === 1 ? 'Próximo mês' : MESES_PT[m] + '/' + y;
        var val   = y + '-' + String(m + 1).padStart(2,'0') + '-01';
        chips.push({ label: label, val: val });
      }
      chipsEl.innerHTML = chips.map(function(c) {
        var active = selectedDate && selectedDate.startsWith(c.val.substring(0,7)) ? ' fmc-active' : '';
        return '<button type="button" class="fmc-chip' + active + '" data-val="' + c.val + '">' + c.label + '</button>';
      }).join('');
      chipsEl.querySelectorAll('.fmc-chip').forEach(function(btn) {
        btn.addEventListener('click', function() {
          chipsEl.querySelectorAll('.fmc-chip').forEach(function(b){ b.classList.remove('fmc-active'); });
          this.classList.add('fmc-active');
          var ncDate = document.getElementById('nc-date');
          if (ncDate) ncDate.value = this.dataset.val;
        });
      });
    }
    window.buildFaturaChips = buildFaturaChips;

    document.querySelectorAll('.add-dd-item').forEach(function(btn) {
      btn.addEventListener('click', function() {
        addDropdown.classList.remove('open');
        addBtn.classList.remove('open');
        var modal = this.dataset.modal;
        openModal(modal + 'Modal');
      });
    });

    // Fechar modais
    ['closeNovaDespesaBtn','closeNovaReceitaBtn','closeNovaDespesaCartaoBtn','closeNovaTransferenciaBtn'].forEach(function(id) {
      var btn = document.getElementById(id);
      if(btn) btn.addEventListener('click', function() {
        this.closest('.cofre-overlay').classList.add('hidden');
      });
    });
    document.querySelectorAll('#novaDespesaModal,#novaReceitaModal,#novaDespesaCartaoModal,#novaTransferenciaModal').forEach(function(overlay) {
      overlay.addEventListener('click', function(e) { if(e.target === this) this.classList.add('hidden'); });
    });

    // ===== PESQUISA DE TRANSAÇÕES =====
    var txSearch = document.getElementById('txSearchInput');
    var txClear  = document.getElementById('txSearchClear');
    function applyTxSearch() {
      var q = (txSearch ? txSearch.value : '').toLowerCase().trim();
      if (txClear) txClear.classList.toggle('hidden', !q);
      var panels = ['tx-body-despesas','tx-body-receitas','tx-body-transferencias','tx-body-extrato'];
      panels.forEach(function(id) {
        var tbody = document.getElementById(id);
        if (!tbody) return;
        tbody.querySelectorAll('tr:not(.tx-empty-row)').forEach(function(row) {
          var text = row.textContent.toLowerCase();
          row.style.display = (!q || text.includes(q)) ? '' : 'none';
        });
      });
      // Também filtra transaction-items (formato card)
      document.querySelectorAll('#view-transacoes .transaction-item').forEach(function(item) {
        var text = item.textContent.toLowerCase();
        item.style.display = (!q || text.includes(q)) ? '' : 'none';
      });
    }
    if (txSearch) txSearch.addEventListener('input', applyTxSearch);
    if (txClear) txClear.addEventListener('click', function() { txSearch.value = ''; applyTxSearch(); txSearch.focus(); });

    // ===== NOVO CARTÃO =====
    var btnNovoCartao = document.getElementById('btnNovoCartao');
    if (btnNovoCartao) {
      btnNovoCartao.addEventListener('click', function() { openModal('novoCartaoModal'); });
    }
    var closeNovoCartaoBtn = document.getElementById('closeNovoCartaoBtn');
    if (closeNovoCartaoBtn) closeNovoCartaoBtn.addEventListener('click', function() { closeModal('novoCartaoModal'); });
    var novoCartaoModalEl = document.getElementById('novoCartaoModal');
    if (novoCartaoModalEl) novoCartaoModalEl.addEventListener('click', function(e) { if(e.target===this) closeModal('novoCartaoModal'); });

    var novoCartaoForm = document.getElementById('novoCartaoForm');
    var _editingCardId = null;

    // Abre o modal em modo edição pré-preenchido
    window.openEditCardModal = function(card) {
      _editingCardId = card.id;
      document.getElementById('nco-nome').value = card.nome || '';
      document.getElementById('nco-banco').value = card.banco || 'Outros';
      document.getElementById('nco-bandeira').value = card.bandeira || 'Outros';
      document.getElementById('nco-fechamento').value = card.fechamento || '';
      document.getElementById('nco-vencimento').value = card.vencimento || '';
      var fmtBRL = function(v) { return v ? 'R$ ' + Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}) : ''; };
      document.getElementById('nco-limite').value = fmtBRL(card.limite);
      document.getElementById('nco-fatura').value = fmtBRL(card.faturaAnterior);
      var title = document.querySelector('#novoCartaoModal .nf-hdr-title');
      if (title) title.textContent = 'Editar Cartão';
      var btn = document.querySelector('#novoCartaoForm button[type=submit]');
      if (btn) btn.innerHTML = '<i class="bi bi-check-lg"></i> Salvar alterações';
      openModal('novoCartaoModal');
    };

    if (novoCartaoForm) {
      novoCartaoForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        if (!window.cardsModule) return alert('Módulo de cartões ainda carregando, tente novamente.');
        var limiteRaw  = (document.getElementById('nco-limite').value||'').replace(/[^\d,]/g,'').replace(',','.');
        var faturaRaw  = (document.getElementById('nco-fatura').value||'').replace(/[^\d,]/g,'').replace(',','.');
        var data = {
          nome: document.getElementById('nco-nome').value.trim(),
          banco: document.getElementById('nco-banco').value,
          bandeira: document.getElementById('nco-bandeira').value,
          limite: parseFloat(limiteRaw) || 0,
          faturaAnterior: parseFloat(faturaRaw) || 0,
          fechamento: document.getElementById('nco-fechamento').value || null,
          vencimento: document.getElementById('nco-vencimento').value || null,
        };
        if (_editingCardId) {
          await window.cardsModule.updateCard(_editingCardId, data);
          _editingCardId = null;
          var title = document.querySelector('#novoCartaoModal .nf-hdr-title');
          if (title) title.textContent = 'Novo Cartão';
          var btn = document.querySelector('#novoCartaoForm button[type=submit]');
          if (btn) btn.innerHTML = '<i class="bi bi-check-lg"></i> Salvar Cartão';
        } else {
          await window.cardsModule.addCard({ ...data, criadoEm: new Date().toISOString() });
        }
        closeModal('novoCartaoModal');
        novoCartaoForm.reset();
      });
    }

    // ===== SUBMIT: NOVA TRANSFERÊNCIA =====
    var novaTransferenciaForm = document.getElementById('novaTransferenciaForm');
    if (novaTransferenciaForm) {
      var ntDate = document.getElementById('nt-date');
      if (ntDate) ntDate.valueAsDate = new Date();
      novaTransferenciaForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        var desc   = 'Transferência: ' + document.getElementById('nt-desc').value.trim();
        var ntAmt = document.getElementById('nt-amount');
        var amount = parseModalBRL(ntAmt ? ntAmt.value : '');
        var date   = document.getElementById('nt-date').value;
        if (!window.saveExpense) { alert('Sistema ainda carregando. Tente novamente.'); return; }
        var ok = await window.saveExpense({ description: desc, amount: amount, category: 'outros', date: date });
        if (ok) {
          closeModal('novaTransferenciaModal');
          novaTransferenciaForm.reset();
          document.getElementById('nt-date').valueAsDate = new Date();
        }
      });
    }

    // ===== INFO DE PARCELAS (cartão) =====
    function calcParcelas() {
      var vparcela = parseModalBRL((document.getElementById('nc-amount')||{}).value);
      var totalP   = parseInt((document.getElementById('nc-parcela-total')||{}).value) || 1;
      var inicialP = parseInt((document.getElementById('nc-parcela-inicial')||{}).value) || 1;
      if (inicialP > totalP) { var pi = document.getElementById('nc-parcela-inicial'); if(pi) pi.value = totalP; inicialP = totalP; }
      var restantes = totalP - inicialP + 1;
      var fmt = function(v) { return 'R$ ' + v.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); };
      var info  = document.getElementById('ncParcelasInfo');
      var vp    = document.getElementById('ncValorParcela');
      var rest  = document.getElementById('ncParcelasRestantes');
      var label = document.getElementById('nc-parcela-label');
      var amtLabel = document.getElementById('nc-amount-label');
      if(amtLabel) amtLabel.textContent = totalP > 1 ? 'Valor por parcela (R$)' : 'Valor (R$)';
      if(vp)    vp.textContent = fmt(vparcela);
      if(rest)  rest.textContent = restantes;
      if(info)  info.style.display = (totalP > 1 && vparcela > 0) ? 'block' : 'none';
      if(label) label.textContent = totalP <= 1 ? 'à vista' : fmt(vparcela) + '/mês · ' + restantes + ' restante(s)';
    }
    ['nc-amount','nc-parcela-total','nc-parcela-inicial'].forEach(function(id) {
      var el = document.getElementById(id);
      if(el) el.addEventListener('input', calcParcelas);
    });

    // ===== SUBMISSÃO DOS MODAIS =====
    function applyMaskOnInput(el) {
      if(!el) return;
      el.addEventListener('input', function() {
        var v = this.value.replace(/\D/g,'');
        if(!v) { this.value=''; return; }
        var n = parseInt(v,10);
        this.value = 'R$ ' + (n/100).toFixed(2).replace('.',',').replace(/\B(?=(\d{3})+(?!\d))/g,'.');
      });
    }
    ['nd-amount','nr-amount','nc-amount','nco-limite','nco-fatura'].forEach(function(id){ applyMaskOnInput(document.getElementById(id)); });

    function parseModalBRL(str) {
      var s = (str || '').replace(/[R$\s]/g,'').replace(/\./g,'').replace(',','.');
      return parseFloat(s) || 0;
    }

    function getLocalToday() {
      var d = new Date();
      return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    }
    var _today = getLocalToday();
    ['nd-date','nr-date','nc-date'].forEach(function(id){
      var el = document.getElementById(id);
      if(el && !el.value) el.value = _today;
    });

    function syncFilterToDate(dateStr) {
      var parts = (dateStr || '').split('-');
      if (parts.length !== 3) return;
      var fm = document.getElementById('filterMonth');
      var fy = document.getElementById('filterYear');
      if (!fm || !fy) return;
      var m = (parseInt(parts[1]) - 1).toString();
      var y = parts[0];
      var changed = false;
      if (fm.value !== m) { fm.value = m; changed = true; }
      if (fy.value !== y) { fy.value = y; changed = true; }
      if (changed) fm.dispatchEvent(new Event('change'));
    }

    var novaDespesaForm = document.getElementById('novaDespesaForm');
    if(novaDespesaForm) novaDespesaForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      var ndDesc = document.getElementById('nd-desc'); var desc = (ndDesc ? ndDesc.value : '').trim();
      var ndAmt  = document.getElementById('nd-amount');
      var amount   = parseModalBRL(ndAmt ? ndAmt.value : '');
      var ndCat  = document.getElementById('nd-category'); var category = ndCat ? ndCat.value : 'outros';
      var ndDate = document.getElementById('nd-date');     var date     = ndDate ? ndDate.value : '';
      var ndCard = document.getElementById('nd-cartao');   var cartaoId = ndCard ? (ndCard.value || null) : null;
      var ndTipoRec = novaDespesaForm.querySelector('.pt-btn[data-type="recorrente"]');
      var recorrente = ndTipoRec ? ndTipoRec.classList.contains('pt-active') : false;
      if (!window.saveExpense) { alert('Sistema ainda carregando. Tente novamente.'); return; }
      var ok = await window.saveExpense({ description: desc, amount: amount, category: category, date: date, cartaoId: cartaoId, recorrente: recorrente });
      if (ok) {
        closeModal('novaDespesaModal');
        novaDespesaForm.reset();
        novaDespesaForm.querySelectorAll('.pt-btn').forEach(function(b) { b.classList.remove('pt-active'); });
        var unica = novaDespesaForm.querySelector('.pt-btn[data-type="unica"]');
        if (unica) unica.classList.add('pt-active');
        _today = getLocalToday(); document.getElementById('nd-date').value = _today; syncFilterToDate(date);
      }
    });

    var novaReceitaForm = document.getElementById('novaReceitaForm');
    if(novaReceitaForm) novaReceitaForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      var nrDesc = document.getElementById('nr-desc'); var desc = (nrDesc ? nrDesc.value : '').trim();
      var nrAmt  = document.getElementById('nr-amount');
      var amount   = parseModalBRL(nrAmt ? nrAmt.value : '');
      var nrCat  = document.getElementById('nr-category'); var category = nrCat ? nrCat.value : 'outros';
      var nrDate = document.getElementById('nr-date');     var date     = nrDate ? nrDate.value : '';
      if (!window.saveIncome) { alert('Sistema ainda carregando. Tente novamente.'); return; }
      var nrTipoRec = novaReceitaForm.querySelector('.pt-btn[data-type="recorrente"]');
      var recorrente = nrTipoRec ? nrTipoRec.classList.contains('pt-active') : false;
      var ok = await window.saveIncome({ description: desc, amount: amount, category: category, date: date, recorrente: recorrente });
      if (ok) {
        closeModal('novaReceitaModal');
        novaReceitaForm.reset();
        novaReceitaForm.querySelectorAll('.pt-btn').forEach(function(b) { b.classList.remove('pt-active'); });
        var unica = novaReceitaForm.querySelector('.pt-btn[data-type="unica"]');
        if (unica) unica.classList.add('pt-active');
        _today = getLocalToday(); document.getElementById('nr-date').value = _today; syncFilterToDate(date);
      }
    });

    var novaDespesaCartaoForm = document.getElementById('novaDespesaCartaoForm');
    if(novaDespesaCartaoForm) novaDespesaCartaoForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      var ncDesc = document.getElementById('nc-desc'); var desc = (ncDesc ? ncDesc.value : '').trim();
      var ncLoja = document.getElementById('nc-loja'); var loja = (ncLoja ? ncLoja.value : '').trim();
      var ncPt   = document.getElementById('nc-parcela-total');
      var pt     = parseInt(ncPt ? (ncPt.value || '1') : '1') || 1;
      var ncPi   = document.getElementById('nc-parcela-inicial');
      var pi     = parseInt(ncPi ? (ncPi.value || '1') : '1') || 1;
      if (pi > pt) pi = pt;
      var ncAmt  = document.getElementById('nc-amount');
      var total    = parseModalBRL(ncAmt ? ncAmt.value : '');
      var ncCard   = document.getElementById('nc-cartao');   var cartaoId = ncCard ? (ncCard.value || null) : null;
      var ncCat    = document.getElementById('nc-category'); var category = ncCat ? ncCat.value : 'outros';
      var ncDate   = document.getElementById('nc-date');     var date     = ncDate ? ncDate.value : '';
      if (!cartaoId) { alert('Selecione um cartão.'); return; }
      if (!window.saveExpense) { alert('Sistema ainda carregando. Tente novamente.'); return; }

      var baseDesc = desc + (loja ? ' — ' + loja : '');
      var valorParcela = Math.round(total * 100) / 100;

      function addMonths(dateStr, n) {
        if (!dateStr) return dateStr;
        var parts = dateStr.split('-');
        var y = parseInt(parts[0]), m = parseInt(parts[1]) - 1, d = parseInt(parts[2]);
        var dt = new Date(y, m + n, d);
        var pad = function(v) { return String(v).padStart(2,'0'); };
        return dt.getFullYear() + '-' + pad(dt.getMonth()+1) + '-' + pad(dt.getDate());
      }

      var allOk = true;
      for (var i = pi - 1; i < pt; i++) {
        var parcDesc = pt > 1 ? baseDesc + ' [' + (i+1) + '/' + pt + ']' : baseDesc;
        var parcDate = addMonths(date, i - (pi - 1));
        var ok = await window.saveExpense({ description: parcDesc, amount: valorParcela, category: category, date: parcDate, cartaoId: cartaoId });
        if (!ok) { allOk = false; break; }
      }

      if (allOk) {
        closeModal('novaDespesaCartaoModal');
        novaDespesaCartaoForm.reset();
        _today = getLocalToday();
        document.getElementById('nc-date').value = _today;
        var npi = document.getElementById('ncParcelasInfo');
        if (npi) npi.style.display = 'none';
        syncFilterToDate(date);
      }
    });

    function parseBRLNum(str) {
      return parseFloat((str||'0').replace(/[R$\s]/g,'').replace(/\./g,'').replace(',','.')) || 0;
    }

    var CAT_COLORS = {
      alimentacao:'#f97316', transporte:'#3b82f6', moradia:'#8b5cf6',
      lazer:'#ec4899', saude:'#10b981', educacao:'#f59e0b',
      salario:'#22c55e', freelance:'#14b8a6', investimentos:'#6366f1', outros:'#6b7280'
    };

    function syncResumoWidgets() {
      var income  = (document.getElementById('totalIncome')  ||{}).textContent||'R$ 0,00';
      var expense = (document.getElementById('totalExpense') ||{}).textContent||'R$ 0,00';
      var balance = (document.getElementById('currentBalance')||{}).textContent||'R$ 0,00';
      var saldo   = (document.getElementById('saldoInicialLabel')||{}).textContent||'';

      var el = function(id){ return document.getElementById(id); };

      var match = saldo.match(/[\d.,]+/);
      var si = match ? 'R$ ' + match[0].replace('.',',') : 'R$ 0,00';
      if(el('btlInicial'))  el('btlInicial').textContent  = window._btlInicialMes || si;
      if(el('btlPrevisto')) el('btlPrevisto').textContent = balance;
      if(el('vgSaldo'))     el('vgSaldo').textContent     = balance;

      ['rmc-receitas','rmc-tr'].forEach(function(id){ if(el(id)) el(id).textContent = income; });
      ['rmc-despesas','rmc-td'].forEach(function(id){ if(el(id)) el(id).textContent = expense; });
      ['rmc-saldo','rmc-ts'].forEach(function(id){ if(el(id)) el(id).textContent = balance; });
      ['rmc-previsto','rmc-tp'].forEach(function(id){ if(el(id)) el(id).textContent = balance; });

      var expItems = Array.from(document.querySelectorAll('#expenseList .transaction-item'));
      var count = expItems.length;
      if(el('rw-count')) el('rw-count').textContent = count + (count===1?' despesa':' despesas');
      if(el('rw-total')) el('rw-total').textContent = expense;
      if(el('donutVal')) el('donutVal').textContent = expense;

      var totalDesp = parseBRLNum(expense);
      var catMap = {};
      expItems.forEach(function(item) {
        var badge = item.querySelector('.category-badge');
        var amtEl = item.querySelector('.transaction-amount');
        if (!badge || !amtEl) return;
        var catClass = 'outros';
        badge.classList.forEach(function(c) {
          if (c !== 'category-badge' && c.startsWith('category-')) catClass = c.replace('category-','');
        });
        var catName = badge.textContent.trim();
        var amt = parseBRLNum(amtEl.textContent);
        if (!catMap[catClass]) catMap[catClass] = { name: catName, total: 0 };
        catMap[catClass].total += amt;
      });

      var barsEl = el('rankingBars');
      var emptyEl = el('rankingEmpty');
      if (!barsEl) return;

      var sorted = Object.entries(catMap).sort(function(a,b){ return b[1].total - a[1].total; });

      if (!sorted.length || totalDesp === 0) {
        if(emptyEl) emptyEl.style.display = '';
        Array.from(barsEl.querySelectorAll('.rk-row')).forEach(function(r){ r.remove(); });
        return;
      }
      if(emptyEl) emptyEl.style.display = 'none';

      var top = sorted.slice(0, 4);
      var maxVal = top[0][1].total;

      var existingRows = barsEl.querySelectorAll('.rk-row');
      top.forEach(function(entry, i) {
        var catClass = entry[0];
        var catData  = entry[1];
        var pct  = Math.round(catData.total / totalDesp * 100);
        var barW = Math.round(catData.total / maxVal * 100);
        var color = CAT_COLORS[catClass] || '#6b7280';
        var amtFmt = 'R$ ' + catData.total.toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});

        var row = existingRows[i];
        if (!row) {
          row = document.createElement('div');
          row.className = 'rk-row';
          barsEl.insertBefore(row, emptyEl);
        }
        row.innerHTML =
          '<div class="rk-meta">' +
            '<span class="rk-dot" style="background:' + color + '"></span>' +
            '<span class="rk-name">' + catData.name + '</span>' +
            '<span class="rk-pct">' + pct + '%</span>' +
            '<span class="rk-amt">' + amtFmt + '</span>' +
          '</div>' +
          '<div class="rk-track"><div class="rk-fill" style="width:' + barW + '%;background:' + color + '"></div></div>';
      });

      Array.from(barsEl.querySelectorAll('.rk-row')).forEach(function(r, i){ if(i >= top.length) r.remove(); });
    }

    window.syncResumoWidgets = syncResumoWidgets;

    document.addEventListener('DOMContentLoaded', function() {
      ['totalIncome','totalExpense','currentBalance','expenseList'].forEach(function(id){
        observeEl(id, function(){ setTimeout(syncResumoWidgets, 80); });
      });
      var tries = 0;
      var retrySync = setInterval(function() {
        syncResumoWidgets();
        if (++tries >= 10) clearInterval(retrySync);
      }, 600);
    });

    function syncContasView() {
      var vals = {
        income:  (document.getElementById('totalIncome')  || {}).textContent || 'R$ 0,00',
        expense: (document.getElementById('totalExpense') || {}).textContent || 'R$ 0,00',
        balance: (document.getElementById('currentBalance') || {}).textContent || 'R$ 0,00',
      };
      var lbl = (document.getElementById('saldoInicialLabel') || {}).textContent || '';
      var match2 = lbl.match(/[\d.,]+/);
      var saldoInicialTxt = match2 ? 'R$ ' + match2[0] : 'R$ 0,00';

      var set = function(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; };
      set('ct-saldo-inicial', saldoInicialTxt);
      set('ct-receitas',      vals.income);
      set('ct-despesas',      vals.expense);
      set('ct-saldo',         vals.balance);
      set('ct-previsto',      vals.balance);
      set('cf-receitas',      vals.income);
      set('cf-despesas',      vals.expense);
      set('cf-saldo',         vals.balance);
      set('cf-previsto',      vals.balance);
    }

    function switchView(viewId) {
      document.querySelectorAll('.dash-view, #view-resumo').forEach(function(v) {
        v.classList.add('hidden');
      });
      var target = document.getElementById('view-' + viewId) || document.getElementById('view-resumo');
      if (target) target.classList.remove('hidden');
      document.querySelectorAll('.sidebar-item[data-view]').forEach(function(item) {
        item.classList.toggle('active', item.dataset.view === viewId);
      });
      if (viewId === 'contas') {
        setTimeout(syncContasView, 100);
      }
      if (viewId === 'transacoes' && typeof renderTransacoes === 'function') {
        setTimeout(renderTransacoes, 100);
      }
    }

    document.querySelectorAll('.sidebar-item[data-view]').forEach(function(item) {
      item.addEventListener('click', function(e) {
        e.preventDefault();
        switchView(this.dataset.view);
      });
    });

    // Tema claro / escuro
    var themeBtn = document.getElementById('themeToggleBtn');
    var themeIcon = document.getElementById('themeIcon');
    var themeLabel = document.getElementById('themeLabel');
    var savedTheme = localStorage.getItem('mf-theme');
    if (savedTheme === 'light') {
      document.body.classList.add('light-mode');
      if (themeIcon) themeIcon.className = 'bi bi-moon';
      if (themeLabel) themeLabel.textContent = 'Modo escuro';
    }
    if (themeBtn) {
      themeBtn.addEventListener('click', function() {
        var isLight = document.body.classList.toggle('light-mode');
        if (isLight) {
          themeIcon.className = 'bi bi-moon';
          themeLabel.textContent = 'Modo escuro';
          localStorage.setItem('mf-theme', 'light');
        } else {
          themeIcon.className = 'bi bi-sun';
          themeLabel.textContent = 'Modo claro';
          localStorage.setItem('mf-theme', 'dark');
        }
      });
    }
  });

  // ===== GRÁFICO 7 DIAS =====
  var chartSeteInstance = null;
  function buildChartSete() {
    var ctx = document.getElementById('chartSete');
    if (!ctx || !window.Chart) return;
    var isLight = document.body.classList.contains('light-mode');
    var gridColor  = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';
    var tickColor  = isLight ? 'rgba(0,0,0,0.4)'  : 'rgba(255,255,255,0.4)';
    var labels = [];
    var today = new Date();
    for (var i = 6; i >= 0; i--) {
      var d = new Date(today); d.setDate(d.getDate() - i);
      labels.push(d.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'}));
    }
    if (chartSeteInstance) chartSeteInstance.destroy();
    chartSeteInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          { label: 'Receitas', data: [0,0,0,0,0,0,0], backgroundColor: 'rgba(16,185,129,0.75)', borderRadius: 6, borderSkipped: false },
          { label: 'Despesas', data: [0,0,0,0,0,0,0], backgroundColor: 'rgba(239,68,68,0.75)',  borderRadius: 6, borderSkipped: false }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: true,
        plugins: { legend: { position: 'top', labels: { color: tickColor, boxWidth: 10, padding: 14, font: { size: 11 } } } },
        scales: {
          x: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 11 } } },
          y: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 11 },
               callback: function(v) { return 'R$' + v.toLocaleString('pt-BR'); } } }
        }
      }
    });
    updateChartSete();
  }

  function parseBRL(text) {
    var s = (text || '').replace(/[^0-9,]/g,'').replace(',','.');
    return parseFloat(s) || 0;
  }

  function updateChartSete() {
    if (!chartSeteInstance) return;
    var today = new Date();
    var receitas = [0,0,0,0,0,0,0];
    var despesas = [0,0,0,0,0,0,0];
    function parseList(listId, arr) {
      var list = document.getElementById(listId);
      if (!list) return;
      list.querySelectorAll('[data-date]').forEach(function(el) {
        var dt = new Date(el.dataset.date);
        var diff = Math.round((today - dt) / 86400000);
        if (diff >= 0 && diff <= 6) {
          var idx = 6 - diff;
          var amtEl = el.querySelector('[data-amount]') || el;
          var amt = parseFloat(el.dataset.amount || 0) || parseBRL(amtEl.textContent);
          arr[idx] += amt;
        }
      });
    }
    parseList('incomeList',  receitas);
    parseList('expenseList', despesas);
    chartSeteInstance.data.datasets[0].data = receitas;
    chartSeteInstance.data.datasets[1].data = despesas;
    chartSeteInstance.update('none');
  }

  // ===== RADAR SAÚDE FINANCEIRA =====
  var chartRadarInstance = null;
  function buildChartRadar() {
    var ctx = document.getElementById('chartRadar');
    if (!ctx || !window.Chart) return;
    var isLight = document.body.classList.contains('light-mode');
    var gridColor = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';
    var lblColor  = isLight ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.55)';
    if (chartRadarInstance) chartRadarInstance.destroy();
    chartRadarInstance = new Chart(ctx, {
      type: 'radar',
      data: {
        labels: ['Economia','Crédito','Planejamento','Comprometimento','Reserva'],
        datasets: [{
          label: 'Saúde',
          data: [0,0,0,0,0],
          backgroundColor: 'rgba(59,130,246,0.12)',
          borderColor: '#3b82f6',
          pointBackgroundColor: ['#3b82f6','#10b981','#8b5cf6','#f59e0b','#ef4444'],
          pointRadius: 5, pointHoverRadius: 7,
          borderWidth: 2
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: true,
        plugins: { legend: { display: false }, tooltip: {
          callbacks: { label: function(c) { return c.raw.toFixed(0) + '/100'; } }
        }},
        scales: { r: {
          min: 0, max: 100,
          grid: { color: gridColor },
          angleLines: { color: gridColor },
          pointLabels: { color: lblColor, font: { size: 11, weight: '500' } },
          ticks: { display: false, stepSize: 25 }
        }}
      }
    });
    updateRadar();
  }

  function updateRadar() {
    if (!chartRadarInstance) return;
    var tiEl = document.getElementById('totalIncome');
    var teEl = document.getElementById('totalExpense');
    var cbEl = document.getElementById('currentBalance');
    var income  = parseBRL(tiEl ? tiEl.textContent : '');
    var expense = parseBRL(teEl ? teEl.textContent : '');
    var balance = parseBRL(cbEl ? cbEl.textContent : '');
    var economia        = income > 0 ? Math.min(100, Math.max(0, (income - expense) / income * 100)) : 0;
    var comprometimento = income > 0 ? Math.max(0, 100 - expense / income * 100) : 50;
    var reserva         = income > 0 ? Math.min(100, balance / (income * 3) * 100) : 0;
    var expListEl = document.getElementById('expenseList');
    var nCats = expListEl
      ? new Set(Array.from(expListEl.querySelectorAll('[data-category]')).map(function(e){ return e.dataset.category; })).size
      : 1;
    var planejamento = Math.min(100, nCats * 16);
    var credito = income > 0 ? Math.min(100, Math.max(0, 100 - (expense / income * 40))) : 60;
    chartRadarInstance.data.datasets[0].data = [
      Math.round(economia), Math.round(credito),
      Math.round(planejamento), Math.round(comprometimento), Math.round(reserva)
    ];
    chartRadarInstance.update();
  }

  setTimeout(function() {
    buildChartSete();
    buildChartRadar();
    ['totalIncome','totalExpense','currentBalance'].forEach(function(id) {
      observeEl(id, updateRadar);
    });
    observeEl('expenseList', function() { updateChartSete(); updateRadar(); });
    observeEl('incomeList',  updateChartSete);
  }, 600);

  // ===== TRANSAÇÕES VIEW =====
  function escHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function(c) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  function fmtBRLtx(val) {
    return 'R$ ' + Number(val || 0).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
  }

  function parseDateBR(dateStr) {
    var p = (dateStr || '').split('/');
    if (p.length === 3) return new Date(parseInt(p[2]), parseInt(p[1])-1, parseInt(p[0]));
    return null;
  }

  function parseTxItems(listId, type) {
    var list = document.getElementById(listId);
    if (!list) return [];
    var items = [];
    list.querySelectorAll('.transaction-item').forEach(function(row) {
      var titleEl = row.querySelector('.transaction-title');
      var badgeEl = row.querySelector('.category-badge');
      var desc = '';
      if (titleEl) {
        titleEl.childNodes.forEach(function(n) {
          if (n.nodeType === 3) desc += n.textContent;
        });
        desc = desc.trim();
      }
      var catClass = 'outros';
      var catName  = '';
      if (badgeEl) {
        badgeEl.classList.forEach(function(c) {
          if (c !== 'category-badge' && c.startsWith('category-')) catClass = c.replace('category-','');
        });
        catName = badgeEl.textContent.trim();
      }
      var tiDateEl = row.querySelector('.ti-date');
      var dateStr = tiDateEl
        ? tiDateEl.textContent.trim()
        : ((row.querySelector('.transaction-details') || {}).textContent || '').trim().replace(/^[^\d]*/, '');
      var amtEl  = row.querySelector('.transaction-amount');
      var amtStr = amtEl ? amtEl.textContent.trim() : '';
      var amtRaw = parseFloat((amtStr||'').replace(/[^\d,]/g,'').replace(',','.')) || 0;
      var cb   = row.querySelector('input[data-toggle-paid]');
      var paid = cb ? cb.checked : true;
      var editBtn = row.querySelector('[data-edit]');
      var id = editBtn ? editBtn.dataset.id : '';
      var origemEl  = row.querySelector('.badge-origem');
      var importado = !!origemEl;
      var origem    = origemEl ? origemEl.textContent.trim() : '';

      items.push({ desc:desc, catClass:catClass, catName:catName, dateStr:dateStr,
                   amtStr:amtStr, amtRaw:amtRaw, paid:paid, id:id,
                   type:type, importado:importado, origem:origem });
    });
    return items;
  }

  function buildTxRow(item) {
    var today = new Date(); today.setHours(0,0,0,0);
    var dt = parseDateBR(item.dateStr);
    var isOverdue = item.type === 'expense' && !item.paid && dt && dt < today;

    var statusClass, statusIcon, statusTitle;
    if (item.type === 'income' || item.paid) {
      statusClass = 'tx-status-paid';   statusIcon = 'bi-check-circle-fill'; statusTitle = 'Efetivado';
    } else if (isOverdue) {
      statusClass = 'tx-status-overdue'; statusIcon = 'bi-x-circle-fill';    statusTitle = 'Vencida';
    } else {
      statusClass = 'tx-status-pending'; statusIcon = 'bi-clock-fill';        statusTitle = 'Pendente';
    }

    var amtClass = item.type === 'income' ? 'tx-amt-income' : 'tx-amt-expense';
    var colspan  = item.type === 'expense'
      ? '<input type="checkbox" class="tx-paid-check" data-tx-id="' + escHtml(item.id) + '" data-tx-type="expense"' + (item.paid ? ' checked' : '') + '>'
      : '';

    return '<tr data-tx-row="' + escHtml(item.id) + '">' +
      '<td><span class="tx-status-icon ' + statusClass + '" title="' + statusTitle + '"><i class="bi ' + statusIcon + '"></i></span></td>' +
      '<td><div class="tx-desc-wrap"><span class="tx-desc-text">' + escHtml(item.desc) + '</span>' +
        (item.importado ? '<span class="tx-origem-badge">' + escHtml(item.origem) + '</span>' : '') +
      '</div></td>' +
      '<td><span class="category-badge category-' + escHtml(item.catClass) + '">' + escHtml(item.catName) + '</span></td>' +
      '<td><span class="tx-conta-badge"><i class="bi bi-building"></i> Conta Corrente</span></td>' +
      '<td class="tx-col-date">' + escHtml(item.dateStr) + '</td>' +
      '<td><span class="' + amtClass + '">' + escHtml(item.amtStr) + '</span></td>' +
      '<td><div class="tx-col-acoes">' + colspan +
        '<button class="tx-act-btn tx-edit-btn" data-tx-id="' + escHtml(item.id) + '" data-tx-type="' + item.type + '" title="Editar"><i class="bi bi-pencil"></i></button>' +
        '<button class="tx-act-btn tx-del-btn"  data-tx-id="' + escHtml(item.id) + '" data-tx-type="' + item.type + '" title="Excluir"><i class="bi bi-trash3"></i></button>' +
      '</div></td>' +
    '</tr>';
  }

  function buildTxCard(item) {
    var today = new Date(); today.setHours(0,0,0,0);
    var dt = parseDateBR(item.dateStr);
    var isOverdue = item.type === 'expense' && !item.paid && dt && dt < today;

    var iconClass, iconName;
    if (item.type === 'income' || item.paid) {
      iconClass = 'paid';    iconName = 'bi-check-lg';
    } else if (isOverdue) {
      iconClass = 'overdue'; iconName = 'bi-x-lg';
    } else {
      iconClass = 'pending'; iconName = 'bi-clock';
    }

    var WEEKDAYS = ['dom','seg','ter','qua','qui','sex','sáb'];
    var dateLabel = '';
    if (dt) {
      var dd = item.dateStr.substring(0,5);
      dateLabel = dd + ' &bull; ' + WEEKDAYS[dt.getDay()];
    } else {
      dateLabel = item.dateStr || '';
    }

    var amtClass = item.type === 'income' ? 'income' : 'expense';
    var amtClean = (item.amtStr || '').replace(/^[+\-]/, '');

    return '<div class="tx-mc">' +
      '<div class="tx-mc-icon ' + iconClass + '"><i class="bi ' + iconName + '"></i></div>' +
      '<div class="tx-mc-body">' +
        '<div class="tx-mc-account">Conta Corrente</div>' +
        '<div class="tx-mc-desc">' + escHtml(item.desc) + '</div>' +
        '<span class="tx-mc-cat">' + escHtml(item.catName) + '</span>' +
      '</div>' +
      '<div class="tx-mc-right">' +
        '<div class="tx-mc-date">' + dateLabel + '</div>' +
        '<div class="tx-mc-amt ' + amtClass + '">' + amtClean + '</div>' +
      '</div>' +
    '</div>';
  }

  function renderTxExtrato(despesas, receitas) {
    var el = document.getElementById('tx-extrato-list');
    if (!el) return;

    var all = [];
    despesas.forEach(function(it) { all.push(it); });
    receitas.forEach(function(it) { all.push(it); });

    var byDate = {};
    all.forEach(function(it) {
      var key = it.dateStr || 'Sem data';
      if (!byDate[key]) byDate[key] = [];
      byDate[key].push(it);
    });

    var keys = Object.keys(byDate).sort(function(a, b) {
      var da = parseDateBR(a), db = parseDateBR(b);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return db - da;
    });

    if (!keys.length) {
      el.innerHTML = '<div class="tx-empty-state"><i class="bi bi-receipt"></i><p>Nenhuma movimentação no período</p></div>';
      return;
    }

    var WEEKDAYS = ['dom','seg','ter','qua','qui','sex','sáb'];

    el.innerHTML = keys.map(function(dateKey) {
      var dt = parseDateBR(dateKey);
      var label = dt
        ? dateKey + ' &bull; ' + WEEKDAYS[dt.getDay()]
        : dateKey;

      var rows = byDate[dateKey];
      rows.sort(function(a,b) { return (a.type==='income'?0:1) - (b.type==='income'?0:1); });

      var html = '<div class="tx-extrato-day">' +
        '<div class="tx-extrato-date-header">' + label + '</div>';

      html += rows.map(function(it) {
        var iconClass = it.type === 'income' ? 'income' : 'expense';
        var iconName  = it.type === 'income' ? 'bi-arrow-down-left' : 'bi-arrow-up-right';
        var amtClass  = it.type === 'income' ? 'income' : 'expense';
        var amtPrefix = it.type === 'income' ? '+' : '-';
        var amtClean  = (it.amtStr || '').replace(/^[+\-]/, '');
        return '<div class="tx-extrato-item">' +
          '<div class="tx-extrato-icon ' + iconClass + '"><i class="bi ' + iconName + '"></i></div>' +
          '<div class="tx-extrato-info">' +
            '<div class="tx-extrato-desc">' + escHtml(it.desc) +
              (it.importado ? ' <span class="tx-origem-badge">' + escHtml(it.origem) + '</span>' : '') +
            '</div>' +
            '<div class="tx-extrato-meta"><span class="category-badge category-' + escHtml(it.catClass) + '" style="font-size:0.72rem;padding:1px 7px">' + escHtml(it.catName) + '</span>&nbsp;&nbsp;Conta Corrente</div>' +
          '</div>' +
          '<span class="tx-extrato-amt ' + amtClass + '">' + amtPrefix + amtClean + '</span>' +
        '</div>';
      }).join('');

      html += '</div>';
      return html;
    }).join('');
  }

  function txItemsFromData(arr, type) {
    if (!arr) return [];
    return arr.map(function(item) {
      var catClass = (item.category || 'outros').toLowerCase().replace(/\s+/g,'-');
      var catName  = item.category || 'Outros';
      var dateStr  = item.date
        ? (function(d){ var p=d.split('-'); return p[2]+'/'+p[1]+'/'+p[0]; })(item.date)
        : '';
      var amtRaw = item.amount || 0;
      var amtStr = (type === 'income' ? '+' : '-') + 'R$ ' + amtRaw.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
      return {
        desc: item.description || '',
        catClass: catClass, catName: catName,
        dateStr: dateStr, amtStr: amtStr, amtRaw: amtRaw,
        paid: type === 'income' ? true : !!item.paid,
        id: item.id || '',
        type: type,
        importado: false, origem: ''
      };
    });
  }

  function renderTransacoes() {
    var src  = window._txData || {};
    var desp = txItemsFromData(src.expenses, 'expense');
    var rec  = txItemsFromData(src.incomes,  'income');

    var bodyDesp = document.getElementById('tx-body-despesas');
    if (bodyDesp) {
      bodyDesp.innerHTML = desp.length
        ? desp.map(buildTxRow).join('')
        : '<tr class="tx-empty-row"><td colspan="7"><i class="bi bi-inbox"></i>Nenhuma despesa no período</td></tr>';
    }
    var mobDesp = document.getElementById('tx-mob-despesas');
    if (mobDesp) {
      mobDesp.innerHTML = desp.length
        ? desp.map(buildTxCard).join('')
        : '<div class="tx-empty-state"><i class="bi bi-inbox"></i><p>Nenhuma despesa no período</p></div>';
    }

    var bodyRec = document.getElementById('tx-body-receitas');
    if (bodyRec) {
      bodyRec.innerHTML = rec.length
        ? rec.map(buildTxRow).join('')
        : '<tr class="tx-empty-row"><td colspan="7"><i class="bi bi-inbox"></i>Nenhuma receita no período</td></tr>';
    }
    var mobRec = document.getElementById('tx-mob-receitas');
    if (mobRec) {
      mobRec.innerHTML = rec.length
        ? rec.map(buildTxCard).join('')
        : '<div class="tx-empty-state"><i class="bi bi-inbox"></i><p>Nenhuma receita no período</p></div>';
    }

    var efet = 0, pend = 0;
    desp.forEach(function(it) { if (it.paid) efet += it.amtRaw; else pend += it.amtRaw; });
    var setTx = function(id, val) { var e = document.getElementById(id); if(e) e.textContent = fmtBRLtx(val); };
    setTx('tx-efetivadas', efet);
    setTx('tx-pendentes',  pend);
    setTx('tx-total-desp', efet + pend);

    var totalRec = rec.reduce(function(s, it) { return s + it.amtRaw; }, 0);
    setTx('tx-total-rec', totalRec);

    renderTxExtrato(desp, rec);
  }

  window.renderTransacoes = renderTransacoes;

  document.addEventListener('DOMContentLoaded', function() {
    var txView = document.getElementById('view-transacoes');
    if (!txView) return;

    txView.addEventListener('click', function(e) {
      var tab = e.target.closest('[data-tx-tab]');
      if (tab) {
        var tabVal = tab.dataset.txTab;
        txView.querySelectorAll('.tx-tab').forEach(function(t) {
          t.classList.toggle('tx-tab-active', t.dataset.txTab === tabVal);
        });
        txView.querySelectorAll('.tx-panel').forEach(function(p) { p.classList.add('hidden'); });
        var panel = document.getElementById('tx-panel-' + tab.dataset.txTab);
        if (panel) panel.classList.remove('hidden');
        if (tab.dataset.txTab === 'extrato') {
          var src2 = window._txData || {};
          renderTxExtrato(
            txItemsFromData(src2.expenses, 'expense'),
            txItemsFromData(src2.incomes,  'income')
          );
        }
        return;
      }

      var editBtn = e.target.closest('.tx-edit-btn');
      if (editBtn) {
        if (window.openEditModal) window.openEditModal(editBtn.dataset.txId, editBtn.dataset.txType);
        return;
      }

      var delBtn = e.target.closest('.tx-del-btn');
      if (delBtn) {
        if (window.deleteTransaction) window.deleteTransaction(delBtn.dataset.txId, delBtn.dataset.txType);
        return;
      }
    });

    txView.addEventListener('change', function(e) {
      var cb = e.target.closest('.tx-paid-check');
      if (!cb) return;
      var src3 = document.getElementById('expenseList');
      if (src3) {
        var srcCb = src3.querySelector('[data-toggle-paid][data-id="' + cb.dataset.txId + '"]');
        if (srcCb) {
          srcCb.checked = cb.checked;
          srcCb.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    });

    function txObserveEl(id, cb) {
      var t = document.getElementById(id);
      if (t) new MutationObserver(cb).observe(t, { childList: true, subtree: true });
    }
    txObserveEl('incomeList',  function() { setTimeout(renderTransacoes, 80); });
    txObserveEl('expenseList', function() { setTimeout(renderTransacoes, 80); });
    setTimeout(renderTransacoes, 1200);
  });

  // ===== CALENDÁRIO =====
  function calPad(n) { return n < 10 ? '0' + n : String(n); }

  function renderCalendario() {
    var view = document.getElementById('view-calendario');
    if (!view || view.classList.contains('hidden')) return;

    var monthEl = document.getElementById('filterMonth');
    var yearEl  = document.getElementById('filterYear');
    if (!monthEl || !yearEl) return;

    var month = parseInt(monthEl.value);
    var year  = parseInt(yearEl.value);

    var desp = parseTxItems('expenseList', 'expense');
    var rec  = parseTxItems('incomeList',  'income');

    var dayMap = {};
    desp.concat(rec).forEach(function(it) {
      if (!it.dateStr) return;
      if (!dayMap[it.dateStr]) dayMap[it.dateStr] = [];
      dayMap[it.dateStr].push(it);
    });

    var firstDay  = new Date(year, month, 1);
    var lastDay   = new Date(year, month + 1, 0);
    var startDow  = firstDay.getDay();
    var numDays   = lastDay.getDate();
    var today     = new Date();
    var isNow     = today.getMonth() === month && today.getFullYear() === year;
    var DOWS      = ['DOM.','SEG.','TER.','QUA.','QUI.','SEX.','SÁB.'];

    var html = '<div class="cal-wrap">';
    html += '<div class="cal-header">';
    DOWS.forEach(function(d) { html += '<div class="cal-dow">' + d + '</div>'; });
    html += '</div><div class="cal-grid">';

    var prevLast = new Date(year, month, 0).getDate();
    for (var p = 0; p < startDow; p++) {
      html += '<div class="cal-cell cal-cell-other"><span class="cal-day-num">' + (prevLast - startDow + p + 1) + '</span></div>';
    }

    for (var day = 1; day <= numDays; day++) {
      var key     = calPad(day) + '/' + calPad(month + 1) + '/' + year;
      var items   = dayMap[key] || [];
      var shown   = items.slice(0, 2);
      var more    = items.length - shown.length;
      var isToday = isNow && day === today.getDate();

      html += '<div class="cal-cell' + (isToday ? ' cal-today' : '') + '" data-cal-key="' + key + '">';
      html += '<span class="cal-day-num' + (isToday ? ' cal-today-num' : '') + '">' + day + '</span>';

      if (shown.length) {
        html += '<div class="cal-items">';
        shown.forEach(function(it) {
          var dotClr  = it.type === 'income' ? '#22c55e' : '#ef4444';
          var chk     = (it.type === 'income' || it.paid) ? '✓' : '•';
          var chkClr  = (it.type === 'income' || it.paid) ? '#22c55e' : '#f59e0b';
          var amt     = (it.amtStr || '').replace(/^[+\-]/, '');
          html += '<div class="cal-item">'
            + '<span class="cal-dot" style="background:' + dotClr + '"></span>'
            + '<span class="cal-item-desc">' + escHtml(it.desc) + '</span>'
            + '<span class="cal-item-amt">' + amt + '</span>'
            + '<span class="cal-item-chk" style="color:' + chkClr + '">' + chk + '</span>'
            + '</div>';
        });
        if (more > 0) {
          html += '<div class="cal-more" data-cal-key="' + key + '">+ ' + more + ' mais</div>';
        }
        html += '</div>';
      }
      html += '</div>';
    }

    var total    = startDow + numDays;
    var trailing = (7 - (total % 7)) % 7;
    for (var t = 1; t <= trailing; t++) {
      html += '<div class="cal-cell cal-cell-other"><span class="cal-day-num">' + t + '</span></div>';
    }

    html += '</div></div>';
    view.innerHTML = html;

    view.querySelectorAll('.cal-more').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var calKey   = btn.dataset.calKey;
        var calItems = dayMap[calKey] || [];
        var old   = document.getElementById('cal-popup');
        if (old) old.remove();

        var popup = document.createElement('div');
        popup.id = 'cal-popup';
        popup.className = 'cal-popup';
        popup.innerHTML = '<div class="cal-popup-title">' + calKey + '</div>'
          + calItems.map(function(it) {
              var dotClr = it.type === 'income' ? '#22c55e' : '#ef4444';
              var chk    = (it.type === 'income' || it.paid) ? '✓' : '•';
              var chkClr = (it.type === 'income' || it.paid) ? '#22c55e' : '#f59e0b';
              var amt    = (it.amtStr || '').replace(/^[+\-]/, '');
              return '<div class="cal-popup-row">'
                + '<span class="cal-dot" style="background:' + dotClr + '"></span>'
                + '<span class="cal-popup-desc">' + escHtml(it.desc) + '</span>'
                + '<span class="cal-popup-amt">' + amt + '</span>'
                + '<span style="color:' + chkClr + ';font-size:0.8em">' + chk + '</span>'
                + '</div>';
            }).join('');

        var rect = btn.getBoundingClientRect();
        popup.style.top  = (rect.bottom + window.scrollY + 4) + 'px';
        popup.style.left = Math.min(rect.left + window.scrollX, window.innerWidth - 260) + 'px';
        document.body.appendChild(popup);

        setTimeout(function() {
          document.addEventListener('click', function close() {
            popup.remove();
            document.removeEventListener('click', close);
          });
        }, 10);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function() {
    var calLink = document.querySelector('.sidebar-item[data-view="calendario"]');
    if (calLink) calLink.addEventListener('click', function() { setTimeout(renderCalendario, 80); });

    ['filterMonth','filterYear'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('change', function() { setTimeout(renderCalendario, 200); });
    });

    observeEl('incomeList',  function() { setTimeout(renderCalendario, 100); });
    observeEl('expenseList', function() { setTimeout(renderCalendario, 100); });
    setTimeout(renderCalendario, 1500);
  });

})();
