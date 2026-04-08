# Edit Agent

This workspace is the backend home for Surfboard's durable edit workflow.

Current state:

- Exposes a minimal HTTP bootstrap server
- Reserves `/edit` for LangGraph-driven orchestration
- Imports shared contracts and prompts from workspace packages

Planned responsibilities:

- Maintain edit-session state with LangGraph threads/checkpoints
- Plan file scope and patch sets
- Stream progress updates back to the extension
- Pause for approval before writes
- Request Studio-side file IO through the extension bridge
