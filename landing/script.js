/* ===== Scroll reveal через IntersectionObserver ===== */
(() => {
  const targets = document.querySelectorAll(
    '.section-head, .feature-grid, .split, .loader-grid, .download-card, .faq-list, .cards-stack'
  );
  if (!targets.length || !('IntersectionObserver' in window)) {
    targets.forEach((el) => el.classList.add('in-view'));
    return;
  }

  // Помечаем грид-контейнеры как stagger
  document.querySelectorAll('.feature-grid, .loader-grid, .faq-list, .cards-stack')
    .forEach((el) => el.classList.add('reveal-stagger'));

  // Все targets получают reveal
  targets.forEach((el) => el.classList.add('reveal'));

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add('in-view');
        io.unobserve(e.target);
      }
    }
  }, {
    threshold: 0.12,
    rootMargin: '0px 0px -60px 0px',
  });

  targets.forEach((el) => io.observe(el));
})();

/* ===== Parallax: фоновые орбы реагируют на мышь и скролл ===== */
(() => {
  const orbs = document.querySelectorAll('.orb');
  if (!orbs.length) return;

  let mx = 0, my = 0;        // позиция мыши в [-1, 1]
  let scrollY = 0;
  let raf = null;

  function update() {
    raf = null;
    orbs.forEach((orb, i) => {
      const depth = (i + 1) * 14;     // разные слои
      const sDepth = (i + 1) * 0.05;
      const tx = mx * depth;
      const ty = my * depth - scrollY * sDepth;
      orb.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
    });
  }

  function schedule() {
    if (raf == null) raf = requestAnimationFrame(update);
  }

  window.addEventListener('mousemove', (e) => {
    mx = (e.clientX / window.innerWidth) * 2 - 1;
    my = (e.clientY / window.innerHeight) * 2 - 1;
    schedule();
  }, { passive: true });

  window.addEventListener('scroll', () => {
    scrollY = window.scrollY;
    schedule();
  }, { passive: true });
})();

/* ===== Окно в hero реагирует на мышь — лёгкий 3D-tilt ===== */
(() => {
  const window3d = document.querySelector('.window');
  const wrapper = document.querySelector('.hero-preview');
  if (!window3d || !wrapper) return;

  let raf = null;
  let tx = 0, ty = 0;

  function apply() {
    raf = null;
    window3d.style.transform = `perspective(1500px) rotateX(${ty}deg) rotateY(${tx}deg)`;
  }

  wrapper.addEventListener('mousemove', (e) => {
    const r = wrapper.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    tx = px * 6;       // максимум ~6deg
    ty = -py * 4;
    if (!raf) raf = requestAnimationFrame(apply);
  });

  wrapper.addEventListener('mouseleave', () => {
    tx = 0; ty = 0;
    if (!raf) raf = requestAnimationFrame(apply);
  });
})();

/* ===== Smooth scroll для anchor-ссылок (если браузер не понимает CSS) ===== */
(() => {
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      if (id === '#' || id.length < 2) return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
})();

/* ===== Header теряет прозрачность при скролле ===== */
(() => {
  const nav = document.querySelector('.nav');
  if (!nav) return;
  let last = 0;
  function onScroll() {
    const y = window.scrollY;
    nav.classList.toggle('scrolled', y > 20);
    last = y;
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();
