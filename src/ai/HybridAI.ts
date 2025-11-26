import { App, Notice, requestUrl } from 'obsidian';
import { 
    AIProvider, 
    SummaryOptions, 
    AIContext,
    VaultMindSettings,
    WebSearchResult
} from '../types';
import { SimpleEmbeddings } from './SimpleEmbeddings';
import { WebSearchService } from '../services/WebSearchService';
import { FallbackAI } from './FallbackAI';

/**
 * Hybrid AI provider that combines multiple approaches
 * 1. External APIs (OpenAI, Anthropic, Ollama)
 * 2. Simple local embeddings for search
 * 3. Fallback text processing
 */
export class HybridAI implements AIProvider {
    name = 'HybridAI';
    type: 'local' | 'cloud' | 'external' = 'local';
    
    private settings: VaultMindSettings;
    private embeddings: SimpleEmbeddings;
    private fallback: FallbackAI;
    private webSearch: WebSearchService | null = null;
    private initialized = false;
    private apiAvailable = false;
    
    constructor(settings: VaultMindSettings) {
        this.settings = settings;
        this.embeddings = new SimpleEmbeddings();
        this.fallback = new FallbackAI();
    }
    
    async initialize(): Promise<void> {
        if (this.initialized) return;
        
        try {
            console.log('VaultMind: Initializing HybridAI...');
            
            // Initialize embeddings
            await this.fallback.initialize();
            
            // Check if external API is configured
            if (this.settings.aiProvider === 'openai' && this.settings.openAIApiKey) {
                this.apiAvailable = await this.testOpenAI();
                if (this.apiAvailable) {
                    console.log('VaultMind: OpenAI API available');
                    this.type = 'cloud';
                }
            } else if (this.settings.aiProvider === 'anthropic' && this.settings.claudeApiKey) {
                this.apiAvailable = await this.testAnthropic();
                if (this.apiAvailable) {
                    console.log('VaultMind: Anthropic API available');
                    this.type = 'cloud';
                }
            } else if (this.settings.aiProvider === 'ollama') {
                this.apiAvailable = await this.testOllama();
                if (this.apiAvailable) {
                    console.log('VaultMind: Ollama available');
                    this.type = 'external';
                }
            }
            
            // Initialize web search if enabled
            if (this.settings.enableWebSearch) {
                this.webSearch = new WebSearchService(
                    this.settings.webSearchProvider as any,
                    this.settings.apiKey || '',
                    this.settings.customSearchEndpoint || ''
                );
            }
            
            this.initialized = true;
            console.log('VaultMind: HybridAI initialized successfully');
            
        } catch (error) {
            console.error('VaultMind: Failed to initialize HybridAI:', error);
            this.initialized = false;
            throw error;
        }
    }
    
    /**
     * Test OpenAI API connectivity
     */
    private async testOpenAI(): Promise<boolean> {
        try {
            const response = await requestUrl({
                url: 'https://api.openai.com/v1/models',
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.settings.openAIApiKey}`
                }
            });
            return response.status === 200;
        } catch {
            return false;
        }
    }
    
    /**
     * Test Anthropic API connectivity
     */
    private async testAnthropic(): Promise<boolean> {
        try {
            const response = await requestUrl({
                url: 'https://api.anthropic.com/v1/messages',
                method: 'POST',
                headers: {
                    'x-api-key': this.settings.claudeApiKey || '',
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'claude-3-haiku-20240307',
                    messages: [{ role: 'user', content: 'test' }],
                    max_tokens: 1
                })
            });
            return response.status === 200;
        } catch {
            return false;
        }
    }
    
    /**
     * Test Ollama connectivity
     */
    private async testOllama(): Promise<boolean> {
        try {
            const response = await requestUrl({
                url: `${this.settings.ollamaEndpoint || 'http://localhost:11434'}/api/tags`,
                method: 'GET'
            });
            return response.status === 200;
        } catch {
            return false;
        }
    }
    
    /**
     * Generate summary using available AI
     */
    async generateSummary(content: string, options?: SummaryOptions): Promise<string> {
        const maxLength = options?.maxLength || 150;
        const style = options?.style || 'brief';
        
        // Try API first if available
        if (this.apiAvailable) {
            try {
                if (this.settings.aiProvider === 'openai') {
                    return await this.generateWithOpenAI(
                        `Summarize this text in ${style} style (max ${maxLength} chars):\n\n${content}`
                    );
                } else if (this.settings.aiProvider === 'anthropic') {
                    return await this.generateWithAnthropic(
                        `Summarize this text in ${style} style (max ${maxLength} chars):\n\n${content}`
                    );
                } else if (this.settings.aiProvider === 'ollama') {
                    return await this.generateWithOllama(
                        `Summarize this text in ${style} style (max ${maxLength} chars):\n\n${content}`
                    );
                }
            } catch (error) {
                console.error('API generation failed, using fallback:', error);
            }
        }
        
        // Fallback to simple summarization
        return this.fallback.generateSummary(content, options);
    }
    
    /**
     * Answer question using available AI
     */
    async answerQuestion(question: string, context: string): Promise<string> {
        // Add web search results if available
        if (this.webSearch) {
            try {
                const searchResults = await this.webSearch.search(question, 3);
                if (searchResults.length > 0) {
                    context += '\n\nWeb search results:\n';
                    searchResults.forEach(result => {
                        context += `- ${result.title}: ${result.snippet}\n`;
                    });
                }
            } catch (error) {
                console.error('Web search failed:', error);
            }
        }
        
        // Try API first if available
        if (this.apiAvailable) {
            try {
                const prompt = `Based on the following context, answer this question: ${question}\n\nContext:\n${context}`;
                
                if (this.settings.aiProvider === 'openai') {
                    return await this.generateWithOpenAI(prompt);
                } else if (this.settings.aiProvider === 'anthropic') {
                    return await this.generateWithAnthropic(prompt);
                } else if (this.settings.aiProvider === 'ollama') {
                    return await this.generateWithOllama(prompt);
                }
            } catch (error) {
                console.error('API generation failed, using fallback:', error);
            }
        }
        
        // Fallback to simple Q&A
        return this.fallback.answerQuestion(question, context);
    }
    
    /**
     * Generate with OpenAI API
     */
    private async generateWithOpenAI(prompt: string): Promise<string> {
        const response = await requestUrl({
            url: 'https://api.openai.com/v1/chat/completions',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.settings.openAIApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: this.settings.openAIModel || 'gpt-3.5-turbo',
                messages: [
                    { role: 'user', content: prompt }
                ],
                max_tokens: 500,
                temperature: 0.7
            })
        });
        
        const data = response.json;
        return data.choices[0].message.content;
    }
    
    /**
     * Generate with Anthropic API
     */
    private async generateWithAnthropic(prompt: string): Promise<string> {
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
                messages: [
                    { role: 'user', content: prompt }
                ],
                max_tokens: 500
            })
        });
        
        const data = response.json;
        return data.content[0].text;
    }
    
    /**
     * Generate with Ollama
     */
    private async generateWithOllama(prompt: string): Promise<string> {
        const response = await requestUrl({
            url: `${this.settings.ollamaEndpoint || 'http://localhost:11434'}/api/generate`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: this.settings.ollamaModel || 'llama2',
                prompt: prompt,
                stream: false
            })
        });
        
        const data = response.json;
        return data.response;
    }
    
    /**
     * Generate suggestions using available AI
     */
    async generateSuggestions(context: AIContext): Promise<string[]> {
        if (this.apiAvailable) {
            try {
                const prompt = `Based on the following context, provide 5 actionable suggestions:
                Tasks: ${context.tasks?.length || 0} total
                Goals: ${context.goals?.length || 0} total
                Time tracked today: ${context.timeEntries?.length || 0} entries
                
                Provide brief, actionable suggestions.`;
                
                let response = '';
                if (this.settings.aiProvider === 'openai') {
                    response = await this.generateWithOpenAI(prompt);
                } else if (this.settings.aiProvider === 'anthropic') {
                    response = await this.generateWithAnthropic(prompt);
                } else if (this.settings.aiProvider === 'ollama') {
                    response = await this.generateWithOllama(prompt);
                }
                
                // Parse suggestions from response
                return response
                    .split('\n')
                    .filter(line => line.trim())
                    .slice(0, 5);
                    
            } catch (error) {
                console.error('API generation failed, using fallback:', error);
            }
        }
        
        return this.fallback.generateSuggestions(context);
    }
    
    /**
     * Generate embedding using simple embeddings
     */
    async generateEmbedding(text: string): Promise<Float32Array> {
        return this.embeddings.generateEmbedding(text);
    }
    
    /**
     * Generate daily summary
     */
    async generateDailySummary(context: AIContext): Promise<string> {
        if (this.apiAvailable) {
            try {
                const prompt = `Generate a daily summary based on:
                - Tasks completed: ${context.tasks?.filter(t => t.completed).length || 0}/${context.tasks?.length || 0}
                - Goals in progress: ${context.goals?.filter(g => g.progress > 0).length || 0}
                - Time tracked: ${context.timeEntries?.reduce((sum, e) => sum + (e.duration || 0), 0) || 0} minutes
                
                Format as markdown with sections for Statistics, Insights, and Recommendations.`;
                
                if (this.settings.aiProvider === 'openai') {
                    return await this.generateWithOpenAI(prompt);
                } else if (this.settings.aiProvider === 'anthropic') {
                    return await this.generateWithAnthropic(prompt);
                } else if (this.settings.aiProvider === 'ollama') {
                    return await this.generateWithOllama(prompt);
                }
            } catch (error) {
                console.error('API generation failed, using fallback:', error);
            }
        }
        
        return this.fallback.generateDailySummary(context);
    }
    
    /**
     * Find similar content using embeddings
     */
    async findSimilar(
        query: string, 
        items: { id: string; text: string }[],
        topK: number = 5
    ): Promise<Array<{ id: string; text: string; score: number }>> {
        return this.embeddings.findSimilar(query, items, topK);
    }
    
    /**
     * Update IDF scores for better search
     */
    updateSearchIndex(documents: string[]) {
        this.embeddings.updateIDFScores(documents);
    }
    
    /**
     * Clean up resources
     */
    async cleanup(): Promise<void> {
        // Save embeddings to storage
        const embedData = this.embeddings.serialize();
        // Could save to plugin data here
        
        console.log('VaultMind: HybridAI cleaned up');
    }
}
