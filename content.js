/*
 * content.js — lightweight presence on YouTube pages.
 *
 * The panel does the heavy lifting (it reads the player & fetches captions via
 * chrome.scripting). This script only watches YouTube's single-page-app
 * navigation and pings the panel so it can auto-refresh when the video changes.
 */
(function () {
  let lastVideo = currentVideoId();

  function currentVideoId() {
    const u = new URL(location.href);
    if (u.searchParams.get('v')) return u.searchParams.get('v');
    const shorts = u.pathname.match(/\/shorts\/([^/?]+)/);
    if (shorts) return shorts[1];
    return null;
  }

  function notify() {
    const id = currentVideoId();
    if (id === lastVideo) return;
    lastVideo = id;
    // Best-effort: the panel may not be open. Swallow "no receiver" errors.
    try {
      chrome.runtime.sendMessage({ type: 'yt-navigated', videoId: id }, () => void chrome.runtime.lastError);
    } catch (_) { /* extension context invalidated on reload */ }
  }

  // yt-navigate-finish fires on every in-app navigation; the interval is a
  // belt-and-suspenders fallback for builds that don't emit it.
  window.addEventListener('yt-navigate-finish', notify, true);
  document.addEventListener('yt-navigate-finish', notify, true);
  setInterval(notify, 1500);
})();
