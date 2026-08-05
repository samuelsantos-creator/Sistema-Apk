      // ── Toggle section ──────────────────────────────────────────
      function toggle(header) {
        const section = header.closest('.section');
        section.classList.toggle('open');
      }

      function toggleAll(open) {
        document.querySelectorAll('.section:not(.hidden-search)').forEach(s => {
          if (open) s.classList.add('open');
          else s.classList.remove('open');
        });
      }

      // ── Toggle FAQ ──────────────────────────────────────────────
      function toggleFaq(qEl) {
        const item = qEl.closest('.faq-item');
        item.classList.toggle('open');
      }

      // ── Checklist ───────────────────────────────────────────────
      function checkItem(el) {
        el.classList.toggle('checked');
        const box = el.querySelector('.check-box');
        box.textContent = el.classList.contains('checked') ? '✓' : '';
        updateProgress();
      }
      function updateProgress() {
        const items = document.querySelectorAll('.check-item');
        const done = document.querySelectorAll('.check-item.checked').length;
        const prog = document.getElementById('check-progress');
        if (done === 0) { prog.textContent = ''; return; }
        if (done === items.length) {
          prog.innerHTML = '<span style="color:var(--green);font-weight:700;">✅ Turno pronto para encerrar!</span>';
        } else {
          prog.textContent = `${done} de ${items.length} itens verificados`;
        }
      }

      // ── Progress bar ─────────────────────────────────────────────
      const prog = document.getElementById('prog');
      const backTop = document.getElementById('backTop');
      window.addEventListener('scroll', () => {
        const pct = window.scrollY / (document.body.scrollHeight - window.innerHeight) * 100;
        if (prog) prog.style.width = pct + '%';
        if (backTop) {
            if (window.scrollY > 300) backTop.classList.add('show');
            else backTop.classList.remove('show');
        }
      });
      function scrollToTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }

      // ── Smooth nav ───────────────────────────────────────────────
      document.querySelectorAll('.nav-pill').forEach(a => {
        a.addEventListener('click', e => {
          e.preventDefault();
          const id = a.getAttribute('href').slice(1);
          const el = document.getElementById(id);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            // auto-open
            if (!el.classList.contains('open')) el.classList.add('open');
            document.querySelectorAll('.nav-pill').forEach(p => p.classList.remove('active'));
            a.classList.add('active');
          }
        });
      });

      // ── Search ──────────────────────────────────────────────────
      function doSearch(val) {
        const q = val.trim().toLowerCase();
        document.querySelectorAll('.section').forEach(sec => {
          if (!q) {
            sec.classList.remove('hidden-search');
            return;
          }
          const text = sec.textContent.toLowerCase();
          if (text.includes(q)) {
            sec.classList.remove('hidden-search');
            sec.classList.add('open');
          } else {
            sec.classList.add('hidden-search');
          }
        });
      }

      // ── Open first section by default ───────────────────────────
      document.querySelector('.section').classList.add('open');
