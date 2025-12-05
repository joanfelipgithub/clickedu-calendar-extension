// Track which tabs have shown the overlay in this session
const shownTabs = new Set();

// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && tab.url.includes('insscf.clickedu.eu/sumari/index.php')) {
        // Check if we've already shown the overlay for this tab
        if (!shownTabs.has(tabId)) {
            // Mark this tab as shown
            shownTabs.add(tabId);

            // Send message to content script to show overlay
            chrome.tabs.sendMessage(tabId, { action: 'showOverlay' });
        }
    }
});

// Clean up when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
    shownTabs.delete(tabId);
});

// Reset on browser startup (new session)
chrome.runtime.onStartup.addListener(() => {
    shownTabs.clear();
});