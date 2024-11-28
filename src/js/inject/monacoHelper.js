// Script that runs in the page context to access Monaco

let activeEditor = null;

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
        // Store reference to active editor
        monaco.editor.onDidCreateEditor((editor) => {
            activeEditor = editor;
        });

        // Listen for messages from the extension
        window.addEventListener('message', async (event) => {
            if (event.data.type === 'GET_EDITOR_CONTENT') {
                const editor = getActiveEditorContent();
                window.postMessage({
                    type: 'EDITOR_CONTENT_RESPONSE',
                    content: editor.content,
                    filename: editor.filename,
                    error: editor.error
                }, '*');
            }
        });

        // Listen for navigation messages
        window.addEventListener('message', (event) => {
            if (event.data.type === 'NAVIGATE_TO_FILE') {
                const { filename, line, column } = event.data.data;
                navigateToFile(filename, line, column);
            }
        });

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

/**
 * Get content from the active editor
 */
function getActiveEditorContent() {
    try {
        if (!activeEditor) {
            const editors = monaco.editor.getEditors();
            if (editors.length > 0) {
                activeEditor = editors[0];
            } else {
                return {
                    error: 'No active editor found'
                };
            }
        }

        const model = activeEditor.getModel();
        if (!model) {
            return {
                error: 'No active document found'
            };
        }

        return {
            content: model.getValue(),
            filename: model.uri.path.split('/').pop()
        };
    } catch (error) {
        return {
            error: error.message || 'Failed to get editor content'
        };
    }
}

/**
 * Navigate to a specific file and position
 */
function navigateToFile(filename, line, column) {
    const editor = getActiveEditor();
    if (!editor) {
        console.error('No active editor found');
        return;
    }

    try {
        // Set cursor position
        editor.setPosition({
            lineNumber: parseInt(line, 10),
            column: parseInt(column, 10) || 1
        });

        // Reveal the line
        editor.revealLineInCenter(parseInt(line, 10));

        // Focus the editor
        editor.focus();
    } catch (error) {
        console.error('Failed to navigate:', error);
    }
}

/**
 * Get the active editor
 */
function getActiveEditor() {
    return activeEditor;
}

// Initialize the helper
initMonacoHelper();