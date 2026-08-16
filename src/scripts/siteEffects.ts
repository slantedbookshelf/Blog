const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const coarsePointer = window.matchMedia('(hover: none), (pointer: coarse)');
const root = document.documentElement;

function initHeaderState() {
  const header = document.querySelector<HTMLElement>('.site-header');
  const progress = document.querySelector<HTMLElement>('[data-reading-progress]');
  let ticking = false;

  const update = () => {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    header?.classList.toggle('is-scrolled', scrollTop > 10);

    if (progress) {
      const doc = document.documentElement;
      const max = Math.max(1, doc.scrollHeight - window.innerHeight);
      const value = Math.min(1, Math.max(0, scrollTop / max));
      progress.style.setProperty('--reading-progress', String(value));
    }

    ticking = false;
  };

  const requestUpdate = () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(update);
  };

  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', requestUpdate, { passive: true });
  update();
}

function initActiveNav() {
  const currentPath = normalizePath(window.location.pathname);
  const links = [...document.querySelectorAll<HTMLAnchorElement>('.nav-links a[href]')];
  const homePath = links[0] ? normalizePath(new URL(links[0].href).pathname) : '/';
  const basePrefix = homePath === '/' ? '' : homePath;
  const blogPath = links.map((link) => normalizePath(new URL(link.href).pathname)).find((path) => path.endsWith('/blog'));
  const isPostDetail = currentPath.startsWith(`${basePrefix}/posts/`);

  links.forEach((link) => {
    const linkPath = normalizePath(new URL(link.href).pathname);
    const isHome = linkPath === homePath;
    const isActive = isHome
      ? currentPath === homePath
      : currentPath === linkPath || currentPath.startsWith(`${linkPath}/`) || (isPostDetail && linkPath === blogPath);
    if (isActive) {
      link.setAttribute('aria-current', 'page');
    }
  });
}

function normalizePath(path: string) {
  const withoutBase = path.replace(/\/$/, '') || '/';
  return withoutBase;
}

function initBackgroundMotionPreference() {
  const warpedGrid = document.querySelector<SVGSVGElement>('[data-warped-grid-svg]');
  if (!warpedGrid) return;

  const syncMotionPreference = () => {
    if (reducedMotion.matches) {
      warpedGrid.pauseAnimations();
    } else {
      warpedGrid.unpauseAnimations();
    }
  };

  syncMotionPreference();
  reducedMotion.addEventListener('change', syncMotionPreference);
}

function initPointerEffects() {
  const glow = document.querySelector<HTMLElement>('.pointer-glow');
  const halo = document.querySelector<HTMLElement>('.cursor-halo');
  if (!glow || !halo || reducedMotion.matches || coarsePointer.matches) return;

  let mouseX = window.innerWidth / 2;
  let mouseY = window.innerHeight / 2;
  let haloX = mouseX;
  let haloY = mouseY;
  let raf = 0;

  const draw = () => {
    root.style.setProperty('--mouse-x', `${mouseX}px`);
    root.style.setProperty('--mouse-y', `${mouseY}px`);
    haloX += (mouseX - haloX) * 0.24;
    haloY += (mouseY - haloY) * 0.24;
    halo.style.transform = `translate3d(${haloX}px, ${haloY}px, 0)`;

    if (Math.abs(mouseX - haloX) > 0.4 || Math.abs(mouseY - haloY) > 0.4) {
      raf = window.requestAnimationFrame(draw);
    } else {
      raf = 0;
    }
  };

  window.addEventListener('pointermove', (event) => {
    mouseX = event.clientX;
    mouseY = event.clientY;
    if (!raf) {
      raf = window.requestAnimationFrame(draw);
    }
  }, { passive: true });
}

function initInteractiveSurfaces() {
  if (reducedMotion.matches || coarsePointer.matches) return;

  const selectors = [
    '.post-card',
    '.work-item',
    '.category-card',
    '.latest-entry',
    '.filter-block > div',
    '.about-grid > div',
    '.post-nav a',
    '.review-card',
    '.review-toolbar',
    '.review-stats',
    '.review-simulation',
    '.ai-chat__panel'
  ].join(',');

  document.querySelectorAll<HTMLElement>(selectors).forEach((surface) => {
    surface.classList.add('interactive-surface');
  });

  document.addEventListener('pointermove', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const surface = target.closest<HTMLElement>('.interactive-surface');
    if (!surface) return;

    const rect = surface.getBoundingClientRect();
    surface.style.setProperty('--spot-x', `${event.clientX - rect.left}px`);
    surface.style.setProperty('--spot-y', `${event.clientY - rect.top}px`);
  }, { passive: true });
}

function initRevealAndStagger() {
  if (reducedMotion.matches) return;

  document.querySelectorAll<HTMLElement>('.page-title, .home-top, .content-layout, .article, .review-app').forEach((item) => {
    item.classList.add('reveal');
  });

  document.querySelectorAll<HTMLElement>('.post-list .post-card, .works-list .work-item').forEach((item, index) => {
    if (index > 7) return;
    item.classList.add('stagger-item');
    item.style.setProperty('--stagger-index', String(index));
  });
}

function initCodeBlocks() {
  document.querySelectorAll<HTMLPreElement>('.prose pre').forEach((pre) => {
    if (pre.closest('.code-block')) return;

    const code = pre.querySelector<HTMLElement>('code');
    const wrapper = document.createElement('figure');
    const header = document.createElement('figcaption');
    const language = document.createElement('span');
    const button = document.createElement('button');

    wrapper.className = 'code-block interactive-surface';
    header.className = 'code-block__header';
    language.className = 'code-block__lang';
    button.className = 'code-block__copy';
    button.type = 'button';
    button.textContent = 'Copy';
    button.setAttribute('aria-label', '复制代码');
    language.textContent = getCodeLanguage(pre, code);

    header.append(language, button);
    pre.before(wrapper);
    wrapper.append(header, pre);

    button.addEventListener('click', async () => {
      const text = code?.innerText ?? pre.innerText;
      try {
        await navigator.clipboard.writeText(text);
        button.textContent = 'Copied';
      } catch {
        button.textContent = 'Failed';
      }
      window.setTimeout(() => {
        button.textContent = 'Copy';
      }, 1600);
    });
  });
}

function getCodeLanguage(pre: HTMLPreElement, code: HTMLElement | null) {
  const className = `${pre.className} ${code?.className ?? ''}`;
  const match = className.match(/language-([a-z0-9-]+)/i);
  return match?.[1]?.toUpperCase() ?? 'CODE';
}

initHeaderState();
initActiveNav();
initBackgroundMotionPreference();
initPointerEffects();
initInteractiveSurfaces();
initRevealAndStagger();
initCodeBlocks();
