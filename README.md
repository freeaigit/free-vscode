# Free.ai Coder

Free AI coding assistant for VS Code. 346+ models, BYOK support, completely free tier available.

## Features

- **Chat sidebar** -- Ask questions about your code with full file context
- **Inline suggestions** -- AI-powered code completions as you type
- **Explain code** -- Select code and get plain-English explanations
- **Refactor** -- AI-suggested refactoring for selected code
- **Write tests** -- Auto-generate tests for your functions
- **Fix errors** -- Read editor diagnostics and suggest fixes
- **Terminal commands** -- Describe what you want, get the shell command
- **Apply diffs** -- AI changes applied directly in your editor
- **Model selector** -- Switch between 346+ models from the status bar
- **BYOK** -- Bring your own API keys for OpenAI, Anthropic, Google, OpenRouter

## Getting Started

1. Install the extension
2. (Optional) Get a Free.ai API key at [free.ai/developer](https://free.ai/developer/)
3. Open the sidebar (Free.ai icon in activity bar)
4. Start chatting!

Works out of the box with Free.ai's free tier. For higher limits, add your API key or use BYOK with your own provider keys.

## Commands

| Command | Shortcut | Description |
|---------|----------|-------------|
| Free.ai: Ask about selection | `Ctrl+Shift+A` | Ask a question about selected code |
| Free.ai: Explain code | Context menu | Explain selected code |
| Free.ai: Refactor | Context menu | Suggest refactoring |
| Free.ai: Write tests | Context menu | Generate tests |
| Free.ai: Fix errors | Context menu | Fix diagnostics |
| Free.ai: Terminal command | `Ctrl+Shift+T` | AI-powered terminal |
| Free.ai: Select model | Status bar | Switch AI model |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `freeai.apiKey` | `""` | Free.ai API key |
| `freeai.model` | `qwen2.5-coder-32b` | Default model |
| `freeai.provider` | `freeai` | AI provider |
| `freeai.safeMode` | `true` | Confirm before applying changes |
| `freeai.inlineSuggestions` | `true` | Enable inline completions |
| `freeai.openaiKey` | `""` | OpenAI API key (BYOK) |
| `freeai.anthropicKey` | `""` | Anthropic API key (BYOK) |
| `freeai.googleKey` | `""` | Google AI API key (BYOK) |
| `freeai.openrouterKey` | `""` | OpenRouter API key (BYOK) |

## License

MIT
