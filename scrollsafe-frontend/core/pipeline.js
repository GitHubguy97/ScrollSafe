(() => {
  const CACHE_DEBOUNCE_MS = 2000;
  const DEEP_SCAN_DURATION_MS = 15000; // 20 seconds for progress animation to reach 95%
  const POLL_INTERVAL_MS = 3000; // Poll every 3 seconds
  const MAX_POLL_ATTEMPTS = 80; // 80 attempts × 3s = 240 seconds (4 minutes) for CPU inference

  const DEFAULT_PLATFORM = 'youtube';
  const LOCAL_FRAME_CAPTURE_COUNT = 8;

  function createPipeline({ adapters }) {
    // Verify dependencies exist
    if (!window.ScrollSafe?.badge) {
      throw new Error('[ScrollSafe][Pipeline] badge service not available');
    }
    if (!window.ScrollSafe?.api) {
      throw new Error('[ScrollSafe][Pipeline] api service not available');
    }
    if (!window.ScrollSafe?.storage) {
      throw new Error('[ScrollSafe][Pipeline] storage service not available');
    }

    console.log('[ScrollSafe][Pipeline] Dependencies verified, initializing pipeline');

    const deepScanVerdicts = new Map();
    const processedMounts = new WeakSet();
    const mountObservers = new WeakMap();

    const badge = window.ScrollSafe.badge;
    const api = window.ScrollSafe.api;
    const storage = window.ScrollSafe.storage;

    const state = {
      currentVideoId: null,
      analysisTimeout: null,
      pendingController: null,
      lastProcessedVideoId: null,
      activeDeepScans: new Set()
    };

    function resetDebouncers() {
      if (state.analysisTimeout) {
        clearTimeout(state.analysisTimeout);
        state.analysisTimeout = null;
      }
      if (state.pendingController) {
        try { state.pendingController.abort(); } catch (_) {}
        state.pendingController = null;
      }
    }

    async function persistResult(videoId, title, channel, result, { force = false, platform, url } = {}) {
      if (!force && state.lastProcessedVideoId === videoId) {
        console.log('[ScrollSafe] Skipping duplicate save for video', videoId);
        return;
      }

      if (!force) {
        state.lastProcessedVideoId = videoId;
      }

      console.debug('[ScrollSafe][History] persistResult', {
        videoId,
        platform,
        title,
        channel,
        force,
      });
      await storage.updateSessionHistory({ videoId, title, channel, result, platform, url, force });
    }

    async function handleCacheMiss(candidate) {
      state.analysisTimeout = setTimeout(async () => {
        state.analysisTimeout = null;
        if (state.currentVideoId !== candidate.videoId) {
          console.log('[ScrollSafe] User moved on, skipping API fetch for', candidate.videoId);
          return;
        }
        await fetchHeuristicResult(candidate);
      }, CACHE_DEBOUNCE_MS);
    }

    async function fetchHeuristicResult(candidate) {
      const { platform = DEFAULT_PLATFORM, videoId, badgeNode, title, channel, metadata } = candidate;
      if (!videoId) return;
      // Allow heuristics to run even if deep scan ran (deep scan results are temporary)
      const controller = new AbortController();
      state.pendingController = controller;
      try {
        console.log('[ScrollSafe] Fetching heuristics for', videoId, 'platform', platform);
        const payload = { platform, video_id: videoId };
        if (metadata) {
          payload.metadata = metadata;
        }
        const result = await api.analyze(payload, { signal: controller.signal });
        if (!result) return;
        if (state.currentVideoId === videoId) {
          badge.showResult(badgeNode, result);
          // Only cache authoritative results (Admin Override, Doomscroller), not heuristics
          const isAuthoritative = result.source && result.source !== 'Backend API';
          if (isAuthoritative) {
            console.log('[ScrollSafe] Caching authoritative result from', result.source);
            await storage.cacheVideoResult(videoId, result);
          } else {
            console.log('[ScrollSafe] Heuristics result not cached (temporary)');
          }
          await persistResult(videoId, title, channel, result, { force: false, platform, url: candidate.url });
        } else {
          console.log('[ScrollSafe] Result ready but user moved on', videoId);
        }
      } catch (error) {
        if (error.name === 'AbortError') {
          console.log('[ScrollSafe] Heuristics request aborted for', videoId);
        } else {
          console.error('[ScrollSafe] Heuristics request failed for', videoId, error);
          if (state.currentVideoId === videoId) {
            badge.showUnknown(badgeNode, 'API error - check backend connection');
          }
        }
      } finally {
        state.pendingController = null;
      }
    }

    async function runPipeline(candidate) {
      const { platform = DEFAULT_PLATFORM, videoId, title, channel, badgeNode } = candidate;

      resetDebouncers();
      state.currentVideoId = videoId;

      const cacheResult = await api.checkCache(videoId, platform);
      if (cacheResult) {
        console.log('[DeepScan] Cache hit for', videoId, cacheResult);
        badge.showResult(badgeNode, cacheResult);
        await storage.cacheVideoResult(videoId, cacheResult);
        await persistResult(videoId, title, channel, cacheResult, { force: false, platform, url: candidate.url });

        // Clear deep scan cache if this is an authoritative result
        if (cacheResult.source && cacheResult.source !== 'Backend API') {
          console.log('[Pipeline] Clearing deep scan cache - authoritative result takes priority');
          deepScanVerdicts.delete(videoId);
        }

        return;
      }

      const localResult = await storage.getCachedResult(videoId);
      if (localResult) {
        console.log('[ScrollSafe] Local cache hit for', videoId);
        badge.showResult(badgeNode, localResult);
        await persistResult(videoId, title, channel, localResult, { force: false, platform, url: candidate.url });
        return;
      }

      // Allow deep scan to run even if verdict exists (user can re-scan)
      // Deep scan verdict check removed to enable re-analysis

      handleCacheMiss(candidate);
    }

    async function handleDeepScan(candidate) {
      const { videoId, badgeNode } = candidate;
      if (!videoId) return;

      if (state.activeDeepScans.has(videoId)) {
        console.log('[DeepScan] Deep scan already running for', videoId);
        badge.showDeepScanBusy(badgeNode);
        return;
      }

      resetDebouncers();
      state.activeDeepScans.add(videoId);
      const progress = badge.startDeepScan(badgeNode, { durationMs: DEEP_SCAN_DURATION_MS });

      try {
        let framesPayload = null;
        const sampler = window.ScrollSafe?.frameSampler;
        const platformId = candidate.platform || DEFAULT_PLATFORM;
        if (sampler?.sampleFrames) {
          const frameResult = await sampler.sampleFrames({
            platform: platformId,
            candidate,
            videoId,
            frameCount: LOCAL_FRAME_CAPTURE_COUNT,
            onProgress: ({ completed, total }) => {
              const ratio = total > 0 ? completed / total : 0;
              const target = Math.min(0.6, ratio * 0.75); // keep UI moving but leave room for long-running inference
              const current = progress?.progress ?? 0;
              if (progress && typeof progress.bumpTo === 'function' && current < target) {
                progress.bumpTo(target);
              }
            },
          });
          const frames = frameResult?.frames || [];
          framesPayload = frames
            .map((frame) => frame?.dataUrl)
            .filter((value) => typeof value === 'string' && value.length > 0);
          if (!framesPayload.length) {
            throw new Error('Frame capture produced no data');
          }
        } else {
          console.warn('[DeepScan] Frame sampler unavailable - running backend without client frames');
        }

        await handleDeepScanBackend(candidate, { progress, frames: framesPayload });
      } catch (error) {
        console.error('[DeepScan] Deep scan failed before upload', error);
        progress?.fail('Capture failed');
        if (state.currentVideoId === videoId) {
          const message =
            typeof error?.message === 'string'
              ? error.message
              : 'Capture failed - tap to retry';
          badge.showDeepScanError(badgeNode, message);
        }
      } finally {
        state.activeDeepScans.delete(videoId);
      }
    }

    /* -----------------------------------------------------------------------
     * Backend deep scan implementation - now accepts optional client frames.
     * --------------------------------------------------------------------- */
    async function handleDeepScanBackend(candidate, { frames = null, progress: existingProgress } = {}) {
      const { videoId, title, channel, badgeNode } = candidate || {};
      if (!videoId) return;

      const progress = existingProgress || badge.startDeepScan(badgeNode, { durationMs: DEEP_SCAN_DURATION_MS });
      const manageStateInternally = !existingProgress;

      if (manageStateInternally) {
        if (state.activeDeepScans.has(videoId)) {
          console.log('[DeepScan] Deep scan already running for', videoId);
          badge.showDeepScanBusy(badgeNode);
          return;
        }
        resetDebouncers();
        state.activeDeepScans.add(videoId);
      }

      try {
        const payload = {
          platform: candidate.platform || 'youtube',
          video_id: videoId,
          url: candidate.url || window.location.href,
        };
        if (frames?.length) {
          payload.frames = frames;
        }

        const startResponse = await api.startDeepScan(payload);

        const jobId = startResponse?.job_id || startResponse?.jobId;
        console.log('[DeepScan] Job enqueued', videoId, 'jobId=', jobId, startResponse);
        if (!jobId) {
          throw new Error('Deep scan job did not return an id');
        }

        const deepScanResult = await pollDeepScanJob(jobId, videoId, progress);
        console.log('[DeepScan] Final result received for', videoId, deepScanResult);

        // Check if admin label or authoritative result exists - it takes priority
        const authoritativeResult = await api.checkCache(videoId, candidate.platform || DEFAULT_PLATFORM);
        const finalResult = authoritativeResult || deepScanResult;

        if (authoritativeResult) {
          console.log('[DeepScan] Admin label found, using authoritative result instead of deep scan');
          // Clear any existing deep scan cache - don't store admin labels in deep scan Map
          deepScanVerdicts.delete(videoId);
        } else {
          console.log('[DeepScan] No admin label, using deep scan result');
          // Only store temporary deep scan results, never admin labels
          deepScanVerdicts.set(videoId, deepScanResult);
        }
        if (progress?.progress < 0.95) {
          progress?.bumpTo(0.95);
        }
        await progress?.complete();
        if (state.currentVideoId === videoId) {
          badge.showResult(badgeNode, finalResult);
        }

        // Only cache authoritative results
        if (authoritativeResult) {
          await storage.cacheVideoResult(videoId, finalResult);
        } else {
          console.log('[DeepScan] Deep scan result not cached (temporary)');
        }
        await persistResult(videoId, title, channel, finalResult, { force: true, platform: candidate.platform || DEFAULT_PLATFORM, url: candidate.url });
      } catch (error) {
        if (error?.message === 'deep_scan_cancelled') {
          progress?.cancel?.();
        } else {
          deepScanVerdicts.delete(videoId);
          console.error('[DeepScan] Deep scan failed for', videoId, error);
          const reason = error?.message === 'deep_scan_timeout'
            ? 'Timed out'
            : error?.message === 'deep_scan_failed'
              ? 'Analysis failed'
              : 'Deep scan failed';
          progress?.fail(reason);
          if (state.currentVideoId === videoId) {
            const message =
              error?.message === 'deep_scan_timeout'
                ? 'Deep scan timed out - tap to retry'
                : error?.message === 'deep_scan_failed'
                  ? 'Deep scan failed - tap to retry'
                  : (typeof error?.message === 'string' ? error.message : 'Tap to retry');
            badge.showDeepScanError(badgeNode, message);
          }
        }
      } finally {
        state.activeDeepScans.delete(videoId);
      }
    }

    async function pollDeepScanJob(jobId, videoId, progress) {
      let attempts = 0;
      while (true) {
        attempts += 1;
        const response = await api.pollDeepScan(jobId);
        console.log('[DeepScan] Poll', jobId, 'attempt', attempts, 'status', response?.status, response);

        if (response?.status === 'done' && response.result) {
          return response.result;
        }

        if (response?.status === 'failed') {
          console.warn('[DeepScan] Job reported failure', jobId, response);
          const failure = new Error('deep_scan_failed');
          failure.details = response?.error;
          throw failure;
        }

        if (progress?.progress < 0.85) {
          const next = Math.min(0.85, progress.progress + 0.02);
          progress?.bumpTo(next);
        }

        await delay(POLL_INTERVAL_MS);

        if (state.currentVideoId !== videoId) {
          throw new Error('deep_scan_cancelled');
        }

        if (attempts >= MAX_POLL_ATTEMPTS) {
          throw new Error('deep_scan_timeout');
        }
      }
    }

    function attachAndProcess(candidate) {
      if (!candidate) return false;
      const { mount, videoId, title, channel, platform, placement } = candidate;
      if (!mount || !(mount instanceof Element)) return false;

      if (processedMounts.has(mount)) {
        const existingVideo = mount.dataset?.scrollsafeBadgeVideoId;
        const existingBadge = mount.querySelector('.scrollsafe-badge');
        if (existingBadge) {
          if (existingVideo === videoId) {
            // For Instagram, always re-run pipeline to check admin labels
            // even if we've seen this video before (important for demo accuracy)
            if (platform === 'instagram') {
              console.log('[ScrollSafe][Instagram] Re-checking admin labels for', videoId);
              runPipeline(candidate);
            }
            return true;
          }
        } else {
          console.debug('[ScrollSafe] Badge missing on known mount, reattaching');
        }
      }

      const previousVideoId = mount.dataset?.scrollsafeBadgeVideoId ?? null;
      const badgeNode = badge.attachBadge(mount);
      if (!badgeNode) return false;
      if (badgeNode.dataset) {
        badgeNode.dataset.platform = platform || DEFAULT_PLATFORM;
        if (placement) {
          badgeNode.dataset.placement = placement;
        } else {
          delete badgeNode.dataset.placement;
        }
      }
      if (mount.classList) {
        mount.classList.add('scrollsafe-mount');
        if (placement) {
          mount.classList.add(`scrollsafe-mount--${placement}`);
        }
      }

      processedMounts.add(mount);
      if (mount.dataset) {
        mount.dataset.scrollsafeBadgeVideoId = videoId;
      }

      const videoChanged = previousVideoId !== null && previousVideoId !== videoId;
      const shouldResetBadge = videoChanged || previousVideoId === null;
      if (shouldResetBadge) {
        badge.showChecking(badgeNode);
      }

      if (!mountObservers.has(mount)) {
        const observer = new MutationObserver((mutations) => {
          const existing = mount.querySelector('.scrollsafe-badge');
          if (!existing) {
            console.debug('[ScrollSafe] Badge removed from mount, reattaching');
            const reapplied = badge.attachBadge(mount);
            if (reapplied) {
              candidate.badgeNode = reapplied;
              if (mount.dataset) {
                mount.dataset.scrollsafeBadgeVideoId = videoId;
              }
            }
            return;
          }
          for (const mutation of mutations) {
            if (Array.from(mutation.removedNodes || []).includes(existing)) {
              console.debug('[ScrollSafe] Badge node removed by mutation', mutation);
              const reapplied = badge.attachBadge(mount);
              if (reapplied && mount.dataset) {
                mount.dataset.scrollsafeBadgeVideoId = videoId;
              }
            }
          }
        });
        observer.observe(mount, { childList: true });
        mountObservers.set(mount, observer);
      }

      candidate.badgeNode = badgeNode;
      badgeNode.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        handleDeepScan(candidate);
      };

      // Check for deep scan cached result, but don't show it yet
      const deepResult = deepScanVerdicts.get(videoId);

      // If we have a deep scan result, check if there's a newer authoritative result first
      if (deepResult) {
        (async () => {
          const authoritativeCheck = await api.checkCache(videoId, platform || DEFAULT_PLATFORM);

          // Check if authoritative result exists (any backend cache result takes priority)
          if (authoritativeCheck) {
            console.log('[Pipeline] Backend cache found - clearing deep scan cache and using authoritative result');
            deepScanVerdicts.delete(videoId);
            badge.showResult(badgeNode, authoritativeCheck);
          } else {
            // No backend cache - safe to show temporary deep scan result
            console.log('[DeepScan] No backend cache - reapplying cached deep scan verdict for', videoId);
            badge.showResult(badgeNode, deepResult);
          }
        })();
      } else if (!shouldResetBadge) {
        badge.showChecking(badgeNode);
      }

      runPipeline(candidate);
      return true;
    }

    function detect() {
      const adaptersList = adapters || window.ScrollSafe.adapters || [];
      for (const adapter of adaptersList) {
        try {
          if (typeof adapter.match === 'function' && !adapter.match()) continue;
          const candidate = adapter.detectCandidate?.();
          if (!candidate) continue;
          if (attachAndProcess(candidate)) return;
        } catch (error) {
          console.error('[ScrollSafe] Adapter error:', adapter?.id, error);
        }
      }
    }

    // Instagram-specific session tracking for state isolation
    const instagramSessionCache = new Map(); // videoId → location.href

    window.addEventListener('scrollsafe:instagram-candidate', (event) => {
      const candidate = event?.detail;
      if (!candidate) return;
      console.debug('[ScrollSafe][Instagram] candidate event received', candidate);

      // Instagram SPA navigation handling: reset state when video changes
      const { mount, videoId } = candidate;
      if (mount && videoId) {
        const prevVideoId = mount.dataset?.scrollsafeBadgeVideoId;
        const currentUrl = location.href;
        const cachedSession = instagramSessionCache.get(videoId);

        // If this is a new video OR same video but different URL session
        if (prevVideoId && prevVideoId !== videoId) {
          console.log('[ScrollSafe][Instagram] Video changed from', prevVideoId, 'to', videoId);

          // Cancel in-flight heuristics/deep scans for the previous video
          resetDebouncers();

          // Clear the badge UI to prevent result bleed-over
          const existingBadge = mount.querySelector('.scrollsafe-badge');
          if (existingBadge) {
            badge.showChecking(existingBadge);
          }
        }

        // Session isolation: Clear deep scan results if this video is from a different URL
        if (cachedSession && cachedSession !== currentUrl) {
          console.log('[ScrollSafe][Instagram] New session for video', videoId, '- clearing cached deep scan');
          deepScanVerdicts.delete(videoId);
        }

        // Update session tracking
        instagramSessionCache.set(videoId, currentUrl);
      }

      attachAndProcess(candidate);
    });

    return { detect };
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  window.ScrollSafe = window.ScrollSafe || {};
  window.ScrollSafe.createPipeline = createPipeline;
})();

