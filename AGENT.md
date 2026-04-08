# AGENT.md

## Purpose

This repository is a WaveMaker Studio assistant prototype implemented as a Chrome extension. It is not a native WaveMaker application and should not be treated like a normal frontend app embedded inside a WaveMaker project.

The near-term goal is to evolve it into a reliable Studio-side assistant with three separate capability lanes:

1. Inline code completion inside WaveMaker Studio editors
2. Chat and knowledge assistance using WaveMaker ecosystem sources
3. A constrained edit agent that can safely read and patch one or more project files

The main architectural rule is:

- Keep `autocomplete` fast and editor-local
- Keep `edit agent` durable and API-driven
- Do not force every feature through a single agent loop

## Current Project Shape

This repo is now being organized as a small monorepo.

Current runtime reality:

- the Chrome extension still lives at the repository root
- the root build and `dist/` output remain the active extension packaging path
- `apps/edit-agent` is the new backend workspace for the future edit agent
- `packages/*` hold shared contracts and prompts

This is intentionally incremental so existing extension behavior does not break during the split.

Key runtime pieces:

- `manifest.json`
- `src/js/content.js`
- `src/js/background.js`
- `src/js/completion/completionManager.js`
- `src/js/inject/monacoHelper.js`
- `src/js/ui/sidebar.js`
- `src/js/services/*`
- `apps/edit-agent/*`
- `packages/contracts/*`
- `packages/prompts/*`

The extension injects UI and logic into WaveMaker Studio pages and attempts to integrate with Monaco editors used inside Studio.

## What This Project Is

- A Studio companion
- A browser-injected assistant
- A WaveMaker-aware coding aid

## What This Project Is Not

- Not a native WaveMaker app
- Not a WaveMaker Prefab today
- Not a complete agent platform yet
- Not currently production-ready

## Product Direction

### 1. Autocomplete

Autocomplete should use Monaco as the primary surface.

Use Monaco for:

- reading the active unsaved buffer
- reading cursor and selection
- computing the local context window
- inserting accepted completion text

Do not run completion through a full LangGraph workflow. Completion must stay low-latency and deterministic.

### 2. Chat / Knowledge Assist

Chat can use external retrieval and WaveMaker knowledge sources. The likely backend for this is:

- `/Users/vivekr_500340/Documents/Igniters/MCPs/wm-ecosystem-agent`

That service is a good fit for:

- docs lookup
- academy lookup
- storybook lookup
- marketplace lookup
- grounded answers with citations

It is not the right runtime for keystroke-level inline completion.

#### Knowledge Assist Features

The chat and knowledge lane should support:

- page-aware Q&A using the current WaveMaker page as context
- explanations of widgets, bindings, variables, services, and event handlers
- implementation guidance grounded in WaveMaker docs and ecosystem sources
- troubleshooting help for bindings, service variables, data flows, and Studio/runtime issues
- follow-up suggestions based on the current page and recent conversation
- cited answers when information comes from external WaveMaker knowledge sources

This lane should behave like a grounded assistant, not like an autonomous editing agent by default.

### 3. Edit Agent

The edit agent is where LangGraph is justified from the start.

Expected workflow:

1. read active page context
2. inspect relevant files
3. optionally fetch WaveMaker ecosystem knowledge
4. decide edit scope
5. generate patches
6. apply edits safely
7. validate
8. retry if needed

This flow is multi-step, stateful, and tool-driven, so LangGraph is appropriate here.

## Core Architectural Rule

Use different sources of truth for different capabilities:

### Monaco-first

Use Monaco for:

- inline completion
- current unsaved editor state
- cursor-sensitive UX
- rendering inserted suggestion text

### API-first

Use WaveMaker Studio APIs for:

- reading canonical file contents
- writing saved file changes
- multi-file editing
- conflict-safe patch application
- edit-agent workflows

Do not use "simulate typing in editor and trigger save" as the primary edit path for the agent. That is fragile and should be treated as a fallback or debugging technique only.

## Desired Future Backend Shape

The preferred long-term split is:

### `/complete`

Fast endpoint for inline completion.

Inputs:

- active file type
- Monaco text window
- cursor position
- page symbol table
- optional page summary

Outputs:

- ranked completion candidates

### `/assist`

Grounded Q&A endpoint.

Inputs:

- user question
- page context
- optional chat history

Outputs:

- answer
- citations
- follow-ups

### `/edit`

LangGraph-based edit endpoint.

Inputs:

- user intent
- active page context
- optional selected file set

Outputs:

- structured plan
- proposed file patches
- validation notes
- apply/confirm lifecycle

## Minimum Useful WaveMaker Page Context

Any agent or service operating on the active page should ideally receive a normalized context object that includes:

- project id
- page name
- active file
- active file type
- cursor position
- selection
- page markup
- page JavaScript
- page CSS
- variables metadata
- widget names and types
- known bindings

Even when only a subset is available, preserve the same shape so downstream prompt/tool logic stays stable.

## Tooling Direction for the Edit Agent

The edit agent should be built around explicit tools rather than raw browser control.

Preferred tools:

- `get_active_page_context`
- `read_project_file`
- `read_page_bundle`
- `search_project_files`
- `search_wm_knowledge`
- `propose_file_patch`
- `apply_file_patch`
- `validate_page_changes`

Important principle:

- clean tool contracts matter more than adding agent complexity early

## Expected Coding Conventions

### General

- Prefer small modules with one clear responsibility
- Keep extension-side code focused on Studio integration and UI
- Keep model prompts and backend orchestration outside browser glue code where possible
- Avoid hidden coupling through message names without shared constants

### Messaging

- Centralize Chrome and window message names as constants before expanding behavior
- Keep request/response pairs explicit
- Document which side owns each message

### Context Objects

- Prefer normalized structured objects over ad hoc strings
- Keep shape stable across services
- Add fields instead of changing semantics of existing fields

### Patch Application

- Prefer structured edits or verified patches over raw string replacement
- Include stale-content detection where possible
- Treat file version drift as a normal retry condition

### Prompts

- Keep completion prompts short and focused on local code
- Keep edit-agent prompts explicit about constraints and file scope
- Pass WaveMaker-specific symbols such as `Variables.*`, `Widgets.*`, services, actions, and page names

## Known Problems in the Current Repo

These are important when editing the existing code.

### Build / Dependency Issues

- `npm run build` currently fails if local `esbuild` is missing
- `marked` is imported in source but not declared in `package.json`
- checked-in `node_modules` state may be inconsistent

### Extension Wiring Issues

- message names are inconsistent between popup, background, and content layers
- some expected messages in completion flow are never emitted
- content script does not fully implement the background contract

### Monaco Integration Issues

- helper/content-script handshake is incomplete
- editor instance acquisition is broken
- completion context offset logic is incorrect for partial context windows

### Log Flow Issues

- undefined methods are called in some paths
- some variables are referenced without declaration
- log rendering and parsing paths are partly incomplete

### Context Layer Issues

- context parsing code exists but is only partially wired
- some parser and manager assumptions do not match each other
- some modules look exploratory and should be treated carefully before reuse

## Working Assumptions for Future Contributors

- The current code is a prototype and should be refactored, not merely extended
- Reliability matters more than preserving current structure
- Completion, chat, and edit-agent flows should remain separate internally even if they share UI
- The extension should likely own WaveMaker session/auth context
- Backend services should not assume direct WaveMaker authentication unless intentionally designed that way

## Recommended Near-Term Roadmap

1. Stabilize manifest, build, and message wiring
2. Rebuild Monaco completion as a clean, minimal path
3. Add normalized page-context extraction
4. Integrate chat with `wm-ecosystem-agent`
5. Add LangGraph-based edit agent on top of API-backed file read/write

## Rules for Agents Working In This Repo

- Do not assume this is a normal web app
- Do not build edit flows around synthetic typing in Monaco
- Use Monaco for completion UX only
- Prefer API-backed reads and writes for durable file edits
- Keep completion logic outside heavy agent orchestration
- Use LangGraph for multi-step edit workflows, not for everything
- Preserve clear separation between Studio adapter code and backend intelligence code
- When adding features, document whether they are Monaco-first or API-first

## If You Are Starting New Work

Before making non-trivial changes, answer these questions:

1. Is this feature `completion`, `assist`, or `edit`?
2. Should Monaco be the source of truth here?
3. Should Studio APIs be the source of truth here?
4. Does this require tool orchestration or just a single model call?
5. Can the feature be implemented without increasing coupling between popup, content, background, and injected scripts?

If these answers are unclear, stop and define them first.
