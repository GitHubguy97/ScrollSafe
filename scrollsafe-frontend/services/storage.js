(() => {
  const SESSION_KEY = 'sessionStats';
  const HISTORY_KEY = 'videoHistory';

  function storageGet(keys) {
    return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  }

  function storageSet(values) {
    return new Promise((resolve) => chrome.storage.local.set(values, resolve));
  }

  function normalizeVerdict(label) {
    switch ((label || '').toLowerCase()) {
      case 'real':
        return 'verified';
      case 'artificial':
        return 'ai-detected';
      case 'ai-detected':
      case 'verified':
      case 'suspicious':
      case 'unknown':
        return label.toLowerCase();
      default:
        return 'unknown';
    }
  }

  function defaultStats() {
    return {
      checked: 0,
      aiDetected: 0,
      verified: 0,
      suspicious: 0,
      unknown: 0
    };
  }

  async function getCachedResult(videoId) {
    const key = `video_${videoId}`;
    const data = await storageGet([key]);
    return data[key] || null;
  }

  async function cacheVideoResult(videoId, result) {
    const key = `video_${videoId}`;
    await storageSet({ [key]: result });
  }

  async function updateSessionHistory({ videoId, title, channel, result, platform = 'youtube', url, force = false }) {
    const data = await storageGet([SESSION_KEY, HISTORY_KEY]);
    let stats = data[SESSION_KEY] || defaultStats();
    let history = Array.isArray(data[HISTORY_KEY]) ? data[HISTORY_KEY].slice() : [];

    const verdict = normalizeVerdict(result.result);

    if (!force) {
      stats.checked += 1;
      increment(stats, verdict);
    } else {
      const previous = history.find((entry) => entry.videoId === videoId && entry.platform === platform);
      if (previous) {
        decrement(stats, previous.result);
      }
      history = history.filter((entry) => !(entry.videoId === videoId && entry.platform === platform));
      increment(stats, verdict);
    }

    const resolvedUrl = url || buildPlatformUrl(platform, videoId);
    const entry = {
      videoId,
      title,
      channel,
      platform,
      url: resolvedUrl,
      result: verdict,
      confidence: result.confidence,
      reason: result.reason,
      timestamp: Date.now()
    };

    history.unshift(entry);
    const seen = new Set();
    history = history.filter((item) => {
      const key = `${item.platform || 'youtube'}:${item.videoId}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
    if (history.length > 5) {
      history = history.slice(0, 5);
    }

    await storageSet({
      [SESSION_KEY]: stats,
      [HISTORY_KEY]: history
    });
  }

  function increment(stats, result) {
    const verdict = normalizeVerdict(result);
    switch (verdict) {
      case 'ai-detected':
        stats.aiDetected += 1;
        break;
      case 'verified':
        stats.verified += 1;
        break;
      case 'suspicious':
        stats.suspicious += 1;
        break;
      default:
        stats.unknown += 1;
        break;
    }
  }

  function decrement(stats, result) {
    const verdict = normalizeVerdict(result);
    switch (verdict) {
      case 'ai-detected':
        stats.aiDetected = Math.max(0, stats.aiDetected - 1);
        break;
      case 'verified':
        stats.verified = Math.max(0, stats.verified - 1);
        break;
      case 'suspicious':
        stats.suspicious = Math.max(0, stats.suspicious - 1);
        break;
      default:
        stats.unknown = Math.max(0, stats.unknown - 1);
        break;
    }
  }

  window.ScrollSafe = window.ScrollSafe || {};
  window.ScrollSafe.storage = {
    getCachedResult,
    cacheVideoResult,
    updateSessionHistory
  };

  function buildPlatformUrl(platform, videoId) {
    if (!videoId) return null;
    switch ((platform || '').toLowerCase()) {
      case 'tiktok':
        return `https://www.tiktok.com/@_/video/${videoId}`;
      case 'instagram':
        return `https://www.instagram.com/reel/${videoId}`;
      default:
        return `https://www.youtube.com/shorts/${videoId}`;
    }
  }
})();
