/**
 * WaveMaker Copilot Content Script
 * Main entry point for the extension's content script
 */

// Global instance
let copilotInstance = null;

import WMContextManager from './context/wmContext.js';
import WaveMakerCopilotSidebar from './ui/sidebar.js';
import CompletionManager from './completion/completionManager.js';

class SurfboardAI {
    constructor() {
        this.contextManager = new WMContextManager();
        this.apiKey = null;
        this.model = 'llama3-8b-8192';
        this.apiEndpoint = 'https://api.groq.com/openai/v1';
        this.isInitialized = false;
        this.sidebar = null;
        this.completionManager = null;
        this.initialize();
    }

    async initialize() {
        try {
            console.log('Initializing SurfboardAI...');
            
            // Initialize completion manager first
            this.completionManager = new CompletionManager();
            console.log('CompletionManager initialized');
            
            // Load API key
            await this.loadConfiguration();
            this.sidebar = new WaveMakerCopilotSidebar();
            await this.contextManager.initialize();
            this.setupMessageListener();
            this.isInitialized = true;
            
            // Add initial greeting
            this.sidebar.addMessage(
                "Hello! 👋 I'm your Surfboard AI assistant. I can help you with:\n\n" +
                "- Writing and editing code\n" +
                "- Answering questions about WaveMaker\n" +
                "- Providing code examples\n" +
                "- Debugging issues\n\n" +
                "How can I assist you today?",
                'assistant'
            );
            
            console.log('Surfboard.AI initialized successfully');
        } catch (error) {
            console.error('Error initializing SurfboardAI:', error);
        }
    }

    setupMessageListener() {
        document.addEventListener('surfboard-message', async (event) => {
            const { message, type } = event.detail;
            
            if (type === 'user') {
                try {
                    // Show thinking state
                    this.sidebar.addMessage('Thinking...', 'assistant');
                    
                    // Get current context
                    const context = this.contextManager.getRelevantContext(message);
                    
                    // Prepare the API request
                    const response = await fetch(this.apiEndpoint + '/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${this.apiKey}`
                        },
                        body: JSON.stringify({
                            model: this.model,
                            messages: [
                                {
                                    role: 'system',
                                    content: `You are Surfboard AI, a WaveMaker development assistant. Current context: ${JSON.stringify(context)}`
                                },
                                {
                                    role: 'user',
                                    content: message
                                }
                            ],
                            temperature: 0.7,
                            max_tokens: 2000
                        })
                    });

                    if (!response.ok) {
                        throw new Error('API request failed');
                    }

                    const data = await response.json();
                    const reply = data.choices[0].message.content;

                    // Remove thinking message
                    this.sidebar.chatContainer.lastChild.remove();
                    
                    // Add AI response
                    this.sidebar.addMessage(reply, 'assistant');
                } catch (error) {
                    console.error('Failed to process message:', error);
                    this.sidebar.addMessage(
                        'Sorry, I encountered an error while processing your message. Please try again.',
                        'assistant'
                    );
                }
            }
        });
    }

    async loadConfiguration() {
        // Load API key from storage
        const result = await chrome.storage.sync.get(['apiKey']);
        this.apiKey = result.apiKey;
        
        if (!this.apiKey) {
            throw new Error('API key not found');
        }
    }
}

// Initialize on page load
window.addEventListener('load', () => {
    copilotInstance = new SurfboardAI();
});

// Export for use in other modules
export default SurfboardAI;
