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
      const parser = new DOMParser();
      const doc = parser.parseFromString(markup, "text/html");
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
      const html = element.outerHTML;
      return {
        variables: [...new Set(html.match(this.bindingPatterns.variable) || [])],
        widgets: [...new Set(html.match(this.bindingPatterns.widget) || [])],
        direct: [...new Set(html.match(this.bindingPatterns.binding) || [])].map((b) => b.replace("bind:", ""))
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
      const tag = element.tagName.toLowerCase();
      if (!tag.startsWith("wm-"))
        return "other";
      const widgetType = tag.substring(3);
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

  // src/js/context/wmContext.js
  var WMContextManager = class {
    constructor() {
      this.parser = new wmParser_default();
      this.currentContext = {
        page: null,
        widgets: /* @__PURE__ */ new Map(),
        variables: /* @__PURE__ */ new Map(),
        bindings: /* @__PURE__ */ new Map(),
        activeWidget: null
      };
      this.observers = /* @__PURE__ */ new Set();
    }
    /**
     * Initialize context manager and start observing DOM changes
     */
    async initialize() {
      this.setupMutationObserver();
      await this.analyzeCurrentPage();
      console.log("Context Manager initialized");
    }
    /**
     * Set up mutation observer to track DOM changes
     */
    setupMutationObserver() {
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (this.isWaveMakerChange(mutation)) {
            this.handleDOMChange(mutation);
          }
        }
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "style", "data-*"]
      });
    }
    /**
     * Check if mutation is related to WaveMaker
     * @param {MutationRecord} mutation - DOM mutation record
     * @returns {boolean} True if WaveMaker-related change
     */
    isWaveMakerChange(mutation) {
      const target = mutation.target;
      return target.tagName && (target.tagName.toLowerCase().startsWith("wm-") || target.hasAttribute("widget-id") || target.classList.contains("wm-app"));
    }
    /**
     * Handle DOM changes
     * @param {MutationRecord} mutation - DOM mutation record
     */
    async handleDOMChange(mutation) {
      const target = mutation.target;
      if (target.tagName && target.tagName.toLowerCase().startsWith("wm-")) {
        const parsedElement = this.parser.parseElement(target);
        this.updateContext(parsedElement);
      }
    }
    /**
     * Update the current context with new element information
     * @param {Object} parsedElement - Parsed element data
     */
    updateContext(parsedElement) {
      if (!parsedElement)
        return;
      if (parsedElement.type === "widget" && parsedElement.id) {
        this.currentContext.widgets.set(parsedElement.id, parsedElement);
      }
      if (parsedElement.variables) {
        parsedElement.variables.forEach((variable) => {
          this.currentContext.variables.set(variable.name, variable);
        });
      }
      if (parsedElement.bindings) {
        parsedElement.bindings.forEach((binding) => {
          this.currentContext.bindings.set(binding.id, binding);
        });
      }
      if (document.activeElement === parsedElement.element) {
        this.currentContext.activeWidget = parsedElement;
      }
      this.notifyObservers({
        type: "contextUpdate",
        element: parsedElement
      });
    }
    /**
     * Analyze current page structure
     */
    async analyzeCurrentPage() {
      const pageElement = document.querySelector("wm-page");
      if (!pageElement)
        return;
      const pageStructure = this.parser.parseElement(pageElement);
      this.currentContext.page = {
        name: pageElement.getAttribute("name"),
        structure: pageStructure,
        timestamp: Date.now()
      };
      this.extractPageComponents(pageStructure);
    }
    /**
     * Extract and categorize page components
     * @param {Object} pageStructure - Parsed page structure
     */
    extractPageComponents(pageStructure) {
      const traverse = (node) => {
        if (node.name) {
          this.currentContext.widgets.set(node.name, {
            type: node.type,
            category: node.category,
            bindings: node.bindings,
            relationships: node.relationships
          });
          if (node.bindings.variables.length > 0) {
            node.bindings.variables.forEach((variable) => {
              if (!this.currentContext.variables.has(variable)) {
                this.currentContext.variables.set(variable, {
                  usedBy: /* @__PURE__ */ new Set([node.name]),
                  type: this.inferVariableType(variable)
                });
              } else {
                this.currentContext.variables.get(variable).usedBy.add(node.name);
              }
            });
          }
          node.bindings.direct.forEach((binding) => {
            this.currentContext.bindings.set(`${node.name}:${binding}`, {
              widget: node.name,
              expression: binding,
              dependencies: this.parser.extractDependencies(binding)
            });
          });
        }
        node.children.forEach(traverse);
      };
      traverse(pageStructure);
    }
    /**
     * Infer variable type from usage
     * @param {string} variable - Variable name
     * @returns {string} Inferred type
     */
    inferVariableType(variable) {
      if (variable.includes(".dataSet"))
        return "dataset";
      if (variable.startsWith("Variables.static"))
        return "static";
      if (variable.startsWith("Variables.sv"))
        return "service";
      return "unknown";
    }
    /**
     * Get relevant context for AI processing
     * @param {string} query - User query
     * @returns {Object} Relevant context
     */
    getRelevantContext(query) {
      const context = {
        activeWidget: this.currentContext.activeWidget,
        relevantWidgets: [],
        relevantVariables: [],
        relevantBindings: []
      };
      this.currentContext.widgets.forEach((widget, name) => {
        if (this.isRelevantToQuery(query, name, widget)) {
          context.relevantWidgets.push({
            name,
            ...widget
          });
        }
      });
      this.currentContext.variables.forEach((variable, name) => {
        if (this.isRelevantToQuery(query, name, variable)) {
          context.relevantVariables.push({
            name,
            ...variable
          });
        }
      });
      context.relevantBindings = this.findRelatedBindings(context.relevantWidgets);
      return context;
    }
    /**
     * Check if item is relevant to query
     * @param {string} query - User query
     * @param {string} name - Item name
     * @param {Object} item - Item details
     * @returns {boolean} True if relevant
     */
    isRelevantToQuery(query, name, item) {
      const queryTerms = query.toLowerCase().split(/\s+/);
      const itemTerms = name.toLowerCase().split(/[.-_]/);
      return queryTerms.some(
        (term) => {
          var _a, _b;
          return itemTerms.some((itemTerm) => itemTerm.includes(term)) || ((_a = item.type) == null ? void 0 : _a.toLowerCase().includes(term)) || ((_b = item.category) == null ? void 0 : _b.toLowerCase().includes(term));
        }
      );
    }
    /**
     * Find bindings related to widgets
     * @param {Array} widgets - Relevant widgets
     * @returns {Array} Related bindings
     */
    findRelatedBindings(widgets) {
      const bindings = [];
      const widgetNames = new Set(widgets.map((w) => w.name));
      this.currentContext.bindings.forEach((binding, key) => {
        if (widgetNames.has(binding.widget)) {
          bindings.push({
            key,
            ...binding
          });
        }
      });
      return bindings;
    }
    /**
     * Set active widget
     * @param {string} widgetName - Name of active widget
     */
    setActiveWidget(widgetName) {
      this.currentContext.activeWidget = this.currentContext.widgets.get(widgetName) || null;
      this.notifyObservers();
    }
    /**
     * Add context change observer
     * @param {Function} callback - Observer callback
     */
    addObserver(callback) {
      this.observers.add(callback);
    }
    /**
     * Remove context change observer
     * @param {Function} callback - Observer callback
     */
    removeObserver(callback) {
      this.observers.delete(callback);
    }
    /**
     * Notify observers of context changes
     */
    notifyObservers(change) {
      this.observers.forEach((callback) => {
        try {
          callback(this.currentContext, change);
        } catch (error) {
          console.error("Error in context observer:", error);
        }
      });
    }
  };
  var wmContext_default = WMContextManager;

  // src/js/services/openaiService.js
  var OpenAIService = class {
    constructor() {
      this.apiKey = null;
      this.baseURL = "https://api.openai.com/v1/chat/completions";
    }
    async setApiKey(key) {
      this.apiKey = key;
    }
    async analyzeLogs(logs) {
      if (!this.apiKey) {
        throw new Error("OpenAI API key not set");
      }
      const messages = [
        {
          role: "system",
          content: `You are a log analysis expert. Analyze the provided logs and:
                1. Identify any errors, warnings, or potential issues
                2. Suggest possible solutions or debugging steps
                3. Highlight any performance concerns
                4. Provide a brief summary of the system state
                Be concise and focus on actionable insights.`
        },
        {
          role: "user",
          content: `Please analyze these application logs:

${logs}`
        }
      ];
      try {
        const response = await fetch(this.baseURL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${this.apiKey}`
          },
          body: JSON.stringify({
            model: "gpt-3.5-turbo",
            messages,
            temperature: 0.3,
            max_tokens: 500
          })
        });
        if (!response.ok) {
          throw new Error(`OpenAI API error: ${response.statusText}`);
        }
        const data = await response.json();
        return data.choices[0].message.content;
      } catch (error) {
        console.error("Error analyzing logs:", error);
        throw error;
      }
    }
  };
  var openaiService_default = new OpenAIService();

  // src/js/services/logService.js
  var LogService = class {
    constructor() {
      this.baseUrl = "https://www.wavemakeronline.com/studio/services/studio/logs";
      this.authCookie = null;
      this.openaiService = openaiService_default;
    }
    async initialize(apiKey) {
      try {
        const response = await chrome.runtime.sendMessage({ type: "GET_AUTH_COOKIE" });
        if (!response.cookie) {
          throw new Error("Authentication cookie not found");
        }
        this.authCookie = response.cookie;
        if (!apiKey) {
          throw new Error("OpenAI API key is required");
        }
        await this.openaiService.setApiKey(apiKey);
        console.log("LogService initialized with auth cookie and API key");
      } catch (error) {
        console.error("Failed to initialize LogService:", error);
        throw error;
      }
    }
    async fetchLogs(type = "server", limit = 1e3) {
      try {
        console.log("Fetching logs of type:", type, "with limit:", limit);
        if (!this.authCookie) {
          console.log("No auth cookie found, initializing...");
          await this.initialize();
        }
        console.log("Using auth cookie:", this.authCookie ? "Present" : "Missing");
        const url = `${this.baseUrl}/${type}/${limit}`;
        console.log("Fetching logs from URL:", url);
        const response = await fetch(url, {
          method: "GET",
          credentials: "include",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Cookie": `auth_cookie=${this.authCookie}`
          }
        });
        console.log("Response status:", response.status);
        if (!response.ok) {
          throw new Error(`Failed to fetch ${type} logs: ${response.statusText}`);
        }
        const data = await response.json();
        console.log("Raw response data:", data);
        if (!data || !data.result) {
          console.warn("Invalid response format:", data);
          throw new Error("Invalid response format from server");
        }
        const sections = await this.parseLogs(data, type);
        console.log("Parsed log sections:", sections);
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
          console.log("Raw logs result:", rawLogs.result);
          const logLines = rawLogs.result.split("\n").filter((line) => line.trim());
          console.log("Filtered log lines:", logLines);
          let currentLog = null;
          const parsedLogs = [];
          const serverLogPattern = /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2},\d{3})\s+(\S+)\s+(\w+)\s+(\S+)\s+(\S+)\s+\[([^\]]+)\](?:\s*-\s*(.+))?$/;
          const appLogPattern = /^(\d{2}\s+\w+\s+\d{4}\s+\d{2}:\d{2}:\d{2},\d{3})\s+(-[^\s]*)\s+(-[^\s]*)\s+(\S+)\s+(\w+)\s+\[([^\]]+)\](?:\s*-\s*(.+))?$/;
          for (const line of logLines) {
            const pattern = type === "server" ? serverLogPattern : appLogPattern;
            const mainLogMatch = line.match(pattern);
            if (mainLogMatch) {
              if (currentLog && currentLog.stackTrace) {
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
              } else {
                const [, timestamp, projectPath, appId, thread, level, component, message] = mainLogMatch;
                const date = new Date(timestamp);
                const isoTimestamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${timestamp.split(" ").pop()}`;
                currentLog = {
                  timestamp: isoTimestamp,
                  timeSection: isoTimestamp.slice(0, -4),
                  projectPath: projectPath.startsWith("-") ? projectPath.slice(1) : projectPath,
                  appId: appId.startsWith("-") ? appId.slice(1) : appId,
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
            } else if (line.trim().startsWith("at ") || line.trim().startsWith("Caused by:") || line.includes("Exception:") || line.includes("Error:") || line.match(/^[\t\s]*\.\.\.\s+\d+\s+more$/) || line.includes(".java:")) {
              if (currentLog) {
                currentLog.stackTrace.push(line.trim());
                currentLog.message = currentLog.message ? `${currentLog.message}
${line.trim()}` : line.trim();
                currentLog.severity = "error";
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
          if (currentLog && currentLog.stackTrace.length > 0) {
            parsedLogs.push(currentLog);
          }
          console.log("Parsed logs:", parsedLogs);
          const filteredLogs = parsedLogs.filter((log) => ["warn", "error", "debug"].includes(log.severity));
          console.log("Filtered logs by severity:", filteredLogs);
          const groupedLogs = filteredLogs.reduce((groups, log) => {
            const group = groups[log.timeSection] || [];
            group.push(log);
            groups[log.timeSection] = group;
            return groups;
          }, {});
          console.log("Grouped logs:", groupedLogs);
          const sections = Object.entries(groupedLogs).map(([timeSection, logs]) => ({
            timeSection,
            logs: logs.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
          })).sort((a, b) => b.timeSection.localeCompare(a.timeSection));
          console.log("Final sections:", sections);
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
      if (level === "error")
        return "error";
      if (level === "warn" || level === "warning")
        return "warn";
      if (level === "debug")
        return "debug";
      if (level === "info")
        return "info";
      const message = (log.message || "").toLowerCase();
      if (message.includes("error") || message.includes("exception") || message.includes("fail")) {
        return "error";
      } else if (message.includes("warn") || message.includes("warning")) {
        return "warn";
      } else if (message.includes("debug")) {
        return "debug";
      }
      return "info";
    }
    async analyzeBatch(logSections) {
      try {
        console.log("Starting batch analysis:", logSections);
        let logsForAnalysis = logSections.flatMap(
          (section) => section.logs.map((log) => ({
            timestamp: log.timestamp,
            severity: log.severity,
            component: log.component,
            message: log.message,
            stackTrace: log.stackTrace,
            ...log.requestId && { requestId: log.requestId },
            ...log.projectPath && { projectPath: log.projectPath },
            ...log.appId && { appId: log.appId },
            thread: log.thread
          }))
        );
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
        const prompt = `Analyze these WaveMaker Studio logs and provide a concise analysis. Be direct and specific:

\u{1F6A8} ERRORS (if any):
- List exact errors
- File and line numbers
- Quick fix suggestions

\u26A0\uFE0F WARNINGS (if any):
- List important warnings
- Impact on system

\u{1F50D} ROOT CAUSE:
- One-line explanation
- Affected components

\u{1F4A1} SOLUTION:
- Bullet points with specific steps
- Code snippets if needed

Note: Keep responses short and actionable. No lengthy explanations needed.

Logs to analyze (${logsForAnalysis.length} most significant logs):
${JSON.stringify(logsForAnalysis, null, 2)}`;
        console.log("Sending batch analysis request to OpenAI");
        const aiAnalysis = await this.openaiService.analyzeLogs(prompt);
        console.log("Received analysis from OpenAI:", aiAnalysis);
        return aiAnalysis;
      } catch (error) {
        console.error("Error in batch analysis:", error);
        throw error;
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
        const apiKey = await this.getOpenAIKey();
        if (!apiKey) {
          console.warn("OpenAI API key not found");
          this.showError("OpenAI API key not configured. AI analysis will not be available.");
          return;
        }
        await this.logService.initialize(apiKey);
        await this.refreshLogs();
      } catch (error) {
        console.error("Error initializing LogService:", error);
        this.showError("Failed to initialize log service: " + error.message);
      }
    }
    async getOpenAIKey() {
      return new Promise((resolve) => {
        chrome.storage.sync.get(["openaiApiKey"], (result) => {
          resolve(result.openaiApiKey);
        });
      });
    }
    async initializeAsync() {
      try {
        const apiKey = await this.getOpenAIKey();
        if (apiKey) {
          await this.logService.openaiService.setApiKey(apiKey);
        }
      } catch (error) {
        console.error("Error initializing LogPanel:", error);
      }
    }
    createHeader() {
      const header = document.createElement("div");
      header.className = "log-header";
      const typeSelector = document.createElement("select");
      typeSelector.className = "log-type-selector";
      ["server", "application"].forEach((type) => {
        const option = document.createElement("option");
        option.value = type;
        option.textContent = `${type.charAt(0).toUpperCase() + type.slice(1)} Logs`;
        typeSelector.appendChild(option);
      });
      const refreshButton = document.createElement("button");
      refreshButton.className = "refresh-button";
      refreshButton.innerHTML = "\u{1F504} Refresh";
      const analyzeButton = document.createElement("button");
      analyzeButton.className = "analyze-button";
      analyzeButton.innerHTML = "\u{1F50D} Analyze";
      header.appendChild(typeSelector);
      header.appendChild(refreshButton);
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
      const refreshButton = this.element.querySelector(".refresh-button");
      refreshButton.addEventListener("click", () => this.refreshLogs());
      const analyzeButton = this.element.querySelector(".analyze-button");
      analyzeButton.addEventListener("click", () => this.analyzeLogs());
    }
    async fetchLogs(type) {
      try {
        this.showLoading();
        const logs = await this.logService.fetchLogs(type);
        this.displayLogs(logs);
      } catch (error) {
        this.showError(error.message);
      }
    }
    async refreshLogs() {
      try {
        console.log("Starting log refresh...");
        this.showLoading();
        const logContent = this.element.querySelector(".log-content");
        if (logContent) {
          console.log("Clearing existing logs");
          logContent.innerHTML = "";
        } else {
          console.warn("Log content container not found");
        }
        console.log("Fetching logs of type:", this.currentLogType);
        const logs = await this.logService.fetchLogs(this.currentLogType);
        console.log("Received logs:", logs);
        if (!logs || !Array.isArray(logs)) {
          console.warn("Invalid logs format:", logs);
          throw new Error("Invalid logs format received");
        }
        if (logs.length === 0) {
          console.warn("No logs received");
          logContent.innerHTML = '<div class="no-logs">No logs available</div>';
          return;
        }
        console.log("Displaying logs...");
        this.displayLogs(logs);
        console.log("Logs displayed successfully");
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
    async analyzeLogs() {
      try {
        const analysisButton = this.element.querySelector(".analyze-button");
        analysisButton.disabled = true;
        analysisButton.textContent = "Analyzing...";
        const logContent = this.element.querySelector(".log-content");
        const logSections = Array.from(logContent.querySelectorAll(".log-section")).map((section) => ({
          timeSection: section.querySelector(".section-header").textContent,
          logs: Array.from(section.querySelectorAll(".log-entry")).map((entry) => {
            var _a, _b, _c;
            const messageElement = entry.querySelector(".log-message");
            let message = (messageElement == null ? void 0 : messageElement.textContent) || "";
            let stackTrace2 = [];
            if (message.includes("\n")) {
              const lines = message.split("\n");
              message = lines[0];
              stackTrace2 = lines.slice(1);
            }
            const log = {
              message,
              stackTrace: stackTrace2,
              timestamp: section.querySelector(".section-header").textContent + (((_a = entry.querySelector(".log-timestamp")) == null ? void 0 : _a.textContent) || ""),
              thread: ((_b = entry.querySelector(".log-thread")) == null ? void 0 : _b.textContent) || "",
              component: ((_c = entry.querySelector(".log-component")) == null ? void 0 : _c.textContent) || "",
              severity: entry.dataset.severity || "info"
            };
            const requestId = entry.querySelector(".log-request-id");
            if (requestId) {
              log.requestId = requestId.textContent;
            }
            const projectPath = entry.querySelector(".log-project");
            if (projectPath) {
              log.projectPath = projectPath.textContent;
            }
            const appId = entry.querySelector(".log-appid");
            if (appId) {
              log.appId = appId.textContent;
            }
            return log;
          })
        }));
        console.log("Collected log sections for analysis:", logSections);
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
    displayLogs(sections) {
      console.log("Starting displayLogs with sections:", sections);
      const logContent = this.element.querySelector(".log-content");
      if (!logContent) {
        console.error("Log content container not found");
        return;
      }
      logContent.innerHTML = "";
      if (!sections || sections.length === 0) {
        console.warn("No sections to display");
        logContent.innerHTML = '<div class="no-logs">No logs available</div>';
        return;
      }
      console.log("Processing sections...");
      sections.forEach((section, index) => {
        console.log(`Processing section ${index}:`, section);
        const sectionDiv = document.createElement("div");
        sectionDiv.className = "log-section";
        const header = document.createElement("div");
        header.className = "section-header";
        header.textContent = section.timeSection;
        sectionDiv.appendChild(header);
        if (!section.logs || !Array.isArray(section.logs)) {
          console.warn(`Invalid logs in section ${index}:`, section.logs);
          return;
        }
        section.logs.forEach((log, logIndex) => {
          console.log(`Processing log ${logIndex} in section ${index}:`, log);
          const logEntry = document.createElement("div");
          logEntry.className = `log-entry severity-${log.severity}`;
          logEntry.dataset.severity = log.severity;
          const timeOnly = log.timestamp.split(" ")[1];
          logEntry.innerHTML = `
                    <span class="log-timestamp">${timeOnly}</span>
                    ${log.projectPath ? `<span class="log-project">${log.projectPath}</span>` : ""}
                    ${log.appId ? `<span class="log-appid">${log.appId}</span>` : ""}
                    <span class="log-thread">${log.thread}</span>
                    <span class="log-severity ${log.severity}">${log.severity.toUpperCase()}</span>
                    <span class="log-component">[${log.component}]</span>
                    <span class="log-message ${log.stackTrace && log.stackTrace.length > 0 ? "has-stack" : ""}">${this.escapeHtml(log.message)}</span>
                `;
          sectionDiv.appendChild(logEntry);
        });
        logContent.appendChild(sectionDiv);
      });
      console.log("Finished displaying logs");
    }
    escapeHtml(unsafe) {
      return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }
    displayAnalysis(analysis) {
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
  };
  var logPanel_default = LogPanel;

  // src/js/services/searchService.js
  var SearchService = class {
    constructor() {
      this.fileCache = /* @__PURE__ */ new Map();
      this.projectId = null;
      this.baseUrl = "https://www.wavemakeronline.com/studio/services/projects";
      this.authCookie = null;
      this.initialize();
    }
    /**
     * Initialize the search service
     */
    async initialize() {
      try {
        const response = await chrome.runtime.sendMessage({ type: "GET_AUTH_COOKIE" });
        if (!response.cookie) {
          throw new Error("Authentication cookie not found");
        }
        this.authCookie = response.cookie;
        console.log("SearchService initialized with auth cookie");
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
    async searchInCurrentEditor(query, options = {}) {
      return new Promise((resolve, reject) => {
        const messageHandler = (event) => {
          if (event.data.type === "EDITOR_CONTENT_RESPONSE") {
            window.removeEventListener("message", messageHandler);
            if (event.data.error) {
              reject(new Error(event.data.error));
              return;
            }
            const { content, filename } = event.data;
            resolve(this.searchInContent(content, query, filename, options));
          }
        };
        window.addEventListener("message", messageHandler);
        window.postMessage({ type: "GET_EDITOR_CONTENT" }, "*");
        setTimeout(() => {
          window.removeEventListener("message", messageHandler);
          reject(new Error("Timeout waiting for editor content"));
        }, 5e3);
      });
    }
    /**
     * Search in content with various strategies
     */
    searchInContent(content, query, filename, options = {}) {
      const results = [];
      try {
        if (!options.type || options.type === "exact") {
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
        if (!options.type || options.type === "pattern") {
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
        type: "NAVIGATE_TO_FILE",
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
      this.initialize();
    }
    initialize() {
      this.sidebarElement = document.createElement("div");
      this.sidebarElement.className = "wm-copilot-sidebar";
      this.sidebarElement.innerHTML = `
            <div class="sidebar-header">
                <h2>Surfboard AI</h2>
                <div class="tab-buttons">
                    <button class="tab-button active" data-tab="chat">Chat</button>
                    <button class="tab-button" data-tab="logs">Logs</button>
                    <button class="tab-button" data-tab="search">Search</button>
                </div>
                <button class="minimize-button">\u2212</button>
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
      console.log("Log container:", logContainer);
      if (!this.logPanel && logContainer) {
        console.log("Creating new LogPanel");
        this.logPanel = new logPanel_default();
        console.log("LogPanel created:", this.logPanel);
        logContainer.appendChild(this.logPanel.element);
        console.log("LogPanel appended to container");
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
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
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
      minimizeButton.textContent = this.isOpen ? "\u2212" : "+";
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
      console.log("Adding click handlers to button...");
      copyButton.onclick = function(e) {
        console.log("Copy button clicked via onclick");
        handleCopy(e);
      };
      copyButton.addEventListener("click", function(e) {
        console.log("Copy button clicked via addEventListener");
        handleCopy(e);
      });
      const handleCopy = async (e) => {
        console.log("Handling copy...");
        e.preventDefault();
        e.stopPropagation();
        const span = copyButton.querySelector("span");
        try {
          console.log("Attempting to copy code:", code);
          await navigator.clipboard.writeText(code);
          console.log("Code copied successfully");
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
  };
  var sidebar_default = WaveMakerCopilotSidebar;

  // src/js/services/aiService.js
  var AIService = class {
    constructor() {
      this.API_KEY = "";
      this.API_URL = "https://api.openai.com/v1/chat/completions";
      this.MODEL = "gpt-3.5-turbo";
      this.CONFIG = {
        max_tokens: 150,
        temperature: 0.2,
        // Lower temperature for more focused completions
        top_p: 0.95,
        // Slightly reduce randomness
        presence_penalty: 0.1,
        // Slight penalty for repetition
        frequency_penalty: 0.1
        // Slight penalty for common tokens
      };
    }
    setApiKey(key) {
      this.API_KEY = key;
    }
    createPrompt(context, language) {
      const cursorIndex = context.indexOf("\u25BC");
      const beforeCursor = context.substring(0, cursorIndex);
      const afterCursor = context.substring(cursorIndex + 1);
      return [
        {
          role: "system",
          content: `You are a precise code completion model for ${language}. Follow these rules:
1. Complete the code at the cursor position (\u25BC) naturally
2. Focus on the local context and variable names
3. Maintain consistent style with the surrounding code
4. Only provide the completion text, no explanations
5. Ensure syntactic correctness
6. Use existing variables and functions when appropriate`
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
      var _a;
      if (!this.API_KEY) {
        throw new Error("OpenAI API key not set");
      }
      try {
        const response = await fetch(this.API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${this.API_KEY}`
          },
          body: JSON.stringify({
            model: this.MODEL,
            messages,
            ...this.CONFIG,
            n
          }),
          signal
          // Add abort signal to fetch request
        });
        if (!response.ok) {
          const error = await response.json();
          throw new Error(((_a = error.error) == null ? void 0 : _a.message) || "API request failed");
        }
        const data = await response.json();
        return data.choices;
      } catch (error) {
        console.error("API request failed:", error);
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
    constructor() {
      this.currentEditor = null;
      this.editorType = null;
      this.monacoInstance = null;
      this.inlineDecorationIds = [];
      this.lastInlineText = "";
      this.isProcessingInline = false;
      this.initializeAttempts = 0;
      this.maxInitializeAttempts = 20;
      this._inlineProviderRegistered = false;
      this.contextWindow = 5;
      this.inlineConfig = {
        debounceTime: 500,
        // Increased to 500ms
        minRequestInterval: 750,
        // Minimum time between requests
        maxPendingRequests: 1
        // Maximum number of pending requests
      };
      this.debouncedHandleContentChange = this.debounce(
        this.handleContentChange.bind(this),
        this.inlineConfig.debounceTime
      );
      this.initialize();
    }
    debounce(func, wait) {
      let timeout;
      return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
          func.apply(this, args);
        }, wait);
      };
    }
    throttle(func, limit) {
      let inThrottle;
      return (...args) => {
        if (!inThrottle) {
          func.apply(this, args);
          inThrottle = true;
          setTimeout(() => inThrottle = false, limit);
        }
      };
    }
    initialize() {
      console.log("CompletionManager initializing...");
      this.injectMonacoHelper();
      this.setupMessageListener();
      this.setupAPIKey();
      this.setupEditorObserver();
      console.log("CompletionManager initialized");
    }
    setupAPIKey() {
      chrome.storage.sync.get(["openaiApiKey"], (result) => {
        if (result.openaiApiKey) {
          aiService_default.setApiKey(result.openaiApiKey);
        }
      });
      chrome.storage.onChanged.addListener((changes) => {
        if (changes.openaiApiKey) {
          aiService_default.setApiKey(changes.openaiApiKey.newValue);
        }
      });
    }
    injectMonacoHelper() {
      var s = document.createElement("script");
      s.src = chrome.runtime.getURL("src/js/inject/monacoHelper.js");
      s.onload = function() {
        this.remove();
      };
      (document.head || document.documentElement).appendChild(s);
    }
    setupMessageListener() {
      window.addEventListener("message", (event) => {
        if (event.source !== window)
          return;
        const { type, data } = event.data;
        switch (type) {
          case "MONACO_HELPER_READY":
            console.log("Monaco helper ready, setting up completion provider...");
            window.postMessage({
              type: "SETUP_COMPLETION_PROVIDER",
              languages: ["javascript", "typescript", "html", "css"]
            }, "*");
            break;
          case "GET_EDITOR_INSTANCE_RESPONSE":
            console.log("Got editor instance response:", data);
            if (data && data.success) {
              this.monacoInstance = data.editor;
              console.log("Monaco instance set:", this.monacoInstance);
            }
            break;
          case "SETUP_PROVIDER_RESPONSE":
            console.log("Completion provider setup response:", data);
            if (data && data.success) {
              console.log("Completion provider registered successfully");
            } else {
              console.error("Failed to setup completion provider:", data == null ? void 0 : data.error);
            }
            break;
          case "GET_INLINE_COMPLETIONS":
            console.log("Getting inline completions for:", data);
            this.handleCompletionRequest(data);
            break;
        }
      });
    }
    async handleCompletionRequest(data) {
      const now = Date.now();
      if (now - this._lastRequestTime < this.inlineConfig.minRequestInterval) {
        return;
      }
      this._lastRequestTime = now;
      try {
        const context = this.getContext(data);
        if (!context)
          return;
        if (this._pendingRequest) {
          this._pendingRequest.abort();
        }
        const controller = new AbortController();
        this._pendingRequest = controller;
        const completions = await aiService_default.getMultipleCompletions(
          context.text,
          context.language,
          3,
          // Number of completions
          controller.signal
          // Pass signal separately
        );
        if (this._pendingRequest === controller) {
          this._pendingRequest = null;
        }
        const startColumn = data.wordUntil ? data.wordUntil.endColumn : data.position.column;
        window.postMessage({
          type: "INLINE_COMPLETIONS_RESPONSE",
          data: {
            modelId: data.modelId,
            items: completions.map((completion) => ({
              text: completion,
              range: {
                startLineNumber: data.position.lineNumber,
                startColumn,
                endLineNumber: data.position.lineNumber,
                endColumn: startColumn
              }
            }))
          }
        }, "*");
      } catch (error) {
        if (error.name === "AbortError") {
          console.log("Completion request cancelled");
        } else {
          console.error("Error handling completion request:", error);
        }
        window.postMessage({
          type: "INLINE_COMPLETIONS_RESPONSE",
          data: {
            modelId: data.modelId,
            items: []
          }
        }, "*");
      }
    }
    getContext(data) {
      const { contextText, position, language, cursorOffset } = data;
      const prefix = contextText.slice(0, cursorOffset);
      const suffix = contextText.slice(cursorOffset);
      const lines = prefix.split("\n");
      const cursorLine = lines.length;
      const cursorColumn = lines[lines.length - 1].length + 1;
      return {
        text: `${prefix}\u25BC${suffix}`,
        language,
        cursorLine,
        cursorColumn
      };
    }
    setupEditorObserver() {
      console.log("Setting up editor observer...");
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const containers = [
                ...node.querySelectorAll("wms-editor, .wm-code-editor, .monaco-editor"),
                ...node.matches("wms-editor, .wm-code-editor, .monaco-editor") ? [node] : []
              ];
              for (const container of containers) {
                console.log("Found potential editor container:", container.className || container.tagName);
                if (container.tagName.toLowerCase() === "wms-editor" && container.shadowRoot) {
                  const shadowEditor = container.shadowRoot.querySelector(".monaco-editor");
                  if (shadowEditor && !shadowEditor.classList.contains("rename-box")) {
                    console.log("Found Monaco editor in shadow DOM");
                    this.setupEditorListeners(shadowEditor);
                  }
                  continue;
                }
                const editor = container.matches(".monaco-editor") ? container : container.querySelector(".monaco-editor");
                if (editor && !editor.classList.contains("rename-box")) {
                  console.log("Found Monaco editor");
                  this.setupEditorListeners(editor);
                }
              }
            }
          }
        }
      });
      console.log("Checking for existing editors...");
      ["wms-editor", ".wm-code-editor", ".monaco-editor"].forEach((selector) => {
        const existingEditors = document.querySelectorAll(selector);
        existingEditors.forEach((container) => {
          console.log("Found existing container:", selector);
          if (container.tagName.toLowerCase() === "wms-editor" && container.shadowRoot) {
            const shadowEditor = container.shadowRoot.querySelector(".monaco-editor");
            if (shadowEditor && !shadowEditor.classList.contains("rename-box")) {
              console.log("Found existing Monaco editor in shadow DOM");
              this.setupEditorListeners(shadowEditor);
            }
          } else {
            const editor = container.matches(".monaco-editor") ? container : container.querySelector(".monaco-editor");
            if (editor && !editor.classList.contains("rename-box")) {
              console.log("Found existing Monaco editor");
              this.setupEditorListeners(editor);
            }
          }
        });
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
      console.log("Editor observer setup complete");
    }
    setupEditorListeners(editor) {
      if (!editor || !this.isWaveMakerEditor(editor)) {
        console.log("Invalid editor or not a WaveMaker editor");
        return;
      }
      console.log("Setting up editor listeners");
      try {
        const textArea = editor.querySelector(".inputarea");
        if (!textArea) {
          console.log("Monaco input area not found");
          return;
        }
        const editorElement = editor.closest("[data-keybinding-context]");
        if (!editorElement) {
          console.log("Editor context not found");
          return;
        }
        const editorId = editorElement.getAttribute("data-keybinding-context");
        console.log("Found editor ID:", editorId);
        window.postMessage({
          type: "GET_EDITOR_INSTANCE",
          editorId
        }, "*");
        this.currentEditor = editor;
        editor.addEventListener("focus", () => {
          console.log("Editor focused");
          this.setCurrentEditor(editor);
        });
        editor.addEventListener("click", () => {
          this.setCurrentEditor(editor);
        });
        this.monacoInstance.onDidChangeModelContent((event) => {
          this.debouncedHandleContentChange(event);
        });
      } catch (error) {
        console.error("Error setting up editor listeners:", error);
      }
    }
    handleContentChange(event) {
      if (this.isProcessingInline || !this.monacoInstance)
        return;
      const position = this.monacoInstance.getPosition();
      if (position) {
        this.monacoInstance.trigger("inline", "editor.action.inlineCompletion");
      }
    }
    isWaveMakerEditor(element) {
      if (!element)
        return false;
      console.log("Checking editor:", element.className);
      if (element.classList.contains("rename-box")) {
        console.log("Skipping rename box widget");
        return false;
      }
      const isMonacoEditor = element.classList.contains("monaco-editor");
      const hasCorrectTheme = element.classList.contains("vs-dark") || element.classList.contains("vs");
      const isNotWidget = !element.hasAttribute("widgetid");
      if (isMonacoEditor && hasCorrectTheme && isNotWidget) {
        console.log("Valid Monaco editor found");
        return true;
      }
      const wmContainer = element.closest("wms-editor, .wm-code-editor");
      if (wmContainer) {
        console.log("Found within WaveMaker container:", wmContainer.tagName || wmContainer.className);
        return true;
      }
      console.log("Not a valid WaveMaker editor");
      return false;
    }
    detectEditorType(editor) {
      if (!editor)
        return null;
      const container = editor.closest(".wm-code-editor");
      if (!container)
        return null;
      const editorClasses = editor.className;
      if (editorClasses.includes("html-editor") || container.getAttribute("data-mode-id") === "html") {
        return "markup";
      } else if (editorClasses.includes("css-editor") || container.getAttribute("data-mode-id") === "css") {
        return "style";
      } else if (editorClasses.includes("js-editor") || container.getAttribute("data-mode-id") === "javascript") {
        return "script";
      }
      const editorContent = editor.textContent.trim().toLowerCase();
      if (editorContent.startsWith("<!doctype") || editorContent.includes("<html")) {
        return "markup";
      } else if (editorContent.includes("{") && editorContent.includes("}") && (editorContent.includes(":") || editorContent.includes(";"))) {
        return "style";
      }
      return "script";
    }
    setCurrentEditor(editor) {
      if (this.currentEditor === editor)
        return;
      console.log("Setting current editor:", editor);
      this.currentEditor = editor;
      this.editorType = this.detectEditorType(editor);
      console.log("Editor type:", this.editorType);
    }
  };
  var completionManager_default = CompletionManager;

  // src/js/content.js
  var copilotInstance = null;
  var SurfboardAI = class {
    constructor() {
      this.contextManager = new wmContext_default();
      this.apiKey = null;
      this.model = "llama3-8b-8192";
      this.apiEndpoint = "https://api.groq.com/openai/v1";
      this.isInitialized = false;
      this.sidebar = null;
      this.completionManager = null;
      this.initialize();
    }
    async initialize() {
      try {
        console.log("Initializing SurfboardAI...");
        this.completionManager = new completionManager_default();
        console.log("CompletionManager initialized");
        await this.loadConfiguration();
        this.sidebar = new sidebar_default();
        await this.contextManager.initialize();
        this.setupMessageListener();
        this.isInitialized = true;
        this.sidebar.addMessage(
          "Hello! \u{1F44B} I'm your Surfboard AI assistant. I can help you with:\n\n- Writing and editing code\n- Answering questions about WaveMaker\n- Providing code examples\n- Debugging issues\n\nHow can I assist you today?",
          "assistant"
        );
        console.log("Surfboard.AI initialized successfully");
      } catch (error) {
        console.error("Error initializing SurfboardAI:", error);
      }
    }
    setupMessageListener() {
      document.addEventListener("surfboard-message", async (event) => {
        const { message, type } = event.detail;
        if (type === "user") {
          try {
            this.sidebar.addMessage("Thinking...", "assistant");
            const context = this.contextManager.getRelevantContext(message);
            const response = await fetch(this.apiEndpoint + "/chat/completions", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${this.apiKey}`
              },
              body: JSON.stringify({
                model: this.model,
                messages: [
                  {
                    role: "system",
                    content: `You are Surfboard AI, a WaveMaker development assistant. Current context: ${JSON.stringify(context)}`
                  },
                  {
                    role: "user",
                    content: message
                  }
                ],
                temperature: 0.7,
                max_tokens: 2e3
              })
            });
            if (!response.ok) {
              throw new Error("API request failed");
            }
            const data = await response.json();
            const reply = data.choices[0].message.content;
            this.sidebar.chatContainer.lastChild.remove();
            this.sidebar.addMessage(reply, "assistant");
          } catch (error) {
            console.error("Failed to process message:", error);
            this.sidebar.addMessage(
              "Sorry, I encountered an error while processing your message. Please try again.",
              "assistant"
            );
          }
        }
      });
    }
    async loadConfiguration() {
      const result = await chrome.storage.sync.get(["apiKey"]);
      this.apiKey = result.apiKey;
      if (!this.apiKey) {
        throw new Error("API key not found");
      }
    }
  };
  window.addEventListener("load", () => {
    copilotInstance = new SurfboardAI();
  });
  var content_default = SurfboardAI;
})();
//# sourceMappingURL=bundle.js.map
