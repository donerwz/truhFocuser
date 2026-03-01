(function () {
  'use strict';

  if (window.__truhFocuserInjected) return;
  window.__truhFocuserInjected = true;

  let overlay = null;
  let isDistracted = false;
  let locked = false;
  let whipTimer = null;
  let whipTimerDelay = null;
  let redTimer = null;
  let redLevel = 0; // 0.0 – 1.0; when it hits 1.0 the screen locks

  // Check for existing lock on page load
  chrome.storage.local.get('truhFocuserLocked', (data) => {
    if (data.truhFocuserLocked) applyLockedScreen();
  });

  // Frame animation
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

  function startFrames(frames, onFrame2) {
    clearInterval(frameTimer);
    frameIdx = 0;
    const img = overlay && overlay.querySelector('#tf-frame');
    if (!img) return;
    img.src = frames[0];
    frameTimer = setInterval(() => {
      frameIdx = 1 - frameIdx;
      img.src = frames[frameIdx];
      if (frameIdx === 1 && onFrame2) onFrame2();
    }, 1000);
  }

  function stopFrames() {
    clearInterval(frameTimer);
    frameTimer = null;
  }

  // DOM construction
  function buildOverlay() {
    const el = document.createElement('div');
    el.id = 'tf-overlay';
    el.innerHTML = `
      <div id="tf-vignette"></div>
      <div id="tf-flash"></div>
      <div id="tf-scratches"></div>
      <div id="tf-char-wrap">
        <div id="tf-bubble">haha now you have to restart your browser</div>
        <div id="tf-char">
          <img id="tf-frame" src="" alt=""/>
        </div>
      </div>
    `;
    document.documentElement.appendChild(el);
    return el;
  }

  // Scratch lines — dark red slashes that flash on whipfr2
  function flashScratches() {
    if (!overlay) return;
    const container = overlay.querySelector('#tf-scratches');
    if (!container) return;

    container.innerHTML = '';
    const count = 2 + Math.floor(Math.random() * 2); // 2–3 lines
    for (let i = 0; i < count; i++) {
      const el = document.createElement('div');
      el.className = 'tf-scratch';
      el.style.top       = (10 + Math.random() * 70) + '%';
      el.style.left      = (-5 + Math.random() * 15) + '%';
      el.style.width     = (60 + Math.random() * 35) + '%';
      el.style.height    = '50px';
      el.style.transform = `rotate(${-18 + Math.random() * 12}deg)`;
      el.style.opacity   = '1';
      container.appendChild(el);
      // Fade out after one frame so the browser paints at full opacity first
      requestAnimationFrame(() => {
        el.style.transition = 'opacity 0.45s ease-out';
        requestAnimationFrame(() => { el.style.opacity = '0'; });
      });
    }
  }

  // Whip cycle - flash on each crack
  function doWhipCycle() {
    if (!overlay || !isDistracted || locked) return;
    const flash = overlay.querySelector('#tf-flash');
    flash.style.opacity = '0.35';
    setTimeout(() => { if (flash) flash.style.opacity = '0'; }, 80);
  }

  // Red vignette 
  function updateVignette() {
    if (!overlay) return;
    const v = overlay.querySelector('#tf-vignette');
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

  // Lock - permanent full-screen red, survives tab switches
  function lockScreen() {
    locked = true;
    clearTimeout(whipTimerDelay);
    clearInterval(whipTimer);
    clearInterval(redTimer);

    // Persist to session storage and broadcast to all open tabs via background
    // Background will also trigger PLAY_LOCK in the offscreen document
    chrome.storage.local.set({ truhFocuserLocked: true });
    chrome.runtime.sendMessage({ type: 'LOCKED' });

    if (!overlay) overlay = buildOverlay();
    overlay.classList.add('tf-visible', 'tf-locked');

    // Snap vignette to solid red with a short transition
    const v = overlay.querySelector('#tf-vignette');
    if (v) {
      v.style.transition = 'background 0.7s ease';
      v.style.background = 'rgba(140, 0, 0, 0.96)';
    }

    // Switch to victory frames
    startFrames(FRAMES_VIC);
  }

  // Apply locked state on page load (already locked from a previous tab)
  function applyLockedScreen() {
    locked = true;
    isDistracted = true;

    if (!overlay) overlay = buildOverlay();

    requestAnimationFrame(() => {
      overlay.classList.add('tf-visible', 'tf-locked');

      const v = overlay.querySelector('#tf-vignette');
      if (v) v.style.background = 'rgba(140, 0, 0, 0.96)';

      startFrames(FRAMES_VIC);
    });
  }

  // Show / hide
  function showWhip() {
    if (locked || isDistracted) return;
    isDistracted = true;

    if (!overlay) overlay = buildOverlay();

    requestAnimationFrame(() => {
      overlay.classList.add('tf-visible');
      startFrames(FRAMES_WHIP, () => {
        chrome.runtime.sendMessage({ type: 'PLAY_WHIP' }).catch(() => {});
        flashScratches();
      });
      setTimeout(doWhipCycle, 600);
    });

    whipTimerDelay = setTimeout(() => {
      whipTimer = setInterval(doWhipCycle, 2000);
    }, 1000);
    redTimer  = setInterval(tickRed, 500);
  }

  function hideWhip() {
    if (locked) return; // Cannot escape once locked — restart Chrome
    if (!isDistracted) return;
    isDistracted = false;

    clearTimeout(whipTimerDelay);
    clearInterval(whipTimer);
    clearInterval(redTimer);
    stopFrames();

    if (overlay) {
      overlay.classList.remove('tf-visible');
      overlay.classList.add('tf-hiding');
      setTimeout(() => {
        if (overlay) { overlay.remove(); overlay = null; }
      }, 600);
    }

    redLevel = 0;
  }

  // Message listener
  chrome.runtime.onMessage.addListener((msg) => {
    if      (msg.type === 'SHOW_LOCKED') applyLockedScreen();
    else if (msg.type === 'SHOW_WHIP')   showWhip();
    else if (msg.type === 'HIDE_WHIP')   hideWhip();
  });
})();
