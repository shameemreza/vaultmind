import { VaultMindError } from '../types';

/**
 * Simple embedding generation without heavy ML libraries
 * Uses TF-IDF and word vectors for basic semantic search
 */
export class SimpleEmbeddings {
    private vocabulary: Map<string, number> = new Map();
    private idfScores: Map<string, number> = new Map();
    private wordVectors: Map<string, Float32Array> = new Map();
    private dimensionality = 128;
    
    constructor() {
        this.initializeBasicWordVectors();
    }
    
    /**
     * Initialize with basic semantic word vectors
     */
    private initializeBasicWordVectors() {
        // Create semantic clusters for common words
        const semanticGroups = {
            task: ['task', 'todo', 'work', 'job', 'assignment', 'duty'],
            time: ['time', 'hour', 'minute', 'day', 'week', 'month', 'schedule'],
            project: ['project', 'goal', 'milestone', 'objective', 'target'],
            note: ['note', 'document', 'file', 'page', 'content', 'text'],
            important: ['important', 'urgent', 'priority', 'critical', 'key'],
            complete: ['complete', 'done', 'finish', 'accomplish', 'achieve'],
            plan: ['plan', 'strategy', 'approach', 'method', 'process'],
            meeting: ['meeting', 'discussion', 'call', 'conference', 'sync'],
            idea: ['idea', 'thought', 'concept', 'notion', 'insight'],
            review: ['review', 'check', 'audit', 'assess', 'evaluate']
        };
        
        // Generate vectors for semantic groups
        Object.entries(semanticGroups).forEach(([group, words], groupIndex) => {
            const baseVector = this.createBaseVector(groupIndex);
            
            words.forEach((word, wordIndex) => {
                const vector = new Float32Array(this.dimensionality);
                // Copy base vector and add variation
                for (let i = 0; i < this.dimensionality; i++) {
                    vector[i] = baseVector[i] + (Math.random() - 0.5) * 0.1;
                }
                this.wordVectors.set(word.toLowerCase(), vector);
            });
        });
    }
    
    /**
     * Create a base vector for a semantic group
     */
    private createBaseVector(groupIndex: number): Float32Array {
        const vector = new Float32Array(this.dimensionality);
        // Create orthogonal vectors for different groups
        const angle = (groupIndex * Math.PI * 2) / 10;
        
        for (let i = 0; i < this.dimensionality; i++) {
            if (i === groupIndex * 10) {
                vector[i] = 1.0; // Primary dimension for this group
            } else if (i < 20) {
                // Use trigonometric functions for orthogonality
                vector[i] = Math.sin(angle + i * 0.1) * 0.5;
            } else {
                // Random noise for remaining dimensions
                vector[i] = (Math.random() - 0.5) * 0.3;
            }
        }
        
        return this.normalize(vector);
    }
    
    /**
     * Generate embedding for text using TF-IDF and word vectors
     */
    async generateEmbedding(text: string): Promise<Float32Array> {
        const tokens = this.tokenize(text);
        const embedding = new Float32Array(this.dimensionality);
        
        // Combine word vectors with TF-IDF weighting
        let wordCount = 0;
        for (const token of tokens) {
            const wordVector = this.getWordVector(token);
            const tfidf = this.getTFIDFScore(token, tokens);
            
            // Weighted sum of word vectors
            for (let i = 0; i < this.dimensionality; i++) {
                embedding[i] += wordVector[i] * tfidf;
            }
            wordCount++;
        }
        
        // Average and normalize
        if (wordCount > 0) {
            for (let i = 0; i < this.dimensionality; i++) {
                embedding[i] /= wordCount;
            }
        }
        
        return this.normalize(embedding);
    }
    
    /**
     * Get or create word vector
     */
    private getWordVector(word: string): Float32Array {
        const lowercaseWord = word.toLowerCase();
        
        // Return existing vector if available
        if (this.wordVectors.has(lowercaseWord)) {
            return this.wordVectors.get(lowercaseWord)!;
        }
        
        // Generate a deterministic vector for unknown words
        const vector = new Float32Array(this.dimensionality);
        let hash = 0;
        for (let i = 0; i < lowercaseWord.length; i++) {
            hash = ((hash << 5) - hash) + lowercaseWord.charCodeAt(i);
            hash = hash & hash; // Convert to 32-bit integer
        }
        
        // Use hash to generate consistent vector
        for (let i = 0; i < this.dimensionality; i++) {
            const seed = hash + i * 31;
            vector[i] = (Math.sin(seed) * 43758.5453123) % 1;
        }
        
        const normalized = this.normalize(vector);
        this.wordVectors.set(lowercaseWord, normalized);
        return normalized;
    }
    
    /**
     * Calculate TF-IDF score
     */
    private getTFIDFScore(word: string, tokens: string[]): number {
        // Term frequency
        const tf = tokens.filter(t => t === word).length / tokens.length;
        
        // Inverse document frequency (simplified)
        let idf = this.idfScores.get(word.toLowerCase());
        if (!idf) {
            // Default IDF for unknown words
            idf = Math.log(100); // Assume corpus of 100 documents
            this.idfScores.set(word.toLowerCase(), idf);
        }
        
        return tf * idf;
    }
    
    /**
     * Update IDF scores based on document collection
     */
    updateIDFScores(documents: string[]) {
        const documentFrequency = new Map<string, number>();
        const totalDocs = documents.length;
        
        // Count document frequency for each word
        for (const doc of documents) {
            const uniqueWords = new Set(this.tokenize(doc));
            uniqueWords.forEach(word => {
                const count = documentFrequency.get(word) || 0;
                documentFrequency.set(word, count + 1);
            });
        }
        
        // Calculate IDF scores
        documentFrequency.forEach((freq, word) => {
            const idf = Math.log(totalDocs / freq);
            this.idfScores.set(word, idf);
        });
    }
    
    /**
     * Calculate cosine similarity between embeddings
     */
    cosineSimilarity(a: Float32Array, b: Float32Array): number {
        if (a.length !== b.length) {
            throw new Error('Embeddings must have same dimensions');
        }
        
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        
        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        
        if (normA === 0 || normB === 0) {
            return 0;
        }
        
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }
    
    /**
     * Find most similar items
     */
    async findSimilar(
        query: string, 
        items: { id: string; text: string; embedding?: Float32Array }[],
        topK: number = 5
    ): Promise<Array<{ id: string; text: string; score: number }>> {
        const queryEmbedding = await this.generateEmbedding(query);
        
        // Calculate similarities
        const similarities = await Promise.all(items.map(async item => {
            const itemEmbedding = item.embedding || await this.generateEmbedding(item.text);
            const score = this.cosineSimilarity(queryEmbedding, itemEmbedding);
            return { id: item.id, text: item.text, score };
        }));
        
        // Sort by similarity score
        return similarities
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);
    }
    
    /**
     * Tokenize text into words
     */
    private tokenize(text: string): string[] {
        return text
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 2 && word.length < 20);
    }
    
    /**
     * Normalize vector to unit length
     */
    private normalize(vector: Float32Array): Float32Array {
        const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
        
        if (magnitude === 0) {
            return vector;
        }
        
        const normalized = new Float32Array(this.dimensionality);
        for (let i = 0; i < this.dimensionality; i++) {
            normalized[i] = vector[i] / magnitude;
        }
        
        return normalized;
    }
    
    /**
     * Save embeddings to storage
     */
    serialize(): string {
        return JSON.stringify({
            vocabulary: Array.from(this.vocabulary.entries()),
            idfScores: Array.from(this.idfScores.entries()),
            wordVectors: Array.from(this.wordVectors.entries()).map(([word, vector]) => [
                word,
                Array.from(vector)
            ])
        });
    }
    
    /**
     * Load embeddings from storage
     */
    deserialize(data: string) {
        try {
            const parsed = JSON.parse(data);
            
            if (parsed.vocabulary) {
                this.vocabulary = new Map(parsed.vocabulary);
            }
            
            if (parsed.idfScores) {
                this.idfScores = new Map(parsed.idfScores);
            }
            
            if (parsed.wordVectors) {
                this.wordVectors = new Map(parsed.wordVectors.map(([word, array]: [string, number[]]) => [
                    word,
                    new Float32Array(array)
                ]));
            }
        } catch (error) {
            console.error('Failed to deserialize embeddings:', error);
        }
    }
}
