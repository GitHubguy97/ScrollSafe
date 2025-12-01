(() => {
  const PLATFORM_ID = 'instagram';
  const OVERLAY_HOST_ID = 'scrollsafe-instagram-overlay';
  const OVERLAY_WIDTH_ESTIMATE = 160;
  const OVERLAY_HEIGHT_OFFSET = 16;
  const OVERLAY_WIDTH_OFFSET = 16;
  const ACTION_CONTAINER_SELECTOR =
    'div.html-div.xdj266r.x14z9mp.xexx8yu.xyri2b.x18d9i69.x1c1uobl.x9f619.xjbqb8w.x78zum5.x15mokao.x1ga7v0g.x16uus16.xbiv7yw.x12nagc.x1uhb9sk.x1plvlek.xryxfnj.x1c4vz4f.x2lah0s.xdt5ytf.xqjyukv.x6s0dn4.x1oa3qoh.x13a6bvl.x1diwwjn.x1247r65';
  const REEL_PATH_REGEX = /^\/reels?\/[A-Za-z0-9_\-]+\/?$/i;
  const OPV_PATH_REGEX = /^\/p\/[A-Za-z0-9_\-]+\/?$/i; // Open-Post View
  const REEL_CARD_SELECTOR =
    'div.x1qjc9v5.x9f619.x78zum5.xg7h5cd.x1mfogq2.xsfy40s.x1bhewko.xgv127d.xh8yej3.xl56j7k';
  const REEL_AUTHOR_SELECTOR = 'a[aria-label$=" reels"] span[dir="auto"]';
  const REEL_CAPTION_SELECTOR =
    'div.x1g9anri[dir="auto"] span.xuxw1ft, div.x1g9anri span.xuxw1ft';
  const URL_POLL_INTERVAL_MS = 400;

  let overlayHost = null;
  let overlayMount = null;
  let overlayTrackingStarted = false;
  let overlayCurrentVideoId = null;
  let historyListenersInstalled = false;
  let currentPathname = location.pathname;
  let urlPollTimer = null;

  function match() {
    const result = location.hostname.includes('instagram.com');
    console.debug('[ScrollSafe][Instagram] match?', result, location.hostname);
    return result;
  }

  function shouldDisplayBadge(currentVideo, actionContainer) {
    if (!matchesEligiblePath()) return false;
    // On eligible paths, prefer video presence over action container
    if (currentVideo) return true;

    // For OPV posts (/p/{id}), be lenient - check if we can extract videoId from URL
    if (OPV_PATH_REGEX.test(location.pathname)) {
      const videoId = extractShortcodeFromPath();
      if (videoId) {
        console.debug('[ScrollSafe][Instagram] OPV path detected with videoId, showing badge');
        return true;  // Show badge for OPV if we can extract videoId from URL
      }
    }

    // Fall back to action container only if no video (for Reels)
    const container = actionContainer || getActionContainer();
    if (!container) return false;
    const rect = container.getBoundingClientRect();
    return rect && rect.width > 0 && rect.height > 0;
  }

  function matchesEligiblePath() {
    if (REEL_PATH_REGEX.test(location.pathname)) return true;
    if (OPV_PATH_REGEX.test(location.pathname)) return true;
    return false;
  }

  function getActionContainer() {
    return document.querySelector(ACTION_CONTAINER_SELECTOR);
  }

  function extractShortcodeFromPath() {
    let match = location.pathname.match(/\/reel\/([^/?#]+)/);
    if (match) return match[1];

    match = location.pathname.match(/\/reels\/([^/?#]+)/);
    if (match) return match[1];

    match = location.pathname.match(/\/p\/([^/?#]+)/);
    if (match) return match[1];

    const metaUrl = document.querySelector('meta[property="og:url"]')?.content;
    if (metaUrl) {
      const metaMatch =
        metaUrl.match(/\/(?:reels?|p)\/([^/?#]+)/);
      if (metaMatch) return metaMatch[1];
    }
    return null;
  }

  function extractShortcodeFromArticle(root) {
    if (!root) return null;
    const anchor =
      root.querySelector('a[href*="/reel/"], a[href*="/reels/"], a[href*="/p/"]');
    const href = anchor?.getAttribute('href');
    if (!href) return null;
    const match = href.match(/\/(?:reels?|p)\/([^/?#]+)/);
    return match ? match[1] : null;
  }

  function extractTitle(root = document) {
    const isPostLayout = OPV_PATH_REGEX.test(location.pathname);
    const isReelLayout = REEL_PATH_REGEX.test(location.pathname);
    const context = root || document;

    if (isPostLayout) {
      const captionHeading = context.querySelector('h1._ap3a');
      if (captionHeading?.textContent?.trim()) {
        return captionHeading.textContent.trim();
      }
      const captionSpan = context.querySelector('[data-testid="caption"]');
      if (captionSpan?.textContent?.trim()) {
        return captionSpan.textContent.trim();
      }
    }

    if (isReelLayout) {
      const captionNode = context.querySelector(REEL_CAPTION_SELECTOR);
      if (captionNode?.textContent?.trim()) {
        return captionNode.textContent.trim();
      }

      // For reels, avoid falling back to global metadata which often stays stuck on the first reel.
      return 'Instagram';
    }

    const metaTitle = document.querySelector('meta[property="og:title"]')?.content;
    if (metaTitle?.trim()) {
      return metaTitle.trim();
    }

    const docTitle = document.title?.trim();
    return docTitle || 'Instagram';
  }

  function extractChannel(root = document) {
    const isPostLayout = OPV_PATH_REGEX.test(location.pathname);
    const isReelLayout = REEL_PATH_REGEX.test(location.pathname);
    const context = root || document;

    if (isPostLayout) {
      const headerLink = context.querySelector('header._aaqw a[role="link"][href^="/"] span[dir="auto"]');
      if (headerLink?.textContent?.trim()) {
        return headerLink.textContent.trim();
      }
      const headerAlt = context.querySelector('header._aaqw img[alt$="profile picture"]');
      if (headerAlt?.alt) {
        const altMatch = headerAlt.alt.replace(/'s profile picture$/i, '').trim();
        if (altMatch) return altMatch;
      }
    } else if (isReelLayout) {
      const reelHandle = context.querySelector(REEL_AUTHOR_SELECTOR);
      if (reelHandle?.textContent?.trim()) {
        return reelHandle.textContent.trim();
      }

      // Same reasoning as titles: avoid global fallbacks for reels.
      return 'Instagram';
    }

    const metaTitle = document.querySelector('meta[property="og:title"]')?.content;
    if (metaTitle?.trim()) {
      const match = metaTitle.match(/^([^:]+):/);
      if (match) return match[1].trim();
    }

    const docTitle = document.title?.trim();
    if (docTitle) {
      const match = docTitle.match(/^([^:]+)\s*\(@/);
      if (match) return match[1].trim();
    }

    return 'Instagram';
  }

  function ensureOverlayMount() {
    if (overlayMount) return overlayMount;

    overlayHost = document.getElementById(OVERLAY_HOST_ID);
    if (!overlayHost) {
      overlayHost = document.createElement('div');
      overlayHost.id = OVERLAY_HOST_ID;
      Object.assign(overlayHost.style, {
        position: 'fixed',
        top: '0px',
        left: '0px',
        zIndex: '2147483647',
        pointerEvents: 'none',
        width: `${OVERLAY_WIDTH_ESTIMATE}px`,
      });
      overlayMount = document.createElement('div');
      overlayMount.style.pointerEvents = 'auto';
      overlayMount.style.display = 'inline-flex';
      overlayHost.appendChild(overlayMount);
      document.documentElement.appendChild(overlayHost);
    } else {
      overlayMount = overlayHost.firstElementChild;
    }
    return overlayMount;
  }

  function clearOverlayContents() {
    if (overlayHost) {
      overlayHost.style.display = 'none';
    }
    if (overlayMount) {
      overlayMount.setAttribute('data-scrollsafe-hidden', 'true');
      if (overlayMount.dataset) {
        delete overlayMount.dataset.scrollsafeBadgeVideoId;
      }
    }
  }

  function largestVisibleVideo() {
    const videos = Array.from(document.querySelectorAll('video'));
    let best = null;
    let bestArea = 0;
    for (const video of videos) {
      const rect = video.getBoundingClientRect();
      const visibleWidth = Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0));
      const visibleHeight = Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0));
      const area = visibleWidth * visibleHeight;
      if (area > bestArea && area > 120 * 120) {
        best = video;
        bestArea = area;
      }
    }
    return best;
  }

  function resolvePrimaryTarget(video, actionContainer) {
    return video || actionContainer || null;
  }

  function resolveArticle(video, actionContainer) {
    if (video) {
      const reelCard = video.closest(REEL_CARD_SELECTOR);
      if (reelCard) return reelCard;

      const reelContainer = video.closest('div[role="presentation"]');
      if (reelContainer) return reelContainer;

      const videoArticle = video.closest('article');
      if (videoArticle) return videoArticle;
    }

    if (actionContainer) {
      const actionCard = actionContainer.closest(REEL_CARD_SELECTOR);
      if (actionCard) return actionCard;

      const actionArticle = actionContainer.closest('article');
      if (actionArticle) return actionArticle;
    }

    const dialogArticle = document.querySelector('div[role="dialog"] article');
    if (dialogArticle) return dialogArticle;

    // Avoid falling back to a global document root for reels, which causes metadata bleed.
    if (REEL_PATH_REGEX.test(location.pathname)) {
      const firstCard = document.querySelector(REEL_CARD_SELECTOR);
      if (firstCard) return firstCard;
    }

    return document.querySelector('main article') || document.querySelector('article') || document;
  }

  function positionOverlay(targetElement) {
    if (!overlayHost) {
      clearOverlayContents();
      return;
    }

    const isPostLayout = OPV_PATH_REGEX.test(location.pathname);
    overlayHost.style.display = 'block';
    if (overlayMount) {
      overlayMount.removeAttribute('data-scrollsafe-hidden');
    }

    if (isPostLayout) {
      const rightMargin = 345;
      const topMargin = 16;
      const left = Math.max(0, innerWidth - OVERLAY_WIDTH_ESTIMATE - rightMargin);
      overlayHost.style.left = `${left}px`;
      overlayHost.style.top = `${topMargin}px`;
      return;
    }

    if (!targetElement) {
      clearOverlayContents();
      return;
    }

    const rect = targetElement.getBoundingClientRect();
    const fallbackLeft = Math.min(
      innerWidth - OVERLAY_WIDTH_ESTIMATE,
      Math.max(0, rect.right - OVERLAY_WIDTH_OFFSET - OVERLAY_WIDTH_ESTIMATE)
    );
    const sideLeft = Math.min(
      innerWidth - OVERLAY_WIDTH_ESTIMATE,
      Math.max(0, rect.right + OVERLAY_WIDTH_OFFSET)
    );
    const left = sideLeft >= rect.right ? sideLeft : fallbackLeft;
    const top = Math.max(0, rect.top + OVERLAY_HEIGHT_OFFSET);
    overlayHost.style.left = `${left}px`;
    overlayHost.style.top = `${top}px`;
  }

  function buildCandidate({ video, actionContainer }) {
    const mount = ensureOverlayMount();
    if (!mount) return null;

    let target = resolvePrimaryTarget(video, actionContainer);

    // For OPV posts, if no target found, try to use article or main as fallback
    if (!target && OPV_PATH_REGEX.test(location.pathname)) {
      target = document.querySelector('article') || document.querySelector('main');
      console.debug('[ScrollSafe][Instagram] OPV fallback target:', target ? 'found' : 'not found');
    }

    if (!target) {
      clearOverlayContents();
      return null;
    }

    positionOverlay(target);

    const article = resolveArticle(video, actionContainer);
    let videoId = extractShortcodeFromArticle(article);
    if (!videoId) {
      videoId = extractShortcodeFromPath();
    }
    if (!videoId) {
      return null;
    }

    const title = extractTitle(article);
    const channel = extractChannel(article);
    const isReelLayout = REEL_PATH_REGEX.test(location.pathname);
    const captionNode =
      article?.querySelector?.('[data-testid="caption"]') ||
      (isReelLayout ? article?.querySelector?.(REEL_CAPTION_SELECTOR) : null);
    const captionText = captionNode?.textContent?.trim() || title || '';

    const hashtagSet = new Set();
    const captionMatches = captionText.match(/#[\w]+/g) || [];
    captionMatches.forEach((tag) => hashtagSet.add(tag.replace(/^#/, '')));

    const clickableHashtags =
      article?.querySelectorAll?.('a[role="link"][href*="/explore/tags/"]') || [];
    clickableHashtags.forEach((node) => {
      const text = node.textContent?.trim() || node.innerText?.trim() || '';
      const matches = text.match(/#[\w]+/g) || [];
      matches.forEach((tag) => hashtagSet.add(tag.replace(/^#/, '')));
    });
    const hashtags = Array.from(hashtagSet);

    const metadata = {
      title,
      description: captionText,
      hashtags,
      channel,
    };
    const isPostLayout = OPV_PATH_REGEX.test(location.pathname);

    console.debug('[ScrollSafe][Instagram] metadata extracted', {
      videoId,
      channel,
      caption: captionText,
      hashtags,
    });

    return {
      platform: PLATFORM_ID,
      videoId,
      title,
      channel,
      mount,
      url: window.location.href,
      placement: isPostLayout ? 'instagram-post' : 'instagram-reel',
      metadata,
    };
  }

  function runTick() {
    const currentVideo = largestVisibleVideo();
    const actionContainer = getActionContainer();
    if (!shouldDisplayBadge(currentVideo, actionContainer)) {
      overlayCurrentVideoId = null;
      clearOverlayContents();
      return;
    }

    const candidate = buildCandidate({ video: currentVideo, actionContainer });
    if (!candidate) {
      overlayCurrentVideoId = null;
      clearOverlayContents();
      return;
    }

    if (candidate.videoId !== overlayCurrentVideoId) {
      overlayCurrentVideoId = candidate.videoId;
      const event = new CustomEvent('scrollsafe:instagram-candidate', { detail: candidate });
      window.dispatchEvent(event);
    }
  }

  function installHistoryListeners() {
    if (historyListenersInstalled) return;
    historyListenersInstalled = true;

    const wrapHistoryMethod = (method) => {
      const original = history[method];
      return function (...args) {
        const result = original.apply(this, args);
        queueMicrotask(checkUrlChange);
        return result;
      };
    };

    history.pushState = wrapHistoryMethod('pushState');
    history.replaceState = wrapHistoryMethod('replaceState');
    window.addEventListener('popstate', () => queueMicrotask(checkUrlChange));
    urlPollTimer = setInterval(checkUrlChange, URL_POLL_INTERVAL_MS);
  }

  function checkUrlChange() {
    if (location.pathname === currentPathname) {
      return;
    }
    currentPathname = location.pathname;
    overlayCurrentVideoId = null;
    clearOverlayContents();
    runTick();
  }

  function startOverlayTracking() {
    if (overlayTrackingStarted) return;
    overlayTrackingStarted = true;
    installHistoryListeners();

    const observer = new MutationObserver(() => runTick());
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    window.addEventListener('scroll', runTick, { passive: true });
    window.addEventListener('resize', runTick);
    document.addEventListener('visibilitychange', runTick);
    setInterval(runTick, 800);

    runTick();
  }

  function detectCandidate() {
    console.debug('[ScrollSafe][Instagram] detectCandidate invoked');
    const currentVideo = largestVisibleVideo();
    const actionContainer = getActionContainer();
    if (!shouldDisplayBadge(currentVideo, actionContainer)) {
      overlayCurrentVideoId = null;
      clearOverlayContents();
      return null;
    }

    startOverlayTracking();
    const candidate = buildCandidate({ video: currentVideo, actionContainer });
    if (candidate) {
      console.debug('[ScrollSafe][Instagram] candidate', candidate);
    }
    return candidate;
  }

  window.ScrollSafe = window.ScrollSafe || {};
  window.ScrollSafe.adapters = window.ScrollSafe.adapters || [];
  console.debug('[ScrollSafe][Instagram] adapter registered');
  window.ScrollSafe.adapters.push({
    id: PLATFORM_ID,
    match,
    detectCandidate
  });

  window.addEventListener('beforeunload', () => {
    if (urlPollTimer) {
      clearInterval(urlPollTimer);
      urlPollTimer = null;
    }
  });
})();
