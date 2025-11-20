(() => {
  const CIRCUMFERENCE = 2 * Math.PI * 9; // r = 9
  const progressControllers = new WeakMap();

  const ICONS = {
    checking: `
      <svg class="scrollsafe-spinner" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" opacity="0.2"></circle>
        <path d="M21 12a9 9 0 0 1-9 9" stroke-linecap="round"></path>
      </svg>
    `,
    deepscan: `
      <svg viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-opacity="0.25" stroke-width="2"></circle>
        <circle cx="12" cy="12" r="9" class="deepscan-progress" stroke-dasharray="${CIRCUMFERENCE.toFixed(2)}" stroke-dashoffset="${CIRCUMFERENCE.toFixed(2)}"></circle>
        <circle cx="11" cy="11" r="3.5" stroke-width="1.75"></circle>
        <path d="M13.6 13.6 L16 16" stroke-width="1.75" stroke-linecap="round"></path>
      </svg>
    `,
    verified: `
      <svg viewBox="0 0 24 24" fill="none">
        <path d="M12 3l6 2v6c0 4.5-3.1 7.2-6 8-2.9-.8-6-3.5-6-8V5l6-2z"></path>
        <path d="M9 12l2 2 4-4"></path>
      </svg>
    `,
    ai: `
      <svg viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <rect x="6" y="5" width="12" height="14" rx="2"></rect>
        <path d="M8 3v2M12 3v2M16 3v2M8 19v2M12 19v2M16 19v2M3 8h3M3 12h3M3 16h3M18 8h3M18 12h3M18 16h3"></path>
        <path d="M12 9l3.8 6.6H8.2L12 9z" fill="currentColor" fill-opacity="0.35"></path>
        <path d="M12 11.3v2.7"></path>
        <circle cx="12" cy="15.8" r="0.85" fill="currentColor" stroke="none"></circle>
      </svg>
    `,
    suspicious: `
      <svg viewBox="0 0 24 24" fill="none">
        <path d="M12 4l9 15H3L12 4z"></path>
        <path d="M12 10v4"></path>
        <path d="M12 17h.01"></path>
      </svg>
    `,
    unknown: `
      <svg viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9"></circle>
        <path d="M9.8 9a2.2 2.2 0 1 1 3.4 1.8c-.9.5-1.4 1.1-1.4 2"></path>
        <path d="M12 17h.01"></path>
      </svg>
    `,
    error: `
      <svg viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9"></circle>
        <path d="M9 9l6 6"></path>
        <path d="M15 9l-6 6"></path>
      </svg>
    `
  };

  function attachBadge(mount) {
    if (!mount) return null;

    let badge = mount.querySelector('.scrollsafe-badge');
    if (!badge) {
      badge = document.createElement('button');
      badge.type = 'button';
      badge.className = 'scrollsafe-badge';
      badge.dataset.variant = 'checking';
      badge.innerHTML = `
        <span class="scrollsafe-badge__icon"></span>
        <span class="scrollsafe-badge__content">
          <span class="scrollsafe-badge__title"></span>
          <span class="scrollsafe-badge__subtitle"></span>
        </span>
      `;
      if (mount.firstChild) {
        mount.insertBefore(badge, mount.firstChild);
      } else {
        mount.appendChild(badge);
      }
      showChecking(badge);
    }
    return badge;
  }

  function stopProgress(node) {
    const controller = progressControllers.get(node);
    if (controller) {
      controller.cancel();
      progressControllers.delete(node);
    }
  }

  function setIcon(node, key) {
    const icon = node.querySelector('.scrollsafe-badge__icon');
    if (icon) {
      icon.innerHTML = ICONS[key] || '';
    }
  }

  function setText(node, title, subtitle, detail) {
    const titleEl = node.querySelector('.scrollsafe-badge__title');
    const subtitleEl = node.querySelector('.scrollsafe-badge__subtitle');
    if (titleEl) titleEl.textContent = title;
    if (subtitleEl) subtitleEl.textContent = subtitle || '';
    const full = detail || (subtitle ? `${title} - ${subtitle}` : title);
    if (full) {
      node.setAttribute('aria-label', full);
      node.setAttribute('title', full);
    } else {
      node.removeAttribute('aria-label');
      node.removeAttribute('title');
    }
  }

  function showChecking(node) {
    if (!node) return;
    stopProgress(node);
    node.dataset.variant = 'checking';
    setIcon(node, 'checking');
    setText(node, 'Checking...', 'Running quick heuristics', 'Running quick heuristics over metadata and thumbnails');
  }

  function formatConfidence(confidence) {
    if (typeof confidence !== 'number' || Number.isNaN(confidence)) return '';
    return `${Math.round(confidence * 100)}% confidence`;
  }

  function showResult(node, result) {
    console.log('[Badge] showResult', node, result);
    if (!node || !result) return;
    stopProgress(node);

    const confidenceText = formatConfidence(result.confidence);
    const reason = (result.reason || '').trim();
    const detail = [reason, confidenceText].filter(Boolean).join(' | ') || 'No additional details available yet';

    switch (result.result) {
      case 'verified':
      case 'real':
        node.dataset.variant = 'verified';
        setIcon(node, 'verified');
        setText(node, 'Verified', 'No AI content', detail);
        break;
      case 'likely-real':
        node.dataset.variant = 'likely-real';
        setIcon(node, 'verified');
        setText(node, 'Looks Real', 'Quick check clear', detail);
        break;
      case 'suspicious':
        node.dataset.variant = 'suspicious';
        setIcon(node, 'suspicious');
        setText(node, 'Suspicious', 'Needs review', detail);
        break;
      case 'ai-detected':
      case 'artificial':
        node.dataset.variant = 'ai';
        setIcon(node, 'ai');
        setText(node, 'AI detected', 'High-risk signal', detail);
        break;
      case 'unknown':
        node.dataset.variant = 'likely-real';
        setIcon(node, 'unknown');
        setText(node, 'Looks Real', 'Quick check clear', detail);
        break;
      default:
        showUnknown(node, detail);
        break;
    }
  }

  function showUnknown(node, message) {
    console.log('[Badge] showUnknown', node, message);
    if (!node) return;
    stopProgress(node);
    node.dataset.variant = 'unknown';
    setIcon(node, 'unknown');
    setText(node, 'Unknown', 'Uncertain', message || 'No signals yet');
  }

  function createProgressController(node, durationMs) {
    const iconSvg = node.querySelector('.deepscan-progress');
    const subtitleEl = node.querySelector('.scrollsafe-badge__subtitle');
    if (!iconSvg) return null;

    let rafId = null;
    let currentProgress = 0;
    let startTime = null;
    const maxProgress = 0.95;

    const setProgress = (value) => {
      currentProgress = Math.max(0, Math.min(value, 1));
      const offset = CIRCUMFERENCE * (1 - currentProgress);
      iconSvg.style.strokeDashoffset = offset.toFixed(2);
      if (subtitleEl && currentProgress < 1) {
        subtitleEl.textContent = `Analyzing ${Math.round(currentProgress * 100)}% complete`;
      }
      const label = currentProgress < 1
        ? `Deep scan - Analyzing ${Math.round(currentProgress * 100)}% complete`
        : 'Deep scan - Analysis complete';
      node.setAttribute('aria-label', label);
      node.setAttribute('title', label);
    };

    const step = (timestamp) => {
      if (startTime === null) {
        startTime = timestamp;
      }
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / durationMs, maxProgress);
      if (progress > currentProgress) {
        setProgress(progress);
      }
      if (progress < maxProgress) {
        rafId = requestAnimationFrame(step);
      } else {
        rafId = null;
      }
    };

    rafId = requestAnimationFrame(step);

    return {
      bumpTo(value) {
        setProgress(Math.max(currentProgress, value));
      },
      async complete() {
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        setProgress(1);
        if (subtitleEl) subtitleEl.textContent = 'Deep scan complete';
        await new Promise((resolve) => setTimeout(resolve, 160));
      },
      fail(message) {
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        if (subtitleEl) subtitleEl.textContent = message || 'Deep scan failed';
        const label = message ? `Deep scan failed - ${message}` : 'Deep scan failed';
        node.setAttribute('aria-label', label);
        node.setAttribute('title', label);
      },
      cancel() {
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
      },
      get progress() {
        return currentProgress;
      }
    };
  }

  function startDeepScan(node, { durationMs = 12000 } = {}) {
    console.log('[Badge] startDeepScan on node', node);
    if (!node) return null;
    stopProgress(node);
    node.dataset.variant = 'deepscan';
    setIcon(node, 'deepscan');
    setText(node, 'Deep scan', 'Analyzing 0% complete', 'Deep scan in progress');
    const controller = createProgressController(node, durationMs);
    if (controller) {
      progressControllers.set(node, controller);
    }
    return controller;
  }

  function showDeepScanBusy(node) {
    console.log('[Badge] showDeepScanBusy', node);
    if (!node) return;
    setText(node, 'Deep scan', 'Analyzing...', 'Deep scan already running');
  }

  function showDeepScanError(node, message) {
    console.log('[Badge] showDeepScanError', node, message);
    if (!node) return;
    stopProgress(node);
    node.dataset.variant = 'error';
    setIcon(node, 'error');
    setText(node, 'Deep scan failed', 'Tap to retry', message || 'Deep scan failed');
  }

  window.ScrollSafe = window.ScrollSafe || {};
  window.ScrollSafe.badge = {
    attachBadge,
    showChecking,
    showResult,
    showUnknown,
    startDeepScan,
    showDeepScanBusy,
    showDeepScanError
  };
})();
