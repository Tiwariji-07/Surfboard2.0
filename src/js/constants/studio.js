function getManifestSafe() {
    try {
        return chrome.runtime?.getManifest?.() || null;
    } catch (error) {
        return null;
    }
}

function getConfiguredMatchPatterns() {
    const manifest = getManifestSafe();
    const contentScriptMatches = manifest.content_scripts?.flatMap((entry) => entry.matches || []) || [];
    return [...new Set(contentScriptMatches.length ? contentScriptMatches : ['https://platform.wavemaker.ai/*'])];
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
