export async function callLiteLLMJson({
    apiKey,
    baseUrl,
    model,
    messages,
    temperature = 0.1,
    maxTokens = 2200
}) {
    if (!apiKey) {
        throw new Error('LiteLLM API key is required for edit runs');
    }

    if (!baseUrl) {
        throw new Error('LiteLLM base URL is required for edit runs');
    }

    if (!model) {
        throw new Error('LiteLLM model is required for edit runs');
    }

    const response = await fetch(`${String(baseUrl).replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model,
            messages,
            temperature,
            max_tokens: maxTokens
        })
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(
            payload?.error?.message ||
                payload?.error ||
                `LiteLLM API error: ${response.status} ${response.statusText}`
        );
    }

    const content = payload?.choices?.[0]?.message?.content;
    if (!content || typeof content !== 'string') {
        throw new Error('LiteLLM returned an empty completion');
    }

    return content;
}

export function extractJsonObject(text) {
    const normalized = String(text || '').trim();
    if (!normalized) {
        throw new Error('Model returned empty text');
    }

    const withoutCodeFence = normalized
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

    try {
        return JSON.parse(withoutCodeFence);
    } catch (error) {
        const startIndex = withoutCodeFence.indexOf('{');
        const endIndex = withoutCodeFence.lastIndexOf('}');
        if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
            throw new Error('Model response was not valid JSON');
        }

        return JSON.parse(withoutCodeFence.slice(startIndex, endIndex + 1));
    }
}
