import http from 'node:http';
import { fileURLToPath } from 'node:url';

import {
    EDIT_AGENT_TOOL_NAMES,
    EDIT_RUN_PHASES,
    STREAM_EVENT_TYPES
} from '../../../packages/contracts/src/index.js';
import { EDIT_AGENT_SYSTEM_PROMPT } from '../../../packages/prompts/src/index.js';
import { streamEditWorkflow } from './graph/editWorkflow.js';
import {
    closeRunSession,
    createRunSession,
    requestTool,
    resolveToolResult
} from './runSessionManager.js';

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || '127.0.0.1';
const streamDelayMs = Number(process.env.EDIT_AGENT_STREAM_DELAY_MS || 120);

function sendJson(response, statusCode, payload) {
    response.writeHead(statusCode, {
        'Content-Type': 'application/json'
    });
    response.end(JSON.stringify(payload, null, 2));
}

function collectRequestBody(request) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        request.on('data', (chunk) => chunks.push(chunk));
        request.on('end', () => {
            const rawBody = Buffer.concat(chunks).toString('utf8');
            if (!rawBody) {
                resolve({});
                return;
            }

            try {
                resolve(JSON.parse(rawBody));
            } catch (error) {
                reject(new Error('Request body must be valid JSON'));
            }
        });
        request.on('error', reject);
    });
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeStreamHeaders(response) {
    if (response.headersSent) {
        return;
    }

    response.writeHead(200, {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive'
    });
}

function writeStreamEvent(response, event) {
    response.write(`${JSON.stringify(event)}\n`);
}

async function streamEditRun(response, body) {
    writeStreamHeaders(response);
    writeStreamEvent(response, {
        type: STREAM_EVENT_TYPES.STATUS,
        phase: EDIT_RUN_PHASES[0],
        message: `Received edit request for ${body.pageName || 'unknown-page'}/${body.activeFile || 'unknown-file'}.`
    });

    await delay(streamDelayMs);

    writeStreamEvent(response, {
        type: STREAM_EVENT_TYPES.STATUS,
        phase: EDIT_RUN_PHASES[1],
        message: `Loaded normalized page context for project ${body.projectId || 'unknown-project'}.`
    });

    await delay(streamDelayMs);

    writeStreamEvent(response, {
        type: STREAM_EVENT_TYPES.MESSAGE,
        content: `Intent: ${String(body.intent || '').trim() || 'No intent provided.'}`
    });

    await delay(streamDelayMs);

    const session = createRunSession((event) => {
        writeStreamEvent(response, event);
    });

    try {
        await streamEditWorkflow(
            {
                ...body,
                runId: session.runId
            },
            {
                writer: (event) => writeStreamEvent(response, event),
                requestTool: (tool, input) => requestTool(session, tool, input)
            }
        );
    } finally {
        closeRunSession(session.runId);
        response.end();
    }
}

export function createEditAgentServer() {
    return http.createServer(async (request, response) => {
        const toolResultMatch =
            request.method === 'POST' ? request.url?.match(/^\/runs\/([^/]+)\/tool-result$/) : null;

        if (request.method === 'GET' && request.url === '/health') {
            sendJson(response, 200, {
                ok: true,
                service: '@surfboard/edit-agent',
                status: 'bootstrapped'
            });
            return;
        }

        if (request.method === 'GET' && request.url === '/capabilities') {
            sendJson(response, 200, {
                service: '@surfboard/edit-agent',
                phases: EDIT_RUN_PHASES,
                streamEventTypes: STREAM_EVENT_TYPES,
                tools: EDIT_AGENT_TOOL_NAMES
            });
            return;
        }

        if (request.method === 'POST' && request.url === '/edit') {
            try {
                const body = await collectRequestBody(request);
                sendJson(response, 501, {
                    error: 'Edit orchestration is not implemented yet',
                    received: {
                        intent: body.intent || '',
                        projectId: body.projectId || '',
                        pageName: body.pageName || '',
                        activeFile: body.activeFile || ''
                    },
                    nextPhase: EDIT_RUN_PHASES[0],
                    requiredTools: [
                        EDIT_AGENT_TOOL_NAMES.GET_ACTIVE_PAGE_CONTEXT,
                        EDIT_AGENT_TOOL_NAMES.READ_PROJECT_FILE,
                        EDIT_AGENT_TOOL_NAMES.APPLY_PROJECT_FILE
                    ]
                });
            } catch (error) {
                sendJson(response, 400, {
                    error: error.message || 'Invalid edit request'
                });
            }
            return;
        }

        if (request.method === 'POST' && request.url === '/edit/stream') {
            try {
                const body = await collectRequestBody(request);
                await streamEditRun(response, body);
            } catch (error) {
                if (!response.headersSent) {
                    writeStreamHeaders(response);
                }

                if (!response.writableEnded) {
                    writeStreamEvent(response, {
                        type: STREAM_EVENT_TYPES.ERROR,
                        error: error.message || 'Failed to stream edit run'
                    });
                }

                response.end();
            }
            return;
        }

        if (toolResultMatch) {
            try {
                const body = await collectRequestBody(request);
                resolveToolResult(toolResultMatch[1], body.toolCallId, body);
                sendJson(response, 200, {
                    ok: true
                });
            } catch (error) {
                sendJson(response, 400, {
                    error: error.message || 'Invalid tool result payload'
                });
            }
            return;
        }

        if (request.method === 'GET' && request.url === '/prompt') {
            sendJson(response, 200, {
                systemPromptPreview: EDIT_AGENT_SYSTEM_PROMPT.slice(0, 400)
            });
            return;
        }

        sendJson(response, 404, {
            error: 'Not found'
        });
    });
}

function startServer() {
    const server = createEditAgentServer();
    server.listen(port, host, () => {
        console.log(`Surfboard edit-agent bootstrap listening on http://${host}:${port}`);
    });
    return server;
}

const currentFilePath = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1] && currentFilePath === process.argv[1];

if (isMainModule) {
    startServer();
}
