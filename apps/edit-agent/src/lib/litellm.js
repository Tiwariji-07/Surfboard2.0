import { ChatOpenAI } from '@langchain/openai';

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

    const llm = new ChatOpenAI({
        openAIApiKey: apiKey,
        configuration: {
            baseURL: String(baseUrl).replace(/\/+$/, '')
        },
        modelName: model,
        temperature,
        maxTokens
    }).bind({
        response_format: { type: 'json_object' }
    });

    const langchainMessages = messages.map((msg) => ({
        role: msg.role,
        content: msg.content
    }));

    const response = await llm.invoke(langchainMessages);
    const content = response.content;

    if (!content || typeof content !== 'string') {
        throw new Error('LLM returned an empty completion');
    }

    return content;
}

export function stripTrailingCommas(text) {
    return String(text || '').replace(/,\s*([\]}])/g, '$1');
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
