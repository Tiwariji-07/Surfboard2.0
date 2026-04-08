import { randomUUID } from 'node:crypto';

const runSessions = new Map();

export function createRunSession(writer) {
    const runId = randomUUID();
    const session = {
        runId,
        writer,
        pendingToolCalls: new Map(),
        createdAt: Date.now()
    };

    runSessions.set(runId, session);
    return session;
}

export function getRunSession(runId) {
    return runSessions.get(runId) || null;
}

export function closeRunSession(runId) {
    const session = runSessions.get(runId);
    if (!session) {
        return;
    }

    for (const pendingCall of session.pendingToolCalls.values()) {
        pendingCall.reject(new Error('Run session closed before tool result was received'));
    }

    runSessions.delete(runId);
}

export function requestTool(session, tool, input) {
    const toolCallId = randomUUID();

    const promise = new Promise((resolve, reject) => {
        session.pendingToolCalls.set(toolCallId, {
            resolve,
            reject,
            tool
        });
    });

    session.writer({
        type: 'tool_request',
        runId: session.runId,
        toolCallId,
        tool,
        input
    });

    return promise;
}

export function resolveToolResult(runId, toolCallId, payload) {
    const session = getRunSession(runId);
    if (!session) {
        throw new Error(`Unknown run session: ${runId}`);
    }

    const pendingCall = session.pendingToolCalls.get(toolCallId);
    if (!pendingCall) {
        throw new Error(`Unknown tool call: ${toolCallId}`);
    }

    session.pendingToolCalls.delete(toolCallId);

    if (payload?.error) {
        pendingCall.reject(new Error(payload.error));
        return;
    }

    pendingCall.resolve(payload?.result);
}
