(() => {
  const MUTATION_DEBOUNCE_MS = 200;
  const SCROLL_DEBOUNCE_MS = 500;

  function createEventBridge(onDetect) {
    if (typeof onDetect !== 'function') {
      throw new Error('onDetect callback required');
    }

    let mutationTimer = null;
    let scrollTimer = null;
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (!mutation.addedNodes?.length) continue;
        for (const node of mutation.addedNodes) {
          if (!node) continue;
          if (node.nodeName === 'YTD-REEL-VIDEO-RENDERER' ||
              node.id === 'actions' ||
              (node.classList && node.classList.contains('ytd-reel-player-overlay-renderer'))) {
            scheduleMutation();
            return;
          }
          if (typeof node.querySelector === 'function') {
            if (node.querySelector('ytd-reel-video-renderer') ||
                node.querySelector('#actions.ytd-reel-player-overlay-renderer')) {
              scheduleMutation();
              return;
            }
          }
        }
      }
    });

    function scheduleMutation() {
      if (mutationTimer) clearTimeout(mutationTimer);
      mutationTimer = setTimeout(() => onDetect(), MUTATION_DEBOUNCE_MS);
    }

    function scheduleScroll() {
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => onDetect(), SCROLL_DEBOUNCE_MS);
    }

    function start() {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: false,
        characterData: false
      });
      window.addEventListener('scroll', scheduleScroll, { passive: true });
      window.addEventListener('yt-navigate-finish', scheduleMutation);
      onDetect(); // initial pass
    }

    function stop() {
      observer.disconnect();
      window.removeEventListener('scroll', scheduleScroll);
      window.removeEventListener('yt-navigate-finish', scheduleMutation);
      if (mutationTimer) clearTimeout(mutationTimer);
      if (scrollTimer) clearTimeout(scrollTimer);
    }

    return { start, stop };
  }

  window.ScrollSafe = window.ScrollSafe || {};
  window.ScrollSafe.createEventBridge = createEventBridge;
})();
