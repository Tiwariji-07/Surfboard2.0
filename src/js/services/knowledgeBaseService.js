/**
 * Client-side service for the Knowledge Base RAG backend.
 * Handles both single-request and streaming queries via the background worker.
 */

import { RUNTIME_MESSAGES } from '../constants/messages.js';

const DEFAULT_KB_BASE_URL = 'http://localhost:8788';

export class KnowledgeBaseService {
    constructor() {
        this._baseUrl = DEFAULT_KB_BASE_URL;
    }

    setBaseUrl(url) {
        this._baseUrl = url || DEFAULT_KB_BASE_URL;
    }

    /**
     * Full RAG query (non-streaming). Returns { answer, intent, sources, retrieved_count }.
     */
    async query({ query, pageContext, chatHistory, litellmBaseUrl, litellmApiKey, intentModel, copilotModel }) {
        const response = await chrome.runtime.sendMessage({
            type: RUNTIME_MESSAGES.KNOWLEDGE_BASE_QUERY,
            data: {
                baseUrl: this._baseUrl,
                body: {
                    query,
                    page_context: pageContext || null,
                    chat_history: chatHistory || null,
                    litellm_base_url: litellmBaseUrl,
                    litellm_api_key: litellmApiKey,
                    intent_model: intentModel,
                    copilot_model: copilotModel,
                }
            }
        });

        if (!response?.success) {
            throw new Error(response?.error || 'Knowledge base query failed');
        }
        return response.data;
    }

    /**
     * Direct semantic search (no LLM). Returns { results, count }.
     */
    async search({ query, nResults = 5, filterType = null }) {
        const response = await chrome.runtime.sendMessage({
            type: RUNTIME_MESSAGES.KNOWLEDGE_BASE_SEARCH,
            data: {
                baseUrl: this._baseUrl,
                body: {
                    query,
                    n_results: nResults,
                    filter_type: filterType,
                }
            }
        });

        if (!response?.success) {
            throw new Error(response?.error || 'Knowledge base search failed');
        }
        return response.data;
    }

    /**
     * Streaming RAG query. Calls onMetadata, onText, onDone, onError callbacks.
     */
    streamQuery({ query, pageContext, chatHistory, litellmBaseUrl, litellmApiKey, intentModel, copilotModel }, callbacks = {}) {
        const { onMetadata, onText, onDone, onError } = callbacks;

        const port = chrome.runtime.connect({ name: RUNTIME_MESSAGES.KNOWLEDGE_BASE_STREAM });

        port.onMessage.addListener((msg) => {
            if (msg.type === 'event') {
                const event = msg.event;
                if (event.type === 'metadata' && onMetadata) {
                    onMetadata(event);
                } else if (event.type === 'text' && onText) {
                    onText(event.content);
                } else if (event.type === 'done' && onDone) {
                    onDone();
                } else if (event.type === 'error' && onError) {
                    onError(new Error(event.error));
                }
            } else if (msg.type === 'done') {
                if (onDone) onDone();
                port.disconnect();
            } else if (msg.type === 'error') {
                if (onError) onError(new Error(msg.error));
                port.disconnect();
            }
        });

        port.onDisconnect.addListener(() => {
            if (chrome.runtime.lastError && onError) {
                onError(new Error(chrome.runtime.lastError.message));
            }
        });

        port.postMessage({
            type: 'start',
            data: {
                baseUrl: this._baseUrl,
                body: {
                    query,
                    page_context: pageContext || null,
                    chat_history: chatHistory || null,
                    litellm_base_url: litellmBaseUrl,
                    litellm_api_key: litellmApiKey,
                    intent_model: intentModel,
                    copilot_model: copilotModel,
                }
            }
        });

        // Return a disconnect function for cancellation
        return () => port.disconnect();
    }
}

export const knowledgeBaseService = new KnowledgeBaseService();
