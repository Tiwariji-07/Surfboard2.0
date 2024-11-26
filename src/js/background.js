/**
 * WaveMaker Copilot Background Service Worker
 * Handles background tasks and messaging
 */

// Initialize state
const state = {
    apiKey: null,
    activeTabId: null,
    readyTabs: new Set()
};

// Listen for extension installation
chrome.runtime.onInstalled.addListener((details) => {
    console.log('Extension installed:', details.reason);
    
    if (details.reason === 'install') {
        handleFirstInstall();
    } else if (details.reason === 'update') {
        handleUpdate(details.previousVersion);
    }
});

// Listen for tab activation
chrome.tabs.onActivated.addListener((activeInfo) => {
    state.activeTabId = activeInfo.tabId;
});

// Listen for tab removal
chrome.tabs.onRemoved.addListener((tabId) => {
    state.readyTabs.delete(tabId);
});

/**
 * Handle first installation of the extension
 */
async function handleFirstInstall() {
    try {
        // Set default settings
        await chrome.storage.sync.set({
            isEnabled: true,
            theme: 'light',
            suggestions: true
        });

        // Open welcome page
        chrome.tabs.create({
            url: chrome.runtime.getURL('src/html/welcome.html')
        });
    } catch (error) {
        console.error('Error during first install:', error);
    }
}

/**
 * Handle extension update
 * @param {string} previousVersion - Previous version number
 */
function handleUpdate(previousVersion) {
    console.log(`Updated from version ${previousVersion}`);
}

// Listen for messages from popup and content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Background received message:', message.type, 'from:', sender.tab ? 'tab' : 'popup');

    try {
        switch (message.type) {
            case 'API_KEY_UPDATED':
                handleApiKeyUpdate(message.apiKey);
                sendResponse({ success: true });
                break;

            case 'GET_API_KEY':
                sendResponse({ apiKey: state.apiKey });
                break;

            case 'GET_CONTEXT':
                handleContextRequest(sender.tab.id)
                    .then(sendResponse)
                    .catch(error => {
                        console.error('Error handling context request:', error);
                        sendResponse({ error: error.message });
                    });
                return true;

            case 'TOGGLE_COPILOT':
                handleToggleCopilot(sender.tab ? sender.tab.id : state.activeTabId);
                sendResponse({ success: true });
                break;

            case 'CONTENT_SCRIPT_READY':
                if (sender.tab) {
                    state.readyTabs.add(sender.tab.id);
                    console.log('Content script ready in tab:', sender.tab.id);
                    sendResponse({ success: true });
                }
                break;

            default:
                console.warn('Unknown message type:', message.type);
                sendResponse({ error: 'Unknown message type' });
        }
    } catch (error) {
        console.error('Error handling message:', error);
        sendResponse({ error: error.message });
    }

    return true;
});

/**
 * Handle API key update
 * @param {string} newApiKey - New API key
 */
function handleApiKeyUpdate(newApiKey) {
    state.apiKey = newApiKey;
    
    // Save to storage
    chrome.storage.sync.set({ apiKey: newApiKey })
        .catch(error => console.error('Error saving API key:', error));

    // Notify only ready tabs
    chrome.tabs.query({}, (tabs) => {
        for (const tab of tabs) {
            if (state.readyTabs.has(tab.id) && isWaveMakerPage(tab.url)) {
                chrome.tabs.sendMessage(tab.id, {
                    type: 'API_KEY_UPDATED',
                    apiKey: newApiKey
                }).catch(() => {
                    state.readyTabs.delete(tab.id);
                    console.log('Tab no longer ready:', tab.id);
                });
            }
        }
    });
}

/**
 * Handle context request from content script
 * @param {number} tabId - ID of the requesting tab
 * @returns {Promise<Object>} Context data
 */
async function handleContextRequest(tabId) {
    const tab = await chrome.tabs.get(tabId);
    
    if (!isWaveMakerPage(tab.url)) {
        throw new Error('Not a WaveMaker page');
    }

    return {
        url: tab.url,
        title: tab.title,
        timestamp: new Date().toISOString()
    };
}

/**
 * Handle toggling the copilot sidebar
 * @param {number} tabId - ID of the tab to toggle copilot in
 */
function handleToggleCopilot(tabId) {
    if (!tabId) {
        console.error('No tab ID provided for toggle');
        return;
    }

    if (!state.readyTabs.has(tabId)) {
        console.log('Tab not ready for toggle:', tabId);
        return;
    }

    chrome.tabs.sendMessage(tabId, { type: 'TOGGLE_COPILOT' })
        .catch(error => {
            console.error('Error toggling copilot:', error);
            state.readyTabs.delete(tabId);
        });
}

/**
 * Check if a URL is a WaveMaker page
 * @param {string} url - URL to check
 * @returns {boolean} True if WaveMaker page
 */
function isWaveMakerPage(url) {
    if (!url) return false;
    
    return url.includes('wavemaker.com') || 
           url.includes('wavemakeronline.com') ||
           url.includes('localhost');
}

// Load saved API key on startup
chrome.storage.sync.get('apiKey')
    .then(({ apiKey }) => {
        if (apiKey) {
            state.apiKey = apiKey;
            console.log('API key loaded from storage');
        }
    })
    .catch(error => console.error('Error loading API key:', error));

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
    if (isWaveMakerPage(tab.url)) {
        handleToggleCopilot(tab.id);
    }
});


