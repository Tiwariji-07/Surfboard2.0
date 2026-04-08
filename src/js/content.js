/**
 * Main content-script entry point for Surfboard AI.
 * This layer owns Studio integration, sidebar lifecycle, and chat routing.
 */

import CompletionManager from './completion/completionManager.js';
import PageContextManager from './context/pageContext.js';
import StudioApiService from './services/studioApiService.js';
import editAgentService from './services/editAgentService.js';
import { DEFAULT_EDIT_AGENT_BASE_URL, normalizeEditAgentBaseUrl } from './constants/editAgent.js';
import { DEFAULT_LITELLM_CHAT_MODEL, normalizeLiteLLMBaseUrl } from './constants/litellm.js';
import { PAGE_MESSAGES, RUNTIME_MESSAGES } from './constants/messages.js';
import { isConfiguredStudioUrl } from './constants/studio.js';
import WaveMakerCopilotSidebar from './ui/sidebar.js';
import { normalizeExtensionContextError } from './utils/extensionContext.js';

let copilotInstance = null;
const ECOSYSTEM_AGENT_BASE_URL = 'https://ecosystem-agent.wavemaker.ai';

class SurfboardAI {
    constructor() {
        this.apiKey = null;
        this.apiBaseUrl = normalizeLiteLLMBaseUrl();
        this.isEnabled = true;
        this.isInitialized = false;
        this.model = DEFAULT_LITELLM_CHAT_MODEL;
        this.editAgentBaseUrl = DEFAULT_EDIT_AGENT_BASE_URL;
        this.sidebar = null;
        this.completionManager = null;
        this.editAgentService = editAgentService;
        this.studioApiService = new StudioApiService();
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
            this.editAgentBaseUrl = normalizeEditAgentBaseUrl(settings.editAgentBaseUrl);
            this.editAgentService.setBaseUrl(this.editAgentBaseUrl);
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
                ['copilotEnabled', 'litellmApiKey', 'litellmBaseUrl', 'litellmChatModel', 'editAgentBaseUrl'],
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
                const reply = this.isEditAgentCommand(message)
                    ? await this.fetchEditAgentReply(message, pageContext, streamingMessage)
                    : await this.fetchChatReplyStream(message, pageContext, streamingMessage);

                this.recordChatTurn('user', message);
                this.recordChatTurn('assistant', reply);
            } catch (error) {
                const normalizedError = normalizeExtensionContextError(error);
                console.error('Failed to process message:', normalizedError);
                this.sidebar?.showError(normalizedError.message || 'Failed to process your message.');
            }
        });
    }

    isEditAgentCommand(message) {
        return typeof message === 'string' && message.trim().toLowerCase().startsWith('/edit');
    }

    extractEditIntent(message) {
        return String(message || '')
            .replace(/^\/edit\b/i, '')
            .trim();
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

    async fetchEditAgentReply(message, pageContext, streamingMessage) {
        const intent = this.extractEditIntent(message);
        if (!intent) {
            streamingMessage.remove();
            throw new Error('Use `/edit <what to change>` to start an edit-agent run.');
        }

        const requestBody = this.buildEditAgentRequest(intent, pageContext);
        const streamState = {
            text: 'Preparing edit-agent request...',
            sources: ['Local edit-agent'],
            followups: []
        };

        this.sidebar.updateStreamingAssistantMessage(streamingMessage, streamState);

        return new Promise((resolve, reject) => {
            let settled = false;
            let eventQueue = Promise.resolve();
            const port = chrome.runtime.connect({
                name: RUNTIME_MESSAGES.EDIT_AGENT_STREAM
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

            const finish = () => {
                if (settled) {
                    return;
                }

                settled = true;
                this.sidebar.finalizeStreamingAssistantMessage(streamingMessage, streamState);
                cleanup();
                resolve(streamState.text.trim() || 'Edit agent run completed.');
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
                    eventQueue = eventQueue
                        .then(() => this.handleEditAgentStreamEvent(payload.event, streamState, streamingMessage, fail))
                        .then((nextChunk) => {
                            if (!nextChunk) {
                                return;
                            }

                            streamState.text = streamState.text
                                ? `${streamState.text}\n\n${nextChunk}`
                                : nextChunk;
                            this.sidebar.updateStreamingAssistantMessage(streamingMessage, streamState);
                        })
                        .catch(fail);
                    return;
                }

                if (payload?.type === 'done') {
                    eventQueue.then(() => finish()).catch(fail);
                    return;
                }

                if (payload?.type === 'error') {
                    fail(new Error(payload.error || 'Edit agent stream failed'));
                }
            };

            port.onMessage.addListener(handlePortMessage);
            port.onDisconnect.addListener(handleDisconnect);
            port.postMessage({
                type: 'start',
                data: {
                    baseUrl: this.editAgentBaseUrl,
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

    buildEditAgentRequest(intent, pageContext) {
        return {
            intent,
            projectId: pageContext.projectId || '',
            pageName: pageContext.pageName || '',
            activeFile: pageContext.activeFile || '',
            activeFileType: pageContext.activeFileType || '',
            source: pageContext.source || '',
            context: {
                apiContext: pageContext.apiContext || {},
                cursor: pageContext.cursor || null,
                language: pageContext.language || '',
                pageFiles: pageContext.pageFiles || {},
                symbols: pageContext.symbols || {}
            },
            modelConfig: {
                apiKey: this.apiKey || '',
                baseUrl: this.apiBaseUrl || '',
                model: this.model || ''
            }
        };
    }

    async handleEditAgentStreamEvent(event, streamState, streamingMessage, fail) {
        if (!event?.type) {
            return;
        }

        if (event.type === 'error') {
            fail(new Error(event.error || 'Edit agent stream failed'));
            return;
        }

        return this.formatEditAgentEvent(event);
    }

    async formatEditAgentEvent(event) {
        if (event.type === 'status') {
            return `- ${event.phase || 'status'}: ${event.message || 'In progress'}`;
        }

        if (event.type === 'message') {
            return event.content || '';
        }

        if (event.type === 'tool_request') {
            return this.handleEditAgentToolRequest(event);
        }

        if (event.type === 'patch_proposed') {
            const files = Array.isArray(event.files) && event.files.length ? ` Files: ${event.files.join(', ')}.` : '';
            return `- patch_proposed: ${event.summary || 'Patch proposal received.'}${files}`;
        }

        if (event.type === 'apply_request') {
            const result = await this.applyEditAgentChange(event);
            return `- apply_result: ${result}`;
        }

        if (event.type === 'validation_result') {
            return `- validation: ${event.status || 'unknown'}${event.message ? ` - ${event.message}` : ''}`;
        }

        if (event.type === 'interrupt') {
            return `- approval_required: ${event.message || 'Awaiting approval.'}`;
        }

        if (event.type === 'apply_result') {
            return `- apply_result: ${event.message || 'Apply step completed.'}`;
        }

        if (event.type === 'done') {
            const toolText =
                Array.isArray(event.requiredTools) && event.requiredTools.length
                    ? ` Required tools: ${event.requiredTools.join(', ')}.`
                    : '';
            return `${event.message || 'Edit agent run completed.'}${event.nextPhase ? ` Next phase: \`${event.nextPhase}\`.` : ''}${toolText}`;
        }

        return '';
    }

    async handleEditAgentToolRequest(event) {
        if (!event.runId || !event.toolCallId || !event.tool) {
            throw new Error('Edit agent tool request is missing run metadata.');
        }

        const result = await this.executeEditAgentTool(event.tool, event.input || {});
        await this.editAgentService.sendRequest({
            path: `/runs/${encodeURIComponent(event.runId)}/tool-result`,
            method: 'POST',
            body: {
                toolCallId: event.toolCallId,
                result
            }
        });

        return `- tool_request: completed ${event.tool}`;
    }

    async executeEditAgentTool(tool, input) {
        switch (tool) {
            case 'get_project_tree':
                return this.handleGetProjectTreeTool(input);

            case 'read_project_file':
                return this.handleReadProjectFileTool(input);

            default:
                throw new Error(`Unsupported edit agent tool: ${tool}`);
        }
    }

    async handleGetProjectTreeTool(input) {
        const projectId = String(input.projectId || this.pageContextManager.getProjectId() || '').trim();
        if (!projectId) {
            throw new Error('Project tree request is missing a project id.');
        }

        const projectTree = await this.studioApiService.getProjectTree(projectId);
        const entries = this.flattenProjectTree(projectTree);
        const matches = this.filterProjectTreeEntries(entries, input);

        return {
            projectId,
            entries: matches,
            matches,
            counts: {
                totalEntries: entries.length,
                matchedEntries: matches.length
            }
        };
    }

    async handleReadProjectFileTool(input) {
        const projectId = String(input.projectId || this.pageContextManager.getProjectId() || '').trim();
        const projectPath = String(input.projectPath || '').trim();

        if (!projectId || !projectPath) {
            throw new Error('Project file read requires projectId and projectPath.');
        }

        return this.studioApiService.readProjectContentFile(projectId, projectPath);
    }

    flattenProjectTree(node, entries = []) {
        if (!node || typeof node !== 'object') {
            return entries;
        }

        const path = String(node.path || '').trim();
        const name = String(node.name || '').trim();

        if (path || name) {
            const normalizedPath = path || (name ? `/${name}` : '');
            const extension = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
            entries.push({
                name,
                type: node.type || '',
                path: normalizedPath,
                extension,
                parentPath: normalizedPath.includes('/')
                    ? normalizedPath.slice(0, normalizedPath.lastIndexOf('/')) || '/'
                    : '/',
                modifiedDate: node.modifiedDate || null
            });
        }

        const children = Array.isArray(node.files) ? node.files : [];
        children.forEach((child) => this.flattenProjectTree(child, entries));
        return entries;
    }

    filterProjectTreeEntries(entries, input = {}) {
        const focusPathPrefixes = Array.isArray(input.focusPathPrefixes)
            ? input.focusPathPrefixes
                  .map((prefix) => String(prefix || '').trim())
                  .filter(Boolean)
            : [];
        const requestedLimit = Number(input.limit);
        const limit = Number.isFinite(requestedLimit) ? Math.max(1, requestedLimit) : 200;
        const normalizedPrefixes = focusPathPrefixes.map((prefix) =>
            prefix.startsWith('/') ? prefix : `/${prefix}`
        );

        const filteredEntries = normalizedPrefixes.length
            ? entries.filter((entry) =>
                  normalizedPrefixes.some((prefix) => String(entry.path || '').startsWith(prefix))
              )
            : entries;

        return filteredEntries.slice(0, limit);
    }

    async applyEditAgentChange(event) {
        const projectId = this.pageContextManager.getProjectId();
        const resourcePath = String(event.resourcePath || '').trim();
        const projectPath = String(event.projectPath || '').trim();
        const fileName = String(event.fileName || '').trim();
        const content = typeof event.content === 'string' ? event.content : '';

        if (!resourcePath) {
            throw new Error('Edit agent did not provide a resource path to apply.');
        }

        if (!content) {
            throw new Error('Edit agent did not provide updated file content.');
        }

        await this.studioApiService.writeProjectTextFile(projectId, resourcePath, content);

        if (projectPath) {
            const persistedContent = await this.studioApiService.readProjectContentFile(projectId, projectPath);
            if (persistedContent !== content) {
                throw new Error(`Studio save verification failed for ${projectPath}.`);
            }
        }

        window.postMessage(
            {
                type: PAGE_MESSAGES.EDITOR_CONTENT_APPLY,
                data: {
                    content,
                    fileName,
                    projectPath,
                    resourcePath
                }
            },
            '*'
        );

        return `Applied ${fileName || resourcePath}${event.summary ? ` - ${event.summary}` : ''}`;
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
                    this.editAgentBaseUrl = normalizeEditAgentBaseUrl(
                        message.data?.editAgentBaseUrl || this.editAgentBaseUrl
                    );
                    this.editAgentService.setBaseUrl(this.editAgentBaseUrl);
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

            if (changes.editAgentBaseUrl) {
                this.editAgentBaseUrl = normalizeEditAgentBaseUrl(
                    changes.editAgentBaseUrl.newValue || this.editAgentBaseUrl
                );
                this.editAgentService.setBaseUrl(this.editAgentBaseUrl);
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
