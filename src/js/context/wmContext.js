/**
 * WaveMaker Context Manager
 * Manages and analyzes the current WaveMaker development context
 */

import WMParser from '../parser/wmParser.js';

class WMContextManager {
    constructor() {
        this.parser = new WMParser();
        this.currentContext = {
            page: null,
            widgets: new Map(),
            variables: new Map(),
            bindings: new Map(),
            activeWidget: null
        };

        this.observers = new Set();
    }

    /**
     * Initialize context manager and start observing DOM changes
     */
    async initialize() {
        this.setupMutationObserver();
        await this.analyzeCurrentPage();
        console.log('Context Manager initialized');
    }

    /**
     * Set up mutation observer to track DOM changes
     */
    setupMutationObserver() {
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (this.isWaveMakerChange(mutation)) {
                    this.handleDOMChange(mutation);
                }
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style', 'data-*']
        });
    }

    /**
     * Check if mutation is related to WaveMaker
     * @param {MutationRecord} mutation - DOM mutation record
     * @returns {boolean} True if WaveMaker-related change
     */
    isWaveMakerChange(mutation) {
        const target = mutation.target;
        return target.tagName && (
            target.tagName.toLowerCase().startsWith('wm-') ||
            target.hasAttribute('widget-id') ||
            target.classList.contains('wm-app')
        );
    }

    /**
     * Handle DOM changes
     * @param {MutationRecord} mutation - DOM mutation record
     */
    async handleDOMChange(mutation) {
        const target = mutation.target;
        if (target.tagName && target.tagName.toLowerCase().startsWith('wm-')) {
            const parsedElement = this.parser.parseElement(target);
            this.updateContext(parsedElement);
        }
    }

    /**
     * Analyze current page structure
     */
    async analyzeCurrentPage() {
        const pageElement = document.querySelector('wm-page');
        if (!pageElement) return;

        const pageStructure = this.parser.parseElement(pageElement);
        this.currentContext.page = {
            name: pageElement.getAttribute('name'),
            structure: pageStructure,
            timestamp: Date.now()
        };

        this.extractPageComponents(pageStructure);
    }

    /**
     * Extract and categorize page components
     * @param {Object} pageStructure - Parsed page structure
     */
    extractPageComponents(pageStructure) {
        const traverse = (node) => {
            if (node.name) {
                // Store widget information
                this.currentContext.widgets.set(node.name, {
                    type: node.type,
                    category: node.category,
                    bindings: node.bindings,
                    relationships: node.relationships
                });

                // Extract and store variables
                if (node.bindings.variables.length > 0) {
                    node.bindings.variables.forEach(variable => {
                        if (!this.currentContext.variables.has(variable)) {
                            this.currentContext.variables.set(variable, {
                                usedBy: new Set([node.name]),
                                type: this.inferVariableType(variable)
                            });
                        } else {
                            this.currentContext.variables.get(variable).usedBy.add(node.name);
                        }
                    });
                }

                // Store binding relationships
                node.bindings.direct.forEach(binding => {
                    this.currentContext.bindings.set(`${node.name}:${binding}`, {
                        widget: node.name,
                        expression: binding,
                        dependencies: this.parser.extractDependencies(binding)
                    });
                });
            }

            // Recursively process children
            node.children.forEach(traverse);
        };

        traverse(pageStructure);
    }

    /**
     * Infer variable type from usage
     * @param {string} variable - Variable name
     * @returns {string} Inferred type
     */
    inferVariableType(variable) {
        if (variable.includes('.dataSet')) return 'dataset';
        if (variable.startsWith('Variables.static')) return 'static';
        if (variable.startsWith('Variables.sv')) return 'service';
        return 'unknown';
    }

    /**
     * Get relevant context for AI processing
     * @param {string} query - User query
     * @returns {Object} Relevant context
     */
    getRelevantContext(query) {
        const context = {
            activeWidget: this.currentContext.activeWidget,
            relevantWidgets: [],
            relevantVariables: [],
            relevantBindings: []
        };

        // Find mentioned widgets
        this.currentContext.widgets.forEach((widget, name) => {
            if (this.isRelevantToQuery(query, name, widget)) {
                context.relevantWidgets.push({
                    name,
                    ...widget
                });
            }
        });

        // Find related variables
        this.currentContext.variables.forEach((variable, name) => {
            if (this.isRelevantToQuery(query, name, variable)) {
                context.relevantVariables.push({
                    name,
                    ...variable
                });
            }
        });

        // Find related bindings
        context.relevantBindings = this.findRelatedBindings(context.relevantWidgets);

        return context;
    }

    /**
     * Check if item is relevant to query
     * @param {string} query - User query
     * @param {string} name - Item name
     * @param {Object} item - Item details
     * @returns {boolean} True if relevant
     */
    isRelevantToQuery(query, name, item) {
        const queryTerms = query.toLowerCase().split(/\s+/);
        const itemTerms = name.toLowerCase().split(/[.-_]/);
        
        return queryTerms.some(term => 
            itemTerms.some(itemTerm => itemTerm.includes(term)) ||
            item.type?.toLowerCase().includes(term) ||
            item.category?.toLowerCase().includes(term)
        );
    }

    /**
     * Find bindings related to widgets
     * @param {Array} widgets - Relevant widgets
     * @returns {Array} Related bindings
     */
    findRelatedBindings(widgets) {
        const bindings = [];
        const widgetNames = new Set(widgets.map(w => w.name));

        this.currentContext.bindings.forEach((binding, key) => {
            if (widgetNames.has(binding.widget)) {
                bindings.push({
                    key,
                    ...binding
                });
            }
        });

        return bindings;
    }

    /**
     * Set active widget
     * @param {string} widgetName - Name of active widget
     */
    setActiveWidget(widgetName) {
        this.currentContext.activeWidget = this.currentContext.widgets.get(widgetName) || null;
        this.notifyObservers();
    }

    /**
     * Add context change observer
     * @param {Function} callback - Observer callback
     */
    addObserver(callback) {
        this.observers.add(callback);
    }

    /**
     * Remove context change observer
     * @param {Function} callback - Observer callback
     */
    removeObserver(callback) {
        this.observers.delete(callback);
    }

    /**
     * Notify observers of context changes
     */
    notifyObservers() {
        this.observers.forEach(callback => {
            try {
                callback(this.currentContext);
            } catch (error) {
                console.error('Error in context observer:', error);
            }
        });
    }
}

export default WMContextManager;
