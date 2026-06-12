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

/* ===== Apple-style: Blur-in reveal для секций ===== */
(() => {
  const targets = document.querySelectorAll('.section-head, .split-text, .split-visual, .checks');
  if (!targets.length || !('IntersectionObserver' in window)) {
    targets.forEach((el) => el.classList.add('in-view'));
    return;
  }
  targets.forEach((el) => el.classList.add('blur-in'));
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add('in-view');
        io.unobserve(e.target);
      }
    }
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
  targets.forEach((el) => io.observe(el));
})();

/* ===== Apple-style: Depth-reveal для loader cards ===== */
(() => {
  const targets = document.querySelectorAll('.loader-grid');
  if (!targets.length || !('IntersectionObserver' in window)) {
    targets.forEach((el) => el.classList.add('in-view'));
    return;
  }
  targets.forEach((el) => el.classList.add('depth-stagger'));
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add('in-view');
        io.unobserve(e.target);
      }
    }
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
  targets.forEach((el) => io.observe(el));
})();

/* ===== Apple-style: Scale-on-scroll для hero preview ===== */
(() => {
  const preview = document.querySelector('.hero-preview');
  if (!preview) return;
  let raf = null;
  function update() {
    raf = null;
    const scrollY = window.scrollY;
    const vh = window.innerHeight;
    const progress = Math.min(scrollY / (vh * 0.6), 1);
    const scale = 1 - progress * 0.08;
    const opacity = 1 - progress * 0.4;
    preview.style.transform = `scale(${scale})`;
    preview.style.opacity = opacity;
  }
  function schedule() {
    if (raf == null) raf = requestAnimationFrame(update);
  }
  window.addEventListener('scroll', schedule, { passive: true });
})();

/* ===== Apple-style: Magnetic button effect ===== */
(() => {
  const btns = document.querySelectorAll('.btn-primary, .nav-cta, .dl-btn.primary, .w-play');
  btns.forEach((btn) => {
    btn.classList.add('btn-magnetic');
    btn.addEventListener('mousemove', (e) => {
      const r = btn.getBoundingClientRect();
      const x = e.clientX - r.left - r.width / 2;
      const y = e.clientY - r.top - r.height / 2;
      btn.style.transform = `translate(${x * 0.15}px, ${y * 0.15}px)`;
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = '';
    });
  });
})();

/* ===== Apple-style: Cursor glow追随 feature cards ===== */
(() => {
  const cards = document.querySelectorAll('.feature');
  cards.forEach((card) => {
    card.classList.add('feature-glow');
    const glow = card.querySelector('::before');
    card.addEventListener('mousemove', (e) => {
      const r = card.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      card.style.setProperty('--glow-x', x + 'px');
      card.style.setProperty('--glow-y', y + 'px');
      card.style.background = `radial-gradient(circle 200px at ${x}px ${y}px, rgba(10,132,255,0.08), var(--bg-card))`;
    });
    card.addEventListener('mouseleave', () => {
      card.style.background = '';
    });
  });
})();

/* ===== Apple-style: Counter-scroll parallax для split sections ===== */
(() => {
  const splits = document.querySelectorAll('.split');
  if (!splits.length) return;
  let raf = null;
  function update() {
    raf = null;
    const scrollY = window.scrollY;
    splits.forEach((split) => {
      const rect = split.getBoundingClientRect();
      const vh = window.innerHeight;
      const center = rect.top + rect.height / 2;
      const offset = (center - vh / 2) / vh;
      const textEl = split.querySelector('.split-text');
      const visualEl = split.querySelector('.split-visual');
      if (textEl) textEl.style.transform = `translateY(${offset * -20}px)`;
      if (visualEl) visualEl.style.transform = `translateY(${offset * 20}px)`;
    });
  }
  function schedule() {
    if (raf == null) raf = requestAnimationFrame(update);
  }
  window.addEventListener('scroll', schedule, { passive: true });
})();

/* ===== Apple-style: Section fade-in при скролле ===== */
(() => {
  const sections = document.querySelectorAll('.section');
  if (!sections.length || !('IntersectionObserver' in window)) {
    sections.forEach((el) => el.classList.add('in-view'));
    return;
  }
  sections.forEach((sec) => {
    const children = sec.querySelectorAll('.section-head, .feature-grid, .split, .loader-grid, .download-card, .faq-list');
    children.forEach((el) => el.classList.add('section-fade'));
  });
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add('in-view');
        io.unobserve(e.target);
      }
    }
  }, { threshold: 0.08, rootMargin: '0px 0px -30px 0px' });
  document.querySelectorAll('.section-fade').forEach((el) => io.observe(el));
})();

/* ===== Apple-style: Smooth nav active indicator ===== */
(() => {
  const nav = document.querySelector('.nav-links');
  if (!nav) return;
  const links = nav.querySelectorAll('a');
  if (!links.length) return;
  const indicator = document.createElement('div');
  indicator.className = 'nav-pill-indicator';
  nav.style.position = 'relative';
  nav.appendChild(indicator);

  function moveIndicator(el) {
    const r = el.getBoundingClientRect();
    const navR = nav.getBoundingClientRect();
    indicator.style.left = (r.left - navR.left) + 'px';
    indicator.style.width = r.width + 'px';
  }

  links.forEach((link) => {
    link.addEventListener('mouseenter', () => moveIndicator(link));
  });
  nav.addEventListener('mouseleave', () => {
    indicator.style.opacity = '0';
    setTimeout(() => { indicator.style.opacity = ''; }, 300);
  });
})();

/* ===== Apple-style: Smooth orb color shift on scroll ===== */
(() => {
  const orbs = document.querySelectorAll('.orb');
  if (orbs.length < 3) return;
  let raf = null;
  function update() {
    raf = null;
    const scrollY = window.scrollY;
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const progress = maxScroll > 0 ? scrollY / maxScroll : 0;
    const hue = progress * 60;
    orbs.forEach((orb, i) => {
      orb.style.filter = `blur(120px) hue-rotate(${hue + i * 20}deg)`;
    });
  }
  function schedule() {
    if (raf == null) raf = requestAnimationFrame(update);
  }
  window.addEventListener('scroll', schedule, { passive: true });
})();

/* ===== Apple-style: Smooth number counting for hero-meta ===== */
(() => {
  const meta = document.querySelector('.hero-meta');
  if (!meta) return;
  const spans = meta.querySelectorAll('span:not(.meta-dot)');
  spans.forEach((span) => {
    span.addEventListener('mouseenter', () => {
      span.style.transform = 'scale(1.05)';
      span.style.transition = 'transform 0.3s var(--ease-spring)';
    });
    span.addEventListener('mouseleave', () => {
      span.style.transform = '';
    });
  });
})();

/* ===== Apple-style: Smooth FAQ reveal ===== */
(() => {
  const faqs = document.querySelectorAll('.faq-item');
  faqs.forEach((faq) => {
    faq.addEventListener('toggle', () => {
      if (faq.open) {
        const p = faq.querySelector('p');
        if (p) {
          p.style.opacity = '0';
          p.style.transform = 'translateY(-8px)';
          requestAnimationFrame(() => {
            p.style.transition = 'opacity 0.4s var(--ease-out), transform 0.4s var(--ease-out)';
            p.style.opacity = '1';
            p.style.transform = 'translateY(0)';
          });
        }
      }
    });
  });
})();

/* ===== Apple-style: Smooth cursor trail on hero ===== */
(() => {
  const hero = document.querySelector('.hero');
  if (!hero) return;
  const trail = document.createElement('div');
  trail.style.cssText = `
    position: fixed;
    width: 300px;
    height: 300px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(10,132,255,0.06) 0%, transparent 70%);
    pointer-events: none;
    z-index: 0;
    transition: opacity 0.5s;
    opacity: 0;
  `;
  hero.appendChild(trail);

  hero.addEventListener('mouseenter', () => { trail.style.opacity = '1'; });
  hero.addEventListener('mouseleave', () => { trail.style.opacity = '0'; });
  hero.addEventListener('mousemove', (e) => {
    trail.style.left = (e.clientX - 150) + 'px';
    trail.style.top = (e.clientY - 150) + 'px';
  });
})();
