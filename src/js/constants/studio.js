const manifest = chrome.runtime.getManifest();

function getConfiguredMatchPatterns() {
    const contentScriptMatches = manifest.content_scripts?.flatMap((entry) => entry.matches || []) || [];
    return [...new Set(contentScriptMatches)];
}

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function convertMatchPatternToRegex(pattern) {
    const escaped = escapeRegex(pattern).replace(/\\\*/g, '.*');
    return new RegExp(`^${escaped}$`);
}

export function isConfiguredStudioUrl(url) {
    if (!url) {
        return false;
    }

    return getConfiguredMatchPatterns().some((pattern) => convertMatchPatternToRegex(pattern).test(url));
}

export function getStudioOrigin(url) {
    try {
        return new URL(url).origin;
    } catch (error) {
        const firstPattern = getConfiguredMatchPatterns()[0] || 'https://platform.wavemaker.ai/*';
        return firstPattern.replace(/\/\*$/, '');
    }
}

export function getConfiguredStudioPatterns() {
    return getConfiguredMatchPatterns();
}
