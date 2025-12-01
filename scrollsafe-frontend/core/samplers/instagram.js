(() => {
  function findVideo() {
    const dialogVideo = document.querySelector('div[role="dialog"] video');
    if (dialogVideo) {
      return dialogVideo;
    }
    // Prioritize the video element inside the current reel/post article
    const articleVideo = document.querySelector('article video');
    if (articleVideo) {
      return articleVideo;
    }

    // Fallback: any visible video (used for inline reels)
    const candidates = Array.from(document.querySelectorAll('video')).filter((video) => {
      const rect = video.getBoundingClientRect();
      return rect.width > 100 && rect.height > 100;
    });
    return candidates[0] || null;
  }

  function computeCrop(video) {
    if (!video) return null;

    const rect = video.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    const parent = video.parentElement;
    const parentRect = parent?.getBoundingClientRect?.();
    const viewportWidth = window.innerWidth || rect.width;
    const viewportHeight = window.innerHeight || rect.height;

    // Determine available width (exclude comment column if present).
    const layoutWidth = parentRect?.width && parentRect.width >= 200
      ? parentRect.width
      : rect.width;
    const layoutLeft = parentRect ? parentRect.left : rect.left;
    const layoutTop = parentRect ? parentRect.top : rect.top;

    const isPostLayout = /^\/p\//.test(location.pathname);

    // On /p/ layouts, the video container sits alongside comments; constrain to 9:16
    // and bias the crop to the left edge (video area) to avoid the comment column.
    let width = Math.min(layoutWidth, rect.height * (9 / 16));
    let height = rect.height;
    let x = isPostLayout ? layoutLeft : layoutLeft + (layoutWidth - width) / 2;
    let y = layoutTop;

    width = Math.min(width, viewportWidth - x);
    height = Math.min(height, viewportHeight); // clamp vertically within viewport

    return {
      x,
      y,
      width,
      height,
      devicePixelRatio: window.devicePixelRatio || 1,
    };
  }

  window.ScrollSafe = window.ScrollSafe || {};
  const samplerApi = window.ScrollSafe.frameSampler;
  if (!samplerApi?.registerSampler) {
    return;
  }

    samplerApi.registerSampler('instagram', {
      findVideo,
      computeCrop,
    });
})();
