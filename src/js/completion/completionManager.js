import PageContextManager from '../context/pageContext.js';
import {
    DEFAULT_LITELLM_COMPLETION_MODEL,
    normalizeLiteLLMBaseUrl
} from '../constants/litellm.js';
import { PAGE_MESSAGES } from '../constants/messages.js';
import aiService from '../services/aiService.js';

class CompletionManager {
    constructor({ enabled = true } = {}) {
        this.enabled = enabled;
        this.helperInjected = false;
        this.helperReady = false;
        this.inlineConfig = {
            debounceTime: 400,
            minRequestInterval: 700
        };
        this.pageContextManager = new PageContextManager();
        this.pendingController = null;
        this.lastRequestTime = 0;

        this.injectMonacoHelper();
        this.setupAPIKey();
        this.setupMessageListener();
        this.setupHelperReadyListener();
    }

    setupHelperReadyListener() {
        window.addEventListener('message', (event) => {
            if (event.source === window && event.data?.type === PAGE_MESSAGES.MONACO_HELPER_READY) {
                this.helperReady = true;
                // Invalidate page context caches so fresh data is fetched for first completion
                this.pageContextManager.pageBundleCache.clear();
            }
        });
    }

    setEnabled(enabled) {
        this.enabled = enabled;
    }

    setupAPIKey() {
        chrome.storage.sync.get(
            ['litellmApiKey', 'litellmBaseUrl', 'litellmCompletionModel'],
            (result) => {
                aiService.configure({
                    apiKey: result.litellmApiKey || '',
                    baseUrl: normalizeLiteLLMBaseUrl(result.litellmBaseUrl),
                    model: result.litellmCompletionModel || DEFAULT_LITELLM_COMPLETION_MODEL
                });
            }
        );

        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== 'sync') {
                return;
            }

            if (changes.litellmApiKey || changes.litellmBaseUrl || changes.litellmCompletionModel) {
                chrome.storage.sync.get(
                    ['litellmApiKey', 'litellmBaseUrl', 'litellmCompletionModel'],
                    (result) => {
                        aiService.configure({
                            apiKey: result.litellmApiKey || '',
                            baseUrl: normalizeLiteLLMBaseUrl(result.litellmBaseUrl),
                            model:
                                result.litellmCompletionModel || DEFAULT_LITELLM_COMPLETION_MODEL
                        });
                    }
                );
            }
        });
    }

    injectMonacoHelper() {
        if (this.helperInjected) {
            return;
        }

        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('src/js/inject/monacoHelper.js');
        script.dataset.surfboardMonacoHelper = 'true';
        script.onload = function () {
            this.remove();
        };
        (document.head || document.documentElement).appendChild(script);

        this.helperInjected = true;
    }

    setupMessageListener() {
        window.addEventListener('message', (event) => {
            if (event.source !== window || !event.data?.type) {
                return;
            }

            if (event.data.type === PAGE_MESSAGES.INLINE_COMPLETIONS_REQUEST) {
                this.handleCompletionRequest(event.data.data);
            }
        });
    }

    async handleCompletionRequest(data) {
        const requestId = data?.requestId;
        const modelId = data?.modelId;

        if (!requestId || !modelId || !this.enabled || !this.helperReady) {
            this.sendInlineCompletionsResponse(requestId, modelId, []);
            return;
        }

        const now = Date.now();
        if (now - this.lastRequestTime < this.inlineConfig.minRequestInterval) {
            this.sendInlineCompletionsResponse(requestId, modelId, []);
            return;
        }
        this.lastRequestTime = now;

        try {
            if (this.pendingController) {
                this.pendingController.abort();
            }

            const controller = new AbortController();
            this.pendingController = controller;

            const requestContext = await this.buildRequestContext(data);
            const completions = await aiService.getMultipleCompletions(
                requestContext.prompt,
                requestContext.language,
                3,
                controller.signal
            );

            if (this.pendingController === controller) {
                this.pendingController = null;
            }

            this.sendInlineCompletionsResponse(
                requestId,
                modelId,
                completions.map((completion) => ({
                    text: completion,
                    range: {
                        startLineNumber: data.position.lineNumber,
                        startColumn: data.insertColumn,
                        endLineNumber: data.position.lineNumber,
                        endColumn: data.insertColumn
                    }
                }))
            );
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Error handling completion request:', error);
            }

            this.sendInlineCompletionsResponse(requestId, modelId, []);
        }
    }

    async buildRequestContext(data) {
        const prefix = data.contextText.slice(0, data.cursorOffset);
        const suffix = data.contextText.slice(data.cursorOffset);
        const pageContext = await this.pageContextManager.getCompletionContext({
            currentFileContent: data.currentFileContent,
            fileName: data.fileName,
            filePath: data.filePath,
            language: data.language,
            position: data.position,
            relatedFiles: data.relatedFiles || []
        });
        const promptPrefix = this.pageContextManager.toPromptPrefix(pageContext);
        const promptArtifacts = this.pageContextManager.buildPromptArtifacts(pageContext);
        const relatedFilesContext = this.buildRelatedFilesContext(data.relatedFiles || []);

        return {
            language: data.language || 'javascript',
            pageContext,
            prompt: `${promptPrefix}\n${promptArtifacts}${relatedFilesContext}\n\n${prefix}▼${suffix}`
        };
    }

    buildRelatedFilesContext(relatedFiles) {
        const sections = relatedFiles
            .filter((file) => file?.fileName && file?.content)
            .slice(0, 3)
            .map((file) => {
                const truncatedContent =
                    file.content.length > 1500
                        ? `${file.content.slice(0, 1500)}\n...truncated...`
                        : file.content;

                return [
                    '',
                    `[Related file: ${file.fileName} | language: ${file.language || 'unknown'}]`,
                    truncatedContent,
                    `[/Related file: ${file.fileName}]`
                ].join('\n');
            });

        return sections.length ? `\n${sections.join('\n')}` : '';
    }

    sendInlineCompletionsResponse(requestId, modelId, items) {
        window.postMessage(
            {
                type: PAGE_MESSAGES.INLINE_COMPLETIONS_RESPONSE,
                data: {
                    requestId,
                    modelId,
                    items
                }
            },
            '*'
        );
    }
}

export default CompletionManager;
