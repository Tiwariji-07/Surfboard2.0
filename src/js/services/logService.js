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
        try {
            console.log('Fetching logs of type:', type, 'with limit:', limit);
            
            if (!this.authCookie) {
                console.log('No auth cookie found, initializing...');
                await this.initialize();
            }
            console.log('Using auth cookie:', this.authCookie ? 'Present' : 'Missing');

            const url = `${this.baseUrl}/${type}/${limit}`;
            console.log('Fetching logs from URL:', url);

            const response = await fetch(url, {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Cookie': `auth_cookie=${this.authCookie}`
                }
            });

            console.log('Response status:', response.status);
            if (!response.ok) {
                throw new Error(`Failed to fetch ${type} logs: ${response.statusText}`);
            }

            const data = await response.json();
            console.log('Raw response data:', data);

            if (!data || !data.result) {
                console.warn('Invalid response format:', data);
                throw new Error('Invalid response format from server');
            }

            const sections = await this.parseLogs(data, type);
            console.log('Parsed log sections:', sections);
            return sections;
        } catch (error) {
            console.error('Error in fetchLogs:', error);
            throw error;
        }
    }

    async parseLogs(rawLogs, type = 'server') {
        try {
            if (!rawLogs || typeof rawLogs !== 'object') {
                console.warn('Invalid logs response:', rawLogs);
                return [];
            }

            if (rawLogs.result) {
                console.log('Raw logs result:', rawLogs.result);
                const logLines = rawLogs.result.split('\n').filter(line => line.trim());
                console.log('Filtered log lines:', logLines);
                
                let currentLog = null;
                const parsedLogs = [];

                // Different regex patterns for server and application logs
                const serverLogPattern = /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2},\d{3})\s+(\S+)\s+(\w+)\s+(\S+)\s+(\S+)\s+\[([^\]]+)\](?:\s*-\s*(.+))?$/;
                const appLogPattern = /^(\d{2}\s+\w+\s+\d{4}\s+\d{2}:\d{2}:\d{2},\d{3})\s+(-[^\s]*)\s+(-[^\s]*)\s+(\S+)\s+(\w+)\s+\[([^\]]+)\](?:\s*-\s*(.+))?$/;

                for (const line of logLines) {
                    // Select pattern based on log type
                    const pattern = type === 'server' ? serverLogPattern : appLogPattern;
                    const mainLogMatch = line.match(pattern);
                    
                    if (mainLogMatch) {
                        // If we have a previous log with stack trace, add it to results
                        if (currentLog && currentLog.stackTrace) {
                            parsedLogs.push(currentLog);
                        }

                        if (type === 'server') {
                            const [, timestamp, thread, level, requestId, projectPath, component, message] = mainLogMatch;
                            currentLog = {
                                timestamp,
                                timeSection: timestamp.slice(0, -4), // Remove milliseconds for grouping
                                projectPath,
                                appId: '',
                                thread,
                                severity: this.getSeverity({ level, message: message || '' }),
                                component,
                                message: message || '',
                                stackTrace: []
                            };
                        } else {
                            const [, timestamp, projectPath, appId, thread, level, component, message] = mainLogMatch;
                            // Convert timestamp to ISO format
                            const date = new Date(timestamp);
                            const isoTimestamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${timestamp.split(' ').pop()}`;
                            
                            currentLog = {
                                timestamp: isoTimestamp,
                                timeSection: isoTimestamp.slice(0, -4),
                                projectPath: projectPath.startsWith('-') ? projectPath.slice(1) : projectPath,
                                appId: appId.startsWith('-') ? appId.slice(1) : appId,
                                thread,
                                severity: this.getSeverity({ level, message: message || '' }),
                                component,
                                message: message || '',
                                stackTrace: []
                            };
                        }

                        // Only add to parsedLogs if it's not a stack trace start
                        if (!currentLog.message.includes('Exception:') && 
                            !currentLog.message.includes('Error:') && 
                            !currentLog.message.startsWith('Caused by:')) {
                            parsedLogs.push(currentLog);
                        }
                    } else if (line.trim().startsWith('at ') || 
                             line.trim().startsWith('Caused by:') || 
                             line.includes('Exception:') ||
                             line.includes('Error:') ||
                             line.match(/^[\t\s]*\.\.\.\s+\d+\s+more$/) ||
                             line.includes('.java:')) {
                        // This is a stack trace line
                        if (currentLog) {
                            currentLog.stackTrace.push(line.trim());
                            currentLog.message = currentLog.message ? 
                                `${currentLog.message}\n${line.trim()}` : 
                                line.trim();
                            currentLog.severity = 'error'; // Stack traces indicate errors
                        }
                    } else {
                        // If the message contains a stack trace (has newlines), split it
                        if (line.includes('\n')) {
                            const lines = line.split('\n');
                            const message = lines[0]; // First line is the main message

                            // Find the JSON line and the stack trace lines
                            const jsonLine = lines.find(line => line.trim().startsWith('[{'));
                            const stackLines = lines.filter(line => line.trim().startsWith('at '));
                            
                            if (jsonLine) {
                                // If JSON line exists (compilation error), include it in stack trace
                                stackTrace = [
                                    message,
                                    jsonLine,
                                    ...stackLines
                                ];
                            } else {
                                // Regular stack trace
                                stackTrace = lines.filter(line => line.trim());
                            }

                            currentLog = {
                                timestamp: '',
                                timeSection: '',
                                projectPath: '',
                                appId: '',
                                thread: '',
                                severity: 'error',
                                component: '',
                                message: message || '',
                                stackTrace
                            };
                        } else {
                            currentLog = {
                                timestamp: '',
                                timeSection: '',
                                projectPath: '',
                                appId: '',
                                thread: '',
                                severity: 'error',
                                component: '',
                                message: line || '',
                                stackTrace: []
                            };
                        }

                        parsedLogs.push(currentLog);
                    }
                }

                // Add the last log if it has a stack trace
                if (currentLog && currentLog.stackTrace.length > 0) {
                    parsedLogs.push(currentLog);
                }

                console.log('Parsed logs:', parsedLogs);

                // Filter out info logs and group by time section
                const filteredLogs = parsedLogs
                    .filter(log => ['warn', 'error', 'debug'].includes(log.severity));
                
                console.log('Filtered logs by severity:', filteredLogs);

                const groupedLogs = filteredLogs.reduce((groups, log) => {
                    const group = groups[log.timeSection] || [];
                    group.push(log);
                    groups[log.timeSection] = group;
                    return groups;
                }, {});

                console.log('Grouped logs:', groupedLogs);

                // Convert to array of sections, sorted by time (newest first)
                const sections = Object.entries(groupedLogs)
                    .map(([timeSection, logs]) => ({
                        timeSection,
                        logs: logs.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
                    }))
                    .sort((a, b) => b.timeSection.localeCompare(a.timeSection));

                console.log('Final sections:', sections);
                return sections;
            }

            console.warn('Unexpected logs format:', rawLogs);
            return [];
        } catch (error) {
            console.error('Error parsing logs:', error);
            throw error;
        }
    }

    getSeverity(log) {
        // First check explicit level
        const level = (log.level || '').toLowerCase();
        if (level === 'error') return 'error';
        if (level === 'warn' || level === 'warning') return 'warn';
        if (level === 'debug') return 'debug';
        if (level === 'info') return 'info';

        // Then check message content
        const message = (log.message || '').toLowerCase();
        if (message.includes('error') || message.includes('exception') || message.includes('fail')) {
            return 'error';
        } else if (message.includes('warn') || message.includes('warning')) {
            return 'warn';
        } else if (message.includes('debug')) {
            return 'debug';
        }
        
        return 'info';
    }

    async analyzeBatch(logSections) {
        try {
            console.log('Starting batch analysis:', logSections);
            
            // Prepare logs for analysis
            let logsForAnalysis = logSections.flatMap(section => 
                section.logs.map(log => ({
                    timestamp: log.timestamp,
                    severity: log.severity,
                    component: log.component,
                    message: log.message,
                    stackTrace: log.stackTrace,
                    ...(log.requestId && { requestId: log.requestId }),
                    ...(log.projectPath && { projectPath: log.projectPath }),
                    ...(log.appId && { appId: log.appId }),
                    thread: log.thread
                }))
            );

            if (logsForAnalysis.length === 0) {
                return "No logs available for analysis.";
            }

            // Sort logs by severity and recency
            logsForAnalysis.sort((a, b) => {
                // First sort by severity
                const severityOrder = { error: 3, warn: 2, debug: 1, info: 0 };
                const severityDiff = (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
                if (severityDiff !== 0) return severityDiff;
                
                // Then by timestamp (most recent first)
                return b.timestamp.localeCompare(a.timestamp);
            });

            // Limit to most important logs to avoid token limit
            // Keep more error logs than other types
            const errorLogs = logsForAnalysis.filter(log => log.severity === 'error').slice(0, 10);
            const warnLogs = logsForAnalysis.filter(log => log.severity === 'warn').slice(0, 5);
            const otherLogs = logsForAnalysis.filter(log => !['error', 'warn'].includes(log.severity)).slice(0, 5);
            
            logsForAnalysis = [...errorLogs, ...warnLogs, ...otherLogs];

            // Truncate stack traces if they're too long
            logsForAnalysis = logsForAnalysis.map(log => ({
                ...log,
                stackTrace: log.stackTrace.length > 10 ? 
                    [...log.stackTrace.slice(0, 8), '... truncated ...', log.stackTrace[log.stackTrace.length - 1]] :
                    log.stackTrace
            }));

            // Create prompt for OpenAI
            const prompt = `Analyze these WaveMaker Studio logs and provide a concise analysis. Be direct and specific:

🚨 ERRORS (if any):
- List exact errors
- File and line numbers
- Quick fix suggestions

⚠️ WARNINGS (if any):
- List important warnings
- Impact on system

🔍 ROOT CAUSE:
- One-line explanation
- Affected components

💡 SOLUTION:
- Bullet points with specific steps
- Code snippets if needed

Note: Keep responses short and actionable. No lengthy explanations needed.

Logs to analyze (${logsForAnalysis.length} most significant logs):
${JSON.stringify(logsForAnalysis, null, 2)}`;

            console.log('Sending batch analysis request to OpenAI');
            const aiAnalysis = await this.openaiService.analyzeLogs(prompt);
            console.log('Received analysis from OpenAI:', aiAnalysis);
            
            return aiAnalysis;
        } catch (error) {
            console.error('Error in batch analysis:', error);
            throw error;
        }
    }   

}

export default LogService;
