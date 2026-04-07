import WMParser from '../parser/wmParser.js';

class PageContextManager {
    constructor() {
        this.parser = new WMParser();
        this.cachedStudioContext = null;
        this.cacheKey = null;
        this.cacheTimestamp = 0;
        this.cacheTtlMs = 2000;
    }

    getCompletionContext(editorSnapshot = {}) {
        const studioContext = this.getStudioContext();
        const activeFile = this.inferActiveFile(editorSnapshot, studioContext.pageName);

        return {
            projectId: studioContext.projectId,
            pageName: studioContext.pageName,
            activeFile,
            activeFileType: this.normalizeFileType(editorSnapshot.language, activeFile),
            language: editorSnapshot.language || 'plaintext',
            cursor: editorSnapshot.position || null,
            symbols: studioContext.symbols,
            source: studioContext.source
        };
    }

    toPromptPrefix(context) {
        const widgets = context.symbols.widgets.slice(0, 20).join(', ') || 'none';
        const variables = context.symbols.variables.slice(0, 20).join(', ') || 'none';
        const bindings = context.symbols.bindings.slice(0, 12).join(', ') || 'none';

        return [
            '[WaveMaker Studio context]',
            `Project ID: ${context.projectId || 'unknown'}`,
            `Page: ${context.pageName || 'unknown'}`,
            `Active file: ${context.activeFile || 'unknown'}`,
            `File type: ${context.activeFileType || context.language || 'unknown'}`,
            `Widgets: ${widgets}`,
            `Variables: ${variables}`,
            `Bindings: ${bindings}`,
            '[/WaveMaker Studio context]'
        ].join('\n');
    }

    getStudioContext() {
        const currentCacheKey = this.buildCacheKey();
        const now = Date.now();

        if (
            this.cachedStudioContext &&
            currentCacheKey === this.cacheKey &&
            now - this.cacheTimestamp < this.cacheTtlMs
        ) {
            return this.cachedStudioContext;
        }

        const studioContext = {
            projectId: this.getProjectId(),
            pageName: this.getPageName(),
            symbols: this.extractSymbols(),
            source: 'dom'
        };

        this.cachedStudioContext = studioContext;
        this.cacheKey = currentCacheKey;
        this.cacheTimestamp = now;

        return studioContext;
    }

    buildCacheKey() {
        return `${window.location.href}:${document.title}`;
    }

    getProjectId() {
        const url = new URL(window.location.href);
        return url.searchParams.get('project-id') || '';
    }

    getPageName() {
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
