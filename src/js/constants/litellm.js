export const DEFAULT_LITELLM_BASE_URL = 'http://localhost:4000';
export const DEFAULT_LITELLM_CHAT_MODEL = 'claude-sonnet';
export const DEFAULT_LITELLM_COMPLETION_MODEL = 'gemini/gemini-3.1-flash-lite-preview';
export const DEFAULT_LITELLM_LOG_MODEL = 'claude-sonnet';

export function normalizeLiteLLMBaseUrl(baseUrl) {
    const trimmed = (baseUrl || '').trim();
    const normalized = trimmed || DEFAULT_LITELLM_BASE_URL;
    return normalized.replace(/\/+$/, '');
}

export function buildLiteLLMChatCompletionsUrl(baseUrl) {
    return `${normalizeLiteLLMBaseUrl(baseUrl)}/chat/completions`;
}

export function isTrustedLocalLiteLLMHost(hostname) {
    return hostname === 'localhost' || hostname === '127.0.0.1';
}

export function validateLiteLLMBaseUrlForRuntime(baseUrl) {
    const normalizedBaseUrl = normalizeLiteLLMBaseUrl(baseUrl);
    new URL(normalizedBaseUrl);
    return normalizedBaseUrl;
}
