(function initSurfboardMonacoHelper() {
    if (window.__surfboardMonacoHelperInitialized) {
        return;
    }
    window.__surfboardMonacoHelperInitialized = true;

    const PAGE_MESSAGES = {
        EDITOR_CONTENT_APPLY: 'SURFBOARD_EDITOR_CONTENT_APPLY',
        EDITOR_CONTENT_REQUEST: 'SURFBOARD_EDITOR_CONTENT_REQUEST',
        EDITOR_CONTENT_RESPONSE: 'SURFBOARD_EDITOR_CONTENT_RESPONSE',
        INLINE_COMPLETIONS_REQUEST: 'SURFBOARD_INLINE_COMPLETIONS_REQUEST',
        INLINE_COMPLETIONS_RESPONSE: 'SURFBOARD_INLINE_COMPLETIONS_RESPONSE',
        MONACO_HELPER_READY: 'SURFBOARD_MONACO_HELPER_READY',
        NAVIGATE_TO_FILE: 'SURFBOARD_NAVIGATE_TO_FILE'
    };

    let activeEditor = null;
    const registeredLanguages = new Set();

    function waitForMonaco(callback) {
        if (typeof monaco !== 'undefined') {
            callback();
            return;
        }

        window.setTimeout(() => waitForMonaco(callback), 100);
    }

    function setActiveEditor(editor) {
        activeEditor = editor;
    }

    function registerInlineCompletionProvider(language) {
        if (registeredLanguages.has(language)) {
            return;
        }

        monaco.languages.registerInlineCompletionsProvider(language, {
            provideInlineCompletions: async (model, position) => {
                const lineCount = model.getLineCount();
                const contextWindow = 10;
                const startLine = Math.max(1, position.lineNumber - contextWindow);
                const endLine = Math.min(lineCount, position.lineNumber + contextWindow);
                const contextRange = {
                    startLineNumber: startLine,
                    startColumn: 1,
                    endLineNumber: endLine,
                    endColumn: model.getLineMaxColumn(endLine)
                };
                const requestId = `${model.id}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
                const globalCursorOffset = model.getOffsetAt(position);
                const windowStartOffset = model.getOffsetAt({
                    lineNumber: startLine,
                    column: 1
                });
                const cursorOffset = globalCursorOffset - windowStartOffset;
                const wordUntil = model.getWordUntilPosition(position);
                const insertColumn = wordUntil && wordUntil.word ? wordUntil.startColumn : position.column;

                window.postMessage(
                    {
                        type: PAGE_MESSAGES.INLINE_COMPLETIONS_REQUEST,
                        data: {
                            currentFileContent: model.getValue(),
                            contextText: model.getValueInRange(contextRange),
                            cursorOffset,
                            fileName: getFileName(model),
                            filePath: getFilePath(model),
                            insertColumn,
                            language: model.getLanguageId(),
                            modelId: model.id,
                            position: {
                                lineNumber: position.lineNumber,
                                column: position.column
                            },
                            relatedFiles: collectRelatedModels(model),
                            requestId
                        }
                    },
                    '*'
                );

                return new Promise((resolve) => {
                    const timeoutId = window.setTimeout(() => {
                        window.removeEventListener('message', handleResponse);
                        resolve({ items: [] });
                    }, 5000);

                    const handleResponse = (event) => {
                        const payload = event.data;
                        if (
                            payload?.type !== PAGE_MESSAGES.INLINE_COMPLETIONS_RESPONSE ||
                            payload?.data?.requestId !== requestId ||
                            payload?.data?.modelId !== model.id
                        ) {
                            return;
                        }

                        window.clearTimeout(timeoutId);
                        window.removeEventListener('message', handleResponse);

                        const items = (payload.data.items || []).map((item) => ({
                            insertText: item.text,
                            range: new monaco.Range(
                                item.range.startLineNumber,
                                item.range.startColumn,
                                item.range.endLineNumber,
                                item.range.endColumn
                            )
                        }));

                        resolve({
                            items,
                            suppressSuggestions: false
                        });
                    };

                    window.addEventListener('message', handleResponse);
                });
            },
            freeInlineCompletions: () => {}
        });

        registeredLanguages.add(language);
    }

    function registerEditor(editor) {
        setActiveEditor(editor);

        if (typeof editor.onDidFocusEditorText === 'function') {
            editor.onDidFocusEditorText(() => setActiveEditor(editor));
        }

        if (typeof editor.onDidChangeModel === 'function') {
            editor.onDidChangeModel(() => setActiveEditor(editor));
        }

        if (typeof editor.updateOptions === 'function') {
            editor.updateOptions({
                inlineSuggest: {
                    enabled: true
                }
            });
        }
    }

    function getFilePath(model) {
        if (!model || !model.uri) {
            return '';
        }

        return model.uri.path || model.uri.toString() || '';
    }

    function getFileName(model) {
        const path = getFilePath(model);
        if (!path) {
            return '';
        }

        const segments = path.split('/');
        return segments[segments.length - 1];
    }

    function getFileBaseName(fileName) {
        if (!fileName) {
            return '';
        }

        const lastDot = fileName.lastIndexOf('.');
        return lastDot === -1 ? fileName : fileName.slice(0, lastDot);
    }

    function collectRelatedModels(currentModel) {
        const currentFileName = getFileName(currentModel);
        const baseName = getFileBaseName(currentFileName);

        if (!baseName) {
            return [];
        }

        return monaco.editor
            .getModels()
            .filter((model) => model && model.id !== currentModel.id)
            .map((model) => ({
                fileName: getFileName(model),
                filePath: getFilePath(model),
                language: model.getLanguageId(),
                content: model.getValue()
            }))
            .filter((model) => getFileBaseName(model.fileName) === baseName)
            .slice(0, 3);
    }

    function getActiveEditorContent() {
        try {
            if (!activeEditor) {
                const editors = monaco.editor.getEditors();
                if (editors.length > 0) {
                    activeEditor = editors[0];
                }
            }

            if (!activeEditor) {
                return { error: 'No active editor found' };
            }

            const model = activeEditor.getModel();
            if (!model) {
                return { error: 'No active document found' };
            }

            return {
                content: model.getValue(),
                fileName: getFileName(model),
                filename: getFileName(model),
                filePath: getFilePath(model),
                language: model.getLanguageId()
            };
        } catch (error) {
            return {
                error: error.message || 'Failed to get editor content'
            };
        }
    }

    function navigateToFile(line, column) {
        if (!activeEditor) {
            return;
        }

        try {
            activeEditor.setPosition({
                lineNumber: parseInt(line, 10),
                column: parseInt(column, 10) || 1
            });
            activeEditor.revealLineInCenter(parseInt(line, 10));
            activeEditor.focus();
        } catch (error) {
            console.error('Failed to navigate inside active editor:', error);
        }
    }

    function findModelForApply(target = {}) {
        const models = monaco.editor.getModels();
        const targetFileName = String(target.fileName || '').trim();
        const targetResourcePath = String(target.resourcePath || '').trim();
        const targetProjectPath = String(target.projectPath || '').trim();

        if (!models.length) {
            return null;
        }

        const activeModel = activeEditor?.getModel();
        if (activeModel) {
            const activePath = getFilePath(activeModel);
            const activeFileName = getFileName(activeModel);
            if (
                (targetFileName && activeFileName === targetFileName) ||
                (targetResourcePath && activePath.endsWith(targetResourcePath)) ||
                (targetProjectPath && activePath.endsWith(targetProjectPath))
            ) {
                return activeModel;
            }
        }

        return (
            models.find((model) => {
                const modelPath = getFilePath(model);
                const modelFileName = getFileName(model);
                return (
                    (targetFileName && modelFileName === targetFileName) ||
                    (targetResourcePath && modelPath.endsWith(targetResourcePath)) ||
                    (targetProjectPath && modelPath.endsWith(targetProjectPath))
                );
            }) || activeModel || models[0]
        );
    }

    function applyEditorContent(target) {
        try {
            if (!activeEditor) {
                const editors = monaco.editor.getEditors();
                if (editors.length > 0) {
                    activeEditor = editors[0];
                }
            }

            const content = typeof target === 'string' ? target : target?.content;
            const model = findModelForApply(typeof target === 'string' ? { content } : target);
            if (!model || typeof content !== 'string') {
                return;
            }

            model.setValue(content);
        } catch (error) {
            console.error('Failed to apply editor content:', error);
        }
    }

    function setupWindowListeners() {
        window.addEventListener('message', (event) => {
            if (event.data?.type === PAGE_MESSAGES.EDITOR_CONTENT_REQUEST) {
                window.postMessage(
                    {
                        type: PAGE_MESSAGES.EDITOR_CONTENT_RESPONSE,
                        ...getActiveEditorContent()
                    },
                    '*'
                );
            }

            if (event.data?.type === PAGE_MESSAGES.NAVIGATE_TO_FILE) {
                navigateToFile(event.data.data?.line, event.data.data?.column);
            }

            if (event.data?.type === PAGE_MESSAGES.EDITOR_CONTENT_APPLY) {
                applyEditorContent(event.data.data);
            }
        });
    }

    waitForMonaco(() => {
        ['javascript', 'typescript', 'html', 'css'].forEach(registerInlineCompletionProvider);

        monaco.editor.onDidCreateEditor((editor) => {
            registerEditor(editor);
        });

        const existingEditors = monaco.editor.getEditors();
        existingEditors.forEach(registerEditor);

        setupWindowListeners();
        window.postMessage({ type: PAGE_MESSAGES.MONACO_HELPER_READY }, '*');
    });
})();
