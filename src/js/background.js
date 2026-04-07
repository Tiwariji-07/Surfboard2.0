import { RUNTIME_MESSAGES } from './constants/messages.js';
import {
    buildLiteLLMChatCompletionsUrl,
    validateLiteLLMBaseUrlForRuntime
} from './constants/litellm.js';
import { getStudioOrigin, isConfiguredStudioUrl } from './constants/studio.js';

const state = {
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
            case RUNTIME_MESSAGES.TOGGLE_COPILOT:
                handleToggleCopilot(sender.tab ? sender.tab.id : state.activeTabId);
                sendResponse({ success: true });
                break;

            case RUNTIME_MESSAGES.CONTENT_SCRIPT_READY:
                if (sender.tab) {
                    state.readyTabs.add(sender.tab.id);
                    console.log('Content script ready in tab:', sender.tab.id);
                    sendResponse({ success: true });
                }
                break;

            case RUNTIME_MESSAGES.GET_AUTH_COOKIE:
                chrome.cookies.get({
                    url: getCookieOrigin(sender?.tab?.url),
                    name: 'auth_cookie'
                }, (cookie) => {
                    sendResponse({ cookie: cookie ? cookie.value : null });
                });
                return true; // Required for async response

            case RUNTIME_MESSAGES.LITELLM_CHAT_COMPLETIONS:
                handleLiteLLMChatCompletions(message.data)
                    .then((result) => sendResponse({ success: true, data: result }))
                    .catch((error) => sendResponse({ success: false, error: error.message }));
                return true;

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

    chrome.tabs.sendMessage(tabId, { type: RUNTIME_MESSAGES.TOGGLE_COPILOT })
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
    return isConfiguredStudioUrl(url);
}

function getCookieOrigin(url) {
    return getStudioOrigin(url);
}

async function handleLiteLLMChatCompletions(request = {}) {
    const { apiKey, baseUrl, body } = request;

    if (!apiKey) {
        throw new Error('LiteLLM API key not set');
    }

    if (!body || typeof body !== 'object') {
        throw new Error('LiteLLM request body is required');
    }

    const requestBaseUrl = validateLiteLLMBaseUrlForRuntime(baseUrl);
    const response = await fetch(buildLiteLLMChatCompletionsUrl(requestBaseUrl), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
    });

    const responseData = await response.json().catch(() => null);

    if (!response.ok) {
        throw new Error(
            responseData?.error?.message ||
                responseData?.error ||
                `LiteLLM API error: ${response.status} ${response.statusText}`
        );
    }

    return responseData;
}

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
    if (isWaveMakerPage(tab.url)) {
        handleToggleCopilot(tab.id);
    }
});
