(() => {
  const PLATFORM_ID = 'tiktok';
  const ACTION_CONTAINER_SELECTOR = 'section[class*="SectionActionBarContainer"]';
  const VIDEO_CARD_SELECTOR = 'article[data-e2e="recommend-list-item-container"]';
  const hookedVideos = new WeakSet();
  let feedObserverAttached = false;

  function match() {
    return location.hostname.includes('tiktok.com');
  }

  function detectCandidate() {
    attachFeedObserver();
    attachVideoListeners();

    const card = getActiveCard();
    if (!card) return null;

    const video = card.querySelector('video');
    if (!video) return null;

    const wrapper = card.querySelector('div.xgplayer-container[id^="xgwrapper-"]');
    const wrapperId = wrapper?.id || '';
    const parts = wrapperId.split('-');
    const videoId = parts.length ? parts[parts.length - 1] : null;

    const actionContainer = card.querySelector(ACTION_CONTAINER_SELECTOR) || document.querySelector(ACTION_CONTAINER_SELECTOR);
    const titleNode = card.querySelector('[data-e2e="video-desc"]');
    const authorNode = card.querySelector('[data-e2e="video-author-uniqueid"]');

    const username = authorNode?.textContent?.trim() || 'Unknown Creator';
    const description = titleNode?.textContent?.trim() || '';

    const url = buildCanonicalUrl({ username, videoId }) || window.location.href;

    monitorCard(card);
    return {
      platform: PLATFORM_ID,
      renderer: card,
      videoId,
      title: description || `@${username}`,
      channel: username,
      mount: actionContainer || card,
      url,
      placement: 'tiktok',
      metadata: {
        title: description,
        channel: username,
      },
    };
  }

  function buildCanonicalUrl({ username, videoId }) {
    if (!username || !videoId) return null;
    const clean = username.replace(/^@/, '');
    return `https://www.tiktok.com/@${clean}/video/${videoId}`;
  }

  function attachFeedObserver() {
    if (feedObserverAttached) return;
    const feed = document.querySelector('div[data-e2e="scroll-list"]') || document.body;
    const observer = new MutationObserver(() => {
      attachVideoListeners();
    });
    observer.observe(feed, { childList: true, subtree: true });
    feedObserverAttached = true;
  }

  function attachVideoListeners() {
    const videos = document.querySelectorAll(`${VIDEO_CARD_SELECTOR} video`);
    const pipelineDetect = window.ScrollSafe?.pipelineDetect;

    videos.forEach((video) => {
      if (hookedVideos.has(video)) {
        return;
      }
      hookedVideos.add(video);
      video.addEventListener('play', () => {
        if (typeof pipelineDetect === 'function') {
          pipelineDetect();
        }
      });
      video.addEventListener('loadedmetadata', () => {
        if (typeof pipelineDetect === 'function') {
          pipelineDetect();
        }
      });
    });
  }

  function getActiveCard() {
    const cards = Array.from(document.querySelectorAll(VIDEO_CARD_SELECTOR));
    if (!cards.length) return null;

    for (const card of cards) {
      const video = card.querySelector('video');
      if (video && !video.paused && !video.ended && video.readyState >= 2) {
        return card;
      }
    }

    const viewportCenter = window.innerHeight / 2;
    let bestCard = null;
    let bestDistance = Infinity;
    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      const cardCenter = rect.top + rect.height / 2;
      const distance = Math.abs(cardCenter - viewportCenter);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestCard = card;
      }
    }
    return bestCard;
  }

  function monitorCard(card) {
    if (!card) return;

    const pipelineDetect = window.ScrollSafe?.pipelineDetect;

    if (!card.dataset.scrollsafeTikTokObserved) {
      const observer = new MutationObserver(() => {
        if (typeof pipelineDetect === 'function') {
          pipelineDetect();
        }
      });
      observer.observe(card, { childList: true, subtree: true });
      card.dataset.scrollsafeTikTokObserved = '1';
    }

    const video = card.querySelector('video');
    if (video && !hookedVideos.has(video)) {
      hookedVideos.add(video);
      video.addEventListener('play', () => {
        if (typeof pipelineDetect === 'function') {
          pipelineDetect();
        }
      });
    }

    const actionContainer = card.querySelector(ACTION_CONTAINER_SELECTOR);
    if (actionContainer && !actionContainer.dataset.scrollsafeTikTokObserved) {
      const observer = new MutationObserver(() => {
        if (typeof pipelineDetect === 'function') {
          pipelineDetect();
        }
      });
      observer.observe(actionContainer, { childList: true, subtree: true });
      actionContainer.dataset.scrollsafeTikTokObserved = '1';
    }
  }

  window.ScrollSafe = window.ScrollSafe || {};
  window.ScrollSafe.adapters = window.ScrollSafe.adapters || [];
  window.ScrollSafe.adapters.push({
    id: PLATFORM_ID,
    match,
    detectCandidate
  });
})();
