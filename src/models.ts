export interface ModelInfo {
    id: string;
    name: string;
    provider: string;
    category: 'code' | 'chat' | 'reasoning';
    contextLength: number;
    free: boolean;
}

export const MODELS: ModelInfo[] = [
    // Free.ai hosted models (always free)
    { id: 'qwen2.5-coder-32b', name: 'Qwen 2.5 Coder 32B', provider: 'Free.ai', category: 'code', contextLength: 32768, free: true },
    { id: 'qwen2.5-72b', name: 'Qwen 2.5 72B', provider: 'Free.ai', category: 'chat', contextLength: 32768, free: true },
    { id: 'qwen2.5-7b', name: 'Qwen 2.5 7B', provider: 'Free.ai', category: 'chat', contextLength: 32768, free: true },
    { id: 'deepseek-coder-v2-lite', name: 'DeepSeek Coder V2 Lite', provider: 'Free.ai', category: 'code', contextLength: 16384, free: true },
    { id: 'mistral-7b', name: 'Mistral 7B', provider: 'Free.ai', category: 'chat', contextLength: 32768, free: true },
    { id: 'phi-3', name: 'Phi-3', provider: 'Free.ai', category: 'chat', contextLength: 4096, free: true },

    // OpenRouter models (BYOK or paid tokens)
    { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'OpenAI', category: 'chat', contextLength: 128000, free: false },
    { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI', category: 'chat', contextLength: 128000, free: false },
    { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', provider: 'Anthropic', category: 'code', contextLength: 200000, free: false },
    { id: 'anthropic/claude-haiku-3.5', name: 'Claude 3.5 Haiku', provider: 'Anthropic', category: 'code', contextLength: 200000, free: false },
    { id: 'google/gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'Google', category: 'chat', contextLength: 1048576, free: false },
    { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'Google', category: 'reasoning', contextLength: 1048576, free: false },
    { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1', provider: 'DeepSeek', category: 'reasoning', contextLength: 65536, free: false },
    { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3', provider: 'DeepSeek', category: 'code', contextLength: 65536, free: false },
    { id: 'meta-llama/llama-3.3-70b', name: 'Llama 3.3 70B', provider: 'Meta', category: 'chat', contextLength: 131072, free: false },
    { id: 'qwen/qwen-2.5-coder-32b', name: 'Qwen 2.5 Coder 32B (OR)', provider: 'Qwen', category: 'code', contextLength: 32768, free: false },
];

export function getModelById(id: string): ModelInfo | undefined {
    return MODELS.find(m => m.id === id);
}

export function getFreeModels(): ModelInfo[] {
    return MODELS.filter(m => m.free);
}

export function getCodeModels(): ModelInfo[] {
    return MODELS.filter(m => m.category === 'code');
}
