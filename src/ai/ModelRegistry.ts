/**
 * Model Registry - Comprehensive list of supported local models
 * Inspired by Smart Connections' approach but optimized for VaultMind
 */

export interface ModelConfig {
    name: string;
    huggingFaceId: string;
    size: string;
    type: 'generation' | 'embedding' | 'both';
    capabilities: string[];
    requirements: {
        memory: number; // in MB
        compute: 'low' | 'medium' | 'high';
    };
    performance: {
        speed: 'fast' | 'medium' | 'slow';
        quality: 'excellent' | 'good' | 'fair';
    };
    description: string;
}

export const MODEL_REGISTRY: Record<string, ModelConfig> = {
    // === GENERATION MODELS ===
    // ⚠️ IMPORTANT: Not all models are supported by transformers.js!
    // Currently supported: FLAN-T5, BERT variants, DistilBERT, GPT-2
    // NOT supported yet: Phi-3, TinyLlama, Qwen, Gemma, StableLM (custom architectures)
    
    // Phi Series (Microsoft) - NOT SUPPORTED BY TRANSFORMERS.JS YET
    // Keeping for future reference when support is added
    'phi-3-mini': {
        name: 'Phi-3 Mini 4K',
        huggingFaceId: 'Xenova/Phi-3-mini-4k-instruct', // Using Xenova's ONNX version
        size: '850MB',
        type: 'generation',
        capabilities: ['chat', 'summarization', 'question-answering', 'reasoning'],
        requirements: { memory: 1024, compute: 'medium' },
        performance: { speed: 'fast', quality: 'excellent' },
        description: 'Best overall model for local use. Excellent reasoning and chat.'
    },
    
    'phi-2': {
        name: 'Phi-2',
        huggingFaceId: 'Xenova/phi-2', // Using Xenova's ONNX version
        size: '2.7GB',
        type: 'generation',
        capabilities: ['chat', 'code', 'reasoning', 'math'],
        requirements: { memory: 3072, compute: 'high' },
        performance: { speed: 'medium', quality: 'excellent' },
        description: 'Larger Phi model with better code and math capabilities.'
    },
    
    // TinyLlama Series
    'tinyllama-1.1b': {
        name: 'TinyLlama 1.1B',
        huggingFaceId: 'Xenova/TinyLlama-1.1B-Chat-v1.0', // Using Xenova's ONNX version
        size: '600MB',
        type: 'generation',
        capabilities: ['chat', 'summarization', 'basic-qa'],
        requirements: { memory: 768, compute: 'low' },
        performance: { speed: 'fast', quality: 'good' },
        description: 'Compact model with good balance of size and performance.'
    },
    
    // Qwen Series (Alibaba)
    'qwen2.5-0.5b': {
        name: 'Qwen 2.5 0.5B',
        huggingFaceId: 'Qwen/Qwen2.5-0.5B-Instruct',
        size: '350MB',
        type: 'generation',
        capabilities: ['chat', 'basic-summarization'],
        requirements: { memory: 512, compute: 'low' },
        performance: { speed: 'fast', quality: 'fair' },
        description: 'Ultra-light model for basic tasks.'
    },
    
    'qwen2.5-1.5b': {
        name: 'Qwen 2.5 1.5B',
        huggingFaceId: 'Qwen/Qwen2.5-1.5B-Instruct',
        size: '1.5GB',
        type: 'generation',
        capabilities: ['chat', 'summarization', 'translation', 'qa'],
        requirements: { memory: 2048, compute: 'medium' },
        performance: { speed: 'medium', quality: 'good' },
        description: 'Versatile model with multilingual support.'
    },
    
    // FLAN-T5 Series (Google) - Using Xenova's ONNX conversions
    'flan-t5-small': {
        name: 'FLAN-T5 Small',
        huggingFaceId: 'Xenova/flan-t5-small', // Using Xenova's ONNX version
        size: '250MB',
        type: 'generation',
        capabilities: ['qa', 'summarization', 'translation'],
        requirements: { memory: 384, compute: 'low' },
        performance: { speed: 'fast', quality: 'fair' },
        description: 'Lightweight T5 model for simple tasks.'
    },
    
    'flan-t5-base': {
        name: 'FLAN-T5 Base',
        huggingFaceId: 'Xenova/flan-t5-base', // Using Xenova's ONNX version
        size: '990MB',
        type: 'generation',
        capabilities: ['qa', 'summarization', 'translation', 'reasoning'],
        requirements: { memory: 1280, compute: 'medium' },
        performance: { speed: 'medium', quality: 'good' },
        description: 'Balanced T5 model with better quality.'
    },
    
    // Gemma Series (Google)
    'gemma-2b': {
        name: 'Gemma 2B',
        huggingFaceId: 'google/gemma-2b-it',
        size: '2.5GB',
        type: 'generation',
        capabilities: ['chat', 'reasoning', 'creative-writing'],
        requirements: { memory: 3072, compute: 'high' },
        performance: { speed: 'slow', quality: 'excellent' },
        description: 'Google\'s compact but powerful model.'
    },
    
    // StableLM Series
    'stablelm-2-zephyr-1.6b': {
        name: 'StableLM 2 Zephyr 1.6B',
        huggingFaceId: 'stabilityai/stablelm-2-zephyr-1_6b',
        size: '1.6GB',
        type: 'generation',
        capabilities: ['chat', 'creative-writing', 'reasoning'],
        requirements: { memory: 2048, compute: 'medium' },
        performance: { speed: 'medium', quality: 'good' },
        description: 'Stable Diffusion team\'s language model.'
    },
    
    // === EMBEDDING MODELS ===
    
    'all-minilm-l6': {
        name: 'All-MiniLM-L6-v2',
        huggingFaceId: 'Xenova/all-MiniLM-L6-v2',
        size: '90MB',
        type: 'embedding',
        capabilities: ['semantic-search', 'similarity'],
        requirements: { memory: 128, compute: 'low' },
        performance: { speed: 'fast', quality: 'good' },
        description: 'Best general-purpose embedding model for semantic search.'
    },
    
    'all-minilm-l12': {
        name: 'All-MiniLM-L12-v2',
        huggingFaceId: 'Xenova/all-MiniLM-L12-v2',
        size: '120MB',
        type: 'embedding',
        capabilities: ['semantic-search', 'similarity', 'clustering'],
        requirements: { memory: 192, compute: 'low' },
        performance: { speed: 'fast', quality: 'excellent' },
        description: 'Higher quality embeddings with more layers.'
    },
    
    'gte-small': {
        name: 'GTE-Small',
        huggingFaceId: 'Xenova/gte-small',
        size: '70MB',
        type: 'embedding',
        capabilities: ['semantic-search', 'retrieval'],
        requirements: { memory: 96, compute: 'low' },
        performance: { speed: 'fast', quality: 'good' },
        description: 'Alibaba\'s efficient embedding model.'
    },
    
    'bge-small-en': {
        name: 'BGE-Small-EN',
        huggingFaceId: 'BAAI/bge-small-en-v1.5',
        size: '130MB',
        type: 'embedding',
        capabilities: ['semantic-search', 'reranking'],
        requirements: { memory: 192, compute: 'low' },
        performance: { speed: 'fast', quality: 'excellent' },
        description: 'Beijing Academy\'s SOTA embedding model.'
    },
    
    'e5-small-v2': {
        name: 'E5-Small-v2',
        huggingFaceId: 'intfloat/e5-small-v2',
        size: '130MB',
        type: 'embedding',
        capabilities: ['semantic-search', 'text-similarity'],
        requirements: { memory: 192, compute: 'low' },
        performance: { speed: 'fast', quality: 'excellent' },
        description: 'Microsoft\'s E5 embeddings for semantic search.'
    },
    
    // === SPECIALIZED MODELS ===
    
    'codebert-base': {
        name: 'CodeBERT Base',
        huggingFaceId: 'microsoft/codebert-base',
        size: '450MB',
        type: 'embedding',
        capabilities: ['code-search', 'code-similarity'],
        requirements: { memory: 512, compute: 'low' },
        performance: { speed: 'fast', quality: 'good' },
        description: 'Specialized for code understanding and search.'
    },
    
    'biobert': {
        name: 'BioBERT',
        huggingFaceId: 'dmis-lab/biobert-base-cased-v1.2',
        size: '420MB',
        type: 'embedding',
        capabilities: ['medical-search', 'biomedical-qa'],
        requirements: { memory: 512, compute: 'low' },
        performance: { speed: 'fast', quality: 'good' },
        description: 'Specialized for biomedical and scientific text.'
    },
    
    'finbert': {
        name: 'FinBERT',
        huggingFaceId: 'ProsusAI/finbert',
        size: '420MB',
        type: 'embedding',
        capabilities: ['financial-analysis', 'sentiment'],
        requirements: { memory: 512, compute: 'low' },
        performance: { speed: 'fast', quality: 'good' },
        description: 'Specialized for financial text analysis.'
    }
};

// Helper functions for model selection
export function getModelsByType(type: 'generation' | 'embedding' | 'both'): ModelConfig[] {
    return Object.values(MODEL_REGISTRY).filter(m => m.type === type || m.type === 'both');
}

export function getModelsByMemory(maxMemoryMB: number): ModelConfig[] {
    return Object.values(MODEL_REGISTRY).filter(m => m.requirements.memory <= maxMemoryMB);
}

export function getRecommendedModels(): { generation: string; embedding: string } {
    return {
        generation: 'flan-t5-small', // Actually supported by transformers.js
        embedding: 'all-minilm-l6' // Fast and efficient
    };
}

export function getModelSuggestions(useCase: string): string[] {
    // Only suggesting models that are ACTUALLY supported by transformers.js
    const suggestions: Record<string, string[]> = {
        'general': ['flan-t5-small', 'flan-t5-base', 'all-minilm-l6'],
        'code': ['flan-t5-base', 'codebert-base'],
        'research': ['flan-t5-base', 'bge-small-en', 'e5-small-v2'],
        'medical': ['flan-t5-base', 'biobert'],
        'finance': ['flan-t5-base', 'finbert'],
        'minimal': ['flan-t5-small', 'gte-small', 'all-minilm-l6'],
        'quality': ['flan-t5-base', 'bge-small-en', 'e5-small-v2'],
        'speed': ['flan-t5-small', 'all-minilm-l6', 'gte-small']
    };
    
    return suggestions[useCase] || suggestions['general'];
}
