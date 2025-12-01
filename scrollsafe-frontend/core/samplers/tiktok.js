(() => {
  function findVideo() {
    const video = document.querySelector('article[data-e2e="recommend-list-item-container"] video');
    if (video) return video;
    return document.querySelector('video');
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

  samplerApi.registerSampler('tiktok', {
    findVideo,
    computeCrop,
  });
})();
