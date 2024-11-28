import { LogService } from '../services/logService.js';

class LogPanel {
    constructor() {
        this.logService = new LogService();
        this.element = document.createElement('div');
        this.element.className = 'log-panel';
        this.currentLogType = 'server';
        
        // Create DOM elements first
        this.createHeader();
        this.createContent();
        this.createAnalysisPanel();
        this.setupEventListeners();
        
        // Initialize the service and fetch logs
        this.initializeService();
    }

    async initializeService() {
        try {
            // Get OpenAI API key
            const apiKey = await this.getOpenAIKey();
            if (!apiKey) {
                console.warn('OpenAI API key not found');
                this.showError('OpenAI API key not configured. AI analysis will not be available.');
                return;
            }

            // Initialize service with API key
            await this.logService.initialize(apiKey);
            await this.refreshLogs();
        } catch (error) {
            console.error('Error initializing LogService:', error);
            this.showError('Failed to initialize log service: ' + error.message);
        }
    }

    async getOpenAIKey() {
        return new Promise((resolve) => {
            chrome.storage.sync.get(['openaiApiKey'], (result) => {
                resolve(result.openaiApiKey);
            });
        });
    }

    async initializeAsync() {
        try {
            // Initialize OpenAI
            const apiKey = await this.getOpenAIKey();
            if (apiKey) {
                await this.logService.openaiService.setApiKey(apiKey);
            }
        } catch (error) {
            console.error('Error initializing LogPanel:', error);
        }
    }

    createHeader() {
        const header = document.createElement('div');
        header.className = 'log-header';

        // Create log type selector
        const typeSelector = document.createElement('select');
        typeSelector.className = 'log-type-selector';
        ['server', 'application'].forEach(type => {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = `${type.charAt(0).toUpperCase() + type.slice(1)} Logs`;
            typeSelector.appendChild(option);
        });

        // Create refresh button
        const refreshButton = document.createElement('button');
        refreshButton.className = 'refresh-button';
        refreshButton.innerHTML = '🔄 Refresh';

        // Create analyze button
        const analyzeButton = document.createElement('button');
        analyzeButton.className = 'analyze-button';
        analyzeButton.innerHTML = '🔍 Analyze';

        header.appendChild(typeSelector);
        header.appendChild(refreshButton);
        header.appendChild(analyzeButton);
        this.element.appendChild(header);
    }

    createContent() {
        const content = document.createElement('div');
        content.className = 'log-content';
        
        this.logsContainer = document.createElement('div');
        this.logsContainer.className = 'logs-container';
        this.logsContainer.innerHTML = '<div class="log-entry info"><span class="log-timestamp">Now</span><span class="log-thread"></span><span class="log-message">Initializing log panel...</span></div>';
        
        content.appendChild(this.logsContainer);
        this.element.appendChild(content);
    }

    createAnalysisPanel() {
        this.analysisContainer = document.createElement('div');
        this.analysisContainer.className = 'analysis-panel';
        this.analysisContainer.style.display = 'none';
        this.analysisContainer.innerHTML = '<h3>Log Analysis</h3>';
        this.element.appendChild(this.analysisContainer);
    }

    setupEventListeners() {
        // Handle log type selection
        const typeSelector = this.element.querySelector('.log-type-selector');
        typeSelector.addEventListener('change', (e) => {
            this.currentLogType = e.target.value;
            this.refreshLogs();
        });

        // Handle refresh
        const refreshButton = this.element.querySelector('.refresh-button');
        refreshButton.addEventListener('click', () => this.refreshLogs());

        // Handle analyze
        const analyzeButton = this.element.querySelector('.analyze-button');
        analyzeButton.addEventListener('click', () => this.analyzeLogs());
    }

    async fetchLogs(type) {
        try {
            this.showLoading();
            const logs = await this.logService.fetchLogs(type);
            this.displayLogs(logs);
        } catch (error) {
            this.showError(error.message);
        }
    }

    async refreshLogs() {
        try {
            const logs = await this.logService.fetchLogs(this.currentLogType);
            this.displayLogs(logs);
        } catch (error) {
            console.error('Error refreshing logs:', error);
            this.showError('Failed to refresh logs');
        }
    }

    async analyzeLogs() {
        try {
            const analysisButton = this.element.querySelector('.analyze-button');
            analysisButton.disabled = true;
            analysisButton.textContent = 'Analyzing...';

            // Get current logs from the content
            const logContent = this.element.querySelector('.log-content');
            const logEntries = Array.from(logContent.querySelectorAll('.log-entry')).map(entry => ({
                message: entry.querySelector('.log-message').textContent,
                timestamp: entry.querySelector('.log-timestamp').textContent,
                thread: entry.querySelector('.log-thread').textContent,
                severity: entry.dataset.severity || 'info'
            }));

            console.log('Collected log entries:', logEntries);

            if (logEntries.length === 0) {
                throw new Error('No logs available for analysis');
            }

            // Send logs for analysis
            const analysis = await this.logService.analyzeBatch(logEntries);
            
            // Display analysis
            this.displayAnalysis(analysis);
        } catch (error) {
            console.error('Error analyzing logs:', error);
            this.showError('Failed to analyze logs: ' + error.message);
        } finally {
            const analysisButton = this.element.querySelector('.analyze-button');
            analysisButton.disabled = false;
            analysisButton.textContent = 'Analyze Logs';
        }
    }

    displayLogs(logs) {
        this.logsContainer.innerHTML = '';
        
        // Reverse the logs array to show newest first
        [...logs].reverse().forEach(log => {
            const logEntry = document.createElement('div');
            logEntry.className = `log-entry ${log.severity}`;
            logEntry.dataset.severity = log.severity;
            
            const timestamp = document.createElement('span');
            timestamp.className = 'log-timestamp';
            timestamp.textContent = log.timestamp;
            
            const thread = document.createElement('span');
            thread.className = 'log-thread';
            thread.textContent = log.thread;

            const message = document.createElement('span');
            message.className = 'log-message';
            message.textContent = log.message;
            
            logEntry.appendChild(timestamp);
            logEntry.appendChild(thread);
            logEntry.appendChild(message);
            this.logsContainer.appendChild(logEntry);
        });
    }

    displayAnalysis(analysis) {
        const analysisPanel = this.element.querySelector('.analysis-panel');
        analysisPanel.innerHTML = '';
        
        const content = document.createElement('div');
        content.className = 'analysis-content';
        content.innerHTML = `<pre>${analysis}</pre>`;
        
        analysisPanel.appendChild(content);
        analysisPanel.style.display = 'block';
    }

    showLoading() {
        this.logsContainer.innerHTML = '<div class="loading">Loading logs...</div>';
        this.analysisContainer.style.display = 'none';
    }

    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'log-entry error';
        errorDiv.innerHTML = `<span class="log-message">${message}</span>`;
        this.logsContainer.insertBefore(errorDiv, this.logsContainer.firstChild);
    }
}

export default LogPanel;
