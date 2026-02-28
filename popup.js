'use strict';

let distractingSites = [];
let workSites = [];
let currentHostname = '';

// ── Helpers ───────────────────────────────────────────────────────────────────

function cleanHostname(raw) {
  return raw.trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0];
}

function renderList(listId, sites, storageKey) {
  const el = document.getElementById(listId);
  if (!sites.length) {
    el.innerHTML = '<div class="empty-hint">None added yet.</div>';
    return;
  }

  el.innerHTML = '';
  sites.forEach((site, i) => {
    const item = document.createElement('div');
    item.className = 'site-item';
    item.innerHTML = `<span>${site}</span><button class="remove-btn" title="Remove">×</button>`;
    item.querySelector('.remove-btn').addEventListener('click', () => {
      sites.splice(i, 1);
      chrome.storage.sync.set({ [storageKey]: [...sites] });
      renderList(listId, sites, storageKey);
    });
    el.appendChild(item);
  });
}

function addSite(inputId, sites, storageKey, listId) {
  const input = document.getElementById(inputId);
  const val = cleanHostname(input.value);
  if (!val || sites.includes(val)) { input.value = ''; return; }
  sites.push(val);
  chrome.storage.sync.set({ [storageKey]: [...sites] });
  renderList(listId, sites, storageKey);
  input.value = '';
}

// ── Load data ─────────────────────────────────────────────────────────────────

chrome.storage.sync.get(['distractingSites', 'workSites'], (data) => {
  distractingSites = data.distractingSites || [];
  workSites        = data.workSites || [];
  renderList('distract-list', distractingSites, 'distractingSites');
  renderList('work-list',     workSites,        'workSites');
});

// ── Current tab ───────────────────────────────────────────────────────────────

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (!tabs[0] || !tabs[0].url) return;
  try {
    currentHostname = new URL(tabs[0].url).hostname.replace(/^www\./, '');
    document.getElementById('current-hostname').textContent = currentHostname || '—';
  } catch {
    document.getElementById('current-site-box').style.display = 'none';
  }
});

document.getElementById('btn-distract').addEventListener('click', () => {
  if (!currentHostname || distractingSites.includes(currentHostname)) return;
  distractingSites.push(currentHostname);
  chrome.storage.sync.set({ distractingSites: [...distractingSites] });
  renderList('distract-list', distractingSites, 'distractingSites');
});

document.getElementById('btn-work').addEventListener('click', () => {
  if (!currentHostname || workSites.includes(currentHostname)) return;
  workSites.push(currentHostname);
  chrome.storage.sync.set({ workSites: [...workSites] });
  renderList('work-list', workSites, 'workSites');
});

// ── Add buttons / enter key ───────────────────────────────────────────────────

document.getElementById('distract-add').addEventListener('click', () =>
  addSite('distract-input', distractingSites, 'distractingSites', 'distract-list'));

document.getElementById('distract-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addSite('distract-input', distractingSites, 'distractingSites', 'distract-list');
});

document.getElementById('work-add').addEventListener('click', () =>
  addSite('work-input', workSites, 'workSites', 'work-list'));

document.getElementById('work-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addSite('work-input', workSites, 'workSites', 'work-list');
});
