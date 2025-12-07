let overlayShown = false;
let overlayElement = null;
let calendarData = null;
let currentEvents = new Set(); // Track current events for cleanup

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'showOverlay' && !overlayShown) {
        overlayShown = true;
        showCalendarOverlay();
    }
});

// Global spacebar listener - only active on the specific page
document.addEventListener('keydown', function (e) {
    // Only respond to spacebar on the main page
    if (e.code === 'Space' &&
        window.location.href.includes('insscf.clickedu.eu/sumari/index.php')) {

        // Check if user is typing in an input field
        const activeElement = document.activeElement;
        const isTyping = activeElement &&
            (activeElement.tagName === 'INPUT' ||
                activeElement.tagName === 'TEXTAREA' ||
                activeElement.isContentEditable);

        // Don't interfere if user is typing
        if (isTyping) return;

        e.preventDefault();

        // Toggle overlay
        if (overlayElement && overlayElement.classList.contains('active')) {
            // Hide overlay
            overlayElement.classList.remove('active');
        } else {
            // Show overlay
            if (!overlayElement || !calendarData) {
                // First time or not loaded yet - extract data
                showCalendarOverlay();
            } else {
                // Just show existing overlay
                overlayElement.classList.add('active');
            }
        }
    }
});

// Generate unique ID for each event
function getEventId(dayHeader, eventText) {
    return `event_${dayHeader}_${eventText}`.replace(/[^a-zA-Z0-9_]/g, '_');
}

// Save note to storage
async function saveNote(eventId, note) {
    const key = `note_${eventId}`;
    if (note.trim()) {
        await chrome.storage.local.set({ [key]: note });
    } else {
        await chrome.storage.local.remove(key);
    }
}

// Load note from storage
async function loadNote(eventId) {
    const key = `note_${eventId}`;
    const result = await chrome.storage.local.get(key);
    return result[key] || '';
}

// Cleanup old notes that are no longer in calendar
async function cleanupOldNotes() {
    const allData = await chrome.storage.local.get(null);

    for (const key in allData) {
        if (key.startsWith('note_')) {
            const eventId = key.replace('note_', '');
            // If this event is not in current events, remove the note
            if (!currentEvents.has(eventId)) {
                await chrome.storage.local.remove(key);
                console.log(`Cleaned up old note: ${key}`);
            }
        }
    }
}

async function showCalendarOverlay() {
    // Wait a bit for the iframe to load
    setTimeout(async () => {
        try {
            // Remove existing overlay if any
            const existing = document.getElementById('cal-overlay');
            if (existing) existing.remove();

            // Add styles
            if (!document.getElementById('cal-overlay-styles')) {
                const style = document.createElement('style');
                style.id = 'cal-overlay-styles';
                style.textContent = `
                    #cal-overlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 10000; overflow-y: auto; padding: 40px 20px; box-sizing: border-box; }
                    #cal-overlay.active { display: block; }
                    #cal-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; max-width: 1400px; margin: 0 auto; }
                    .cal-day-card { background: white; border-radius: 16px; padding: 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
                    .cal-day-header { font-size: 24px; font-weight: bold; color: #2563eb; margin-bottom: 16px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
                    .cal-event-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
                    .cal-event-item { color: #374151; font-size: 20px; line-height: 1.2; font-weight: 500; flex: 1; }
                    .cal-note-input { border: 1px solid #d1d5db; border-radius: 6px; padding: 6px 10px; font-size: 14px; color: #6b7280; flex: 1; max-width: 200px; transition: all 0.2s; position: relative; resize: vertical; height: 32px; overflow-y: auto; font-family: inherit; }
                    .cal-note-input:focus { outline: none; border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1); }
                    .cal-note-input::placeholder { color: #9ca3af; font-style: italic; }
                    .cal-note-input.has-note { background: #fef3c7; border-color: #f59e0b; }
                    .cal-note-tooltip { position: absolute; bottom: 100%; left: 0; background: #1f2937; color: white; padding: 8px 12px; border-radius: 6px; font-size: 13px; white-space: pre-wrap; margin-bottom: 8px; opacity: 0; pointer-events: none; transition: opacity 0.2s; z-index: 10002; box-shadow: 0 4px 12px rgba(0,0,0,0.3); max-width: 300px; word-wrap: break-word; }
                    .cal-note-tooltip::after { content: ''; position: absolute; top: 100%; left: 20px; border: 6px solid transparent; border-top-color: #1f2937; }
                    .cal-event-row:hover .cal-note-tooltip { opacity: 1; }
                    .cal-delete-btn { background: #ef4444; color: white; border: none; border-radius: 6px; padding: 6px 10px; font-size: 12px; cursor: pointer; opacity: 0; transition: opacity 0.2s; }
                    .cal-event-row:hover .cal-delete-btn { opacity: 1; }
                    .cal-delete-btn:hover { background: #dc2626; }
                    .cal-delete-btn.visible { opacity: 1; }
                    .cal-download-btn { position: fixed; top: 20px; left: 20px; background: #2563eb; color: white; border: none; padding: 12px 20px; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.2); z-index: 10001; transition: background 0.2s; }
                    .cal-download-btn:hover { background: #1d4ed8; }
                    .cal-close-hint { position: fixed; top: 20px; right: 20px; background: white; padding: 12px 20px; border-radius: 8px; font-size: 14px; color: #6b7280; box-shadow: 0 2px 8px rgba(0,0,0,0.2); z-index: 10001; }
                `;
                document.head.appendChild(style);
            }

            // Create overlay
            const overlay = document.createElement('div');
            overlay.id = 'cal-overlay';
            overlay.innerHTML = '<button class="cal-download-btn" id="cal-download">📥 Download</button><div class="cal-close-hint">Press SPACE to show/hide</div><div id="cal-cards"></div>';
            document.body.appendChild(overlay);
            overlayElement = overlay;

            // Extract data
            const iframe = document.getElementById('iframe_calendari');
            if (!iframe) {
                console.log('iframe_calendari not found, will retry...');
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
            currentEvents.clear(); // Reset current events

            // Process each day
            const cardPromises = [];

            for (const div of divs) {
                const strong = div.querySelector('strong');
                if (strong) {
                    const events = div.querySelectorAll('a.event');
                    if (events.length > 0) {
                        const card = document.createElement('div');
                        card.className = 'cal-day-card';

                        const header = document.createElement('div');
                        header.className = 'cal-day-header';
                        const dayHeader = strong.innerText;
                        header.textContent = dayHeader;
                        card.appendChild(header);

                        // Process each event
                        for (const event of events) {
                            const eventText = event.innerText;
                            const eventId = getEventId(dayHeader, eventText);
                            currentEvents.add(eventId); // Track this event

                            const row = document.createElement('div');
                            row.className = 'cal-event-row';
                            row.style.position = 'relative'; // For tooltip positioning

                            const item = document.createElement('div');
                            item.className = 'cal-event-item';
                            item.textContent = eventText;
                            row.appendChild(item);

                            // Create tooltip for full note text
                            const tooltip = document.createElement('div');
                            tooltip.className = 'cal-note-tooltip';
                            row.appendChild(tooltip);

                            // Add note input (changed to textarea for multi-line support)
                            const noteInput = document.createElement('textarea');
                            noteInput.className = 'cal-note-input';
                            noteInput.placeholder = 'Add note...';
                            noteInput.rows = 1; // Start with 1 row

                            // Update tooltip on hover
                            const updateTooltip = () => {
                                if (noteInput.value.trim()) {
                                    tooltip.textContent = noteInput.value;
                                    tooltip.style.display = 'block';
                                } else {
                                    tooltip.style.display = 'none';
                                }
                            };

                            noteInput.addEventListener('mouseenter', updateTooltip);
                            noteInput.addEventListener('focus', updateTooltip);

                            // Load existing note asynchronously
                            (async () => {
                                const savedNote = await loadNote(eventId);
                                if (savedNote) {
                                    noteInput.value = savedNote;
                                    noteInput.classList.add('has-note');
                                    deleteBtn.classList.add('visible');
                                }
                            })();

                            // Save note on change
                            noteInput.addEventListener('input', async (e) => {
                                const note = e.target.value;
                                await saveNote(eventId, note);

                                // Update tooltip
                                updateTooltip();

                                // Visual feedback
                                if (note.trim()) {
                                    noteInput.classList.add('has-note');
                                    deleteBtn.classList.add('visible');
                                } else {
                                    noteInput.classList.remove('has-note');
                                    deleteBtn.classList.remove('visible');
                                }
                            });

                            // Prevent spacebar from closing overlay when typing
                            noteInput.addEventListener('keydown', (e) => {
                                e.stopPropagation();

                                // Enter without Shift: blur/unfocus (save and exit)
                                // Shift+Enter: add new line (default behavior)
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    noteInput.blur(); // Remove focus from input
                                }
                            });

                            row.appendChild(noteInput);

                            // Add delete button
                            const deleteBtn = document.createElement('button');
                            deleteBtn.className = 'cal-delete-btn';
                            deleteBtn.textContent = '✕';
                            deleteBtn.title = 'Delete note';

                            deleteBtn.addEventListener('click', async () => {
                                noteInput.value = '';
                                await saveNote(eventId, '');
                                noteInput.classList.remove('has-note');
                                deleteBtn.classList.remove('visible');
                                tooltip.style.display = 'none'; // Hide tooltip
                            });

                            row.appendChild(deleteBtn);
                            card.appendChild(row);
                        }

                        container.appendChild(card);
                    }
                }
            }

            // Cleanup old notes (don't wait for it)
            cleanupOldNotes();

            // Only show if we found content
            if (container.children.length > 0) {
                calendarData = true; // Mark that we have data
                overlay.classList.add('active');

                // Add download functionality
                setupDownloadButton();
            }

        } catch (error) {
            console.error('Error showing calendar overlay:', error);
        }
    }, 2000); // Wait 2 seconds for iframe to load
}

// Setup download button
function setupDownloadButton() {
    const downloadBtn = document.getElementById('cal-download');
    if (!downloadBtn) return;

    downloadBtn.addEventListener('click', async () => {
        try {
            // Get current date for filename
            const now = new Date();
            const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD

            // Build text content
            let content = `ClickEdu Calendar Export\n`;
            content += `Generated: ${now.toLocaleString()}\n`;
            content += `${'='.repeat(60)}\n\n`;

            // Get all cards
            const cards = document.querySelectorAll('.cal-day-card');

            for (const card of cards) {
                const header = card.querySelector('.cal-day-header');
                const rows = card.querySelectorAll('.cal-event-row');

                if (header) {
                    content += `${header.textContent}\n`;
                    content += `${'-'.repeat(header.textContent.length)}\n`;
                }

                for (const row of rows) {
                    const eventText = row.querySelector('.cal-event-item').textContent;
                    const noteInput = row.querySelector('.cal-note-input');
                    const note = noteInput ? noteInput.value : '';

                    content += `• ${eventText}`;
                    if (note.trim()) {
                        content += `\n  📝 Note: ${note}`;
                    }
                    content += `\n`;
                }

                content += `\n`;
            }

            // Create and download file
            const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `calendar_${dateStr}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            // Visual feedback
            const originalText = downloadBtn.textContent;
            downloadBtn.textContent = '✓ Downloaded!';
            downloadBtn.style.background = '#10b981';
            setTimeout(() => {
                downloadBtn.textContent = originalText;
                downloadBtn.style.background = '#2563eb';
            }, 2000);

        } catch (error) {
            console.error('Error downloading calendar:', error);
            alert('Error downloading calendar. Please try again.');
        }
    });
}