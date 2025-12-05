let overlayShown = false;

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'showOverlay' && !overlayShown) {
        overlayShown = true;
        showCalendarOverlay();
    }
});

function showCalendarOverlay() {
    // Wait a bit for the iframe to load
    setTimeout(() => {
        try {
            // Remove existing overlay if any
            const existing = document.getElementById('cal-overlay');
            if (existing) existing.remove();

            // Add styles
            const style = document.createElement('style');
            style.textContent = `
        #cal-overlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 10000; overflow-y: auto; padding: 40px 20px; box-sizing: border-box; }
        #cal-overlay.active { display: block; }
        #cal-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; max-width: 1400px; margin: 0 auto; }
        .cal-day-card { background: white; border-radius: 16px; padding: 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
        .cal-day-header { font-size: 24px; font-weight: bold; color: #2563eb; margin-bottom: 16px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
        .cal-event-item { padding: 4px 0; color: #374151; font-size: 20px; line-height: 1.2; font-weight: 500; }
        .cal-close-hint { position: fixed; top: 20px; right: 20px; background: white; padding: 12px 20px; border-radius: 8px; font-size: 14px; color: #6b7280; box-shadow: 0 2px 8px rgba(0,0,0,0.2); z-index: 10001; }
      `;
            document.head.appendChild(style);

            // Create overlay
            const overlay = document.createElement('div');
            overlay.id = 'cal-overlay';
            overlay.innerHTML = '<div class="cal-close-hint">Press SPACE to close</div><div id="cal-cards"></div>';
            document.body.appendChild(overlay);

            // Extract data
            const iframe = document.getElementById('iframe_calendari');
            if (!iframe) {
                console.log('iframe_calendari not found, will retry...');
                // Retry after another delay
                setTimeout(() => showCalendarOverlay(), 1000);
                return;
            }

            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            const divs = iframeDoc.querySelectorAll('#primari_al_iframe > div');

            if (divs.length === 0) {
                console.log('No calendar data found, will retry...');
                setTimeout(() => showCalendarOverlay(), 1000);
                return;
            }

            const container = document.getElementById('cal-cards');

            divs.forEach(div => {
                const strong = div.querySelector('strong');
                if (strong) {
                    const events = div.querySelectorAll('a.event');
                    if (events.length > 0) {
                        const card = document.createElement('div');
                        card.className = 'cal-day-card';

                        const header = document.createElement('div');
                        header.className = 'cal-day-header';
                        header.textContent = strong.innerText;
                        card.appendChild(header);

                        events.forEach(event => {
                            const item = document.createElement('div');
                            item.className = 'cal-event-item';
                            item.textContent = event.innerText;
                            card.appendChild(item);
                        });

                        container.appendChild(card);
                    }
                }
            });

            // Only show if we found content
            if (container.children.length > 0) {
                overlay.classList.add('active');
            }

            // Close with spacebar
            document.addEventListener('keydown', function handler(e) {
                if (e.code === 'Space' && overlay.classList.contains('active')) {
                    e.preventDefault();
                    overlay.classList.remove('active');
                    document.removeEventListener('keydown', handler);
                }
            });
        } catch (error) {
            console.error('Error showing calendar overlay:', error);
        }
    }, 2000); // Wait 2 seconds for iframe to load
}
