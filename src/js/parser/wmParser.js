/**
 * WaveMaker Markup Parser
 * Specialized parser for WaveMaker's custom markup and bindings
 */

class WMParser {
    constructor() {
        this.bindingPatterns = {
            variable: /Variables\.[^.\s}]+(\.dataSet)?/g,
            widget: /Widgets\.[^.\s}]+/g,
            binding: /bind:([^"'\s}]+)/g
        };

        this.widgetCategories = {
            form: ['form-field', 'liveform', 'form-action'],
            layout: ['layoutgrid', 'gridrow', 'gridcolumn'],
            input: ['text', 'select', 'radioset', 'checkboxset', 'date', 'number'],
            container: ['page', 'content', 'container', 'composite'],
            navigation: ['wizard', 'wizardstep'],
            data: ['list', 'table', 'card', 'search'],
            display: ['label', 'message']
        };
    }

    /**
     * Parse WaveMaker markup and extract structure
     * @param {string} markup - HTML string containing WaveMaker markup
     * @returns {Object} Parsed structure with widgets, bindings, and relationships
     */
    parseMarkup(markup) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(markup, 'text/html');
        return this.parseElement(doc.body.firstElementChild);
    }

    /**
     * Parse individual WM element
     * @param {Element} element - DOM element to parse
     * @returns {Object} Parsed element structure
     */
    parseElement(element) {
        if (!element) return null;

        const structure = {
            type: element.tagName.toLowerCase(),
            name: element.getAttribute('name') || '',
            category: this.getWidgetCategory(element),
            attributes: this.parseAttributes(element),
            bindings: this.extractBindings(element),
            children: [],
            relationships: this.findRelationships(element)
        };

        // Parse children
        for (const child of element.children) {
            const parsedChild = this.parseElement(child);
            if (parsedChild) {
                structure.children.push(parsedChild);
            }
        }

        return structure;
    }

    /**
     * Parse element attributes
     * @param {Element} element - DOM element
     * @returns {Object} Parsed attributes with bindings
     */
    parseAttributes(element) {
        const attrs = {};
        for (const attr of element.attributes) {
            attrs[attr.name] = {
                value: attr.value,
                hasBinding: attr.value.includes('bind:'),
                bindings: this.extractBindingsFromValue(attr.value)
            };
        }
        return attrs;
    }

    /**
     * Extract all bindings from an element
     * @param {Element} element - DOM element
     * @returns {Object} Extracted bindings categorized by type
     */
    extractBindings(element) {
        const html = element.outerHTML;
        return {
            variables: [...new Set(html.match(this.bindingPatterns.variable) || [])],
            widgets: [...new Set(html.match(this.bindingPatterns.widget) || [])],
            direct: [...new Set(html.match(this.bindingPatterns.binding) || [])].map(b => b.replace('bind:', ''))
        };
    }

    /**
     * Extract bindings from a single value
     * @param {string} value - Attribute value
     * @returns {Array} Extracted bindings
     */
    extractBindingsFromValue(value) {
        const bindings = [];
        if (value.includes('bind:')) {
            const bindingValue = value.replace('bind:', '');
            bindings.push({
                type: 'direct',
                value: bindingValue,
                dependencies: this.extractDependencies(bindingValue)
            });
        }
        return bindings;
    }

    /**
     * Extract dependencies from a binding expression
     * @param {string} expression - Binding expression
     * @returns {Object} Extracted dependencies
     */
    extractDependencies(expression) {
        return {
            variables: [...new Set(expression.match(this.bindingPatterns.variable) || [])],
            widgets: [...new Set(expression.match(this.bindingPatterns.widget) || [])]
        };
    }

    /**
     * Get widget category based on element type
     * @param {Element} element - DOM element
     * @returns {string} Widget category
     */
    getWidgetCategory(element) {
        const tag = element.tagName.toLowerCase();
        if (!tag.startsWith('wm-')) return 'other';

        const widgetType = tag.substring(3);
        for (const [category, types] of Object.entries(this.widgetCategories)) {
            if (types.some(t => widgetType.includes(t))) {
                return category;
            }
        }
        return 'other';
    }

    /**
     * Find relationships with other widgets
     * @param {Element} element - DOM element
     * @returns {Object} Related widgets and their relationships
     */
    findRelationships(element) {
        const relationships = {
            parent: null,
            siblings: [],
            dataSource: null,
            eventHandlers: []
        };

        // Find parent relationship
        if (element.parentElement && element.parentElement.hasAttribute('name')) {
            relationships.parent = {
                name: element.parentElement.getAttribute('name'),
                type: element.parentElement.tagName.toLowerCase()
            };
        }

        // Find data source relationships
        const dataset = element.getAttribute('dataset');
        if (dataset) {
            relationships.dataSource = this.extractBindingsFromValue(dataset);
        }

        // Find event handlers
        for (const attr of element.attributes) {
            if (attr.name.startsWith('on-')) {
                relationships.eventHandlers.push({
                    event: attr.name.replace('on-', ''),
                    handler: attr.value
                });
            }
        }

        return relationships;
    }
}

// Export for use in other modules
export default WMParser;
