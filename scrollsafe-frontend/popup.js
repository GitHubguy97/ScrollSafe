// ScrollSafe Popup Script

// Load data when popup opens
document.addEventListener('DOMContentLoaded', loadData);

function loadData() {
  chrome.storage.local.get(['sessionStats', 'videoHistory'], (data) => {
    console.log('📊 Loaded data:', data);
    
    // Update stats
    updateStats(data.sessionStats);
    
    // Update video history
    updateVideoHistory(data.videoHistory);
  });
}

// Update session statistics
function updateStats(stats) {
  if (!stats) {
    // No data yet - everything stays at 0
    return;
  }
  
  document.getElementById('stat-checked').textContent = stats.checked || 0;
  document.getElementById('stat-ai').textContent = stats.aiDetected || 0;
  document.getElementById('stat-verified').textContent = stats.verified || 0;
  document.getElementById('stat-suspicious').textContent = stats.suspicious || 0;
}

// Update video history list
function updateVideoHistory(history) {
  const videoList = document.getElementById('video-list');
  
  if (!history || history.length === 0) {
    // Show empty state
    videoList.innerHTML = `
      <div class="empty-state">
        No videos checked yet.<br>
        Start browsing YouTube Shorts!
      </div>
    `;
    return;
  }
  
  // Build video list HTML
  videoList.innerHTML = history.map(video => {
    const badgeIcon = getBadgeIcon(video.result);
    const confidenceText = video.confidence > 0
      ? `${Math.round(video.confidence * 100)}% confidence`
      : 'No confidence score';

    return `
      <div class="video-item" data-url="${video.url}">
        <div class="video-badge ${video.result || 'unknown'}">
          ${badgeIcon}
        </div>
        <div class="video-info">
          <div class="video-title">${escapeHtml(video.title)}</div>
          <div class="video-channel">${escapeHtml(video.channel)}</div>
          <div class="video-confidence">${confidenceText}</div>
        </div>
      </div>
    `;
  }).join('');
  
  // Add click handlers to open videos
  document.querySelectorAll('.video-item').forEach(item => {
    item.addEventListener('click', () => {
      const url = item.getAttribute('data-url');
      chrome.tabs.create({ url: url });
    });
  });
}

// Get badge icon SVG based on result
function getBadgeIcon(result) {
  switch(result) {
    case 'verified':
      return `
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M12 3l6 2v6c0 4.5-3.1 7.2-6 8-2.9-.8-6-3.5-6-8V5l6-2z"></path>
          <path d="M9 12l2 2 4-4"></path>
        </svg>
      `;
    case 'ai-detected':
      return `
        <svg viewBox="0 0 24 24" fill="none" stroke-width="1.6">
          <rect x="6" y="5" width="12" height="14" rx="2"></rect>
          <path d="M8 3v2M12 3v2M16 3v2M8 19v2M12 19v2M16 19v2M3 8h3M3 12h3M3 16h3M18 8h3M18 12h3M18 16h3"></path>
          <path d="M12 9l3.8 6.6H8.2L12 9z" fill="currentColor" fill-opacity="0.35"></path>
          <path d="M12 11.3v2.7"></path>
          <circle cx="12" cy="15.8" r="0.85" fill="currentColor" stroke="none"></circle>
        </svg>
      `;
    case 'suspicious':
      return `
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M12 4l9 15H3L12 4z"></path>
          <path d="M12 10v4"></path>
          <path d="M12 17h.01"></path>
        </svg>
      `;
    default:
      return `
        <svg viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9"></circle>
          <path d="M9.8 9a2.2 2.2 0 1 1 3.4 1.8c-.9.5-1.4 1.1-1.4 2"></path>
          <path d="M12 17h.01"></path>
        </svg>
      `;
  }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Listen for storage changes and update in real-time
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    console.log('📊 Storage updated, reloading data');
    loadData();
  }
});