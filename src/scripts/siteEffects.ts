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

type GridPoint = { x: number; y: number };
type GridRipple = { x: number; y: number; startedAt: number };

function initKineticGrid() {
  const host = document.querySelector<HTMLElement>('[data-kinetic-grid]');
  const canvas = host?.querySelector<HTMLCanvasElement>('[data-kinetic-grid-canvas]');
  const context = canvas?.getContext('2d');
  if (!host || !canvas || !context) return;

  const gridHost = host;
  const gridCanvas = canvas;
  const gridContext = context;
  const articleScale = gridHost.dataset.article === 'true' ? 0.58 : 1;
  const interactive = !reducedMotion.matches && !coarsePointer.matches;
  const pointer = {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    targetX: window.innerWidth / 2,
    targetY: window.innerHeight / 2,
    influence: 0,
    targetInfluence: 0
  };
  const ripples: GridRipple[] = [];
  let width = window.innerWidth;
  let height = window.innerHeight;
  let spacing = 46;
  let frame = 0;
  let colors = readGridColors();

  function readGridColors() {
    const styles = getComputedStyle(root);
    return {
      line: styles.getPropertyValue('--kinetic-grid-line').trim(),
      accent: styles.getPropertyValue('--kinetic-grid-accent').trim(),
      dot: styles.getPropertyValue('--kinetic-grid-dot').trim()
    };
  }

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    spacing = width < 700 ? 42 : 46;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
    gridCanvas.width = Math.round(width * pixelRatio);
    gridCanvas.height = Math.round(height * pixelRatio);
    gridContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    render(performance.now());
  }

  function transformPoint(x: number, y: number, now: number): GridPoint {
    let nextX = x;
    let nextY = y;

    if (pointer.influence > 0.002) {
      const dx = pointer.x - x;
      const dy = pointer.y - y;
      const distance = Math.hypot(dx, dy) || 1;
      const radius = Math.min(230, Math.max(155, width * 0.15));
      if (distance < radius) {
        const falloff = 1 - distance / radius;
        const pull = falloff * falloff * 38 * pointer.influence * articleScale;
        nextX += (dx / distance) * pull;
        nextY += (dy / distance) * pull;
      }
    }

    for (const ripple of ripples) {
      const age = (now - ripple.startedAt) / 1000;
      const life = 1 - age / 1.35;
      if (life <= 0) continue;

      const dx = x - ripple.x;
      const dy = y - ripple.y;
      const distance = Math.hypot(dx, dy) || 1;
      const ringRadius = age * 360;
      const ringDistance = distance - ringRadius;
      const envelope = Math.exp(-(ringDistance * ringDistance) / 1800);
      const wave = Math.sin(ringDistance * 0.09) * envelope * life * 20 * articleScale;
      nextX += (dx / distance) * wave;
      nextY += (dy / distance) * wave;
    }

    return { x: nextX, y: nextY };
  }

  function traceGrid(now: number) {
    const startX = -spacing * 2;
    const startY = -spacing * 2;
    const endX = width + spacing * 2;
    const endY = height + spacing * 2;

    gridContext.beginPath();
    for (let y = startY; y <= endY; y += spacing) {
      for (let x = startX; x <= endX; x += spacing / 2) {
        const point = transformPoint(x, y, now);
        if (x === startX) gridContext.moveTo(point.x, point.y);
        else gridContext.lineTo(point.x, point.y);
      }
    }
    for (let x = startX; x <= endX; x += spacing) {
      for (let y = startY; y <= endY; y += spacing / 2) {
        const point = transformPoint(x, y, now);
        if (y === startY) gridContext.moveTo(point.x, point.y);
        else gridContext.lineTo(point.x, point.y);
      }
    }
  }

  function render(now: number) {
    gridContext.clearRect(0, 0, width, height);
    gridContext.lineWidth = 0.82;
    gridContext.strokeStyle = colors.line;
    traceGrid(now);
    gridContext.stroke();

    if (pointer.influence > 0.01) {
      gridContext.save();
      gridContext.beginPath();
      gridContext.arc(pointer.x, pointer.y, 190, 0, Math.PI * 2);
      gridContext.clip();
      gridContext.lineWidth = 1.05;
      gridContext.globalAlpha = 0.72 * pointer.influence * articleScale;
      gridContext.strokeStyle = colors.accent;
      traceGrid(now);
      gridContext.stroke();

      gridContext.fillStyle = colors.dot;
      for (let y = -spacing; y <= height + spacing; y += spacing) {
        for (let x = -spacing; x <= width + spacing; x += spacing) {
          if (Math.hypot(pointer.x - x, pointer.y - y) > 150) continue;
          const point = transformPoint(x, y, now);
          gridContext.beginPath();
          gridContext.arc(point.x, point.y, 1.25, 0, Math.PI * 2);
          gridContext.fill();
        }
      }
      gridContext.restore();
    }
  }

  function drawFrame(now: number) {
    frame = 0;
    pointer.x += (pointer.targetX - pointer.x) * 0.16;
    pointer.y += (pointer.targetY - pointer.y) * 0.16;
    pointer.influence += (pointer.targetInfluence - pointer.influence) * 0.13;

    for (let index = ripples.length - 1; index >= 0; index -= 1) {
      if (now - ripples[index].startedAt > 1350) ripples.splice(index, 1);
    }

    render(now);
    const pointerMoving = Math.hypot(pointer.targetX - pointer.x, pointer.targetY - pointer.y) > 0.15;
    const influenceMoving = Math.abs(pointer.targetInfluence - pointer.influence) > 0.004;
    if (pointerMoving || influenceMoving || ripples.length > 0) requestRender();
  }

  function requestRender() {
    if (!frame && !document.hidden) frame = window.requestAnimationFrame(drawFrame);
  }

  function handlePointerMove(event: PointerEvent) {
    pointer.targetX = event.clientX;
    pointer.targetY = event.clientY;
    pointer.targetInfluence = 1;
    requestRender();
  }

  function handlePointerDown(event: PointerEvent) {
    ripples.push({ x: event.clientX, y: event.clientY, startedAt: performance.now() });
    if (ripples.length > 3) ripples.shift();
    requestRender();
  }

  function handlePointerLeave(event: PointerEvent) {
    if (event.relatedTarget) return;
    pointer.targetInfluence = 0;
    requestRender();
  }

  function handleVisibilityChange() {
    if (document.hidden && frame) {
      window.cancelAnimationFrame(frame);
      frame = 0;
    } else {
      requestRender();
    }
  }

  let resizeFrame = 0;
  window.addEventListener('resize', () => {
    if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
    resizeFrame = window.requestAnimationFrame(resize);
  }, { passive: true });
  document.addEventListener('visibilitychange', handleVisibilityChange);

  if (interactive) {
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerdown', handlePointerDown, { passive: true });
    window.addEventListener('pointerout', handlePointerLeave, { passive: true });
    window.addEventListener('blur', () => {
      pointer.targetInfluence = 0;
      requestRender();
    });
  }

  const themeObserver = new MutationObserver(() => {
    colors = readGridColors();
    requestRender();
  });
  themeObserver.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  resize();
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

function initProblemIndexScroll() {
  const indexLinks = [...document.querySelectorAll<HTMLAnchorElement>('.problem-index li a[href^="#"]')];
  const headingItems = indexLinks
    .map((link) => {
      const id = decodeURIComponent(link.hash.slice(1));
      const target = document.getElementById(id);
      return target ? { link, target } : null;
    })
    .filter((item): item is { link: HTMLAnchorElement; target: HTMLElement } => item !== null);

  if (!headingItems.length) return;

  const setActiveLink = (activeLink: HTMLAnchorElement) => {
    indexLinks.forEach((link) => {
      const isActive = link === activeLink;
      link.classList.toggle('is-active', isActive);
      if (isActive) {
        link.setAttribute('aria-current', 'location');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  };

  const syncActiveLink = () => {
    const marker = 96;
    let active = headingItems[0];

    for (const item of headingItems) {
      if (item.target.getBoundingClientRect().top <= marker) {
        active = item;
      } else {
        break;
      }
    }

    const nearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
    setActiveLink(nearBottom ? headingItems[headingItems.length - 1].link : active.link);
  };

  let ticking = false;
  const requestSync = () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(() => {
      syncActiveLink();
      ticking = false;
    });
  };

  document.querySelectorAll<HTMLAnchorElement>('.problem-index a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (event) => {
      const hash = link.hash;
      if (!hash) return;

      const target = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (!target) return;

      event.preventDefault();
      target.scrollIntoView({
        behavior: reducedMotion.matches ? 'auto' : 'smooth',
        block: 'start'
      });
      history.pushState(null, '', hash);
      if (link.closest('li')) {
        setActiveLink(link);
      }
    });
  });

  window.addEventListener('scroll', requestSync, { passive: true });
  window.addEventListener('resize', requestSync, { passive: true });
  syncActiveLink();
}

initHeaderState();
initActiveNav();
initKineticGrid();
initInteractiveSurfaces();
initRevealAndStagger();
initCodeBlocks();
initProblemIndexScroll();
