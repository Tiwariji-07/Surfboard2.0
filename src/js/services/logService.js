import openaiService from './openaiService.js';

export class LogService {
    constructor() {
        this.baseUrl = 'https://www.wavemakeronline.com/studio/services/studio/logs';
        this.authCookie = null;
        this.openaiService = openaiService;
    }

    async initialize(apiKey) {
        try {
            // Get auth cookie from background script
            const response = await chrome.runtime.sendMessage({ type: 'GET_AUTH_COOKIE' });
            if (!response.cookie) {
                throw new Error('Authentication cookie not found');
            }
            this.authCookie = response.cookie;

            // Initialize OpenAI service
            if (!apiKey) {
                throw new Error('OpenAI API key is required');
            }
            await this.openaiService.setApiKey(apiKey);
            
            console.log('LogService initialized with auth cookie and API key');
        } catch (error) {
            console.error('Failed to initialize LogService:', error);
            throw error;
        }
    }

    async fetchLogs(type = 'server', limit = 1000) {
        if (!this.authCookie) {
            await this.initialize();
        }

        const url = `${this.baseUrl}/${type}/${limit}`;
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
                throw new Error(`Failed to fetch ${type} logs: ${response.statusText}`);
            }

            const logs = await response.json();
            return this.parseLogs(logs, type);
        } catch (error) {
            console.error(`Error fetching ${type} logs:`, error);
            throw error;
        }
    }

    parseLogs(logs, type) {
        if (!logs || typeof logs !== 'object') {
            console.warn('Invalid logs response:', logs);
            return [];
        }

        if (logs.result) {
            const logLines = logs.result.split('\n').filter(line => line.trim());
            
            return logLines.map(line => {
                const match = line.match(/^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2},\d{3})\s+(\S+)\s+(.+)$/);
                if (match) {
                    const [, timestamp, thread, message] = match;
                    return {
                        timestamp,
                        thread,
                        message,
                        type,
                        severity: this.getSeverity(message)
                    };
                }
                return {
                    timestamp: new Date().toISOString(),
                    thread: 'unknown',
                    message: line,
                    type,
                    severity: this.getSeverity(line)
                };
            });
        }

        console.warn('Unexpected logs format:', logs);
        return [];
    }

    getSeverity(message) {
        const lowerMessage = message.toLowerCase();
        if (lowerMessage.includes('error') || lowerMessage.includes('exception')) {
            return 'error';
        }
        if (lowerMessage.includes('warn') || lowerMessage.includes('warning')) {
            return 'warning';
        }
        if (lowerMessage.includes('debug')) {
            return 'debug';
        }
        return 'info';
    }

    async analyzeBatch(logs, maxLogs = 10) {
        try {
            console.log('Starting batch analysis with logs:', logs);
            if (!logs || logs.length === 0) {
                throw new Error('No logs provided for analysis');
            }

            // Take the most recent logs, prioritizing errors and warnings
            const significantLogs = [...logs]
                .sort((a, b) => {
                    // Prioritize errors and warnings
                    const severityScore = (log) => {
                        if (log.severity === 'error') return 3;
                        if (log.severity === 'warning') return 2;
                        if (log.severity === 'info') return 1;
                        return 0;
                    };
                    return severityScore(b) - severityScore(a);
                })
                .slice(0, maxLogs);

            console.log('Selected significant logs:', significantLogs);

            // Format logs for analysis
            const logsText = significantLogs
                .map(log => {
                    const severity = log.severity ? `[${log.severity.toUpperCase()}]` : '';
                    return `${severity} [${log.timestamp}] [${log.thread}] ${log.message}`;
                })
                .join('\n');

            console.log('Formatted logs for analysis:', logsText);

            if (!logsText.trim()) {
                throw new Error('No valid log content for analysis');
            }

            // Get AI analysis
            const aiAnalysis = await this.openaiService.analyzeLogs(logsText);
            console.log('Received analysis:', aiAnalysis);
            return aiAnalysis;
        } catch (error) {
            console.error('Error in batch analysis:', error);
            throw error;
        }
    }
}

export default LogService;
