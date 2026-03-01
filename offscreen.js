// Offscreen document — handles all audio for TruhFocuser
// Runs in an extension page context so Audio() and DOM are available.

const bgAudio = new Audio(chrome.runtime.getURL('assets/sfx/off1.mp3'));
bgAudio.loop   = true;
bgAudio.volume = 0.5;

const lockAudio = new Audio(chrome.runtime.getURL('assets/sfx/truhm.wav'));
lockAudio.volume = 1.0;

const WHIP_SRCS = [
  chrome.runtime.getURL('assets/sfx/whip1.mp3'),
  chrome.runtime.getURL('assets/sfx/whip2.mp3'),
  chrome.runtime.getURL('assets/sfx/whip3.mp3'),
];

let whipQueue = [];
function getNextWhip() {
  if (!whipQueue.length) {
    whipQueue = [...WHIP_SRCS];
    for (let i = whipQueue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [whipQueue[i], whipQueue[j]] = [whipQueue[j], whipQueue[i]];
    }
  }
  return whipQueue.pop();
}

let sfxPlaying = false;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'START_AUDIO') {
    bgAudio.currentTime = 0;
    bgAudio.play().catch(() => {});
  } else if (msg.type === 'STOP_AUDIO') {
    bgAudio.pause();
    bgAudio.currentTime = 0;
  } else if (msg.type === 'PLAY_WHIP') {
    if (sfxPlaying) return;
    sfxPlaying = true;
    const audio = new Audio(getNextWhip());
    audio.volume = 0.7;
    audio.addEventListener('ended', () => { sfxPlaying = false; }, { once: true });
    audio.play().catch(() => { sfxPlaying = false; });
  } else if (msg.type === 'PLAY_LOCK') {
    bgAudio.pause();
    bgAudio.currentTime = 0;
    lockAudio.currentTime = 0;
    lockAudio.play().catch(() => {});
  }
});
