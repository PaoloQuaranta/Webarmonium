/**
 * VersionChecker - Automatic cache invalidation on version update
 * Checks version.json on page load only, clears cache and reloads if version changed
 */
(function() {
  'use strict';

  var STORAGE_KEY = 'webarmonium:version';

  /**
   * Fetch version.json with cache-busting
   */
  function fetchVersion() {
    var url = '/version.json?t=' + Date.now();
    return fetch(url, { cache: 'no-store' })
      .then(function(res) {
        if (!res.ok) throw new Error('Version fetch failed');
        return res.json();
      });
  }

  /**
   * Get stored version from localStorage
   */
  function getStoredVersion() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return null;
    }
  }

  /**
   * Store version in localStorage
   */
  function storeVersion(version) {
    try {
      localStorage.setItem(STORAGE_KEY, version);
    } catch (e) {
      // localStorage not available
    }
  }

  /**
   * Clear all caches (Service Worker caches + force reload)
   */
  function clearCachesAndReload() {
    // Clear Service Worker caches if available
    if ('caches' in window) {
      caches.keys().then(function(names) {
        return Promise.all(names.map(function(name) {
          return caches.delete(name);
        }));
      }).then(function() {
        forceReload();
      }).catch(function() {
        forceReload();
      });
    } else {
      forceReload();
    }
  }

  /**
   * Force reload bypassing cache
   */
  function forceReload() {
    // Add cache-busting to current URL
    var url = new URL(window.location.href);
    url.searchParams.set('_v', Date.now());
    window.location.replace(url.toString());
  }

  /**
   * Show update notification using NotificationService or fallback
   */
  function showUpdateNotification(newVersion, callback) {
    var message = 'New version ' + newVersion + ' available. Updating...';

    // Try to use NotificationService if available
    if (window.NotificationService && typeof window.NotificationService.show === 'function') {
      window.NotificationService.show(message, 2000, 'info');
      setTimeout(callback, 1500);
    } else {
      // Fallback: create simple notification
      var el = document.createElement('div');
      el.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:999999;' +
        'background:rgba(10,10,20,0.9);color:#e0e0f0;' +
        'padding:12px 24px;border-radius:8px;font-family:system-ui,sans-serif;font-size:14px;' +
        'box-shadow:0 4px 20px rgba(0,0,0,0.5);border:1px solid #3a3a50;';
      el.textContent = message;
      document.body.appendChild(el);
      setTimeout(callback, 1500);
    }
  }

  /**
   * Update version tag elements in the DOM
   */
  function updateVersionDisplay(version) {
    var versionTags = document.querySelectorAll('.version-tag');
    versionTags.forEach(function(el) {
      el.textContent = 'v' + version;
    });
  }

  /**
   * Check version and update if needed
   */
  function checkVersion() {
    fetchVersion()
      .then(function(data) {
        var newVersion = data.version;
        var storedVersion = getStoredVersion();

        // Always update the displayed version from version.json
        updateVersionDisplay(newVersion);

        // First visit - just store version
        if (!storedVersion) {
          storeVersion(newVersion);
          return;
        }

        // Version changed - clear cache and reload
        if (storedVersion !== newVersion) {
          storeVersion(newVersion); // Store new version before reload
          showUpdateNotification(newVersion, clearCachesAndReload);
        }
      })
      .catch(function() {
        // Silently fail - don't block app if version check fails
      });
  }

  // Check on page load only
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      checkVersion();
    });
  } else {
    checkVersion();
  }

})();
