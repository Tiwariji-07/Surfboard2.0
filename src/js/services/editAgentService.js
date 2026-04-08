import { DEFAULT_EDIT_AGENT_BASE_URL, normalizeEditAgentBaseUrl } from '../constants/editAgent.js';
import { RUNTIME_MESSAGES } from '../constants/messages.js';
import { normalizeExtensionContextError } from '../utils/extensionContext.js';

class EditAgentService {
    constructor() {
        this.baseUrl = DEFAULT_EDIT_AGENT_BASE_URL;
        this.initialized = false;
        this.initializationPromise = null;
    }

    async initialize() {
        if (this.initialized) {
            return;
        }

        if (!this.initializationPromise) {
            this.initializationPromise = new Promise((resolve) => {
                chrome.storage.sync.get(['editAgentBaseUrl'], (result) => {
                    this.baseUrl = normalizeEditAgentBaseUrl(result.editAgentBaseUrl);
                    this.initialized = true;
                    resolve();
                });
            }).finally(() => {
                this.initializationPromise = null;
            });
        }

        await this.initializationPromise;
    }

    setBaseUrl(baseUrl) {
        this.baseUrl = normalizeEditAgentBaseUrl(baseUrl);
        this.initialized = true;
    }

    async sendRequest({ path, method = 'GET', body } = {}) {
        await this.initialize();

        if (!path) {
            throw new Error('Edit agent request path is required');
        }

        return new Promise((resolve, reject) => {
            try {
                chrome.runtime.sendMessage(
                    {
                        type: RUNTIME_MESSAGES.EDIT_AGENT_REQUEST,
                        data: {
                            baseUrl: this.baseUrl,
                            path,
                            method,
                            body
                        }
                    },
                    (response) => {
                        if (chrome.runtime.lastError) {
                            reject(normalizeExtensionContextError(chrome.runtime.lastError));
                            return;
                        }

                        if (!response?.success) {
                            reject(new Error(response?.error || 'Edit agent request failed'));
                            return;
                        }

                        resolve(response.data);
                    }
                );
            } catch (error) {
                reject(normalizeExtensionContextError(error));
            }
        });
    }

    async getHealth() {
        return this.sendRequest({
            path: '/health'
        });
    }

    async getCapabilities() {
        return this.sendRequest({
            path: '/capabilities'
        });
    }

    async createEditRun(payload) {
        return this.sendRequest({
            path: '/edit',
            method: 'POST',
            body: payload
        });
    }
}

export default new EditAgentService();
