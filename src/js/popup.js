import { RUNTIME_MESSAGES } from './constants/messages.js';
import {
    DEFAULT_LITELLM_BASE_URL,
    DEFAULT_LITELLM_CHAT_MODEL,
    DEFAULT_LITELLM_COMPLETION_MODEL,
    DEFAULT_LITELLM_LOG_MODEL,
    normalizeLiteLLMBaseUrl
} from './constants/litellm.js';
import { isConfiguredStudioUrl } from './constants/studio.js';

document.addEventListener('DOMContentLoaded', () => {
    const litellmApiKeyInput = document.getElementById('litellmApiKey');
    const litellmBaseUrlInput = document.getElementById('litellmBaseUrl');
    const litellmChatModelInput = document.getElementById('litellmChatModel');
    const litellmCompletionModelInput = document.getElementById('litellmCompletionModel');
    const litellmLogModelInput = document.getElementById('litellmLogModel');
    const saveButton = document.getElementById('saveButton');
    const statusDiv = document.getElementById('status');
    const enableCopilotCheckbox = document.getElementById('enableCopilot');

    // Load saved settings
    chrome.storage.sync.get(
        [
            'litellmApiKey',
            'litellmBaseUrl',
            'litellmChatModel',
            'litellmCompletionModel',
            'litellmLogModel',
            'copilotEnabled'
        ],
        (result) => {
            litellmApiKeyInput.value = result.litellmApiKey || '';
            litellmBaseUrlInput.value = result.litellmBaseUrl || DEFAULT_LITELLM_BASE_URL;
            litellmChatModelInput.value = result.litellmChatModel || DEFAULT_LITELLM_CHAT_MODEL;
            litellmCompletionModelInput.value =
                result.litellmCompletionModel || DEFAULT_LITELLM_COMPLETION_MODEL;
            litellmLogModelInput.value = result.litellmLogModel || DEFAULT_LITELLM_LOG_MODEL;
            if (typeof result.copilotEnabled !== 'undefined') {
                enableCopilotCheckbox.checked = result.copilotEnabled;
            }
        }
    );

    // Save API keys
    saveButton.addEventListener('click', () => {
        const litellmApiKey = litellmApiKeyInput.value.trim();
        const litellmBaseUrl = normalizeLiteLLMBaseUrl(litellmBaseUrlInput.value);
        const litellmChatModel = litellmChatModelInput.value.trim() || DEFAULT_LITELLM_CHAT_MODEL;
        const litellmCompletionModel =
            litellmCompletionModelInput.value.trim() || DEFAULT_LITELLM_COMPLETION_MODEL;
        const litellmLogModel = litellmLogModelInput.value.trim() || DEFAULT_LITELLM_LOG_MODEL;

        if (!litellmApiKey) {
            showStatus('Please enter a LiteLLM API key', 'error');
            return;
        }

        if (!litellmChatModel || !litellmCompletionModel || !litellmLogModel) {
            showStatus('Please enter valid LiteLLM model aliases', 'error');
            return;
        }

        try {
            new URL(litellmBaseUrl);
        } catch (error) {
            showStatus('LiteLLM Base URL must be a valid URL', 'error');
            return;
        }

        // Save to chrome.storage
        chrome.storage.sync.set({ 
            litellmApiKey,
            litellmBaseUrl,
            litellmChatModel,
            litellmCompletionModel,
            litellmLogModel
        }, () => {
            showStatus('LiteLLM settings saved successfully!', 'success');
            
            // Only try to send message if we're in a valid tab context
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0] && isConfiguredStudioUrl(tabs[0].url)) {
                    // Send message and handle potential errors
                    chrome.tabs.sendMessage(tabs[0].id, { 
                        type: RUNTIME_MESSAGES.API_KEYS_UPDATED,
                        data: {
                            litellmApiKey,
                            litellmBaseUrl,
                            litellmChatModel,
                            litellmCompletionModel,
                            litellmLogModel
                        }
                    }).catch(error => {
                        // console.log('Tab communication error:', error);
                        // Content script might not be loaded yet, which is fine
                    });
                }
            });
        });
    });

    // Handle enable/disable toggle
    enableCopilotCheckbox.addEventListener('change', (e) => {
        const enabled = e.target.checked;
        
        chrome.storage.sync.set({ copilotEnabled: enabled }, () => {
            // Only try to send message if we're in a valid tab context
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0] && isConfiguredStudioUrl(tabs[0].url)) {
                    // Send message and handle potential errors
                    chrome.tabs.sendMessage(tabs[0].id, { 
                        type: RUNTIME_MESSAGES.COPILOT_STATUS_CHANGED,
                        data: { enabled }
                    }).catch(error => {
                        // console.log('Tab communication error:', error);
                        // Content script might not be loaded yet, which is fine
                    });
                }
            });
            
            showStatus(
                `Copilot ${enabled ? 'enabled' : 'disabled'} successfully!`,
                'success'
            );
        });
    });

    function showStatus(message, type) {
        statusDiv.textContent = message;
        statusDiv.className = `status ${type}`;
        statusDiv.style.display = 'block';

        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 3000);
    }
});
