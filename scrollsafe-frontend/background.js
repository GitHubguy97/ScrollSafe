// ScrollSafe Background Script
// Service worker for Chrome Extension (Manifest V3)

const API_URL = 'https://api.scroll-safe.com';
const FRAME_DOWNLOAD_DIR = 'Hackathon-project/out';

// API Proxy and frame capture handler. Content scripts use message passing to avoid PNA limits.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'FRAME_CAPTURE_REQUEST') {
    handleFrameCapture(message, sender, sendResponse);
    return true;
  }

  if (message?.type !== 'API_REQUEST') {
    return false; // Not handling this message
  }

  const { endpoint, method = 'GET', headers = {}, body } = message;

  if (!endpoint) {
    sendResponse({ success: false, error: 'Missing endpoint' });
    return true;
  }

  const url = `${API_URL}${endpoint}`;

  // Perform the fetch request in the background worker context
  // Background workers are NOT subject to PNA restrictions
  fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
    .then(async (response) => {
      if (!response.ok) {
        if (response.status === 404) {
          sendResponse({
            success: false,
            error: `HTTP ${response.status}: ${response.statusText}`,
            status: response.status,
          });
          return;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      let data;
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      sendResponse({ success: true, data, status: response.status });
    })
    .catch((error) => {
      sendResponse({ success: false, error: error.message });
    });

  // Return true to indicate we'll call sendResponse asynchronously
  return true;
});

async function captureVisibleTab(windowId, { format = 'jpeg', quality = 90 } = {}) {
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(windowId, { format, quality }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!dataUrl) {
        reject(new Error('captureVisibleTab returned empty data'));
        return;
      }
      resolve(dataUrl);
    });
  });
}

function buildFrameFilename({ videoId, frameIndex, totalFrames }) {
  const paddedIndex = String(frameIndex + 1).padStart(3, '0');
  const safeVideoId = videoId ? videoId.replace(/[^a-zA-Z0-9_-]/g, '') : 'video';
  return `${FRAME_DOWNLOAD_DIR}/scrollsafe_${safeVideoId}_frame_${paddedIndex}_of_${String(totalFrames).padStart(3, '0')}.jpg`;
}

async function handleFrameCapture(message, sender, sendResponse) {
  const { frameIndex = 0, totalFrames = 1, videoId, timestamp, crop } = message || {};
  if (!sender?.tab?.windowId) {
    sendResponse?.({ success: false, error: 'Missing windowId for capture' });
    return;
  }

  try {
    const dataUrl = await captureVisibleTab(sender.tab.windowId, { format: 'jpeg', quality: 90 });
    const finalDataUrl = crop ? await cropCapturedImage(dataUrl, crop) : dataUrl;
    const filename = buildFrameFilename({ videoId, frameIndex, totalFrames });
    sendResponse?.({ success: true, filename, dataUrl: finalDataUrl });
  } catch (error) {
    sendResponse?.({ success: false, error: error?.message || 'capture_failed' });
  }
}

async function cropCapturedImage(dataUrl, cropInfo) {
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const imageBitmap = await createImageBitmap(blob);
    const scale = typeof cropInfo.devicePixelRatio === 'number' ? cropInfo.devicePixelRatio : 1;
    const sx = clamp(Math.round((cropInfo.x || 0) * scale), 0, imageBitmap.width);
    const sy = clamp(Math.round((cropInfo.y || 0) * scale), 0, imageBitmap.height);
    const maxWidth = Math.max(1, imageBitmap.width - sx);
    const maxHeight = Math.max(1, imageBitmap.height - sy);
    const sw = clamp(Math.round((cropInfo.width || imageBitmap.width) * scale), 1, maxWidth);
    const sh = clamp(Math.round((cropInfo.height || imageBitmap.height) * scale), 1, maxHeight);
    const canvas = new OffscreenCanvas(sw, sh);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imageBitmap, sx, sy, sw, sh, 0, 0, sw, sh);
    imageBitmap.close?.();
    const croppedBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
    const croppedDataUrl = await blobToDataUrl(croppedBlob);
    return croppedDataUrl || dataUrl;
  } catch (error) {
    return dataUrl;
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
