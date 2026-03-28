import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import { FreeAIConfig, getActiveApiKey, getBaseUrl } from './config';

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface ChatResponse {
    content: string;
    model: string;
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export class APIClient {
    private config: FreeAIConfig;

    constructor(config: FreeAIConfig) {
        this.config = config;
    }

    updateConfig(config: FreeAIConfig): void {
        this.config = config;
    }

    async chat(messages: ChatMessage[], model?: string): Promise<ChatResponse> {
        const useModel = model || this.config.model;

        if (this.config.provider === 'anthropic') {
            return this.chatAnthropic(messages, useModel);
        }
        if (this.config.provider === 'google') {
            return this.chatGoogle(messages, useModel);
        }
        return this.chatOpenAICompatible(messages, useModel);
    }

    async chatStream(
        messages: ChatMessage[],
        model: string | undefined,
        onChunk: (text: string) => void,
        onDone: () => void,
        onError: (err: Error) => void
    ): Promise<void> {
        const useModel = model || this.config.model;

        if (this.config.provider === 'anthropic') {
            return this.streamAnthropic(messages, useModel, onChunk, onDone, onError);
        }
        if (this.config.provider === 'google') {
            // Google doesn't have simple SSE streaming, fall back to non-stream
            try {
                const resp = await this.chatGoogle(messages, useModel);
                onChunk(resp.content);
                onDone();
            } catch (e: any) {
                onError(e);
            }
            return;
        }
        return this.streamOpenAICompatible(messages, useModel, onChunk, onDone, onError);
    }

    private async chatOpenAICompatible(messages: ChatMessage[], model: string): Promise<ChatResponse> {
        const url = getBaseUrl(this.config);
        const apiKey = getActiveApiKey(this.config);

        const body = JSON.stringify({
            model,
            messages,
            max_tokens: this.config.maxTokens,
            stream: false,
        });

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };
        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }
        if (this.config.provider === 'openrouter') {
            headers['HTTP-Referer'] = 'https://free.ai';
            headers['X-Title'] = 'Free.ai Coder';
        }

        const data = await this.request(url, 'POST', headers, body);
        const json = JSON.parse(data);

        if (json.error) {
            throw new Error(json.error.message || JSON.stringify(json.error));
        }

        return {
            content: json.choices?.[0]?.message?.content || '',
            model: json.model || model,
            usage: json.usage,
        };
    }

    private async chatAnthropic(messages: ChatMessage[], model: string): Promise<ChatResponse> {
        const apiKey = getActiveApiKey(this.config);
        const systemMsg = messages.find(m => m.role === 'system');
        const nonSystemMsgs = messages.filter(m => m.role !== 'system');

        const body: any = {
            model,
            max_tokens: this.config.maxTokens,
            messages: nonSystemMsgs.map(m => ({ role: m.role, content: m.content })),
        };
        if (systemMsg) {
            body.system = systemMsg.content;
        }

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        };

        const data = await this.request(getBaseUrl(this.config), 'POST', headers, JSON.stringify(body));
        const json = JSON.parse(data);

        if (json.error) {
            throw new Error(json.error.message || JSON.stringify(json.error));
        }

        return {
            content: json.content?.[0]?.text || '',
            model: json.model || model,
            usage: json.usage ? {
                prompt_tokens: json.usage.input_tokens,
                completion_tokens: json.usage.output_tokens,
                total_tokens: json.usage.input_tokens + json.usage.output_tokens,
            } : undefined,
        };
    }

    private async chatGoogle(messages: ChatMessage[], model: string): Promise<ChatResponse> {
        const apiKey = getActiveApiKey(this.config);
        const modelName = model.replace('google/', '');
        const url = `${getBaseUrl(this.config)}/${modelName}:generateContent?key=${apiKey}`;

        const contents = messages
            .filter(m => m.role !== 'system')
            .map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }],
            }));

        const systemMsg = messages.find(m => m.role === 'system');
        const body: any = { contents };
        if (systemMsg) {
            body.systemInstruction = { parts: [{ text: systemMsg.content }] };
        }

        const headers = { 'Content-Type': 'application/json' };
        const data = await this.request(url, 'POST', headers, JSON.stringify(body));
        const json = JSON.parse(data);

        if (json.error) {
            throw new Error(json.error.message || JSON.stringify(json.error));
        }

        return {
            content: json.candidates?.[0]?.content?.parts?.[0]?.text || '',
            model: modelName,
        };
    }

    private async streamOpenAICompatible(
        messages: ChatMessage[],
        model: string,
        onChunk: (text: string) => void,
        onDone: () => void,
        onError: (err: Error) => void
    ): Promise<void> {
        const url = getBaseUrl(this.config);
        const apiKey = getActiveApiKey(this.config);

        const body = JSON.stringify({
            model,
            messages,
            max_tokens: this.config.maxTokens,
            stream: true,
        });

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };
        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }
        if (this.config.provider === 'openrouter') {
            headers['HTTP-Referer'] = 'https://free.ai';
            headers['X-Title'] = 'Free.ai Coder';
        }

        this.streamRequest(url, 'POST', headers, body, onChunk, onDone, onError);
    }

    private async streamAnthropic(
        messages: ChatMessage[],
        model: string,
        onChunk: (text: string) => void,
        onDone: () => void,
        onError: (err: Error) => void
    ): Promise<void> {
        const apiKey = getActiveApiKey(this.config);
        const systemMsg = messages.find(m => m.role === 'system');
        const nonSystemMsgs = messages.filter(m => m.role !== 'system');

        const body: any = {
            model,
            max_tokens: this.config.maxTokens,
            messages: nonSystemMsgs.map(m => ({ role: m.role, content: m.content })),
            stream: true,
        };
        if (systemMsg) {
            body.system = systemMsg.content;
        }

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        };

        this.streamRequest(getBaseUrl(this.config), 'POST', headers, JSON.stringify(body), (raw: string) => {
            // Anthropic SSE events: content_block_delta has the text
            if (raw.includes('"type":"content_block_delta"')) {
                try {
                    const json = JSON.parse(raw);
                    if (json.delta?.text) {
                        onChunk(json.delta.text);
                    }
                } catch { /* ignore parse errors in stream */ }
            }
        }, onDone, onError);
    }

    private request(url: string, method: string, headers: Record<string, string>, body: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const parsed = new URL(url);
            const mod = parsed.protocol === 'https:' ? https : http;

            const req = mod.request({
                hostname: parsed.hostname,
                port: parsed.port,
                path: parsed.pathname + parsed.search,
                method,
                headers: {
                    ...headers,
                    'Content-Length': Buffer.byteLength(body),
                },
            }, (res) => {
                let data = '';
                res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 400) {
                        reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                    } else {
                        resolve(data);
                    }
                });
            });

            req.on('error', reject);
            req.write(body);
            req.end();
        });
    }

    private streamRequest(
        url: string,
        method: string,
        headers: Record<string, string>,
        body: string,
        onChunk: (text: string) => void,
        onDone: () => void,
        onError: (err: Error) => void
    ): void {
        const parsed = new URL(url);
        const mod = parsed.protocol === 'https:' ? https : http;

        const req = mod.request({
            hostname: parsed.hostname,
            port: parsed.port,
            path: parsed.pathname + parsed.search,
            method,
            headers: {
                ...headers,
                'Content-Length': Buffer.byteLength(body),
            },
        }, (res) => {
            if (res.statusCode && res.statusCode >= 400) {
                let data = '';
                res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
                res.on('end', () => onError(new Error(`HTTP ${res.statusCode}: ${data}`)));
                return;
            }

            let buffer = '';
            res.on('data', (chunk: Buffer) => {
                buffer += chunk.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const payload = line.slice(6).trim();
                        if (payload === '[DONE]') {
                            onDone();
                            return;
                        }
                        try {
                            const json = JSON.parse(payload);
                            const text = json.choices?.[0]?.delta?.content;
                            if (text) {
                                onChunk(text);
                            }
                        } catch {
                            // For non-OpenAI compatible streams, pass raw data
                            onChunk(payload);
                        }
                    }
                }
            });

            res.on('end', onDone);
        });

        req.on('error', onError);
        req.write(body);
        req.end();
    }
}
