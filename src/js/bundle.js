(() => {
  // src/js/parser/wmParser.js
  var WMParser = class {
    constructor() {
      this.bindingPatterns = {
        variable: /Variables\.[^.\s}]+(\.dataSet)?/g,
        widget: /Widgets\.[^.\s}]+/g,
        binding: /bind:([^"'\s}]+)/g
      };
      this.widgetCategories = {
        form: ["form-field", "liveform", "form-action"],
        layout: ["layoutgrid", "gridrow", "gridcolumn"],
        input: ["text", "select", "radioset", "checkboxset", "date", "number"],
        container: ["page", "content", "container", "composite"],
        navigation: ["wizard", "wizardstep"],
        data: ["list", "table", "card", "search"],
        display: ["label", "message"]
      };
    }
    /**
     * Parse WaveMaker markup and extract structure
     * @param {string} markup - HTML string containing WaveMaker markup
     * @returns {Object} Parsed structure with widgets, bindings, and relationships
     */
    parseMarkup(markup) {
      const parser2 = new DOMParser();
      const doc = parser2.parseFromString(markup, "text/html");
      return this.parseElement(doc.body.firstElementChild);
    }
    /**
     * Parse individual WM element
     * @param {Element} element - DOM element to parse
     * @returns {Object} Parsed element structure
     */
    parseElement(element) {
      if (!element)
        return null;
      const structure = {
        type: element.tagName.toLowerCase(),
        name: element.getAttribute("name") || "",
        category: this.getWidgetCategory(element),
        attributes: this.parseAttributes(element),
        bindings: this.extractBindings(element),
        children: [],
        relationships: this.findRelationships(element)
      };
      for (const child of element.children) {
        const parsedChild = this.parseElement(child);
        if (parsedChild) {
          structure.children.push(parsedChild);
        }
      }
      return structure;
    }
    /**
     * Parse element attributes
     * @param {Element} element - DOM element
     * @returns {Object} Parsed attributes with bindings
     */
    parseAttributes(element) {
      const attrs = {};
      for (const attr of element.attributes) {
        attrs[attr.name] = {
          value: attr.value,
          hasBinding: attr.value.includes("bind:"),
          bindings: this.extractBindingsFromValue(attr.value)
        };
      }
      return attrs;
    }
    /**
     * Extract all bindings from an element
     * @param {Element} element - DOM element
     * @returns {Object} Extracted bindings categorized by type
     */
    extractBindings(element) {
      const html2 = element.outerHTML;
      return {
        variables: [...new Set(html2.match(this.bindingPatterns.variable) || [])],
        widgets: [...new Set(html2.match(this.bindingPatterns.widget) || [])],
        direct: [...new Set(html2.match(this.bindingPatterns.binding) || [])].map((b) => b.replace("bind:", ""))
      };
    }
    /**
     * Extract bindings from a single value
     * @param {string} value - Attribute value
     * @returns {Array} Extracted bindings
     */
    extractBindingsFromValue(value) {
      const bindings = [];
      if (value.includes("bind:")) {
        const bindingValue = value.replace("bind:", "");
        bindings.push({
          type: "direct",
          value: bindingValue,
          dependencies: this.extractDependencies(bindingValue)
        });
      }
      return bindings;
    }
    /**
     * Extract dependencies from a binding expression
     * @param {string} expression - Binding expression
     * @returns {Object} Extracted dependencies
     */
    extractDependencies(expression) {
      return {
        variables: [...new Set(expression.match(this.bindingPatterns.variable) || [])],
        widgets: [...new Set(expression.match(this.bindingPatterns.widget) || [])]
      };
    }
    /**
     * Get widget category based on element type
     * @param {Element} element - DOM element
     * @returns {string} Widget category
     */
    getWidgetCategory(element) {
      const tag2 = element.tagName.toLowerCase();
      if (!tag2.startsWith("wm-"))
        return "other";
      const widgetType = tag2.substring(3);
      for (const [category, types] of Object.entries(this.widgetCategories)) {
        if (types.some((t) => widgetType.includes(t))) {
          return category;
        }
      }
      return "other";
    }
    /**
     * Find relationships with other widgets
     * @param {Element} element - DOM element
     * @returns {Object} Related widgets and their relationships
     */
    findRelationships(element) {
      const relationships = {
        parent: null,
        siblings: [],
        dataSource: null,
        eventHandlers: []
      };
      if (element.parentElement && element.parentElement.hasAttribute("name")) {
        relationships.parent = {
          name: element.parentElement.getAttribute("name"),
          type: element.parentElement.tagName.toLowerCase()
        };
      }
      const dataset = element.getAttribute("dataset");
      if (dataset) {
        relationships.dataSource = this.extractBindingsFromValue(dataset);
      }
      for (const attr of element.attributes) {
        if (attr.name.startsWith("on-")) {
          relationships.eventHandlers.push({
            event: attr.name.replace("on-", ""),
            handler: attr.value
          });
        }
      }
      return relationships;
    }
  };
  var wmParser_default = WMParser;

  // src/js/constants/messages.js
  var RUNTIME_MESSAGES = {
    API_KEYS_UPDATED: "SURFBOARD_API_KEYS_UPDATED",
    CONTENT_SCRIPT_READY: "SURFBOARD_CONTENT_SCRIPT_READY",
    COPILOT_STATUS_CHANGED: "SURFBOARD_COPILOT_STATUS_CHANGED",
    GET_AUTH_COOKIE: "SURFBOARD_GET_AUTH_COOKIE",
    LITELLM_CHAT_COMPLETIONS: "SURFBOARD_LITELLM_CHAT_COMPLETIONS",
    TOGGLE_COPILOT: "SURFBOARD_TOGGLE_COPILOT"
  };
  var PAGE_MESSAGES = {
    EDITOR_CONTENT_REQUEST: "SURFBOARD_EDITOR_CONTENT_REQUEST",
    EDITOR_CONTENT_RESPONSE: "SURFBOARD_EDITOR_CONTENT_RESPONSE",
    INLINE_COMPLETIONS_REQUEST: "SURFBOARD_INLINE_COMPLETIONS_REQUEST",
    INLINE_COMPLETIONS_RESPONSE: "SURFBOARD_INLINE_COMPLETIONS_RESPONSE",
    MONACO_HELPER_READY: "SURFBOARD_MONACO_HELPER_READY",
    NAVIGATE_TO_FILE: "SURFBOARD_NAVIGATE_TO_FILE"
  };

  // src/js/services/studioApiService.js
  var StudioApiService = class {
    constructor() {
      this.authCookie = null;
      this.initializationPromise = null;
      this.projectBaseUrl = `${window.location.origin}/studio/services/projects`;
      this.prefabsUrl = `${window.location.origin}/studio/services/prefabs`;
    }
    async initialize() {
      if (this.authCookie) {
        return;
      }
      if (!this.initializationPromise) {
        this.initializationPromise = chrome.runtime.sendMessage({ type: RUNTIME_MESSAGES.GET_AUTH_COOKIE }).then((response) => {
          if (!(response == null ? void 0 : response.cookie)) {
            throw new Error("Authentication cookie not found");
          }
          this.authCookie = response.cookie;
        }).finally(() => {
          this.initializationPromise = null;
        });
      }
      await this.initializationPromise;
    }
    async fetchJson(url) {
      await this.initialize();
      const response = await fetch(url, {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Cookie: `auth_cookie=${this.authCookie}`
        }
      });
      if (!response.ok) {
        if (response.status === 401) {
          this.authCookie = null;
          await this.initialize();
          return this.fetchJson(url);
        }
        throw new Error(`Studio API request failed: ${response.status} ${response.statusText}`);
      }
      return response.json();
    }
    async getProjectServices(projectId) {
      return this.fetchJson(`${this.projectBaseUrl}/${projectId}/services`);
    }
    async getProjectVariables(projectId) {
      return this.fetchJson(`${this.projectBaseUrl}/${projectId}/variables`);
    }
    async getProjectPages(projectId) {
      return this.fetchJson(`${this.projectBaseUrl}/${projectId}/pages`);
    }
    async getProjectPrefabs(projectId) {
      return this.fetchJson(`${this.prefabsUrl}?projectID=${encodeURIComponent(projectId)}`);
    }
    async getPageBundle(projectId, pageName) {
      const response = await this.fetchJson(
        `${this.projectBaseUrl}/${projectId}/pages/${encodeURIComponent(pageName)}/page.min.json`
      );
      return {
        raw: response,
        markup: this.decodeValue(response == null ? void 0 : response.markup),
        script: this.decodeValue(response == null ? void 0 : response.script),
        styles: this.decodeValue(response == null ? void 0 : response.styles),
        variables: this.parseJsonValue(this.decodeValue(response == null ? void 0 : response.variables, "{}"), {})
      };
    }
    decodeValue(value, fallback = "") {
      if (typeof value !== "string") {
        return fallback;
      }
      try {
        return decodeURIComponent(value.replace(/\+/g, "%20"));
      } catch (error) {
        return value;
      }
    }
    parseJsonValue(value, fallback) {
      if (typeof value !== "string" || !value.trim()) {
        return fallback;
      }
      try {
        return JSON.parse(value);
      } catch (error) {
        return fallback;
      }
    }
  };
  var studioApiService_default = StudioApiService;

  // src/js/context/pageContext.js
  var PageContextManager = class {
    constructor() {
      this.parser = new wmParser_default();
      this.studioApiService = new studioApiService_default();
      this.projectMetadataCache = /* @__PURE__ */ new Map();
      this.projectMetadataRequests = /* @__PURE__ */ new Map();
      this.pageBundleCache = /* @__PURE__ */ new Map();
      this.pageBundleRequests = /* @__PURE__ */ new Map();
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
        language: editorSnapshot.language || "plaintext",
        cursor: editorSnapshot.position || null,
        apiContext: studioContext.apiContext,
        pageFiles,
        symbols,
        source: studioContext.source
      };
    }
    toPromptPrefix(context) {
      var _a, _b, _c, _d;
      const widgets = context.symbols.widgets.slice(0, 20).join(", ") || "none";
      const variables = context.symbols.variables.slice(0, 20).join(", ") || "none";
      const bindings = context.symbols.bindings.slice(0, 12).join(", ") || "none";
      const pages = (((_a = context.apiContext) == null ? void 0 : _a.pages) || []).slice(0, 10).join(", ") || "none";
      const services = (((_b = context.apiContext) == null ? void 0 : _b.services) || []).slice(0, 10).join(", ") || "none";
      const prefabs = (((_c = context.apiContext) == null ? void 0 : _c.prefabs) || []).slice(0, 10).join(", ") || "none";
      const pageVariables = (((_d = context.apiContext) == null ? void 0 : _d.pageVariables) || []).slice(0, 12).join(", ") || "none";
      return [
        "[WaveMaker Studio context]",
        `Project ID: ${context.projectId || "unknown"}`,
        `Page: ${context.pageName || "unknown"}`,
        `Active file: ${context.activeFile || "unknown"}`,
        `File type: ${context.activeFileType || context.language || "unknown"}`,
        `Context source: ${context.source || "unknown"}`,
        `Widgets: ${widgets}`,
        `Variables: ${variables}`,
        `Bindings: ${bindings}`,
        `Project pages: ${pages}`,
        `Project services: ${services}`,
        `Project prefabs: ${prefabs}`,
        `Page variables: ${pageVariables}`,
        "[/WaveMaker Studio context]"
      ].join("\n");
    }
    buildPromptArtifacts(context) {
      var _a, _b, _c, _d;
      return [
        this.createArtifactSection("Page markup", (_a = context.pageFiles) == null ? void 0 : _a.markup, 1800, "markup"),
        this.createArtifactSection("Page script", (_b = context.pageFiles) == null ? void 0 : _b.script, 2200, "script"),
        this.createArtifactSection("Page styles", (_c = context.pageFiles) == null ? void 0 : _c.styles, 1200, "styles"),
        this.createArtifactSection(
          "Page variables definition",
          this.stringifyVariables((_d = context.pageFiles) == null ? void 0 : _d.variables),
          1800,
          "variables"
        )
      ].filter(Boolean).join("\n");
    }
    createArtifactSection(title, content, limit, artifactType = "text") {
      if (!content || !content.trim()) {
        return "";
      }
      const normalizedContent = this.normalizeArtifactContent(content, artifactType);
      const limitedContent = normalizedContent.length > limit ? `${normalizedContent.slice(0, limit)}
...truncated...` : normalizedContent;
      return [`[${title}]`, limitedContent, `[/${title}]`].join("\n");
    }
    normalizeArtifactContent(content, artifactType) {
      const normalizedText = String(content).replace(/\r\n/g, "\n").trim();
      if (!normalizedText) {
        return "";
      }
      if (artifactType === "variables") {
        return normalizedText;
      }
      return normalizedText.replace(/\n{3,}/g, "\n\n").replace(/[ \t]+\n/g, "\n");
    }
    stringifyVariables(variables) {
      if (!variables || typeof variables !== "object" || Object.keys(variables).length === 0) {
        return "";
      }
      try {
        return JSON.stringify(variables, null, 2);
      } catch (error) {
        return "";
      }
    }
    async getStudioContext() {
      const projectId = this.getProjectId();
      const pageName = this.getPageName();
      return this.loadApiBackedContext(projectId, pageName);
    }
    getProjectId() {
      const url = new URL(window.location.href);
      return url.searchParams.get("project-id") || "";
    }
    getPageName() {
      var _a, _b, _c, _d, _e;
      const pathMatch = window.location.pathname.match(/\/page\/([^/]+)/i);
      if (pathMatch == null ? void 0 : pathMatch[1]) {
        return decodeURIComponent(pathMatch[1]);
      }
      const candidates = [
        (_a = document.querySelector("wm-page[name]")) == null ? void 0 : _a.getAttribute("name"),
        (_b = document.querySelector('[wm-type="page"][name]')) == null ? void 0 : _b.getAttribute("name"),
        (_c = document.querySelector("[data-page-name]")) == null ? void 0 : _c.getAttribute("data-page-name"),
        (_d = document.querySelector('[aria-selected="true"][title]')) == null ? void 0 : _d.getAttribute("title"),
        (_e = document.querySelector(".active[title]")) == null ? void 0 : _e.getAttribute("title")
      ].filter(Boolean);
      if (candidates.length > 0) {
        return candidates[0];
      }
      const url = new URL(window.location.href);
      return url.searchParams.get("page") || this.cleanDocumentTitle(document.title);
    }
    cleanDocumentTitle(title) {
      return (title || "").replace(/\s*-\s*WaveMaker.*$/i, "").replace(/\s*-\s*Studio.*$/i, "").trim();
    }
    async loadApiBackedContext(projectId, pageName) {
      if (!projectId || !pageName) {
        return {
          projectId,
          pageName,
          apiContext: this.createEmptyApiContext(),
          pageFiles: this.createEmptyPageFiles(),
          symbols: this.extractSymbols(),
          source: "dom"
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
          source: "studio-api"
        };
      } catch (error) {
        console.warn("Falling back to DOM-based page context:", error);
        return {
          projectId,
          pageName,
          apiContext: this.createEmptyApiContext(),
          pageFiles: this.createEmptyPageFiles(),
          symbols: this.extractSymbols(),
          source: "dom-fallback"
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
          ]).then(([projectVariables, projectPages, projectServices, projectPrefabs]) => {
            const metadata = {
              pages: this.extractNamedEntries(projectPages),
              prefabs: this.extractNamedEntries(projectPrefabs),
              projectVariables: this.extractNamedEntries(projectVariables),
              services: this.extractNamedEntries(projectServices)
            };
            this.projectMetadataCache.set(projectId, metadata);
            return metadata;
          }).finally(() => {
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
          this.studioApiService.getPageBundle(projectId, pageName).then((pageBundle) => {
            this.pageBundleCache.set(cacheKey, pageBundle);
            return pageBundle;
          }).finally(() => {
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
        markup: "",
        script: "",
        styles: "",
        variables: {}
      };
    }
    mergeEditorStateIntoPageFiles(pageFiles, editorSnapshot, activeFileType) {
      const mergedPageFiles = {
        markup: (pageFiles == null ? void 0 : pageFiles.markup) || "",
        script: (pageFiles == null ? void 0 : pageFiles.script) || "",
        styles: (pageFiles == null ? void 0 : pageFiles.styles) || "",
        variables: (pageFiles == null ? void 0 : pageFiles.variables) || {}
      };
      if (editorSnapshot.currentFileContent) {
        this.applyContentByFileType(mergedPageFiles, activeFileType, editorSnapshot.currentFileContent);
      }
      (editorSnapshot.relatedFiles || []).forEach((file) => {
        if (!(file == null ? void 0 : file.content)) {
          return;
        }
        const fileType = this.normalizeFileType(file.language, file.fileName || "");
        this.applyContentByFileType(mergedPageFiles, fileType, file.content);
      });
      return mergedPageFiles;
    }
    applyContentByFileType(target, fileType, content) {
      if (!content || !content.trim()) {
        return;
      }
      if (fileType === "markup") {
        target.markup = content;
        return;
      }
      if (fileType === "style") {
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
        widgets: [.../* @__PURE__ */ new Set([...markupSymbols.widgets, ...scriptSymbols.widgets])].sort(),
        variables: [
          .../* @__PURE__ */ new Set([
            ...markupSymbols.variables,
            ...scriptSymbols.variables,
            ...pageVariableNames
          ])
        ].sort(),
        bindings: [.../* @__PURE__ */ new Set([...markupSymbols.bindings, ...scriptSymbols.bindings])].sort()
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
        console.warn("Failed to parse page markup from Studio API:", error);
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
        widgets: widgetMatches.map((value) => value.replace(/^Page\.Widgets\./, "")),
        variables: variableMatches.map((value) => value.replace(/^Page\.Variables\./, "")),
        bindings: handlerMatches.map((value) => value.replace(/^Page\./, "").replace(/\s*=\s*function$/, ""))
      };
    }
    extractSymbolsFromText(content) {
      const variableMatches = content.match(/Variables\.[A-Za-z0-9_$]+(?:\.dataSet)?/g) || [];
      const widgetMatches = content.match(/Widgets\.[A-Za-z0-9_$]+/g) || [];
      const bindingMatches = content.match(/bind:[^"'\s}]+/g) || [];
      return {
        widgets: [...new Set(widgetMatches.map((value) => value.replace(/^Widgets\./, "")))].sort(),
        variables: [...new Set(variableMatches.map((value) => value.replace(/^Variables\./, "")))].sort(),
        bindings: [...new Set(bindingMatches.map((value) => value.replace(/^bind:/, "")))].sort()
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
            data.map((entry) => {
              if (typeof entry === "string") {
                return entry;
              }
              if (!entry || typeof entry !== "object") {
                return "";
              }
              return entry.name || entry.variableName || entry.serviceName || entry.prefabName || entry.pageName || entry.id || entry.label || "";
            }).filter(Boolean)
          )
        ].sort();
      }
      if (typeof data === "object") {
        return Object.keys(data).sort();
      }
      return [];
    }
    extractSymbols() {
      const pageElement = document.querySelector("wm-page");
      if (pageElement) {
        const parsedPage = this.parser.parseElement(pageElement);
        return this.flattenParsedPage(parsedPage);
      }
      return this.extractSymbolsFromDocument();
    }
    flattenParsedPage(parsedNode) {
      const widgets = /* @__PURE__ */ new Set();
      const variables = /* @__PURE__ */ new Set();
      const bindings = /* @__PURE__ */ new Set();
      const visit = (node) => {
        var _a, _b, _c, _d;
        if (!node) {
          return;
        }
        if (node.name) {
          widgets.add(node.name);
        }
        (((_a = node.bindings) == null ? void 0 : _a.variables) || []).forEach((value) => variables.add(value));
        (((_b = node.bindings) == null ? void 0 : _b.widgets) || []).forEach((value) => widgets.add(value));
        (((_c = node.bindings) == null ? void 0 : _c.direct) || []).forEach((value) => bindings.add(value));
        (((_d = node.relationships) == null ? void 0 : _d.eventHandlers) || []).forEach((eventHandler) => {
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
      var _a;
      const html2 = ((_a = document.body) == null ? void 0 : _a.innerHTML) || "";
      const variableMatches = html2.match(/Variables\.[A-Za-z0-9_$]+(?:\.dataSet)?/g) || [];
      const widgetMatches = html2.match(/Widgets\.[A-Za-z0-9_$]+/g) || [];
      const bindingMatches = html2.match(/bind:[^"'\s}]+/g) || [];
      const namedElements = [
        ...document.querySelectorAll("[name]"),
        ...document.querySelectorAll("[widget-id]")
      ];
      namedElements.forEach((element) => {
        const name = element.getAttribute("name") || element.getAttribute("widget-id");
        if (name) {
          widgetMatches.push(name);
        }
      });
      return {
        widgets: [...new Set(widgetMatches)].sort(),
        variables: [...new Set(variableMatches)].sort(),
        bindings: [...new Set(bindingMatches.map((value) => value.replace(/^bind:/, "")))].sort()
      };
    }
    inferActiveFile(editorSnapshot, pageName) {
      if (editorSnapshot.fileName) {
        return editorSnapshot.fileName;
      }
      if (editorSnapshot.filePath) {
        const parts = editorSnapshot.filePath.split("/");
        return parts[parts.length - 1];
      }
      const extensionMap = {
        css: "css",
        html: "html",
        javascript: "js",
        typescript: "ts"
      };
      const extension = extensionMap[editorSnapshot.language] || "txt";
      return pageName ? `${pageName}.${extension}` : `unknown.${extension}`;
    }
    normalizeFileType(language, activeFile) {
      const extension = (activeFile.split(".").pop() || "").toLowerCase();
      const fileTypeMap = {
        css: "style",
        html: "markup",
        js: "script",
        jsx: "script",
        ts: "script",
        tsx: "script"
      };
      if (fileTypeMap[extension]) {
        return fileTypeMap[extension];
      }
      if (language === "css") {
        return "style";
      }
      if (language === "html") {
        return "markup";
      }
      return "script";
    }
  };
  var pageContext_default = PageContextManager;

  // src/js/constants/litellm.js
  var DEFAULT_LITELLM_BASE_URL = "http://localhost:4000";
  var DEFAULT_LITELLM_CHAT_MODEL = "claude-sonnet";
  var DEFAULT_LITELLM_COMPLETION_MODEL = "gemini/gemini-3.1-flash-lite-preview";
  var DEFAULT_LITELLM_LOG_MODEL = "claude-sonnet";
  function normalizeLiteLLMBaseUrl(baseUrl) {
    const trimmed = (baseUrl || "").trim();
    const normalized = trimmed || DEFAULT_LITELLM_BASE_URL;
    return normalized.replace(/\/+$/, "");
  }
  function validateLiteLLMBaseUrlForRuntime(baseUrl) {
    const normalizedBaseUrl = normalizeLiteLLMBaseUrl(baseUrl);
    new URL(normalizedBaseUrl);
    return normalizedBaseUrl;
  }

  // src/js/services/aiService.js
  var AIService = class {
    constructor() {
      this.apiKey = "";
      this.apiBaseUrl = normalizeLiteLLMBaseUrl();
      this.model = DEFAULT_LITELLM_COMPLETION_MODEL;
      this.requestConfig = {
        max_tokens: 150,
        temperature: 0.2,
        top_p: 0.95,
        presence_penalty: 0.1,
        frequency_penalty: 0.1
      };
    }
    configure({ apiKey, baseUrl, model } = {}) {
      if (typeof apiKey === "string") {
        this.apiKey = apiKey;
      }
      if (typeof baseUrl === "string") {
        this.apiBaseUrl = normalizeLiteLLMBaseUrl(baseUrl);
      }
      if (typeof model === "string" && model.trim()) {
        this.model = model.trim();
      }
    }
    setApiKey(key) {
      this.apiKey = key;
    }
    createPrompt(context, language) {
      const cursorIndex = context.indexOf("\u25BC");
      const beforeCursor = context.substring(0, cursorIndex);
      const afterCursor = context.substring(cursorIndex + 1);
      return [
        {
          role: "system",
          content: `You are a precise code completion model for ${language}. Follow these rules:
1. Complete the code at the cursor position (\u25BC) naturally.
2. Treat the immediate cursor context as the highest-priority signal.
3. Use WaveMaker Studio context, page files, and variable definitions as supporting context.
4. Reuse identifiers exactly as they appear in context. Do not invent widget names, variable names, service names, bindings, or event handlers.
5. Preserve the coding style, naming, and API usage already present in the file.
6. For WaveMaker page script, prefer Page.Widgets.*, Page.Variables.*, Page.Actions.*, and existing page handler names when those appear in context.
7. If the surrounding code instead uses Widgets.*, Variables.*, App.*, or service aliases, preserve that existing convention rather than mixing styles.
8. For markup, preserve existing widget names, bindings, and event handlers.
9. For styles, preserve existing class names, selectors, and theme conventions.
10. Ensure syntactic correctness and return only the completion text, with no explanation.`
        },
        {
          role: "user",
          content: `Complete the following ${language} code at the cursor position (\u25BC). Return ONLY the completion text:

Before cursor:
${beforeCursor}
\u25BC
After cursor:
${afterCursor}`
        }
      ];
    }
    async makeAPIRequest(messages, n = 1, signal = null) {
      if (!this.apiKey) {
        throw new Error("LiteLLM API key not set");
      }
      try {
        const requestBaseUrl = validateLiteLLMBaseUrlForRuntime(this.apiBaseUrl);
        const payload = {
          model: this.model,
          messages,
          ...this.requestConfig,
          n
        };
        const responsePromise = new Promise((resolve, reject) => {
          chrome.runtime.sendMessage(
            {
              type: RUNTIME_MESSAGES.LITELLM_CHAT_COMPLETIONS,
              data: {
                apiKey: this.apiKey,
                baseUrl: requestBaseUrl,
                body: payload
              }
            },
            (response) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
              }
              if (!(response == null ? void 0 : response.success)) {
                reject(new Error((response == null ? void 0 : response.error) || "LiteLLM completion request failed"));
                return;
              }
              resolve(response.data);
            }
          );
        });
        const responseData = signal ? await Promise.race([
          responsePromise,
          new Promise((_, reject) => {
            signal.addEventListener(
              "abort",
              () => reject(new DOMException("Request aborted", "AbortError")),
              { once: true }
            );
          })
        ]) : await responsePromise;
        return responseData.choices;
      } catch (error) {
        if ((error == null ? void 0 : error.name) !== "AbortError") {
          console.error("API request failed:", error);
        }
        throw error;
      }
    }
    async getCompletion(context, language) {
      const messages = this.createPrompt(context, language);
      const choices = await this.makeAPIRequest(messages, 1);
      return choices[0].message.content.trim();
    }
    async getMultipleCompletions(context, language, n = 3, signal = null) {
      const messages = this.createPrompt(context, language);
      const choices = await this.makeAPIRequest(messages, n, signal);
      return choices.map((choice) => choice.message.content.trim());
    }
  };
  var aiService_default = new AIService();

  // src/js/completion/completionManager.js
  var CompletionManager = class {
    constructor({ enabled = true } = {}) {
      this.enabled = enabled;
      this.helperInjected = false;
      this.inlineConfig = {
        debounceTime: 400,
        minRequestInterval: 700
      };
      this.pageContextManager = new pageContext_default();
      this.pendingController = null;
      this.lastRequestTime = 0;
      this.injectMonacoHelper();
      this.setupAPIKey();
      this.setupMessageListener();
    }
    setEnabled(enabled) {
      this.enabled = enabled;
    }
    setupAPIKey() {
      chrome.storage.sync.get(
        ["litellmApiKey", "litellmBaseUrl", "litellmCompletionModel"],
        (result) => {
          aiService_default.configure({
            apiKey: result.litellmApiKey || "",
            baseUrl: normalizeLiteLLMBaseUrl(result.litellmBaseUrl),
            model: result.litellmCompletionModel || DEFAULT_LITELLM_COMPLETION_MODEL
          });
        }
      );
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "sync") {
          return;
        }
        if (changes.litellmApiKey || changes.litellmBaseUrl || changes.litellmCompletionModel) {
          chrome.storage.sync.get(
            ["litellmApiKey", "litellmBaseUrl", "litellmCompletionModel"],
            (result) => {
              aiService_default.configure({
                apiKey: result.litellmApiKey || "",
                baseUrl: normalizeLiteLLMBaseUrl(result.litellmBaseUrl),
                model: result.litellmCompletionModel || DEFAULT_LITELLM_COMPLETION_MODEL
              });
            }
          );
        }
      });
    }
    injectMonacoHelper() {
      if (this.helperInjected) {
        return;
      }
      const script = document.createElement("script");
      script.src = chrome.runtime.getURL("src/js/inject/monacoHelper.js");
      script.dataset.surfboardMonacoHelper = "true";
      script.onload = function() {
        this.remove();
      };
      (document.head || document.documentElement).appendChild(script);
      this.helperInjected = true;
    }
    setupMessageListener() {
      window.addEventListener("message", (event) => {
        var _a;
        if (event.source !== window || !((_a = event.data) == null ? void 0 : _a.type)) {
          return;
        }
        if (event.data.type === PAGE_MESSAGES.INLINE_COMPLETIONS_REQUEST) {
          this.handleCompletionRequest(event.data.data);
        }
      });
    }
    async handleCompletionRequest(data) {
      const requestId = data == null ? void 0 : data.requestId;
      const modelId = data == null ? void 0 : data.modelId;
      if (!requestId || !modelId || !this.enabled) {
        this.sendInlineCompletionsResponse(requestId, modelId, []);
        return;
      }
      const now = Date.now();
      if (now - this.lastRequestTime < this.inlineConfig.minRequestInterval) {
        this.sendInlineCompletionsResponse(requestId, modelId, []);
        return;
      }
      this.lastRequestTime = now;
      try {
        if (this.pendingController) {
          this.pendingController.abort();
        }
        const controller = new AbortController();
        this.pendingController = controller;
        const requestContext = await this.buildRequestContext(data);
        const completions = await aiService_default.getMultipleCompletions(
          requestContext.prompt,
          requestContext.language,
          3,
          controller.signal
        );
        if (this.pendingController === controller) {
          this.pendingController = null;
        }
        this.sendInlineCompletionsResponse(
          requestId,
          modelId,
          completions.map((completion) => ({
            text: completion,
            range: {
              startLineNumber: data.position.lineNumber,
              startColumn: data.insertColumn,
              endLineNumber: data.position.lineNumber,
              endColumn: data.insertColumn
            }
          }))
        );
      } catch (error) {
        if (error.name !== "AbortError") {
          console.error("Error handling completion request:", error);
        }
        this.sendInlineCompletionsResponse(requestId, modelId, []);
      }
    }
    async buildRequestContext(data) {
      const prefix = data.contextText.slice(0, data.cursorOffset);
      const suffix = data.contextText.slice(data.cursorOffset);
      const pageContext = await this.pageContextManager.getCompletionContext({
        currentFileContent: data.currentFileContent,
        fileName: data.fileName,
        filePath: data.filePath,
        language: data.language,
        position: data.position,
        relatedFiles: data.relatedFiles || []
      });
      const promptPrefix = this.pageContextManager.toPromptPrefix(pageContext);
      const promptArtifacts = this.pageContextManager.buildPromptArtifacts(pageContext);
      const relatedFilesContext = this.buildRelatedFilesContext(data.relatedFiles || []);
      return {
        language: data.language || "javascript",
        pageContext,
        prompt: `${promptPrefix}
${promptArtifacts}${relatedFilesContext}

${prefix}\u25BC${suffix}`
      };
    }
    buildRelatedFilesContext(relatedFiles) {
      const sections = relatedFiles.filter((file) => (file == null ? void 0 : file.fileName) && (file == null ? void 0 : file.content)).slice(0, 3).map((file) => {
        const truncatedContent = file.content.length > 1500 ? `${file.content.slice(0, 1500)}
...truncated...` : file.content;
        return [
          "",
          `[Related file: ${file.fileName} | language: ${file.language || "unknown"}]`,
          truncatedContent,
          `[/Related file: ${file.fileName}]`
        ].join("\n");
      });
      return sections.length ? `
${sections.join("\n")}` : "";
    }
    sendInlineCompletionsResponse(requestId, modelId, items) {
      window.postMessage(
        {
          type: PAGE_MESSAGES.INLINE_COMPLETIONS_RESPONSE,
          data: {
            requestId,
            modelId,
            items
          }
        },
        "*"
      );
    }
  };
  var completionManager_default = CompletionManager;

  // src/js/constants/studio.js
  var manifest = chrome.runtime.getManifest();
  function getConfiguredMatchPatterns() {
    var _a;
    const contentScriptMatches = ((_a = manifest.content_scripts) == null ? void 0 : _a.flatMap((entry) => entry.matches || [])) || [];
    return [...new Set(contentScriptMatches)];
  }
  function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function convertMatchPatternToRegex(pattern) {
    const escaped = escapeRegex(pattern).replace(/\\\*/g, ".*");
    return new RegExp(`^${escaped}$`);
  }
  function isConfiguredStudioUrl(url) {
    if (!url) {
      return false;
    }
    return getConfiguredMatchPatterns().some((pattern) => convertMatchPatternToRegex(pattern).test(url));
  }

  // src/js/services/openaiService.js
  var OpenAIService = class {
    constructor() {
      this.apiKey = null;
      this.baseURL = normalizeLiteLLMBaseUrl();
      this.model = DEFAULT_LITELLM_LOG_MODEL;
    }
    async configure({ apiKey, baseUrl, model } = {}) {
      if (typeof apiKey === "string") {
        this.apiKey = apiKey;
      }
      if (typeof baseUrl === "string") {
        this.baseURL = normalizeLiteLLMBaseUrl(baseUrl);
      }
      if (typeof model === "string" && model.trim()) {
        this.model = model.trim();
      }
    }
    async setApiKey(key) {
      this.apiKey = key;
    }
    async analyzeLogs(logs) {
      if (!this.apiKey) {
        throw new Error("LiteLLM API key not set");
      }
      const messages = [
        {
          role: "system",
          content: `You are an expert log analyzer. Analyze for issues, including possible compatibility problems (e.g., framework updates or namespace changes like javax to jakarta). Provide concise explanations and actionable solutions.
              `
        },
        {
          role: "user",
          content: `Analyze this log for the problem, root cause, and solution. Consider dependency compatibility, namespace changes, or other breaking changes.
              :

${logs}`
        }
      ];
      try {
        const requestBaseUrl = validateLiteLLMBaseUrlForRuntime(this.baseURL);
        const response = await chrome.runtime.sendMessage({
          type: RUNTIME_MESSAGES.LITELLM_CHAT_COMPLETIONS,
          data: {
            apiKey: this.apiKey,
            baseUrl: requestBaseUrl,
            body: {
              model: this.model,
              messages,
              temperature: 0.2,
              max_tokens: 500
            }
          }
        });
        if (!(response == null ? void 0 : response.success)) {
          throw new Error((response == null ? void 0 : response.error) || "LiteLLM API error");
        }
        return response.data.choices[0].message.content;
      } catch (error) {
        console.error("Error analyzing logs:", error);
        throw error;
      }
    }
  };
  var openaiService_default = new OpenAIService();

  // node_modules/.pnpm/marked@12.0.2/node_modules/marked/lib/marked.esm.js
  function _getDefaults() {
    return {
      async: false,
      breaks: false,
      extensions: null,
      gfm: true,
      hooks: null,
      pedantic: false,
      renderer: null,
      silent: false,
      tokenizer: null,
      walkTokens: null
    };
  }
  var _defaults = _getDefaults();
  function changeDefaults(newDefaults) {
    _defaults = newDefaults;
  }
  var escapeTest = /[&<>"']/;
  var escapeReplace = new RegExp(escapeTest.source, "g");
  var escapeTestNoEncode = /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/;
  var escapeReplaceNoEncode = new RegExp(escapeTestNoEncode.source, "g");
  var escapeReplacements = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  };
  var getEscapeReplacement = (ch) => escapeReplacements[ch];
  function escape$1(html2, encode) {
    if (encode) {
      if (escapeTest.test(html2)) {
        return html2.replace(escapeReplace, getEscapeReplacement);
      }
    } else {
      if (escapeTestNoEncode.test(html2)) {
        return html2.replace(escapeReplaceNoEncode, getEscapeReplacement);
      }
    }
    return html2;
  }
  var unescapeTest = /&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig;
  function unescape(html2) {
    return html2.replace(unescapeTest, (_, n) => {
      n = n.toLowerCase();
      if (n === "colon")
        return ":";
      if (n.charAt(0) === "#") {
        return n.charAt(1) === "x" ? String.fromCharCode(parseInt(n.substring(2), 16)) : String.fromCharCode(+n.substring(1));
      }
      return "";
    });
  }
  var caret = /(^|[^\[])\^/g;
  function edit(regex, opt) {
    let source = typeof regex === "string" ? regex : regex.source;
    opt = opt || "";
    const obj = {
      replace: (name, val) => {
        let valSource = typeof val === "string" ? val : val.source;
        valSource = valSource.replace(caret, "$1");
        source = source.replace(name, valSource);
        return obj;
      },
      getRegex: () => {
        return new RegExp(source, opt);
      }
    };
    return obj;
  }
  function cleanUrl(href) {
    try {
      href = encodeURI(href).replace(/%25/g, "%");
    } catch (e) {
      return null;
    }
    return href;
  }
  var noopTest = { exec: () => null };
  function splitCells(tableRow, count) {
    const row = tableRow.replace(/\|/g, (match, offset, str) => {
      let escaped = false;
      let curr = offset;
      while (--curr >= 0 && str[curr] === "\\")
        escaped = !escaped;
      if (escaped) {
        return "|";
      } else {
        return " |";
      }
    }), cells = row.split(/ \|/);
    let i = 0;
    if (!cells[0].trim()) {
      cells.shift();
    }
    if (cells.length > 0 && !cells[cells.length - 1].trim()) {
      cells.pop();
    }
    if (count) {
      if (cells.length > count) {
        cells.splice(count);
      } else {
        while (cells.length < count)
          cells.push("");
      }
    }
    for (; i < cells.length; i++) {
      cells[i] = cells[i].trim().replace(/\\\|/g, "|");
    }
    return cells;
  }
  function rtrim(str, c, invert) {
    const l = str.length;
    if (l === 0) {
      return "";
    }
    let suffLen = 0;
    while (suffLen < l) {
      const currChar = str.charAt(l - suffLen - 1);
      if (currChar === c && !invert) {
        suffLen++;
      } else if (currChar !== c && invert) {
        suffLen++;
      } else {
        break;
      }
    }
    return str.slice(0, l - suffLen);
  }
  function findClosingBracket(str, b) {
    if (str.indexOf(b[1]) === -1) {
      return -1;
    }
    let level = 0;
    for (let i = 0; i < str.length; i++) {
      if (str[i] === "\\") {
        i++;
      } else if (str[i] === b[0]) {
        level++;
      } else if (str[i] === b[1]) {
        level--;
        if (level < 0) {
          return i;
        }
      }
    }
    return -1;
  }
  function outputLink(cap, link2, raw, lexer2) {
    const href = link2.href;
    const title = link2.title ? escape$1(link2.title) : null;
    const text = cap[1].replace(/\\([\[\]])/g, "$1");
    if (cap[0].charAt(0) !== "!") {
      lexer2.state.inLink = true;
      const token = {
        type: "link",
        raw,
        href,
        title,
        text,
        tokens: lexer2.inlineTokens(text)
      };
      lexer2.state.inLink = false;
      return token;
    }
    return {
      type: "image",
      raw,
      href,
      title,
      text: escape$1(text)
    };
  }
  function indentCodeCompensation(raw, text) {
    const matchIndentToCode = raw.match(/^(\s+)(?:```)/);
    if (matchIndentToCode === null) {
      return text;
    }
    const indentToCode = matchIndentToCode[1];
    return text.split("\n").map((node) => {
      const matchIndentInNode = node.match(/^\s+/);
      if (matchIndentInNode === null) {
        return node;
      }
      const [indentInNode] = matchIndentInNode;
      if (indentInNode.length >= indentToCode.length) {
        return node.slice(indentToCode.length);
      }
      return node;
    }).join("\n");
  }
  var _Tokenizer = class {
    options;
    rules;
    // set by the lexer
    lexer;
    // set by the lexer
    constructor(options2) {
      this.options = options2 || _defaults;
    }
    space(src) {
      const cap = this.rules.block.newline.exec(src);
      if (cap && cap[0].length > 0) {
        return {
          type: "space",
          raw: cap[0]
        };
      }
    }
    code(src) {
      const cap = this.rules.block.code.exec(src);
      if (cap) {
        const text = cap[0].replace(/^ {1,4}/gm, "");
        return {
          type: "code",
          raw: cap[0],
          codeBlockStyle: "indented",
          text: !this.options.pedantic ? rtrim(text, "\n") : text
        };
      }
    }
    fences(src) {
      const cap = this.rules.block.fences.exec(src);
      if (cap) {
        const raw = cap[0];
        const text = indentCodeCompensation(raw, cap[3] || "");
        return {
          type: "code",
          raw,
          lang: cap[2] ? cap[2].trim().replace(this.rules.inline.anyPunctuation, "$1") : cap[2],
          text
        };
      }
    }
    heading(src) {
      const cap = this.rules.block.heading.exec(src);
      if (cap) {
        let text = cap[2].trim();
        if (/#$/.test(text)) {
          const trimmed = rtrim(text, "#");
          if (this.options.pedantic) {
            text = trimmed.trim();
          } else if (!trimmed || / $/.test(trimmed)) {
            text = trimmed.trim();
          }
        }
        return {
          type: "heading",
          raw: cap[0],
          depth: cap[1].length,
          text,
          tokens: this.lexer.inline(text)
        };
      }
    }
    hr(src) {
      const cap = this.rules.block.hr.exec(src);
      if (cap) {
        return {
          type: "hr",
          raw: cap[0]
        };
      }
    }
    blockquote(src) {
      const cap = this.rules.block.blockquote.exec(src);
      if (cap) {
        let text = cap[0].replace(/\n {0,3}((?:=+|-+) *)(?=\n|$)/g, "\n    $1");
        text = rtrim(text.replace(/^ *>[ \t]?/gm, ""), "\n");
        const top = this.lexer.state.top;
        this.lexer.state.top = true;
        const tokens = this.lexer.blockTokens(text);
        this.lexer.state.top = top;
        return {
          type: "blockquote",
          raw: cap[0],
          tokens,
          text
        };
      }
    }
    list(src) {
      let cap = this.rules.block.list.exec(src);
      if (cap) {
        let bull = cap[1].trim();
        const isordered = bull.length > 1;
        const list2 = {
          type: "list",
          raw: "",
          ordered: isordered,
          start: isordered ? +bull.slice(0, -1) : "",
          loose: false,
          items: []
        };
        bull = isordered ? `\\d{1,9}\\${bull.slice(-1)}` : `\\${bull}`;
        if (this.options.pedantic) {
          bull = isordered ? bull : "[*+-]";
        }
        const itemRegex = new RegExp(`^( {0,3}${bull})((?:[	 ][^\\n]*)?(?:\\n|$))`);
        let raw = "";
        let itemContents = "";
        let endsWithBlankLine = false;
        while (src) {
          let endEarly = false;
          if (!(cap = itemRegex.exec(src))) {
            break;
          }
          if (this.rules.block.hr.test(src)) {
            break;
          }
          raw = cap[0];
          src = src.substring(raw.length);
          let line = cap[2].split("\n", 1)[0].replace(/^\t+/, (t) => " ".repeat(3 * t.length));
          let nextLine = src.split("\n", 1)[0];
          let indent = 0;
          if (this.options.pedantic) {
            indent = 2;
            itemContents = line.trimStart();
          } else {
            indent = cap[2].search(/[^ ]/);
            indent = indent > 4 ? 1 : indent;
            itemContents = line.slice(indent);
            indent += cap[1].length;
          }
          let blankLine = false;
          if (!line && /^ *$/.test(nextLine)) {
            raw += nextLine + "\n";
            src = src.substring(nextLine.length + 1);
            endEarly = true;
          }
          if (!endEarly) {
            const nextBulletRegex = new RegExp(`^ {0,${Math.min(3, indent - 1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`);
            const hrRegex = new RegExp(`^ {0,${Math.min(3, indent - 1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`);
            const fencesBeginRegex = new RegExp(`^ {0,${Math.min(3, indent - 1)}}(?:\`\`\`|~~~)`);
            const headingBeginRegex = new RegExp(`^ {0,${Math.min(3, indent - 1)}}#`);
            while (src) {
              const rawLine = src.split("\n", 1)[0];
              nextLine = rawLine;
              if (this.options.pedantic) {
                nextLine = nextLine.replace(/^ {1,4}(?=( {4})*[^ ])/g, "  ");
              }
              if (fencesBeginRegex.test(nextLine)) {
                break;
              }
              if (headingBeginRegex.test(nextLine)) {
                break;
              }
              if (nextBulletRegex.test(nextLine)) {
                break;
              }
              if (hrRegex.test(src)) {
                break;
              }
              if (nextLine.search(/[^ ]/) >= indent || !nextLine.trim()) {
                itemContents += "\n" + nextLine.slice(indent);
              } else {
                if (blankLine) {
                  break;
                }
                if (line.search(/[^ ]/) >= 4) {
                  break;
                }
                if (fencesBeginRegex.test(line)) {
                  break;
                }
                if (headingBeginRegex.test(line)) {
                  break;
                }
                if (hrRegex.test(line)) {
                  break;
                }
                itemContents += "\n" + nextLine;
              }
              if (!blankLine && !nextLine.trim()) {
                blankLine = true;
              }
              raw += rawLine + "\n";
              src = src.substring(rawLine.length + 1);
              line = nextLine.slice(indent);
            }
          }
          if (!list2.loose) {
            if (endsWithBlankLine) {
              list2.loose = true;
            } else if (/\n *\n *$/.test(raw)) {
              endsWithBlankLine = true;
            }
          }
          let istask = null;
          let ischecked;
          if (this.options.gfm) {
            istask = /^\[[ xX]\] /.exec(itemContents);
            if (istask) {
              ischecked = istask[0] !== "[ ] ";
              itemContents = itemContents.replace(/^\[[ xX]\] +/, "");
            }
          }
          list2.items.push({
            type: "list_item",
            raw,
            task: !!istask,
            checked: ischecked,
            loose: false,
            text: itemContents,
            tokens: []
          });
          list2.raw += raw;
        }
        list2.items[list2.items.length - 1].raw = raw.trimEnd();
        list2.items[list2.items.length - 1].text = itemContents.trimEnd();
        list2.raw = list2.raw.trimEnd();
        for (let i = 0; i < list2.items.length; i++) {
          this.lexer.state.top = false;
          list2.items[i].tokens = this.lexer.blockTokens(list2.items[i].text, []);
          if (!list2.loose) {
            const spacers = list2.items[i].tokens.filter((t) => t.type === "space");
            const hasMultipleLineBreaks = spacers.length > 0 && spacers.some((t) => /\n.*\n/.test(t.raw));
            list2.loose = hasMultipleLineBreaks;
          }
        }
        if (list2.loose) {
          for (let i = 0; i < list2.items.length; i++) {
            list2.items[i].loose = true;
          }
        }
        return list2;
      }
    }
    html(src) {
      const cap = this.rules.block.html.exec(src);
      if (cap) {
        const token = {
          type: "html",
          block: true,
          raw: cap[0],
          pre: cap[1] === "pre" || cap[1] === "script" || cap[1] === "style",
          text: cap[0]
        };
        return token;
      }
    }
    def(src) {
      const cap = this.rules.block.def.exec(src);
      if (cap) {
        const tag2 = cap[1].toLowerCase().replace(/\s+/g, " ");
        const href = cap[2] ? cap[2].replace(/^<(.*)>$/, "$1").replace(this.rules.inline.anyPunctuation, "$1") : "";
        const title = cap[3] ? cap[3].substring(1, cap[3].length - 1).replace(this.rules.inline.anyPunctuation, "$1") : cap[3];
        return {
          type: "def",
          tag: tag2,
          raw: cap[0],
          href,
          title
        };
      }
    }
    table(src) {
      const cap = this.rules.block.table.exec(src);
      if (!cap) {
        return;
      }
      if (!/[:|]/.test(cap[2])) {
        return;
      }
      const headers = splitCells(cap[1]);
      const aligns = cap[2].replace(/^\||\| *$/g, "").split("|");
      const rows = cap[3] && cap[3].trim() ? cap[3].replace(/\n[ \t]*$/, "").split("\n") : [];
      const item = {
        type: "table",
        raw: cap[0],
        header: [],
        align: [],
        rows: []
      };
      if (headers.length !== aligns.length) {
        return;
      }
      for (const align of aligns) {
        if (/^ *-+: *$/.test(align)) {
          item.align.push("right");
        } else if (/^ *:-+: *$/.test(align)) {
          item.align.push("center");
        } else if (/^ *:-+ *$/.test(align)) {
          item.align.push("left");
        } else {
          item.align.push(null);
        }
      }
      for (const header of headers) {
        item.header.push({
          text: header,
          tokens: this.lexer.inline(header)
        });
      }
      for (const row of rows) {
        item.rows.push(splitCells(row, item.header.length).map((cell) => {
          return {
            text: cell,
            tokens: this.lexer.inline(cell)
          };
        }));
      }
      return item;
    }
    lheading(src) {
      const cap = this.rules.block.lheading.exec(src);
      if (cap) {
        return {
          type: "heading",
          raw: cap[0],
          depth: cap[2].charAt(0) === "=" ? 1 : 2,
          text: cap[1],
          tokens: this.lexer.inline(cap[1])
        };
      }
    }
    paragraph(src) {
      const cap = this.rules.block.paragraph.exec(src);
      if (cap) {
        const text = cap[1].charAt(cap[1].length - 1) === "\n" ? cap[1].slice(0, -1) : cap[1];
        return {
          type: "paragraph",
          raw: cap[0],
          text,
          tokens: this.lexer.inline(text)
        };
      }
    }
    text(src) {
      const cap = this.rules.block.text.exec(src);
      if (cap) {
        return {
          type: "text",
          raw: cap[0],
          text: cap[0],
          tokens: this.lexer.inline(cap[0])
        };
      }
    }
    escape(src) {
      const cap = this.rules.inline.escape.exec(src);
      if (cap) {
        return {
          type: "escape",
          raw: cap[0],
          text: escape$1(cap[1])
        };
      }
    }
    tag(src) {
      const cap = this.rules.inline.tag.exec(src);
      if (cap) {
        if (!this.lexer.state.inLink && /^<a /i.test(cap[0])) {
          this.lexer.state.inLink = true;
        } else if (this.lexer.state.inLink && /^<\/a>/i.test(cap[0])) {
          this.lexer.state.inLink = false;
        }
        if (!this.lexer.state.inRawBlock && /^<(pre|code|kbd|script)(\s|>)/i.test(cap[0])) {
          this.lexer.state.inRawBlock = true;
        } else if (this.lexer.state.inRawBlock && /^<\/(pre|code|kbd|script)(\s|>)/i.test(cap[0])) {
          this.lexer.state.inRawBlock = false;
        }
        return {
          type: "html",
          raw: cap[0],
          inLink: this.lexer.state.inLink,
          inRawBlock: this.lexer.state.inRawBlock,
          block: false,
          text: cap[0]
        };
      }
    }
    link(src) {
      const cap = this.rules.inline.link.exec(src);
      if (cap) {
        const trimmedUrl = cap[2].trim();
        if (!this.options.pedantic && /^</.test(trimmedUrl)) {
          if (!/>$/.test(trimmedUrl)) {
            return;
          }
          const rtrimSlash = rtrim(trimmedUrl.slice(0, -1), "\\");
          if ((trimmedUrl.length - rtrimSlash.length) % 2 === 0) {
            return;
          }
        } else {
          const lastParenIndex = findClosingBracket(cap[2], "()");
          if (lastParenIndex > -1) {
            const start = cap[0].indexOf("!") === 0 ? 5 : 4;
            const linkLen = start + cap[1].length + lastParenIndex;
            cap[2] = cap[2].substring(0, lastParenIndex);
            cap[0] = cap[0].substring(0, linkLen).trim();
            cap[3] = "";
          }
        }
        let href = cap[2];
        let title = "";
        if (this.options.pedantic) {
          const link2 = /^([^'"]*[^\s])\s+(['"])(.*)\2/.exec(href);
          if (link2) {
            href = link2[1];
            title = link2[3];
          }
        } else {
          title = cap[3] ? cap[3].slice(1, -1) : "";
        }
        href = href.trim();
        if (/^</.test(href)) {
          if (this.options.pedantic && !/>$/.test(trimmedUrl)) {
            href = href.slice(1);
          } else {
            href = href.slice(1, -1);
          }
        }
        return outputLink(cap, {
          href: href ? href.replace(this.rules.inline.anyPunctuation, "$1") : href,
          title: title ? title.replace(this.rules.inline.anyPunctuation, "$1") : title
        }, cap[0], this.lexer);
      }
    }
    reflink(src, links) {
      let cap;
      if ((cap = this.rules.inline.reflink.exec(src)) || (cap = this.rules.inline.nolink.exec(src))) {
        const linkString = (cap[2] || cap[1]).replace(/\s+/g, " ");
        const link2 = links[linkString.toLowerCase()];
        if (!link2) {
          const text = cap[0].charAt(0);
          return {
            type: "text",
            raw: text,
            text
          };
        }
        return outputLink(cap, link2, cap[0], this.lexer);
      }
    }
    emStrong(src, maskedSrc, prevChar = "") {
      let match = this.rules.inline.emStrongLDelim.exec(src);
      if (!match)
        return;
      if (match[3] && prevChar.match(/[\p{L}\p{N}]/u))
        return;
      const nextChar = match[1] || match[2] || "";
      if (!nextChar || !prevChar || this.rules.inline.punctuation.exec(prevChar)) {
        const lLength = [...match[0]].length - 1;
        let rDelim, rLength, delimTotal = lLength, midDelimTotal = 0;
        const endReg = match[0][0] === "*" ? this.rules.inline.emStrongRDelimAst : this.rules.inline.emStrongRDelimUnd;
        endReg.lastIndex = 0;
        maskedSrc = maskedSrc.slice(-1 * src.length + lLength);
        while ((match = endReg.exec(maskedSrc)) != null) {
          rDelim = match[1] || match[2] || match[3] || match[4] || match[5] || match[6];
          if (!rDelim)
            continue;
          rLength = [...rDelim].length;
          if (match[3] || match[4]) {
            delimTotal += rLength;
            continue;
          } else if (match[5] || match[6]) {
            if (lLength % 3 && !((lLength + rLength) % 3)) {
              midDelimTotal += rLength;
              continue;
            }
          }
          delimTotal -= rLength;
          if (delimTotal > 0)
            continue;
          rLength = Math.min(rLength, rLength + delimTotal + midDelimTotal);
          const lastCharLength = [...match[0]][0].length;
          const raw = src.slice(0, lLength + match.index + lastCharLength + rLength);
          if (Math.min(lLength, rLength) % 2) {
            const text2 = raw.slice(1, -1);
            return {
              type: "em",
              raw,
              text: text2,
              tokens: this.lexer.inlineTokens(text2)
            };
          }
          const text = raw.slice(2, -2);
          return {
            type: "strong",
            raw,
            text,
            tokens: this.lexer.inlineTokens(text)
          };
        }
      }
    }
    codespan(src) {
      const cap = this.rules.inline.code.exec(src);
      if (cap) {
        let text = cap[2].replace(/\n/g, " ");
        const hasNonSpaceChars = /[^ ]/.test(text);
        const hasSpaceCharsOnBothEnds = /^ /.test(text) && / $/.test(text);
        if (hasNonSpaceChars && hasSpaceCharsOnBothEnds) {
          text = text.substring(1, text.length - 1);
        }
        text = escape$1(text, true);
        return {
          type: "codespan",
          raw: cap[0],
          text
        };
      }
    }
    br(src) {
      const cap = this.rules.inline.br.exec(src);
      if (cap) {
        return {
          type: "br",
          raw: cap[0]
        };
      }
    }
    del(src) {
      const cap = this.rules.inline.del.exec(src);
      if (cap) {
        return {
          type: "del",
          raw: cap[0],
          text: cap[2],
          tokens: this.lexer.inlineTokens(cap[2])
        };
      }
    }
    autolink(src) {
      const cap = this.rules.inline.autolink.exec(src);
      if (cap) {
        let text, href;
        if (cap[2] === "@") {
          text = escape$1(cap[1]);
          href = "mailto:" + text;
        } else {
          text = escape$1(cap[1]);
          href = text;
        }
        return {
          type: "link",
          raw: cap[0],
          text,
          href,
          tokens: [
            {
              type: "text",
              raw: text,
              text
            }
          ]
        };
      }
    }
    url(src) {
      var _a;
      let cap;
      if (cap = this.rules.inline.url.exec(src)) {
        let text, href;
        if (cap[2] === "@") {
          text = escape$1(cap[0]);
          href = "mailto:" + text;
        } else {
          let prevCapZero;
          do {
            prevCapZero = cap[0];
            cap[0] = ((_a = this.rules.inline._backpedal.exec(cap[0])) == null ? void 0 : _a[0]) ?? "";
          } while (prevCapZero !== cap[0]);
          text = escape$1(cap[0]);
          if (cap[1] === "www.") {
            href = "http://" + cap[0];
          } else {
            href = cap[0];
          }
        }
        return {
          type: "link",
          raw: cap[0],
          text,
          href,
          tokens: [
            {
              type: "text",
              raw: text,
              text
            }
          ]
        };
      }
    }
    inlineText(src) {
      const cap = this.rules.inline.text.exec(src);
      if (cap) {
        let text;
        if (this.lexer.state.inRawBlock) {
          text = cap[0];
        } else {
          text = escape$1(cap[0]);
        }
        return {
          type: "text",
          raw: cap[0],
          text
        };
      }
    }
  };
  var newline = /^(?: *(?:\n|$))+/;
  var blockCode = /^( {4}[^\n]+(?:\n(?: *(?:\n|$))*)?)+/;
  var fences = /^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/;
  var hr = /^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/;
  var heading = /^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/;
  var bullet = /(?:[*+-]|\d{1,9}[.)])/;
  var lheading = edit(/^(?!bull |blockCode|fences|blockquote|heading|html)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html))+?)\n {0,3}(=+|-+) *(?:\n+|$)/).replace(/bull/g, bullet).replace(/blockCode/g, / {4}/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}/).replace(/html/g, / {0,3}<[^\n>]+>\n/).getRegex();
  var _paragraph = /^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/;
  var blockText = /^[^\n]+/;
  var _blockLabel = /(?!\s*\])(?:\\.|[^\[\]\\])+/;
  var def = edit(/^ {0,3}\[(label)\]: *(?:\n *)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n *)?| *\n *)(title))? *(?:\n+|$)/).replace("label", _blockLabel).replace("title", /(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex();
  var list = edit(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g, bullet).getRegex();
  var _tag = "address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul";
  var _comment = /<!--(?:-?>|[\s\S]*?(?:-->|$))/;
  var html = edit("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n *)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n *)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n *)+\\n|$))", "i").replace("comment", _comment).replace("tag", _tag).replace("attribute", / +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex();
  var paragraph = edit(_paragraph).replace("hr", hr).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("|table", "").replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)]) ").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", _tag).getRegex();
  var blockquote = edit(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph", paragraph).getRegex();
  var blockNormal = {
    blockquote,
    code: blockCode,
    def,
    fences,
    heading,
    hr,
    html,
    lheading,
    list,
    newline,
    paragraph,
    table: noopTest,
    text: blockText
  };
  var gfmTable = edit("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr", hr).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("blockquote", " {0,3}>").replace("code", " {4}[^\\n]").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)]) ").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", _tag).getRegex();
  var blockGfm = {
    ...blockNormal,
    table: gfmTable,
    paragraph: edit(_paragraph).replace("hr", hr).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("table", gfmTable).replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)]) ").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", _tag).getRegex()
  };
  var blockPedantic = {
    ...blockNormal,
    html: edit(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment", _comment).replace(/tag/g, "(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),
    def: /^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,
    heading: /^(#{1,6})(.*)(?:\n+|$)/,
    fences: noopTest,
    // fences not supported
    lheading: /^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,
    paragraph: edit(_paragraph).replace("hr", hr).replace("heading", " *#{1,6} *[^\n]").replace("lheading", lheading).replace("|table", "").replace("blockquote", " {0,3}>").replace("|fences", "").replace("|list", "").replace("|html", "").replace("|tag", "").getRegex()
  };
  var escape = /^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/;
  var inlineCode = /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/;
  var br = /^( {2,}|\\)\n(?!\s*$)/;
  var inlineText = /^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/;
  var _punctuation = "\\p{P}\\p{S}";
  var punctuation = edit(/^((?![*_])[\spunctuation])/, "u").replace(/punctuation/g, _punctuation).getRegex();
  var blockSkip = /\[[^[\]]*?\]\([^\(\)]*?\)|`[^`]*?`|<[^<>]*?>/g;
  var emStrongLDelim = edit(/^(?:\*+(?:((?!\*)[punct])|[^\s*]))|^_+(?:((?!_)[punct])|([^\s_]))/, "u").replace(/punct/g, _punctuation).getRegex();
  var emStrongRDelimAst = edit("^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)[punct](\\*+)(?=[\\s]|$)|[^punct\\s](\\*+)(?!\\*)(?=[punct\\s]|$)|(?!\\*)[punct\\s](\\*+)(?=[^punct\\s])|[\\s](\\*+)(?!\\*)(?=[punct])|(?!\\*)[punct](\\*+)(?!\\*)(?=[punct])|[^punct\\s](\\*+)(?=[^punct\\s])", "gu").replace(/punct/g, _punctuation).getRegex();
  var emStrongRDelimUnd = edit("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)[punct](_+)(?=[\\s]|$)|[^punct\\s](_+)(?!_)(?=[punct\\s]|$)|(?!_)[punct\\s](_+)(?=[^punct\\s])|[\\s](_+)(?!_)(?=[punct])|(?!_)[punct](_+)(?!_)(?=[punct])", "gu").replace(/punct/g, _punctuation).getRegex();
  var anyPunctuation = edit(/\\([punct])/, "gu").replace(/punct/g, _punctuation).getRegex();
  var autolink = edit(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme", /[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email", /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex();
  var _inlineComment = edit(_comment).replace("(?:-->|$)", "-->").getRegex();
  var tag = edit("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment", _inlineComment).replace("attribute", /\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex();
  var _inlineLabel = /(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/;
  var link = edit(/^!?\[(label)\]\(\s*(href)(?:\s+(title))?\s*\)/).replace("label", _inlineLabel).replace("href", /<(?:\\.|[^\n<>\\])+>|[^\s\x00-\x1f]*/).replace("title", /"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex();
  var reflink = edit(/^!?\[(label)\]\[(ref)\]/).replace("label", _inlineLabel).replace("ref", _blockLabel).getRegex();
  var nolink = edit(/^!?\[(ref)\](?:\[\])?/).replace("ref", _blockLabel).getRegex();
  var reflinkSearch = edit("reflink|nolink(?!\\()", "g").replace("reflink", reflink).replace("nolink", nolink).getRegex();
  var inlineNormal = {
    _backpedal: noopTest,
    // only used for GFM url
    anyPunctuation,
    autolink,
    blockSkip,
    br,
    code: inlineCode,
    del: noopTest,
    emStrongLDelim,
    emStrongRDelimAst,
    emStrongRDelimUnd,
    escape,
    link,
    nolink,
    punctuation,
    reflink,
    reflinkSearch,
    tag,
    text: inlineText,
    url: noopTest
  };
  var inlinePedantic = {
    ...inlineNormal,
    link: edit(/^!?\[(label)\]\((.*?)\)/).replace("label", _inlineLabel).getRegex(),
    reflink: edit(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label", _inlineLabel).getRegex()
  };
  var inlineGfm = {
    ...inlineNormal,
    escape: edit(escape).replace("])", "~|])").getRegex(),
    url: edit(/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/, "i").replace("email", /[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(),
    _backpedal: /(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,
    del: /^(~~?)(?=[^\s~])([\s\S]*?[^\s~])\1(?=[^~]|$)/,
    text: /^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/
  };
  var inlineBreaks = {
    ...inlineGfm,
    br: edit(br).replace("{2,}", "*").getRegex(),
    text: edit(inlineGfm.text).replace("\\b_", "\\b_| {2,}\\n").replace(/\{2,\}/g, "*").getRegex()
  };
  var block = {
    normal: blockNormal,
    gfm: blockGfm,
    pedantic: blockPedantic
  };
  var inline = {
    normal: inlineNormal,
    gfm: inlineGfm,
    breaks: inlineBreaks,
    pedantic: inlinePedantic
  };
  var _Lexer = class __Lexer {
    tokens;
    options;
    state;
    tokenizer;
    inlineQueue;
    constructor(options2) {
      this.tokens = [];
      this.tokens.links = /* @__PURE__ */ Object.create(null);
      this.options = options2 || _defaults;
      this.options.tokenizer = this.options.tokenizer || new _Tokenizer();
      this.tokenizer = this.options.tokenizer;
      this.tokenizer.options = this.options;
      this.tokenizer.lexer = this;
      this.inlineQueue = [];
      this.state = {
        inLink: false,
        inRawBlock: false,
        top: true
      };
      const rules = {
        block: block.normal,
        inline: inline.normal
      };
      if (this.options.pedantic) {
        rules.block = block.pedantic;
        rules.inline = inline.pedantic;
      } else if (this.options.gfm) {
        rules.block = block.gfm;
        if (this.options.breaks) {
          rules.inline = inline.breaks;
        } else {
          rules.inline = inline.gfm;
        }
      }
      this.tokenizer.rules = rules;
    }
    /**
     * Expose Rules
     */
    static get rules() {
      return {
        block,
        inline
      };
    }
    /**
     * Static Lex Method
     */
    static lex(src, options2) {
      const lexer2 = new __Lexer(options2);
      return lexer2.lex(src);
    }
    /**
     * Static Lex Inline Method
     */
    static lexInline(src, options2) {
      const lexer2 = new __Lexer(options2);
      return lexer2.inlineTokens(src);
    }
    /**
     * Preprocessing
     */
    lex(src) {
      src = src.replace(/\r\n|\r/g, "\n");
      this.blockTokens(src, this.tokens);
      for (let i = 0; i < this.inlineQueue.length; i++) {
        const next = this.inlineQueue[i];
        this.inlineTokens(next.src, next.tokens);
      }
      this.inlineQueue = [];
      return this.tokens;
    }
    blockTokens(src, tokens = []) {
      if (this.options.pedantic) {
        src = src.replace(/\t/g, "    ").replace(/^ +$/gm, "");
      } else {
        src = src.replace(/^( *)(\t+)/gm, (_, leading, tabs) => {
          return leading + "    ".repeat(tabs.length);
        });
      }
      let token;
      let lastToken;
      let cutSrc;
      let lastParagraphClipped;
      while (src) {
        if (this.options.extensions && this.options.extensions.block && this.options.extensions.block.some((extTokenizer) => {
          if (token = extTokenizer.call({ lexer: this }, src, tokens)) {
            src = src.substring(token.raw.length);
            tokens.push(token);
            return true;
          }
          return false;
        })) {
          continue;
        }
        if (token = this.tokenizer.space(src)) {
          src = src.substring(token.raw.length);
          if (token.raw.length === 1 && tokens.length > 0) {
            tokens[tokens.length - 1].raw += "\n";
          } else {
            tokens.push(token);
          }
          continue;
        }
        if (token = this.tokenizer.code(src)) {
          src = src.substring(token.raw.length);
          lastToken = tokens[tokens.length - 1];
          if (lastToken && (lastToken.type === "paragraph" || lastToken.type === "text")) {
            lastToken.raw += "\n" + token.raw;
            lastToken.text += "\n" + token.text;
            this.inlineQueue[this.inlineQueue.length - 1].src = lastToken.text;
          } else {
            tokens.push(token);
          }
          continue;
        }
        if (token = this.tokenizer.fences(src)) {
          src = src.substring(token.raw.length);
          tokens.push(token);
          continue;
        }
        if (token = this.tokenizer.heading(src)) {
          src = src.substring(token.raw.length);
          tokens.push(token);
          continue;
        }
        if (token = this.tokenizer.hr(src)) {
          src = src.substring(token.raw.length);
          tokens.push(token);
          continue;
        }
        if (token = this.tokenizer.blockquote(src)) {
          src = src.substring(token.raw.length);
          tokens.push(token);
          continue;
        }
        if (token = this.tokenizer.list(src)) {
          src = src.substring(token.raw.length);
          tokens.push(token);
          continue;
        }
        if (token = this.tokenizer.html(src)) {
          src = src.substring(token.raw.length);
          tokens.push(token);
          continue;
        }
        if (token = this.tokenizer.def(src)) {
          src = src.substring(token.raw.length);
          lastToken = tokens[tokens.length - 1];
          if (lastToken && (lastToken.type === "paragraph" || lastToken.type === "text")) {
            lastToken.raw += "\n" + token.raw;
            lastToken.text += "\n" + token.raw;
            this.inlineQueue[this.inlineQueue.length - 1].src = lastToken.text;
          } else if (!this.tokens.links[token.tag]) {
            this.tokens.links[token.tag] = {
              href: token.href,
              title: token.title
            };
          }
          continue;
        }
        if (token = this.tokenizer.table(src)) {
          src = src.substring(token.raw.length);
          tokens.push(token);
          continue;
        }
        if (token = this.tokenizer.lheading(src)) {
          src = src.substring(token.raw.length);
          tokens.push(token);
          continue;
        }
        cutSrc = src;
        if (this.options.extensions && this.options.extensions.startBlock) {
          let startIndex = Infinity;
          const tempSrc = src.slice(1);
          let tempStart;
          this.options.extensions.startBlock.forEach((getStartIndex) => {
            tempStart = getStartIndex.call({ lexer: this }, tempSrc);
            if (typeof tempStart === "number" && tempStart >= 0) {
              startIndex = Math.min(startIndex, tempStart);
            }
          });
          if (startIndex < Infinity && startIndex >= 0) {
            cutSrc = src.substring(0, startIndex + 1);
          }
        }
        if (this.state.top && (token = this.tokenizer.paragraph(cutSrc))) {
          lastToken = tokens[tokens.length - 1];
          if (lastParagraphClipped && lastToken.type === "paragraph") {
            lastToken.raw += "\n" + token.raw;
            lastToken.text += "\n" + token.text;
            this.inlineQueue.pop();
            this.inlineQueue[this.inlineQueue.length - 1].src = lastToken.text;
          } else {
            tokens.push(token);
          }
          lastParagraphClipped = cutSrc.length !== src.length;
          src = src.substring(token.raw.length);
          continue;
        }
        if (token = this.tokenizer.text(src)) {
          src = src.substring(token.raw.length);
          lastToken = tokens[tokens.length - 1];
          if (lastToken && lastToken.type === "text") {
            lastToken.raw += "\n" + token.raw;
            lastToken.text += "\n" + token.text;
            this.inlineQueue.pop();
            this.inlineQueue[this.inlineQueue.length - 1].src = lastToken.text;
          } else {
            tokens.push(token);
          }
          continue;
        }
        if (src) {
          const errMsg = "Infinite loop on byte: " + src.charCodeAt(0);
          if (this.options.silent) {
            console.error(errMsg);
            break;
          } else {
            throw new Error(errMsg);
          }
        }
      }
      this.state.top = true;
      return tokens;
    }
    inline(src, tokens = []) {
      this.inlineQueue.push({ src, tokens });
      return tokens;
    }
    /**
     * Lexing/Compiling
     */
    inlineTokens(src, tokens = []) {
      let token, lastToken, cutSrc;
      let maskedSrc = src;
      let match;
      let keepPrevChar, prevChar;
      if (this.tokens.links) {
        const links = Object.keys(this.tokens.links);
        if (links.length > 0) {
          while ((match = this.tokenizer.rules.inline.reflinkSearch.exec(maskedSrc)) != null) {
            if (links.includes(match[0].slice(match[0].lastIndexOf("[") + 1, -1))) {
              maskedSrc = maskedSrc.slice(0, match.index) + "[" + "a".repeat(match[0].length - 2) + "]" + maskedSrc.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex);
            }
          }
        }
      }
      while ((match = this.tokenizer.rules.inline.blockSkip.exec(maskedSrc)) != null) {
        maskedSrc = maskedSrc.slice(0, match.index) + "[" + "a".repeat(match[0].length - 2) + "]" + maskedSrc.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);
      }
      while ((match = this.tokenizer.rules.inline.anyPunctuation.exec(maskedSrc)) != null) {
        maskedSrc = maskedSrc.slice(0, match.index) + "++" + maskedSrc.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);
      }
      while (src) {
        if (!keepPrevChar) {
          prevChar = "";
        }
        keepPrevChar = false;
        if (this.options.extensions && this.options.extensions.inline && this.options.extensions.inline.some((extTokenizer) => {
          if (token = extTokenizer.call({ lexer: this }, src, tokens)) {
            src = src.substring(token.raw.length);
            tokens.push(token);
            return true;
          }
          return false;
        })) {
          continue;
        }
        if (token = this.tokenizer.escape(src)) {
          src = src.substring(token.raw.length);
          tokens.push(token);
          continue;
        }
        if (token = this.tokenizer.tag(src)) {
          src = src.substring(token.raw.length);
          lastToken = tokens[tokens.length - 1];
          if (lastToken && token.type === "text" && lastToken.type === "text") {
            lastToken.raw += token.raw;
            lastToken.text += token.text;
          } else {
            tokens.push(token);
          }
          continue;
        }
        if (token = this.tokenizer.link(src)) {
          src = src.substring(token.raw.length);
          tokens.push(token);
          continue;
        }
        if (token = this.tokenizer.reflink(src, this.tokens.links)) {
          src = src.substring(token.raw.length);
          lastToken = tokens[tokens.length - 1];
          if (lastToken && token.type === "text" && lastToken.type === "text") {
            lastToken.raw += token.raw;
            lastToken.text += token.text;
          } else {
            tokens.push(token);
          }
          continue;
        }
        if (token = this.tokenizer.emStrong(src, maskedSrc, prevChar)) {
          src = src.substring(token.raw.length);
          tokens.push(token);
          continue;
        }
        if (token = this.tokenizer.codespan(src)) {
          src = src.substring(token.raw.length);
          tokens.push(token);
          continue;
        }
        if (token = this.tokenizer.br(src)) {
          src = src.substring(token.raw.length);
          tokens.push(token);
          continue;
        }
        if (token = this.tokenizer.del(src)) {
          src = src.substring(token.raw.length);
          tokens.push(token);
          continue;
        }
        if (token = this.tokenizer.autolink(src)) {
          src = src.substring(token.raw.length);
          tokens.push(token);
          continue;
        }
        if (!this.state.inLink && (token = this.tokenizer.url(src))) {
          src = src.substring(token.raw.length);
          tokens.push(token);
          continue;
        }
        cutSrc = src;
        if (this.options.extensions && this.options.extensions.startInline) {
          let startIndex = Infinity;
          const tempSrc = src.slice(1);
          let tempStart;
          this.options.extensions.startInline.forEach((getStartIndex) => {
            tempStart = getStartIndex.call({ lexer: this }, tempSrc);
            if (typeof tempStart === "number" && tempStart >= 0) {
              startIndex = Math.min(startIndex, tempStart);
            }
          });
          if (startIndex < Infinity && startIndex >= 0) {
            cutSrc = src.substring(0, startIndex + 1);
          }
        }
        if (token = this.tokenizer.inlineText(cutSrc)) {
          src = src.substring(token.raw.length);
          if (token.raw.slice(-1) !== "_") {
            prevChar = token.raw.slice(-1);
          }
          keepPrevChar = true;
          lastToken = tokens[tokens.length - 1];
          if (lastToken && lastToken.type === "text") {
            lastToken.raw += token.raw;
            lastToken.text += token.text;
          } else {
            tokens.push(token);
          }
          continue;
        }
        if (src) {
          const errMsg = "Infinite loop on byte: " + src.charCodeAt(0);
          if (this.options.silent) {
            console.error(errMsg);
            break;
          } else {
            throw new Error(errMsg);
          }
        }
      }
      return tokens;
    }
  };
  var _Renderer = class {
    options;
    constructor(options2) {
      this.options = options2 || _defaults;
    }
    code(code, infostring, escaped) {
      var _a;
      const lang = (_a = (infostring || "").match(/^\S*/)) == null ? void 0 : _a[0];
      code = code.replace(/\n$/, "") + "\n";
      if (!lang) {
        return "<pre><code>" + (escaped ? code : escape$1(code, true)) + "</code></pre>\n";
      }
      return '<pre><code class="language-' + escape$1(lang) + '">' + (escaped ? code : escape$1(code, true)) + "</code></pre>\n";
    }
    blockquote(quote) {
      return `<blockquote>
${quote}</blockquote>
`;
    }
    html(html2, block2) {
      return html2;
    }
    heading(text, level, raw) {
      return `<h${level}>${text}</h${level}>
`;
    }
    hr() {
      return "<hr>\n";
    }
    list(body, ordered, start) {
      const type = ordered ? "ol" : "ul";
      const startatt = ordered && start !== 1 ? ' start="' + start + '"' : "";
      return "<" + type + startatt + ">\n" + body + "</" + type + ">\n";
    }
    listitem(text, task, checked) {
      return `<li>${text}</li>
`;
    }
    checkbox(checked) {
      return "<input " + (checked ? 'checked="" ' : "") + 'disabled="" type="checkbox">';
    }
    paragraph(text) {
      return `<p>${text}</p>
`;
    }
    table(header, body) {
      if (body)
        body = `<tbody>${body}</tbody>`;
      return "<table>\n<thead>\n" + header + "</thead>\n" + body + "</table>\n";
    }
    tablerow(content) {
      return `<tr>
${content}</tr>
`;
    }
    tablecell(content, flags) {
      const type = flags.header ? "th" : "td";
      const tag2 = flags.align ? `<${type} align="${flags.align}">` : `<${type}>`;
      return tag2 + content + `</${type}>
`;
    }
    /**
     * span level renderer
     */
    strong(text) {
      return `<strong>${text}</strong>`;
    }
    em(text) {
      return `<em>${text}</em>`;
    }
    codespan(text) {
      return `<code>${text}</code>`;
    }
    br() {
      return "<br>";
    }
    del(text) {
      return `<del>${text}</del>`;
    }
    link(href, title, text) {
      const cleanHref = cleanUrl(href);
      if (cleanHref === null) {
        return text;
      }
      href = cleanHref;
      let out = '<a href="' + href + '"';
      if (title) {
        out += ' title="' + title + '"';
      }
      out += ">" + text + "</a>";
      return out;
    }
    image(href, title, text) {
      const cleanHref = cleanUrl(href);
      if (cleanHref === null) {
        return text;
      }
      href = cleanHref;
      let out = `<img src="${href}" alt="${text}"`;
      if (title) {
        out += ` title="${title}"`;
      }
      out += ">";
      return out;
    }
    text(text) {
      return text;
    }
  };
  var _TextRenderer = class {
    // no need for block level renderers
    strong(text) {
      return text;
    }
    em(text) {
      return text;
    }
    codespan(text) {
      return text;
    }
    del(text) {
      return text;
    }
    html(text) {
      return text;
    }
    text(text) {
      return text;
    }
    link(href, title, text) {
      return "" + text;
    }
    image(href, title, text) {
      return "" + text;
    }
    br() {
      return "";
    }
  };
  var _Parser = class __Parser {
    options;
    renderer;
    textRenderer;
    constructor(options2) {
      this.options = options2 || _defaults;
      this.options.renderer = this.options.renderer || new _Renderer();
      this.renderer = this.options.renderer;
      this.renderer.options = this.options;
      this.textRenderer = new _TextRenderer();
    }
    /**
     * Static Parse Method
     */
    static parse(tokens, options2) {
      const parser2 = new __Parser(options2);
      return parser2.parse(tokens);
    }
    /**
     * Static Parse Inline Method
     */
    static parseInline(tokens, options2) {
      const parser2 = new __Parser(options2);
      return parser2.parseInline(tokens);
    }
    /**
     * Parse Loop
     */
    parse(tokens, top = true) {
      let out = "";
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (this.options.extensions && this.options.extensions.renderers && this.options.extensions.renderers[token.type]) {
          const genericToken = token;
          const ret = this.options.extensions.renderers[genericToken.type].call({ parser: this }, genericToken);
          if (ret !== false || !["space", "hr", "heading", "code", "table", "blockquote", "list", "html", "paragraph", "text"].includes(genericToken.type)) {
            out += ret || "";
            continue;
          }
        }
        switch (token.type) {
          case "space": {
            continue;
          }
          case "hr": {
            out += this.renderer.hr();
            continue;
          }
          case "heading": {
            const headingToken = token;
            out += this.renderer.heading(this.parseInline(headingToken.tokens), headingToken.depth, unescape(this.parseInline(headingToken.tokens, this.textRenderer)));
            continue;
          }
          case "code": {
            const codeToken = token;
            out += this.renderer.code(codeToken.text, codeToken.lang, !!codeToken.escaped);
            continue;
          }
          case "table": {
            const tableToken = token;
            let header = "";
            let cell = "";
            for (let j = 0; j < tableToken.header.length; j++) {
              cell += this.renderer.tablecell(this.parseInline(tableToken.header[j].tokens), { header: true, align: tableToken.align[j] });
            }
            header += this.renderer.tablerow(cell);
            let body = "";
            for (let j = 0; j < tableToken.rows.length; j++) {
              const row = tableToken.rows[j];
              cell = "";
              for (let k = 0; k < row.length; k++) {
                cell += this.renderer.tablecell(this.parseInline(row[k].tokens), { header: false, align: tableToken.align[k] });
              }
              body += this.renderer.tablerow(cell);
            }
            out += this.renderer.table(header, body);
            continue;
          }
          case "blockquote": {
            const blockquoteToken = token;
            const body = this.parse(blockquoteToken.tokens);
            out += this.renderer.blockquote(body);
            continue;
          }
          case "list": {
            const listToken = token;
            const ordered = listToken.ordered;
            const start = listToken.start;
            const loose = listToken.loose;
            let body = "";
            for (let j = 0; j < listToken.items.length; j++) {
              const item = listToken.items[j];
              const checked = item.checked;
              const task = item.task;
              let itemBody = "";
              if (item.task) {
                const checkbox = this.renderer.checkbox(!!checked);
                if (loose) {
                  if (item.tokens.length > 0 && item.tokens[0].type === "paragraph") {
                    item.tokens[0].text = checkbox + " " + item.tokens[0].text;
                    if (item.tokens[0].tokens && item.tokens[0].tokens.length > 0 && item.tokens[0].tokens[0].type === "text") {
                      item.tokens[0].tokens[0].text = checkbox + " " + item.tokens[0].tokens[0].text;
                    }
                  } else {
                    item.tokens.unshift({
                      type: "text",
                      text: checkbox + " "
                    });
                  }
                } else {
                  itemBody += checkbox + " ";
                }
              }
              itemBody += this.parse(item.tokens, loose);
              body += this.renderer.listitem(itemBody, task, !!checked);
            }
            out += this.renderer.list(body, ordered, start);
            continue;
          }
          case "html": {
            const htmlToken = token;
            out += this.renderer.html(htmlToken.text, htmlToken.block);
            continue;
          }
          case "paragraph": {
            const paragraphToken = token;
            out += this.renderer.paragraph(this.parseInline(paragraphToken.tokens));
            continue;
          }
          case "text": {
            let textToken = token;
            let body = textToken.tokens ? this.parseInline(textToken.tokens) : textToken.text;
            while (i + 1 < tokens.length && tokens[i + 1].type === "text") {
              textToken = tokens[++i];
              body += "\n" + (textToken.tokens ? this.parseInline(textToken.tokens) : textToken.text);
            }
            out += top ? this.renderer.paragraph(body) : body;
            continue;
          }
          default: {
            const errMsg = 'Token with "' + token.type + '" type was not found.';
            if (this.options.silent) {
              console.error(errMsg);
              return "";
            } else {
              throw new Error(errMsg);
            }
          }
        }
      }
      return out;
    }
    /**
     * Parse Inline Tokens
     */
    parseInline(tokens, renderer) {
      renderer = renderer || this.renderer;
      let out = "";
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (this.options.extensions && this.options.extensions.renderers && this.options.extensions.renderers[token.type]) {
          const ret = this.options.extensions.renderers[token.type].call({ parser: this }, token);
          if (ret !== false || !["escape", "html", "link", "image", "strong", "em", "codespan", "br", "del", "text"].includes(token.type)) {
            out += ret || "";
            continue;
          }
        }
        switch (token.type) {
          case "escape": {
            const escapeToken = token;
            out += renderer.text(escapeToken.text);
            break;
          }
          case "html": {
            const tagToken = token;
            out += renderer.html(tagToken.text);
            break;
          }
          case "link": {
            const linkToken = token;
            out += renderer.link(linkToken.href, linkToken.title, this.parseInline(linkToken.tokens, renderer));
            break;
          }
          case "image": {
            const imageToken = token;
            out += renderer.image(imageToken.href, imageToken.title, imageToken.text);
            break;
          }
          case "strong": {
            const strongToken = token;
            out += renderer.strong(this.parseInline(strongToken.tokens, renderer));
            break;
          }
          case "em": {
            const emToken = token;
            out += renderer.em(this.parseInline(emToken.tokens, renderer));
            break;
          }
          case "codespan": {
            const codespanToken = token;
            out += renderer.codespan(codespanToken.text);
            break;
          }
          case "br": {
            out += renderer.br();
            break;
          }
          case "del": {
            const delToken = token;
            out += renderer.del(this.parseInline(delToken.tokens, renderer));
            break;
          }
          case "text": {
            const textToken = token;
            out += renderer.text(textToken.text);
            break;
          }
          default: {
            const errMsg = 'Token with "' + token.type + '" type was not found.';
            if (this.options.silent) {
              console.error(errMsg);
              return "";
            } else {
              throw new Error(errMsg);
            }
          }
        }
      }
      return out;
    }
  };
  var _Hooks = class {
    options;
    constructor(options2) {
      this.options = options2 || _defaults;
    }
    static passThroughHooks = /* @__PURE__ */ new Set([
      "preprocess",
      "postprocess",
      "processAllTokens"
    ]);
    /**
     * Process markdown before marked
     */
    preprocess(markdown) {
      return markdown;
    }
    /**
     * Process HTML after marked is finished
     */
    postprocess(html2) {
      return html2;
    }
    /**
     * Process all tokens before walk tokens
     */
    processAllTokens(tokens) {
      return tokens;
    }
  };
  var Marked = class {
    defaults = _getDefaults();
    options = this.setOptions;
    parse = this.#parseMarkdown(_Lexer.lex, _Parser.parse);
    parseInline = this.#parseMarkdown(_Lexer.lexInline, _Parser.parseInline);
    Parser = _Parser;
    Renderer = _Renderer;
    TextRenderer = _TextRenderer;
    Lexer = _Lexer;
    Tokenizer = _Tokenizer;
    Hooks = _Hooks;
    constructor(...args) {
      this.use(...args);
    }
    /**
     * Run callback for every token
     */
    walkTokens(tokens, callback) {
      var _a, _b;
      let values = [];
      for (const token of tokens) {
        values = values.concat(callback.call(this, token));
        switch (token.type) {
          case "table": {
            const tableToken = token;
            for (const cell of tableToken.header) {
              values = values.concat(this.walkTokens(cell.tokens, callback));
            }
            for (const row of tableToken.rows) {
              for (const cell of row) {
                values = values.concat(this.walkTokens(cell.tokens, callback));
              }
            }
            break;
          }
          case "list": {
            const listToken = token;
            values = values.concat(this.walkTokens(listToken.items, callback));
            break;
          }
          default: {
            const genericToken = token;
            if ((_b = (_a = this.defaults.extensions) == null ? void 0 : _a.childTokens) == null ? void 0 : _b[genericToken.type]) {
              this.defaults.extensions.childTokens[genericToken.type].forEach((childTokens) => {
                const tokens2 = genericToken[childTokens].flat(Infinity);
                values = values.concat(this.walkTokens(tokens2, callback));
              });
            } else if (genericToken.tokens) {
              values = values.concat(this.walkTokens(genericToken.tokens, callback));
            }
          }
        }
      }
      return values;
    }
    use(...args) {
      const extensions = this.defaults.extensions || { renderers: {}, childTokens: {} };
      args.forEach((pack) => {
        const opts = { ...pack };
        opts.async = this.defaults.async || opts.async || false;
        if (pack.extensions) {
          pack.extensions.forEach((ext) => {
            if (!ext.name) {
              throw new Error("extension name required");
            }
            if ("renderer" in ext) {
              const prevRenderer = extensions.renderers[ext.name];
              if (prevRenderer) {
                extensions.renderers[ext.name] = function(...args2) {
                  let ret = ext.renderer.apply(this, args2);
                  if (ret === false) {
                    ret = prevRenderer.apply(this, args2);
                  }
                  return ret;
                };
              } else {
                extensions.renderers[ext.name] = ext.renderer;
              }
            }
            if ("tokenizer" in ext) {
              if (!ext.level || ext.level !== "block" && ext.level !== "inline") {
                throw new Error("extension level must be 'block' or 'inline'");
              }
              const extLevel = extensions[ext.level];
              if (extLevel) {
                extLevel.unshift(ext.tokenizer);
              } else {
                extensions[ext.level] = [ext.tokenizer];
              }
              if (ext.start) {
                if (ext.level === "block") {
                  if (extensions.startBlock) {
                    extensions.startBlock.push(ext.start);
                  } else {
                    extensions.startBlock = [ext.start];
                  }
                } else if (ext.level === "inline") {
                  if (extensions.startInline) {
                    extensions.startInline.push(ext.start);
                  } else {
                    extensions.startInline = [ext.start];
                  }
                }
              }
            }
            if ("childTokens" in ext && ext.childTokens) {
              extensions.childTokens[ext.name] = ext.childTokens;
            }
          });
          opts.extensions = extensions;
        }
        if (pack.renderer) {
          const renderer = this.defaults.renderer || new _Renderer(this.defaults);
          for (const prop in pack.renderer) {
            if (!(prop in renderer)) {
              throw new Error(`renderer '${prop}' does not exist`);
            }
            if (prop === "options") {
              continue;
            }
            const rendererProp = prop;
            const rendererFunc = pack.renderer[rendererProp];
            const prevRenderer = renderer[rendererProp];
            renderer[rendererProp] = (...args2) => {
              let ret = rendererFunc.apply(renderer, args2);
              if (ret === false) {
                ret = prevRenderer.apply(renderer, args2);
              }
              return ret || "";
            };
          }
          opts.renderer = renderer;
        }
        if (pack.tokenizer) {
          const tokenizer = this.defaults.tokenizer || new _Tokenizer(this.defaults);
          for (const prop in pack.tokenizer) {
            if (!(prop in tokenizer)) {
              throw new Error(`tokenizer '${prop}' does not exist`);
            }
            if (["options", "rules", "lexer"].includes(prop)) {
              continue;
            }
            const tokenizerProp = prop;
            const tokenizerFunc = pack.tokenizer[tokenizerProp];
            const prevTokenizer = tokenizer[tokenizerProp];
            tokenizer[tokenizerProp] = (...args2) => {
              let ret = tokenizerFunc.apply(tokenizer, args2);
              if (ret === false) {
                ret = prevTokenizer.apply(tokenizer, args2);
              }
              return ret;
            };
          }
          opts.tokenizer = tokenizer;
        }
        if (pack.hooks) {
          const hooks = this.defaults.hooks || new _Hooks();
          for (const prop in pack.hooks) {
            if (!(prop in hooks)) {
              throw new Error(`hook '${prop}' does not exist`);
            }
            if (prop === "options") {
              continue;
            }
            const hooksProp = prop;
            const hooksFunc = pack.hooks[hooksProp];
            const prevHook = hooks[hooksProp];
            if (_Hooks.passThroughHooks.has(prop)) {
              hooks[hooksProp] = (arg) => {
                if (this.defaults.async) {
                  return Promise.resolve(hooksFunc.call(hooks, arg)).then((ret2) => {
                    return prevHook.call(hooks, ret2);
                  });
                }
                const ret = hooksFunc.call(hooks, arg);
                return prevHook.call(hooks, ret);
              };
            } else {
              hooks[hooksProp] = (...args2) => {
                let ret = hooksFunc.apply(hooks, args2);
                if (ret === false) {
                  ret = prevHook.apply(hooks, args2);
                }
                return ret;
              };
            }
          }
          opts.hooks = hooks;
        }
        if (pack.walkTokens) {
          const walkTokens2 = this.defaults.walkTokens;
          const packWalktokens = pack.walkTokens;
          opts.walkTokens = function(token) {
            let values = [];
            values.push(packWalktokens.call(this, token));
            if (walkTokens2) {
              values = values.concat(walkTokens2.call(this, token));
            }
            return values;
          };
        }
        this.defaults = { ...this.defaults, ...opts };
      });
      return this;
    }
    setOptions(opt) {
      this.defaults = { ...this.defaults, ...opt };
      return this;
    }
    lexer(src, options2) {
      return _Lexer.lex(src, options2 ?? this.defaults);
    }
    parser(tokens, options2) {
      return _Parser.parse(tokens, options2 ?? this.defaults);
    }
    #parseMarkdown(lexer2, parser2) {
      return (src, options2) => {
        const origOpt = { ...options2 };
        const opt = { ...this.defaults, ...origOpt };
        if (this.defaults.async === true && origOpt.async === false) {
          if (!opt.silent) {
            console.warn("marked(): The async option was set to true by an extension. The async: false option sent to parse will be ignored.");
          }
          opt.async = true;
        }
        const throwError = this.#onError(!!opt.silent, !!opt.async);
        if (typeof src === "undefined" || src === null) {
          return throwError(new Error("marked(): input parameter is undefined or null"));
        }
        if (typeof src !== "string") {
          return throwError(new Error("marked(): input parameter is of type " + Object.prototype.toString.call(src) + ", string expected"));
        }
        if (opt.hooks) {
          opt.hooks.options = opt;
        }
        if (opt.async) {
          return Promise.resolve(opt.hooks ? opt.hooks.preprocess(src) : src).then((src2) => lexer2(src2, opt)).then((tokens) => opt.hooks ? opt.hooks.processAllTokens(tokens) : tokens).then((tokens) => opt.walkTokens ? Promise.all(this.walkTokens(tokens, opt.walkTokens)).then(() => tokens) : tokens).then((tokens) => parser2(tokens, opt)).then((html2) => opt.hooks ? opt.hooks.postprocess(html2) : html2).catch(throwError);
        }
        try {
          if (opt.hooks) {
            src = opt.hooks.preprocess(src);
          }
          let tokens = lexer2(src, opt);
          if (opt.hooks) {
            tokens = opt.hooks.processAllTokens(tokens);
          }
          if (opt.walkTokens) {
            this.walkTokens(tokens, opt.walkTokens);
          }
          let html2 = parser2(tokens, opt);
          if (opt.hooks) {
            html2 = opt.hooks.postprocess(html2);
          }
          return html2;
        } catch (e) {
          return throwError(e);
        }
      };
    }
    #onError(silent, async) {
      return (e) => {
        e.message += "\nPlease report this to https://github.com/markedjs/marked.";
        if (silent) {
          const msg = "<p>An error occurred:</p><pre>" + escape$1(e.message + "", true) + "</pre>";
          if (async) {
            return Promise.resolve(msg);
          }
          return msg;
        }
        if (async) {
          return Promise.reject(e);
        }
        throw e;
      };
    }
  };
  var markedInstance = new Marked();
  function marked(src, opt) {
    return markedInstance.parse(src, opt);
  }
  marked.options = marked.setOptions = function(options2) {
    markedInstance.setOptions(options2);
    marked.defaults = markedInstance.defaults;
    changeDefaults(marked.defaults);
    return marked;
  };
  marked.getDefaults = _getDefaults;
  marked.defaults = _defaults;
  marked.use = function(...args) {
    markedInstance.use(...args);
    marked.defaults = markedInstance.defaults;
    changeDefaults(marked.defaults);
    return marked;
  };
  marked.walkTokens = function(tokens, callback) {
    return markedInstance.walkTokens(tokens, callback);
  };
  marked.parseInline = markedInstance.parseInline;
  marked.Parser = _Parser;
  marked.parser = _Parser.parse;
  marked.Renderer = _Renderer;
  marked.TextRenderer = _TextRenderer;
  marked.Lexer = _Lexer;
  marked.lexer = _Lexer.lex;
  marked.Tokenizer = _Tokenizer;
  marked.Hooks = _Hooks;
  marked.parse = marked;
  var options = marked.options;
  var setOptions = marked.setOptions;
  var use = marked.use;
  var walkTokens = marked.walkTokens;
  var parseInline = marked.parseInline;
  var parser = _Parser.parse;
  var lexer = _Lexer.lex;

  // src/js/services/logService.js
  var LogService = class {
    constructor() {
      this.baseUrl = `${window.location.origin}/studio/services/studio/logs`;
      this.authCookie = null;
      this.openaiService = openaiService_default;
      this.logs = [];
      this.initialized = false;
      this.setupMessageListener();
    }
    setupMessageListener() {
      window.addEventListener("message", (event) => {
        if (event.data.type === "SURFBOARD_NETWORK_ERROR") {
          this.addLog(event.data.error);
        }
      });
    }
    injectNetworkMonitor() {
      const script = document.createElement("script");
      script.src = chrome.runtime.getURL("src/js/inject/networkMonitor.js");
      (document.head || document.documentElement).appendChild(script);
      script.onload = () => script.remove();
    }
    async initialize(apiKey, baseUrl = "", model = "") {
      if (this.initialized) {
        return;
      }
      this.initialized = true;
      try {
        const response = await chrome.runtime.sendMessage({ type: RUNTIME_MESSAGES.GET_AUTH_COOKIE });
        if (!response.cookie) {
          throw new Error("Authentication cookie not found");
        }
        this.authCookie = response.cookie;
        if (!apiKey) {
          throw new Error("LiteLLM API key is required");
        }
        await this.openaiService.configure({ apiKey, baseUrl, model });
      } catch (error) {
        console.error("Failed to initialize LogService:", error);
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
    async fetchLogs(type = "server", limit = 1e3) {
      try {
        if (!this.authCookie) {
          await this.initialize();
        }
        const url = `${this.baseUrl}/${type}/${limit}`;
        const response = await fetch(url, {
          method: "GET",
          credentials: "include",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Cookie": `auth_cookie=${this.authCookie}`
          }
        });
        if (!response.ok) {
          throw new Error(`Failed to fetch ${type} logs: ${response.statusText}`);
        }
        const data = await response.json();
        if (!data || !data.result) {
          console.warn("Invalid response format:", data);
          throw new Error("Invalid response format from server");
        }
        const sections = await this.parseLogs(data, type);
        return sections;
      } catch (error) {
        console.error("Error in fetchLogs:", error);
        throw error;
      }
    }
    async parseLogs(rawLogs, type = "server") {
      try {
        if (!rawLogs || typeof rawLogs !== "object") {
          console.warn("Invalid logs response:", rawLogs);
          return [];
        }
        if (rawLogs.result) {
          const logLines = rawLogs.result.split("\n").filter((line) => line.trim());
          let currentLog = null;
          const parsedLogs = [];
          const serverLogPattern = /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2},\d{3})\s+(\S+)\s+(\w+)\s+(\S+)\s+(\S+)\s+\[([^\]]+)\](?:\s*-\s*(.+))?$/;
          const appLogPattern = /^(\d{2}\s+\w+\s+\d{4}\s+\d{2}:\d{2}:\d{2},\d{3})\s+(-[^\s]*)\s+(-[^\s]*)\s+(\S+)\s+(\w+)\s+\[([^\]]+)\](?:\s*-\s*(.+))?$/;
          for (const line of logLines) {
            const pattern = type === "server" ? serverLogPattern : appLogPattern;
            const mainLogMatch = line.match(pattern);
            if (mainLogMatch) {
              if (currentLog && currentLog.stackTrace && currentLog.stackTrace.length > 0) {
                parsedLogs.push(currentLog);
              }
              if (type === "server") {
                const [, timestamp, thread, level, requestId, projectPath, component, message] = mainLogMatch;
                currentLog = {
                  timestamp,
                  timeSection: timestamp.slice(0, -4),
                  // Remove milliseconds for grouping
                  projectPath,
                  appId: "",
                  thread,
                  severity: this.getSeverity({ level, message: message || "" }),
                  component,
                  message: message || "",
                  stackTrace: []
                };
                if (message && message.includes("Error occurred while serving the request")) {
                  currentLog.severity = "error";
                  continue;
                }
              } else {
                let [, timestamp, projectPath, appId, thread, level, component, message] = mainLogMatch;
                if (!timestamp) {
                  timestamp = (/* @__PURE__ */ new Date()).toISOString();
                }
                if (!message && mainLogMatch[0]) {
                  message = mainLogMatch[0];
                }
                const date = new Date(timestamp);
                const isoTimestamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${timestamp.split(" ").pop()}`;
                currentLog = {
                  timestamp: isoTimestamp,
                  timeSection: isoTimestamp.slice(0, -4),
                  projectPath: projectPath && projectPath.startsWith("-") ? projectPath.slice(1) : projectPath,
                  appId: appId && appId.startsWith("-") ? appId.slice(1) : appId,
                  thread,
                  severity: this.getSeverity({ level, message: message || "" }),
                  component,
                  message: message || "",
                  stackTrace: []
                };
              }
              if (!currentLog.message.includes("Exception:") && !currentLog.message.includes("Error:") && !currentLog.message.startsWith("Caused by:")) {
                parsedLogs.push(currentLog);
              }
            } else if (currentLog) {
              const line_trimmed = line.trim();
              if (line_trimmed.startsWith("com.wavemaker.studio.core.compiler.JavaCompilationErrorsException")) {
                currentLog.message = line_trimmed;
                currentLog.severity = "error";
                currentLog.stackTrace = [line_trimmed];
              } else if (line_trimmed.startsWith('[{"filename"')) {
                if (currentLog.stackTrace) {
                  currentLog.stackTrace.push(line_trimmed);
                }
              } else if (line_trimmed.startsWith("at ")) {
                if (currentLog.stackTrace) {
                  currentLog.stackTrace.push(line_trimmed);
                }
              }
              if (line_trimmed.startsWith("Caused by:") || line_trimmed.includes("Exception:") || line_trimmed.includes("Error:")) {
                if (!currentLog.message) {
                  currentLog.message = line_trimmed;
                } else {
                  currentLog.stackTrace = currentLog.stackTrace || [];
                  currentLog.stackTrace.push(line_trimmed);
                }
              }
            } else {
              if (line.includes("\n")) {
                const lines = line.split("\n");
                const message = lines[0];
                const jsonLine = lines.find((line2) => line2.trim().startsWith("[{"));
                const stackLines = lines.filter((line2) => line2.trim().startsWith("at "));
                if (jsonLine) {
                  stackTrace = [
                    message,
                    jsonLine,
                    ...stackLines
                  ];
                } else {
                  stackTrace = lines.filter((line2) => line2.trim());
                }
                currentLog = {
                  timestamp: "",
                  timeSection: "",
                  projectPath: "",
                  appId: "",
                  thread: "",
                  severity: "error",
                  component: "",
                  message: message || "",
                  stackTrace
                };
              } else {
                currentLog = {
                  timestamp: "",
                  timeSection: "",
                  projectPath: "",
                  appId: "",
                  thread: "",
                  severity: "error",
                  component: "",
                  message: line || "",
                  stackTrace: []
                };
              }
              parsedLogs.push(currentLog);
            }
          }
          if (currentLog && currentLog.stackTrace && currentLog.stackTrace.length > 0) {
            parsedLogs.push(currentLog);
          }
          const filteredLogs = parsedLogs.filter((log) => ["warn", "error", "debug"].includes(log.severity));
          const groupedLogs = filteredLogs.reduce((groups, log) => {
            const group = groups[log.timeSection] || [];
            group.push(log);
            groups[log.timeSection] = group;
            return groups;
          }, {});
          const sections = Object.entries(groupedLogs).map(([timeSection, logs]) => ({
            timeSection,
            logs: logs.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
          })).sort((a, b) => b.timeSection.localeCompare(a.timeSection));
          return sections;
        }
        console.warn("Unexpected logs format:", rawLogs);
        return [];
      } catch (error) {
        console.error("Error parsing logs:", error);
        throw error;
      }
    }
    getSeverity(log) {
      const level = (log.level || "").toLowerCase();
      if (["error", "warn", "debug", "info"].includes(level))
        return level;
      const message = (log.message || "").toLowerCase();
      if (message.includes("error") || message.includes("exception") || message.includes("fail")) {
        return "error";
      } else if (message.includes("warn"))
        return "warn";
      else if (message.includes("debug"))
        return "debug";
      return "info";
    }
    async analyzeBatch(logSections, isConsole = false) {
      try {
        console.log("Starting batch analysis:", logSections);
        console.log("Inside analyzeBatch:");
        let logsForAnalysis;
        if (!isConsole) {
          let section = logSections[0];
          logsForAnalysis = section.logs.map((log) => ({
            timestamp: log.timestamp,
            severity: log.severity,
            component: log.component,
            message: log.message,
            stackTrace: log.stackTrace,
            ...log.requestId && { requestId: log.requestId },
            ...log.projectPath && { projectPath: log.projectPath },
            ...log.appId && { appId: log.appId },
            thread: log.thread
          }));
          if (logsForAnalysis.length === 0) {
            return "No logs available for analysis.";
          }
          logsForAnalysis.sort((a, b) => {
            const severityOrder = { error: 3, warn: 2, debug: 1, info: 0 };
            const severityDiff = (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
            if (severityDiff !== 0)
              return severityDiff;
            return b.timestamp.localeCompare(a.timestamp);
          });
          const errorLogs = logsForAnalysis.filter((log) => log.severity === "error").slice(0, 10);
          const warnLogs = logsForAnalysis.filter((log) => log.severity === "warn").slice(0, 5);
          const otherLogs = logsForAnalysis.filter((log) => !["error", "warn"].includes(log.severity)).slice(0, 5);
          logsForAnalysis = [...errorLogs, ...warnLogs, ...otherLogs];
          logsForAnalysis = logsForAnalysis.map((log) => ({
            ...log,
            stackTrace: log.stackTrace.length > 10 ? [...log.stackTrace.slice(0, 8), "... truncated ...", log.stackTrace[log.stackTrace.length - 1]] : log.stackTrace
          }));
        } else {
          logsForAnalysis = logSections[0];
        }
        const prompt = `Analyze these logs and provide a VERY concise, human-friendly explanation:
            What's the problem and posible root cause: (1 short sentence)
            Where is it: (file and line number)
            How to fix it: (concise and actionable steps)

        Keep it extremely simple - imagine explaining to someone who's not technical.

        ${JSON.stringify(logsForAnalysis, null, 2)}`;
        const aiAnalysis = await this.openaiService.analyzeLogs(prompt);
        console.log("Received analysis from OpenAI:", aiAnalysis);
        const cleanedAnalysis = aiAnalysis.trim().replace(/\r\n|\n/g, "\n");
        const htmlResponse = marked(cleanedAnalysis);
        console.log("htmlResponse:", htmlResponse);
        return htmlResponse;
      } catch (error) {
        console.error("Error in batch analysis:", error);
        throw error;
      }
    }
    addLog(log) {
      var _a, _b, _c, _d, _e, _f;
      if (log.source === "network" && (((_b = (_a = log.details) == null ? void 0 : _a.url) == null ? void 0 : _b.includes("localhost:4000")) || ((_d = (_c = log.details) == null ? void 0 : _c.url) == null ? void 0 : _d.includes("/chat/completions")) || ((_f = (_e = log.details) == null ? void 0 : _e.url) == null ? void 0 : _f.includes("127.0.0.1")))) {
        return;
      }
      this.logs.push(log);
      if (log.severity === "ERROR" || log.severity === "WARN") {
        if (this.logs.length > 0)
          this.analyzeBatch(this.logs, true);
      }
    }
  };

  // src/js/ui/logPanel.js
  var LogPanel = class {
    constructor() {
      this.logService = new LogService();
      this.element = document.createElement("div");
      this.element.className = "log-panel";
      this.currentLogType = "server";
      this.createHeader();
      this.createContent();
      this.createAnalysisPanel();
      this.setupEventListeners();
      this.initializeService();
    }
    async initializeService() {
      try {
        const { apiKey, baseUrl, model } = await this.getLiteLLMConfig();
        if (!apiKey) {
          console.warn("LiteLLM API key not found");
          this.showError("LiteLLM API key not configured. AI analysis will not be available.");
          return;
        }
        await this.logService.initialize(apiKey, baseUrl, model);
        await this.refreshLogs();
      } catch (error) {
        console.error("Error initializing LogService:", error);
        this.showError("Failed to initialize log service: " + error.message);
      }
    }
    async getLiteLLMConfig() {
      return new Promise((resolve) => {
        chrome.storage.sync.get(["litellmApiKey", "litellmBaseUrl", "litellmLogModel"], (result) => {
          resolve({
            apiKey: result.litellmApiKey,
            baseUrl: result.litellmBaseUrl,
            model: result.litellmLogModel
          });
        });
      });
    }
    createHeader() {
      const header = document.createElement("div");
      header.className = "log-header";
      const typeSelector = document.createElement("select");
      typeSelector.className = "log-type-selector";
      ["application", "server"].forEach((type) => {
        const option = document.createElement("option");
        option.value = type;
        option.textContent = `${type.charAt(0).toUpperCase() + type.slice(1)}`;
        typeSelector.appendChild(option);
      });
      const analyzeButton = document.createElement("button");
      analyzeButton.className = "analyze-button";
      analyzeButton.innerHTML = "\u{1F50D} Analyze";
      header.appendChild(typeSelector);
      header.appendChild(analyzeButton);
      this.element.appendChild(header);
    }
    createContent() {
      const content = document.createElement("div");
      content.className = "log-content";
      this.logsContainer = document.createElement("div");
      this.logsContainer.className = "logs-container";
      this.logsContainer.innerHTML = '<div class="log-entry info"><span class="log-timestamp">Now</span><span class="log-thread"></span><span class="log-message">Initializing log panel...</span></div>';
      content.appendChild(this.logsContainer);
      this.element.appendChild(content);
    }
    createAnalysisPanel() {
      this.analysisContainer = document.createElement("div");
      this.analysisContainer.className = "analysis-panel";
      this.analysisContainer.style.display = "none";
      this.analysisContainer.innerHTML = "<h3>Log Analysis</h3>";
      this.element.appendChild(this.analysisContainer);
    }
    setupEventListeners() {
      const typeSelector = this.element.querySelector(".log-type-selector");
      typeSelector.addEventListener("change", (e) => {
        this.currentLogType = e.target.value;
        this.refreshLogs();
      });
      const analyzeButton = this.element.querySelector(".analyze-button");
      analyzeButton.addEventListener("click", () => this.analyzeLogs());
    }
    async fetchLogs(type) {
      try {
        const logs = await this.logService.fetchLogs(type);
      } catch (error) {
        this.showError(error.message);
      }
    }
    async refreshLogs() {
      try {
        const logs = await this.logService.fetchLogs(this.currentLogType);
        if (!logs || !Array.isArray(logs)) {
          console.warn("Invalid logs format:", logs);
          throw new Error("Invalid logs format received");
        }
        if (logs.length === 0) {
          console.warn("No logs received");
          logContent.innerHTML = '<div class="no-logs">No logs available</div>';
          return;
        }
        this.analyzeLogs(this.currentLogType);
      } catch (error) {
        console.error("Error refreshing logs:", error);
        this.showError("Failed to fetch logs: " + error.message);
      } finally {
        const loadingIndicator = this.element.querySelector(".loading-indicator");
        if (loadingIndicator) {
          loadingIndicator.style.display = "none";
        }
      }
    }
    async analyzeLogs(type = this.currentLogType) {
      try {
        const analysisButton = this.element.querySelector(".analyze-button");
        analysisButton.disabled = true;
        analysisButton.textContent = "Analyzing...";
        const logContent2 = this.element.querySelector(".log-content");
        let logSections = [];
        try {
          logSections = await this.logService.fetchLogs(type);
        } catch (error) {
          this.showError(error.message);
        }
        const analysis = await this.logService.analyzeBatch(logSections);
        this.showAnalysis(analysis);
      } catch (error) {
        console.error("Error analyzing logs:", error);
        this.showError("Failed to analyze logs: " + error.message);
      } finally {
        const analysisButton = this.element.querySelector(".analyze-button");
        analysisButton.disabled = false;
        analysisButton.textContent = "\u{1F50D} Analyze";
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
      return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
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
      this.analysisContainer.style.display = "none";
    }
    showError(message) {
      const errorDiv = document.createElement("div");
      errorDiv.className = "log-entry error";
      errorDiv.innerHTML = `<span class="log-message">${message}</span>`;
      this.logsContainer.insertBefore(errorDiv, this.logsContainer.firstChild);
    }
    showAnalysis(analysis) {
      const analysisPanel = this.element.querySelector(".analysis-panel");
      if (!analysisPanel) {
        console.error("Analysis panel not found");
        return;
      }
      analysisPanel.innerHTML = "";
      const content = document.createElement("div");
      content.className = "analysis-content";
      content.innerHTML = `<pre>${analysis}</pre>`;
      analysisPanel.appendChild(content);
      analysisPanel.style.display = "block";
    }
    setLogType(type) {
      const typeSelector = this.element.querySelector(".log-type-selector");
      if (typeSelector) {
        typeSelector.value = type;
        typeSelector.dispatchEvent(new Event("change"));
      }
      this.currentLogType = type;
    }
  };
  var logPanel_default = LogPanel;

  // src/js/services/searchService.js
  var SearchService = class {
    constructor() {
      this.fileCache = /* @__PURE__ */ new Map();
      this.projectId = null;
      this.baseUrl = `${window.location.origin}/studio/services/projects`;
      this.authCookie = null;
      this.initialize();
    }
    /**
     * Initialize the search service
     */
    async initialize() {
      try {
        const response = await chrome.runtime.sendMessage({ type: RUNTIME_MESSAGES.GET_AUTH_COOKIE });
        if (!response.cookie) {
          throw new Error("Authentication cookie not found");
        }
        this.authCookie = response.cookie;
      } catch (error) {
        console.error("Failed to initialize SearchService:", error);
        throw new Error("Failed to authenticate with WaveMaker");
      }
    }
    /**
     * Extract project ID from WaveMaker Studio URL
     */
    getProjectIdFromUrl() {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get("project-id");
    }
    /**
     * Get file content from WaveMaker API
     */
    async getFileContent(filename) {
      if (!this.authCookie) {
        await this.initialize();
      }
      if (this.fileCache.has(filename)) {
        return this.fileCache.get(filename);
      }
      const url = `${this.baseUrl}/${this.projectId}/resources/content/project/${filename}`;
      try {
        const response = await fetch(url, {
          method: "GET",
          credentials: "include",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Cookie": `auth_cookie=${this.authCookie}`
          }
        });
        if (!response.ok) {
          if (response.status === 401) {
            await this.initialize();
            return this.getFileContent(filename);
          }
          throw new Error(`Failed to fetch file: ${response.statusText}`);
        }
        const content = await response.text();
        this.fileCache.set(filename, content);
        return content;
      } catch (error) {
        console.error(`Error fetching ${filename}:`, error);
        throw error;
      }
    }
    /**
     * Search in current editor
     */
    async searchInCurrentEditor(query, options2 = {}) {
      return new Promise((resolve, reject) => {
        const messageHandler = (event) => {
          if (event.data.type === PAGE_MESSAGES.EDITOR_CONTENT_RESPONSE) {
            window.removeEventListener("message", messageHandler);
            if (event.data.error) {
              reject(new Error(event.data.error));
              return;
            }
            const { content, filename } = event.data;
            resolve(this.searchInContent(content, query, filename, options2));
          }
        };
        window.addEventListener("message", messageHandler);
        window.postMessage({ type: PAGE_MESSAGES.EDITOR_CONTENT_REQUEST }, "*");
        setTimeout(() => {
          window.removeEventListener("message", messageHandler);
          reject(new Error("Timeout waiting for editor content"));
        }, 5e3);
      });
    }
    /**
     * Search in content with various strategies
     */
    searchInContent(content, query, filename, options2 = {}) {
      const results = [];
      try {
        if (!options2.type || options2.type === "exact") {
          const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const regex = new RegExp(escapedQuery, "gi");
          let match;
          while ((match = regex.exec(content)) !== null) {
            results.push({
              type: "exact",
              filename,
              line: this.getLineNumber(content, match.index),
              match: match[0],
              context: this.getContext(content, match.index)
            });
          }
        }
        if (!options2.type || options2.type === "pattern") {
          const patterns = this.getSearchPatterns(query);
          patterns.forEach((pattern) => {
            try {
              const regex = new RegExp(pattern, "gi");
              let match;
              while ((match = regex.exec(content)) !== null) {
                results.push({
                  type: "pattern",
                  filename,
                  line: this.getLineNumber(content, match.index),
                  match: match[0],
                  context: this.getContext(content, match.index)
                });
              }
            } catch (error) {
              console.warn(`Invalid pattern ${pattern}:`, error);
            }
          });
        }
      } catch (error) {
        console.error("Search failed:", error);
        throw new Error("Failed to perform search: " + error.message);
      }
      return results;
    }
    /**
     * Get search patterns based on query type
     */
    getSearchPatterns(query) {
      const patterns = {
        // API patterns
        api: [
          "\\b(fetch|axios)\\s*\\(",
          "\\bapi\\b.*\\(",
          "\\bhttp[s]?:\\/\\/"
        ],
        // Function patterns
        function: [
          "function\\s+(\\w+)\\s*\\(",
          "(\\w+)\\s*:\\s*function\\s*\\(",
          "(\\w+)\\s*=\\s*\\([^)]*\\)\\s*=>"
        ],
        // Variable patterns
        variable: [
          "\\b(var|let|const)\\s+(\\w+)\\s*=",
          "\\bthis\\.(\\w+)\\s*="
        ],
        // WaveMaker specific patterns
        widget: [
          `\\[wm-type=['"]([^'"]+)['"]\\]`,
          `widget-id=['"]([^'"]+)['"]\\]`,
          "\\bwm\\.(\\w+)\\("
        ],
        // Service patterns
        service: [
          "\\.service\\b",
          "Service\\b.*\\{",
          "\\@Injectable"
        ]
      };
      const queryLower = query.toLowerCase();
      let selectedPatterns = [];
      if (queryLower.includes("api") || queryLower.includes("http")) {
        selectedPatterns.push(...patterns.api);
      }
      if (queryLower.includes("function")) {
        selectedPatterns.push(...patterns.function);
      }
      if (queryLower.includes("variable")) {
        selectedPatterns.push(...patterns.variable);
      }
      if (queryLower.includes("widget")) {
        selectedPatterns.push(...patterns.widget);
      }
      if (queryLower.includes("service")) {
        selectedPatterns.push(...patterns.service);
      }
      if (selectedPatterns.length === 0) {
        selectedPatterns = Object.values(patterns).flat();
      }
      return selectedPatterns;
    }
    /**
     * Get line number from content index
     */
    getLineNumber(content, index) {
      return content.substring(0, index).split("\n").length;
    }
    /**
     * Get surrounding context for a match
     */
    getContext(content, index, contextLines = 2) {
      const lines = content.split("\n");
      const lineNumber = this.getLineNumber(content, index);
      const start = Math.max(0, lineNumber - contextLines - 1);
      const end = Math.min(lines.length, lineNumber + contextLines);
      return lines.slice(start, end).join("\n");
    }
    /**
     * Clear file cache
     */
    clearCache(filename = null) {
      if (filename) {
        this.fileCache.delete(filename);
      } else {
        this.fileCache.clear();
      }
    }
  };
  var searchService_default = SearchService;
  var searchService = new SearchService();

  // src/js/ui/searchPanel.js
  var SearchPanel = class {
    constructor() {
      this.searchService = new searchService_default();
      this.container = document.createElement("div");
      this.container.className = "search-panel";
      this.searchInput = document.createElement("input");
      this.searchInput.type = "text";
      this.searchInput.placeholder = "Search code...";
      this.searchInput.className = "search-input";
      this.filterButtons = document.createElement("div");
      this.filterButtons.className = "filter-buttons";
      this.resultsContainer = document.createElement("div");
      this.resultsContainer.className = "search-results";
      const filterTypes = ["All", "Exact", "Pattern"];
      filterTypes.forEach((type) => {
        const button = document.createElement("button");
        button.textContent = type;
        button.className = "filter-button";
        if (type === "All")
          button.classList.add("active");
        button.onclick = () => {
          this.filterButtons.querySelectorAll("button").forEach((btn) => btn.classList.remove("active"));
          button.classList.add("active");
          this.filterResults(type);
        };
        this.filterButtons.appendChild(button);
      });
      this.container.appendChild(this.searchInput);
      this.container.appendChild(this.filterButtons);
      this.container.appendChild(this.resultsContainer);
      this.attachEventListeners();
    }
    /**
     * Initialize the search panel
     */
    initialize() {
      this.createPanel();
      this.searchService.initialize();
    }
    /**
     * Create the search panel UI
     */
    createPanel() {
      const searchBox = document.createElement("div");
      searchBox.className = "search-box";
      this.searchInput = document.createElement("input");
      this.searchInput.type = "text";
      this.searchInput.placeholder = 'Search code (e.g., "find API calls" or "show variables")';
      const searchButton = document.createElement("button");
      searchButton.textContent = "Search";
      searchButton.onclick = () => this.handleSearch();
      searchBox.appendChild(this.searchInput);
      searchBox.appendChild(searchButton);
      this.filterButtons = document.createElement("div");
      this.filterButtons.className = "filter-buttons";
      const filters = ["All", "API", "Functions", "Variables", "Widgets", "Services"];
      filters.forEach((filter) => {
        const button = document.createElement("button");
        button.textContent = filter;
        button.onclick = () => this.filterResults(filter);
        this.filterButtons.appendChild(button);
      });
      this.resultsContainer = document.createElement("div");
      this.resultsContainer.className = "search-results";
      this.container.appendChild(searchBox);
      this.container.appendChild(this.filterButtons);
      this.container.appendChild(this.resultsContainer);
    }
    /**
     * Display search results
     */
    displayResults(results) {
      this.resultsContainer.innerHTML = "";
      if (!results || results.length === 0) {
        const noResults = document.createElement("div");
        noResults.className = "no-results";
        noResults.textContent = "No results found";
        this.resultsContainer.appendChild(noResults);
        return;
      }
      results.forEach((result) => {
        const resultCard = this.createResultCard(result);
        this.resultsContainer.appendChild(resultCard);
      });
    }
    /**
     * Create a search result card
     */
    createResultCard(result) {
      const resultCard = document.createElement("div");
      resultCard.className = "search-result-card";
      resultCard.dataset.type = result.type || "exact";
      const header = document.createElement("div");
      header.className = "result-header";
      const filename = document.createElement("span");
      filename.className = "result-filename";
      filename.textContent = result.filename;
      const line = document.createElement("span");
      line.className = "result-line";
      line.textContent = `Line ${result.line}`;
      const type = document.createElement("span");
      type.className = "result-type";
      type.textContent = result.type || "exact";
      header.appendChild(filename);
      header.appendChild(line);
      header.appendChild(type);
      const content = document.createElement("div");
      content.className = "result-content";
      content.innerHTML = this.highlightCode(result.context, result.match);
      resultCard.appendChild(header);
      resultCard.appendChild(content);
      resultCard.onclick = () => this.navigateToResult(result);
      return resultCard;
    }
    /**
     * Handle search execution
     */
    async handleSearch() {
      const query = this.searchInput.value.trim();
      if (!query) {
        this.showError("Please enter a search query");
        return;
      }
      try {
        this.showLoading();
        const results = await this.searchService.searchInCurrentEditor(query);
        this.displayResults(results);
      } catch (error) {
        console.error("Search failed:", error);
        this.showError("Search failed: " + (error.message || "Unknown error"));
      }
    }
    /**
     * Highlight code in search results
     */
    highlightCode(context, match) {
      try {
        const escapedMatch = match.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return context.replace(
          new RegExp(escapedMatch, "g"),
          `<span class="highlight">${match}</span>`
        );
      } catch (error) {
        console.warn("Failed to highlight code:", error);
        return context;
      }
    }
    /**
     * Navigate to a search result
     */
    navigateToResult(result) {
      if (!result || !result.filename) {
        console.error("Invalid search result:", result);
        return;
      }
      window.postMessage({
        type: PAGE_MESSAGES.NAVIGATE_TO_FILE,
        data: {
          filename: result.filename,
          line: result.line,
          column: 0
        }
      }, "*");
    }
    /**
     * Filter results by type
     */
    filterResults(filter) {
      if (!filter)
        return;
      const cards = this.resultsContainer.querySelectorAll(".search-result-card");
      cards.forEach((card) => {
        const type = card.dataset.type;
        if (filter.toLowerCase() === "all" || type === filter.toLowerCase()) {
          card.style.display = "block";
        } else {
          card.style.display = "none";
        }
      });
    }
    /**
     * Attach event listeners
     */
    attachEventListeners() {
      this.searchInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
          this.handleSearch();
        }
      });
      document.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "k") {
          e.preventDefault();
          this.searchInput.focus();
        }
      });
    }
    showLoading() {
      this.resultsContainer.innerHTML = '<div class="loading">Searching... <div class="spinner"></div></div>';
    }
    showError(message) {
      this.resultsContainer.innerHTML = `<div class="error">${message}</div>`;
    }
    displayError(message) {
      this.resultsContainer.innerHTML = `
            <div class="error-message">
                <span class="error-icon">\u26A0\uFE0F</span>
                <span class="error-text">${message}</span>
            </div>
        `;
    }
  };
  var searchPanel_default = SearchPanel;

  // src/js/ui/sidebar.js
  var WaveMakerCopilotSidebar = class {
    constructor() {
      this.sidebarElement = null;
      this.chatContainer = null;
      this.isOpen = false;
      this.logPanel = null;
      this.searchPanel = null;
      this.observers = [];
      this.initialize();
      this.setupToastObserver();
    }
    initialize() {
      this.sidebarElement = document.createElement("div");
      this.sidebarElement.className = "wm-copilot-sidebar";
      this.sidebarElement.innerHTML = `
            <div class="sidebar-header">
                <h2><img src="https://wm-ps-igniters.s3.amazonaws.com/surfboard-2.0/surfboard-logo.png" alt="Send" style="width:30px;" /> Surfboard AI</h2>
                <div class="tab-buttons">              
                    <button class="tab-button" data-tab="logs" style="display: none;">Logs</button>
                    <button class="tab-button active" data-tab="chat" style="display: none;">Chat</button>
                    <!-- <button class="tab-button" data-tab="search">Search</button> -->
                </div>
                <button class="minimize-button">X</button>
            </div>
            <div class="sidebar-content">
                <div class="chat-container active"></div>
                <div class="search-container"></div>
                <div class="log-container"></div>
                <div class="context-panel"></div>
            </div>
            <div class="input-container">
                <textarea placeholder="Ask me anything..." rows="1"></textarea>
                <button class="send-button">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
                    </svg>
                </button>
            </div>
        `;
      this.chatContainer = this.sidebarElement.querySelector(".chat-container");
      document.body.appendChild(this.sidebarElement);
      this.setupEventListeners();
      this.createToggleButton();
    }
    async initializePanels() {
      const logContainer = this.sidebarElement.querySelector(".log-container");
      if (!this.logPanel && logContainer) {
        this.logPanel = new logPanel_default();
        logContainer.appendChild(this.logPanel.element);
      }
      const searchContainer = this.sidebarElement.querySelector(".search-container");
      if (!this.searchPanel && searchContainer) {
        this.searchPanel = new searchPanel_default();
        searchContainer.appendChild(this.searchPanel.container);
      }
    }
    createToggleButton() {
      const toggleButton = document.createElement("button");
      toggleButton.className = "sidebar-toggle";
      toggleButton.innerHTML = `
            <!-- <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg> -->
            <img src="https://wm-ps-igniters.s3.amazonaws.com/surfboard-2.0/surfboard-logo.png" alt="Send" class="send-icon" />

        `;
      document.body.appendChild(toggleButton);
      toggleButton.addEventListener("click", () => {
        this.toggleSidebar();
        toggleButton.classList.toggle("active");
      });
    }
    setupEventListeners() {
      const minimizeButton = this.sidebarElement.querySelector(".minimize-button");
      minimizeButton.addEventListener("click", () => this.toggleSidebar());
      const sendButton = this.sidebarElement.querySelector(".send-button");
      const textarea = this.sidebarElement.querySelector("textarea");
      const inputContainer = this.sidebarElement.querySelector(".input-container");
      const sendMessage = () => {
        const message = textarea.value.trim();
        if (message) {
          this.addMessage(message, "user");
          textarea.value = "";
          textarea.style.height = "auto";
          const event = new CustomEvent("surfboard-message", {
            detail: { message, type: "user" }
          });
          document.dispatchEvent(event);
        }
      };
      sendButton.addEventListener("click", sendMessage);
      textarea.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          sendMessage();
        }
      });
      textarea.addEventListener("input", () => {
        textarea.style.height = "auto";
        textarea.style.height = Math.min(textarea.scrollHeight, 200) + "px";
      });
      const tabButtons = this.sidebarElement.querySelectorAll(".tab-button");
      tabButtons.forEach((button) => {
        button.addEventListener("click", () => {
          tabButtons.forEach((btn) => btn.classList.remove("active"));
          this.sidebarElement.querySelectorAll(".sidebar-content > div").forEach((container2) => {
            container2.classList.remove("active");
          });
          button.classList.add("active");
          const tabName = button.getAttribute("data-tab");
          let containerClass = tabName === "logs" ? "log" : tabName;
          const container = this.sidebarElement.querySelector(`.${containerClass}-container`);
          if (container) {
            container.classList.add("active");
          }
          if (tabName === "chat") {
            inputContainer.style.display = "block";
          } else {
            inputContainer.style.display = "none";
          }
          if (tabName === "logs") {
            this.initializePanels();
          }
        });
      });
      document.addEventListener("keydown", (e) => {
        if (e.ctrlKey && e.key === "\\") {
          this.toggleSidebar();
        }
      });
    }
    setupToastObserver() {
      const createObserver = (target) => {
        const observer = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            if (mutation.type === "childList") {
              mutation.addedNodes.forEach((node) => {
                var _a, _b, _c, _d;
                if (node.nodeType === 1) {
                  if (((_a = node.classList) == null ? void 0 : _a.contains("toast")) && ((_b = node.classList) == null ? void 0 : _b.contains("toast-error"))) {
                    const messageElement = node.querySelector(".toast-message");
                    if (messageElement && !messageElement.ariaLabel) {
                      console.log("Error toast detected, opening sidebar and switching to logs");
                      this.openWithLogs("application");
                    }
                  } else if (((_c = node.classList) == null ? void 0 : _c.contains("ngx-toastr")) && ((_d = node.classList) == null ? void 0 : _d.contains("toast-error"))) {
                    const messageElement = node.querySelector(".toast-message");
                    if (messageElement && messageElement.textContent.trim().startsWith('{"headers":')) {
                      this.openWithLogs();
                    }
                  }
                }
              });
            }
          }
        });
        observer.observe(target, {
          childList: true,
          subtree: true
        });
        return observer;
      };
      const mainObserver = createObserver(document.body);
      this.observers = [mainObserver];
      const setupIframeObserver = () => {
        var _a;
        const iframe = document.querySelector("#app-view");
        if ((_a = iframe == null ? void 0 : iframe.contentDocument) == null ? void 0 : _a.body) {
          const iframeObserver = createObserver(iframe.contentDocument.body);
          this.observers.push(iframeObserver);
          return true;
        }
        return false;
      };
      if (!setupIframeObserver()) {
        const iframe = document.querySelector("#app-view");
        if (iframe) {
          iframe.addEventListener("load", () => {
            setupIframeObserver();
          }, { once: true });
        }
      }
    }
    async openWithLogs(logType = "application") {
      if (!this.isOpen) {
        this.toggleSidebar();
      }
      const logsTab = this.sidebarElement.querySelector('[data-tab="logs"]');
      if (logsTab) {
        await logsTab.click();
        if (this.logPanel) {
          this.logPanel.setLogType(logType);
        }
      }
    }
    /*setupSearchPanel() {
            // Initialize search panel first
            const searchContainer = this.sidebarElement.querySelector('.search-container');
            this.searchPanel = new SearchPanel();
            this.searchPanel.initialize(); // Initialize before accessing container
            searchContainer.appendChild(this.searchPanel.container);
    
            // Handle tab switching
            const tabButtons = this.sidebarElement.querySelectorAll('.tab-button');
            tabButtons.forEach(button => {
                button.addEventListener('click', () => {
                    // Update active tab button
                    tabButtons.forEach(btn => btn.classList.remove('active'));
                    button.classList.add('active');
    
                    // Show/hide containers
                    const tabName = button.dataset.tab;
                    const chatContainer = this.sidebarElement.querySelector('.chat-container');
                    const searchContainer = this.sidebarElement.querySelector('.search-container');
    
                    if (tabName === 'chat') {
                        chatContainer.classList.add('active');
                        searchContainer.classList.remove('active');
                    } else {
                        chatContainer.classList.remove('active');
                        searchContainer.classList.add('active');
                    }
                });
            });
        }*/
    toggleSidebar() {
      this.isOpen = !this.isOpen;
      this.sidebarElement.classList.toggle("open");
      const minimizeButton = this.sidebarElement.querySelector(".minimize-button");
      minimizeButton.textContent = this.isOpen ? "X" : "+";
    }
    addMessage(message, type) {
      const messageDiv = document.createElement("div");
      messageDiv.className = `chat-message ${type}`;
      if (type === "assistant") {
        messageDiv.innerHTML = this.processMarkdown(message);
      } else {
        messageDiv.textContent = message;
      }
      this.chatContainer.appendChild(messageDiv);
      this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    }
    processMarkdown(text) {
      text = text.replace(/```(\w+)?\n([\s\S]+?)\n```/g, (match, lang, code) => {
        const codeBlock = this.createCodeBlock(code.trim(), lang);
        const tempContainer = document.createElement("div");
        tempContainer.appendChild(codeBlock);
        return tempContainer.innerHTML;
      });
      text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
      return text;
    }
    createCodeBlock(code, language) {
      const codeBlock = document.createElement("div");
      codeBlock.className = "code-block";
      const header = document.createElement("div");
      header.className = "code-block-header";
      const languageLabel = document.createElement("span");
      languageLabel.className = "language-label";
      languageLabel.textContent = language || "text";
      const copyButton = document.createElement("button");
      copyButton.className = "copy-button";
      copyButton.type = "button";
      copyButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span>Copy</span>
        `;
      copyButton.onclick = function(e) {
        handleCopy(e);
      };
      copyButton.addEventListener("click", function(e) {
        handleCopy(e);
      });
      const handleCopy = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const span = copyButton.querySelector("span");
        try {
          await navigator.clipboard.writeText(code);
          copyButton.classList.add("copied");
          span.textContent = "Copied!";
        } catch (err) {
          console.error("Failed to copy:", err);
          copyButton.classList.add("error");
          span.textContent = "Error!";
        }
        setTimeout(() => {
          copyButton.classList.remove("copied", "error");
          span.textContent = "Copy";
        }, 2e3);
      };
      header.appendChild(languageLabel);
      header.appendChild(copyButton);
      codeBlock.appendChild(header);
      const codeContent = document.createElement("div");
      codeContent.className = "code-content";
      const preElement = document.createElement("pre");
      const codeElement = document.createElement("code");
      codeElement.className = `language-${language || "text"}`;
      if (window.Prism) {
        codeElement.innerHTML = Prism.highlight(
          code,
          Prism.languages[language] || Prism.languages.text,
          language || "text"
        );
      } else {
        codeElement.textContent = code;
      }
      preElement.appendChild(codeElement);
      codeContent.appendChild(preElement);
      codeBlock.appendChild(codeContent);
      return codeBlock;
    }
    showError(message) {
      const errorDiv = document.createElement("div");
      errorDiv.className = "error-message";
      errorDiv.textContent = message;
      this.sidebarElement.appendChild(errorDiv);
      setTimeout(() => {
        errorDiv.remove();
      }, 5e3);
    }
    updateContextPanel(context) {
      const panel = this.sidebarElement.querySelector(".context-panel");
      panel.innerHTML = `
            <div class="context-section">
                <h3>Current Context</h3>
                <div class="context-details">
                    ${this.formatContextDetails(context)}
                </div>
            </div>
        `;
    }
    formatContextDetails(context) {
      var _a, _b;
      if (!context)
        return "<p>No context available</p>";
      return `
            <div class="context-item">
                <strong>Page:</strong> ${((_a = context.activePage) == null ? void 0 : _a.name) || "N/A"}
            </div>
            <div class="context-item">
                <strong>Component:</strong> ${((_b = context.activeComponent) == null ? void 0 : _b.type) || "N/A"}
            </div>
            <div class="context-item">
                <strong>Last Updated:</strong> ${(/* @__PURE__ */ new Date()).toLocaleTimeString()}
            </div>
        `;
    }
    getChatContainer() {
      return this.sidebarElement.querySelector(".chat-container");
    }
    showLoading() {
      const loader = document.createElement("div");
      loader.className = "loading-spinner";
      this.sidebarElement.appendChild(loader);
    }
    hideLoading() {
      const loader = this.sidebarElement.querySelector(".loading-spinner");
      if (loader) {
        loader.remove();
      }
    }
    cleanup() {
      if (this.observers) {
        this.observers.forEach((observer) => observer.disconnect());
      }
    }
  };
  var sidebar_default = WaveMakerCopilotSidebar;

  // src/js/content.js
  var copilotInstance = null;
  var SurfboardAI = class {
    constructor() {
      this.apiKey = null;
      this.apiBaseUrl = normalizeLiteLLMBaseUrl();
      this.isEnabled = true;
      this.isInitialized = false;
      this.model = DEFAULT_LITELLM_CHAT_MODEL;
      this.sidebar = null;
      this.completionManager = null;
    }
    async initialize() {
      if (!this.isWaveMakerStudioPage()) {
        return;
      }
      try {
        const settings = await this.loadSettings();
        this.apiKey = settings.litellmApiKey || null;
        this.apiBaseUrl = normalizeLiteLLMBaseUrl(settings.litellmBaseUrl);
        this.model = settings.litellmChatModel || DEFAULT_LITELLM_CHAT_MODEL;
        this.isEnabled = settings.copilotEnabled !== false;
        this.sidebar = new sidebar_default();
        this.completionManager = new completionManager_default({ enabled: this.isEnabled });
        this.setupChatListener();
        this.setupRuntimeMessageListener();
        this.setupStorageListener();
        this.notifyReady();
        this.isInitialized = true;
        this.sidebar.addMessage(
          "Hello! I'm your Surfboard AI assistant.\n\n- I can answer WaveMaker questions\n- I can help with JS, HTML, and CSS\n- I can suggest page-aware code changes\n\nHow can I help?",
          "assistant"
        );
      } catch (error) {
        console.error("Failed to initialize SurfboardAI:", error);
      }
    }
    isWaveMakerStudioPage() {
      return isConfiguredStudioUrl(window.location.href);
    }
    async loadSettings() {
      return new Promise((resolve) => {
        chrome.storage.sync.get(
          ["copilotEnabled", "litellmApiKey", "litellmBaseUrl", "litellmChatModel"],
          (result) => resolve(result)
        );
      });
    }
    setupChatListener() {
      document.addEventListener("surfboard-message", async (event) => {
        var _a, _b, _c, _d, _e;
        if (!this.isEnabled) {
          (_a = this.sidebar) == null ? void 0 : _a.showError("Surfboard AI is disabled. Enable it from the extension popup.");
          return;
        }
        const { message, type } = event.detail || {};
        if (type !== "user") {
          return;
        }
        if (!this.apiKey) {
          (_b = this.sidebar) == null ? void 0 : _b.showError("LiteLLM API key not configured.");
          return;
        }
        try {
          this.sidebar.addMessage("Thinking...", "assistant");
          const reply = await this.fetchChatReply(message);
          if ((_d = (_c = this.sidebar) == null ? void 0 : _c.chatContainer) == null ? void 0 : _d.lastChild) {
            this.sidebar.chatContainer.lastChild.remove();
          }
          this.sidebar.addMessage(reply, "assistant");
        } catch (error) {
          console.error("Failed to process message:", error);
          (_e = this.sidebar) == null ? void 0 : _e.showError(error.message || "Failed to process your message.");
        }
      });
    }
    async fetchChatReply(message) {
      var _a, _b, _c;
      const requestBaseUrl = validateLiteLLMBaseUrlForRuntime(this.apiBaseUrl);
      const response = await chrome.runtime.sendMessage({
        type: RUNTIME_MESSAGES.LITELLM_CHAT_COMPLETIONS,
        data: {
          apiKey: this.apiKey,
          baseUrl: requestBaseUrl,
          body: {
            model: this.model,
            messages: [
              {
                role: "system",
                content: "You are Surfboard AI, a WaveMaker development assistant."
              },
              {
                role: "user",
                content: message
              }
            ],
            temperature: 0.4,
            max_tokens: 1500
          }
        }
      });
      if (!(response == null ? void 0 : response.success)) {
        throw new Error((response == null ? void 0 : response.error) || "Chat request failed");
      }
      return ((_c = (_b = (_a = response.data.choices) == null ? void 0 : _a[0]) == null ? void 0 : _b.message) == null ? void 0 : _c.content) || "No response received.";
    }
    setupRuntimeMessageListener() {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        var _a, _b, _c, _d, _e;
        switch (message == null ? void 0 : message.type) {
          case RUNTIME_MESSAGES.TOGGLE_COPILOT:
            if (this.isEnabled) {
              (_a = this.sidebar) == null ? void 0 : _a.toggleSidebar();
            }
            sendResponse({ success: true });
            return true;
          case RUNTIME_MESSAGES.COPILOT_STATUS_CHANGED:
            this.setEnabled(Boolean((_b = message.data) == null ? void 0 : _b.enabled));
            sendResponse({ success: true });
            return true;
          case RUNTIME_MESSAGES.API_KEYS_UPDATED:
            this.apiKey = ((_c = message.data) == null ? void 0 : _c.litellmApiKey) || null;
            this.apiBaseUrl = normalizeLiteLLMBaseUrl((_d = message.data) == null ? void 0 : _d.litellmBaseUrl);
            this.model = ((_e = message.data) == null ? void 0 : _e.litellmChatModel) || DEFAULT_LITELLM_CHAT_MODEL;
            sendResponse({ success: true });
            return true;
          default:
            return false;
        }
      });
    }
    setupStorageListener() {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "sync") {
          return;
        }
        if (changes.litellmApiKey) {
          this.apiKey = changes.litellmApiKey.newValue || null;
        }
        if (changes.litellmBaseUrl) {
          this.apiBaseUrl = normalizeLiteLLMBaseUrl(changes.litellmBaseUrl.newValue);
        }
        if (changes.litellmChatModel) {
          this.model = changes.litellmChatModel.newValue || DEFAULT_LITELLM_CHAT_MODEL;
        }
        if (changes.copilotEnabled) {
          this.setEnabled(Boolean(changes.copilotEnabled.newValue));
        }
      });
    }
    setEnabled(enabled) {
      var _a, _b;
      this.isEnabled = enabled;
      (_a = this.completionManager) == null ? void 0 : _a.setEnabled(enabled);
      if (!enabled && ((_b = this.sidebar) == null ? void 0 : _b.isOpen)) {
        this.sidebar.toggleSidebar();
      }
    }
    notifyReady() {
      chrome.runtime.sendMessage({ type: RUNTIME_MESSAGES.CONTENT_SCRIPT_READY }).catch(() => {
      });
    }
  };
  window.addEventListener("load", () => {
    copilotInstance = new SurfboardAI();
    copilotInstance.initialize();
  });
  var content_default = SurfboardAI;
})();
//# sourceMappingURL=bundle.js.map
