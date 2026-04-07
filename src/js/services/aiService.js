import {
    DEFAULT_LITELLM_COMPLETION_MODEL,
    normalizeLiteLLMBaseUrl,
    validateLiteLLMBaseUrlForRuntime
} from '../constants/litellm.js';
import { RUNTIME_MESSAGES } from '../constants/messages.js';

class AIService {
    constructor() {
        this.apiKey = '';
        this.apiBaseUrl = normalizeLiteLLMBaseUrl();
        this.model = DEFAULT_LITELLM_COMPLETION_MODEL;
        this.requestConfig = {
            max_tokens: 150,
            temperature: 0.2,
            top_p: 0.95,
            presence_penalty: 0.1,
            frequency_penalty: 0.1
        };
    }

    configure({ apiKey, baseUrl, model } = {}) {
        if (typeof apiKey === 'string') {
            this.apiKey = apiKey;
        }

        if (typeof baseUrl === 'string') {
            this.apiBaseUrl = normalizeLiteLLMBaseUrl(baseUrl);
        }

        if (typeof model === 'string' && model.trim()) {
            this.model = model.trim();
        }
    }

    setApiKey(key) {
        this.apiKey = key;
    }

    createPrompt(context, language) {
        const cursorIndex = context.indexOf('▼');
        const beforeCursor = context.substring(0, cursorIndex);
        const afterCursor = context.substring(cursorIndex + 1);

        return [
            {
                role: 'system',
                content: `You are a precise code completion model for ${language}. Follow these rules:
1. Complete the code at the cursor position (▼) naturally.
2. Treat the immediate cursor context as the highest-priority signal.
3. Use WaveMaker Studio context, page files, and variable definitions as supporting context.
4. Reuse identifiers exactly as they appear in context. Do not invent widget names, variable names, service names, bindings, or event handlers.
5. Preserve the coding style, naming, and API usage already present in the file.
6. For WaveMaker page script, prefer Page.Widgets.*, Page.Variables.*, Page.Actions.*, and existing page handler names when those appear in context.
7. If the surrounding code instead uses Widgets.*, Variables.*, App.*, or service aliases, preserve that existing convention rather than mixing styles.
8. For markup, preserve existing widget names, bindings, and event handlers.
9. For styles, preserve existing class names, selectors, and theme conventions.
10. Ensure syntactic correctness and return only the completion text, with no explanation.`
            },
            {
                role: 'user',
                content: `Complete the following ${language} code at the cursor position (▼). Return ONLY the completion text:

Before cursor:
${beforeCursor}
▼
After cursor:
${afterCursor}`
            }
        ];
    }

    async makeAPIRequest(messages, n = 1, signal = null) {
        if (!this.apiKey) {
            throw new Error('LiteLLM API key not set');
        }

        try {
            const requestBaseUrl = validateLiteLLMBaseUrlForRuntime(this.apiBaseUrl);
            const payload = {
                model: this.model,
                messages,
                ...this.requestConfig,
                n
            };

            const responsePromise = new Promise((resolve, reject) => {
                chrome.runtime.sendMessage(
                    {
                        type: RUNTIME_MESSAGES.LITELLM_CHAT_COMPLETIONS,
                        data: {
                            apiKey: this.apiKey,
                            baseUrl: requestBaseUrl,
                            body: payload
                        }
                    },
                    (response) => {
                        if (chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message));
                            return;
                        }

                        if (!response?.success) {
                            reject(new Error(response?.error || 'LiteLLM completion request failed'));
                            return;
                        }

                        resolve(response.data);
                    }
                );
            });

            const responseData = signal
                ? await Promise.race([
                      responsePromise,
                      new Promise((_, reject) => {
                          signal.addEventListener(
                              'abort',
                              () => reject(new DOMException('Request aborted', 'AbortError')),
                              { once: true }
                          );
                      })
                  ])
                : await responsePromise;

            return responseData.choices;
        } catch (error) {
            if (error?.name !== 'AbortError') {
                console.error('API request failed:', error);
            }
            throw error;
        }
    }

    async getCompletion(context, language) {
        const messages = this.createPrompt(context, language);
        const choices = await this.makeAPIRequest(messages, 1);
        return choices[0].message.content.trim();
    }

    async getMultipleCompletions(context, language, n = 3, signal = null) {
        const messages = this.createPrompt(context, language);
        const choices = await this.makeAPIRequest(messages, n, signal);
        return choices.map(choice => choice.message.content.trim());
    }
}

export default new AIService();
