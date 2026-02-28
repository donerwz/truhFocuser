const DEFAULT_DISTRACTING = [
  'reddit.com', 'twitter.com', 'x.com', 'youtube.com', 'facebook.com',
  'instagram.com', 'tiktok.com', 'netflix.com', 'twitch.tv', 'hulu.com',
  'discord.com', 'snapchat.com', 'pinterest.com', 'tumblr.com',
  'buzzfeed.com', '9gag.com', 'imgur.com', 'twitch.tv', 'espn.com'
];

const DEFAULT_WORK = [
  'github.com', 'stackoverflow.com', 'docs.google.com', 'notion.so',
  'linear.app', 'atlassian.com', 'figma.com', 'vercel.com', 'localhost',
  'anthropic.com', 'openai.com', 'cursor.sh', 'vscode.dev'
];

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
  // If the screen is fully locked, enforce it on every tab regardless of URL
  const lockData = await chrome.storage.session.get('focusWhipLocked');
  if (lockData.focusWhipLocked) {
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

  try {
    await chrome.tabs.sendMessage(tabId, {
      type: isDistracting ? 'SHOW_WHIP' : 'HIDE_WHIP'
    });
  } catch {
    // Content script not yet injected — ignore
  }
}

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    checkTab(tabId, tab.url);
  } catch {
    // Tab may have been closed
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) {
    checkTab(tabId, tab.url);
  }
});
