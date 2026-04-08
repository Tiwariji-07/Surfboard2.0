import { Command, END, START, StateGraph, StateSchema } from '@langchain/langgraph';
import * as z from 'zod';

import { STREAM_EVENT_TYPES } from '../../../../packages/contracts/src/index.js';
import { EDIT_AGENT_SYSTEM_PROMPT } from '../../../../packages/prompts/src/index.js';
import { callLiteLLMJson, extractJsonObject } from '../lib/litellm.js';

const EditState = new StateSchema({
    intent: z.string(),
    projectId: z.string(),
    pageName: z.string(),
    activeFile: z.string().default(''),
    activeFileType: z.string().default('script'),
    source: z.string().default(''),
    context: z.object({
        apiContext: z.any().optional(),
        cursor: z.any().nullable().optional(),
        language: z.string().default('javascript'),
        pageFiles: z.object({
            markup: z.string().default(''),
            script: z.string().default(''),
            styles: z.string().default(''),
            variables: z.any().optional()
        }),
        symbols: z.any().optional()
    }),
    modelConfig: z.object({
        apiKey: z.string().default(''),
        baseUrl: z.string().default(''),
        model: z.string().default('')
    }),
    runId: z.string().default(''),
    targetFileType: z.string().default('script'),
    targetFileName: z.string().default(''),
    targetScope: z.string().default('page'),
    projectSourcePath: z.string().default(''),
    writeResourcePath: z.string().default(''),
    originalContent: z.string().default(''),
    updatedContent: z.string().default(''),
    summary: z.string().default(''),
    validationMessage: z.string().default(''),
    attemptCount: z.number().default(0),
    feedback: z.string().default(''),
    projectTree: z.any().nullable().default(null),
    error: z.string().default('')
});

function emit(config, event) {
    config.writer?.(event);
}

function truncateJson(value, maxLength = 2000) {
    try {
        const serialized = JSON.stringify(value, null, 2);
        return serialized.length > maxLength ? `${serialized.slice(0, maxLength)}\n...truncated...` : serialized;
    } catch (error) {
        return '';
    }
}

function getTargetDescriptor(state, treeResult = null) {
    const type = inferTargetFileType(state);
    if (type === 'variables') {
        return getVariablesTargetDescriptor(state, treeResult);
    }

    return getStandardTargetDescriptor(state, type);
}

function getStandardTargetDescriptor(state, type) {
    const pageName = state.pageName || 'Main';
    const extensionByType = {
        markup: 'html',
        style: 'css',
        script: 'js'
    };
    const extension = extensionByType[type];
    const fileName = `${pageName}.${extension}`;

    return {
        targetFileType: type,
        targetFileName: fileName,
        targetScope: 'page',
        projectSourcePath: `src/main/webapp/pages/${pageName}/${fileName}`,
        writeResourcePath: `pages/${pageName}/${fileName}`
    };
}

function getVariablesTargetDescriptor(state, treeResult) {
    const pageName = state.pageName || 'Main';
    const scope = inferVariablesScope(state.intent);
    const treeEntries = Array.isArray(treeResult?.matches)
        ? treeResult.matches
        : Array.isArray(treeResult?.entries)
          ? treeResult.entries
          : [];
    const preferredPaths =
        scope === 'app'
            ? ['/src/main/webapp/app.variables.json', '/src/main/webapp/variables.json']
            : [
                  `/src/main/webapp/pages/${pageName}/${pageName}.variables.json`,
                  `/src/main/webapp/pages/${pageName}/variables.json`
              ];
    const matchedPath =
        treeEntries.find((entry) => preferredPaths.includes(String(entry?.path || '')))?.path || '';
    const projectSourcePath = matchedPath
        ? String(matchedPath).replace(/^\//, '')
        : scope === 'app'
          ? 'src/main/webapp/app.variables.json'
          : `src/main/webapp/pages/${pageName}/${pageName}.variables.json`;
    const fileName =
        projectSourcePath.split('/').pop() || (scope === 'app' ? 'app.variables.json' : `${pageName}.variables.json`);
    const writeResourcePath = projectSourcePath.replace(/^src\/main\/webapp\//, '');

    return {
        targetFileType: 'variables',
        targetFileName: fileName,
        targetScope: scope,
        projectSourcePath,
        writeResourcePath
    };
}

function inferTargetFileType(state) {
    const activeFileType = ['markup', 'style', 'script'].includes(state.activeFileType) ? state.activeFileType : '';
    const intent = String(state.intent || '').toLowerCase();

    if (isVariablesIntent(intent)) {
        return 'variables';
    }

    if (/\b(css|style|styles|class|padding|margin|color|font|layout)\b/.test(intent)) {
        return 'style';
    }

    if (
        /\b(bind|binding|caption|label|placeholder|widget|markup|html|datavalue|dataset|show|hide)\b/.test(intent)
    ) {
        return 'markup';
    }

    if (/\b(function|method|script|javascript|js|handler|onclick|onready|service|api|logic)\b/.test(intent)) {
        return 'script';
    }

    return activeFileType || 'script';
}

function isVariablesIntent(intent) {
    return (
        /\b(?:create|add|update|edit|modify|delete|remove|rename|configure)\b[\s\S]{0,40}\b(?:static|live|service)?\s*variables?\b/.test(
            intent
        ) ||
        /\b(?:static|live|service)\s*variables?\b/.test(intent) ||
        /\bcrud\b[\s\S]{0,20}\bvariables?\b/.test(intent)
    );
}

function inferVariablesScope(intent) {
    return /\b(app|application|project)\s+variables?\b/.test(String(intent || '').toLowerCase()) ? 'app' : 'page';
}

function pickRelevantTreeEntries(treeResult, projectSourcePath, pageName) {
    const entries = Array.isArray(treeResult?.matches)
        ? treeResult.matches
        : Array.isArray(treeResult?.entries)
          ? treeResult.entries
          : [];

    return entries.filter((entry) => {
        const path = String(entry?.path || '');
        return path.includes(`/pages/${pageName}/`) || path === `/${projectSourcePath}`;
    });
}

function buildEditMessages(state) {
    const feedbackSection = state.feedback ? `Previous validation feedback:\n${state.feedback}\n\n` : '';
    const relevantTreeEntries = pickRelevantTreeEntries(state.projectTree, state.projectSourcePath, state.pageName);

    return [
        {
            role: 'system',
            content: `${EDIT_AGENT_SYSTEM_PROMPT}

You are editing exactly one WaveMaker file.

Return strict JSON only with this shape:
{
  "summary": "short change summary",
  "updated_content": "full updated file content"
}

Rules:
- Modify only what the user requested.
- Preserve surrounding code and comments.
- Return the entire file in updated_content.
- Do not use markdown fences.
- If adding a helper function, place it in a sensible location and keep existing style.
- If the target is a variables JSON file, preserve valid JSON structure and modify only the relevant variable definitions.`
        },
        {
            role: 'user',
            content: `Request:
${state.intent}

Page:
${state.pageName}

Target file:
${state.targetFileName} (${state.targetFileType}, ${state.targetScope})

Relevant project tree entries:
${truncateJson(relevantTreeEntries, 1200)}

Known page symbols:
${truncateJson(state.context?.symbols, 1200)}

Page variables and services:
${truncateJson(state.context?.apiContext, 1200)}

${feedbackSection}Current canonical file content:
${state.originalContent}`
        }
    ];
}

function validateEditedContent(state) {
    if (!state.updatedContent || !state.updatedContent.trim()) {
        return 'The edit agent returned empty file content.';
    }

    if (state.updatedContent === state.originalContent) {
        return 'The edit agent did not change the file.';
    }

    if (state.targetFileType === 'script') {
        try {
            // Parse-only validation for page script output.
            // eslint-disable-next-line no-new-func
            new Function(state.updatedContent);
        } catch (error) {
            return `Updated script is not valid JavaScript: ${error.message}`;
        }
    }

    if (state.targetFileType === 'variables') {
        try {
            JSON.parse(state.updatedContent);
        } catch (error) {
            return `Updated variables definition is not valid JSON: ${error.message}`;
        }
    }

    return '';
}

function inferBindingSuffix(rawSuffix) {
    const suffix = String(rawSuffix || '').trim().toLowerCase();
    if (!suffix) {
        return '';
    }

    if (suffix === 'data' || suffix === 'dataset') {
        return 'dataSet';
    }

    return rawSuffix;
}

function normalizeBindingSource(rawSource, rawSuffix) {
    const source = String(rawSource || '').trim();
    if (!source) {
        return '';
    }

    let normalized = source
        .replace(/^Page\./, '')
        .replace(/^Variables\./, 'Variables.')
        .replace(/^Page\.Variables\./, 'Variables.');

    if (!/^Variables\./.test(normalized) && !/^Widgets\./.test(normalized)) {
        normalized = `Variables.${normalized}`;
    }

    const suffix = inferBindingSuffix(rawSuffix);
    if (!suffix) {
        return normalized;
    }

    if (normalized.toLowerCase().endsWith(`.${suffix.toLowerCase()}`)) {
        return normalized;
    }

    return `${normalized}.${suffix}`;
}

function replaceOrInsertAttribute(openingTag, attributeName, attributeValue) {
    const attributePattern = new RegExp(`\\s${attributeName}\\s*=\\s*(['"]).*?\\1`, 'i');
    const nextAttribute = ` ${attributeName}="${attributeValue}"`;

    if (attributePattern.test(openingTag)) {
        return openingTag.replace(attributePattern, nextAttribute);
    }

    return openingTag.replace(/\s*(\/?)>$/, `${nextAttribute}$&`);
}

function tryDeterministicMarkupEdit(state) {
    if (state.targetFileType !== 'markup') {
        return null;
    }

    const intent = String(state.intent || '').trim();
    const content = String(state.originalContent || '');
    if (!intent || !content) {
        return null;
    }

    const directPattern =
        /\b(?:bind|set|connect)\s+([A-Za-z0-9_$-]+)\s+(caption|label|placeholder|datavalue|value|dataset)\s+to\s+([A-Za-z0-9_$.]+)(?:\s+(data|dataset))?\b/i;
    const inversePattern =
        /\b(?:bind|set|connect)\s+(caption|label|placeholder|datavalue|value|dataset)\s+(?:of|for)\s+([A-Za-z0-9_$-]+)\s+to\s+([A-Za-z0-9_$.]+)(?:\s+(data|dataset))?\b/i;

    const directMatch = intent.match(directPattern);
    const inverseMatch = intent.match(inversePattern);
    const widgetName = directMatch?.[1] || inverseMatch?.[2] || '';
    const propertyName = directMatch?.[2] || inverseMatch?.[1] || '';
    const rawSource = directMatch?.[3] || inverseMatch?.[3] || '';
    const rawSuffix = directMatch?.[4] || inverseMatch?.[4] || '';

    if (!widgetName || !propertyName || !rawSource) {
        return null;
    }

    const bindingSource = normalizeBindingSource(rawSource, rawSuffix);
    if (!bindingSource) {
        return null;
    }

    const widgetTagPattern = new RegExp(`<[^>]*\\bname=(["'])${widgetName}\\1[^>]*>`, 'i');
    const matchedTag = content.match(widgetTagPattern)?.[0];
    if (!matchedTag) {
        return null;
    }

    const updatedTag = replaceOrInsertAttribute(matchedTag, propertyName, `bind:${bindingSource}`);
    if (updatedTag === matchedTag) {
        return null;
    }

    return {
        updatedContent: content.replace(matchedTag, updatedTag),
        summary: `Bound ${widgetName} ${propertyName} to ${bindingSource}`
    };
}

export function createEditWorkflow({ requestTool }) {
    const collectProjectTree = async (state, config) => {
        const focusPathPrefixes = isVariablesIntent(state.intent)
            ? [`src/main/webapp/pages/${state.pageName}`, 'src/main/webapp']
            : [`src/main/webapp/pages/${state.pageName}`, 'src/main/webapp/pages'];

        emit(config, {
            type: STREAM_EVENT_TYPES.STATUS,
            phase: 'select_scope',
            message: 'Resolving the target file from the project tree.'
        });

        const treeResult = await requestTool('get_project_tree', {
            projectId: state.projectId,
            pageName: state.pageName,
            focusPathPrefixes,
            limit: 400
        });
        const targetDescriptor = getTargetDescriptor(state, treeResult);

        return new Command({
            update: {
                ...targetDescriptor,
                projectTree: treeResult
            },
            goto: 'readTargetFile'
        });
    };

    const readTargetFile = async (state, config) => {
        emit(config, {
            type: STREAM_EVENT_TYPES.STATUS,
            phase: 'read_files',
            message: `Reading canonical content from ${state.projectSourcePath}.`
        });

        const originalContent = await requestTool('read_project_file', {
            projectId: state.projectId,
            projectPath: state.projectSourcePath
        });

        if (!String(originalContent || '').trim()) {
            return new Command({
                update: {
                    error: `No canonical content was available for ${state.projectSourcePath}.`
                },
                goto: 'finish'
            });
        }

        return new Command({
            update: {
                originalContent
            },
            goto: 'generatePatch'
        });
    };

    const generatePatch = async (state, config) => {
        const deterministicEdit = tryDeterministicMarkupEdit(state);
        if (deterministicEdit) {
            emit(config, {
                type: STREAM_EVENT_TYPES.STATUS,
                phase: 'generate_patch_set',
                message: `Generated a deterministic WaveMaker markup update for ${state.targetFileName}.`
            });

            emit(config, {
                type: STREAM_EVENT_TYPES.PATCH_PROPOSED,
                summary: deterministicEdit.summary,
                files: [state.targetFileName]
            });

            return new Command({
                update: {
                    updatedContent: deterministicEdit.updatedContent,
                    summary: deterministicEdit.summary,
                    attemptCount: state.attemptCount + 1
                },
                goto: 'validatePatch'
            });
        }

        emit(config, {
            type: STREAM_EVENT_TYPES.STATUS,
            phase: 'generate_patch_set',
            message: `Generating an updated ${state.targetFileName} with LangGraph.`
        });

        const responseText = await callLiteLLMJson({
            apiKey: state.modelConfig.apiKey,
            baseUrl: state.modelConfig.baseUrl,
            model: state.modelConfig.model,
            messages: buildEditMessages(state)
        });

        const payload = extractJsonObject(responseText);
        const updatedContent = typeof payload.updated_content === 'string' ? payload.updated_content : '';
        const summary = typeof payload.summary === 'string' ? payload.summary : 'Generated file update';

        emit(config, {
            type: STREAM_EVENT_TYPES.PATCH_PROPOSED,
            summary,
            files: [state.targetFileName]
        });

        return new Command({
            update: {
                updatedContent,
                summary,
                attemptCount: state.attemptCount + 1
            },
            goto: 'validatePatch'
        });
    };

    const validatePatch = async (state, config) => {
        const validationMessage = validateEditedContent(state);

        if (validationMessage) {
            emit(config, {
                type: STREAM_EVENT_TYPES.VALIDATION_RESULT,
                status: 'failed',
                message: validationMessage
            });

            if (state.attemptCount < 2) {
                return new Command({
                    update: {
                        feedback: validationMessage,
                        validationMessage
                    },
                    goto: 'generatePatch'
                });
            }

            return new Command({
                update: {
                    error: validationMessage,
                    validationMessage
                },
                goto: 'finish'
            });
        }

        emit(config, {
            type: STREAM_EVENT_TYPES.VALIDATION_RESULT,
            status: 'passed',
            message: 'Generated content passed local validation.'
        });

        emit(config, {
            type: STREAM_EVENT_TYPES.APPLY_REQUEST,
            fileName: state.targetFileName,
            fileType: state.targetFileType,
            resourcePath: state.writeResourcePath,
            projectPath: state.projectSourcePath,
            content: state.updatedContent,
            summary: state.summary
        });

        return new Command({
            update: {
                validationMessage: 'passed'
            },
            goto: 'finish'
        });
    };

    const finish = async (state, config) => {
        if (state.error) {
            emit(config, {
                type: STREAM_EVENT_TYPES.ERROR,
                error: state.error
            });
            return {};
        }

        emit(config, {
            type: STREAM_EVENT_TYPES.DONE,
            message: `Prepared ${state.targetFileName}. The extension should apply it now.`,
            summary: state.summary,
            resourcePath: state.writeResourcePath,
            projectPath: state.projectSourcePath
        });
        return {};
    };

    return new StateGraph(EditState)
        .addNode('collectProjectTree', collectProjectTree, { ends: ['readTargetFile'] })
        .addNode('readTargetFile', readTargetFile, { ends: ['generatePatch', 'finish'] })
        .addNode('generatePatch', generatePatch, { ends: ['validatePatch'] })
        .addNode('validatePatch', validatePatch, { ends: ['generatePatch', 'finish'] })
        .addNode('finish', finish)
        .addEdge(START, 'collectProjectTree')
        .addEdge('finish', END)
        .compile();
}

export async function streamEditWorkflow(input, { writer, requestTool }) {
    const graph = createEditWorkflow({ requestTool });
    const stream = await graph.stream(input, {
        streamMode: 'custom'
    });

    for await (const chunk of stream) {
        writer(chunk);
    }
}
