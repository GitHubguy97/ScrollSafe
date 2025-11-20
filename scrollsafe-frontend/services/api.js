(() => {
  // API requests are now proxied through the background service worker
  // to avoid Private Network Access (PNA) restrictions on content scripts

  /**
   * Send API request via background service worker
   * @param {string} endpoint - API endpoint path (e.g., '/api/analyze')
   * @param {Object} options - Request options
   * @returns {Promise<any>} Response data
   */
  async function sendBackgroundRequest(endpoint, { method = 'GET', headers = {}, body } = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: 'API_REQUEST',
          endpoint,
          method,
          headers,
          body,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error('[API] Runtime error:', chrome.runtime.lastError);
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          if (!response) {
            reject(new Error('No response from background worker'));
            return;
          }

          if (!response.success) {
            reject(new Error(response.error || 'API request failed'));
            return;
          }

          resolve(response.data);
        }
      );
    });
  }

  async function checkCache(videoId, platform) {
    try {
      let endpoint = `/api/ds-cache/${encodeURIComponent(videoId)}`;
      if (platform) {
        endpoint += `?platform=${encodeURIComponent(platform)}`;
      }

      const data = await sendBackgroundRequest(endpoint, { method: 'GET' });
      return data;
    } catch (error) {
      // 404 errors mean cache miss, which is expected
      if (error.message.includes('404')) {
        return null;
      }
      console.error('[ScrollSafe] Cache API error:', error);
      return null;
    }
  }

  async function analyze(payload, { signal } = {}) {
    // Note: AbortController signals cannot be passed through message passing
    // The background worker handles the request independently
    try {
      const data = await sendBackgroundRequest('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });
      return data;
    } catch (error) {
      console.error('[ScrollSafe] Analyze API error:', error);
      throw error;
    }
  }

  async function startDeepScan(payload) {
    try {
      const data = await sendBackgroundRequest('/api/deep-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });
      return data;
    } catch (error) {
      console.error('[ScrollSafe] Deep scan start error:', error);
      throw error;
    }
  }

  async function pollDeepScan(jobId, { signal } = {}) {
    // Note: AbortController signals cannot be passed through message passing
    try {
      const data = await sendBackgroundRequest(`/api/deep-scan/${encodeURIComponent(jobId)}`, {
        method: 'GET',
      });
      return data;
    } catch (error) {
      console.error('[ScrollSafe] Deep scan poll error:', error);
      throw error;
    }
  }

  window.ScrollSafe = window.ScrollSafe || {};
  window.ScrollSafe.api = { checkCache, analyze, startDeepScan, pollDeepScan };
})();
