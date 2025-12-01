(() => {
  function findVideo() {
    const renderer = document.querySelector('ytd-reel-video-renderer');
    if (renderer) {
      const videoInRenderer = renderer.querySelector('video');
      if (videoInRenderer) {
        return videoInRenderer;
      }
    }

    const candidates = Array.from(document.querySelectorAll('video'));
    if (!candidates.length) {
      return null;
    }
    const visible = candidates
      .map((video) => ({ video, rect: video.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width > 20 && rect.height > 20);
    if (visible.length === 1) {
      return visible[0].video;
    }
    return visible[0]?.video || candidates[0];
  }

  function computeCrop(video) {
    if (!video) return null;
    const rect = video.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return null;
    }
    return {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
      devicePixelRatio: window.devicePixelRatio || 1,
    };
  }

  window.ScrollSafe = window.ScrollSafe || {};
  const samplerApi = window.ScrollSafe.frameSampler;
  if (!samplerApi?.registerSampler) {
    return;
  }

  samplerApi.registerSampler('youtube', {
    findVideo,
    computeCrop,
  });

  // Use YouTube sampler as the default fallback for now.
  samplerApi.registerSampler('default', {
    findVideo,
    computeCrop,
  });
})();
