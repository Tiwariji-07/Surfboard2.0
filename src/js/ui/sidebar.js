class WaveMakerCopilotSidebar {
    constructor() {
        this.sidebarElement = null;
        this.chatContainer = null;
        this.isOpen = false;
        this.initialize();
    }

    initialize() {
        // Create sidebar element
        this.sidebarElement = document.createElement('div');
        this.sidebarElement.className = 'wm-copilot-sidebar';
        
        // Add sidebar content
        this.sidebarElement.innerHTML = `
            <div class="sidebar-header">
                <h2>Surfboard AI</h2>
                <button class="minimize-button">−</button>
            </div>
            <div class="sidebar-content">
                <div class="chat-container"></div>
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

        // Create and add toggle button
        this.createToggleButton();
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

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === '\\') {
                this.toggleSidebar();
            }
        });
    }

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
        copyButton.type = 'button'; // Explicitly set button type
        copyButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span>Copy</span>
        `;

        // Add click event listener
        copyButton.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Copy button clicked');
            
            // Copy the code to clipboard
            navigator.clipboard.writeText(code)
                .then(() => {
                    console.log('Code copied:', code);
                    copyButton.classList.add('copied');
                    const span = copyButton.querySelector('span');
                    span.textContent = 'Copied!';
                    
                    setTimeout(() => {
                        copyButton.classList.remove('copied');
                        span.textContent = 'Copy';
                    }, 2000);
                })
                .catch(err => {
                    console.error('Failed to copy:', err);
                    copyButton.classList.add('error');
                    const span = copyButton.querySelector('span');
                    span.textContent = 'Error!';
                    
                    setTimeout(() => {
                        copyButton.classList.remove('error');
                        span.textContent = 'Copy';
                    }, 2000);
                });
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
}

export default WaveMakerCopilotSidebar;
