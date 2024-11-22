/**
 * WaveMaker Copilot Popup
 * Manages the extension popup UI and API key storage
 */

document.addEventListener('DOMContentLoaded', async () => {
    const apiKeyInput = document.getElementById('apiKeyInput');
    const saveButton = document.getElementById('saveButton');
    const statusIcon = document.getElementById('statusIcon');
    const statusText = document.getElementById('statusText');
    const errorMessage = document.getElementById('errorMessage');

    // Check current theme
    chrome.storage.sync.get('theme', ({ theme }) => {
        if (theme === 'dark') {
            document.body.setAttribute('data-theme', 'dark');
        }
    });

    // Load existing API key
    try {
        const { apiKey } = await chrome.storage.sync.get('apiKey');
        if (apiKey) {
            apiKeyInput.value = apiKey;
            updateStatus(true);
        } else {
            updateStatus(false);
        }
    } catch (error) {
        console.error('Error loading API key:', error);
        updateStatus(false);
    }

    // Save API key
    saveButton.addEventListener('click', async () => {
        const apiKey = apiKeyInput.value.trim();
        
        if (!apiKey) {
            showError('Please enter a valid Groq API key');
            return;
        }

        if (!apiKey.startsWith('gsk_')) {
            showError('Invalid Groq API key format');
            return;
        }

        try {
            // Save API key
            await chrome.storage.sync.set({ apiKey });
            updateStatus(true);
            hideError();
            
            // Notify background script
            chrome.runtime.sendMessage({ type: 'API_KEY_UPDATED', apiKey });
            
            // Show success message
            statusText.textContent = 'API key saved successfully';
            setTimeout(() => {
                if (statusIcon.classList.contains('active')) {
                    statusText.textContent = 'Copilot is ready';
                }
            }, 2000);
        } catch (error) {
            console.error('Error saving API key:', error);
            showError('Error saving API key');
            updateStatus(false);
        }
    });

    // Handle Enter key
    apiKeyInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            saveButton.click();
        }
    });

    function updateStatus(active) {
        statusIcon.className = 'status-icon ' + (active ? 'active' : 'inactive');
        statusText.textContent = active ? 'Copilot is ready' : 'API key required';
        saveButton.textContent = active ? 'Update API Key' : 'Save API Key';
    }

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.classList.add('visible');
    }

    function hideError() {
        errorMessage.classList.remove('visible');
    }

    // Check if we're on a WaveMaker page
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const currentTab = tabs[0];
        const isWaveMakerPage = currentTab.url.match(
            /(wavemaker\.com|wavemakeronline\.com|localhost)/
        );

        if (!isWaveMakerPage) {
            statusText.textContent = 'Not a WaveMaker page';
            apiKeyInput.disabled = true;
            saveButton.disabled = true;
        }
    });
});
