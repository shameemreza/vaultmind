import { App, requestUrl } from 'obsidian';
import { 
    AIProvider, 
    VaultMindSettings,
    AIContext,
    SummaryOptions
} from '../types';
import { SimpleEmbeddings } from './SimpleEmbeddings';

/**
 * AIManager - Handles hot-swappable AI providers without restart
 * Manages provider lifecycle and switching dynamically
 */
export class AIManager {
    private app: App;
    private settings: VaultMindSettings;
    private currentProvider: AIProvider | null = null;
    private embeddings: SimpleEmbeddings;
    private providerCache: Map<string, AIProvider> = new Map();
    private isInitializing = false;
    
    constructor(app: App, settings: VaultMindSettings) {
        this.app = app;
        this.settings = settings;
        this.embeddings = new SimpleEmbeddings();
    }
    
    /**
     * Get or create the current AI provider
     * Hot-swappable without restart
     */
    async getProvider(): Promise<AIProvider | null> {
        const providerKey = this.getProviderKey();
        
        // If provider hasn't changed and exists, return it
        if (this.currentProvider && this.providerCache.has(providerKey)) {
            return this.currentProvider;
        }
        
        // If already initializing, wait
        if (this.isInitializing) {
            await new Promise(resolve => setTimeout(resolve, 100));
            return this.getProvider();
        }
        
        this.isInitializing = true;
        
        try {
            // Create new provider based on settings
            const provider = await this.createProvider();
            
            if (provider) {
                // Clean up old provider if different
                if (this.currentProvider && this.currentProvider !== provider) {
                    await this.currentProvider.cleanup();
                }
                
                this.currentProvider = provider;
                this.providerCache.set(providerKey, provider);
            }
            
            return this.currentProvider;
        } finally {
            this.isInitializing = false;
        }
    }
    
    /**
     * Create provider based on current settings
     */
    private async createProvider(): Promise<AIProvider | null> {
        const { aiProvider } = this.settings;
        
        if (aiProvider === 'none') {
            return null;
        }
        
        // Check cache first
        const cacheKey = this.getProviderKey();
        if (this.providerCache.has(cacheKey)) {
            return this.providerCache.get(cacheKey)!;
        }
        
        let provider: AIProvider | null = null;
        
        switch (aiProvider) {
            case 'openai': {
                if (this.settings.openAIApiKey) {
                    provider = new OpenAIProvider(this.settings);
                }
                break;
            }
                
            case 'anthropic': {
                if (this.settings.claudeApiKey) {
                    provider = new AnthropicProvider(this.settings);
                }
                break;
            }
                
            case 'ollama': {
                provider = new OllamaProvider(this.settings);
                break;
            }
            
            case 'gemini': {
                if (this.settings.geminiApiKey) {
                    const { GeminiAI } = await import('./GeminiAI');
                    provider = new GeminiAI(this.settings);
                }
                break;
            }
            
            case 'deepseek': {
                if (this.settings.deepseekApiKey) {
                    const { DeepSeekAI } = await import('./DeepSeekAI');
                    provider = new DeepSeekAI(this.settings);
                }
                break;
            }
            
            case 'grok': {
                if (this.settings.grokApiKey) {
                    const { GrokAI } = await import('./GrokAI');
                    provider = new GrokAI(this.settings);
                }
                break;
            }
                
            default: {
                // No provider for unknown types
                return null;
            }
        }
        
        if (provider) {
            try {
                await provider.initialize();
                return provider;
            } catch (error) {
                console.error(`Failed to initialize ${aiProvider} provider:`, error);
                // No fallback - just return null if provider fails
                return null;
            }
        }
        
        return null;
    }
    
    /**
     * Get cache key for current provider configuration
     */
    private getProviderKey(): string {
        const { aiProvider, openAIApiKey, claudeApiKey, ollamaEndpoint } = this.settings;
        return `${aiProvider}-${openAIApiKey || ''}-${claudeApiKey || ''}-${ollamaEndpoint || ''}`;
    }
    
    /**
     * Update settings and hot-swap provider if needed
     */
    updateSettings(settings: VaultMindSettings) {
        const oldKey = this.getProviderKey();
        this.settings = settings;
        const newKey = this.getProviderKey();
        
        // If provider config changed, clear cache to force recreation
        if (oldKey !== newKey) {
            this.providerCache.delete(oldKey);
        }
    }
    
    /**
     * Test current provider connectivity
     */
    async testConnection(): Promise<boolean> {
        const provider = await this.getProvider();
        if (!provider) return false;
        
        try {
            // Simple test query
            const response = await provider.answerQuestion('Test', 'Test context');
            return response.length > 0;
        } catch {
            return false;
        }
    }
    
    /**
     * Clean up all providers
     */
    async cleanup() {
        for (const provider of this.providerCache.values()) {
            await provider.cleanup();
        }
        this.providerCache.clear();
        this.currentProvider = null;
    }
}

/**
 * OpenAI Provider
 */
class OpenAIProvider implements AIProvider {
    name = 'OpenAI';
    type: 'local' | 'cloud' | 'external' = 'cloud';
    private settings: VaultMindSettings;
    
    constructor(settings: VaultMindSettings) {
        this.settings = settings;
    }
    
    async initialize(): Promise<void> {
        // Test API key
        const response = await requestUrl({
            url: 'https://api.openai.com/v1/models',
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${this.settings.openAIApiKey}`
            }
        });
        
        if (response.status !== 200) {
            throw new Error('Invalid OpenAI API key');
        }
    }
    
    async generateSummary(content: string, options?: SummaryOptions): Promise<string> {
        const response = await this.callOpenAI(
            `Summarize this text (max ${options?.maxLength || 150} chars): ${content}`
        );
        return response;
    }
    
    async answerQuestion(question: string, context: string): Promise<string> {
        const response = await this.callOpenAI(
            `Based on this context, answer the question:\nContext: ${context}\nQuestion: ${question}`
        );
        return response;
    }
    
    async generateSuggestions(context: AIContext): Promise<string[]> {
        const response = await this.callOpenAI(
            `Give 5 brief suggestions based on:\nTasks: ${context.tasks?.length || 0}\nGoals: ${context.goals?.length || 0}`
        );
        return response.split('\n').filter(s => s.trim()).slice(0, 5);
    }
    
    async generateDailySummary(context: AIContext): Promise<string> {
        const response = await this.callOpenAI(
            `Create a daily summary in markdown for:\nTasks: ${context.tasks?.filter(t => t.completed).length}/${context.tasks?.length}\nGoals: ${context.goals?.length}`
        );
        return response;
    }
    
    async generateEmbedding(text: string): Promise<Float32Array> {
        const response = await requestUrl({
            url: 'https://api.openai.com/v1/embeddings',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.settings.openAIApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'text-embedding-ada-002',
                input: text
            })
        });
        
        const embedding = response.json.data[0].embedding;
        return new Float32Array(embedding);
    }
    
    private async callOpenAI(prompt: string): Promise<string> {
        const response = await requestUrl({
            url: 'https://api.openai.com/v1/chat/completions',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.settings.openAIApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: this.settings.openAIModel || 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: this.settings.maxTokens || 500,
                temperature: this.settings.temperature || 0.7
            })
        });
        
        return response.json.choices[0].message.content;
    }
    
    async cleanup(): Promise<void> {
        // Nothing to clean up
    }
}

/**
 * Anthropic Provider
 */
class AnthropicProvider implements AIProvider {
    name = 'Anthropic';
    type: 'local' | 'cloud' | 'external' = 'cloud';
    private settings: VaultMindSettings;
    
    constructor(settings: VaultMindSettings) {
        this.settings = settings;
    }
    
    async initialize(): Promise<void> {
        // Test API key with minimal request
        const response = await requestUrl({
            url: 'https://api.anthropic.com/v1/messages',
            method: 'POST',
            headers: {
                'x-api-key': this.settings.claudeApiKey || '',
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                model: this.settings.claudeModel || 'claude-3-haiku-20240307',
                messages: [{ role: 'user', content: 'test' }],
                max_tokens: 1
            })
        });
        
        if (response.status !== 200) {
            throw new Error('Invalid Claude API key');
        }
    }
    
    async generateSummary(content: string, options?: SummaryOptions): Promise<string> {
        return this.callAnthropic(
            `Summarize this text (max ${options?.maxLength || 150} chars): ${content}`
        );
    }
    
    async answerQuestion(question: string, context: string): Promise<string> {
        return this.callAnthropic(
            `Based on this context, answer the question:\nContext: ${context}\nQuestion: ${question}`
        );
    }
    
    async generateSuggestions(context: AIContext): Promise<string[]> {
        const response = await this.callAnthropic(
            `Give 5 brief suggestions based on:\nTasks: ${context.tasks?.length || 0}\nGoals: ${context.goals?.length || 0}`
        );
        return response.split('\n').filter(s => s.trim()).slice(0, 5);
    }
    
    async generateDailySummary(context: AIContext): Promise<string> {
        return this.callAnthropic(
            `Create a daily summary in markdown for:\nTasks: ${context.tasks?.filter(t => t.completed).length}/${context.tasks?.length}\nGoals: ${context.goals?.length}`
        );
    }
    
    async generateEmbedding(text: string): Promise<Float32Array> {
        // Claude doesn't have embeddings API, use simple embeddings
        const embeddings = new SimpleEmbeddings();
        return embeddings.generateEmbedding(text);
    }
    
    private async callAnthropic(prompt: string): Promise<string> {
        const response = await requestUrl({
            url: 'https://api.anthropic.com/v1/messages',
            method: 'POST',
            headers: {
                'x-api-key': this.settings.claudeApiKey || '',
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                model: this.settings.claudeModel || 'claude-3-haiku-20240307',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: this.settings.maxTokens || 500
            })
        });
        
        return response.json.content[0].text;
    }
    
    async cleanup(): Promise<void> {
        // Nothing to clean up
    }
}

/**
 * Ollama Provider
 */
class OllamaProvider implements AIProvider {
    name = 'Ollama';
    type: 'local' | 'cloud' | 'external' = 'external';
    private settings: VaultMindSettings;
    private endpoint: string;
    
    constructor(settings: VaultMindSettings) {
        this.settings = settings;
        this.endpoint = settings.ollamaEndpoint || 'http://localhost:11434';
    }
    
    async initialize(): Promise<void> {
        // Check if Ollama is running and model exists
        const response = await requestUrl({
            url: `${this.endpoint}/api/tags`,
            method: 'GET'
        });
        
        if (response.status !== 200) {
            throw new Error('Ollama not running or unreachable');
        }
        
        // Check if specified model exists
        const modelName = this.settings.ollamaModel || 'qwen3-vl:8b';
        const models = response.json.models || [];
        const modelExists = models.some((m: any) => m.name === modelName);
        
        if (!modelExists && models.length > 0) {
            console.debug(`VaultMind: Model ${modelName} not found. Available models:`, models.map((m: any) => m.name));
            // Use first available model as fallback
            this.settings.ollamaModel = models[0].name;
            console.debug(`VaultMind: Using fallback model: ${this.settings.ollamaModel}`);
        }
    }
    
    async generateSummary(content: string, options?: SummaryOptions): Promise<string> {
        return this.callOllama(
            `Summarize this text (max ${options?.maxLength || 150} chars): ${content}`
        );
    }
    
    async answerQuestion(question: string, context: string): Promise<string> {
        return this.callOllama(
            `Based on this context, answer the question:\nContext: ${context}\nQuestion: ${question}`
        );
    }
    
    async generateSuggestions(context: AIContext): Promise<string[]> {
        // Build comprehensive context from vault
        let contextPrompt = 'Based on the following vault data, provide 5 actionable suggestions:\n\n';
        
        if (context.tasks && context.tasks.length > 0) {
            const pendingTasks = context.tasks.filter(t => !t.completed).slice(0, 10);
            contextPrompt += `Pending Tasks (${context.tasks.filter(t => !t.completed).length} total):\n`;
            pendingTasks.forEach(t => {
                contextPrompt += `- ${t.content}${t.dueDate ? ` (due: ${t.dueDate})` : ''}\n`;
            });
            contextPrompt += '\n';
        }
        
        if (context.goals && context.goals.length > 0) {
            contextPrompt += `Active Goals:\n`;
            context.goals.slice(0, 5).forEach(g => {
                contextPrompt += `- ${g.title} (${g.progress}% complete)\n`;
            });
            contextPrompt += '\n';
        }
        
        if (context.recentNotes && context.recentNotes.length > 0) {
            contextPrompt += `Recent Notes: ${context.recentNotes.slice(0, 5).map(n => n.title).join(', ')}\n\n`;
        }
        
        contextPrompt += 'Provide 5 brief, actionable suggestions to help with productivity and organization.';
        
        const response = await this.callOllama(contextPrompt);
        return response.split('\n').filter(s => s.trim()).slice(0, 5);
    }
    
    async generateDailySummary(context: AIContext): Promise<string> {
        // Build comprehensive daily summary context
        let summaryPrompt = 'Create a daily summary in markdown format based on the following vault data:\n\n';
        
        if (context.tasks && context.tasks.length > 0) {
            const completedToday = context.tasks.filter(t => t.completed);
            const pending = context.tasks.filter(t => !t.completed);
            
            summaryPrompt += `## Tasks\n`;
            summaryPrompt += `- Completed: ${completedToday.length}\n`;
            summaryPrompt += `- Pending: ${pending.length}\n\n`;
            
            if (completedToday.length > 0) {
                summaryPrompt += `### Completed Today:\n`;
                completedToday.slice(0, 5).forEach(t => {
                    summaryPrompt += `- ${t.content}\n`;
                });
                summaryPrompt += '\n';
            }
            
            const urgent = pending.filter(t => t.priority === 'high');
            if (urgent.length > 0) {
                summaryPrompt += `### Urgent Pending:\n`;
                urgent.slice(0, 5).forEach(t => {
                    summaryPrompt += `- ${t.content}\n`;
                });
                summaryPrompt += '\n';
            }
        }
        
        if (context.goals && context.goals.length > 0) {
            summaryPrompt += `## Goals Progress:\n`;
            context.goals.slice(0, 3).forEach(g => {
                summaryPrompt += `- ${g.title}: ${g.progress}%\n`;
            });
            summaryPrompt += '\n';
        }
        
        summaryPrompt += 'Generate a concise, motivational daily summary with key insights and next steps.';
        
        return this.callOllama(summaryPrompt);
    }
    
    async generateEmbedding(text: string): Promise<Float32Array> {
        const response = await requestUrl({
            url: `${this.endpoint}/api/embeddings`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: this.settings.ollamaModel || 'qwen3-vl:8b',
                prompt: text
            })
        });
        
        if (response.json.embedding) {
            return new Float32Array(response.json.embedding);
        }
        
        // Fallback to simple embeddings
        const embeddings = new SimpleEmbeddings();
        return embeddings.generateEmbedding(text);
    }
    
    private async callOllama(prompt: string): Promise<string> {
        const response = await requestUrl({
            url: `${this.endpoint}/api/generate`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: this.settings.ollamaModel || 'qwen3-vl:8b',
                prompt: prompt,
                stream: false
            })
        });
        
        return response.json.response;
    }
    
    async cleanup(): Promise<void> {
        // Nothing to clean up
    }
}

// Local Provider removed - we only support cloud AI providers now
