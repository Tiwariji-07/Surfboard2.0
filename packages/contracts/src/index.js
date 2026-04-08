export const EDIT_RUN_PHASES = [
    'ingest_request',
    'load_context',
    'select_scope',
    'read_files',
    'optional_knowledge_lookup',
    'plan_changes',
    'generate_patch_set',
    'validate_patch_set',
    'interrupt_for_approval',
    'apply_changes',
    'post_apply_validate',
    'finish'
];

export const STREAM_EVENT_TYPES = {
    STATUS: 'status',
    MESSAGE: 'message',
    TOOL_REQUEST: 'tool_request',
    PATCH_PROPOSED: 'patch_proposed',
    APPLY_REQUEST: 'apply_request',
    VALIDATION_RESULT: 'validation_result',
    INTERRUPT: 'interrupt',
    APPLY_RESULT: 'apply_result',
    ERROR: 'error',
    DONE: 'done'
};

export const EDIT_AGENT_TOOL_NAMES = {
    GET_ACTIVE_PAGE_CONTEXT: 'get_active_page_context',
    GET_PROJECT_TREE: 'get_project_tree',
    READ_PROJECT_FILE: 'read_project_file',
    READ_PAGE_BUNDLE: 'read_page_bundle',
    SEARCH_PROJECT_FILES: 'search_project_files',
    SEARCH_WM_KNOWLEDGE: 'search_wm_knowledge',
    APPLY_PROJECT_FILE: 'apply_project_file',
    VALIDATE_PAGE_CHANGES: 'validate_page_changes'
};
