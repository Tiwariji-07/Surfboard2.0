import { RUNTIME_MESSAGES } from '../constants/messages.js';
import { normalizeExtensionContextError } from '../utils/extensionContext.js';

class StudioApiService {
    constructor() {
        this.authCookie = null;
        this.initializationPromise = null;
        this.projectBaseUrl = `${window.location.origin}/studio/services/projects`;
        this.prefabsUrl = `${window.location.origin}/studio/services/prefabs`;
    }

    async initialize() {
        if (this.authCookie) {
            return;
        }

        if (!this.initializationPromise) {
            this.initializationPromise = chrome.runtime
                .sendMessage({ type: RUNTIME_MESSAGES.GET_AUTH_COOKIE })
                .then((response) => {
                    if (!response?.cookie) {
                        throw new Error('Authentication cookie not found');
                    }

                    this.authCookie = response.cookie;
                })
                .catch((error) => {
                    throw normalizeExtensionContextError(error);
                })
                .finally(() => {
                    this.initializationPromise = null;
                });
        }

        await this.initializationPromise;
    }

    async request(url, options = {}) {
        await this.initialize();

        const {
            method = 'GET',
            accept = 'application/json',
            contentType,
            responseType = 'json',
            body
        } = options;
        const headers = {
            Accept: accept,
            Cookie: `auth_cookie=${this.authCookie}`
        };

        if (contentType) {
            headers['Content-Type'] = contentType;
        }

        const response = await fetch(url, {
            method,
            credentials: 'include',
            headers,
            body
        });

        if (!response.ok) {
            if (response.status === 401) {
                this.authCookie = null;
                await this.initialize();
                return this.request(url, options);
            }

            throw new Error(`Studio API request failed: ${response.status} ${response.statusText}`);
        }

        if (responseType === 'text') {
            return response.text();
        }

        return response.json();
    }

    async fetchJson(url) {
        return this.request(url, {
            method: 'GET',
            accept: 'application/json',
            responseType: 'json'
        });
    }

    async fetchText(url) {
        return this.request(url, {
            method: 'GET',
            accept: 'text/plain, */*',
            responseType: 'text'
        });
    }

    async postText(url, content) {
        return this.request(url, {
            method: 'POST',
            accept: 'application/json, text/plain, */*',
            contentType: 'text/plain',
            responseType: 'text',
            body: content
        });
    }

    buildProjectResourceUrl(projectId, resourcePath) {
        const normalizedProjectId = String(projectId || '').trim();
        const normalizedPath = String(resourcePath || '')
            .split('/')
            .map((segment) => segment.trim())
            .filter(Boolean)
            .map((segment) => encodeURIComponent(segment))
            .join('/');

        if (!normalizedProjectId || !normalizedPath) {
            throw new Error('Project ID and resource path are required');
        }

        return `${this.projectBaseUrl}/${encodeURIComponent(normalizedProjectId)}/${normalizedPath}`;
    }

    buildProjectContentUrl(projectId, projectPath) {
        const normalizedProjectId = String(projectId || '').trim();
        const normalizedPath = String(projectPath || '')
            .split('/')
            .map((segment) => segment.trim())
            .filter(Boolean)
            .map((segment) => encodeURIComponent(segment))
            .join('/');

        if (!normalizedProjectId || !normalizedPath) {
            throw new Error('Project ID and project path are required');
        }

        return `${this.projectBaseUrl}/${encodeURIComponent(normalizedProjectId)}/resources/content/project/${normalizedPath}`;
    }

    async readProjectTextFile(projectId, resourcePath) {
        return this.fetchText(this.buildProjectResourceUrl(projectId, resourcePath));
    }

    async readProjectContentFile(projectId, projectPath) {
        return this.fetchText(this.buildProjectContentUrl(projectId, projectPath));
    }

    async writeProjectTextFile(projectId, resourcePath, content) {
        if (typeof content !== 'string') {
            throw new Error('Project file content must be a string');
        }

        return this.postText(this.buildProjectResourceUrl(projectId, resourcePath), content);
    }

    async readPageFile(projectId, pageName, fileName) {
        return this.readProjectTextFile(projectId, `pages/${pageName}/${fileName}`);
    }

    async writePageFile(projectId, pageName, fileName, content) {
        return this.writeProjectTextFile(projectId, `pages/${pageName}/${fileName}`, content);
    }

    async getProjectServices(projectId) {
        return this.fetchJson(`${this.projectBaseUrl}/${projectId}/services`);
    }

    async getProjectTree(projectId) {
        return this.fetchJson(`${this.projectBaseUrl}/${projectId}/resources/info/project`);
    }

    async getProjectVariables(projectId) {
        return this.fetchJson(`${this.projectBaseUrl}/${projectId}/variables`);
    }

    async getProjectPages(projectId) {
        return this.fetchJson(`${this.projectBaseUrl}/${projectId}/pages`);
    }

    async getProjectPrefabs(projectId) {
        return this.fetchJson(`${this.prefabsUrl}?projectID=${encodeURIComponent(projectId)}`);
    }

    async getPageBundle(projectId, pageName) {
        const response = await this.fetchJson(
            `${this.projectBaseUrl}/${projectId}/pages/${encodeURIComponent(pageName)}/page.min.json`
        );

        return {
            raw: response,
            markup: this.decodeValue(response?.markup),
            script: this.decodeValue(response?.script),
            styles: this.decodeValue(response?.styles),
            variables: this.parseJsonValue(this.decodeValue(response?.variables, '{}'), {})
        };
    }

    decodeValue(value, fallback = '') {
        if (typeof value !== 'string') {
            return fallback;
        }

        try {
            return decodeURIComponent(value.replace(/\+/g, '%20'));
        } catch (error) {
            return value;
        }
    }

    parseJsonValue(value, fallback) {
        if (typeof value !== 'string' || !value.trim()) {
            return fallback;
        }

        try {
            return JSON.parse(value);
        } catch (error) {
            return fallback;
        }
    }
}

export default StudioApiService;
