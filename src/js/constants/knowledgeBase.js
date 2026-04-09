/**
 * Knowledge Base service constants.
 * The KB service is a FastAPI + ChromaDB RAG backend running locally.
 */

const DEFAULT_KB_BASE_URL = 'http://localhost:8788';

export function getKnowledgeBaseUrl(customUrl) {
    const base = customUrl || DEFAULT_KB_BASE_URL;
    return String(base).replace(/\/+$/, '');
}

export function validateKnowledgeBaseUrlForRuntime(baseUrl) {
    if (!baseUrl) {
        return DEFAULT_KB_BASE_URL;
    }

    const normalized = String(baseUrl).replace(/\/+$/, '');
    try {
        new URL(normalized);
        return normalized;
    } catch {
        return DEFAULT_KB_BASE_URL;
    }
}
