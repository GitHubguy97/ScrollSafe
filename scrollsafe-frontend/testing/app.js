const CIRCUMFERENCE = 2 * Math.PI * 9; // ~56.55

function startDeepScanAnimation() {
  const badge = document.querySelector('.badge--deepscan');
  if (!badge) return;

  const circle = badge.querySelector('.deepscan-progress');
  const subtitle = badge.querySelector('.badge__subtitle');
  if (!circle) return;

  const duration = Number(badge.dataset.duration || 6000);
  let start = null;

  const update = (progress) => {
    const clamped = Math.max(0, Math.min(progress, 1));
    const offset = CIRCUMFERENCE * (1 - clamped);
    circle.style.strokeDashoffset = offset.toFixed(2);
    if (subtitle) {
      if (clamped < 1) {
        subtitle.textContent = `Analyzing ${Math.round(clamped * 100)}% complete`;
      } else {
        subtitle.textContent = 'Deep scan complete';
      }
    }
  };

  const step = (timestamp) => {
    if (start === null) {
      start = timestamp;
    }
    const elapsed = timestamp - start;
    const progress = elapsed / duration;
    update(progress);
    if (progress < 1) {
      requestAnimationFrame(step);
    }
  };

  // Initialise ring
  circle.style.strokeDasharray = CIRCUMFERENCE.toFixed(2);
  circle.style.strokeDashoffset = CIRCUMFERENCE.toFixed(2);
  update(0);
  requestAnimationFrame(step);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startDeepScanAnimation);
} else {
  startDeepScanAnimation();
}

