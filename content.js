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

  const TAUNTS = [
    'GET BACK TO WORK!',
    'No slacking, human!',
    'I see you...',
    'Focus. NOW.',
    "*CRACK*",
    'Productivity or PAIN.',
    'Stop wasting time!',
    'Back to work!',
    'You disappoint me.',
    '..really?',
  ];
  let tauntIdx = 0;

  // ── Check for existing lock on page load ─────────────────────────────────────
  chrome.storage.session.get('focusWhipLocked', (data) => {
    if (data.focusWhipLocked) applyLockedScreen();
  });

  // ── Character SVG ────────────────────────────────────────────────────────────
  const CHARACTER_SVG = `
<svg id="fw-svg" viewBox="0 0 200 280" xmlns="http://www.w3.org/2000/svg" overflow="visible">
  <ellipse cx="105" cy="274" rx="38" ry="9" fill="rgba(0,0,0,0.25)"/>
  <path d="M 130 200 Q 170 230 160 260 Q 150 280 140 265" stroke="#6a0000" stroke-width="8" fill="none" stroke-linecap="round"/>
  <polygon points="140,265 148,278 132,270" fill="#6a0000"/>
  <ellipse cx="105" cy="185" rx="42" ry="52" fill="#990000"/>
  <path d="M 147 165 Q 165 155 172 145" stroke="#7a0000" stroke-width="14" fill="none" stroke-linecap="round"/>
  <ellipse cx="172" cy="143" rx="10" ry="10" fill="#7a0000"/>
  <rect x="80"  y="228" width="24" height="36" rx="8" fill="#7a0000"/>
  <rect x="108" y="228" width="24" height="36" rx="8" fill="#7a0000"/>
  <ellipse cx="92"  cy="265" rx="16" ry="9" fill="#5a0000"/>
  <ellipse cx="120" cy="265" rx="16" ry="9" fill="#5a0000"/>
  <circle cx="95" cy="90" r="46" fill="#cc0000"/>
  <path d="M 72 55 Q 55 18 65 8 Q 68 38 80 50" fill="#5a0000"/>
  <path d="M 118 55 Q 135 18 125 8 Q 122 38 110 50" fill="#5a0000"/>
  <ellipse cx="78" cy="88" rx="11" ry="13" fill="#ffe000"/>
  <ellipse cx="112" cy="90" rx="10" ry="12" fill="#ffe000"/>
  <ellipse cx="80"  cy="91" rx="6"  ry="7"  fill="#111"/>
  <ellipse cx="113" cy="93" rx="5"  ry="6"  fill="#111"/>
  <circle cx="77" cy="87" r="3" fill="white"/>
  <circle cx="111" cy="88" r="2.5" fill="white"/>
  <path d="M 62 72 L 90 80" stroke="#5a0000" stroke-width="5" stroke-linecap="round"/>
  <path d="M 124 73 L 100 80" stroke="#5a0000" stroke-width="5" stroke-linecap="round"/>
  <path d="M 72 108 Q 95 122 118 108" fill="#5a0000" stroke="#5a0000" stroke-width="1"/>
  <polygon points="80,108 85,120 90,108"  fill="white"/>
  <polygon points="97,108 102,122 107,108" fill="white"/>
  <g id="fw-arm">
    <path d="M 63 155 Q 40 148 22 138" stroke="#7a0000" stroke-width="14" fill="none" stroke-linecap="round"/>
    <ellipse cx="20" cy="136" rx="12" ry="11" fill="#7a0000"/>
    <rect x="6" y="130" width="16" height="5" rx="2" fill="#2c1a0e" transform="rotate(-15,14,132)"/>
    <g id="fw-whip">
      <path id="fw-whip-rope"
            d="M 6 128 Q -30 115 -55 125 Q -80 135 -90 128"
            stroke="#3b2010" stroke-width="3.5" fill="none"
            stroke-linecap="round" stroke-linejoin="round"/>
      <circle id="fw-whip-tip" cx="-90" cy="128" r="5" fill="#1a0a00"/>
    </g>
  </g>
</svg>`;

  // ── Video support ─────────────────────────────────────────────────────────────
  // Drop your video files into the assets/ folder next to this extension.
  // Expected filenames:
  //   assets/whipping.mp4  — plays while on a distracting site (looped)
  //   assets/locked.mp4    — plays after the screen locks (looped)
  // If a file is missing the extension falls back to the SVG demon.
  const VIDEO_WHIP   = chrome.runtime.getURL('assets/whipping.mp4');
  const VIDEO_LOCKED = chrome.runtime.getURL('assets/locked.mp4');

  function initVideo(el) {
    const video = el.querySelector('#fw-video');

    video.src = VIDEO_WHIP;

    video.addEventListener('loadeddata', () => {
      // Video file exists and decoded — switch to video mode
      el.classList.add('fw-video-mode');
    }, { once: true });

    video.addEventListener('error', () => {
      // No video provided — keep SVG fallback visible
      video.removeAttribute('src');
    }, { once: true });
  }

  function switchVideo(src) {
    if (!overlay || !overlay.classList.contains('fw-video-mode')) return;
    const video = overlay.querySelector('#fw-video');
    if (!video) return;
    video.src = src;
    video.load();
    video.play().catch(() => {
      // File not found — fall back to whipping video
      video.src = VIDEO_WHIP;
      video.load();
      video.play().catch(() => {});
    });
  }

  // ── DOM construction ──────────────────────────────────────────────────────────
  function buildOverlay() {
    const el = document.createElement('div');
    el.id = 'fw-overlay';
    el.innerHTML = `
      <div id="fw-vignette"></div>
      <div id="fw-flash"></div>
      <div id="fw-char-wrap">
        <div id="fw-bubble"></div>
        <div id="fw-char">
          <video id="fw-video" autoplay loop muted playsinline></video>
          <div id="fw-svg-fallback">${CHARACTER_SVG}</div>
        </div>
      </div>
    `;
    document.documentElement.appendChild(el);
    initVideo(el);
    return el;
  }

  // ── Whip animation ────────────────────────────────────────────────────────────
  const ROPE_REST   = 'M 6 128 Q -30 115 -55 125 Q -80 135 -90 128';
  const ROPE_RAISED = 'M 6 128 Q -10  80 -30  50 Q -50  20 -65  30';
  const ROPE_CRACK  = 'M 6 128 Q -20 150 -55 165 Q -80 175 -90 170';

  function doWhipCycle() {
    if (!overlay || !isDistracted || locked) return;

    const arm    = overlay.querySelector('#fw-arm');
    const rope   = overlay.querySelector('#fw-whip-rope');
    const tip    = overlay.querySelector('#fw-whip-tip');
    const flash  = overlay.querySelector('#fw-flash');
    const bubble = overlay.querySelector('#fw-bubble');

    arm.classList.remove('fw-arm-crack');
    arm.classList.add('fw-arm-raise');
    rope.setAttribute('d', ROPE_RAISED);
    tip.setAttribute('cx', '-65');
    tip.setAttribute('cy', '30');

    setTimeout(() => {
      if (!overlay || !isDistracted || locked) return;

      arm.classList.remove('fw-arm-raise');
      arm.classList.add('fw-arm-crack');
      rope.setAttribute('d', ROPE_CRACK);
      tip.setAttribute('cx', '-90');
      tip.setAttribute('cy', '170');

      flash.style.opacity = '0.35';
      setTimeout(() => { if (flash) flash.style.opacity = '0'; }, 80);

      if (tauntIdx % 2 === 0) {
        const text = TAUNTS[Math.floor(Math.random() * TAUNTS.length)];
        bubble.textContent = text;
        bubble.classList.add('fw-show');
        setTimeout(() => bubble.classList.remove('fw-show'), 2200);
      }
      tauntIdx++;

      setTimeout(() => {
        if (!overlay || !isDistracted || locked) return;
        arm.classList.remove('fw-arm-crack');
        rope.setAttribute('d', ROPE_REST);
        tip.setAttribute('cx', '-90');
        tip.setAttribute('cy', '128');
      }, 250);

    }, 550);
  }

  // ── Red vignette ──────────────────────────────────────────────────────────────
  // The transparent hole shrinks from the center outward as redLevel rises.
  // At redLevel = 1.0 the hole is gone and the screen is fully covered → lock.
  function updateVignette() {
    if (!overlay) return;
    const v = overlay.querySelector('#fw-vignette');
    const t = Math.min(redLevel, 1.0);

    // Hole inner radius: starts at 65% of screen, closes to 0% at redLevel=1
    const holeRadius  = 65 * (1 - t);
    // Red opacity at the edges: 0.2 → 0.85
    const edgeOpacity = (0.2 + t * 0.65).toFixed(3);

    if (holeRadius <= 0) {
      // Hole fully closed — solid cover, no gradient needed
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

    // Persist to local storage — background script reads this on every tab change
    chrome.storage.session.set({ focusWhipLocked: true });

    if (!overlay) overlay = buildOverlay();
    overlay.classList.add('fw-visible', 'fw-locked');

    // Snap vignette to solid red with a short transition
    const v = overlay.querySelector('#fw-vignette');
    if (v) {
      v.style.transition = 'background 0.7s ease';
      v.style.background = 'rgba(140, 0, 0, 0.96)';
    }

    // Switch to locked video (falls back to whipping video if not provided)
    switchVideo(VIDEO_LOCKED);

    // Permanent taunting bubble
    const bubble = overlay.querySelector('#fw-bubble');
    if (bubble) {
      bubble.textContent = 'HAHAHA! Restart Chrome to escape. \uD83D\uDE08';
      bubble.classList.add('fw-show', 'fw-bubble-permanent');
    }
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

      // Switch to locked video (falls back to whipping video if not provided)
      switchVideo(VIDEO_LOCKED);

      const bubble = overlay.querySelector('#fw-bubble');
      if (bubble) {
        bubble.textContent = 'HAHAHA! Restart Chrome to escape. \uD83D\uDE08';
        bubble.classList.add('fw-show', 'fw-bubble-permanent');
      }
    });
  }

  // ── Show / hide ───────────────────────────────────────────────────────────────
  function showWhip() {
    if (locked || isDistracted) return;
    isDistracted = true;

    if (!overlay) overlay = buildOverlay();

    requestAnimationFrame(() => {
      overlay.classList.add('fw-visible');
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

    if (overlay) {
      overlay.classList.remove('fw-visible');
      overlay.classList.add('fw-hiding');
      setTimeout(() => {
        if (overlay) { overlay.remove(); overlay = null; }
      }, 600);
    }

    // Reset red level — user escaped in time
    redLevel = 0;
    tauntIdx = 0;
  }

  // ── Message listener ──────────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if      (msg.type === 'SHOW_LOCKED') applyLockedScreen();
    else if (msg.type === 'SHOW_WHIP')   showWhip();
    else if (msg.type === 'HIDE_WHIP')   hideWhip();
  });
})();
