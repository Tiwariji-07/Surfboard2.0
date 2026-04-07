import {
    DEFAULT_LITELLM_LOG_MODEL,
    normalizeLiteLLMBaseUrl,
    validateLiteLLMBaseUrlForRuntime
} from '../constants/litellm.js';
import { RUNTIME_MESSAGES } from '../constants/messages.js';

class OpenAIService {
    constructor() {
        this.apiKey = null;
        this.baseURL = normalizeLiteLLMBaseUrl();
        this.model = DEFAULT_LITELLM_LOG_MODEL;
    }

    async configure({ apiKey, baseUrl, model } = {}) {
        if (typeof apiKey === 'string') {
            this.apiKey = apiKey;
        }
        if (typeof baseUrl === 'string') {
            this.baseURL = normalizeLiteLLMBaseUrl(baseUrl);
        }
        if (typeof model === 'string' && model.trim()) {
            this.model = model.trim();
        }
    }

    async setApiKey(key) {
        this.apiKey = key;
    }

    async analyzeLogs(logs) {
        if (!this.apiKey) {
            throw new Error('LiteLLM API key not set');
        }

        // const messages = [
        //     {
        //         role: 'system',
        //         content: `You are a log analysis expert. Analyze the provided logs and:
        //         1. Identify any errors, warnings, or potential issues
        //         2. Suggest possible solutions or debugging steps
        //         3. Highlight any performance concerns
        //         4. Provide a brief summary of the system state
        //         Be concise and focus on actionable insights.`
        //     },
        //     {
        //         role: 'user',
        //         content: `Please analyze these application logs:\n\n${logs}`
        //     }
        // ];
        const messages = [
            {
              role: "system",
              content: `You are an expert log analyzer. Analyze for issues, including possible compatibility problems (e.g., framework updates or namespace changes like javax to jakarta). Provide concise explanations and actionable solutions.
              `,
            },
            {
              role: "user",
              content: `Analyze this log for the problem, root cause, and solution. Consider dependency compatibility, namespace changes, or other breaking changes.
              :\n\n${logs}`,
            },
          ];

        try {
            const requestBaseUrl = validateLiteLLMBaseUrlForRuntime(this.baseURL);
            const response = await chrome.runtime.sendMessage({
                type: RUNTIME_MESSAGES.LITELLM_CHAT_COMPLETIONS,
                data: {
                    apiKey: this.apiKey,
                    baseUrl: requestBaseUrl,
                    body: {
                        model: this.model,
                        messages,
                        temperature: 0.2,
                        max_tokens: 500
                    }
                }
            });

            if (!response?.success) {
                throw new Error(response?.error || 'LiteLLM API error');
            }

            return response.data.choices[0].message.content;
        } catch (error) {
            console.error('Error analyzing logs:', error);
            throw error;
        }
    }
}

export default new OpenAIService();
