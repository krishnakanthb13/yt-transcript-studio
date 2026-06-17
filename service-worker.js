/* service-worker.js — makes the toolbar icon open the side panel. */

// One UI, zero duplication: clicking the action icon opens the side panel
// instead of a popup. Downloads are handled in the panel (a real document),
// since MV3 service workers have neither FileReader nor URL.createObjectURL.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((e) => console.warn('setPanelBehavior failed', e));
});

// Belt-and-suspenders: also set it on startup in case onInstalled was missed.
chrome.runtime.onStartup?.addListener?.(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});
