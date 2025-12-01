(() => {
  const PLATFORM_ID = 'youtube';

  function match() {
    const result = location.hostname.includes('youtube.com');
    return result;
  }

  function detectCandidate() {
    const renderer = document.querySelector('ytd-reel-video-renderer');
    if (!renderer) return null;

    const videoId = extractVideoId(renderer);
    if (!videoId) return null;

    const mount = renderer.querySelector('#actions.style-scope.ytd-reel-player-overlay-renderer');
    if (!mount) return null;

    const title = extractTitle(renderer);
    const channel = extractChannel(renderer);

    return {
      platform: PLATFORM_ID,
      renderer,
      videoId,
      title,
      channel,
      mount,
      url: window.location.href
    };
  }

  function extractVideoId(element) {
    const currentUrl = window.location.href;
    const urlMatch = currentUrl.match(/\/shorts\/([^?&]+)/);
    if (urlMatch) return urlMatch[1];

    const attrId = element.getAttribute('data-video-id') || element.getAttribute('data-videoid');
    if (attrId) return attrId;

    return null;
  }

  function extractTitle(element) {
    const primaryHost = element.querySelector('.ytShortsVideoTitleViewModelHostClickable');
    if (primaryHost?.textContent?.trim()) {
      return primaryHost.textContent.trim();
    }

    const selectors = [
      'span.yt-core-attributed-string.yt-core-attributed-string--white-space-pre-wrap.yt-core-attributed-string--link-inherit-color[role="text"]',
      'h2#overlay-title yt-formatted-string',
      '#overlay-title yt-formatted-string',
      'yt-formatted-string#overlay-title',
      'yt-attributed-string[role="text"]'
    ];

    for (const selector of selectors) {
      const node = element.querySelector(selector);
      if (node?.textContent?.trim()) {
        return node.textContent.trim();
      }
    }

    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
      const labelNode = document.getElementById(labelledBy);
      if (labelNode?.textContent?.trim()) {
        return labelNode.textContent.trim();
      }
    }

    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel?.trim()) {
      return ariaLabel.trim();
    }

    const ogTitle = document.querySelector('meta[property="og:title"]')?.content;
    if (ogTitle?.trim()) {
      return ogTitle.trim();
    }

    const docTitle = document.title;
    if (docTitle?.trim()) {
      // When watching a single short, document.title usually contains the video title before " - YouTube"
      const clean = docTitle.replace(/\s+-\s+YouTube.*$/, '').trim();
      if (clean) return clean;
    }

    return 'Unknown Title';
  }

  function extractChannel(element) {
    const channelElement = element.querySelector('a.yt-core-attributed-string__link.yt-core-attributed-string__link--call-to-action-color.yt-core-attributed-string--link-inherit-color');
    if (channelElement?.textContent) {
      return channelElement.textContent.trim();
    }

    const fallback = element.querySelector('a[href*="/@"]');
    if (fallback?.textContent) {
      return fallback.textContent.trim();
    }

    return 'Unknown Channel';
  }

  window.ScrollSafe = window.ScrollSafe || {};
  window.ScrollSafe.adapters = window.ScrollSafe.adapters || [];
  window.ScrollSafe.adapters.push({
    id: PLATFORM_ID,
    match,
    detectCandidate
  });
})();
