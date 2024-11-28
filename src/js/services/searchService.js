/**
 * SearchService - Intelligent code search for WaveMaker projects
 */

class SearchService {
    constructor() {
        this.fileCache = new Map();
        this.projectId = null;
        this.baseUrl = 'https://www.wavemakeronline.com/studio/services/projects';
        this.authCookie = null;
        this.initialize();
    }

    /**
     * Initialize the search service
     */
    async initialize() {
        try {
            // Get auth cookie from background script
            const response = await chrome.runtime.sendMessage({ type: 'GET_AUTH_COOKIE' });
            if (!response.cookie) {
                throw new Error('Authentication cookie not found');
            }
            this.authCookie = response.cookie;
            // console.log('SearchService initialized with auth cookie');
        } catch (error) {
            console.error('Failed to initialize SearchService:', error);
            throw new Error('Failed to authenticate with WaveMaker');
        }
    }

    /**
     * Extract project ID from WaveMaker Studio URL
     */
    getProjectIdFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('project-id');
    }

    /**
     * Get file content from WaveMaker API
     */
    async getFileContent(filename) {
        if (!this.authCookie) {
            await this.initialize();
        }

        if (this.fileCache.has(filename)) {
            return this.fileCache.get(filename);
        }

        const url = `${this.baseUrl}/${this.projectId}/resources/content/project/${filename}`;
        try {
            const response = await fetch(url, {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Cookie': `auth_cookie=${this.authCookie}`
                }
            });

            if (!response.ok) {
                if (response.status === 401) {
                    // Try to reinitialize on auth failure
                    await this.initialize();
                    return this.getFileContent(filename);
                }
                throw new Error(`Failed to fetch file: ${response.statusText}`);
            }

            const content = await response.text();
            this.fileCache.set(filename, content);
            return content;
        } catch (error) {
            console.error(`Error fetching ${filename}:`, error);
            throw error;
        }
    }

    /**
     * Search in current editor
     */
    async searchInCurrentEditor(query, options = {}) {
        return new Promise((resolve, reject) => {
            // Setup message listener
            const messageHandler = (event) => {
                if (event.data.type === 'EDITOR_CONTENT_RESPONSE') {
                    window.removeEventListener('message', messageHandler);
                    
                    if (event.data.error) {
                        reject(new Error(event.data.error));
                        return;
                    }

                    const { content, filename } = event.data;
                    resolve(this.searchInContent(content, query, filename, options));
                }
            };

            // Add message listener
            window.addEventListener('message', messageHandler);

            // Request editor content
            window.postMessage({ type: 'GET_EDITOR_CONTENT' }, '*');

            // Add timeout
            setTimeout(() => {
                window.removeEventListener('message', messageHandler);
                reject(new Error('Timeout waiting for editor content'));
            }, 5000);
        });
    }

    /**
     * Search in content with various strategies
     */
    searchInContent(content, query, filename, options = {}) {
        const results = [];
        
        try {
            // 1. Exact match search
            if (!options.type || options.type === 'exact') {
                // Escape special regex characters in the query
                const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(escapedQuery, 'gi');
                let match;
                while ((match = regex.exec(content)) !== null) {
                    results.push({
                        type: 'exact',
                        filename,
                        line: this.getLineNumber(content, match.index),
                        match: match[0],
                        context: this.getContext(content, match.index)
                    });
                }
            }

            // 2. Pattern-based search
            if (!options.type || options.type === 'pattern') {
                const patterns = this.getSearchPatterns(query);
                patterns.forEach(pattern => {
                    try {
                        const regex = new RegExp(pattern, 'gi');
                        let match;
                        while ((match = regex.exec(content)) !== null) {
                            results.push({
                                type: 'pattern',
                                filename,
                                line: this.getLineNumber(content, match.index),
                                match: match[0],
                                context: this.getContext(content, match.index)
                            });
                        }
                    } catch (error) {
                        console.warn(`Invalid pattern ${pattern}:`, error);
                    }
                });
            }
        } catch (error) {
            console.error('Search failed:', error);
            throw new Error('Failed to perform search: ' + error.message);
        }

        return results;
    }

    /**
     * Get search patterns based on query type
     */
    getSearchPatterns(query) {
        const patterns = {
            // API patterns
            api: [
                '\\b(fetch|axios)\\s*\\(',
                '\\bapi\\b.*\\(',
                '\\bhttp[s]?:\\/\\/'
            ],
            // Function patterns
            function: [
                'function\\s+(\\w+)\\s*\\(',
                '(\\w+)\\s*:\\s*function\\s*\\(',
                '(\\w+)\\s*=\\s*\\([^)]*\\)\\s*=>'
            ],
            // Variable patterns
            variable: [
                '\\b(var|let|const)\\s+(\\w+)\\s*=',
                '\\bthis\\.(\\w+)\\s*='
            ],
            // WaveMaker specific patterns
            widget: [
                '\\[wm-type=[\'"]([^\'"]+)[\'"]\\]',
                'widget-id=[\'"]([^\'"]+)[\'"]\\]',
                '\\bwm\\.(\\w+)\\('
            ],
            // Service patterns
            service: [
                '\\.service\\b',
                'Service\\b.*\\{',
                '\\@Injectable'
            ]
        };

        // Determine which patterns to use based on query
        const queryLower = query.toLowerCase();
        let selectedPatterns = [];

        if (queryLower.includes('api') || queryLower.includes('http')) {
            selectedPatterns.push(...patterns.api);
        }
        if (queryLower.includes('function')) {
            selectedPatterns.push(...patterns.function);
        }
        if (queryLower.includes('variable')) {
            selectedPatterns.push(...patterns.variable);
        }
        if (queryLower.includes('widget')) {
            selectedPatterns.push(...patterns.widget);
        }
        if (queryLower.includes('service')) {
            selectedPatterns.push(...patterns.service);
        }

        // If no specific patterns matched, use all
        if (selectedPatterns.length === 0) {
            selectedPatterns = Object.values(patterns).flat();
        }

        return selectedPatterns;
    }

    /**
     * Get line number from content index
     */
    getLineNumber(content, index) {
        return content.substring(0, index).split('\n').length;
    }

    /**
     * Get surrounding context for a match
     */
    getContext(content, index, contextLines = 2) {
        const lines = content.split('\n');
        const lineNumber = this.getLineNumber(content, index);
        
        const start = Math.max(0, lineNumber - contextLines - 1);
        const end = Math.min(lines.length, lineNumber + contextLines);
        
        return lines.slice(start, end).join('\n');
    }

    /**
     * Clear file cache
     */
    clearCache(filename = null) {
        if (filename) {
            this.fileCache.delete(filename);
        } else {
            this.fileCache.clear();
        }
    }
}

// Export both the class and a singleton instance
export default SearchService;
export const searchService = new SearchService();
