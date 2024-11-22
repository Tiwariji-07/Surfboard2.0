/**
 * WaveMaker Copilot Chat Interface
 * Manages the chat UI and interactions
 */

export default class WaveMakerCopilotChat {
    constructor(container, aiEngine) {
        this.container = container;
        this.aiEngine = aiEngine;
        this.messages = [];
        this.isProcessing = false;
    }

    /**
     * Initialize the chat interface
     */
    initialize() {
        this.createChatInterface();
        this.setupEventListeners();
    }

    /**
     * Create the chat interface elements
     */
    createChatInterface() {
        this.container.innerHTML = `
            <div class="chat-messages"></div>
            <div class="chat-input-area">
                <textarea 
                    class="chat-input" 
                    placeholder="Ask me anything about WaveMaker development..."
                    rows="1"
                ></textarea>
                <button class="send-button">
                    <svg width="20" height="20" viewBox="0 0 24 24">
                        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                    </svg>
                </button>
            </div>
        `;

        this.messagesContainer = this.container.querySelector('.chat-messages');
        this.inputArea = this.container.querySelector('.chat-input-area');
        this.input = this.container.querySelector('.chat-input');
        this.sendButton = this.container.querySelector('.send-button');
    }

    /**
     * Set up event listeners for chat interactions
     */
    setupEventListeners() {
        // Send message on button click
        this.sendButton.addEventListener('click', () => this.sendMessage());

        // Send message on Enter (but new line on Shift+Enter)
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Auto-resize input
        this.input.addEventListener('input', () => this.autoResizeInput());
    }

    /**
     * Auto-resize the input textarea
     */
    autoResizeInput() {
        this.input.style.height = 'auto';
        this.input.style.height = (this.input.scrollHeight) + 'px';
    }

    /**
     * Send a message
     */
    async sendMessage() {
        const message = this.input.value.trim();
        if (!message || this.isProcessing) return;

        // Clear input
        this.input.value = '';
        this.autoResizeInput();

        // Add user message to chat
        this.addMessage('user', message);

        // Process message
        this.isProcessing = true;
        this.showTypingIndicator();

        try {
            const response = await this.aiEngine.processQuery(message, {});
            this.hideTypingIndicator();
            this.addMessage('assistant', response.content);

            // Add suggestions if any
            if (response.suggestions?.length > 0) {
                this.addSuggestions(response.suggestions);
            }
        } catch (error) {
            console.error('Error processing message:', error);
            this.hideTypingIndicator();
            this.addErrorMessage('Sorry, I encountered an error. Please try again.');
        }

        this.isProcessing = false;
        this.scrollToBottom();
    }

    /**
     * Add a message to the chat
     * @param {string} role - Message role ('user' or 'assistant')
     * @param {string} content - Message content
     */
    addMessage(role, content) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${role}-message`;
        
        messageDiv.innerHTML = `
            <div class="message-content">
                ${this.formatMessageContent(content)}
            </div>
            ${role === 'assistant' ? this.createMessageActions() : ''}
        `;

        this.messagesContainer.appendChild(messageDiv);
        this.messages.push({ role, content });
        this.scrollToBottom();
    }

    /**
     * Format message content with markdown and code highlighting
     * @param {string} content - Raw message content
     * @returns {string} Formatted HTML
     */
    formatMessageContent(content) {
        // Basic markdown formatting
        let formatted = content
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\*\*([^\*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/\*([^\*]+)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br>');

        // Code block formatting
        formatted = formatted.replace(
            /```(\w+)?\n([\s\S]+?)\n```/g,
            (_, language, code) => `
                <pre class="code-block ${language || ''}">
                    <code>${this.escapeHtml(code.trim())}</code>
                </pre>
            `
        );

        return formatted;
    }

    /**
     * Create message action buttons
     * @returns {string} Action buttons HTML
     */
    createMessageActions() {
        return `
            <div class="message-actions">
                <button class="action-button copy-button" title="Copy to clipboard">
                    <svg width="16" height="16" viewBox="0 0 24 24">
                        <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                    </svg>
                </button>
            </div>
        `;
    }

    /**
     * Add suggestions to the chat
     * @param {Array} suggestions - List of suggestions
     */
    addSuggestions(suggestions) {
        const suggestionsDiv = document.createElement('div');
        suggestionsDiv.className = 'chat-suggestions';
        
        suggestionsDiv.innerHTML = `
            <div class="suggestions-content">
                ${suggestions.map(suggestion => `
                    <button class="suggestion-button">
                        ${this.escapeHtml(suggestion)}
                    </button>
                `).join('')}
            </div>
        `;

        this.messagesContainer.appendChild(suggestionsDiv);
        
        // Add click handlers
        suggestionsDiv.querySelectorAll('.suggestion-button').forEach(button => {
            button.addEventListener('click', () => {
                this.input.value = button.textContent;
                this.sendMessage();
            });
        });
    }

    /**
     * Add an error message to the chat
     * @param {string} message - Error message
     */
    addErrorMessage(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'chat-message error-message';
        errorDiv.textContent = message;
        this.messagesContainer.appendChild(errorDiv);
        this.scrollToBottom();
    }

    /**
     * Show typing indicator
     */
    showTypingIndicator() {
        const indicator = document.createElement('div');
        indicator.className = 'typing-indicator';
        indicator.innerHTML = `
            <span></span>
            <span></span>
            <span></span>
        `;
        this.messagesContainer.appendChild(indicator);
        this.scrollToBottom();
    }

    /**
     * Hide typing indicator
     */
    hideTypingIndicator() {
        const indicator = this.messagesContainer.querySelector('.typing-indicator');
        if (indicator) {
            indicator.remove();
        }
    }

    /**
     * Scroll chat to bottom
     */
    scrollToBottom() {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    /**
     * Escape HTML special characters
     * @param {string} html - HTML string
     * @returns {string} Escaped HTML
     */
    escapeHtml(html) {
        const div = document.createElement('div');
        div.textContent = html;
        return div.innerHTML;
    }

    /**
     * Clear chat history
     */
    clearChat() {
        this.messages = [];
        this.messagesContainer.innerHTML = '';
    }

    /**
     * Export chat history
     * @returns {Array} Chat history
     */
    exportHistory() {
        return this.messages.map(message => ({
            ...message,
            timestamp: new Date().toISOString()
        }));
    }
}
