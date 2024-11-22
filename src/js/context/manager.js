/**
 * WaveMaker Context Manager
 * Manages and provides access to the current WaveMaker development context
 */

import WaveMakerMarkupParser from './parser.js';

class WaveMakerContextManager {
    constructor() {
        this.parser = new WaveMakerMarkupParser();
        this.currentContext = null;
        this.contextHistory = [];
        this.MAX_HISTORY = 10;

        // Initialize context update interval
        this.initializeContextTracking();
    }

    /**
     * Initialize context tracking
     */
    initializeContextTracking() {
        // Set up mutation observer to track DOM changes
        const observer = new MutationObserver(() => this.updateContext());
        
        observer.observe(document.body, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ['wm-type', 'widget-id', 'binding']
        });

        // Initial context capture
        this.updateContext();
    }

    /**
     * Update the current context
     */
    async updateContext() {
        try {
            const newContext = await this.captureCurrentContext();
            
            // Store previous context in history
            if (this.currentContext) {
                this.addToHistory(this.currentContext);
            }
            
            this.currentContext = newContext;
            
            // Emit context update event
            this.emitContextUpdate(newContext);
        } catch (error) {
            console.error('Error updating context:', error);
        }
    }

    /**
     * Capture the current development context
     * @returns {Object} Current context
     */
    async captureCurrentContext() {
        return {
            workspace: this.parser.parseWorkspaceContext(),
            activePage: this.getActivePage(),
            activeComponent: this.getActiveComponent(),
            projectStructure: await this.getProjectStructure(),
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Get information about the active page
     * @returns {Object} Active page information
     */
    getActivePage() {
        const pageElement = document.querySelector('[wm-type="page"]');
        if (!pageElement) return null;

        return {
            name: pageElement.getAttribute('name'),
            layout: pageElement.getAttribute('layout'),
            components: this.getPageComponents(pageElement)
        };
    }

    /**
     * Get information about the active component
     * @returns {Object} Active component information
     */
    getActiveComponent() {
        // This implementation depends on WaveMaker's way of marking active components
        const activeElement = document.querySelector('.wm-active-component');
        if (!activeElement) return null;

        return {
            id: activeElement.getAttribute('widget-id'),
            type: activeElement.getAttribute('wm-type'),
            properties: this.parser.extractProperties(activeElement),
            bindings: this.parser.extractBindings(activeElement)
        };
    }

    /**
     * Get components within a page
     * @param {Element} pageElement - The page DOM element
     * @returns {Array} List of components
     */
    getPageComponents(pageElement) {
        const components = [];
        const componentElements = pageElement.querySelectorAll('[wm-type]');

        componentElements.forEach(element => {
            components.push({
                id: element.getAttribute('widget-id'),
                type: element.getAttribute('wm-type'),
                properties: this.parser.extractProperties(element)
            });
        });

        return components;
    }

    /**
     * Get the project structure
     * @returns {Object} Project structure
     */
    async getProjectStructure() {
        // This would need to be implemented based on WaveMaker's project structure
        return {
            pages: await this.getProjectPages(),
            services: await this.getProjectServices(),
            models: await this.getDataModels()
        };
    }

    /**
     * Get all pages in the project
     * @returns {Array} List of pages
     */
    async getProjectPages() {
        // Implementation would depend on WaveMaker's API
        return [];
    }

    /**
     * Get all services in the project
     * @returns {Array} List of services
     */
    async getProjectServices() {
        // Implementation would depend on WaveMaker's API
        return [];
    }

    /**
     * Get all data models in the project
     * @returns {Array} List of data models
     */
    async getDataModels() {
        // Implementation would depend on WaveMaker's API
        return [];
    }

    /**
     * Add context to history
     * @param {Object} context - Context to add to history
     */
    addToHistory(context) {
        this.contextHistory.unshift(context);
        
        // Maintain history size
        if (this.contextHistory.length > this.MAX_HISTORY) {
            this.contextHistory.pop();
        }
    }

    /**
     * Emit context update event
     * @param {Object} context - Updated context
     */
    emitContextUpdate(context) {
        const event = new CustomEvent('wmContextUpdate', {
            detail: { context }
        });
        document.dispatchEvent(event);
    }

    /**
     * Get the current context
     * @returns {Object} Current context
     */
    getCurrentContext() {
        return this.currentContext;
    }

    /**
     * Get context history
     * @returns {Array} Context history
     */
    getContextHistory() {
        return this.contextHistory;
    }

    /**
     * Get specific context by timestamp
     * @param {string} timestamp - Context timestamp
     * @returns {Object} Context at specified timestamp
     */
    getContextByTimestamp(timestamp) {
        return this.contextHistory.find(
            context => context.timestamp === timestamp
        );
    }
}

// Export the context manager
export default WaveMakerContextManager;
