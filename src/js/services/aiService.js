class AIService {
    constructor() {
        this.API_KEY = ''; // Will be set through extension settings
        this.API_URL = 'https://api.openai.com/v1/chat/completions';
        this.MODEL = 'gpt-3.5-turbo';
        this.CONFIG = {
            max_tokens: 150,
            temperature: 0.2, // Lower temperature for more focused completions
            top_p: 0.95,     // Slightly reduce randomness
            presence_penalty: 0.1, // Slight penalty for repetition
            frequency_penalty: 0.1 // Slight penalty for common tokens
        };
    }

    setApiKey(key) {
        this.API_KEY = key;
    }

    createPrompt(context, language) {
        // Extract cursor position from context
        const cursorIndex = context.indexOf('▼');
        const beforeCursor = context.substring(0, cursorIndex);
        const afterCursor = context.substring(cursorIndex + 1);

        return [
            {
                role: 'system',
                content: `You are a precise code completion model for ${language}. Follow these rules:
1. Complete the code at the cursor position (▼) naturally
2. Focus on the local context and variable names
3. Maintain consistent style with the surrounding code
4. Only provide the completion text, no explanations
5. Ensure syntactic correctness
6. Use existing variables and functions when appropriate`
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
        if (!this.API_KEY) {
            throw new Error('OpenAI API key not set');
        }

        try {
            const response = await fetch(this.API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.API_KEY}`
                },
                body: JSON.stringify({
                    model: this.MODEL,
                    messages,
                    ...this.CONFIG,
                    n
                }),
                signal // Add abort signal to fetch request
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error?.message || 'API request failed');
            }

            const data = await response.json();
            return data.choices;
        } catch (error) {
            console.error('API request failed:', error);
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
