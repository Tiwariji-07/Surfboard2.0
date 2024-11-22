/**
 * WaveMaker Copilot Content Script
 * Main entry point for the extension's content script
 */

// Global instance
let copilotInstance = null;

class WaveMakerCopilot {
    constructor() {
        console.log('Creating WaveMaker Copilot instance...');
        
        // Create instances
        this.parser = new WaveMakerMarkupParser();
        this.contextManager = new WaveMakerContextManager(this.parser);
        this.aiEngine = new WaveMakerAIEngine();
        this.sidebar = null;
        this.chat = null;
        this.initialized = false;

        // Bind methods
        this.initialize = this.initialize.bind(this);
        this.setupMessageListeners = this.setupMessageListeners.bind(this);
    }

    async initialize() {
        if (this.initialized) return;

        try {
            console.log('Initializing WaveMaker Copilot...');

            // Initialize context manager
            await this.contextManager.initialize();
            console.log('Context manager initialized');

            // Create sidebar
            this.sidebar = new WaveMakerCopilotSidebar();
            await this.sidebar.initialize();
            console.log('Sidebar initialized');

            // Create chat interface
            this.chat = new WaveMakerCopilotChat(this.sidebar.getChatContainer(), this.aiEngine);
            await this.chat.initialize();
            console.log('Chat interface initialized');

            // Set up message listeners
            this.setupMessageListeners();
            console.log('Message listeners set up');

            // Load API key from storage
            const { apiKey } = await chrome.storage.sync.get('apiKey');
            if (apiKey) {
                this.aiEngine.initialize(apiKey);
                console.log('AI Engine initialized with API key');
            }

            this.initialized = true;
            console.log('WaveMaker Copilot initialized successfully');

            // Notify background script that we're ready
            await chrome.runtime.sendMessage({ 
                type: 'CONTENT_SCRIPT_READY'
            });
            console.log('Sent ready message to background script');

        } catch (error) {
            console.error('Failed to initialize WaveMaker Copilot:', error);
            throw error;
        }
    }

    setupMessageListeners() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            console.log('Content script received message:', message.type);
            
            try {
                switch (message.type) {
                    case 'TOGGLE_COPILOT':
                        if (this.sidebar) {
                            this.sidebar.toggle();
                            sendResponse({ success: true });
                        } else {
                            throw new Error('Sidebar not initialized');
                        }
                        break;

                    case 'API_KEY_UPDATED':
                        if (this.aiEngine) {
                            this.aiEngine.initialize(message.apiKey);
                            sendResponse({ success: true });
                        } else {
                            throw new Error('AI Engine not initialized');
                        }
                        break;

                    default:
                        throw new Error('Unknown message type');
                }
            } catch (error) {
                console.error('Error handling message:', error);
                sendResponse({ error: error.message });
            }

            return true;
        });
    }
}

class WaveMakerMarkupParser {
    constructor() {
        // Parser implementation
    }
}

class WaveMakerContextManager {
    constructor(parser) {
        this.parser = parser;
    }

    async initialize() {
        // Context manager initialization
    }
}

class WaveMakerAIEngine {
    constructor() {
        this.baseUrl = 'https://api.groq.com/openai/v1';
        this.model = 'llama3-8b-8192';
        this.apiKey = null;
    }

    initialize(apiKey) {
        this.apiKey = apiKey;
    }
}

class WaveMakerCopilotSidebar {
    constructor() {
        this.container = null;
        this.chatContainer = null;
        this.isVisible = false;
        this.floatingIcon = null;
    }

    async initialize() {
        // Create floating icon
        this.floatingIcon = document.createElement('div');
        this.floatingIcon.className = 'wm-copilot-floating-icon';
        
        // Create icon image
        const iconImg = document.createElement('img');
        iconImg.src = chrome.runtime.getURL('src/icons/icon32.png');
        this.floatingIcon.appendChild(iconImg);
        
        // Add click handler
        this.floatingIcon.addEventListener('click', () => this.toggle());
        
        // Create sidebar container
        this.container = document.createElement('div');
        this.container.id = 'wm-copilot-sidebar';
        this.container.className = 'wm-copilot-sidebar';
        
        // Create header
        const header = document.createElement('div');
        header.className = 'wm-copilot-header';
        
        const title = document.createElement('h2');
        title.textContent = 'WaveMaker Copilot';
        header.appendChild(title);
        
        const closeButton = document.createElement('button');
        closeButton.className = 'wm-copilot-close';
        closeButton.textContent = '×';
        closeButton.addEventListener('click', () => this.toggle());
        header.appendChild(closeButton);
        
        this.container.appendChild(header);
        
        // Create chat container
        this.chatContainer = document.createElement('div');
        this.chatContainer.className = 'wm-copilot-chat-container';
        this.container.appendChild(this.chatContainer);
        
        // Add to body
        document.body.appendChild(this.floatingIcon);
        document.body.appendChild(this.container);
    }

    getChatContainer() {
        return this.chatContainer;
    }

    toggle() {
        this.isVisible = !this.isVisible;
        if (this.isVisible) {
            this.container.classList.add('visible');
        } else {
            this.container.classList.remove('visible');
        }
    }
}

class WaveMakerCopilotChat {
    constructor(container, aiEngine) {
        this.container = container;
        this.aiEngine = aiEngine;
        this.messages = [];
        this.messagesList = null;
        this.inputContainer = null;
        this.textArea = null;
        this.sendButton = null;
        this.isProcessing = false;
    }

    async initialize() {
        console.log('Initializing chat interface...');
        
        // Create messages list
        this.messagesList = document.createElement('div');
        this.messagesList.className = 'wm-copilot-messages';
        this.container.appendChild(this.messagesList);

        // Create input container
        this.inputContainer = document.createElement('div');
        this.inputContainer.className = 'wm-copilot-input-container';

        // Create textarea
        this.textArea = document.createElement('textarea');
        this.textArea.className = 'wm-copilot-input';
        this.textArea.placeholder = 'Ask me anything about WaveMaker development...';
        this.textArea.rows = 3;
        
        // Handle Enter key
        this.textArea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Create send button
        this.sendButton = document.createElement('button');
        this.sendButton.className = 'wm-copilot-send';
        this.sendButton.textContent = 'Send';
        this.sendButton.addEventListener('click', () => this.sendMessage());

        // Add elements to container
        this.inputContainer.appendChild(this.textArea);
        this.inputContainer.appendChild(this.sendButton);
        this.container.appendChild(this.inputContainer);

        console.log('Adding welcome message...');
        // Add welcome message
        this.addMessage({
            role: 'assistant',
            content: 'Hello! I\'m your WaveMaker Copilot. I can help you with:\n\n' +
                     '• Writing and debugging code\n' +
                     '• Understanding WaveMaker concepts\n' +
                     '• Best practices and patterns\n' +
                     '• Finding documentation\n\n' +
                     'What would you like help with?'
        });
    }

    addMessage(message) {
        console.log('Adding message:', message.role);
        // Create message element
        const messageEl = document.createElement('div');
        messageEl.className = `wm-copilot-message ${message.role}`;
        
        // Format content with markdown
        const formattedContent = message.content.replace(/\n/g, '<br>');
        messageEl.innerHTML = formattedContent;
        
        // Add to messages list and array
        this.messagesList.appendChild(messageEl);
        this.messages.push(message);
        
        // Scroll to bottom
        this.messagesList.scrollTop = this.messagesList.scrollHeight;
    }

    async sendMessage() {
        if (this.isProcessing || !this.textArea.value.trim()) return;

        try {
            this.isProcessing = true;
            this.sendButton.disabled = true;
            
            // Get user input
            const userMessage = this.textArea.value.trim();
            this.textArea.value = '';
            
            // Add user message to chat
            this.addMessage({
                role: 'user',
                content: userMessage
            });

            // Check if API key is set
            if (!this.aiEngine.apiKey) {
                this.addMessage({
                    role: 'assistant',
                    content: 'Please set your Groq API key in the extension settings first. Click the extension icon in your browser toolbar to add your API key.'
                });
                return;
            }

            // Add thinking message
            const thinkingEl = document.createElement('div');
            thinkingEl.className = 'wm-copilot-message assistant thinking';
            thinkingEl.textContent = 'Thinking...';
            this.messagesList.appendChild(thinkingEl);

            try {
                console.log('Making API request to Groq...');
                // Make API request
                const response = await fetch(`${this.aiEngine.baseUrl}/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.aiEngine.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: this.aiEngine.model,
                        messages: [
                            {
                                role: 'system',
                                content: 'You are WaveMaker Copilot, an AI assistant specialized in helping developers with WaveMaker low-code platform development. You provide clear, concise, and accurate responses focused on WaveMaker development best practices.'
                            },
                            ...this.messages.slice(-10).map(m => ({
                                role: m.role,
                                content: m.content
                            }))
                        ],
                        temperature: 0.7,
                        max_tokens: 2048
                    })
                });

                console.log('API response status:', response.status);
                const responseText = await response.text();
                console.log('API response text:', responseText);

                if (!response.ok) {
                    let errorMessage = `API request failed (${response.status})`;
                    try {
                        const errorData = JSON.parse(responseText);
                        if (errorData.error && errorData.error.message) {
                            errorMessage += `: ${errorData.error.message}`;
                        }
                    } catch (e) {
                        errorMessage += `: ${responseText}`;
                    }
                    throw new Error(errorMessage);
                }

                const data = JSON.parse(responseText);
                const assistantMessage = data.choices[0].message.content;

                // Remove thinking message
                this.messagesList.removeChild(thinkingEl);

                // Add assistant response
                this.addMessage({
                    role: 'assistant',
                    content: assistantMessage
                });

            } catch (error) {
                console.error('Error making API request:', error);
                // Remove thinking message
                this.messagesList.removeChild(thinkingEl);
                
                // Show error message with more details
                this.addMessage({
                    role: 'assistant',
                    content: `Sorry, I encountered an error while processing your request. Please check your API key and try again.\n\nError details: ${error.message}`
                });
            }

        } finally {
            this.isProcessing = false;
            this.sendButton.disabled = false;
        }
    }
}

// Initialize when DOM is ready
function initializeCopilot() {
    console.log('Starting copilot initialization...');
    try {
        if (!copilotInstance) {
            copilotInstance = new WaveMakerCopilot();
            copilotInstance.initialize()
                .catch(error => {
                    console.error('Failed to initialize copilot:', error);
                    copilotInstance = null;
                });
        }
    } catch (error) {
        console.error('Error creating copilot instance:', error);
        setTimeout(initializeCopilot, 500);
    }
}

// Start initialization
console.log('Content script loaded, waiting for DOM...');
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeCopilot);
} else {
    initializeCopilot();
}
