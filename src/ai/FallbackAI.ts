import { 
    AIProvider, 
    SummaryOptions, 
    AIContext,
    WebSearchResult
} from '../types';

/**
 * Fallback AI provider for when local models fail to load
 * Provides basic text processing without ML models
 */
export class FallbackAI implements AIProvider {
    name = 'FallbackAI';
    type: 'local' | 'cloud' | 'external' = 'local';

    async initialize(): Promise<void> {
        console.debug('VaultMind: Using fallback AI (no ML models)');
    }

    async generateSummary(content: string, options?: SummaryOptions): Promise<string> {
        const maxLength = options?.maxLength || 150;
        const style = options?.style || 'brief';
        
        // Simple extractive summarization
        const sentences = content.match(/[^.!?]+[.!?]+/g) || [];
        
        if (sentences.length === 0) {
            return content.substring(0, maxLength) + '...';
        }
        
        switch (style) {
            case 'brief':
                // Return first 2-3 sentences
                return sentences.slice(0, 3).join(' ').substring(0, maxLength);
                
            case 'bullet-points': {
                // Extract key sentences as bullet points
                const bullets = sentences
                    .slice(0, 5)
                    .map(s => `• ${s.trim()}`)
                    .join('\n');
                return bullets.substring(0, maxLength * 2);
            }
                
            case 'detailed': {
                // Return first paragraph
                const paragraphs = content.split('\n\n');
                return paragraphs[0].substring(0, maxLength * 2);
            }
                
            default:
                return sentences[0]?.substring(0, maxLength) || content.substring(0, maxLength);
        }
    }

    async answerQuestion(question: string, context: string): Promise<string> {
        // Simple keyword matching
        const questionLower = question.toLowerCase();
        const contextLower = context.toLowerCase();
        
        // Look for sentences containing question keywords
        const keywords = questionLower
            .replace(/[^\w\s]/g, '')
            .split(/\s+/)
            .filter(word => word.length > 3);
        
        const sentences = context.match(/[^.!?]+[.!?]+/g) || [];
        const relevantSentences = sentences.filter(sentence => {
            const sentLower = sentence.toLowerCase();
            return keywords.some(keyword => sentLower.includes(keyword));
        });
        
        if (relevantSentences.length > 0) {
            return `Based on your vault: ${relevantSentences[0].trim()}`;
        }
        
        // Fallback responses for common questions
        if (questionLower.includes('how many')) {
            const numbers = context.match(/\d+/g);
            if (numbers && numbers.length > 0) {
                return `Found ${numbers[0]} in the context.`;
            }
        }
        
        if (questionLower.includes('what') || questionLower.includes('which')) {
            const firstSentence = sentences[0] || '';
            return `From your notes: ${firstSentence.trim()}`;
        }
        
        return 'I can help you search your vault, but advanced AI features require downloading a language model. Please check Settings → VaultMind to download a model.';
    }

    async generateSuggestions(context: AIContext): Promise<string[]> {
        const suggestions: string[] = [];
        
        // Provide basic rule-based suggestions
        if (context.tasks) {
            const overdueTasks = context.tasks.filter(t => 
                t.dueDate && new Date(t.dueDate) < new Date() && !t.completed
            ).length;
            
            if (overdueTasks > 0) {
                suggestions.push(`You have ${overdueTasks} overdue tasks that need attention.`);
            }
            
            const todayTasks = context.tasks.filter(t => {
                if (!t.dueDate || t.completed) return false;
                const today = new Date().toDateString();
                return new Date(t.dueDate).toDateString() === today;
            }).length;
            
            if (todayTasks > 0) {
                suggestions.push(`Focus on completing ${todayTasks} tasks due today.`);
            }
        }
        
        if (context.goals) {
            const behindGoals = context.goals.filter(g => g.progress < 30).length;
            if (behindGoals > 0) {
                suggestions.push(`${behindGoals} goals need more progress.`);
            }
        }
        
        if (context.timeEntries) {
            const todayTime = context.timeEntries
                .filter(e => new Date(e.startTime).toDateString() === new Date().toDateString())
                .reduce((sum, e) => sum + (e.duration || 0), 0);
            
            if (todayTime < 120) {
                suggestions.push('Consider focusing on deep work - you have logged less than 2 hours today.');
            } else if (todayTime > 480) {
                suggestions.push('You have been working for over 8 hours. Remember to take breaks!');
            }
        }
        
        if (suggestions.length === 0) {
            suggestions.push('Keep up the good work! Review your tasks and goals regularly.');
        }
        
        return suggestions.slice(0, 5);
    }

    async generateEmbedding(text: string): Promise<Float32Array> {
        // Simple hash-based pseudo-embedding for basic similarity
        // This is not ML but allows basic text matching
        const vector = new Float32Array(128);
        
        for (let i = 0; i < text.length; i++) {
            const charCode = text.charCodeAt(i);
            const index = (charCode * 31 + i) % 128;
            vector[index] = (vector[index] + charCode / 255) / 2;
        }
        
        // Normalize
        const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
        if (magnitude > 0) {
            for (let i = 0; i < vector.length; i++) {
                vector[i] /= magnitude;
            }
        }
        
        return vector;
    }

    async generateDailySummary(context: AIContext): Promise<string> {
        const tasksCompleted = context.tasks?.filter(t => t.completed).length || 0;
        const tasksTotal = context.tasks?.length || 0;
        const goalsProgressed = context.goals?.filter(g => g.progress > 0).length || 0;
        const timeTracked = context.timeEntries?.reduce((sum, e) => sum + (e.duration || 0), 0) || 0;
        
        const hours = Math.floor(timeTracked / 60);
        const minutes = timeTracked % 60;
        
        return `# Daily Summary - ${new Date().toLocaleDateString()}

## 📊 Statistics
- Tasks: ${tasksCompleted}/${tasksTotal} completed
- Goals: ${goalsProgressed} in progress  
- Time Tracked: ${hours}h ${minutes}m

## 📝 Insights
${tasksCompleted > 5 ? '✅ Great productivity today!' : ''}
${tasksCompleted === 0 ? '⚠️ No tasks completed yet today.' : ''}
${timeTracked > 240 ? '⏱️ Good focus time logged!' : ''}
${timeTracked < 60 ? '💡 Try to dedicate more focused time to your tasks.' : ''}

## 🎯 Recommendations
- ${tasksTotal - tasksCompleted > 5 ? 'Prioritize your most important pending tasks' : 'Keep maintaining your task completion rate'}
- ${goalsProgressed === 0 ? 'Review your goals and make progress on at least one' : 'Continue working toward your goals'}
- ${hours < 2 ? 'Aim for at least 2 hours of focused work' : 'Remember to take regular breaks'}

---
*Note: Advanced AI summaries require downloading a language model. Check Settings → VaultMind.*`;
    }

    async cleanup(): Promise<void> {
        // Nothing to clean up in fallback mode
    }
}
