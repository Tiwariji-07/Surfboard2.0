export const DEFAULT_EDIT_AGENT_BASE_URL = 'http://127.0.0.1:8787';

export function normalizeEditAgentBaseUrl(baseUrl = DEFAULT_EDIT_AGENT_BASE_URL) {
    const normalizedValue = String(baseUrl || '').trim();
    return normalizedValue.replace(/\/+$/, '') || DEFAULT_EDIT_AGENT_BASE_URL;
}

export function validateEditAgentBaseUrlForRuntime(baseUrl = DEFAULT_EDIT_AGENT_BASE_URL) {
    const normalizedBaseUrl = normalizeEditAgentBaseUrl(baseUrl);
    new URL(normalizedBaseUrl);
    return normalizedBaseUrl;
}
