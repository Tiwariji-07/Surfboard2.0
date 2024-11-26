// Script that runs in the page context to access Monaco

function initMonacoHelper() {
    console.log('Initializing Monaco helper...');
    
    function waitForMonaco(callback) {
        if (typeof monaco !== 'undefined') {
            callback();
        } else {
            setTimeout(() => waitForMonaco(callback), 100);
        }
    }

    waitForMonaco(() => {
        // Register completion provider for all supported languages
        const languages = ['javascript', 'typescript', 'html', 'css'];
        
        languages.forEach(language => {
            monaco.languages.registerInlineCompletionsProvider(language, {
                provideInlineCompletions: async (model, position, context, token) => {
                    try {
                        const lineContent = model.getLineContent(position.lineNumber);
                        const wordUntil = model.getWordUntilPosition(position);
                        const lineCount = model.getLineCount();
                        
                        // Get surrounding lines for context
                        const contextWindow = 10;
                        const startLine = Math.max(1, position.lineNumber - contextWindow);
                        const endLine = Math.min(lineCount, position.lineNumber + contextWindow);
                        
                        // Get the text content for the context window
                        const contextRange = {
                            startLineNumber: startLine,
                            startColumn: 1,
                            endLineNumber: endLine,
                            endColumn: model.getLineMaxColumn(endLine)
                        };
                        
                        const requestData = {
                            type: 'GET_INLINE_COMPLETIONS',
                            data: {
                                modelId: model.id,
                                position: position,
                                language: model.getLanguageId(),
                                lineContent: lineContent,
                                wordUntil: wordUntil,
                                lineCount: lineCount,
                                // Send actual text content
                                contextText: model.getValueInRange(contextRange),
                                cursorOffset: model.getOffsetAt(position)
                            }
                        };

                        // Send request to content script
                        window.postMessage(requestData, '*');

                        // Wait for response
                        return new Promise((resolve) => {
                            const messageHandler = (event) => {
                                if (event.data.type === 'INLINE_COMPLETIONS_RESPONSE' 
                                    && event.data.data.modelId === model.id) {
                                    window.removeEventListener('message', messageHandler);
                                    
                                    // Format completions for Monaco
                                    const items = event.data.data.items.map(item => ({
                                        insertText: item.text,
                                        range: new monaco.Range(
                                            item.range.startLineNumber,
                                            item.range.startColumn,
                                            item.range.endLineNumber,
                                            item.range.endColumn
                                        )
                                    }));

                                    resolve({
                                        items: items,
                                        suppressSuggestions: false
                                    });
                                }
                            };

                            window.addEventListener('message', messageHandler);
                        });
                    } catch (error) {
                        console.error('Error in provideInlineCompletions:', error);
                        return { items: [] };
                    }
                }
            });
        });
        
        console.log('Monaco helper initialized');
    });
}

// Initialize the helper
initMonacoHelper();