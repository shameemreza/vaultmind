import { requestUrl } from 'obsidian';
import { AIProvider, AIContext, SummaryOptions } from '../types';

/**
 * Google Gemini AI Provider
 */
export class GeminiAI implements AIProvider {
    name = 'Google Gemini';
    type = 'cloud' as const;
    private apiKey: string;
    private model: string;
    
    constructor(settings: any) {
        this.apiKey = settings.geminiApiKey || '';
        this.model = settings.geminiModel || 'gemini-pro';
    }
    
    async initialize(): Promise<void> {
        if (!this.apiKey) {
            throw new Error('Gemini API key not configured');
        }
    }
    
    async generateSummary(content: string, options?: SummaryOptions): Promise<string> {
        const response = await this.callGemini([{
            role: 'user',
            parts: [{ text: `Summarize this text (max ${options?.maxLength || 150} chars): ${content}` }]
        }]);
        return response;
    }
    
    async answerQuestion(question: string, context: string): Promise<string> {
        // Enhanced context for better understanding
        let enhancedPrompt = `You are VaultMind, an AI assistant for Obsidian. `;
        enhancedPrompt += `You have access to the user's vault containing tasks, goals, and notes.\n\n`;
        
        if (context) {
            enhancedPrompt += `Current Context:\n${context}\n\n`;
        }
        
        enhancedPrompt += `Question: ${question}\n`;
        enhancedPrompt += `Provide a helpful, specific answer based on the vault context.`;
        
        const response = await this.callGemini([{
            role: 'user',
            parts: [{ text: enhancedPrompt }]
        }]);
        return response;
    }
    
    async generateSuggestions(context: AIContext): Promise<string[]> {
        let prompt = 'Based on the following vault data, provide 5 actionable suggestions:\n\n';
        
        if (context.tasks && context.tasks.length > 0) {
            const pending = context.tasks.filter(t => !t.completed).slice(0, 10);
            prompt += `Pending Tasks:\n`;
            pending.forEach(t => prompt += `- ${t.content}\n`);
        }
        
        if (context.goals && context.goals.length > 0) {
            prompt += `\nGoals:\n`;
            context.goals.slice(0, 5).forEach(g => prompt += `- ${g.title} (${g.progress}%)\n`);
        }
        
        const response = await this.callGemini([{
            role: 'user',
            parts: [{ text: prompt }]
        }]);
        
        return response.split('\n').filter(s => s.trim()).slice(0, 5);
    }
    
    async generateDailySummary(context: AIContext): Promise<string> {
        let prompt = 'Create a daily summary in markdown:\n\n';
        
        if (context.tasks) {
            const completed = context.tasks.filter(t => t.completed).length;
            const total = context.tasks.length;
            prompt += `Tasks: ${completed}/${total} completed\n`;
        }
        
        if (context.goals) {
            prompt += `Goals: ${context.goals.length} active\n`;
        }
        
        prompt += '\nProvide a motivational summary with insights and next steps.';
        
        return this.callGemini([{
            role: 'user',
            parts: [{ text: prompt }]
        }]);
    }
    
    async generateEmbedding(text: string): Promise<Float32Array> {
        const response = await requestUrl({
            url: `https://generativelanguage.googleapis.com/v1beta/models/embedding-001:embedContent?key=${this.apiKey}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'models/embedding-001',
                content: {
                    parts: [{ text: text }]
                }
            })
        });
        
        if (response.json.embedding) {
            return new Float32Array(response.json.embedding.values);
        }
        
        // Fallback
        return new Float32Array(768).fill(0);
    }
    
    private async callGemini(messages: any[]): Promise<string> {
        const response = await requestUrl({
            url: `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: messages,
                generationConfig: {
                    temperature: 0.7,
                    topK: 1,
                    topP: 1,
                    maxOutputTokens: 2048,
                }
            })
        });
        
        if (response.json.candidates && response.json.candidates[0]) {
            return response.json.candidates[0].content.parts[0].text;
        }
        
        throw new Error('Failed to get response from Gemini');
    }
    
    async cleanup(): Promise<void> {
        // Nothing to clean up
    }
}
