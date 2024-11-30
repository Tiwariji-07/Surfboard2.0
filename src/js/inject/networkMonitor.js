// Console error monitoring script
(function() {
    function sendErrorToExtension(error) {
        window.postMessage({
            type: 'SURFBOARD_NETWORK_ERROR',
            error: error
        }, '*');
    }

    // Store original console methods
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;

    // Override console.error
    console.error = function(...args) {
        const errorMessage = args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg, Object.getOwnPropertyNames(arg)) : String(arg)
        ).join(' ');

        const error = {
            type: 'error',
            severity: 'ERROR',
            message: errorMessage,
            details: {
                arguments: args.map(arg => {
                    if (arg instanceof Error) {
                        return {
                            message: arg.message,
                            stack: arg.stack,
                            name: arg.name
                        };
                    }
                    return arg;
                }),
                timestamp: new Date().toISOString()
            },
            source: 'console'
        };

        sendErrorToExtension(error);
        originalConsoleError.apply(console, args);
    };

    // Monitor XMLHttpRequest
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(...args) {
        this._url = args[1];
        return originalXHROpen.apply(this, args);
    };

    XMLHttpRequest.prototype.send = function(...args) {
        const xhr = this;
        
        xhr.addEventListener('load', function() {
            if (xhr.status >= 400) {
                const errorMessage = `${xhr.status} (${xhr.statusText}) - ${xhr._url}`;
                console.error(errorMessage, {
                    url: xhr._url,
                    status: xhr.status,
                    statusText: xhr.statusText,
                    response: xhr.responseText
                });
            }
        });

        xhr.addEventListener('error', function() {
            console.error('Network Error', {
                url: xhr._url,
                error: 'Failed to make request'
            });
        });

        return originalXHRSend.apply(xhr, args);
    };

    // Monitor Fetch API
    const originalFetch = fetch;
    fetch = async function(...args) {
        const url = typeof args[0] === 'string' ? args[0] : args[0].url;
        try {
            const response = await originalFetch.apply(this, args);
            if (!response.ok) {
                let errorDetails;
                try {
                    errorDetails = await response.clone().text();
                } catch {
                    errorDetails = 'Could not read response body';
                }
                console.error(`${response.status} (${response.statusText}) - ${url}`, {
                    url: url,
                    status: response.status,
                    statusText: response.statusText,
                    response: errorDetails
                });
            }
            return response;
        } catch (error) {
            console.error('Network Error', {
                url: url,
                error: error.message
            });
            throw error;
        }
    };

    // Override console.warn
    console.warn = function(...args) {
        const warnMessage = args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg, Object.getOwnPropertyNames(arg)) : String(arg)
        ).join(' ');

        const warning = {
            type: 'warning',
            severity: 'WARN',
            message: warnMessage,
            details: {
                arguments: args.map(arg => {
                    if (arg instanceof Error) {
                        return {
                            message: arg.message,
                            stack: arg.stack,
                            name: arg.name
                        };
                    }
                    return arg;
                }),
                timestamp: new Date().toISOString()
            },
            source: 'console'
        };

        sendErrorToExtension(warning);
        originalConsoleWarn.apply(console, args);
    };

    // Capture unhandled errors
    window.addEventListener('error', function(event) {
        const error = {
            type: 'error',
            severity: 'ERROR',
            message: event.message,
            details: {
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                error: event.error ? {
                    message: event.error.message,
                    stack: event.error.stack,
                    name: event.error.name
                } : null,
                timestamp: new Date().toISOString()
            },
            source: 'window'
        };
        
        sendErrorToExtension(error);
    });

    // Capture unhandled promise rejections
    window.addEventListener('unhandledrejection', function(event) {
        const error = {
            type: 'error',
            severity: 'ERROR',
            message: event.reason ? (event.reason.message || String(event.reason)) : 'Unhandled Promise Rejection',
            details: {
                reason: event.reason instanceof Error ? {
                    message: event.reason.message,
                    stack: event.reason.stack,
                    name: event.reason.name
                } : event.reason,
                timestamp: new Date().toISOString()
            },
            source: 'promise'
        };
        
        sendErrorToExtension(error);
    });
})();
