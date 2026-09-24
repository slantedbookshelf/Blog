document.querySelectorAll<HTMLElement>('[data-photo-stack]').forEach((root) => {
  if (root.dataset.photoStackReady === 'true') return;
  root.dataset.photoStackReady = 'true';

  const stage = root.querySelector<HTMLElement>('[data-photo-stage]');
  const deck = root.querySelector<HTMLElement>('[data-photo-deck]');
  const dialog = root.querySelector<HTMLDialogElement>('[data-photo-dialog]');
  const dialogImage = root.querySelector<HTMLImageElement>('[data-photo-dialog-image]');
  const dialogTitle = root.querySelector<HTMLElement>('[data-photo-dialog-title]');
  const dialogNote = root.querySelector<HTMLElement>('[data-photo-dialog-note]');
  const dialogNumber = root.querySelector<HTMLElement>('[data-photo-dialog-number]');
  const closeButton = root.querySelector<HTMLButtonElement>('[data-photo-close]');

  if (!stage || !deck || !dialog || !dialogImage || !dialogTitle || !dialogNote || !dialogNumber || !closeButton) return;

  let mode: 'stack' | 'fan' = 'stack';
  let dragCard: HTMLButtonElement | null = null;
  let dragPointer = -1;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragX = 0;
  let dragY = 0;
  let suppressClick = false;
  let lastTrigger: HTMLButtonElement | null = null;

  const cards = () => Array.from(deck.querySelectorAll<HTMLButtonElement>('[data-photo-card]'));

  const syncCards = () => {
    const currentCards = cards();
    currentCards.forEach((card, index) => {
      const centeredIndex = index - Math.floor(currentCards.length / 2);
      card.classList.toggle('is-top', index === 0);
      card.style.setProperty('--stack-x', `${index * 4}px`);
      card.style.setProperty('--stack-y', `${index * 4}px`);
      card.style.setProperty('--stack-r', `${[-2.4, 2, -1.2, 3, -2.8][index] ?? 0}deg`);
      card.style.setProperty('--fan-x', `${centeredIndex * 43}px`);
      card.style.setProperty('--fan-x-mobile', `${centeredIndex * 27.5}px`);
      card.style.setProperty('--fan-y', `${Math.abs(centeredIndex) * 8}px`);
      card.style.setProperty('--fan-r', `${centeredIndex * 4.5}deg`);
      card.style.zIndex = String(currentCards.length - index);
      card.tabIndex = mode === 'fan' || index === 0 ? 0 : -1;
      card.setAttribute('aria-hidden', mode === 'stack' && index !== 0 ? 'true' : 'false');
    });
  };

  const clearDrag = () => {
    if (!dragCard) return;
    dragCard.classList.remove('is-dragging');
    dragCard.style.removeProperty('--drag-x');
    dragCard.style.removeProperty('--drag-y');
    dragCard.style.removeProperty('--drag-r');
    dragCard = null;
    dragPointer = -1;
    dragX = 0;
    dragY = 0;
  };

  const setMode = (nextMode: 'stack' | 'fan') => {
    clearDrag();
    mode = nextMode;
    stage.dataset.mode = nextMode;
    syncCards();
  };

  const openDialog = (card: HTMLButtonElement) => {
    const sourceImage = card.querySelector<HTMLImageElement>('img');
    dialogImage.src = card.dataset.fullSrc || sourceImage?.currentSrc || sourceImage?.src || '';
    dialogImage.alt = card.dataset.title || '插画预览';
    dialogTitle.textContent = card.dataset.title || '';
    dialogNote.textContent = card.dataset.note || '';
    dialogNumber.textContent = card.dataset.number || '';
    lastTrigger = card;
    dialog.showModal();
    document.body.classList.add('has-photo-dialog');
    closeButton.focus();
  };

  stage.addEventListener('pointerenter', (event) => {
    if (event.pointerType === 'mouse' && !dragCard && !dialog.open) setMode('fan');
  });

  stage.addEventListener('pointerleave', (event) => {
    if (event.pointerType === 'mouse' && !dragCard && !dialog.open) setMode('stack');
  });

  deck.addEventListener('pointerdown', (event) => {
    const card = (event.target as Element).closest<HTMLButtonElement>('[data-photo-card]');
    if (!card || (mode === 'stack' && card !== cards()[0])) return;
    dragCard = card;
    dragPointer = event.pointerId;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    suppressClick = false;
    card.setPointerCapture(event.pointerId);
    card.classList.add('is-dragging');
  });

  deck.addEventListener('pointermove', (event) => {
    if (!dragCard || event.pointerId !== dragPointer) return;
    dragX = event.clientX - dragStartX;
    dragY = event.clientY - dragStartY;
    if (Math.abs(dragX) + Math.abs(dragY) > 7) suppressClick = true;
    dragCard.style.setProperty('--drag-x', `${dragX}px`);
    dragCard.style.setProperty('--drag-y', `${dragY}px`);
    dragCard.style.setProperty('--drag-r', `${dragX * 0.045}deg`);
  });

  const finishDrag = (event: PointerEvent) => {
    if (!dragCard || event.pointerId !== dragPointer) return;
    const direction = dragX >= 0 ? 'right' : 'left';
    const shouldRotate = Math.abs(dragX) > 58;
    const draggedCard = dragCard;
    clearDrag();
    if (shouldRotate && draggedCard) {
      suppressClick = true;
      if (direction === 'right') deck.prepend(draggedCard);
      else deck.append(draggedCard);
      syncCards();
    }
    if (!stage.matches(':hover') && !dialog.open) setMode('stack');
  };

  deck.addEventListener('pointerup', finishDrag);
  deck.addEventListener('pointercancel', finishDrag);

  deck.addEventListener('click', (event) => {
    const card = (event.target as Element).closest<HTMLButtonElement>('[data-photo-card]');
    if (!card) return;
    if (suppressClick) {
      suppressClick = false;
      event.preventDefault();
      return;
    }
    if (mode === 'stack' && card !== cards()[0]) return;
    openDialog(card);
  });

  closeButton.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => {
    document.body.classList.remove('has-photo-dialog');
    lastTrigger?.focus();
    if (!stage.matches(':hover')) setMode('stack');
  });

  syncCards();
});
