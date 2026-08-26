// ── Dashboard UI helpers ────────────────────────────────────────────────
// Mobile sidebar toggle + misc enhancements

(function () {
  const menuToggle = document.getElementById('menuToggle');
  const sidebar    = document.getElementById('sidebar');
  const overlay    = document.getElementById('sidebarOverlay');

  if (menuToggle && sidebar && overlay) {
    const open = () => {
      sidebar.classList.add('open');
      overlay.classList.add('show');
      document.body.style.overflow = 'hidden';
    };
    const close = () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('show');
      document.body.style.overflow = '';
    };

    menuToggle.addEventListener('click', () => {
      if (sidebar.classList.contains('open')) {
        close();
      } else {
        open();
      }
    });
    overlay.addEventListener('click', close);

    // Close when a nav link is tapped on mobile
    sidebar.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
      if (window.innerWidth <= 768) close();
    }));
  }
})();
