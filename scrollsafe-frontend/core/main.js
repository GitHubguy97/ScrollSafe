(() => {
  function start() {
    console.log('ScrollSafe Modular: content script loaded');

    // Defensive check for all dependencies
    const deps = window.ScrollSafe || {};

    if (!deps.createPipeline) {
      console.error('[ScrollSafe] CRITICAL: createPipeline not found!');
      return;
    }
    if (!deps.createEventBridge) {
      console.error('[ScrollSafe] CRITICAL: createEventBridge not found!');
      return;
    }
    if (!deps.adapters || deps.adapters.length === 0) {
      console.warn('[ScrollSafe] WARNING: No adapters registered!');
    }
    if (!deps.badge) {
      console.error('[ScrollSafe] CRITICAL: badge service not available!');
      return;
    }
    if (!deps.api) {
      console.error('[ScrollSafe] CRITICAL: api service not available!');
      return;
    }
    if (!deps.storage) {
      console.error('[ScrollSafe] CRITICAL: storage service not available!');
      return;
    }

    console.log('[ScrollSafe] All dependencies loaded successfully', {
      badge: !!deps.badge,
      api: !!deps.api,
      storage: !!deps.storage,
      adapters: deps.adapters.length,
      createPipeline: !!deps.createPipeline,
      createEventBridge: !!deps.createEventBridge
    });

    const pipeline = deps.createPipeline({ adapters: deps.adapters });
    const events = deps.createEventBridge(() => pipeline.detect());
    window.ScrollSafe.pipelineDetect = () => pipeline.detect();
    events.start();

    console.log('[ScrollSafe] Initialization complete - extension is running');
  }

  start();
})();
