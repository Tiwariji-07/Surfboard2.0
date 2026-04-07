import { RUNTIME_MESSAGES } from '../constants/messages.js';

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
                .finally(() => {
                    this.initializationPromise = null;
                });
        }

        await this.initializationPromise;
    }

    async fetchJson(url) {
        await this.initialize();

        const response = await fetch(url, {
            method: 'GET',
            credentials: 'include',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                Cookie: `auth_cookie=${this.authCookie}`
            }
        });

        if (!response.ok) {
            if (response.status === 401) {
                this.authCookie = null;
                await this.initialize();
                return this.fetchJson(url);
            }

            throw new Error(`Studio API request failed: ${response.status} ${response.statusText}`);
        }

        return response.json();
    }

    async getProjectServices(projectId) {
        return this.fetchJson(`${this.projectBaseUrl}/${projectId}/services`);
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
