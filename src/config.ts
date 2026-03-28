import * as vscode from 'vscode';

export interface FreeAIConfig {
    apiKey: string;
    model: string;
    provider: 'freeai' | 'openai' | 'anthropic' | 'google' | 'openrouter';
    openaiKey: string;
    anthropicKey: string;
    googleKey: string;
    openrouterKey: string;
    safeMode: boolean;
    inlineSuggestions: boolean;
    maxTokens: number;
}

export function getConfig(): FreeAIConfig {
    const cfg = vscode.workspace.getConfiguration('freeai');
    return {
        apiKey: cfg.get<string>('apiKey', ''),
        model: cfg.get<string>('model', 'qwen2.5-coder-32b'),
        provider: cfg.get<FreeAIConfig['provider']>('provider', 'freeai'),
        openaiKey: cfg.get<string>('openaiKey', ''),
        anthropicKey: cfg.get<string>('anthropicKey', ''),
        googleKey: cfg.get<string>('googleKey', ''),
        openrouterKey: cfg.get<string>('openrouterKey', ''),
        safeMode: cfg.get<boolean>('safeMode', true),
        inlineSuggestions: cfg.get<boolean>('inlineSuggestions', true),
        maxTokens: cfg.get<number>('maxTokens', 4096),
    };
}

export function getActiveApiKey(config: FreeAIConfig): string {
    switch (config.provider) {
        case 'openai': return config.openaiKey;
        case 'anthropic': return config.anthropicKey;
        case 'google': return config.googleKey;
        case 'openrouter': return config.openrouterKey;
        default: return config.apiKey;
    }
}

export function getBaseUrl(config: FreeAIConfig): string {
    switch (config.provider) {
        case 'openai': return 'https://api.openai.com/v1/chat/completions';
        case 'anthropic': return 'https://api.anthropic.com/v1/messages';
        case 'google': return 'https://generativelanguage.googleapis.com/v1beta/models';
        case 'openrouter': return 'https://openrouter.ai/api/v1/chat/completions';
        default: return 'https://api.free.ai/v1/chat/';
    }
}
