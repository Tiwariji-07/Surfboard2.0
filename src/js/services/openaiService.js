class OpenAIService {
    constructor() {
        this.apiKey = null;
        this.baseURL = 'https://api.openai.com/v1/chat/completions';
    }

    async setApiKey(key) {
        this.apiKey = key;
    }

    async analyzeLogs(logs) {
        if (!this.apiKey) {
            throw new Error('OpenAI API key not set');
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
            const response = await fetch(this.baseURL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: messages,
                    temperature: 0.2,
                    max_tokens: 500
                })
            });

            if (!response.ok) {
                throw new Error(`OpenAI API error: ${response.statusText}`);
            }

            const data = await response.json();
            return data.choices[0].message.content;
        } catch (error) {
            console.error('Error analyzing logs:', error);
            throw error;
        }
    }
}

export default new OpenAIService();
