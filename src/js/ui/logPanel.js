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
            // this.showLoading();
            const logs = await this.logService.fetchLogs(type);
            // this.displayLogs(logs);
        } catch (error) {
            this.showError(error.message);
        }
    }

    async refreshLogs() {
        try {
            // console.log('Starting log refresh...');
            // this.showLoading();
            
            // Clear existing logs
            // const logContent = this.element.querySelector('.log-content');
            // if (logContent) {
                // console.log('Clearing existing logs');
            //     logContent.innerHTML = '';
            // } else {
            //     console.warn('Log content container not found');
            // }

            // console.log('Fetching logs of type:', this.currentLogType);
            const logs = await this.logService.fetchLogs(this.currentLogType);
            // console.log('Received logs:', logs);
            
            if (!logs || !Array.isArray(logs)) {
                console.warn('Invalid logs format:', logs);
                throw new Error('Invalid logs format received');
            }

            if (logs.length === 0) {
                console.warn('No logs received');
                logContent.innerHTML = '<div class="no-logs">No logs available</div>';
                return;
            }
            this.analyzeLogs(this.currentLogType);

            // console.log('Displaying logs...');
            // this.displayLogs(logs);
            // console.log('Logs displayed successfully');
        } catch (error) {
            console.error('Error refreshing logs:', error);
            this.showError('Failed to fetch logs: ' + error.message);
        } finally {
            // Hide loading indicator
            const loadingIndicator = this.element.querySelector('.loading-indicator');
            if (loadingIndicator) {
                loadingIndicator.style.display = 'none';
            }
        }
    }

    async analyzeLogs(type = this.currentLogType) {
        try {
            const analysisButton = this.element.querySelector('.analyze-button');
            analysisButton.disabled = true;
            analysisButton.textContent = 'Analyzing...';

            // Get current logs from the content
            const logContent = this.element.querySelector('.log-content');
            let logSections = [];
            try {
                logSections = await this.logService.fetchLogs(type);
            } catch (error) {
                this.showError(error.message);
            }

            // console.log('Collected log sections for analysis:', logSections);

            // Analyze logs using OpenAI
            const analysis = await this.logService.analyzeBatch(logSections);
            
            // Display analysis results
            this.showAnalysis(analysis);
        } catch (error) {
            console.error('Error analyzing logs:', error);
            this.showError('Failed to analyze logs: ' + error.message);
        } finally {
            const analysisButton = this.element.querySelector('.analyze-button');
            analysisButton.disabled = false;
            analysisButton.textContent = '🔍 Analyze';
        }
    }

    // displayLogs(sections) {
        // console.log('Starting displayLogs with sections:', sections);
        
    //     const logContent = this.element.querySelector('.log-content');
    //     if (!logContent) {
    //         console.error('Log content container not found');
    //         return;
    //     }

    //     logContent.innerHTML = '';

    //     if (!sections || sections.length === 0) {
    //         console.warn('No sections to display');
    //         logContent.innerHTML = '<div class="no-logs">No logs available</div>';
    //         return;
    //     }

        // console.log('Processing sections...');
    //     sections.forEach((section, index) => {
            // console.log(`Processing section ${index}:`, section);
            
    //         const sectionDiv = document.createElement('div');
    //         sectionDiv.className = 'log-section';

    //         // Add section header
    //         const header = document.createElement('div');
    //         header.className = 'section-header';
    //         header.textContent = section.timeSection;
    //         sectionDiv.appendChild(header);

    //         if (!section.logs || !Array.isArray(section.logs)) {
    //             console.warn(`Invalid logs in section ${index}:`, section.logs);
    //             return;
    //         }

    //         // Add logs for this section
    //         section.logs.forEach((log, logIndex) => {
                // console.log(`Processing log ${logIndex} in section ${index}:`, log);
                
    //             const logEntry = document.createElement('div');
    //             logEntry.className = `log-entry severity-${log.severity}`;
    //             logEntry.dataset.severity = log.severity;

    //             // Format timestamp to show only time portion
    //             const timeOnly = log.timestamp.split(' ')[1];

    //             logEntry.innerHTML = `
    //                 <span class="log-timestamp">${timeOnly}</span>
    //                 ${log.projectPath ? `<span class="log-project">${log.projectPath}</span>` : ''}
    //                 ${log.appId ? `<span class="log-appid">${log.appId}</span>` : ''}
    //                 <span class="log-thread">${log.thread}</span>
    //                 <span class="log-severity ${log.severity}">${log.severity.toUpperCase()}</span>
    //                 <span class="log-component">[${log.component}]</span>
    //                 <span class="log-message ${log.stackTrace && log.stackTrace.length > 0 ? 'has-stack' : ''}">${this.escapeHtml(log.message)}</span>
    //             `;

    //             sectionDiv.appendChild(logEntry);
    //         });

    //         logContent.appendChild(sectionDiv);
    //     });
        
        // console.log('Finished displaying logs');
    // }

    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // displayAnalysis(analysis) {
    //     const analysisPanel = this.element.querySelector('.analysis-panel');
    //     if (!analysisPanel) {
    //         console.error('Analysis panel not found');
    //         return;
    //     }

    //     analysisPanel.innerHTML = '';
        
    //     const content = document.createElement('div');
    //     content.className = 'analysis-content';
    //     content.innerHTML = `<pre>${analysis}</pre>`;
        
    //     analysisPanel.appendChild(content);
    //     analysisPanel.style.display = 'block';
    // }

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

    showAnalysis(analysis) {
        const analysisPanel = this.element.querySelector('.analysis-panel');
        if (!analysisPanel) {
            console.error('Analysis panel not found');
            return;
        }

        analysisPanel.innerHTML = '';
        
        const content = document.createElement('div');
        content.className = 'analysis-content';
        content.innerHTML = `<pre>${analysis}</pre>`;
        
        analysisPanel.appendChild(content);
        analysisPanel.style.display = 'block';
    }
}

export default LogPanel;
