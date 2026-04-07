/**
 * Main content-script entry point for Surfboard AI.
 * This layer owns Studio integration, sidebar lifecycle, and chat routing.
 */

import CompletionManager from './completion/completionManager.js';
import PageContextManager from './context/pageContext.js';
import { DEFAULT_LITELLM_CHAT_MODEL, normalizeLiteLLMBaseUrl } from './constants/litellm.js';
import { PAGE_MESSAGES, RUNTIME_MESSAGES } from './constants/messages.js';
import { isConfiguredStudioUrl } from './constants/studio.js';
import WaveMakerCopilotSidebar from './ui/sidebar.js';

let copilotInstance = null;
const ECOSYSTEM_AGENT_BASE_URL = 'https://ecosystem-agent.wavemaker.ai';

class SurfboardAI {
    constructor() {
        this.apiKey = null;
        this.apiBaseUrl = normalizeLiteLLMBaseUrl();
        this.isEnabled = true;
        this.isInitialized = false;
        this.model = DEFAULT_LITELLM_CHAT_MODEL;
        this.sidebar = null;
        this.completionManager = null;
        this.pageContextManager = new PageContextManager();
        this.chatHistory = [];
        this.maxChatHistory = 6;
        this.chatSessionId = crypto.randomUUID();
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
            this.refreshSidebarContext().catch((error) => {
                console.warn('Failed to initialize sidebar context:', error);
            });

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

            try {
                const pageContext = await this.refreshSidebarContext();
                const streamingMessage = this.sidebar.createStreamingAssistantMessage();
                const reply = await this.fetchChatReplyStream(message, pageContext, streamingMessage);

                this.recordChatTurn('user', message);
                this.recordChatTurn('assistant', reply);
            } catch (error) {
                console.error('Failed to process message:', error);
                this.sidebar?.showError(error.message || 'Failed to process your message.');
            }
        });
    }

    async fetchChatReplyStream(message, pageContext, streamingMessage) {
        const requestBody = this.buildChatStreamRequest(message, pageContext);
        const streamState = {
            text: '',
            sources: [],
            followups: []
        };

        this.sidebar.updateStreamingAssistantMessage(streamingMessage, streamState);

        return new Promise((resolve, reject) => {
            let settled = false;
            const port = chrome.runtime.connect({
                name: RUNTIME_MESSAGES.ECOSYSTEM_AGENT_CHAT_STREAM
            });

            const cleanup = () => {
                port.onMessage.removeListener(handlePortMessage);
                port.onDisconnect.removeListener(handleDisconnect);
                try {
                    port.disconnect();
                } catch (error) {
                    // Ignore disconnect races when the worker closes first.
                }
            };

            const finish = (result) => {
                if (settled) {
                    return;
                }

                settled = true;
                this.sidebar.finalizeStreamingAssistantMessage(streamingMessage, streamState);
                cleanup();
                resolve(result);
            };

            const fail = (error) => {
                if (settled) {
                    return;
                }

                settled = true;
                if (!streamState.text.trim()) {
                    streamingMessage.remove();
                } else {
                    this.sidebar.finalizeStreamingAssistantMessage(streamingMessage, streamState);
                }
                cleanup();
                reject(error instanceof Error ? error : new Error(String(error)));
            };

            const handleDisconnect = () => {
                if (!settled && chrome.runtime.lastError) {
                    fail(new Error(chrome.runtime.lastError.message));
                }
            };

            const handlePortMessage = (payload) => {
                if (payload?.type === 'event') {
                    this.handleStreamEvent(payload.event, streamState, streamingMessage, fail);
                    return;
                }

                if (payload?.type === 'done') {
                    finish(streamState.text.trim() || 'No response received.');
                    return;
                }

                if (payload?.type === 'error') {
                    fail(new Error(payload.error || 'Chat request failed'));
                }
            };

            port.onMessage.addListener(handlePortMessage);
            port.onDisconnect.addListener(handleDisconnect);
            port.postMessage({
                type: 'start',
                data: {
                    baseUrl: ECOSYSTEM_AGENT_BASE_URL,
                    body: requestBody
                }
            });
        });
    }

    handleStreamEvent(event, streamState, streamingMessage, fail) {
        if (!event?.type) {
            return;
        }

        if (event.type === 'text') {
            streamState.text += event.content || '';
            this.sidebar.updateStreamingAssistantMessage(streamingMessage, streamState);
            return;
        }

        if (event.type === 'source_ref') {
            const sourceLabel = event.label || event.source;
            if (sourceLabel && !streamState.sources.includes(sourceLabel)) {
                streamState.sources.push(sourceLabel);
                this.sidebar.updateStreamingAssistantMessage(streamingMessage, streamState);
            }
            return;
        }

        if (event.type === 'followups') {
            streamState.followups = Array.isArray(event.suggestions) ? event.suggestions.slice(0, 4) : [];
            this.sidebar.updateStreamingAssistantMessage(streamingMessage, streamState);
            return;
        }

        if (event.type === 'error') {
            const errorMessage =
                event.data?.answer || event.error || 'Ecosystem agent chat request failed.';
            fail(new Error(errorMessage));
        }
    }

    buildChatStreamRequest(message, pageContext) {
        return {
            message,
            sessionId: this.chatSessionId,
            context: this.buildEcosystemChatContext(pageContext),
            history: this.getChatHistoryMessages()
        };
    }

    buildEcosystemChatContext(pageContext) {
        const widgets = pageContext.symbols?.widgets || [];
        const services = pageContext.apiContext?.services || [];
        const pageVariables = pageContext.apiContext?.pageVariables || [];
        const pageSummary = [
            `WaveMaker Studio page ${pageContext.pageName || 'unknown'}.`,
            `Active file: ${pageContext.activeFile || 'unknown'} (${pageContext.activeFileType || 'unknown'}).`,
            `Widgets: ${widgets.slice(0, 12).join(', ') || 'none'}.`,
            `Page variables: ${pageVariables.slice(0, 12).join(', ') || 'none'}.`,
            `Services: ${services.slice(0, 12).join(', ') || 'none'}.`,
            this.pageContextManager.buildPromptArtifacts(pageContext)
        ]
            .filter(Boolean)
            .join('\n');

        return {
            pageTitle: pageContext.pageName || 'WaveMaker Studio',
            pageSlug: pageContext.pageName || 'wavemaker-studio',
            pageCategory: `WaveMaker Studio ${pageContext.activeFileType || 'page'} editor`,
            pageSummary,
            pageHeadings: [...widgets.slice(0, 6), ...pageVariables.slice(0, 3), ...services.slice(0, 3)].filter(
                Boolean
            )
        };
    }

    recordChatTurn(role, content) {
        if (!content) {
            return;
        }

        this.chatHistory.push({
            role,
            content
        });

        if (this.chatHistory.length > this.maxChatHistory) {
            this.chatHistory = this.chatHistory.slice(-this.maxChatHistory);
        }
    }

    getChatHistoryMessages() {
        return this.chatHistory.map((entry) => ({
            role: entry.role,
            content: entry.content
        }));
    }

    async refreshSidebarContext() {
        const editorSnapshot = await this.getCurrentEditorSnapshot();
        const pageContext = await this.pageContextManager.getCompletionContext(editorSnapshot);
        this.sidebar?.updateContextPanel(pageContext);
        return pageContext;
    }

    async getCurrentEditorSnapshot() {
        return new Promise((resolve) => {
            const timeoutId = window.setTimeout(() => {
                window.removeEventListener('message', handleResponse);
                resolve({});
            }, 1200);

            const handleResponse = (event) => {
                if (event.source !== window || event.data?.type !== PAGE_MESSAGES.EDITOR_CONTENT_RESPONSE) {
                    return;
                }

                window.clearTimeout(timeoutId);
                window.removeEventListener('message', handleResponse);

                if (event.data?.error) {
                    resolve({});
                    return;
                }

                resolve({
                    currentFileContent: event.data.content || '',
                    fileName: event.data.fileName || event.data.filename || '',
                    filePath: event.data.filePath || '',
                    language: event.data.language || ''
                });
            };

            window.addEventListener('message', handleResponse);
            window.postMessage({ type: PAGE_MESSAGES.EDITOR_CONTENT_REQUEST }, '*');
        });
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
