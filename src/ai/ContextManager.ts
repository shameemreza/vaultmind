import { TFile, Vault } from 'obsidian';
import { IndexedNote } from '../types';

/**
 * Smart context management to handle token limitations
 */
export class ContextManager {
    private readonly MAX_TOKENS = 4000; // Approximate token limit
    private readonly CHARS_PER_TOKEN = 4; // Rough estimate
    private readonly MAX_CONTEXT_LENGTH = this.MAX_TOKENS * this.CHARS_PER_TOKEN;
    
    /**
     * Build optimized context within token limits
     */
    async buildContext(
        query: string,
        attachedFiles: TFile[],
        allNotes: IndexedNote[],
        vault: Vault
    ): Promise<string> {
        let context = '';
        let currentLength = 0;
        
        // Reserve space for query and response
        const reservedTokens = 1000;
        const maxContextChars = this.MAX_CONTEXT_LENGTH - (reservedTokens * this.CHARS_PER_TOKEN);
        
        // 1. Priority 1: Attached files (most important)
        if (attachedFiles.length > 0) {
            context += '=== SELECTED NOTES ===\n';
            
            for (const file of attachedFiles) {
                if (currentLength > maxContextChars * 0.6) break; // Use max 60% for attached
                
                try {
                    const content = await vault.read(file);
                    const summary = this.smartTruncate(content, 1500);
                    const addition = `📄 ${file.basename}:\n${summary}\n\n`;
                    
                    if (currentLength + addition.length < maxContextChars * 0.6) {
                        context += addition;
                        currentLength += addition.length;
                    }
                } catch (error) {
                    console.error('Failed to read file:', file.path);
                }
            }
        }
        
        // 2. Priority 2: Relevance-scored notes
        const relevantNotes = this.findRelevantNotes(query, allNotes, attachedFiles);
        
        if (relevantNotes.length > 0 && currentLength < maxContextChars * 0.8) {
            context += '=== RELEVANT NOTES ===\n';
            
            for (const note of relevantNotes.slice(0, 3)) {
                if (currentLength > maxContextChars * 0.8) break;
                
                const summary = this.extractRelevantSection(note.content || '', query, 500);
                const addition = `📝 ${note.title}: ${summary}\n\n`;
                
                if (currentLength + addition.length < maxContextChars * 0.8) {
                    context += addition;
                    currentLength += addition.length;
                }
            }
        }
        
        // 3. Priority 3: Metadata and statistics
        if (currentLength < maxContextChars * 0.95) {
            const stats = this.getVaultStats(allNotes);
            context += `\n=== VAULT CONTEXT ===\n${stats}`;
        }
        
        return context;
    }
    
    /**
     * Smart truncation that preserves meaning
     */
    private smartTruncate(text: string, maxLength: number): string {
        if (text.length <= maxLength) return text;
        
        // Try to break at paragraph
        const paragraphs = text.split('\n\n');
        let result = '';
        
        for (const para of paragraphs) {
            if (result.length + para.length > maxLength) {
                // Add partial paragraph if there's room
                const remaining = maxLength - result.length;
                if (remaining > 100) {
                    result += para.substring(0, remaining) + '...';
                }
                break;
            }
            result += para + '\n\n';
        }
        
        return result || text.substring(0, maxLength) + '...';
    }
    
    /**
     * Extract the most relevant section based on query
     */
    private extractRelevantSection(content: string, query: string, maxLength: number): string {
        const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        const sentences = content.match(/[^.!?]+[.!?]+/g) || [];
        
        // Score sentences by relevance
        const scoredSentences = sentences.map(sentence => {
            const sentLower = sentence.toLowerCase();
            const score = queryWords.reduce((sum, word) => {
                return sum + (sentLower.includes(word) ? 1 : 0);
            }, 0);
            return { sentence, score };
        });
        
        // Sort by relevance
        scoredSentences.sort((a, b) => b.score - a.score);
        
        // Take most relevant sentences up to maxLength
        let result = '';
        for (const { sentence, score } of scoredSentences) {
            if (score === 0) break;
            if (result.length + sentence.length > maxLength) break;
            result += sentence + ' ';
        }
        
        return result || content.substring(0, maxLength) + '...';
    }
    
    /**
     * Find relevant notes with scoring
     */
    private findRelevantNotes(
        query: string, 
        allNotes: IndexedNote[], 
        excludeFiles: TFile[]
    ): IndexedNote[] {
        const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        const excludePaths = new Set(excludeFiles.map(f => f.path));
        
        // Score each note
        const scored = allNotes
            .filter(note => !excludePaths.has(note.filePath || ''))
            .map(note => {
                let score = 0;
                const title = (note.title || '').toLowerCase();
                const content = (note.content || '').toLowerCase();
                
                queryWords.forEach(word => {
                    // Title matches are worth more
                    if (title.includes(word)) score += 3;
                    if (content.includes(word)) score += 1;
                });
                
                return { note, score };
            })
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score);
        
        return scored.map(item => item.note);
    }
    
    /**
     * Get vault statistics
     */
    private getVaultStats(allNotes: IndexedNote[]): string {
        const totalNotes = allNotes.length;
        const totalWords = allNotes.reduce((sum, note) => sum + (note.wordCount || 0), 0);
        const avgWords = Math.round(totalWords / totalNotes);
        
        return `Notes: ${totalNotes} | Words: ${totalWords} | Avg: ${avgWords} words/note`;
    }
    
    /**
     * Estimate token count
     */
    estimateTokens(text: string): number {
        // Rough estimation: 1 token ≈ 4 characters
        return Math.ceil(text.length / this.CHARS_PER_TOKEN);
    }
    
    /**
     * Check if context is within limits
     */
    isWithinLimits(context: string): boolean {
        return this.estimateTokens(context) < this.MAX_TOKENS;
    }
}
