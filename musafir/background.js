let state = {
  isActive: false,
  endTime: null,
  profiles: {
    strict: { categories: ['adult'], custom: [], regex: ['.*\\.porn.*', '.*\\.xxx.*', '.*\\.adult.*', '.*\\.camshow.*'] },
    moderate: { categories: ['adult'], custom: [], regex: [] },
    custom: { categories: ['adult'], custom: [], regex: [] }
  },
  activeProfile: 'strict',
  haramKeywords: {
    adult: [
      'porn', 'xxx', 'porno', 'xvideos', 'pornhub', 'onlyfans', 'nsfw', 'hentai', 'chaturbate', 'adultfriendfinder', 'playboy', 'bangbros', 'redtube', 'youporn', 'xhamster', 'xnxx', 'tnaflix',
      'brazzers', 'realitykings', 'orgy', 'threesome', 'prostitute', 'escortservice', 'stripclub', 'fetishsite', 'livejasmin', 'webcamsex', 'adultfilm', 'x-rated', 'explicitvideo', 'uncensoredporn',
      'hardcoreporn', 'softcoreporn', 'adultactress', 'adultactor', 'pornstar', 'adultstudio', 'adultproduction', 'adultchannel', 'adultstream', 'adultforum', 'adultcommunity', 'adultnetwork',
      'toplessvideo', 'nudevideo', 'sexvideo', 'eroticvideo', 'adultlive', 'adultshow', 'adultmodel', 'adultphoto', 'adultimage', 'adultclip', 'adultscene', 'adultwebsite', 'adultlink', 'adultpage',
      'adultgallery', 'adultpic', 'camgirl', 'camshow', 'livecamsex', 'privatecam', 'sexchat', 'cybersexchat', 'adultchatroom', 'sextingapp', 'adultgame', 'eroticgame', 'seductionvideo',
      'intimatemovie', 'lustfilm', 'arousalvideo', 'orgasmvideo', 'ejaculationvideo', 'condomvideo', 'dildovideo', 'vibratorvideo', 'bondagevideo', 'bdsmvideo', 'dominationvideo', 'submissionvideo',
      'spankingvideo', 'voyeurvideo', 'exhibitionvideo', 'cuckoldvideo', 'milfvideo', 'teenporn', 'amateurporn', 'professionalporn', 'stripteasevideo', 'lapdancevideo', 'massagevideo', 'sensualvideo',
      'adultcontent', 'adultentertainment', 'adultindustry', 'adultservices', 'adultmedia', 'adultchannel', 'adultstream', 'adultforum', 'adultcommunity', 'adultnetwork', 'topless', 'nude', 'exposed',
      'genitalia', 'copulation', 'intercourse', 'fellatio', 'cunnilingus', 'pornography', 'adultphoto', 'adultimage', 'adultclip', 'adultscene', 'adultshow', 'adultlive', 'adultmodel', 'adultstar'
    ]
  }
};

async function initialize() {
  const data = await chrome.storage.local.get(['isActive', 'endTime', 'activeProfile', 'customProfiles']);
  state.isActive = data.isActive || false;
  state.endTime = data.endTime || null;
  state.activeProfile = data.activeProfile || 'strict';
  if (data.customProfiles) state.profiles.custom = data.customProfiles;
  if (state.isActive && state.endTime > Date.now()) {
    enforceTimer(); 
  }
  await updateDeclarativeRules();
}

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (!state.isActive) return;
  try {
    const url = new URL(details.url);
    const profile = state.profiles[state.activeProfile];
    const keywords = state.haramKeywords.adult.concat(profile.custom || []);
    const regexPatterns = profile.regex.map(pattern => new RegExp(pattern));
    const isHaram = keywords.some(k => url.hostname.includes(k) || url.pathname.includes(k)) || regexPatterns.some(r => r.test(url.href));
    if (isHaram) {
      chrome.tabs.update(details.tabId, { url: chrome.runtime.getURL('blocked.html') });
      logAttempt(details.url);
    }
  } catch (e) {
    console.error('Navigation error:', e);
  }
}, { url: [{ urlMatches: '<all_urls>' }] });

async function updateDeclarativeRules() {
  const profile = state.profiles[state.activeProfile];
  const keywords = state.haramKeywords.adult.concat(profile.custom || []);
  const rules = keywords.map((keyword, index) => ({
    id: index + 1,
    priority: 1,
    action: { type: 'redirect', redirect: { extensionPath: '/blocked.html' } },
    condition: { urlFilter: `*${keyword}*`, resourceTypes: ['main_frame'] }
  }));
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: Array.from({ length: 1000 }, (_, i) => i + 1),
      addRules: rules.slice(0, 1000)
    });
  } catch (e) {
    console.error('Rule update error:', e);
  }
}

if (chrome.contextMenus) {
  chrome.contextMenus.create({ id: 'blockSite', title: 'Block Site', contexts: ['page'] }, () => {
    if (chrome.runtime.lastError) {
      console.error('Context menu creation failed:', chrome.runtime.lastError.message);
    }
  });
  chrome.contextMenus.onClicked.addListener((info) => {
    const url = new URL(info.pageUrl).hostname;
    if (!state.profiles[state.activeProfile].custom.includes(url)) {
      state.profiles[state.activeProfile].custom.push(url);
      chrome.storage.local.set({ customProfiles: state.profiles[state.activeProfile] });
      updateDeclarativeRules();
      notify('Blocked', `${url} added to custom blocks.`);
    }
  });
}

chrome.alarms.create('checkState', { periodInMinutes: 0.25 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkState' && state.isActive && state.endTime > Date.now()) {
    chrome.runtime.reload();
    chrome.tabs.query({}, (tabs) => tabs.forEach(tab => chrome.tabs.reload(tab.id)));
  }
});
chrome.management.onDisabled.addListener(() => {
  if (state.isActive && state.endTime > Date.now()) {
    notify('Alert', 'Musafir is active and cannot be disabled until ' + new Date(state.endTime).toLocaleString());
    chrome.management.setEnabled(chrome.runtime.id, true);
  }
});

function logAttempt(url) {
  chrome.storage.local.get('blockLog', (data) => {
    const log = data.blockLog || [];
    log.push({ url, time: new Date().toISOString() });
    chrome.storage.local.set({ blockLog: log });
    notify('Blocked', `${url} intercepted.`);
  });
}

function enforceTimer() {
  if (!state.isActive || !state.endTime) return;
  const now = Date.now();
  if (now >= state.endTime) {
    state.isActive = false;
    state.endTime = null;
    chrome.storage.local.set({ isActive: false, endTime: null });
    notify('Unlocked', 'Protection period complete.');
  } else {
    setTimeout(enforceTimer, 1000);
  }
}

function formatTime(ms) {
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${days}d ${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function notify(title, message) {
  if (chrome.notifications) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: title,
      message: message
    });
  }
}

async function notifyPopup() {
  try {
    await chrome.runtime.sendMessage({ action: 'updateState', isActive: state.isActive, endTime: state.endTime });
  } catch (e) {
    console.warn('Failed to notify popup:', e.message); 
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'startTimer') {
    if (!state.isActive) {
      state.isActive = true;
      state.endTime = Date.now() + msg.duration;
      chrome.storage.local.set({ isActive: true, endTime: state.endTime });
      enforceTimer();
      updateDeclarativeRules().then(() => sendResponse({ success: true }));
      notifyPopup();
    } else {
      sendResponse({ success: false, message: 'Already active until ' + new Date(state.endTime).toLocaleString() });
    }
  } else if (msg.action === 'getState') {
    sendResponse({ isActive: state.isActive, endTime: state.endTime });
  }
  return true;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.isActive || changes.endTime)) {
    chrome.storage.local.get(['isActive', 'endTime'], (data) => {
      state.isActive = data.isActive || false;
      state.endTime = data.endTime || null;
      if (state.isActive && state.endTime > Date.now()) {
        enforceTimer(); 
      }
      notifyPopup();
    });
  }
});

chrome.runtime.onInstalled.addListener(() => {
  initialize();
});
chrome.runtime.onStartup.addListener(() => {
  initialize();
});