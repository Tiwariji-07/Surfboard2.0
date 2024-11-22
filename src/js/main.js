/**
 * WaveMaker Copilot Main Entry Point
 * Initializes and coordinates all copilot components
 */

import WaveMakerMarkupParser from './context/parser.js';
import WaveMakerContextManager from './context/manager.js';
import WaveMakerAIEngine from './ai/engine.js';
import WaveMakerCopilotSidebar from './ui/sidebar.js';
import WaveMakerCopilotChat from './ui/chat.js';

class WaveMakerCopilot {
    constructor() {
        // Initialize components
        this.contextManager = new WaveMakerContextManager();
        this.aiEngine = new WaveMakerAIEngine();
        this.sidebar = new WaveMakerCopilotSidebar();
        this.chat = null; // Will be initialized after sidebar
    }

    /**
     * Initialize the copilot
     * @param {string} apiKey - OpenAI API key
     */
    async initialize(apiKey) {
        try {
            // Initialize AI engine
            this.aiEngine.initialize(apiKey);

            // Initialize sidebar
            this.sidebar.initialize();

            // Initialize chat interface
            const chatContainer = this.sidebar.getChatContainer();
            this.chat = new WaveMakerCopilotChat(chatContainer, this.aiEngine);
            this.chat.initialize();

            // Set up context update listener
            document.addEventListener('wmContextUpdate', (e) => {
                this.handleContextUpdate(e.detail.context);
            });

            console.log('WaveMaker Copilot initialized successfully');
        } catch (error) {
            console.error('Error initializing WaveMaker Copilot:', error);
            this.sidebar.showError('Failed to initialize Copilot');
        }
    }

    /**
     * Handle context updates
     * @param {Object} context - Updated context
     */
    handleContextUpdate(context) {
        // Update sidebar context panel
        this.sidebar.updateContextPanel(context);
    }

    /**
     * Show the copilot interface
     */
    show() {
        this.sidebar.show();
    }

    /**
     * Hide the copilot interface
     */
    hide() {
        this.sidebar.hide();
    }
}

// Create and export copilot instance
const copilot = new WaveMakerCopilot();
export default copilot;

// Initialize copilot when the page loads
document.addEventListener('DOMContentLoaded', async () => {
    // Get API key from storage or environment
    const apiKey = await getApiKey();
    
    if (apiKey) {
        copilot.initialize(apiKey);
    } else {
        console.error('No API key found for WaveMaker Copilot');
    }
});

/**
 * Get API key from storage or environment
 * @returns {Promise<string>} API key
 */
async function getApiKey() {
    // Try to get from chrome.storage
    if (chrome.storage) {
        try {
            const result = await chrome.storage.sync.get(['openaiApiKey']);
            if (result.openaiApiKey) {
                return result.openaiApiKey;
            }
        } catch (error) {
            console.error('Error getting API key from storage:', error);
        }
    }

    // Fallback to environment variable or prompt user
    return prompt('Please enter your OpenAI API key:');
}
