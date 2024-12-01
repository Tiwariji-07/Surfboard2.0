import openaiService from './openaiService.js';

export class LogService {
    constructor() {
        this.baseUrl = 'https://www.wavemakeronline.com/studio/services/studio/logs';
        this.authCookie = null;
        this.openaiService = openaiService;
        this.logs = [];
        this.initialized = false;
        this.setupMessageListener();
        // this.setupConsoleMonitor();
        // this.setupNetworkMonitor();
    }

    setupMessageListener() {
        window.addEventListener('message', (event) => {
            if (event.data.type === 'SURFBOARD_NETWORK_ERROR') {
                this.addLog(event.data.error);
            }
        });
    }

    injectNetworkMonitor() {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('src/js/inject/networkMonitor.js');
        (document.head || document.documentElement).appendChild(script);
        script.onload = () => script.remove();
    }

    async initialize(apiKey) {
        if (this.initialized) {
            return;
        }
        this.initialized = true;
        // this.injectNetworkMonitor();
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
            
            // console.log('LogService initialized with auth cookie and API key');
        } catch (error) {
            console.error('Failed to initialize LogService:', error);
            throw error;
        }
    }

    // setupConsoleMonitor() {
    //     const originalConsoleError = console.error;
    //     const originalConsoleWarn = console.warn;
        
    //     console.error = (...args) => {
    //         this.addLog({
    //             type: 'error',
    //             severity: 'ERROR',
    //             message: args.map(arg => 
    //                 typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    //             ).join(' '),
    //             timestamp: new Date().toISOString(),
    //             source: 'console'
    //         });
    //         originalConsoleError.apply(console, args);
    //     };

    //     console.warn = (...args) => {
    //         this.addLog({
    //             type: 'warning',
    //             severity: 'WARN',
    //             message: args.map(arg => 
    //                 typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    //             ).join(' '),
    //             timestamp: new Date().toISOString(),
    //             source: 'console'
    //         });
    //         originalConsoleWarn.apply(console, args);
    //     };
    // }

    // setupNetworkMonitor() {
    //     // Monitor XMLHttpRequest
    //     const originalXHR = window.XMLHttpRequest.prototype.open;
    //     window.XMLHttpRequest.prototype.open = function(...args) {
    //         const xhr = this;
    //         const url = args[1];
            
    //         // Add event listeners for error handling
    //         xhr.addEventListener('load', () => {
    //             if (xhr.status >= 400) {
    //                 console.error(`XHR Error: ${xhr.status} ${xhr.statusText}`);
    //                 this.addLog({
    //                     type: 'error',
    //                     severity: 'ERROR',
    //                     message: `XHR Error: ${xhr.status} ${xhr.statusText}`,
    //                     details: {
    //                         url: url,
    //                         status: xhr.status,
    //                         statusText: xhr.statusText,
    //                         response: xhr.responseText
    //                     },
    //                     timestamp: new Date().toISOString(),
    //                     source: 'network'
    //                 });
    //             }
    //         });

    //         xhr.addEventListener('error', () => {
    //             console.error('XHR Network Error');
    //             this.addLog({
    //                 type: 'error',
    //                 severity: 'ERROR',
    //                 message: `XHR Network Error`,
    //                 details: {
    //                     url: url,
    //                     error: 'Network request failed'
    //                 },
    //                 timestamp: new Date().toISOString(),
    //                 source: 'network'
    //             });
    //         });

    //         return originalXHR.apply(this, args);
    //     };

    //     // Monitor Fetch API
    //     const originalFetch = window.fetch;
    //     window.fetch = async (...args) => {
    //         try {
    //             const response = await originalFetch(...args);
    //             const url = typeof args[0] === 'string' ? args[0] : args[0].url;
                
    //             if (!response.ok) {
    //                 let errorDetails;
    //                 try {
    //                     errorDetails = await response.clone().text();
    //                 } catch {
    //                     errorDetails = 'Could not read response body';
    //                 }
    //                 console.error(`Fetch Error: ${response.status} ${response.statusText}`);
    //                 this.addLog({
    //                     type: 'error',
    //                     severity: 'ERROR',
    //                     message: `Fetch Error: ${response.status} ${response.statusText}`,
    //                     details: {
    //                         url: url,
    //                         status: response.status,
    //                         statusText: response.statusText,
    //                         response: errorDetails
    //                     },
    //                     timestamp: new Date().toISOString(),
    //                     source: 'network'
    //                 });
    //             }
    //             return response;
    //         } catch (error) {
    //             const url = typeof args[0] === 'string' ? args[0] : args[0].url;
    //             this.addLog({
    //                 type: 'error',
    //                 severity: 'ERROR',
    //                 message: `Fetch Network Error: ${error.message}`,
    //                 details: {
    //                     url: url,
    //                     error: error.message
    //                 },
    //                 timestamp: new Date().toISOString(),
    //                 source: 'network'
    //             });
    //             throw error;
    //         }
    //     };
    // }

    async fetchLogs(type = 'server', limit = 1000) {
        try {
            // console.log('Fetching logs of type:', type, 'with limit:', limit);
            
            if (!this.authCookie) {
                // console.log('No auth cookie found, initializing...');
                await this.initialize();
            }
            // console.log('Using auth cookie:', this.authCookie ? 'Present' : 'Missing');

            const url = `${this.baseUrl}/${type}/${limit}`;
            // console.log('Fetching logs from URL:', url);

            const response = await fetch(url, {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Cookie': `auth_cookie=${this.authCookie}`
                }
            });

            // console.log('Response status:', response.status);
            if (!response.ok) {
                throw new Error(`Failed to fetch ${type} logs: ${response.statusText}`);
            }

            const data = await response.json();
            // console.log('Raw response data:', data);

            if (!data || !data.result) {
                console.warn('Invalid response format:', data);
                throw new Error('Invalid response format from server');
            }

            const sections = await this.parseLogs(data, type);
            // console.log('Parsed log sections:', sections);
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
                // console.log('Raw logs result:', rawLogs.result);
                const logLines = rawLogs.result.split('\n').filter(line => line.trim());
                // console.log('Filtered log lines:', logLines);
                
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
                        if (currentLog && currentLog.stackTrace && currentLog.stackTrace.length > 0) {
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

                            // Check if this log entry starts a compilation error
                            if (message && message.includes('Error occurred while serving the request')) {
                                currentLog.severity = 'error';
                                continue; // Skip adding to parsedLogs, wait for stack trace
                            }
                        } else {
                            let [, timestamp, projectPath, appId, thread, level, component, message] = mainLogMatch;
                            // Convert timestamp to ISO format

                            if (!timestamp) {
                                timestamp = new Date().toISOString();
                              }

                            if (!message && mainLogMatch[0]) {
                                message = mainLogMatch[0];
                              }
                            const date = new Date(timestamp);
                            const isoTimestamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${timestamp.split(' ').pop()}`;
                            
                            currentLog = {
                                timestamp: isoTimestamp,
                                timeSection: isoTimestamp.slice(0, -4),
                                projectPath: projectPath && projectPath.startsWith('-') ? projectPath.slice(1) : projectPath,
                                appId: appId && appId.startsWith('-') ? appId.slice(1) : appId,
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
                    } else if (currentLog) {
                        // Handle compilation errors and stack traces
                        const line_trimmed = line.trim();
                        
                        if (line_trimmed.startsWith('com.wavemaker.studio.core.compiler.JavaCompilationErrorsException')) {
                            // Start of compilation error
                            currentLog.message = line_trimmed;
                            currentLog.severity = 'error';
                            currentLog.stackTrace = [line_trimmed];
                        } else if (line_trimmed.startsWith('[{"filename"')) {
                            // JSON error details for compilation error
                            if (currentLog.stackTrace) {
                                currentLog.stackTrace.push(line_trimmed);
                            }
                        } else if (line_trimmed.startsWith('at ')) {
                            // Stack trace line
                            if (currentLog.stackTrace) {
                                currentLog.stackTrace.push(line_trimmed);
                            }
                        }

                        // Handling regular error cases: Caused by and Exception/Error
                        if (line_trimmed.startsWith('Caused by:') || line_trimmed.includes('Exception:') || line_trimmed.includes('Error:')) {
                            // This indicates a nested exception or error that should be captured
                            if (!currentLog.message) {
                                // If there is no message yet, use this as the first message
                                currentLog.message = line_trimmed;
                            } else {
                                // If the message exists, append this error detail
                                currentLog.stackTrace = currentLog.stackTrace || [];
                                currentLog.stackTrace.push(line_trimmed);
                            }
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
                if (currentLog && currentLog.stackTrace && currentLog.stackTrace.length > 0) {
                    parsedLogs.push(currentLog);
                }

                // console.log('Parsed logs:', parsedLogs);

                // Filter out info logs and group by time section
                const filteredLogs = parsedLogs
                    .filter(log => ['warn', 'error', 'debug'].includes(log.severity));
                
                // console.log('Filtered logs by severity:', filteredLogs);

                const groupedLogs = filteredLogs.reduce((groups, log) => {
                    const group = groups[log.timeSection] || [];
                    group.push(log);
                    groups[log.timeSection] = group;
                    return groups;
                }, {});

                // console.log('Grouped logs:', groupedLogs);

                // Convert to array of sections, sorted by time (newest first)
                const sections = Object.entries(groupedLogs)
                    .map(([timeSection, logs]) => ({
                        timeSection,
                        logs: logs.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
                    }))
                    .sort((a, b) => b.timeSection.localeCompare(a.timeSection));

                // console.log('Final sections:', sections);
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
        if (['error', 'warn', 'debug', 'info'].includes(level)) return level;

        // Then check message content
        const message = (log.message || '').toLowerCase();

        if (message.includes('error') || message.includes('exception') || message.includes('fail')) {
            return 'error';
        }
        else if (message.includes('warn')) return 'warn';
        else if (message.includes('debug')) return 'debug';

        return 'info';
    }

    async analyzeBatch(logSections,isConsole=false) {
        try {
            console.log('Starting batch analysis:', logSections);
            
            // Prepare logs for analysis
            console.log("Inside analyzeBatch:");
            let logsForAnalysis;
            if(!isConsole){
                    let section = logSections[0];
                // let logsForAnalysis = logSections.flatMap(section => 
                     logsForAnalysis = section.logs.map(log => ({
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
                // );

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
            }else{
                logsForAnalysis = logSections[0];
            }

            

            // Create prompt for OpenAI
            const prompt = `Analyze these logs and provide a VERY concise, human-friendly explanation:
        1. What's the problem and posible root cause? (1 short sentence)
        2. Where is it? (file and line number)
        3. How to fix it? (concise and actionable steps)

        Keep it extremely simple - imagine explaining to someone who's not technical.

        ${JSON.stringify(logsForAnalysis, null, 2)}`;

            // console.log('Sending batch analysis request to OpenAI');
            const aiAnalysis = await this.openaiService.analyzeLogs(prompt);
            console.log('Received analysis from OpenAI:', aiAnalysis);
            
            return aiAnalysis;
        } catch (error) {
            console.error('Error in batch analysis:', error);
            throw error;
        }
    }   

    addLog(log) {
        // Don't log requests to our own API
        if (log.source === 'network' && 
            (log.details?.url?.includes('api.groq.com') || 
             log.details?.url?.includes('127.0.0.1'))) {
            return;
        }
        
        this.logs.push(log);
        // Analyze the log immediately if it's an error or warning
        if (log.severity === 'ERROR' || log.severity === 'WARN') {
            if(this.logs.length > 0)
            this.analyzeBatch(this.logs,true);
        }
    }
}

// export default LogService;
