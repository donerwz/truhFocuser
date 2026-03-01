(function () {
  'use strict';

  if (window.__focusWhipInjected) return;
  window.__focusWhipInjected = true;

  let overlay = null;
  let isDistracted = false;
  let locked = false;
  let whipTimer = null;
  let redTimer = null;
  let redLevel = 0; // 0.0 – 1.0; when it hits 1.0 the screen locks

  // ── Check for existing lock on page load ─────────────────────────────────────
  chrome.storage.local.get('focusWhipLocked', (data) => {
    if (data.focusWhipLocked) applyLockedScreen();
  });

  // ── Poll every second — catches any broadcasts that were missed ───────────────
  setInterval(() => {
    if (locked) return;
    chrome.storage.local.get('focusWhipLocked', (data) => {
      if (data.focusWhipLocked) applyLockedScreen();
    });
  }, 1000);

  // ── Frame animation ───────────────────────────────────────────────────────────
  const FRAMES_WHIP = [
    chrome.runtime.getURL('assets/whipfr1.png'),
    chrome.runtime.getURL('assets/whipfr2.png'),
  ];
  const FRAMES_VIC = [
    chrome.runtime.getURL('assets/vicfr1.png'),
    chrome.runtime.getURL('assets/vicfr2.png'),
  ];

  let frameTimer = null;
  let frameIdx   = 0;

  function startFrames(frames) {
    clearInterval(frameTimer);
    frameIdx = 0;
    const img = overlay && overlay.querySelector('#fw-frame');
    if (!img) return;
    img.src = frames[0];
    frameTimer = setInterval(() => {
      frameIdx = 1 - frameIdx;
      img.src = frames[frameIdx];
    }, 500);
  }

  function stopFrames() {
    clearInterval(frameTimer);
    frameTimer = null;
  }

  // ── SFX ───────────────────────────────────────────────────────────────────────
  const SFX_URL = chrome.runtime.getURL('assets/sfx/off1.mp3');
  let sfxPlaying = false;

  // Preload the lock sound so it's ready to play instantly
  const lockAudio = new Audio(chrome.runtime.getURL('assets/sfx/truhm.wav'));
  lockAudio.preload = 'auto';
  lockAudio.volume  = 1.0;
  let pendingLockSound = false;

  let sfxReady = false;
  function _unlockSfx() {
    sfxReady = true;
    if (pendingLockSound) {
      pendingLockSound = false;
      lockAudio.play().catch(() => {});
    }
    ['click', 'keydown', 'scroll'].forEach(e =>
      document.removeEventListener(e, _unlockSfx, { capture: true }));
  }
  ['click', 'keydown', 'scroll'].forEach(e =>
    document.addEventListener(e, _unlockSfx, { capture: true }));

  function playSfx() {
    if (!sfxReady || sfxPlaying) return;
    sfxPlaying = true;
    const audio = new Audio(SFX_URL);
    audio.volume = 0.7;
    audio.addEventListener('ended', () => { sfxPlaying = false; }, { once: true });
    audio.play().catch(() => { sfxPlaying = false; });
  }

  // ── DOM construction ──────────────────────────────────────────────────────────
  function buildOverlay() {
    const el = document.createElement('div');
    el.id = 'fw-overlay';
    el.innerHTML = `
      <div id="fw-vignette"></div>
      <div id="fw-flash"></div>
      <div id="fw-char-wrap">
        <div id="fw-char">
          <img id="fw-frame" src="" alt=""/>
        </div>
      </div>
    `;
    document.documentElement.appendChild(el);
    return el;
  }

  // ── Whip cycle — flash + SFX on each crack ────────────────────────────────────
  function doWhipCycle() {
    if (!overlay || !isDistracted || locked) return;
    const flash = overlay.querySelector('#fw-flash');
    flash.style.opacity = '0.35';
    setTimeout(() => { if (flash) flash.style.opacity = '0'; }, 80);
    playSfx();
  }

  // ── Red vignette ──────────────────────────────────────────────────────────────
  function updateVignette() {
    if (!overlay) return;
    const v = overlay.querySelector('#fw-vignette');
    const t = Math.min(redLevel, 1.0);

    const holeRadius  = 65 * (1 - t);
    const edgeOpacity = (0.2 + t * 0.65).toFixed(3);

    if (holeRadius <= 0) {
      v.style.background = `rgba(160,0,0,${edgeOpacity})`;
    } else {
      v.style.background =
        `radial-gradient(ellipse at center,` +
        ` rgba(160,0,0,0) 0%,` +
        ` rgba(160,0,0,0) ${holeRadius.toFixed(1)}%,` +
        ` rgba(160,0,0,${edgeOpacity}) 100%)`;
    }
  }

  function tickRed() {
    if (!isDistracted || locked) return;
    redLevel = Math.min(redLevel + 0.025, 1.0);
    updateVignette();
    if (redLevel >= 1.0) lockScreen();
  }

  // ── Lock — permanent full-screen red, survives tab switches ──────────────────
  function lockScreen() {
    locked = true;
    clearInterval(whipTimer);
    clearInterval(redTimer);

    // Persist to session storage and broadcast to all open tabs via background
    chrome.storage.local.set({ focusWhipLocked: true });
    chrome.runtime.sendMessage({ type: 'LOCKED' });

    if (!overlay) overlay = buildOverlay();
    overlay.classList.add('fw-visible', 'fw-locked');

    // Snap vignette to solid red with a short transition
    const v = overlay.querySelector('#fw-vignette');
    if (v) {
      v.style.transition = 'background 0.7s ease';
      v.style.background = 'rgba(140, 0, 0, 0.96)';
    }

    // Play locked SFX (if autoplay is still blocked, queue it for next gesture)
    lockAudio.currentTime = 0;
    if (sfxReady) {
      lockAudio.play().catch(() => {});
    } else {
      pendingLockSound = true;
    }

    // Switch to victory frames
    startFrames(FRAMES_VIC);
  }

  // ── Apply locked state on page load (already locked from a previous tab) ─────
  function applyLockedScreen() {
    locked = true;
    isDistracted = true;

    if (!overlay) overlay = buildOverlay();

    requestAnimationFrame(() => {
      overlay.classList.add('fw-visible', 'fw-locked');

      const v = overlay.querySelector('#fw-vignette');
      if (v) v.style.background = 'rgba(140, 0, 0, 0.96)';

      startFrames(FRAMES_VIC);
    });
  }

  // ── Show / hide ───────────────────────────────────────────────────────────────
  function showWhip() {
    if (locked || isDistracted) return;
    isDistracted = true;

    if (!overlay) overlay = buildOverlay();

    requestAnimationFrame(() => {
      overlay.classList.add('fw-visible');
      startFrames(FRAMES_WHIP);
      setTimeout(doWhipCycle, 600);
    });

    whipTimer = setInterval(doWhipCycle, 2800);
    redTimer  = setInterval(tickRed, 500);
  }

  function hideWhip() {
    if (locked) return; // Cannot escape once locked — restart Chrome
    if (!isDistracted) return;
    isDistracted = false;

    clearInterval(whipTimer);
    clearInterval(redTimer);
    stopFrames();

    if (overlay) {
      overlay.classList.remove('fw-visible');
      overlay.classList.add('fw-hiding');
      setTimeout(() => {
        if (overlay) { overlay.remove(); overlay = null; }
      }, 600);
    }

    redLevel = 0;
  }

  // ── Message listener ──────────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if      (msg.type === 'SHOW_LOCKED') applyLockedScreen();
    else if (msg.type === 'SHOW_WHIP')   showWhip();
    else if (msg.type === 'HIDE_WHIP')   hideWhip();
  });
})();
