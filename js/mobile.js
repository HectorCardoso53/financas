(function () {
  var overlay = document.getElementById('sidebarOverlay');
  var sidebar = document.getElementById('sidebar');
  var hamburger = document.getElementById('hamburgerBtn');

  function openSidebar() {
    if (!sidebar || !overlay) return;
    sidebar.classList.add('open');
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
  function closeSidebar() {
    if (!sidebar || !overlay) return;
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  if (overlay) overlay.addEventListener('click', closeSidebar);

  if (sidebar) sidebar.querySelectorAll('.sidebar-item').forEach(function (item) {
    item.addEventListener('click', function () {
      if (window.innerWidth <= 900) closeSidebar();
    });
  });

  if (hamburger) hamburger.addEventListener('click', function () {
    if (sidebar && sidebar.classList.contains('open')) closeSidebar();
    else openSidebar();
  });

  // Bottom nav
  var bottomNav = document.getElementById('mobileBottomNav');
  if (bottomNav) {
    bottomNav.querySelectorAll('[data-mob-view]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        bottomNav.querySelectorAll('.mob-nav-item').forEach(function (b) { b.classList.remove('mob-active'); });
        btn.classList.add('mob-active');
        if (window._switchViewFn) window._switchViewFn(btn.dataset.mobView);
      });
    });
    var mobAdd = document.getElementById('mobAddBtn');
    if (mobAdd) mobAdd.addEventListener('click', function (e) {
      e.stopPropagation();
      var addBtn = document.getElementById('addBtn');
      if (addBtn) addBtn.click();
    });
  }

  // Sincroniza bottom nav quando a view muda via sidebar
  document.addEventListener('click', function (e) {
    var sideItem = e.target.closest('.sidebar-item[data-view]');
    if (sideItem && bottomNav) {
      var view = sideItem.dataset.view;
      bottomNav.querySelectorAll('.mob-nav-item').forEach(function (b) {
        b.classList.toggle('mob-active', b.dataset.mobView === view);
      });
    }
  });

  window._switchViewFn = function (viewId) {
    var sideLink = document.querySelector('.sidebar-item[data-view="' + viewId + '"]');
    if (sideLink) sideLink.click();
  };
})();
