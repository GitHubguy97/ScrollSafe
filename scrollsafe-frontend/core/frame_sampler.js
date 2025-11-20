(() => {
  const DEFAULT_FRAME_COUNT = 16;
  const METADATA_RETRY_MS = 300;
  const METADATA_MAX_RETRIES = 12;
  const SEEK_TIMEOUT_MS = 4000;
  const POST_SEEK_DELAY_MS = 160;

  const samplers = new Map();

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function waitForVideoMetadata(video) {
    for (let attempt = 0; attempt < METADATA_MAX_RETRIES; attempt += 1) {
      if (Number.isFinite(video?.duration) && video.duration > 0) {
        return;
      }
      await wait(METADATA_RETRY_MS);
    }
    throw new Error('Video metadata unavailable - unable to read duration');
  }

  function computeTimestamps(duration, frameCount) {
    const timestamps = [];
    if (!Number.isFinite(duration) || duration <= 0) {
      return timestamps;
    }
    for (let i = 0; i < frameCount; i += 1) {
      const t = (duration * (i + 0.5)) / frameCount;
      timestamps.push(Math.min(t, duration));
    }
    return timestamps;
  }

  function captureState(video) {
    if (!video) return null;
    return {
      currentTime: video.currentTime,
      paused: video.paused,
      playbackRate: video.playbackRate,
      muted: video.muted,
    };
  }

  function restoreState(video, state) {
    if (!video || !state) return;
    try {
      video.currentTime = state.currentTime;
    } catch (_) {
      // Ignore seek errors on restore
    }
    video.playbackRate = state.playbackRate;
    video.muted = state.muted;
    if (!state.paused) {
      video.play().catch(() => {});
    }
  }

  function seekTo(video, time) {
    if (!video) {
      return Promise.reject(new Error('Video element missing'));
    }

    return new Promise((resolve) => {
      let settled = false;
      const cleanup = () => {
        settled = true;
        video.removeEventListener('seeked', handleSeeked);
      };
      const timeoutId = setTimeout(() => {
        if (!settled) {
          cleanup();
          resolve();
        }
      }, SEEK_TIMEOUT_MS);

      const handleSeeked = () => {
        clearTimeout(timeoutId);
        cleanup();
        setTimeout(resolve, POST_SEEK_DELAY_MS);
      };

      video.addEventListener('seeked', handleSeeked, { once: true });
      try {
        video.currentTime = time;
      } catch (err) {
        clearTimeout(timeoutId);
        cleanup();
        resolve();
      }
    });
  }

  async function requestFrameCapture({ videoId, frameIndex, totalFrames, timestamp, crop }) {
    if (!chrome?.runtime?.sendMessage) {
      throw new Error('Chrome runtime messaging unavailable');
    }
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: 'FRAME_CAPTURE_REQUEST',
          videoId,
          frameIndex,
          totalFrames,
          timestamp,
          crop,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(response);
        }
      );
    });
  }

  function defaultFindVideo() {
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

  function defaultComputeCrop(video) {
    if (!video) return null;
    try {
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
    } catch (error) {
      console.warn('[FrameSampler] Failed to compute crop rect', error);
      return null;
    }
  }

  function registerSampler(platformId, hooks) {
    if (!platformId) {
      throw new Error('Sampler id required');
    }
    samplers.set(platformId, hooks || {});
  }

  function getSampler(platform) {
    return samplers.get(platform) || samplers.get('default');
  }

  async function sampleFrames({
    platform,
    candidate,
    videoId,
    frameCount = DEFAULT_FRAME_COUNT,
    onProgress,
  } = {}) {
    const sampler = getSampler(platform);
    if (!sampler) {
      throw new Error(`No frame sampler registered for platform: ${platform || 'unknown'}`);
    }

    const video =
      (await sampler.findVideo?.(candidate)) ||
      defaultFindVideo();
    if (!video) {
      throw new Error('No <video> element found on page');
    }

    await waitForVideoMetadata(video);
    const timestamps = computeTimestamps(video.duration, frameCount);
    if (!timestamps.length) {
      throw new Error('Unable to compute timestamps for video');
    }

    const crop = sampler.computeCrop ? sampler.computeCrop(video, candidate) : defaultComputeCrop(video);
    const originalState = captureState(video);
    video.pause();
    video.muted = true;
    video.playbackRate = 1.0;

    sampler.beforeSample?.(video, candidate);

    const savedFrames = [];
    try {
      for (let i = 0; i < timestamps.length; i += 1) {
        const timestamp = timestamps[i];
        await seekTo(video, timestamp);
        const response = await requestFrameCapture({
          videoId,
          frameIndex: i,
          totalFrames: timestamps.length,
          timestamp,
          crop,
        });
        if (!response?.success) {
          const errorMessage = response?.error || 'Unknown capture failure';
          throw new Error(errorMessage);
        }
        if (!response?.dataUrl) {
          throw new Error('Frame capture returned no data');
        }
        savedFrames.push({
          dataUrl: response.dataUrl,
          filename: response.filename || null,
          timestamp,
          index: i,
        });
        if (typeof onProgress === 'function') {
          onProgress({
            completed: i + 1,
            total: timestamps.length,
            filename: response.filename,
          });
        }
      }
    } finally {
      sampler.afterSample?.(video, candidate);
      restoreState(video, originalState);
    }

    return {
      frames: savedFrames,
      duration: video.duration,
    };
  }

  window.ScrollSafe = window.ScrollSafe || {};
  window.ScrollSafe.frameSampler = {
    registerSampler,
    sampleFrames,
  };
})();
