import { requestUrl } from 'obsidian';
import { AIProvider, AIContext, SummaryOptions, VaultMindSettings } from '../types';

/**
 * DeepSeek AI Provider
 * DeepSeek uses OpenAI-compatible API
 */
export class DeepSeekAI implements AIProvider {
    name = 'DeepSeek';
    type = 'cloud' as const;
    private apiKey: string;
    private model: string;
    private baseUrl = 'https://api.deepseek.com/v1';
    
    constructor(settings: VaultMindSettings) {
        this.apiKey = settings.deepseekApiKey || '';
        this.model = settings.deepseekModel || 'deepseek-chat';
    }
    
    initialize(): Promise<void> {
        if (!this.apiKey) {
            return Promise.reject(new Error('DeepSeek API key not configured'));
        }
        return Promise.resolve();
    }
    
    async generateSummary(content: string, options?: SummaryOptions): Promise<string> {
        const messages = [
            { role: 'system', content: 'You are a helpful assistant that creates concise summaries.' },
            { role: 'user', content: `Summarize this text (max ${options?.maxLength || 150} chars): ${content}` }
        ];
        return this.callDeepSeek(messages);
    }
    
    async answerQuestion(question: string, context: string): Promise<string> {
        const messages = [
            { 
                role: 'system', 
                content: 'You are VaultMind, an AI assistant for Obsidian. You help users manage tasks, goals, and notes. Provide specific, actionable answers based on the vault context.' 
            },
            { 
                role: 'user', 
                content: context 
                    ? `Current Vault Context:\n${context}\n\nQuestion: ${question}`
                    : `Question: ${question}`
            }
        ];
        return this.callDeepSeek(messages);
    }
    
    async generateSuggestions(context: AIContext): Promise<string[]> {
        let prompt = 'Based on the following vault data, provide 5 actionable suggestions:\n\n';
        
        if (context.tasks && context.tasks.length > 0) {
            const pending = context.tasks.filter(t => !t.completed).slice(0, 10);
            prompt += `Pending Tasks:\n`;
            pending.forEach(t => prompt += `- ${t.content}\n`);
        }
        
        if (context.goals && context.goals.length > 0) {
            prompt += `\nActive Goals:\n`;
            context.goals.slice(0, 5).forEach(g => prompt += `- ${g.title} (${g.progress}%)\n`);
        }
        
        const messages = [
            { role: 'system', content: 'You are a productivity expert providing actionable suggestions.' },
            { role: 'user', content: prompt }
        ];
        
        const response = await this.callDeepSeek(messages);
        return response.split('\n').filter(s => s.trim()).slice(0, 5);
    }
    
    async generateDailySummary(context: AIContext): Promise<string> {
        let prompt = 'Create a daily summary in markdown:\n\n';
        
        if (context.tasks) {
            const completed = context.tasks.filter(t => t.completed).length;
            const total = context.tasks.length;
            prompt += `Tasks: ${completed}/${total} completed\n`;
            
            const highPriority = context.tasks.filter(t => !t.completed && t.priority === 'high');
            if (highPriority.length > 0) {
                prompt += `High Priority Pending: ${highPriority.length}\n`;
            }
        }
        
        if (context.goals) {
            prompt += `Goals: ${context.goals.length} active\n`;
            const avgProgress = context.goals.reduce((sum, g) => sum + g.progress, 0) / context.goals.length;
            prompt += `Average Progress: ${Math.round(avgProgress)}%\n`;
        }
        
        prompt += '\nProvide a motivational summary with key insights and actionable next steps.';
        
        const messages = [
            { role: 'system', content: 'You are a productivity coach creating daily summaries.' },
            { role: 'user', content: prompt }
        ];
        
        return this.callDeepSeek(messages);
    }
    
    generateEmbedding(text: string): Promise<Float32Array> {
        // DeepSeek doesn't provide embeddings API yet, use fallback
        const hash = text.split('').reduce((a, b) => {
            a = ((a << 5) - a) + b.charCodeAt(0);
            return a & a;
        }, 0);
        
        const embedding = new Float32Array(768);
        for (let i = 0; i < 768; i++) {
            embedding[i] = ((hash + i) % 1000) / 1000;
        }
        return Promise.resolve(embedding);
    }
    
    private async callDeepSeek(messages: { role: string; content: string }[]): Promise<string> {
        const response = await requestUrl({
            url: `${this.baseUrl}/chat/completions`,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: this.model,
                messages: messages,
                temperature: 0.7,
                max_tokens: 2048
            })
        });
        
        if (response.json.choices && response.json.choices[0]) {
            return response.json.choices[0].message.content;
        }
        
        throw new Error('Failed to get response from DeepSeek');
    }
    
    cleanup(): Promise<void> {
        // Nothing to clean up
        return Promise.resolve();
    }
}
