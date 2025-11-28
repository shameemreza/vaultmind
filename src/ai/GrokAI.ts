import { requestUrl } from 'obsidian';
import { AIProvider, AIContext, SummaryOptions, VaultMindSettings } from '../types';

/**
 * Grok AI Provider (X.AI)
 * Uses OpenAI-compatible API format
 */
export class GrokAI implements AIProvider {
    name = 'Grok';
    type = 'cloud' as const;
    private apiKey: string;
    private model: string;
    private baseUrl = 'https://api.x.ai/v1';
    
    constructor(settings: VaultMindSettings) {
        this.apiKey = settings.grokApiKey || '';
        this.model = settings.grokModel || 'grok-beta';
    }
    
    initialize(): Promise<void> {
        if (!this.apiKey) {
            return Promise.reject(new Error('Grok API key not configured'));
        }
        return Promise.resolve();
    }
    
    async generateSummary(content: string, options?: SummaryOptions): Promise<string> {
        const messages = [
            { role: 'system', content: 'You are Grok, a helpful AI assistant. Create concise summaries.' },
            { role: 'user', content: `Summarize this text (max ${options?.maxLength || 150} chars): ${content}` }
        ];
        return this.callGrok(messages);
    }
    
    async answerQuestion(question: string, context: string): Promise<string> {
        const messages = [
            { 
                role: 'system', 
                content: 'You are Grok, the VaultMind AI assistant for Obsidian. Help users manage tasks, goals, and notes with wit and insight. Be helpful but maintain your personality.' 
            },
            { 
                role: 'user', 
                content: context 
                    ? `Current Vault Context:\n${context}\n\nQuestion: ${question}`
                    : `Question: ${question}`
            }
        ];
        return this.callGrok(messages);
    }
    
    async generateSuggestions(context: AIContext): Promise<string[]> {
        let prompt = 'Based on the following vault data, provide 5 witty and actionable suggestions:\n\n';
        
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
            { role: 'system', content: 'You are Grok, an AI with a sense of humor. Provide helpful but witty suggestions.' },
            { role: 'user', content: prompt }
        ];
        
        const response = await this.callGrok(messages);
        return response.split('\n').filter(s => s.trim()).slice(0, 5);
    }
    
    async generateDailySummary(context: AIContext): Promise<string> {
        let prompt = 'Create an engaging daily summary in markdown:\n\n';
        
        if (context.tasks) {
            const completed = context.tasks.filter(t => t.completed).length;
            const total = context.tasks.length;
            prompt += `Tasks: ${completed}/${total} completed\n`;
            
            if (completed === total && total > 0) {
                prompt += `Status: All tasks completed! 🎉\n`;
            } else if (completed === 0 && total > 0) {
                prompt += `Status: Time to get started! 🚀\n`;
            }
        }
        
        if (context.goals) {
            prompt += `Goals: ${context.goals.length} active\n`;
        }
        
        prompt += '\nProvide a motivational and slightly humorous summary with insights and next steps.';
        
        const messages = [
            { role: 'system', content: 'You are Grok, creating daily summaries with personality.' },
            { role: 'user', content: prompt }
        ];
        
        return this.callGrok(messages);
    }
    
    generateEmbedding(text: string): Promise<Float32Array> {
        // Grok doesn't provide embeddings API yet, use fallback
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
    
    private async callGrok(messages: { role: string; content: string }[]): Promise<string> {
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
        
        throw new Error('Failed to get response from Grok');
    }
    
    cleanup(): Promise<void> {
        // Nothing to clean up
        return Promise.resolve();
    }
}
