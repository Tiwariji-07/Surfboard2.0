/**
 * WaveMaker AI Engine
 * Handles AI processing and response generation for the copilot
 */

export default class WaveMakerAIEngine {
    constructor() {
        this.apiKey = null;
        this.baseUrl = 'https://api.groq.com/v1';
        this.model = 'mixtral-8x7b-32768';  // Groq's Mixtral model
        
        // Initialize conversation history
        this.conversationHistory = [];
        this.MAX_HISTORY = 10;
    }

    /**
     * Initialize the AI engine with API key
     * @param {string} apiKey - Groq API key
     */
    initialize(apiKey) {
        this.apiKey = apiKey;
    }

    /**
     * Process a user query with context
     * @param {string} query - User's query
     * @param {Object} context - Current WaveMaker context
     * @returns {Promise<Object>} AI response
     */
    async processQuery(query, context) {
        try {
            // Prepare the prompt with context
            const prompt = this.preparePrompt(query, context);
            
            // Get AI response
            const response = await this.callAI(prompt);
            
            // Process and enhance the response
            const enhancedResponse = this.enhanceResponse(response, context);
            
            // Update conversation history
            this.updateHistory(query, enhancedResponse);
            
            return enhancedResponse;
        } catch (error) {
            console.error('Error processing query:', error);
            throw error;
        }
    }

    /**
     * Prepare the prompt for the AI model
     * @param {string} query - User's query
     * @param {Object} context - Current context
     * @returns {Object} Formatted prompt
     */
    preparePrompt(query, context) {
        return {
            messages: [
                {
                    role: 'system',
                    content: this.getSystemPrompt()
                },
                ...this.getRelevantHistory(),
                {
                    role: 'user',
                    content: this.formatQueryWithContext(query, context)
                }
            ]
        };
    }

    /**
     * Get the system prompt
     * @returns {string} System prompt
     */
    getSystemPrompt() {
        return `You are an AI assistant specialized in WaveMaker development. 
        You understand WaveMaker's components, patterns, and best practices. 
        Provide clear, concise, and practical assistance for WaveMaker development tasks.`;
    }

    /**
     * Format the query with context
     * @param {string} query - User's query
     * @param {Object} context - Current context
     * @returns {string} Formatted query
     */
    formatQueryWithContext(query, context) {
        return JSON.stringify({
            query,
            currentContext: {
                activePage: context.activePage,
                activeComponent: context.activeComponent,
                relevantComponents: this.extractRelevantComponents(context),
                projectContext: this.extractProjectContext(context)
            }
        });
    }

    /**
     * Extract relevant components from context
     * @param {Object} context - Current context
     * @returns {Array} Relevant components
     */
    extractRelevantComponents(context) {
        // Implementation depends on context structure
        return [];
    }

    /**
     * Extract project context
     * @param {Object} context - Current context
     * @returns {Object} Project context
     */
    extractProjectContext(context) {
        // Implementation depends on context structure
        return {};
    }

    /**
     * Call the AI API
     * @param {Object} prompt - Prepared prompt
     * @returns {Promise<Object>} AI response
     */
    async callAI(prompt) {
        if (!this.apiKey) {
            throw new Error('AI Engine not initialized with API key');
        }

        try {
            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: prompt.messages,
                    temperature: 0.7,
                    max_tokens: 4096,
                    top_p: 1,
                    stream: false
                })
            });

            if (!response.ok) {
                throw new Error(`AI API error: ${response.statusText}`);
            }

            const data = await response.json();
            return data.choices[0].message.content;
        } catch (error) {
            console.error('Error calling AI API:', error);
            throw error;
        }
    }

    /**
     * Enhance the AI response with additional context
     * @param {string} response - Raw AI response
     * @param {Object} context - Current context
     * @returns {Object} Enhanced response
     */
    enhanceResponse(response, context) {
        return {
            content: response,
            suggestions: this.generateSuggestions(response, context),
            codeSnippets: this.extractCodeSnippets(response),
            relatedDocs: this.findRelatedDocs(response, context),
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Generate additional suggestions based on the response
     * @param {string} response - AI response
     * @param {Object} context - Current context
     * @returns {Array} Suggestions
     */
    generateSuggestions(response, context) {
        // Implementation for generating additional suggestions
        return [];
    }

    /**
     * Extract code snippets from response
     * @param {string} response - AI response
     * @returns {Array} Code snippets
     */
    extractCodeSnippets(response) {
        // Implementation for extracting code snippets
        return [];
    }

    /**
     * Find related documentation
     * @param {string} response - AI response
     * @param {Object} context - Current context
     * @returns {Array} Related documentation
     */
    findRelatedDocs(response, context) {
        // Implementation for finding related documentation
        return [];
    }

    /**
     * Update conversation history
     * @param {string} query - User's query
     * @param {Object} response - AI response
     */
    updateHistory(query, response) {
        this.conversationHistory.push({
            query,
            response,
            timestamp: new Date().toISOString()
        });

        // Keep only the last MAX_HISTORY items
        if (this.conversationHistory.length > this.MAX_HISTORY) {
            this.conversationHistory = this.conversationHistory.slice(-this.MAX_HISTORY);
        }
    }

    /**
     * Get relevant conversation history
     * @returns {Array} Relevant history
     */
    getRelevantHistory() {
        return this.conversationHistory.slice(-3).flatMap(item => [
            { role: 'user', content: item.query },
            { role: 'assistant', content: item.response.content }
        ]);
    }
}
