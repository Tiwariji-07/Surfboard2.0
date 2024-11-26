/**
 * WaveMaker Copilot Popup
 * Manages the extension popup UI and API key storage
 */

document.addEventListener('DOMContentLoaded', () => {
    const groqApiKeyInput = document.getElementById('groqApiKey');
    const openaiApiKeyInput = document.getElementById('openaiApiKey');
    const saveButton = document.getElementById('saveButton');
    const statusDiv = document.getElementById('status');
    const enableCopilotCheckbox = document.getElementById('enableCopilot');

    // Load saved settings
    chrome.storage.sync.get(['groqApiKey', 'openaiApiKey', 'copilotEnabled'], (result) => {
        if (result.groqApiKey) {
            groqApiKeyInput.value = result.groqApiKey;
        }
        if (result.openaiApiKey) {
            openaiApiKeyInput.value = result.openaiApiKey;
        }
        if (typeof result.copilotEnabled !== 'undefined') {
            enableCopilotCheckbox.checked = result.copilotEnabled;
        }
    });

    // Save API keys
    saveButton.addEventListener('click', () => {
        const groqApiKey = groqApiKeyInput.value.trim();
        const openaiApiKey = openaiApiKeyInput.value.trim();
        
        if (!groqApiKey && !openaiApiKey) {
            showStatus('Please enter at least one API key', 'error');
            return;
        }

        // Validate API keys if provided
        if (groqApiKey && (!groqApiKey.startsWith('gsk_') || groqApiKey.length < 20)) {
            showStatus('Invalid Groq API key format', 'error');
            return;
        }

        if (openaiApiKey && (!openaiApiKey.startsWith('sk-') || openaiApiKey.length < 20)) {
            showStatus('Invalid OpenAI API key format', 'error');
            return;
        }

        // Save to chrome.storage
        chrome.storage.sync.set({ 
            groqApiKey,
            openaiApiKey
        }, () => {
            showStatus('API keys saved successfully!', 'success');
            
            // Only try to send message if we're in a valid tab context
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0] && tabs[0].url && tabs[0].url.match(/(wavemakeronline\.com|localhost)/)) {
                    // Send message and handle potential errors
                    chrome.tabs.sendMessage(tabs[0].id, { 
                        type: 'API_KEYS_UPDATED',
                        data: { groqApiKey, openaiApiKey }
                    }).catch(error => {
                        console.log('Tab communication error:', error);
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
                if (tabs[0] && tabs[0].url && tabs[0].url.match(/(wavemakeronline\.com|localhost)/)) {
                    // Send message and handle potential errors
                    chrome.tabs.sendMessage(tabs[0].id, { 
                        type: 'COPILOT_STATUS_CHANGED',
                        data: { enabled }
                    }).catch(error => {
                        console.log('Tab communication error:', error);
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
