(function() {
  var _CONTA_KEY = 'mf-conta-nome';

  window.ctOpenEdit = function() {
    var nome  = (document.getElementById('ct-conta-nome') || {}).textContent || 'Minha Conta Corrente';
    var saldo = (document.getElementById('ct-saldo-inicial') || {}).textContent || '';
    var n = document.getElementById('ec-nome');   if (n) n.value = nome;
    var s = document.getElementById('ec-saldo-inicial'); if (s) s.value = saldo;
    var m = document.getElementById('editContaModal'); if (m) m.classList.remove('hidden');
  };
  window.ctCloseEdit = function() {
    var m = document.getElementById('editContaModal'); if (m) m.classList.add('hidden');
  };
  window.ctSaveEdit = function() {
    var n = document.getElementById('ec-nome');
    var nome = n ? n.value.trim() : '';
    if (!nome) { if (n) n.focus(); return; }
    var s = document.getElementById('ec-saldo-inicial');
    var saldo = s ? s.value.trim() : '';
    localStorage.setItem(_CONTA_KEY, nome);
    var el = document.getElementById('ct-conta-nome'); if (el) el.textContent = nome;
    var sl = document.getElementById('ct-saldo-inicial'); if (sl && saldo) sl.textContent = saldo;
    window.ctCloseEdit();
  };
  window.ctOpenDel = function() {
    var m = document.getElementById('delContaModal'); if (m) m.classList.remove('hidden');
  };
  window.ctCloseDel = function() {
    var m = document.getElementById('delContaModal'); if (m) m.classList.add('hidden');
  };
  window.ctConfirmDel = function() {
    localStorage.removeItem(_CONTA_KEY);
    var el = document.getElementById('ct-conta-nome'); if (el) el.textContent = 'Minha Conta Corrente';
    window.ctCloseDel();
  };

  document.addEventListener('DOMContentLoaded', function() {
    var s = document.getElementById('ec-saldo-inicial');
    if (s) s.addEventListener('input', function() {
      var v = s.value.replace(/\D/g, '');
      if (!v) { s.value = ''; return; }
      s.value = 'R$ ' + (parseInt(v,10)/100).toFixed(2).replace('.',',').replace(/\B(?=(\d{3})+(?!\d))/g,'.');
    });
    var saved = localStorage.getItem(_CONTA_KEY);
    var el = document.getElementById('ct-conta-nome');
    if (el && saved) el.textContent = saved;
  });
})();
