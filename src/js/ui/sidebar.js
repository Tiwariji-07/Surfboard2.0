// import SearchPanel from './searchPanel.js';
import LogPanel from './logPanel.js';
import SearchPanel from './searchPanel.js';

class WaveMakerCopilotSidebar {
    constructor() {
        this.sidebarElement = null;
        this.chatContainer = null;
        this.isOpen = false;
        // this.searchPanel = null;
        this.logPanel = null;
        this.searchPanel = null;
        this.observers = [];
        this.initialize();
        this.setupToastObserver();
    }

    initialize() {
        // Create sidebar element
        this.sidebarElement = document.createElement('div');
        this.sidebarElement.className = 'wm-copilot-sidebar';
        
        // Add sidebar content
        this.sidebarElement.innerHTML = `
            <div class="sidebar-header">
                <h2>Surfboard AI</h2>
                <div class="tab-buttons">
                    <button class="tab-button active" data-tab="chat">Chat</button>
                    <button class="tab-button" data-tab="logs">Logs</button>
                    <button class="tab-button" data-tab="search">Search</button>
                </div>
                <button class="minimize-button">−</button>
            </div>
            <div class="sidebar-content">
                <div class="chat-container active"></div>
                <div class="search-container"></div>
                <div class="log-container"></div>
                <div class="context-panel"></div>
            </div>
            <div class="input-container">
                <textarea placeholder="Ask me anything..." rows="1"></textarea>
                <button class="send-button">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
                    </svg>
                </button>
            </div>
        `;

        // Store chat container reference
        this.chatContainer = this.sidebarElement.querySelector('.chat-container');

        // Add to document
        document.body.appendChild(this.sidebarElement);

        // Setup event listeners
        this.setupEventListeners();
        // this.setupSearchPanel();

        // Create and add toggle button
        this.createToggleButton();
    }

    async initializePanels() {
        const logContainer = this.sidebarElement.querySelector('.log-container');
        // console.log('Log container:', logContainer);
        if (!this.logPanel && logContainer) {
            // console.log('Creating new LogPanel');
            this.logPanel = new LogPanel();
            // console.log('LogPanel created:', this.logPanel);
            logContainer.appendChild(this.logPanel.element);
            // console.log('LogPanel appended to container');
        }
        const searchContainer = this.sidebarElement.querySelector('.search-container');
        if (!this.searchPanel && searchContainer) {
            this.searchPanel = new SearchPanel();
            searchContainer.appendChild(this.searchPanel.container);
        }
    }

    createToggleButton() {
        const toggleButton = document.createElement('button');
        toggleButton.className = 'sidebar-toggle';
        toggleButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
        `;
        document.body.appendChild(toggleButton);

        // Add toggle functionality
        toggleButton.addEventListener('click', () => {
            this.toggleSidebar();
            toggleButton.classList.toggle('active');
        });
    }

    setupEventListeners() {
        // Minimize button
        const minimizeButton = this.sidebarElement.querySelector('.minimize-button');
        minimizeButton.addEventListener('click', () => this.toggleSidebar());

        // Send button and textarea
        const sendButton = this.sidebarElement.querySelector('.send-button');
        const textarea = this.sidebarElement.querySelector('textarea');
        
        const sendMessage = () => {
            const message = textarea.value.trim();
            if (message) {
                this.addMessage(message, 'user');
                textarea.value = '';
                textarea.style.height = 'auto';
                
                // Emit custom event for content script to handle
                const event = new CustomEvent('surfboard-message', { 
                    detail: { message, type: 'user' }
                });
                document.dispatchEvent(event);
            }
        };

        // Send button click
        sendButton.addEventListener('click', sendMessage);

        // Send on Enter (but Shift+Enter for new line)
        textarea.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
            }
        });

        // Auto-resize textarea
        textarea.addEventListener('input', () => {
            textarea.style.height = 'auto';
            textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
        });

        // Tab switching
        const tabButtons = this.sidebarElement.querySelectorAll('.tab-button');
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                // Remove active class from all buttons and containers
                tabButtons.forEach(btn => btn.classList.remove('active'));
                this.sidebarElement.querySelectorAll('.sidebar-content > div').forEach(container => {
                    container.classList.remove('active');
                });

                // Add active class to clicked button and corresponding container
                button.classList.add('active');
                const tabName = button.getAttribute('data-tab');
                let containerClass = tabName === 'logs' ? 'log' : tabName;
                const container = this.sidebarElement.querySelector(`.${containerClass}-container`);
                if (container) {
                    container.classList.add('active');
                }

                // Initialize log panel if logs tab is selected
                if (tabName === 'logs') {
                    this.initializePanels();
                }
            });
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === '\\') {
                this.toggleSidebar();
            }
        });
    }

    setupToastObserver() {
        // Function to create and setup observer
        const createObserver = (target) => {
            const observer = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    if (mutation.type === 'childList') {
                        mutation.addedNodes.forEach(node => {
                            if (node.nodeType === 1) {
                                if (node.classList?.contains('toast') && 
                                    node.classList?.contains('toast-error')) {
                                    const messageElement = node.querySelector('.toast-message');
                                    if (messageElement && !messageElement.ariaLabel) {
                                        console.log('Error toast detected, opening sidebar and switching to logs');
                                        this.openWithLogs("application");
                                    }
                                } else if (node.classList?.contains('ngx-toastr') && 
                                         node.classList?.contains('toast-error')) {
                                    const messageElement = node.querySelector('.toast-message');
                                    if (messageElement && messageElement.textContent.trim().startsWith('{"headers":')) {
                                        this.openWithLogs();
                                    }
                                }
                            }
                        });
                    }
                }
            });

            observer.observe(target, {
                childList: true,
                subtree: true
            });

            return observer;
        };

        // Observe main document body
        const mainObserver = createObserver(document.body);
        this.observers = [mainObserver];

        // Setup iframe observer once
        const setupIframeObserver = () => {
            const iframe = document.querySelector('#app-view');
            if (iframe?.contentDocument?.body) {
                const iframeObserver = createObserver(iframe.contentDocument.body);
                this.observers.push(iframeObserver);
                return true;
            }
            return false;
        };

        // Try to set up iframe observer immediately
        if (!setupIframeObserver()) {
            // If immediate setup fails, wait for iframe to load
            const iframe = document.querySelector('#app-view');
            if (iframe) {
                iframe.addEventListener('load', () => {
                    setupIframeObserver();
                }, { once: true }); // Ensure the event listener only fires once
            }
        }
    }

    async openWithLogs(logType="server") {
        // Open sidebar
        if(!this.isOpen) {
            this.toggleSidebar();
        }

        // Switch to logs tab
        const logsTab = this.sidebarElement.querySelector('[data-tab="logs"]');
        if (logsTab) {
            // Deactivate all tabs
            await logsTab.click();
            // await this.logPanel.initializeService();
            if(this.logPanel){
                this.logPanel.setLogType(logType);
                // await this.logPanel.analyzeLogs(logType);
            }
        }
    }

    /*setupSearchPanel() {
        // Initialize search panel first
        const searchContainer = this.sidebarElement.querySelector('.search-container');
        this.searchPanel = new SearchPanel();
        this.searchPanel.initialize(); // Initialize before accessing container
        searchContainer.appendChild(this.searchPanel.container);

        // Handle tab switching
        const tabButtons = this.sidebarElement.querySelectorAll('.tab-button');
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                // Update active tab button
                tabButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');

                // Show/hide containers
                const tabName = button.dataset.tab;
                const chatContainer = this.sidebarElement.querySelector('.chat-container');
                const searchContainer = this.sidebarElement.querySelector('.search-container');

                if (tabName === 'chat') {
                    chatContainer.classList.add('active');
                    searchContainer.classList.remove('active');
                } else {
                    chatContainer.classList.remove('active');
                    searchContainer.classList.add('active');
                }
            });
        });
    }*/

    toggleSidebar() {
        this.isOpen = !this.isOpen;
        this.sidebarElement.classList.toggle('open');
        
        // Update minimize button text
        const minimizeButton = this.sidebarElement.querySelector('.minimize-button');
        minimizeButton.textContent = this.isOpen ? '−' : '+';
    }

    addMessage(message, type) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${type}`;

        if (type === 'assistant') {
            // Convert markdown to HTML
            messageDiv.innerHTML = this.processMarkdown(message);
        } else {
            messageDiv.textContent = message;
        }

        this.chatContainer.appendChild(messageDiv);
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    }

    processMarkdown(text) {
        // Process code blocks
        text = text.replace(/```(\w+)?\n([\s\S]+?)\n```/g, (match, lang, code) => {
            const codeBlock = this.createCodeBlock(code.trim(), lang);
            const tempContainer = document.createElement('div');
            tempContainer.appendChild(codeBlock);
            return tempContainer.innerHTML;
        });

        // Process inline code
        text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

        return text;
    }

    createCodeBlock(code, language) {
        const codeBlock = document.createElement('div');
        codeBlock.className = 'code-block';

        // Create header
        const header = document.createElement('div');
        header.className = 'code-block-header';

        // Add language label
        const languageLabel = document.createElement('span');
        languageLabel.className = 'language-label';
        languageLabel.textContent = language || 'text';

        // Create copy button
        const copyButton = document.createElement('button');
        copyButton.className = 'copy-button';
        copyButton.type = 'button';
        copyButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span>Copy</span>
        `;

        // console.log('Adding click handlers to button...');

        // Add both click handlers for testing
        copyButton.onclick = function(e) {
            // console.log('Copy button clicked via onclick');
            handleCopy(e);
        };

        copyButton.addEventListener('click', function(e) {
            // console.log('Copy button clicked via addEventListener');
            handleCopy(e);
        });

        // Separate copy handler function
        const handleCopy = async (e) => {
            // console.log('Handling copy...');
            e.preventDefault();
            e.stopPropagation();
            
            const span = copyButton.querySelector('span');
            
            try {
                // console.log('Attempting to copy code:', code);
                await navigator.clipboard.writeText(code);
                // console.log('Code copied successfully');
                copyButton.classList.add('copied');
                span.textContent = 'Copied!';
            } catch (err) {
                console.error('Failed to copy:', err);
                copyButton.classList.add('error');
                span.textContent = 'Error!';
            }
            
            // Reset button state after delay
            setTimeout(() => {
                copyButton.classList.remove('copied', 'error');
                span.textContent = 'Copy';
            }, 2000);
        };

        // Assemble header
        header.appendChild(languageLabel);
        header.appendChild(copyButton);
        codeBlock.appendChild(header);

        // Create code content
        const codeContent = document.createElement('div');
        codeContent.className = 'code-content';
        const preElement = document.createElement('pre');
        const codeElement = document.createElement('code');
        codeElement.className = `language-${language || 'text'}`;
        
        // Set code content
        if (window.Prism) {
            codeElement.innerHTML = Prism.highlight(
                code,
                Prism.languages[language] || Prism.languages.text,
                language || 'text'
            );
        } else {
            codeElement.textContent = code;
        }

        // Assemble code block
        preElement.appendChild(codeElement);
        codeContent.appendChild(preElement);
        codeBlock.appendChild(codeContent);

        return codeBlock;
    }

    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        this.sidebarElement.appendChild(errorDiv);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            errorDiv.remove();
        }, 5000);
    }

    updateContextPanel(context) {
        const panel = this.sidebarElement.querySelector('.context-panel');
        
        panel.innerHTML = `
            <div class="context-section">
                <h3>Current Context</h3>
                <div class="context-details">
                    ${this.formatContextDetails(context)}
                </div>
            </div>
        `;
    }

    formatContextDetails(context) {
        if (!context) return '<p>No context available</p>';

        return `
            <div class="context-item">
                <strong>Page:</strong> ${context.activePage?.name || 'N/A'}
            </div>
            <div class="context-item">
                <strong>Component:</strong> ${context.activeComponent?.type || 'N/A'}
            </div>
            <div class="context-item">
                <strong>Last Updated:</strong> ${new Date().toLocaleTimeString()}
            </div>
        `;
    }

    getChatContainer() {
        return this.sidebarElement.querySelector('.chat-container');
    }

    showLoading() {
        const loader = document.createElement('div');
        loader.className = 'loading-spinner';
        this.sidebarElement.appendChild(loader);
    }

    hideLoading() {
        const loader = this.sidebarElement.querySelector('.loading-spinner');
        if (loader) {
            loader.remove();
        }
    }

    cleanup() {
        if (this.observers) {
            this.observers.forEach(observer => observer.disconnect());
        }
    }
}

export default WaveMakerCopilotSidebar;
