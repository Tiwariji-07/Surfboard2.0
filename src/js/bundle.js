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

  // src/js/ui/sidebar.js
  var WaveMakerCopilotSidebar = class {
    constructor() {
      this.sidebarElement = null;
      this.chatContainer = null;
      this.isOpen = false;
      this.initialize();
    }
    initialize() {
      this.sidebarElement = document.createElement("div");
      this.sidebarElement.className = "wm-copilot-sidebar";
      this.sidebarElement.innerHTML = `
            <div class="sidebar-header">
                <h2>Surfboard AI</h2>
                <button class="minimize-button">\u2212</button>
            </div>
            <div class="sidebar-content">
                <div class="chat-container"></div>
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
      document.addEventListener("keydown", (e) => {
        if (e.ctrlKey && e.key === "\\") {
          this.toggleSidebar();
        }
      });
    }
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
