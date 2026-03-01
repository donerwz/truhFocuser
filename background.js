const DEFAULT_DISTRACTING = [
  'reddit.com', 'twitter.com', 'x.com', 'youtube.com', 'facebook.com',
  'instagram.com', 'tiktok.com', 'netflix.com', 'twitch.tv', 'hulu.com',
  'discord.com', 'snapchat.com', 'pinterest.com', 'imgur.com', 'twitch.tv', 'espn.com'
];

const DEFAULT_WORK = [
  'github.com', 'stackoverflow.com', 'docs.google.com', 'notion.so',
  'anthropic.com', 'openai.com', 'vscode.dev'
];

// Clear the lock whenever Chrome fully restarts
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.remove('truhFocuserLocked');
  closeOffscreenDocument();
});

// Offscreen document helpers
async function ensureOffscreenDocument() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Play whip sounds and background audio for TruhFocuser'
  });
}

async function closeOffscreenDocument() {
  try {
    if (await chrome.offscreen.hasDocument()) {
      await chrome.offscreen.closeDocument();
    }
  } catch {}
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(['distractingSites', 'workSites'], (data) => {
    if (!data.distractingSites) {
      chrome.storage.sync.set({ distractingSites: DEFAULT_DISTRACTING });
    }
    if (!data.workSites) {
      chrome.storage.sync.set({ workSites: DEFAULT_WORK });
    }
  });
});

function getHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function matchesSite(hostname, siteList) {
  return siteList.some(site => {
    const s = site.replace(/^www\./, '');
    return hostname === s || hostname.endsWith('.' + s);
  });
}

async function checkTab(tabId, url) {
  // If extension is disabled, hide any overlay and bail
  const enabledData = await chrome.storage.sync.get('enabled');
  if (enabledData.enabled === false) {
    chrome.runtime.sendMessage({ type: 'STOP_AUDIO' }).catch(() => {});
    closeOffscreenDocument();
    try { await chrome.tabs.sendMessage(tabId, { type: 'HIDE_WHIP' }); } catch {}
    return;
  }

  // If the screen is fully locked, enforce it on every tab regardless of URL
  const lockData = await chrome.storage.local.get('truhFocuserLocked');
  if (lockData.truhFocuserLocked) {
    try { await chrome.tabs.sendMessage(tabId, { type: 'SHOW_LOCKED' }); } catch {}
    return;
  }

  if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:')) {
    return;
  }

  const hostname = getHostname(url);
  if (!hostname) return;

  const data = await chrome.storage.sync.get(['distractingSites', 'workSites']);
  const distracting = data.distractingSites || DEFAULT_DISTRACTING;
  const isDistracting = matchesSite(hostname, distracting);

  if (isDistracting) {
    await ensureOffscreenDocument();
    chrome.runtime.sendMessage({ type: 'START_AUDIO' }).catch(() => {});
    try { await chrome.tabs.sendMessage(tabId, { type: 'SHOW_WHIP' }); } catch {}
  } else {
    chrome.runtime.sendMessage({ type: 'STOP_AUDIO' }).catch(() => {});
    closeOffscreenDocument();
    try { await chrome.tabs.sendMessage(tabId, { type: 'HIDE_WHIP' }); } catch {}
  }
}

// When any tab locks, immediately push SHOW_LOCKED to every open tab and play lock SFX
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'LOCKED') {
    chrome.runtime.sendMessage({ type: 'PLAY_LOCK' }).catch(() => {});
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:')) return;
        chrome.tabs.sendMessage(tab.id, { type: 'SHOW_LOCKED' }).catch(() => {});
      });
    });
  }
});

chrome.tabs.onRemoved.addListener(async () => {
  const data = await chrome.storage.sync.get('distractingSites');
  const distracting = data.distractingSites || DEFAULT_DISTRACTING;
  const tabs = await chrome.tabs.query({});
  const anyDistracting = tabs.some(tab => {
    const hostname = getHostname(tab.url || '');
    return hostname && matchesSite(hostname, distracting);
  });
  if (!anyDistracting) {
    chrome.runtime.sendMessage({ type: 'STOP_AUDIO' }).catch(() => {});
    closeOffscreenDocument();
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    checkTab(tabId, tab.url);
  } catch {
    // Tab may have been closed
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    checkTab(tabId, tab.url);
  }
});
