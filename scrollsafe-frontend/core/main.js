(() => {
  function start() {

    // Defensive check for all dependencies
    const deps = window.ScrollSafe || {};

    if (!deps.createPipeline) {
      return;
    }
    if (!deps.createEventBridge) {
      return;
    }
    if (!deps.adapters || deps.adapters.length === 0) {
      return;
    }
    if (!deps.badge) {
      return;
    }
    if (!deps.api) {
      return;
    }
    if (!deps.storage) {
      return;
    }

    const pipeline = deps.createPipeline({ adapters: deps.adapters });
    const events = deps.createEventBridge(() => pipeline.detect());
    window.ScrollSafe.pipelineDetect = () => pipeline.detect();
    events.start();

  }

  start();
})();
