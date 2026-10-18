// Clicking the toolbar icon opens (or focuses) the search page.
// getContexts finds our own tab without needing the "tabs" permission.
chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL('search.html');
  const [existing] = await chrome.runtime.getContexts({ contextTypes: ['TAB'], documentUrls: [url] });
  if (existing) {
    await chrome.tabs.update(existing.tabId, { active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url });
  }
});
