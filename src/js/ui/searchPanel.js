import SearchService from '../services/searchService.js';

/**
 * SearchPanel - UI component for code search functionality
 */
class SearchPanel {
    constructor() {
        this.searchService = new SearchService();
        this.container = document.createElement('div');
        this.container.className = 'search-panel';
        
        this.searchInput = document.createElement('input');
        this.searchInput.type = 'text';
        this.searchInput.placeholder = 'Search code...';
        this.searchInput.className = 'search-input';
        
        this.filterButtons = document.createElement('div');
        this.filterButtons.className = 'filter-buttons';
        
        this.resultsContainer = document.createElement('div');
        this.resultsContainer.className = 'search-results';
        
        // Create filter buttons
        const filterTypes = ['All', 'Exact', 'Pattern'];
        filterTypes.forEach(type => {
            const button = document.createElement('button');
            button.textContent = type;
            button.className = 'filter-button';
            if (type === 'All') button.classList.add('active');
            button.onclick = () => {
                this.filterButtons.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                this.filterResults(type);
            };
            this.filterButtons.appendChild(button);
        });
        
        // Assemble the panel
        this.container.appendChild(this.searchInput);
        this.container.appendChild(this.filterButtons);
        this.container.appendChild(this.resultsContainer);
        
        this.attachEventListeners();
    }

    /**
     * Initialize the search panel
     */
    initialize() {
        this.createPanel();
        // Initialize search service
        this.searchService.initialize();
    }

    /**
     * Create the search panel UI
     */
    createPanel() {
        // Create search input
        const searchBox = document.createElement('div');
        searchBox.className = 'search-box';
        
        this.searchInput = document.createElement('input');
        this.searchInput.type = 'text';
        this.searchInput.placeholder = 'Search code (e.g., "find API calls" or "show variables")';
        
        const searchButton = document.createElement('button');
        searchButton.textContent = 'Search';
        searchButton.onclick = () => this.handleSearch();
        
        searchBox.appendChild(this.searchInput);
        searchBox.appendChild(searchButton);
        
        // Create filter buttons
        this.filterButtons = document.createElement('div');
        this.filterButtons.className = 'filter-buttons';
        
        const filters = ['All', 'API', 'Functions', 'Variables', 'Widgets', 'Services'];
        filters.forEach(filter => {
            const button = document.createElement('button');
            button.textContent = filter;
            button.onclick = () => this.filterResults(filter);
            this.filterButtons.appendChild(button);
        });
        
        // Create results container
        this.resultsContainer = document.createElement('div');
        this.resultsContainer.className = 'search-results';
        
        // Assemble panel
        this.container.appendChild(searchBox);
        this.container.appendChild(this.filterButtons);
        this.container.appendChild(this.resultsContainer);
    }

    /**
     * Display search results
     */
    displayResults(results) {
        this.resultsContainer.innerHTML = '';
        
        if (!results || results.length === 0) {
            const noResults = document.createElement('div');
            noResults.className = 'no-results';
            noResults.textContent = 'No results found';
            this.resultsContainer.appendChild(noResults);
            return;
        }

        results.forEach(result => {
            const resultCard = this.createResultCard(result);
            this.resultsContainer.appendChild(resultCard);
        });
    }

    /**
     * Create a search result card
     */
    createResultCard(result) {
        const resultCard = document.createElement('div');
        resultCard.className = 'search-result-card';
        resultCard.dataset.type = result.type || 'exact';
        
        const header = document.createElement('div');
        header.className = 'result-header';
        
        const filename = document.createElement('span');
        filename.className = 'result-filename';
        filename.textContent = result.filename;
        
        const line = document.createElement('span');
        line.className = 'result-line';
        line.textContent = `Line ${result.line}`;
        
        const type = document.createElement('span');
        type.className = 'result-type';
        type.textContent = result.type || 'exact';
        
        header.appendChild(filename);
        header.appendChild(line);
        header.appendChild(type);

        const content = document.createElement('div');
        content.className = 'result-content';
        content.innerHTML = this.highlightCode(result.context, result.match);

        resultCard.appendChild(header);
        resultCard.appendChild(content);
        resultCard.onclick = () => this.navigateToResult(result);

        return resultCard;
    }

    /**
     * Handle search execution
     */
    async handleSearch() {
        const query = this.searchInput.value.trim();
        if (!query) {
            this.showError('Please enter a search query');
            return;
        }

        try {
            // Show loading state
            this.showLoading();
            
            // Perform search
            const results = await this.searchService.searchInCurrentEditor(query);
            
            // Display results
            this.displayResults(results);
        } catch (error) {
            console.error('Search failed:', error);
            this.showError('Search failed: ' + (error.message || 'Unknown error'));
        }
    }

    /**
     * Highlight code in search results
     */
    highlightCode(context, match) {
        try {
            // Escape special regex characters in the match
            const escapedMatch = match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return context.replace(
                new RegExp(escapedMatch, 'g'),
                `<span class="highlight">${match}</span>`
            );
        } catch (error) {
            console.warn('Failed to highlight code:', error);
            return context; // Return unhighlighted code if highlighting fails
        }
    }

    /**
     * Navigate to a search result
     */
    navigateToResult(result) {
        if (!result || !result.filename) {
            console.error('Invalid search result:', result);
            return;
        }

        // Send message to navigate to file and line
        window.postMessage({
            type: 'NAVIGATE_TO_FILE',
            data: {
                filename: result.filename,
                line: result.line,
                column: 0
            }
        }, '*');
    }

    /**
     * Filter results by type
     */
    filterResults(filter) {
        if (!filter) return;

        const cards = this.resultsContainer.querySelectorAll('.search-result-card');
        cards.forEach(card => {
            const type = card.dataset.type;
            if (filter.toLowerCase() === 'all' || type === filter.toLowerCase()) {
                card.style.display = 'block';
            } else {
                card.style.display = 'none';
            }
        });
    }

    /**
     * Attach event listeners
     */
    attachEventListeners() {
        // Handle enter key in search input
        this.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.handleSearch();
            }
        });

        // Add keyboard shortcut (Ctrl/Cmd + K)
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                this.searchInput.focus();
            }
        });
    }

    showLoading() {
        this.resultsContainer.innerHTML = '<div class="loading">Searching... <div class="spinner"></div></div>';
    }

    showError(message) {
        this.resultsContainer.innerHTML = `<div class="error">${message}</div>`;
    }

    displayError(message) {
        this.resultsContainer.innerHTML = `
            <div class="error-message">
                <span class="error-icon">⚠️</span>
                <span class="error-text">${message}</span>
            </div>
        `;
    }
}

// Export as singleton
export default SearchPanel;
