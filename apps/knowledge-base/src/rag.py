"""
Two-stage RAG pipeline for WaveMaker knowledge retrieval.

Stage 1 (Intent Extraction):
  - Analyze user query + page context
  - Identify which widgets/variables/topics are relevant
  - Return a list of knowledge keys to retrieve

Stage 2 (Knowledge-Grounded Response):
  - Fetch relevant chunks from ChromaDB (by key + semantic search)
  - Build a grounded prompt with retrieved knowledge
  - Return context-enriched answer via LLM

The LLM calls are proxied through LiteLLM (same as the extension uses).
"""

import json
import httpx
from .store import query_knowledge, get_by_widget_keys

# All 61 known widget/variable keys from the knowledge base
KNOWN_KEYS = [
    "form", "formfield", "text", "select", "switch", "fileupload", "checkbox",
    "checkboxset", "date", "datetime", "radioset", "spinner", "textarea", "number",
    "chips", "search", "button", "anchor", "designdialog", "pagedialog",
    "alertdialog", "confirmdialog", "logindialog", "label", "list", "chart",
    "icon", "picture", "table", "video", "tabs", "tabPane", "wizard",
    "wizardstep", "accordion", "accordionpane", "breadcrumb", "popover", "menu",
    "custom_textfield", "custom_checkbox_set", "custom_discrete_slider",
    "custom_slider", "custom_divider", "custom_icon_button",
    "custom_icon_button_toggleable", "custom_input_chip", "custom_progressbar",
    "custom_radio_set", "custom_switch_button",
    "wm.LiveVariable", "wm.ServiceVariable", "wm.Variable",
    "wm.NavigationVariable", "wm.NotificationVariable", "wm.LogoutVariable",
    "wm.LoginVariable", "wm.TimerVariable", "wm.DeviceVariable",
    "DialogService", "Highcharts",
]

INTENT_SYSTEM_PROMPT = """You are a WaveMaker intent extraction agent. Given a user query and optional page context, identify which WaveMaker widgets, variables, or topics are relevant.

Return a JSON object with:
{
  "keys": ["widget_or_variable_key", ...],
  "topics": ["general_topic", ...]
}

Available widget/variable keys:
""" + json.dumps(KNOWN_KEYS) + """

Rules:
- Only include keys from the list above that are genuinely relevant to the query
- "topics" can include general terms like "validation", "navigation", "data-binding", "events", "styling"
- If the query is about general WaveMaker concepts, return empty keys but fill topics
- If page context mentions specific widgets, include their keys
- Return valid JSON only, no explanation
"""

COPILOT_SYSTEM_PROMPT = """You are Surfboard AI, a WaveMaker Studio coding assistant. Generate accurate WaveMaker JavaScript code using the retrieved knowledge below.

## WaveMaker Syntax Rules (CRITICAL — follow exactly)

### Scope & Object Model
- Page scope: `Page.Widgets.X`, `Page.Variables.X`, `Page.Actions.X`
- Partial scope: `Partial.Widgets.X`, `Partial.Variables.X`
- App scope: `App.Variables.X`, `App.Actions.X`
- Prefab scope: `Prefab.Widgets.X`, `Prefab.Variables.X`
- NEVER use `this` keyword — always use Page/Partial/App/Prefab objects directly.
- Auto-detect canvas from context (Page vs Partial vs Prefab) and apply the correct prefix.

### Widget Properties (dot notation)
- Get/set via dot notation: `Page.Widgets.button1.disabled = true;`
- Partial widget from Page: `Page.Widgets.containerName.Widgets.partialWidget.show = false;`
- For native DOM operations use `.nativeElement` property.

### Variable Operations
- Invoke: `Page.Variables.varName.invoke(options, successCallback, errorCallback)`
  - Callbacks are SEPARATE positional arguments, NEVER keys inside the options object.
  - CORRECT: `Page.Variables.myVar.invoke({{inputFields: {{id: 1}}}}, function(data){{}}, function(err){{}});`
  - WRONG:  `Page.Variables.myVar.invoke({{inputFields: {{id: 1}}, successCallback: fn}});`
- Set input: `Page.Variables.varName.setInput("fieldName", value)`
- Data access: `Page.Variables.varName.dataSet`
- LiveVariable CRUD: `.listRecords()`, `.createRecord()`, `.updateRecord()`, `.deleteRecord()`

### Event Handlers
- Attach event name directly: `Page.button1Click = function($event, widget) {{}};`
- Variable events: `Page.myVaronSuccess = function(variable, data) {{}};`
- INCORRECT: `Page.Widgets.button1.onClick = ...` (NEVER)
- INCORRECT: `Page.Variables.myVar.onSuccess = ...` (NEVER)
- Cannot write partial-hosted widget event handlers in page script.

### Page/Partial Methods
- `Page.myMethod = function(param1, param2) {{}};`
- Initialization: `Page.onReady = function() {{}};`

### Form & Validation
- Use `setValidators()` or `setAsyncValidators()` for form validations.
- Body parameter nesting: `body.fieldName` (e.g. `body.name`, `body.category.id`).

### Available Libraries
- Lodash (`_`) and Moment.js (`moment`) are globally available.

### Mobile / Prefab Projects
- React Native + Expo 52 libraries available via `require()`.
- Plugins must be added at Settings > Build Preferences > Plugins.

## Retrieved Knowledge:
{knowledge}

## Page Context:
{page_context}

## Instructions:
- Generate fresh, working code for each query — never reuse history code.
- Use exact widget/variable names from the page context.
- ONLY use properties/methods/events from the retrieved knowledge — do NOT hallucinate APIs.
- If the knowledge doesn't cover something, say so rather than guessing.
- Include both explanation and working code in markdown code blocks.
- Also mention event binding to widget/variable if not already bound.
- CRITICAL: Never speak about RAG, retrieval, or knowledge base internals.
"""


async def extract_intent(
    query: str,
    page_context: dict | None,
    litellm_base_url: str,
    litellm_api_key: str,
    model: str = "claude-sonnet",
) -> dict:
    """Stage 1: Extract intent from user query to determine which knowledge to retrieve."""
    messages = [
        {"role": "system", "content": INTENT_SYSTEM_PROMPT},
        {"role": "user", "content": _build_intent_user_message(query, page_context)},
    ]

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{litellm_base_url}/v1/chat/completions",
            headers={"Authorization": f"Bearer {litellm_api_key}"},
            json={
                "model": model,
                "messages": messages,
                "temperature": 0.1,
                "max_tokens": 500,
            },
        )
        resp.raise_for_status()
        data = resp.json()

    content = data["choices"][0]["message"]["content"]

    # Parse JSON from the response (handle markdown code blocks)
    content = content.strip()
    if content.startswith("```"):
        content = content.split("\n", 1)[1]
        content = content.rsplit("```", 1)[0]

    try:
        return json.loads(content)
    except json.JSONDecodeError:
        return {"keys": [], "topics": [query]}


def _build_intent_user_message(query: str, page_context: dict | None) -> str:
    parts = [f"User query: {query}"]
    if page_context:
        widgets = page_context.get("widgets", [])
        variables = page_context.get("variables", [])
        if widgets:
            parts.append(f"Page widgets: {json.dumps(widgets[:30])}")
        if variables:
            parts.append(f"Page variables: {json.dumps(variables[:20])}")
        page_name = page_context.get("pageName", "")
        if page_name:
            parts.append(f"Page: {page_name}")
    return "\n".join(parts)


def retrieve_knowledge(intent: dict, query: str, n_semantic: int = 5) -> list[dict]:
    """Stage 2a: Retrieve relevant knowledge chunks based on extracted intent."""
    results = []

    # Direct lookup by widget/variable keys
    keys = intent.get("keys", [])
    if keys:
        results.extend(get_by_widget_keys(keys))

    # Semantic search for topics and the original query
    topics = intent.get("topics", [])
    search_queries = [query] + topics

    seen_ids = {r["id"] for r in results}
    for sq in search_queries:
        semantic = query_knowledge(sq, n_results=n_semantic)
        for item in semantic:
            if item["id"] not in seen_ids:
                results.append(item)
                seen_ids.add(item["id"])

    return results


def build_grounded_prompt(
    query: str,
    retrieved: list[dict],
    page_context: dict | None,
    chat_history: list[dict] | None = None,
) -> list[dict]:
    """Build the final LLM prompt with retrieved knowledge and page context."""
    # Combine retrieved knowledge into a single block
    knowledge_parts = []
    for item in retrieved:
        source = item.get("metadata", {}).get("source", "unknown")
        knowledge_parts.append(f"--- Source: {source} ---\n{item['text']}")

    knowledge_text = "\n\n".join(knowledge_parts) if knowledge_parts else "No specific knowledge retrieved."
    context_text = json.dumps(page_context, indent=2) if page_context else "No page context available."

    system = COPILOT_SYSTEM_PROMPT.format(
        knowledge=knowledge_text,
        page_context=context_text,
    )

    messages = [{"role": "system", "content": system}]

    # Add chat history if present
    if chat_history:
        for msg in chat_history[-6:]:  # Last 6 turns
            messages.append({"role": msg["role"], "content": msg["content"]})

    messages.append({"role": "user", "content": query})
    return messages


async def rag_query(
    query: str,
    page_context: dict | None = None,
    chat_history: list[dict] | None = None,
    litellm_base_url: str = "http://localhost:4000",
    litellm_api_key: str = "",
    intent_model: str = "claude-sonnet",
    copilot_model: str = "claude-sonnet",
) -> dict:
    """Full two-stage RAG pipeline. Returns answer + retrieved sources."""

    # Stage 1: Extract intent
    intent = await extract_intent(query, page_context, litellm_base_url, litellm_api_key, intent_model)

    # Stage 2a: Retrieve knowledge
    retrieved = retrieve_knowledge(intent, query)

    # Stage 2b: Build grounded prompt and call LLM
    messages = build_grounded_prompt(query, retrieved, page_context, chat_history)

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{litellm_base_url}/v1/chat/completions",
            headers={"Authorization": f"Bearer {litellm_api_key}"},
            json={
                "model": copilot_model,
                "messages": messages,
                "temperature": 0.3,
                "max_tokens": 4000,
            },
        )
        resp.raise_for_status()
        data = resp.json()

    answer = data["choices"][0]["message"]["content"]

    # Build source references
    sources = []
    for item in retrieved:
        sources.append({
            "id": item["id"],
            "type": item.get("metadata", {}).get("type", ""),
            "widget": item.get("metadata", {}).get("widget", ""),
            "source": item.get("metadata", {}).get("source", ""),
        })

    return {
        "answer": answer,
        "intent": intent,
        "sources": sources,
        "retrieved_count": len(retrieved),
    }


async def rag_query_stream(
    query: str,
    page_context: dict | None = None,
    chat_history: list[dict] | None = None,
    litellm_base_url: str = "http://localhost:4000",
    litellm_api_key: str = "",
    intent_model: str = "claude-sonnet",
    copilot_model: str = "claude-sonnet",
):
    """Streaming version of RAG query. Yields SSE-formatted chunks."""

    # Stage 1: Extract intent (non-streaming, fast)
    intent = await extract_intent(query, page_context, litellm_base_url, litellm_api_key, intent_model)

    # Stage 2a: Retrieve knowledge
    retrieved = retrieve_knowledge(intent, query)

    # Yield intent + sources as first event
    sources = [
        {
            "id": item["id"],
            "type": item.get("metadata", {}).get("type", ""),
            "widget": item.get("metadata", {}).get("widget", ""),
        }
        for item in retrieved
    ]
    yield {
        "type": "metadata",
        "intent": intent,
        "sources": sources,
        "retrieved_count": len(retrieved),
    }

    # Stage 2b: Stream the grounded response
    messages = build_grounded_prompt(query, retrieved, page_context, chat_history)

    async with httpx.AsyncClient(timeout=60) as client:
        async with client.stream(
            "POST",
            f"{litellm_base_url}/v1/chat/completions",
            headers={"Authorization": f"Bearer {litellm_api_key}"},
            json={
                "model": copilot_model,
                "messages": messages,
                "temperature": 0.3,
                "max_tokens": 4000,
                "stream": True,
            },
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                data_str = line[6:]
                if data_str.strip() == "[DONE]":
                    yield {"type": "done"}
                    break
                try:
                    chunk = json.loads(data_str)
                    delta = chunk["choices"][0].get("delta", {})
                    content = delta.get("content", "")
                    if content:
                        yield {"type": "text", "content": content}
                except (json.JSONDecodeError, KeyError, IndexError):
                    continue
