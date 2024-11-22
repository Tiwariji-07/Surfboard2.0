/**
 * WaveMaker Copilot Sidebar
 * Manages the sidebar UI for the copilot
 */

class WaveMakerCopilotSidebar {
    constructor() {
        this.sidebarElement = null;
        this.isVisible = false;
        this.isDragging = false;
        this.dragStartX = 0;
        this.initialWidth = 300; // Default width in pixels
    }

    /**
     * Initialize the sidebar
     */
    initialize() {
        this.createSidebar();
        this.setupEventListeners();
    }

    /**
     * Create the sidebar DOM element
     */
    createSidebar() {
        // Create main sidebar container
        this.sidebarElement = document.createElement('div');
        this.sidebarElement.id = 'wm-copilot-sidebar';
        this.sidebarElement.className = 'wm-copilot-sidebar';
        
        // Add sidebar content
        this.sidebarElement.innerHTML = `
            <div class="sidebar-header">
                <h2>WaveMaker Copilot</h2>
                <button class="minimize-button">−</button>
            </div>
            <div class="sidebar-content">
                <div class="chat-container"></div>
                <div class="context-panel"></div>
            </div>
            <div class="resize-handle"></div>
        `;

        // Add sidebar to page
        document.body.appendChild(this.sidebarElement);
        
        // Initialize width
        this.sidebarElement.style.width = `${this.initialWidth}px`;
    }

    /**
     * Set up event listeners for sidebar interactions
     */
    setupEventListeners() {
        // Minimize button
        const minimizeButton = this.sidebarElement.querySelector('.minimize-button');
        minimizeButton.addEventListener('click', () => this.toggleVisibility());

        // Resize handle
        const resizeHandle = this.sidebarElement.querySelector('.resize-handle');
        resizeHandle.addEventListener('mousedown', (e) => this.startResize(e));
        document.addEventListener('mousemove', (e) => this.handleResize(e));
        document.addEventListener('mouseup', () => this.stopResize());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === '\\') {
                this.toggleVisibility();
            }
        });
    }

    /**
     * Toggle sidebar visibility
     */
    toggleVisibility() {
        this.isVisible = !this.isVisible;
        this.sidebarElement.classList.toggle('minimized');
        
        // Update button text
        const button = this.sidebarElement.querySelector('.minimize-button');
        button.textContent = this.isVisible ? '−' : '+';
    }

    /**
     * Start sidebar resize
     * @param {MouseEvent} e - Mouse event
     */
    startResize(e) {
        this.isDragging = true;
        this.dragStartX = e.clientX;
        this.initialWidth = this.sidebarElement.offsetWidth;
        
        // Add resize class
        document.body.classList.add('sidebar-resizing');
    }

    /**
     * Handle sidebar resize
     * @param {MouseEvent} e - Mouse event
     */
    handleResize(e) {
        if (!this.isDragging) return;

        const deltaX = this.dragStartX - e.clientX;
        const newWidth = this.initialWidth + deltaX;

        // Apply min/max constraints
        const width = Math.min(Math.max(newWidth, 250), 800);
        this.sidebarElement.style.width = `${width}px`;
    }

    /**
     * Stop sidebar resize
     */
    stopResize() {
        this.isDragging = false;
        document.body.classList.remove('sidebar-resizing');
    }

    /**
     * Update context panel content
     * @param {Object} context - Current context
     */
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

    /**
     * Format context details for display
     * @param {Object} context - Context object
     * @returns {string} Formatted HTML
     */
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

    /**
     * Get the chat container element
     * @returns {HTMLElement} Chat container
     */
    getChatContainer() {
        return this.sidebarElement.querySelector('.chat-container');
    }

    /**
     * Show loading state
     */
    showLoading() {
        const loader = document.createElement('div');
        loader.className = 'loading-spinner';
        this.sidebarElement.appendChild(loader);
    }

    /**
     * Hide loading state
     */
    hideLoading() {
        const loader = this.sidebarElement.querySelector('.loading-spinner');
        if (loader) {
            loader.remove();
        }
    }

    /**
     * Show error message
     * @param {string} message - Error message
     */
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
}

// Export the sidebar
export default WaveMakerCopilotSidebar;
