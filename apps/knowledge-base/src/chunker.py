"""
Chunking strategies for WaveMaker knowledge base documents.

Produces chunks suitable for embedding in ChromaDB. Each chunk has:
  - id: unique identifier
  - text: the content to embed
  - metadata: structured metadata for filtering (type, widget, category, platform, tags)
"""

import json
from pathlib import Path

KNOWLEDGE_DIR = Path(__file__).resolve().parent.parent / "knowledge_base"


def _widget_api_chunks(knowledge: dict) -> list[dict]:
    """One chunk per widget/variable from the structured KNOWLEDGE_JSON.

    Each chunk contains the full API surface (properties, methods, events)
    for a single widget or variable, which keeps related info together for retrieval.
    """
    chunks = []
    for key, entry in knowledge.items():
        name = entry.get("name", key)
        is_variable = key.startswith("wm.") or key in ("DialogService", "Highcharts")
        category = "variable" if is_variable else "widget"

        # Build a readable text representation of the API surface
        sections = []
        sections.append(f"# {name}")

        for platform in ("common", "web", "mobile"):
            data = entry.get(platform)
            if not data:
                continue

            platform_label = platform.upper() if platform != "common" else "COMMON (all platforms)"
            sections.append(f"\n## {platform_label}")

            # Binding info
            binding_info = data.get("binding_info", [])
            if binding_info:
                sections.append("### Binding Info")
                for info in binding_info:
                    sections.append(f"- {info}")

            # Dynamic forms (web-specific)
            dynamic = data.get("dynamic_forms")
            if dynamic:
                sections.append("### Dynamic Forms")
                sections.append(f"Description: {dynamic.get('description', '')}")
                sections.append(f"Metadata fields: {dynamic.get('metadata', '')}")
                sections.append(f"Example: {dynamic.get('example', '')}")
                sections.append(f"Response guidance: {dynamic.get('response', '')}")

            # Properties
            props = data.get("properties", [])
            if props:
                sections.append("### Properties")
                for p in props:
                    pname = p.get("name", "")
                    ptype = p.get("type", "")
                    pdesc = p.get("description", "")
                    psyntax = p.get("syntax", "")
                    allowed = p.get("allowedValues", [])
                    line = f"- **{pname}** ({ptype})"
                    if pdesc:
                        line += f": {pdesc}"
                    if psyntax:
                        line += f" | Syntax: `{psyntax}`"
                    if allowed:
                        line += f" | Allowed: {allowed}"
                    sections.append(line)

            # Methods
            methods = data.get("methods", [])
            if methods:
                sections.append("### Methods")
                for m in methods:
                    mname = m.get("name", "")
                    msyntax = m.get("syntax", "")
                    mdesc = m.get("description", "")
                    mparams = m.get("params", [])
                    mreturns = m.get("returns", "")
                    line = f"- **{mname}**()"
                    if mdesc:
                        line += f": {mdesc}"
                    if msyntax:
                        line += f" | Syntax: `{msyntax}`"
                    if mparams:
                        line += f" | Params: {mparams}"
                    if mreturns:
                        line += f" | Returns: {mreturns}"
                    sections.append(line)

            # Events
            events = data.get("events", [])
            if events:
                sections.append("### Events")
                for e in events:
                    if isinstance(e, str):
                        sections.append(f"- {e}")
                    elif isinstance(e, dict):
                        ename = e.get("name", "")
                        esyntax = e.get("syntax", "")
                        edesc = e.get("description", "")
                        line = f"- **{ename}**"
                        if edesc:
                            line += f": {edesc}"
                        if esyntax:
                            line += f" | Syntax: `{esyntax}`"
                        sections.append(line)

        text = "\n".join(sections)
        chunks.append({
            "id": f"api_{key}",
            "text": text,
            "metadata": {
                "type": "api_reference",
                "category": category,
                "widget": name,
                "source": "knowledge_structured",
            },
        })
    return chunks


def _manual_chunks(filepath: Path, source_tag: str) -> list[dict]:
    """One chunk per manual entry (code example / recipe).

    Manual entries have title, synonyms, tags, syntax, code, and explanation.
    """
    with open(filepath) as f:
        entries = json.load(f)

    chunks = []
    for i, entry in enumerate(entries):
        title = entry.get("title", f"entry_{i}")
        synonyms = entry.get("synonyms", [])
        tags = entry.get("tags", [])
        syntax = entry.get("syntax", "")
        code = entry.get("code", "")
        explanation = entry.get("explanation", "")

        sections = [f"# {title}"]
        if synonyms:
            sections.append(f"Also known as: {', '.join(synonyms)}")
        if tags:
            sections.append(f"Tags: {', '.join(tags)}")
        if syntax:
            sections.append(f"\n## Syntax\n`{syntax}`")
        if code:
            sections.append(f"\n## Code Example\n```javascript\n{code}\n```")
        if explanation:
            sections.append(f"\n## Explanation\n{explanation}")

        text = "\n".join(sections)
        slug = title.lower().replace(" ", "_").replace("-", "_")[:60]
        chunks.append({
            "id": f"manual_{source_tag}_{i}_{slug}",
            "text": text,
            "metadata": {
                "type": "manual",
                "category": "cookbook",
                "tags": ",".join(tags) if tags else "",
                "source": source_tag,
            },
        })
    return chunks


def _flat_widget_chunks(filepath: Path) -> list[dict]:
    """One chunk per widget from the flat widget list (simpler property-only docs)."""
    with open(filepath) as f:
        widgets = json.load(f)

    chunks = []
    for widget in widgets:
        wname = widget.get("widget", "unknown")
        sections = [f"# {wname} (Quick Reference)"]

        for key in ("properties", "methods", "events"):
            items = widget.get(key, [])
            if items:
                sections.append(f"\n## {key.title()}")
                for item in items:
                    if isinstance(item, dict):
                        name = item.get("name", "")
                        desc = item.get("description", "")
                        syntax = item.get("syntax", "")
                        line = f"- **{name}**"
                        if desc:
                            line += f": {desc}"
                        if syntax:
                            line += f" | `{syntax}`"
                        sections.append(line)
                    elif isinstance(item, str):
                        sections.append(f"- {item}")

        text = "\n".join(sections)
        chunks.append({
            "id": f"widget_ref_{wname}",
            "text": text,
            "metadata": {
                "type": "widget_reference",
                "category": "widget",
                "widget": wname,
                "source": "widgets_flat",
            },
        })
    return chunks


def load_all_chunks() -> list[dict]:
    """Load and chunk all knowledge base files. Returns a list of chunk dicts."""
    all_chunks = []

    # 1. Structured API knowledge (the big one - 61 widgets/variables with full API surface)
    structured_path = KNOWLEDGE_DIR / "knowledge_structured.json"
    if structured_path.exists():
        with open(structured_path) as f:
            knowledge = json.load(f)
        all_chunks.extend(_widget_api_chunks(knowledge))

    # 2. Manual / cookbook entries
    for filename, tag in [
        ("wavemaker_manual_full.json", "manual"),
        ("wavemaker_variable_manual_full.json", "variable_manual"),
        ("wavemaker_misc_manual_batch.json", "misc_manual"),
    ]:
        path = KNOWLEDGE_DIR / filename
        if path.exists():
            all_chunks.extend(_manual_chunks(path, tag))

    # 3. Flat widget reference (simpler, good for quick lookups)
    flat_path = KNOWLEDGE_DIR / "widgets.json"
    if flat_path.exists():
        all_chunks.extend(_flat_widget_chunks(flat_path))

    # 4. Actions reference
    actions_path = KNOWLEDGE_DIR / "actions.json"
    if actions_path.exists():
        with open(actions_path) as f:
            actions = json.load(f)
        if isinstance(actions, list):
            for i, action in enumerate(actions):
                aname = action.get("action", action.get("name", f"action_{i}"))
                text = f"# Action: {aname}\n{json.dumps(action, indent=2)}"
                all_chunks.append({
                    "id": f"action_{aname}_{i}",
                    "text": text,
                    "metadata": {
                        "type": "action_reference",
                        "category": "action",
                        "widget": aname,
                        "source": "actions",
                    },
                })
        elif isinstance(actions, dict):
            for key, val in actions.items():
                text = f"# Action: {key}\n{json.dumps(val, indent=2)}"
                all_chunks.append({
                    "id": f"action_{key}",
                    "text": text,
                    "metadata": {
                        "type": "action_reference",
                        "category": "action",
                        "widget": key,
                        "source": "actions",
                    },
                })

    return all_chunks


if __name__ == "__main__":
    chunks = load_all_chunks()
    print(f"Total chunks: {len(chunks)}")
    by_type = {}
    for c in chunks:
        t = c["metadata"]["type"]
        by_type[t] = by_type.get(t, 0) + 1
    for t, count in sorted(by_type.items()):
        print(f"  {t}: {count}")
