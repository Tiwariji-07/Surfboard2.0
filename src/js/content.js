/**
 * WaveMaker Copilot Content Script
 * Main entry point for the extension's content script
 */

// Global instance
let copilotInstance = null;

import WMContextManager from './context/wmContext.js';
import WaveMakerCopilotSidebar from './ui/sidebar.js';
import CompletionManager from './completion/completionManager.js';
import { LogService } from './services/logService.js';

class SurfboardAI {
    constructor() {
        this.contextManager = new WMContextManager();
        this.apiKey = null;
        this.model = 'llama3-8b-8192';
        this.apiEndpoint = 'https://api.groq.com/openai/v1';
        this.isInitialized = false;
        this.sidebar = null;
        this.completionManager = null;
        this.logService = null;
        this.initialize();
        this.initializeLogService();
    }

    async initialize() {
        try {
            console.log('Initializing SurfboardAI...');
            
            // Initialize log service first to catch any initialization errors
            this.logService = new LogService();
            await this.initializeLogService();

            // Initialize completion manager first
            this.completionManager = new CompletionManager();
            console.log('CompletionManager initialized');
            
            // Load API key
            this.apiKey=await this.loadConfiguration();
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
            console.error('Failed to initialize SurfboardAI:', error);
        }
    }
    async initializeLogService() {
        try {
            // Get OpenAI API key
            const apiKey = await this.getOpenAIKey();
            if (!apiKey) {
                console.warn('OpenAI API key not found');
                this.showError('OpenAI API key not configured. AI analysis will not be available.');
                return;
            }

            // Initialize service with API key
            await this.logService.initialize(apiKey);
            // await this.refreshLogs();
        } catch (error) {
            console.error('Error initializing LogService:', error);
            this.showError('Failed to initialize log service: ' + error.message);
        }
    }
    async getOpenAIKey() {
        return new Promise((resolve) => {
            chrome.storage.sync.get(['openaiApiKey'], (result) => {
                resolve(result.openaiApiKey);
            });
        });
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

                    // const response = await fetch(this.apiEndpoint, {
                    //     method: 'POST',
                    //     headers: {
                    //         'Content-Type': 'application/json',
                    //     },
                    //     body: JSON.stringify({
                    //         "query": message,
                    //     })
                    // });

                    if (!response.ok) {
                        throw new Error('API request failed');
                    }

                    const data = await response.json();
                    const reply = data.choices[0].message.content;
                    // const reply = data.answer;

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
        return new Promise((resolve) => {
            chrome.storage.sync.get(['groqApiKey'], (result) => {
                resolve(result.groqApiKey);
            });
        });
    }
}

// Initialize on page load
window.addEventListener('load', () => {
    copilotInstance = new SurfboardAI();
});

// Export for use in other modules
export default SurfboardAI;
