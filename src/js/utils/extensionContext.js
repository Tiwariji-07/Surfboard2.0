export function isExtensionContextInvalidated(error) {
    const message = String(error?.message || error || '');
    return /extension context invalidated/i.test(message);
}

export function normalizeExtensionContextError(error) {
    if (isExtensionContextInvalidated(error)) {
        return new Error('The extension was reloaded. Refresh this WaveMaker tab and try again.');
    }

    return error instanceof Error ? error : new Error(String(error));
}
