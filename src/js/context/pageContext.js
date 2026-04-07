import WMParser from '../parser/wmParser.js';
import StudioApiService from '../services/studioApiService.js';

class PageContextManager {
    constructor() {
        this.parser = new WMParser();
        this.studioApiService = new StudioApiService();
        this.projectMetadataCache = new Map();
        this.projectMetadataRequests = new Map();
        this.pageBundleCache = new Map();
        this.pageBundleRequests = new Map();
    }

    async getCompletionContext(editorSnapshot = {}) {
        const studioContext = await this.getStudioContext();
        const activeFile = this.inferActiveFile(editorSnapshot, studioContext.pageName);
        const activeFileType = this.normalizeFileType(editorSnapshot.language, activeFile);
        const pageFiles = this.mergeEditorStateIntoPageFiles(
            studioContext.pageFiles,
            editorSnapshot,
            activeFileType
        );
        const symbols = this.extractSymbolsFromApiBundle(pageFiles);

        return {
            projectId: studioContext.projectId,
            pageName: studioContext.pageName,
            activeFile,
            activeFileType,
            language: editorSnapshot.language || 'plaintext',
            cursor: editorSnapshot.position || null,
            apiContext: studioContext.apiContext,
            pageFiles,
            symbols,
            source: studioContext.source
        };
    }

    toPromptPrefix(context) {
        const widgets = context.symbols.widgets.slice(0, 20).join(', ') || 'none';
        const variables = context.symbols.variables.slice(0, 20).join(', ') || 'none';
        const bindings = context.symbols.bindings.slice(0, 12).join(', ') || 'none';
        const pages = (context.apiContext?.pages || []).slice(0, 10).join(', ') || 'none';
        const services = (context.apiContext?.services || []).slice(0, 10).join(', ') || 'none';
        const prefabs = (context.apiContext?.prefabs || []).slice(0, 10).join(', ') || 'none';
        const pageVariables = (context.apiContext?.pageVariables || []).slice(0, 12).join(', ') || 'none';

        return [
            '[WaveMaker Studio context]',
            `Project ID: ${context.projectId || 'unknown'}`,
            `Page: ${context.pageName || 'unknown'}`,
            `Active file: ${context.activeFile || 'unknown'}`,
            `File type: ${context.activeFileType || context.language || 'unknown'}`,
            `Context source: ${context.source || 'unknown'}`,
            `Widgets: ${widgets}`,
            `Variables: ${variables}`,
            `Bindings: ${bindings}`,
            `Project pages: ${pages}`,
            `Project services: ${services}`,
            `Project prefabs: ${prefabs}`,
            `Page variables: ${pageVariables}`,
            '[/WaveMaker Studio context]'
        ].join('\n');
    }

    buildPromptArtifacts(context) {
        return [
            this.createArtifactSection('Page markup', context.pageFiles?.markup, 1800, 'markup'),
            this.createArtifactSection('Page script', context.pageFiles?.script, 2200, 'script'),
            this.createArtifactSection('Page styles', context.pageFiles?.styles, 1200, 'styles'),
            this.createArtifactSection(
                'Page variables definition',
                this.stringifyVariables(context.pageFiles?.variables),
                1800,
                'variables'
            )
        ]
            .filter(Boolean)
            .join('\n');
    }

    createArtifactSection(title, content, limit, artifactType = 'text') {
        if (!content || !content.trim()) {
            return '';
        }

        const normalizedContent = this.normalizeArtifactContent(content, artifactType);
        const limitedContent =
            normalizedContent.length > limit
                ? `${normalizedContent.slice(0, limit)}\n...truncated...`
                : normalizedContent;

        return [`[${title}]`, limitedContent, `[/${title}]`].join('\n');
    }

    normalizeArtifactContent(content, artifactType) {
        const normalizedText = String(content).replace(/\r\n/g, '\n').trim();

        if (!normalizedText) {
            return '';
        }

        if (artifactType === 'variables') {
            return normalizedText;
        }

        return normalizedText
            .replace(/\n{3,}/g, '\n\n')
            .replace(/[ \t]+\n/g, '\n');
    }

    stringifyVariables(variables) {
        if (!variables || typeof variables !== 'object' || Object.keys(variables).length === 0) {
            return '';
        }

        try {
            return JSON.stringify(variables, null, 2);
        } catch (error) {
            return '';
        }
    }

    async getStudioContext() {
        const projectId = this.getProjectId();
        const pageName = this.getPageName();
        return this.loadApiBackedContext(projectId, pageName);
    }

    getProjectId() {
        const url = new URL(window.location.href);
        return url.searchParams.get('project-id') || '';
    }

    getPageName() {
        const pathMatch = window.location.pathname.match(/\/page\/([^/]+)/i);
        if (pathMatch?.[1]) {
            return decodeURIComponent(pathMatch[1]);
        }

        const candidates = [
            document.querySelector('wm-page[name]')?.getAttribute('name'),
            document.querySelector('[wm-type="page"][name]')?.getAttribute('name'),
            document.querySelector('[data-page-name]')?.getAttribute('data-page-name'),
            document.querySelector('[aria-selected="true"][title]')?.getAttribute('title'),
            document.querySelector('.active[title]')?.getAttribute('title')
        ].filter(Boolean);

        if (candidates.length > 0) {
            return candidates[0];
        }

        const url = new URL(window.location.href);
        return url.searchParams.get('page') || this.cleanDocumentTitle(document.title);
    }

    cleanDocumentTitle(title) {
        return (title || '')
            .replace(/\s*-\s*WaveMaker.*$/i, '')
            .replace(/\s*-\s*Studio.*$/i, '')
            .trim();
    }

    async loadApiBackedContext(projectId, pageName) {
        if (!projectId || !pageName) {
            return {
                projectId,
                pageName,
                apiContext: this.createEmptyApiContext(),
                pageFiles: this.createEmptyPageFiles(),
                symbols: this.extractSymbols(),
                source: 'dom'
            };
        }

        try {
            const [pageBundle, projectMetadata] = await Promise.all([
                this.getCachedPageBundle(projectId, pageName),
                this.getCachedProjectMetadata(projectId)
            ]);

            return {
                projectId,
                pageName,
                apiContext: {
                    pages: projectMetadata.pages,
                    prefabs: projectMetadata.prefabs,
                    projectVariables: projectMetadata.projectVariables,
                    pageVariables: this.extractNamedEntries(pageBundle.variables),
                    services: projectMetadata.services
                },
                pageFiles: {
                    markup: pageBundle.markup,
                    script: pageBundle.script,
                    styles: pageBundle.styles,
                    variables: pageBundle.variables
                },
                symbols: this.extractSymbolsFromApiBundle(pageBundle),
                source: 'studio-api'
            };
        } catch (error) {
            console.warn('Falling back to DOM-based page context:', error);
            return {
                projectId,
                pageName,
                apiContext: this.createEmptyApiContext(),
                pageFiles: this.createEmptyPageFiles(),
                symbols: this.extractSymbols(),
                source: 'dom-fallback'
            };
        }
    }

    async getCachedProjectMetadata(projectId) {
        if (this.projectMetadataCache.has(projectId)) {
            return this.projectMetadataCache.get(projectId);
        }

        if (!this.projectMetadataRequests.has(projectId)) {
            this.projectMetadataRequests.set(
                projectId,
                Promise.all([
                    this.studioApiService.getProjectVariables(projectId),
                    this.studioApiService.getProjectPages(projectId),
                    this.studioApiService.getProjectServices(projectId),
                    this.studioApiService.getProjectPrefabs(projectId)
                ])
                    .then(([projectVariables, projectPages, projectServices, projectPrefabs]) => {
                        const metadata = {
                            pages: this.extractNamedEntries(projectPages),
                            prefabs: this.extractNamedEntries(projectPrefabs),
                            projectVariables: this.extractNamedEntries(projectVariables),
                            services: this.extractNamedEntries(projectServices)
                        };

                        this.projectMetadataCache.set(projectId, metadata);
                        return metadata;
                    })
                    .finally(() => {
                        this.projectMetadataRequests.delete(projectId);
                    })
            );
        }

        return this.projectMetadataRequests.get(projectId);
    }

    async getCachedPageBundle(projectId, pageName) {
        const cacheKey = `${projectId}:${pageName}`;
        if (this.pageBundleCache.has(cacheKey)) {
            return this.pageBundleCache.get(cacheKey);
        }

        if (!this.pageBundleRequests.has(cacheKey)) {
            this.pageBundleRequests.set(
                cacheKey,
                this.studioApiService.getPageBundle(projectId, pageName)
                    .then((pageBundle) => {
                        this.pageBundleCache.set(cacheKey, pageBundle);
                        return pageBundle;
                    })
                    .finally(() => {
                        this.pageBundleRequests.delete(cacheKey);
                    })
            );
        }

        return this.pageBundleRequests.get(cacheKey);
    }

    createEmptyApiContext() {
        return {
            pages: [],
            prefabs: [],
            projectVariables: [],
            pageVariables: [],
            services: []
        };
    }

    createEmptyPageFiles() {
        return {
            markup: '',
            script: '',
            styles: '',
            variables: {}
        };
    }

    mergeEditorStateIntoPageFiles(pageFiles, editorSnapshot, activeFileType) {
        const mergedPageFiles = {
            markup: pageFiles?.markup || '',
            script: pageFiles?.script || '',
            styles: pageFiles?.styles || '',
            variables: pageFiles?.variables || {}
        };

        if (editorSnapshot.currentFileContent) {
            this.applyContentByFileType(mergedPageFiles, activeFileType, editorSnapshot.currentFileContent);
        }

        (editorSnapshot.relatedFiles || []).forEach((file) => {
            if (!file?.content) {
                return;
            }

            const fileType = this.normalizeFileType(file.language, file.fileName || '');
            this.applyContentByFileType(mergedPageFiles, fileType, file.content);
        });

        return mergedPageFiles;
    }

    applyContentByFileType(target, fileType, content) {
        if (!content || !content.trim()) {
            return;
        }

        if (fileType === 'markup') {
            target.markup = content;
            return;
        }

        if (fileType === 'style') {
            target.styles = content;
            return;
        }

        target.script = content;
    }

    extractSymbolsFromApiBundle(pageBundle) {
        const markupSymbols = this.extractSymbolsFromMarkup(pageBundle.markup);
        const scriptSymbols = this.extractSymbolsFromScript(pageBundle.script);
        const pageVariableNames = this.extractNamedEntries(pageBundle.variables);

        return {
            widgets: [...new Set([...markupSymbols.widgets, ...scriptSymbols.widgets])].sort(),
            variables: [
                ...new Set([
                    ...markupSymbols.variables,
                    ...scriptSymbols.variables,
                    ...pageVariableNames
                ])
            ].sort(),
            bindings: [...new Set([...markupSymbols.bindings, ...scriptSymbols.bindings])].sort()
        };
    }

    extractSymbolsFromMarkup(markup) {
        if (!markup) {
            return this.createEmptySymbols();
        }

        try {
            const parsedPage = this.parser.parseMarkup(markup);
            return this.flattenParsedPage(parsedPage);
        } catch (error) {
            console.warn('Failed to parse page markup from Studio API:', error);
            return this.extractSymbolsFromText(markup);
        }
    }

    extractSymbolsFromScript(script) {
        if (!script) {
            return this.createEmptySymbols();
        }

        const widgetMatches = script.match(/Page\.Widgets\.([A-Za-z0-9_$]+)/g) || [];
        const variableMatches = script.match(/Page\.Variables\.([A-Za-z0-9_$]+)/g) || [];
        const handlerMatches = script.match(/Page\.([A-Za-z0-9_$]+)\s*=\s*function/g) || [];

        return {
            widgets: widgetMatches.map((value) => value.replace(/^Page\.Widgets\./, '')),
            variables: variableMatches.map((value) => value.replace(/^Page\.Variables\./, '')),
            bindings: handlerMatches.map((value) => value.replace(/^Page\./, '').replace(/\s*=\s*function$/, ''))
        };
    }

    extractSymbolsFromText(content) {
        const variableMatches = content.match(/Variables\.[A-Za-z0-9_$]+(?:\.dataSet)?/g) || [];
        const widgetMatches = content.match(/Widgets\.[A-Za-z0-9_$]+/g) || [];
        const bindingMatches = content.match(/bind:[^"'\s}]+/g) || [];

        return {
            widgets: [...new Set(widgetMatches.map((value) => value.replace(/^Widgets\./, '')))].sort(),
            variables: [...new Set(variableMatches.map((value) => value.replace(/^Variables\./, '')))].sort(),
            bindings: [...new Set(bindingMatches.map((value) => value.replace(/^bind:/, '')))].sort()
        };
    }

    createEmptySymbols() {
        return {
            widgets: [],
            variables: [],
            bindings: []
        };
    }

    extractNamedEntries(data) {
        if (!data) {
            return [];
        }

        if (Array.isArray(data)) {
            return [
                ...new Set(
                    data
                        .map((entry) => {
                            if (typeof entry === 'string') {
                                return entry;
                            }

                            if (!entry || typeof entry !== 'object') {
                                return '';
                            }

                            return (
                                entry.name ||
                                entry.variableName ||
                                entry.serviceName ||
                                entry.prefabName ||
                                entry.pageName ||
                                entry.id ||
                                entry.label ||
                                ''
                            );
                        })
                        .filter(Boolean)
                )
            ].sort();
        }

        if (typeof data === 'object') {
            return Object.keys(data).sort();
        }

        return [];
    }

    extractSymbols() {
        const pageElement = document.querySelector('wm-page');
        if (pageElement) {
            const parsedPage = this.parser.parseElement(pageElement);
            return this.flattenParsedPage(parsedPage);
        }

        return this.extractSymbolsFromDocument();
    }

    flattenParsedPage(parsedNode) {
        const widgets = new Set();
        const variables = new Set();
        const bindings = new Set();

        const visit = (node) => {
            if (!node) {
                return;
            }

            if (node.name) {
                widgets.add(node.name);
            }

            (node.bindings?.variables || []).forEach((value) => variables.add(value));
            (node.bindings?.widgets || []).forEach((value) => widgets.add(value));
            (node.bindings?.direct || []).forEach((value) => bindings.add(value));
            (node.relationships?.eventHandlers || []).forEach((eventHandler) => {
                if (eventHandler.handler) {
                    bindings.add(eventHandler.handler);
                }
            });

            (node.children || []).forEach(visit);
        };

        visit(parsedNode);

        return {
            widgets: [...widgets].sort(),
            variables: [...variables].sort(),
            bindings: [...bindings].sort()
        };
    }

    extractSymbolsFromDocument() {
        const html = document.body?.innerHTML || '';
        const variableMatches = html.match(/Variables\.[A-Za-z0-9_$]+(?:\.dataSet)?/g) || [];
        const widgetMatches = html.match(/Widgets\.[A-Za-z0-9_$]+/g) || [];
        const bindingMatches = html.match(/bind:[^"'\s}]+/g) || [];

        const namedElements = [
            ...document.querySelectorAll('[name]'),
            ...document.querySelectorAll('[widget-id]')
        ];

        namedElements.forEach((element) => {
            const name = element.getAttribute('name') || element.getAttribute('widget-id');
            if (name) {
                widgetMatches.push(name);
            }
        });

        return {
            widgets: [...new Set(widgetMatches)].sort(),
            variables: [...new Set(variableMatches)].sort(),
            bindings: [...new Set(bindingMatches.map((value) => value.replace(/^bind:/, '')))].sort()
        };
    }

    inferActiveFile(editorSnapshot, pageName) {
        if (editorSnapshot.fileName) {
            return editorSnapshot.fileName;
        }

        if (editorSnapshot.filePath) {
            const parts = editorSnapshot.filePath.split('/');
            return parts[parts.length - 1];
        }

        const extensionMap = {
            css: 'css',
            html: 'html',
            javascript: 'js',
            typescript: 'ts'
        };
        const extension = extensionMap[editorSnapshot.language] || 'txt';
        return pageName ? `${pageName}.${extension}` : `unknown.${extension}`;
    }

    normalizeFileType(language, activeFile) {
        const extension = (activeFile.split('.').pop() || '').toLowerCase();
        const fileTypeMap = {
            css: 'style',
            html: 'markup',
            js: 'script',
            jsx: 'script',
            ts: 'script',
            tsx: 'script'
        };

        if (fileTypeMap[extension]) {
            return fileTypeMap[extension];
        }

        if (language === 'css') {
            return 'style';
        }
        if (language === 'html') {
            return 'markup';
        }

        return 'script';
    }
}

export default PageContextManager;
