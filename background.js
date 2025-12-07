// Listen for tab updates
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' &&
        tab.url &&
        tab.url.includes('insscf.clickedu.eu/sumari/index.php')) {

        // Check if overlay has been shown this session
        const result = await chrome.storage.session.get('overlayShown');

        if (!result.overlayShown) {
            // Mark as shown for this entire browser session
            await chrome.storage.session.set({ overlayShown: true });

            // Send message to content script to show overlay
            chrome.tabs.sendMessage(tabId, { action: 'showOverlay' });
        }
    }
});

// Optional: Reset when user logs out
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' &&
        tab.url &&
        (tab.url.includes('logout') || tab.url.includes('tancar'))) {

        // Clear the flag so overlay shows on next login
        await chrome.storage.session.remove('overlayShown');
    }
});