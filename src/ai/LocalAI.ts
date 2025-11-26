import { App, Notice } from 'obsidian';
import { DownloadProgressModal } from '../ui/DownloadModal';
import { 
    AIProvider, 
    SummaryOptions, 
    AIContext, 
    VaultMindSettings,
    WebSearchResult,
    VaultMindError,
    ErrorCodes
} from '../types';
import { WebSearchService } from '../services/WebSearchService';
import { MODEL_REGISTRY, ModelConfig, getRecommendedModels } from './ModelRegistry';

// We'll lazy-load transformers.js to avoid import issues
let transformersModule: any = null;
let pipeline: any = null;
let env: any = null;

async function loadTransformers() {
    if (!transformersModule) {
        try {
            console.log('VaultMind: Loading transformers.js module...');
            transformersModule = await import('@xenova/transformers');
            pipeline = transformersModule.pipeline;
            env = transformersModule.env;
            
            // Configure Transformers.js for browser environment
            if (env) {
                // Configure model loading
                env.allowLocalModels = false;  // Don't try to load from local filesystem
                env.allowRemoteModels = true;  // Allow downloading from HuggingFace
                env.useBrowserCache = true;    // Use browser cache for models
                env.useCache = true;            // Enable caching
                
                // Set WASM paths for ONNX Runtime Web
                // This is critical for browser environments
                env.backends = env.backends || {};
                env.backends.onnx = env.backends.onnx || {};
                env.backends.onnx.wasm = env.backends.onnx.wasm || {};
                
                // Use CDN for WASM files
                env.backends.onnx.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.1/dist/';
                env.backends.onnx.wasm.numThreads = 1;  // Single thread for stability
                env.backends.onnx.wasm.proxy = false;
                
                // Disable local paths
                env.localURL = '';
                env.localPathTemplate = '';
                
                console.log('VaultMind: Transformers.js environment configured for browser');
            }
            
            console.log('VaultMind: Transformers.js loaded successfully');
        } catch (error) {
            console.error('VaultMind: Failed to load transformers.js', error);
            throw new Error('Failed to load AI library. Please check your installation.');
        }
    }
    return { pipeline, env };
}

/**
 * LocalAI provides local LLM inference using small, efficient models
 * Currently supported models (transformers.js compatible):
 * 1. FLAN-T5-small (250MB) - Best for basic tasks
 * 2. FLAN-T5-base (990MB) - Better quality
 * 3. Embedding models (90-130MB) - For semantic search
 */
export class LocalAI implements AIProvider {
    name = 'LocalAI';
    type: 'local' | 'cloud' | 'external' = 'local';
    
    private settings: VaultMindSettings;
    private model: any = null;
    private embedder: any = null;
    private webSearch: WebSearchService | null = null;
    private initialized = false;
    private modelCache = new Map<string, any>();
    
    // Use the comprehensive model registry
    private currentModel: ModelConfig | null = null;
    private currentEmbeddingModel: ModelConfig | null = null;

    constructor(settings: VaultMindSettings) {
        this.settings = settings;
        
        // Get model configs from registry - default to FLAN-T5 small
        this.currentModel = MODEL_REGISTRY[settings.localModelName] || MODEL_REGISTRY['flan-t5-small'];
        this.currentEmbeddingModel = MODEL_REGISTRY[settings.embeddingModel || 'all-minilm-l6'] || MODEL_REGISTRY['all-minilm-l6'];
    }

    async initialize(): Promise<void> {
        if (this.initialized) return;
        
        try {
            console.log('VaultMind: Initializing LocalAI...');
            
            // Load transformers.js first
            const { pipeline: pipelineFn } = await loadTransformers();
            
            // Load the selected model from registry
            if (this.currentModel && this.currentModel.type !== 'embedding') {
                console.log(`VaultMind: Loading model ${this.currentModel.name}...`);
                
                // For text generation models
                if (this.currentModel.huggingFaceId.includes('t5')) {
                    this.model = await pipelineFn('text2text-generation', this.currentModel.huggingFaceId, {
                        progress_callback: (progress: any) => {
                            console.log(`Model loading: ${Math.round(progress.progress)}%`);
                        }
                    });
                } else {
                    this.model = await pipelineFn('text-generation', this.currentModel.huggingFaceId, {
                        progress_callback: (progress: any) => {
                            console.log(`Model loading: ${Math.round(progress.progress)}%`);
                        }
                    });
                }
            }
            
            // Load embedding model from registry
            if (this.currentEmbeddingModel) {
                console.log(`VaultMind: Loading embedding model ${this.currentEmbeddingModel.name}...`);
                this.embedder = await pipelineFn('feature-extraction', this.currentEmbeddingModel.huggingFaceId);
            }
            
            // Initialize web search if enabled
            if (this.settings.enableWebSearch) {
                this.webSearch = new WebSearchService(
                    this.settings.webSearchProvider,
                    this.settings.apiKey,
                    this.settings.customSearchEndpoint
                );
                await this.webSearch.initialize();
            }
            
            this.initialized = true;
            console.log('VaultMind: LocalAI initialized successfully');
        } catch (error) {
            console.error('VaultMind: Failed to initialize LocalAI', error);
            throw new VaultMindError(
                'Failed to initialize local AI model',
                ErrorCodes.AI_INIT_FAILED,
                error
            );
        }
    }

    async generateSummary(content: string, options?: SummaryOptions): Promise<string> {
        if (!this.initialized || !this.model) {
            throw new Error('AI not initialized');
        }
        
        const maxLength = options?.maxLength || 150;
        const style = options?.style || 'brief';
        
        // Prepare prompt based on style
        let prompt = '';
        switch (style) {
            case 'brief':
                prompt = `Summarize the following content in 2-3 sentences:\n\n${content}\n\nSummary:`;
                break;
            case 'detailed':
                prompt = `Provide a detailed summary of the following content:\n\n${content}\n\nDetailed Summary:`;
                break;
            case 'bullet-points':
                prompt = `Summarize the following content as bullet points:\n\n${content}\n\nKey Points:`;
                break;
        }
        
        // Truncate content if too long
        const maxContentLength = 2000;
        if (content.length > maxContentLength) {
            content = content.substring(0, maxContentLength) + '...';
        }
        
        try {
            const result = await this.model(prompt, {
                max_new_tokens: maxLength,
                temperature: 0.7,
                do_sample: true,
                top_p: 0.95
            });
            
            return this.cleanResponse(result[0].generated_text);
        } catch (error) {
            console.error('VaultMind: Summary generation failed', error);
            return 'Failed to generate summary.';
        }
    }

    async answerQuestion(question: string, context: string): Promise<string> {
        if (!this.initialized || !this.model) {
            throw new Error('AI not initialized');
        }
        
        let enhancedContext = context;
        
        // Enhance context with web search if enabled
        if (this.webSearch && this.shouldSearchWeb(question)) {
            try {
                const searchResults = await this.webSearch.search(question);
                const webContext = this.formatWebResults(searchResults);
                enhancedContext = `${context}\n\nWeb Search Results:\n${webContext}`;
            } catch (error) {
                console.error('VaultMind: Web search failed', error);
            }
        }
        
        // Prepare Q&A prompt
        const prompt = `Context: ${enhancedContext}\n\nQuestion: ${question}\n\nAnswer:`;
        
        // Truncate context if needed
        const maxPromptLength = 3000;
        const truncatedPrompt = prompt.length > maxPromptLength 
            ? prompt.substring(0, maxPromptLength) + '...\n\nAnswer:'
            : prompt;
        
        try {
            const result = await this.model(truncatedPrompt, {
                max_new_tokens: 200,
                temperature: 0.5,
                do_sample: true,
                top_p: 0.9
            });
            
            return this.cleanResponse(result[0].generated_text);
        } catch (error) {
            console.error('VaultMind: Question answering failed', error);
            return 'Unable to answer the question based on available context.';
        }
    }

    async generateSuggestions(context: AIContext): Promise<string[]> {
        if (!this.initialized || !this.model) {
            return [];
        }
        
        const suggestions: string[] = [];
        
        // Analyze tasks
        if (context.tasks && context.tasks.length > 0) {
            const overdueTasks = context.tasks.filter(t => 
                t.dueDate && new Date(t.dueDate) < new Date() && !t.completed
            );
            
            if (overdueTasks.length > 0) {
                suggestions.push(`You have ${overdueTasks.length} overdue tasks. Consider prioritizing them.`);
            }
            
            const highPriorityTasks = context.tasks.filter(t => 
                t.priority === 'high' && !t.completed
            );
            
            if (highPriorityTasks.length > 3) {
                suggestions.push('Multiple high-priority tasks detected. Consider breaking them down or delegating.');
            }
        }
        
        // Analyze goals
        if (context.goals && context.goals.length > 0) {
            const behindGoals = context.goals.filter(g => 
                g.progress < 50 && g.targetDate && 
                new Date(g.targetDate) < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            );
            
            if (behindGoals.length > 0) {
                suggestions.push(`${behindGoals.length} goal(s) need attention to meet their deadlines.`);
            }
        }
        
        // Analyze time tracking
        if (context.timeEntries && context.timeEntries.length > 0) {
            const todayTime = context.timeEntries
                .filter(e => new Date(e.startTime).toDateString() === new Date().toDateString())
                .reduce((sum, e) => sum + (e.duration || 0), 0);
            
            if (todayTime > 480) { // More than 8 hours
                suggestions.push('You\'ve been working for over 8 hours today. Consider taking a break.');
            } else if (todayTime < 120) { // Less than 2 hours
                suggestions.push('Low activity today. Focus on your most important task.');
            }
        }
        
        // Generate AI-powered suggestions if we have context
        if (suggestions.length === 0 && context.userQuery) {
            try {
                const prompt = `Based on this context, provide 3 actionable suggestions:\n${context.userQuery}\n\nSuggestions:`;
                const result = await this.model(prompt, {
                    max_new_tokens: 150,
                    temperature: 0.8
                });
                
                const aiSuggestions = this.parseSuggestions(result[0].generated_text);
                suggestions.push(...aiSuggestions);
            } catch (error) {
                console.error('VaultMind: Failed to generate AI suggestions', error);
            }
        }
        
        return suggestions.slice(0, 5); // Return top 5 suggestions
    }

    async generateEmbedding(text: string): Promise<Float32Array> {
        if (!this.embedder) {
            // Try to initialize embedder if not already done
            const { pipeline: pipelineFn } = await loadTransformers();
            if (this.currentEmbeddingModel) {
                this.embedder = await pipelineFn('feature-extraction', this.currentEmbeddingModel.huggingFaceId);
            } else {
                throw new Error('Embedding model not configured');
            }
        }
        
        try {
            const result = await this.embedder(text, {
                pooling: 'mean',
                normalize: true
            });
            
            return new Float32Array(result.data);
        } catch (error) {
            console.error('VaultMind: Embedding generation failed', error);
            throw error;
        }
    }

    async generateDailySummary(context: AIContext): Promise<string> {
        const tasksCompleted = context.tasks?.filter(t => t.completed).length || 0;
        const tasksTotal = context.tasks?.length || 0;
        const goalsProgressed = context.goals?.filter(g => g.progress > 0).length || 0;
        const timeTracked = context.timeEntries?.reduce((sum, e) => sum + (e.duration || 0), 0) || 0;
        
        const stats = `
📊 Daily Summary

Tasks: ${tasksCompleted}/${tasksTotal} completed
Goals: ${goalsProgressed} in progress
Time: ${Math.floor(timeTracked / 60)}h ${timeTracked % 60}m tracked
        `.trim();
        
        // Generate AI insights if model is available
        if (this.model) {
            try {
                const prompt = `Based on these daily stats, provide 2-3 insights:\n${stats}\n\nInsights:`;
                const result = await this.model(prompt, {
                    max_new_tokens: 100,
                    temperature: 0.7
                });
                
                const insights = this.cleanResponse(result[0].generated_text);
                return `${stats}\n\n💡 Insights:\n${insights}`;
            } catch (error) {
                console.error('VaultMind: Failed to generate insights', error);
                return stats;
            }
        }
        
        return stats;
    }

    async cleanup(): Promise<void> {
        console.log('VaultMind: Cleaning up LocalAI resources...');
        
        // Clear model cache
        this.modelCache.clear();
        
        // Reset models
        this.model = null;
        this.embedder = null;
        
        // Cleanup web search
        if (this.webSearch) {
            await this.webSearch.cleanup();
        }
        
        this.initialized = false;
    }

    // ============= Private Methods =============
    
    private cleanResponse(text: string): string {
        // Remove the original prompt from the response
        const lines = text.split('\n');
        const answerIndex = lines.findIndex(line => 
            line.includes('Answer:') || line.includes('Summary:') || line.includes('Insights:')
        );
        
        if (answerIndex !== -1) {
            return lines.slice(answerIndex + 1).join('\n').trim();
        }
        
        // Fallback: return last paragraph
        const paragraphs = text.split('\n\n');
        return paragraphs[paragraphs.length - 1].trim();
    }

    private shouldSearchWeb(question: string): boolean {
        // Keywords that might benefit from web search
        const webKeywords = [
            'latest', 'current', 'news', 'update', 'recent',
            'how to', 'tutorial', 'guide', 'documentation',
            'what is', 'define', 'meaning', 'explanation'
        ];
        
        const questionLower = question.toLowerCase();
        return webKeywords.some(keyword => questionLower.includes(keyword));
    }

    private formatWebResults(results: WebSearchResult[]): string {
        if (results.length === 0) return '';
        
        return results
            .slice(0, 3)
            .map(r => `- ${r.title}: ${r.snippet}`)
            .join('\n');
    }

    private parseSuggestions(text: string): string[] {
        const suggestions: string[] = [];
        const lines = text.split('\n');
        
        for (const line of lines) {
            const cleaned = line.replace(/^[-*•]\s*/, '').trim();
            if (cleaned.length > 10 && cleaned.length < 200) {
                suggestions.push(cleaned);
            }
        }
        
        return suggestions;
    }

    // ============= Model Management =============
    
    async downloadModel(modelName: string, app?: App): Promise<void> {
        const modelConfig = MODEL_REGISTRY[modelName];
        if (!modelConfig) {
            throw new Error(`Unknown model: ${modelName}`);
        }
        
        console.log(`VaultMind: Downloading model ${modelConfig.name}...`);
        
        // Create progress modal if app is provided
        let progressModal: DownloadProgressModal | null = null;
        let cancelled = false;
        
        if (app) {
            progressModal = new DownloadProgressModal(
                app,
                `Downloading ${modelConfig.name} (${modelConfig.size})`,
                () => {
                    cancelled = true;
                    console.log('VaultMind: Download cancelled by user');
                }
            );
            progressModal.open();
        }
        
        try {
            // Load transformers.js first
            const { pipeline: pipelineFn } = await loadTransformers();
            
            // Pre-download the model based on type
            const pipelineType = modelConfig.type === 'embedding' ? 'feature-extraction' : 
                                modelConfig.huggingFaceId.includes('t5') ? 'text2text-generation' : 
                                'text-generation';
            
            let modelPipeline;
            try {
                modelPipeline = await pipelineFn(pipelineType, modelConfig.huggingFaceId, {
                    progress_callback: (progress: any) => {
                        if (cancelled) {
                            throw new Error('Download cancelled');
                        }
                        
                        const percent = Math.round(progress.progress || 0);
                        console.log(`Download progress: ${percent}%`, progress);
                        
                        if (progressModal) {
                            let status = 'Downloading model files...';
                            if (progress.file) {
                                status = `Downloading: ${progress.file}`;
                            } else if (progress.status) {
                                status = progress.status;
                            }
                            progressModal.updateProgress(percent, status);
                        }
                    },
                    // Add quantization config to use smaller models
                    quantized: true,
                    // Use lower precision for browser compatibility
                    model_file_name: 'model_quantized'
                });
            } catch (pipelineError: any) {
                console.error('VaultMind: Pipeline creation failed:', pipelineError);
                
                // If WASM backend fails, provide helpful message
                if (pipelineError.message?.includes('wasm') || pipelineError.message?.includes('create')) {
                    throw new Error('Model initialization failed. This may be due to browser compatibility. Try refreshing Obsidian or using a different model.');
                }
                throw pipelineError;
            }
            
            // Test the model to ensure it's working
            console.log('VaultMind: Testing downloaded model...');
            if (pipelineType === 'text2text-generation') {
                await modelPipeline('Test', { max_new_tokens: 1 });
            }
            
            console.log('VaultMind: Model downloaded successfully');
            
            if (progressModal) {
                progressModal.setComplete(`${modelConfig.name} downloaded successfully!`);
                setTimeout(() => progressModal.close(), 2000);
            }
            
            if (app) {
                new Notice(`Model ${modelConfig.name} downloaded successfully!`);
            }
        } catch (error: any) {
            console.error('VaultMind: Model download failed', error);
            
            if (progressModal) {
                progressModal.setError(error.message || 'Download failed');
            }
            
            throw error;
        }
    }

    getAvailableModels(): string[] {
        return Object.keys(MODEL_REGISTRY);
    }

    getModelInfo(modelName: string): ModelConfig | null {
        return MODEL_REGISTRY[modelName] || null;
    }

    getCurrentModel(): string {
        return this.settings.localModelName;
    }
}
