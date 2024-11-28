import aiService from '../services/aiService.js';

class CompletionManager {
    constructor() {
        this.currentEditor = null;
        this.editorType = null;
        this.monacoInstance = null;
        this.inlineDecorationIds = [];
        this.lastInlineText = '';
        this.isProcessingInline = false;
        this.initializeAttempts = 0;
        this.maxInitializeAttempts = 20; // 10 seconds total (20 * 500ms)
        this._inlineProviderRegistered = false;
        this.contextWindow = 5; // Number of lines to include for context
        
        // Configuration for inline completions
        this.inlineConfig = {
            debounceTime: 500,      // Increased to 500ms
            minRequestInterval: 750, // Minimum time between requests
            maxPendingRequests: 1    // Maximum number of pending requests
        };

        // Create debounced handlers
        this.debouncedHandleContentChange = this.debounce(
            this.handleContentChange.bind(this),
            this.inlineConfig.debounceTime
        );

        // Start initialization
        this.initialize();
    }

    debounce(func, wait) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                func.apply(this, args);
            }, wait);
        };
    }

    throttle(func, limit) {
        let inThrottle;
        return (...args) => {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    initialize() {
        // console.log('CompletionManager initializing...');
        this.injectMonacoHelper();
        this.setupMessageListener();
        this.setupAPIKey();
        this.setupEditorObserver();
        // console.log('CompletionManager initialized');
    }

    setupAPIKey() {
        // Get API key from storage
        chrome.storage.sync.get(['openaiApiKey'], (result) => {
            if (result.openaiApiKey) {
                aiService.setApiKey(result.openaiApiKey);
            }
        });

        // Listen for API key changes
        chrome.storage.onChanged.addListener((changes) => {
            if (changes.openaiApiKey) {
                aiService.setApiKey(changes.openaiApiKey.newValue);
            }
        });
    }

    injectMonacoHelper() {
        var s = document.createElement('script');
        s.src = chrome.runtime.getURL('src/js/inject/monacoHelper.js');
        s.onload = function() { this.remove(); };
        (document.head || document.documentElement).appendChild(s);
    }

    setupMessageListener() {
        window.addEventListener('message', (event) => {
            if (event.source !== window) return;

            const { type, data } = event.data;
            
            switch (type) {
                case 'MONACO_HELPER_READY':
                    // console.log('Monaco helper ready, setting up completion provider...');
                    // Send message to page context
                    window.postMessage({
                        type: 'SETUP_COMPLETION_PROVIDER',
                        languages: ['javascript', 'typescript', 'html', 'css']
                    }, '*');
                    break;
                case 'GET_EDITOR_INSTANCE_RESPONSE':
                    // console.log('Got editor instance response:', data);
                    if (data && data.success) {
                        this.monacoInstance = data.editor;
                        // console.log('Monaco instance set:', this.monacoInstance);
                    }
                    break;
                case 'SETUP_PROVIDER_RESPONSE':
                    // console.log('Completion provider setup response:', data);
                    if (data && data.success) {
                        // console.log('Completion provider registered successfully');
                    } else {
                        console.error('Failed to setup completion provider:', data?.error);
                    }
                    break;
                case 'GET_INLINE_COMPLETIONS':
                    // console.log('Getting inline completions for:', data);
                    this.handleCompletionRequest(data);
                    break;
            }
        });
    }

    async handleCompletionRequest(data) {
        // Check if we should skip this request
        const now = Date.now();
        if (now - this._lastRequestTime < this.inlineConfig.minRequestInterval) {
            return;
        }
        this._lastRequestTime = now;

        try {
            const context = this.getContext(data);
            if (!context) return;

            // Cancel any pending request
            if (this._pendingRequest) {
                this._pendingRequest.abort();
            }

            // Create new request
            const controller = new AbortController();
            this._pendingRequest = controller;

            // Get completions from AI service
            const completions = await aiService.getMultipleCompletions(
                context.text,
                context.language,
                3, // Number of completions
                controller.signal // Pass signal separately
            );
            
            // Clear pending request if this one completed
            if (this._pendingRequest === controller) {
                this._pendingRequest = null;
            }

            // Calculate proper range based on word position
            const startColumn = data.wordUntil ? data.wordUntil.endColumn : data.position.column;
            
            // Send completions back to the editor
            window.postMessage({
                type: 'INLINE_COMPLETIONS_RESPONSE',
                data: {
                    modelId: data.modelId,
                    items: completions.map(completion => ({
                        text: completion,
                        range: {
                            startLineNumber: data.position.lineNumber,
                            startColumn: startColumn,
                            endLineNumber: data.position.lineNumber,
                            endColumn: startColumn
                        }
                    }))
                }
            }, '*');
        } catch (error) {
            if (error.name === 'AbortError') {
                // console.log('Completion request cancelled');
            } else {
                console.error('Error handling completion request:', error);
            }
            // Send empty completions on error
            window.postMessage({
                type: 'INLINE_COMPLETIONS_RESPONSE',
                data: {
                    modelId: data.modelId,
                    items: []
                }
            }, '*');
        }
    }

    getContext(data) {
        const { contextText, position, language, cursorOffset } = data;
        
        // Split the text into before and after cursor
        const prefix = contextText.slice(0, cursorOffset);
        const suffix = contextText.slice(cursorOffset);
        
        // Calculate relative cursor position
        const lines = prefix.split('\n');
        const cursorLine = lines.length;
        const cursorColumn = lines[lines.length - 1].length + 1;
        
        // Combine the context with cursor position marker
        return {
            text: `${prefix}▼${suffix}`,
            language,
            cursorLine,
            cursorColumn
        };
    }

    setupEditorObserver() {
        // console.log('Setting up editor observer...');
        // Watch for WaveMaker editor elements being added to the DOM
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // Try all possible WaveMaker editor containers
                        const containers = [
                            ...node.querySelectorAll('wms-editor, .wm-code-editor, .monaco-editor'),
                            ...(node.matches('wms-editor, .wm-code-editor, .monaco-editor') ? [node] : [])
                        ];
                        
                        for (const container of containers) {
                            // console.log('Found potential editor container:', container.className || container.tagName);
                            
                            // For wms-editor, look inside the shadow DOM if it exists
                            if (container.tagName.toLowerCase() === 'wms-editor' && container.shadowRoot) {
                                const shadowEditor = container.shadowRoot.querySelector('.monaco-editor');
                                if (shadowEditor && !shadowEditor.classList.contains('rename-box')) {
                                    // console.log('Found Monaco editor in shadow DOM');
                                    this.setupEditorListeners(shadowEditor);
                                }
                                continue;
                            }
                            
                            // For regular containers, look for Monaco editor directly
                            const editor = container.matches('.monaco-editor') ? 
                                container : container.querySelector('.monaco-editor');
                                
                            if (editor && !editor.classList.contains('rename-box')) {
                                // console.log('Found Monaco editor');
                                this.setupEditorListeners(editor);
                            }
                        }
                    }
                }
            }
        });

        // Check for existing editors
        // console.log('Checking for existing editors...');
        ['wms-editor', '.wm-code-editor', '.monaco-editor'].forEach(selector => {
            const existingEditors = document.querySelectorAll(selector);
            existingEditors.forEach(container => {
                // console.log('Found existing container:', selector);
                
                if (container.tagName.toLowerCase() === 'wms-editor' && container.shadowRoot) {
                    const shadowEditor = container.shadowRoot.querySelector('.monaco-editor');
                    if (shadowEditor && !shadowEditor.classList.contains('rename-box')) {
                        // console.log('Found existing Monaco editor in shadow DOM');
                        this.setupEditorListeners(shadowEditor);
                    }
                } else {
                    const editor = container.matches('.monaco-editor') ? 
                        container : container.querySelector('.monaco-editor');
                        
                    if (editor && !editor.classList.contains('rename-box')) {
                        // console.log('Found existing Monaco editor');
                        this.setupEditorListeners(editor);
                    }
                }
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        // console.log('Editor observer setup complete');
    }

    setupEditorListeners(editor) {
        if (!editor || !this.isWaveMakerEditor(editor)) {
            // console.log('Invalid editor or not a WaveMaker editor');
            return;
        }
        
        // console.log('Setting up editor listeners');
        
        try {
            // Find the textarea that Monaco uses for input
            const textArea = editor.querySelector('.inputarea');
            if (!textArea) {
                // console.log('Monaco input area not found');
                return;
            }

            // Find the data-keybinding-context attribute which uniquely identifies the editor
            const editorElement = editor.closest('[data-keybinding-context]');
            if (!editorElement) {
                // console.log('Editor context not found');
                return;
            }

            const editorId = editorElement.getAttribute('data-keybinding-context');
            // console.log('Found editor ID:', editorId);

            // Use the injected helper to get editor instance
            window.postMessage({
                type: 'GET_EDITOR_INSTANCE',
                editorId: editorId
            }, '*');

            this.currentEditor = editor;
            
            // Handle focus events
            editor.addEventListener('focus', () => {
                // console.log('Editor focused');
                this.setCurrentEditor(editor);
            });
            
            // Handle click events
            editor.addEventListener('click', () => {
                this.setCurrentEditor(editor);
            });
            
            // Handle content changes through the textarea
            this.monacoInstance.onDidChangeModelContent((event) => {
                this.debouncedHandleContentChange(event);
            });

        } catch (error) {
            console.error('Error setting up editor listeners:', error);
        }
    }

    handleContentChange(event) {
        if (this.isProcessingInline || !this.monacoInstance) return;
        
        const position = this.monacoInstance.getPosition();
        if (position) {
            this.monacoInstance.trigger('inline', 'editor.action.inlineCompletion');
        }
    }

    isWaveMakerEditor(element) {
        if (!element) return false;
        
        // console.log('Checking editor:', element.className);
        
        // Exclude rename box and other utility widgets
        if (element.classList.contains('rename-box')) {
            // console.log('Skipping rename box widget');
            return false;
        }
        
        // Check if it's a Monaco editor with the correct classes
        const isMonacoEditor = element.classList.contains('monaco-editor');
        const hasCorrectTheme = element.classList.contains('vs-dark') || element.classList.contains('vs');
        const isNotWidget = !element.hasAttribute('widgetid');
        
        if (isMonacoEditor && hasCorrectTheme && isNotWidget) {
            // console.log('Valid Monaco editor found');
            return true;
        }
        
        // Check if it's within a WaveMaker editor container
        const wmContainer = element.closest('wms-editor, .wm-code-editor');
        if (wmContainer) {
            // console.log('Found within WaveMaker container:', wmContainer.tagName || wmContainer.className);
            return true;
        }
        
        // console.log('Not a valid WaveMaker editor');
        return false;
    }

    detectEditorType(editor) {
        if (!editor) return null;
        
        // Find the WaveMaker Studio editor container
        const container = editor.closest('.wm-code-editor');
        if (!container) return null;

        // Try to get the mode from the editor's data attributes or class names
        const editorClasses = editor.className;
        
        if (editorClasses.includes('html-editor') || container.getAttribute('data-mode-id') === 'html') {
            return 'markup';
        } else if (editorClasses.includes('css-editor') || container.getAttribute('data-mode-id') === 'css') {
            return 'style';
        } else if (editorClasses.includes('js-editor') || container.getAttribute('data-mode-id') === 'javascript') {
            return 'script';
        }
        
        // Fallback: try to detect from the content or file extension
        const editorContent = editor.textContent.trim().toLowerCase();
        if (editorContent.startsWith('<!doctype') || editorContent.includes('<html')) {
            return 'markup';
        } else if (editorContent.includes('{') && editorContent.includes('}') && 
                   (editorContent.includes(':') || editorContent.includes(';'))) {
            return 'style';
        }
        
        // Default to script if we can't determine
        return 'script';
    }

    setCurrentEditor(editor) {
        if (this.currentEditor === editor) return;
        
        // console.log('Setting current editor:', editor);
        this.currentEditor = editor;
        this.editorType = this.detectEditorType(editor);
        // console.log('Editor type:', this.editorType);
    }

}

export default CompletionManager;
