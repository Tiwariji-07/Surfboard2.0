/**
 * Main content-script entry point for Surfboard AI.
 * This layer owns Studio integration, sidebar lifecycle, and chat routing.
 */

import CompletionManager from './completion/completionManager.js';
import {
    DEFAULT_LITELLM_CHAT_MODEL,
    normalizeLiteLLMBaseUrl,
    validateLiteLLMBaseUrlForRuntime
} from './constants/litellm.js';
import { RUNTIME_MESSAGES } from './constants/messages.js';
import { isConfiguredStudioUrl } from './constants/studio.js';
import WaveMakerCopilotSidebar from './ui/sidebar.js';

let copilotInstance = null;

class SurfboardAI {
    constructor() {
        this.apiKey = null;
        this.apiBaseUrl = normalizeLiteLLMBaseUrl();
        this.isEnabled = true;
        this.isInitialized = false;
        this.model = DEFAULT_LITELLM_CHAT_MODEL;
        this.sidebar = null;
        this.completionManager = null;
    }

    async initialize() {
        if (!this.isWaveMakerStudioPage()) {
            return;
        }

        try {
            const settings = await this.loadSettings();
            this.apiKey = settings.litellmApiKey || null;
            this.apiBaseUrl = normalizeLiteLLMBaseUrl(settings.litellmBaseUrl);
            this.model = settings.litellmChatModel || DEFAULT_LITELLM_CHAT_MODEL;
            this.isEnabled = settings.copilotEnabled !== false;

            this.sidebar = new WaveMakerCopilotSidebar();
            this.completionManager = new CompletionManager({ enabled: this.isEnabled });

            this.setupChatListener();
            this.setupRuntimeMessageListener();
            this.setupStorageListener();
            this.notifyReady();

            this.isInitialized = true;

            this.sidebar.addMessage(
                "Hello! I'm your Surfboard AI assistant.\n\n" +
                    "- I can answer WaveMaker questions\n" +
                    "- I can help with JS, HTML, and CSS\n" +
                    "- I can suggest page-aware code changes\n\n" +
                    'How can I help?',
                'assistant'
            );
        } catch (error) {
            console.error('Failed to initialize SurfboardAI:', error);
        }
    }

    isWaveMakerStudioPage() {
        return isConfiguredStudioUrl(window.location.href);
    }

    async loadSettings() {
        return new Promise((resolve) => {
            chrome.storage.sync.get(
                ['copilotEnabled', 'litellmApiKey', 'litellmBaseUrl', 'litellmChatModel'],
                (result) => resolve(result)
            );
        });
    }

    setupChatListener() {
        document.addEventListener('surfboard-message', async (event) => {
            if (!this.isEnabled) {
                this.sidebar?.showError('Surfboard AI is disabled. Enable it from the extension popup.');
                return;
            }

            const { message, type } = event.detail || {};
            if (type !== 'user') {
                return;
            }

            if (!this.apiKey) {
                this.sidebar?.showError('LiteLLM API key not configured.');
                return;
            }

            try {
                this.sidebar.addMessage('Thinking...', 'assistant');
                const reply = await this.fetchChatReply(message);

                if (this.sidebar?.chatContainer?.lastChild) {
                    this.sidebar.chatContainer.lastChild.remove();
                }

                this.sidebar.addMessage(reply, 'assistant');
            } catch (error) {
                console.error('Failed to process message:', error);
                this.sidebar?.showError(error.message || 'Failed to process your message.');
            }
        });
    }

    async fetchChatReply(message) {
        const requestBaseUrl = validateLiteLLMBaseUrlForRuntime(this.apiBaseUrl);
        const response = await chrome.runtime.sendMessage({
            type: RUNTIME_MESSAGES.LITELLM_CHAT_COMPLETIONS,
            data: {
                apiKey: this.apiKey,
                baseUrl: requestBaseUrl,
                body: {
                    model: this.model,
                    messages: [
                        {
                            role: 'system',
                            content: 'You are Surfboard AI, a WaveMaker development assistant.'
                        },
                        {
                            role: 'user',
                            content: message
                        }
                    ],
                    temperature: 0.4,
                    max_tokens: 1500
                }
            }
        });

        if (!response?.success) {
            throw new Error(response?.error || 'Chat request failed');
        }

        return response.data.choices?.[0]?.message?.content || 'No response received.';
    }

    setupRuntimeMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            switch (message?.type) {
                case RUNTIME_MESSAGES.TOGGLE_COPILOT:
                    if (this.isEnabled) {
                        this.sidebar?.toggleSidebar();
                    }
                    sendResponse({ success: true });
                    return true;

                case RUNTIME_MESSAGES.COPILOT_STATUS_CHANGED:
                    this.setEnabled(Boolean(message.data?.enabled));
                    sendResponse({ success: true });
                    return true;

                case RUNTIME_MESSAGES.API_KEYS_UPDATED:
                    this.apiKey = message.data?.litellmApiKey || null;
                    this.apiBaseUrl = normalizeLiteLLMBaseUrl(message.data?.litellmBaseUrl);
                    this.model = message.data?.litellmChatModel || DEFAULT_LITELLM_CHAT_MODEL;
                    sendResponse({ success: true });
                    return true;

                default:
                    return false;
            }
        });
    }

    setupStorageListener() {
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== 'sync') {
                return;
            }

            if (changes.litellmApiKey) {
                this.apiKey = changes.litellmApiKey.newValue || null;
            }

            if (changes.litellmBaseUrl) {
                this.apiBaseUrl = normalizeLiteLLMBaseUrl(changes.litellmBaseUrl.newValue);
            }

            if (changes.litellmChatModel) {
                this.model = changes.litellmChatModel.newValue || DEFAULT_LITELLM_CHAT_MODEL;
            }

            if (changes.copilotEnabled) {
                this.setEnabled(Boolean(changes.copilotEnabled.newValue));
            }
        });
    }

    setEnabled(enabled) {
        this.isEnabled = enabled;
        this.completionManager?.setEnabled(enabled);

        if (!enabled && this.sidebar?.isOpen) {
            this.sidebar.toggleSidebar();
        }
    }

    notifyReady() {
        chrome.runtime.sendMessage({ type: RUNTIME_MESSAGES.CONTENT_SCRIPT_READY }).catch(() => {});
    }
}

window.addEventListener('load', () => {
    copilotInstance = new SurfboardAI();
    copilotInstance.initialize();
});

export default SurfboardAI;
