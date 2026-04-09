// import SearchPanel from './searchPanel.js';
import { marked } from 'marked';
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
        this.configureMarked();
    }

    configureMarked() {
        const self = this;
        const renderer = new marked.Renderer();

        renderer.code = function (code, language) {
            // Handle the case where marked passes an object (newer versions)
            let codeText = code;
            let lang = language;
            if (typeof code === 'object' && code !== null) {
                codeText = code.text || '';
                lang = code.lang || '';
            }
            lang = (lang || '').trim();
            const langLabel = self.escapeHtml(lang || 'text');
            let highlighted = self.escapeHtml(codeText);
            if (typeof window !== 'undefined' && window.Prism && lang) {
                const grammar = Prism.languages[lang];
                // Only call highlight when we have a real grammar object (not a function like .extend)
                if (grammar && typeof grammar === 'object') {
                    try {
                        highlighted = Prism.highlight(codeText, grammar, lang);
                    } catch (_e) {
                        // Fall back to escaped text on any Prism error
                    }
                }
            }
            const id = 'cb-' + Math.random().toString(36).slice(2, 9);
            return `<div class="code-block" data-code-id="${id}">
                <div class="code-block-header">
                    <span class="language-label">${langLabel}</span>
                    <button class="copy-button" type="button" data-copy-target="${id}">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                        <span>Copy</span>
                    </button>
                </div>
                <div class="code-content"><pre><code class="language-${langLabel}">${highlighted}</code></pre></div>
            </div>`;
        };

        renderer.table = function (header, body) {
            // Handle newer marked versions that pass an object
            if (typeof header === 'object' && header !== null) {
                const token = header;
                let headerHtml = '<tr>';
                if (token.header) {
                    token.header.forEach(cell => {
                        const align = cell.align ? ` style="text-align:${cell.align}"` : '';
                        const cellText = cell.tokens ? marked.parser([{ type: 'paragraph', tokens: cell.tokens }]) : (cell.text || '');
                        headerHtml += `<th${align}>${cellText}</th>`;
                    });
                }
                headerHtml += '</tr>';

                let bodyHtml = '';
                if (token.rows) {
                    token.rows.forEach(row => {
                        bodyHtml += '<tr>';
                        row.forEach(cell => {
                            const align = cell.align ? ` style="text-align:${cell.align}"` : '';
                            const cellText = cell.tokens ? marked.parser([{ type: 'paragraph', tokens: cell.tokens }]) : (cell.text || '');
                            bodyHtml += `<td${align}>${cellText}</td>`;
                        });
                        bodyHtml += '</tr>';
                    });
                }
                return `<div class="table-wrapper"><table><thead>${headerHtml}</thead><tbody>${bodyHtml}</tbody></table></div>`;
            }
            return `<div class="table-wrapper"><table><thead>${header}</thead><tbody>${body}</tbody></table></div>`;
        };

        marked.setOptions({
            renderer,
            breaks: true,
            gfm: true
        });
    }

    initialize() {
        // Create sidebar element
        this.sidebarElement = document.createElement('div');
        this.sidebarElement.className = 'wm-copilot-sidebar';

        // Add sidebar content
        this.sidebarElement.innerHTML = `
            <div class="sidebar-resize-handle"></div>
            <div class="sidebar-header">
                <div class="sidebar-title">
                    <img src="https://wm-ps-igniters.s3.amazonaws.com/surfboard-2.0/surfboard-logo.png" alt="Surfboard" class="sidebar-logo" />
                    <h2>Surfboard AI</h2>
                </div>
                <div class="tab-buttons">
                    <button class="tab-button" data-tab="logs" style="display: none;">Logs</button>
                    <button class="tab-button active" data-tab="chat" style="display: none;">Chat</button>
                </div>
                <button class="minimize-button" aria-label="Close sidebar">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
                        <path d="M1 1l12 12M13 1L1 13"/>
                    </svg>
                </button>
            </div>
            <div class="sidebar-content">
                <div class="chat-container active"></div>
                <div class="search-container"></div>
                <div class="log-container"></div>
                <div class="context-panel"></div>
            </div>
            <div class="input-container">
                <textarea placeholder="Ask anything about your WaveMaker page..." rows="1"></textarea>
                <button class="send-button" aria-label="Send message">
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
        this.setupResizeHandle();

        // Delegate copy-button clicks for code blocks rendered by marked
        this.sidebarElement.addEventListener('click', (e) => {
            const copyBtn = e.target.closest('.copy-button[data-copy-target]');
            if (!copyBtn) return;
            e.preventDefault();
            e.stopPropagation();
            const codeBlock = copyBtn.closest('.code-block');
            const codeEl = codeBlock?.querySelector('code');
            if (!codeEl) return;
            const span = copyBtn.querySelector('span');
            navigator.clipboard.writeText(codeEl.textContent).then(() => {
                copyBtn.classList.add('copied');
                if (span) span.textContent = 'Copied!';
            }).catch(() => {
                copyBtn.classList.add('error');
                if (span) span.textContent = 'Error';
            });
            setTimeout(() => {
                copyBtn.classList.remove('copied', 'error');
                if (span) span.textContent = 'Copy';
            }, 2000);
        });

        // Delegate feedback button clicks
        this.sidebarElement.addEventListener('click', (e) => {
            const feedbackBtn = e.target.closest('.feedback-btn[data-feedback]');
            if (!feedbackBtn) return;
            e.preventDefault();
            e.stopPropagation();
            const feedback = feedbackBtn.getAttribute('data-feedback');
            const container = feedbackBtn.closest('.message-feedback');
            if (!container) return;
            // Toggle active state
            const isActive = feedbackBtn.classList.contains('active');
            container.querySelectorAll('.feedback-btn').forEach(btn => btn.classList.remove('active'));
            if (!isActive) {
                feedbackBtn.classList.add('active');
            }
            // Get the message text for feedback storage
            const messageDiv = feedbackBtn.closest('.chat-message');
            const messageText = messageDiv?.querySelector('.assistant-message-body')?.textContent?.slice(0, 200) || '';
            // Dispatch a feedback event for external handling
            document.dispatchEvent(new CustomEvent('surfboard-feedback', {
                detail: {
                    feedback: isActive ? null : feedback,
                    messagePreview: messageText,
                    timestamp: Date.now()
                }
            }));
        });

        // Delegate follow-up suggestion clicks
        this.sidebarElement.addEventListener('click', (e) => {
            const followupBtn = e.target.closest('.followup-chip');
            if (!followupBtn) return;
            const question = followupBtn.getAttribute('data-question');
            if (!question) return;
            const textarea = this.sidebarElement.querySelector('textarea');
            if (textarea) {
                textarea.value = question;
                textarea.focus();
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
            }
            // Auto-send
            this.addMessage(question, 'user');
            textarea.value = '';
            textarea.style.height = 'auto';
            const event = new CustomEvent('surfboard-message', {
                detail: { message: question, type: 'user' }
            });
            document.dispatchEvent(event);
        });

        // Create and add toggle button
        this.createToggleButton();
    }

    async initializePanels() {
        const logContainer = this.sidebarElement.querySelector('.log-container');
        if (!this.logPanel && logContainer) {
            this.logPanel = new LogPanel();
            logContainer.appendChild(this.logPanel.element);
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
            <img src="https://wm-ps-igniters.s3.amazonaws.com/surfboard-2.0/surfboard-logo.png" alt="Surfboard AI" class="send-icon" />
        `;
        document.body.appendChild(toggleButton);

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
        const inputContainer = this.sidebarElement.querySelector('.input-container');

        const sendMessage = () => {
            const message = textarea.value.trim();
            if (message) {
                this.addMessage(message, 'user');
                textarea.value = '';
                textarea.style.height = 'auto';

                const event = new CustomEvent('surfboard-message', {
                    detail: { message, type: 'user' }
                });
                document.dispatchEvent(event);
            }
        };

        sendButton.addEventListener('click', sendMessage);

        textarea.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
            }
        });

        textarea.addEventListener('input', () => {
            textarea.style.height = 'auto';
            textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
        });

        // Tab switching
        const tabButtons = this.sidebarElement.querySelectorAll('.tab-button');
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                tabButtons.forEach(btn => btn.classList.remove('active'));
                this.sidebarElement.querySelectorAll('.sidebar-content > div').forEach(container => {
                    container.classList.remove('active');
                });

                button.classList.add('active');
                const tabName = button.getAttribute('data-tab');
                let containerClass = tabName === 'logs' ? 'log' : tabName;
                const container = this.sidebarElement.querySelector(`.${containerClass}-container`);
                if (container) {
                    container.classList.add('active');
                }

                if (tabName === 'chat') {
                    inputContainer.style.display = '';
                } else {
                    inputContainer.style.display = 'none';
                }

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

    setupResizeHandle() {
        const handle = this.sidebarElement.querySelector('.sidebar-resize-handle');
        if (!handle) return;

        let startX = 0;
        let startWidth = 0;

        const onMouseMove = (e) => {
            const delta = startX - e.clientX;
            const newWidth = Math.min(Math.max(startWidth + delta, 320), window.innerWidth * 0.8);
            this.sidebarElement.style.width = newWidth + 'px';
        };

        const onMouseUp = () => {
            this.sidebarElement.classList.remove('resizing');
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            startX = e.clientX;
            startWidth = this.sidebarElement.offsetWidth;
            this.sidebarElement.classList.add('resizing');
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    }

    setupToastObserver() {
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

        const mainObserver = createObserver(document.body);
        this.observers = [mainObserver];

        const setupIframeObserver = () => {
            const iframe = document.querySelector('#app-view');
            if (iframe?.contentDocument?.body) {
                const iframeObserver = createObserver(iframe.contentDocument.body);
                this.observers.push(iframeObserver);
                return true;
            }
            return false;
        };

        if (!setupIframeObserver()) {
            const iframe = document.querySelector('#app-view');
            if (iframe) {
                iframe.addEventListener('load', () => {
                    setupIframeObserver();
                }, { once: true });
            }
        }
    }

    async openWithLogs(logType="application") {
        if(!this.isOpen) {
            this.toggleSidebar();
        }

        const logsTab = this.sidebarElement.querySelector('[data-tab="logs"]');
        if (logsTab) {
            await logsTab.click();
            if(this.logPanel){
                this.logPanel.setLogType(logType);
            }
        }
    }

    toggleSidebar() {
        this.isOpen = !this.isOpen;
        this.sidebarElement.classList.toggle('open');

        const minimizeButton = this.sidebarElement.querySelector('.minimize-button');
        // Icon changes via CSS, no text update needed
        const toggleButton = document.querySelector('.sidebar-toggle');
        if (toggleButton) {
            toggleButton.classList.toggle('active', this.isOpen);
        }
    }

    addMessage(message, type) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${type}`;

        if (type === 'assistant') {
            messageDiv.innerHTML = this.renderAssistantMessage({ text: message, sources: [], followups: [] });
        } else {
            messageDiv.innerHTML = `
                <div class="message-avatar user-avatar">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.7 0 5-2.3 5-5s-2.3-5-5-5-5 2.3-5 5 2.3 5 5 5zm0 2c-3.3 0-10 1.7-10 5v2h20v-2c0-3.3-6.7-5-10-5z"/></svg>
                </div>
                <div class="message-body">
                    <span class="message-role">You</span>
                    <div class="message-text">${this.escapeHtml(message)}</div>
                </div>
            `;
        }

        this.chatContainer.appendChild(messageDiv);
        this.scrollToBottom();
        return messageDiv;
    }

    createStreamingAssistantMessage() {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'chat-message assistant streaming';
        this.chatContainer.appendChild(messageDiv);
        this.updateStreamingAssistantMessage(messageDiv, {
            text: '',
            sources: [],
            followups: []
        });
        this.scrollToBottom();
        return messageDiv;
    }

    updateStreamingAssistantMessage(messageDiv, state) {
        messageDiv.innerHTML = this.renderAssistantMessage(state);
        this.scrollToBottom();
    }

    finalizeStreamingAssistantMessage(messageDiv, state) {
        messageDiv.classList.remove('streaming');
        messageDiv.innerHTML = this.renderAssistantMessage(state);
        this.scrollToBottom();
    }

    scrollToBottom() {
        requestAnimationFrame(() => {
            this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
        });
    }

    renderAssistantMessage({ text = '', sources = [], followups = [] }) {
        const messageBody = text?.trim()
            ? this.processMarkdown(text)
            : `<div class="thinking-indicator"><span></span><span></span><span></span></div>`;

        const sourceMarkup = sources.length
            ? `<div class="message-sources">
                    ${sources
                        .map((source) => `<span class="message-source-chip">${this.escapeHtml(source)}</span>`)
                        .join('')}
               </div>`
            : '';

        const followupMarkup = followups.length
            ? `<div class="message-followups">
                    <span class="followups-label">Suggested follow-ups</span>
                    <div class="followup-chips">
                        ${followups
                            .map((question) => `<button class="followup-chip" data-question="${this.escapeHtml(question)}">${this.escapeHtml(question)}</button>`)
                            .join('')}
                    </div>
               </div>`
            : '';

        const feedbackMarkup = text?.trim()
            ? `<div class="message-feedback">
                    <button class="feedback-btn" data-feedback="positive" title="Helpful">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/>
                            <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
                        </svg>
                    </button>
                    <button class="feedback-btn" data-feedback="negative" title="Not helpful">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z"/>
                            <path d="M17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3"/>
                        </svg>
                    </button>
               </div>`
            : '';

        return `
            <div class="message-avatar assistant-avatar">
                <img src="https://wm-ps-igniters.s3.amazonaws.com/surfboard-2.0/surfboard-logo.png" alt="AI" />
            </div>
            <div class="message-body">
                <span class="message-role">Surfboard AI</span>
                <div class="assistant-message-body">${messageBody}</div>
                ${sourceMarkup}
                ${feedbackMarkup}
                ${followupMarkup}
            </div>
        `;
    }

    processMarkdown(text) {
        if (!text) {
            return '';
        }

        try {
            return marked.parse(text, {
                breaks: true,
                gfm: true
            });
        } catch (error) {
            console.warn('Failed to render markdown:', error);
            return `<p>${this.escapeHtml(text)}</p>`;
        }
    }

    escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    createCodeBlock(code, language) {
        const codeBlock = document.createElement('div');
        codeBlock.className = 'code-block';

        const header = document.createElement('div');
        header.className = 'code-block-header';

        const languageLabel = document.createElement('span');
        languageLabel.className = 'language-label';
        languageLabel.textContent = language || 'text';

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

        const handleCopy = async (e) => {
            e.preventDefault();
            e.stopPropagation();

            const span = copyButton.querySelector('span');

            try {
                await navigator.clipboard.writeText(code);
                copyButton.classList.add('copied');
                span.textContent = 'Copied!';
            } catch (err) {
                console.error('Failed to copy:', err);
                copyButton.classList.add('error');
                span.textContent = 'Error!';
            }

            setTimeout(() => {
                copyButton.classList.remove('copied', 'error');
                span.textContent = 'Copy';
            }, 2000);
        };

        copyButton.addEventListener('click', handleCopy);

        header.appendChild(languageLabel);
        header.appendChild(copyButton);
        codeBlock.appendChild(header);

        const codeContent = document.createElement('div');
        codeContent.className = 'code-content';
        const preElement = document.createElement('pre');
        const codeElement = document.createElement('code');
        codeElement.className = `language-${language || 'text'}`;

        const grammar = window.Prism && language && Prism.languages[language];
        if (grammar && typeof grammar === 'object') {
            try {
                codeElement.innerHTML = Prism.highlight(code, grammar, language);
            } catch (_e) {
                codeElement.textContent = code;
            }
        } else {
            codeElement.textContent = code;
        }

        preElement.appendChild(codeElement);
        codeContent.appendChild(preElement);
        codeBlock.appendChild(codeContent);

        return codeBlock;
    }

    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'chat-message error-bubble';
        errorDiv.innerHTML = `
            <div class="error-icon-wrap">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
                </svg>
            </div>
            <div class="error-text">${this.escapeHtml(message)}</div>
        `;
        this.chatContainer.appendChild(errorDiv);
        this.scrollToBottom();

        setTimeout(() => {
            errorDiv.remove();
        }, 8000);
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

        const widgets = context.symbols?.widgets?.slice(0, 6).join(', ') || 'N/A';
        const variables = context.apiContext?.pageVariables?.slice(0, 6).join(', ') || 'N/A';
        const services = context.apiContext?.services?.slice(0, 6).join(', ') || 'N/A';

        return `
            <div class="context-item">
                <strong>Page:</strong> ${context.pageName || 'N/A'}
            </div>
            <div class="context-item">
                <strong>File:</strong> ${context.activeFile || 'N/A'}
            </div>
            <div class="context-item">
                <strong>Widgets:</strong> ${widgets}
            </div>
            <div class="context-item">
                <strong>Page variables:</strong> ${variables}
            </div>
            <div class="context-item">
                <strong>Services:</strong> ${services}
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
