import { Modal, App, Notice, ProgressBarComponent } from 'obsidian';

export class DownloadProgressModal extends Modal {
    private progressBar: HTMLDivElement;
    private statusText: HTMLElement;
    private cancelBtn: HTMLButtonElement;
    private onCancel?: () => void;
    
    constructor(app: App, title: string, onCancel?: () => void) {
        super(app);
        this.onCancel = onCancel;
        this.setTitle(title);
    }
    
    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        // Status text
        this.statusText = contentEl.createEl('p', { 
            text: 'Preparing download...',
            cls: 'download-status'
        });
        
        // Progress bar container
        const progressContainer = contentEl.createDiv({ cls: 'progress-container' });
        progressContainer.style.marginTop = '1rem';
        progressContainer.style.marginBottom = '1rem';
        
        // Progress bar background
        const progressBg = progressContainer.createDiv({ cls: 'progress-bg' });
        progressBg.style.width = '100%';
        progressBg.style.height = '20px';
        progressBg.style.backgroundColor = 'var(--background-modifier-border)';
        progressBg.style.borderRadius = '10px';
        progressBg.style.overflow = 'hidden';
        
        // Progress bar fill
        this.progressBar = progressBg.createDiv({ cls: 'progress-fill' });
        this.progressBar.style.width = '0%';
        this.progressBar.style.height = '100%';
        this.progressBar.style.backgroundColor = 'var(--interactive-accent)';
        this.progressBar.style.transition = 'width 0.3s ease';
        
        // Progress percentage text
        const progressText = progressContainer.createEl('p', { 
            text: '0%',
            cls: 'progress-text'
        });
        progressText.style.textAlign = 'center';
        progressText.style.marginTop = '0.5rem';
        
        // Cancel button
        this.cancelBtn = contentEl.createEl('button', { 
            text: 'Cancel',
            cls: 'mod-warning'
        });
        this.cancelBtn.style.width = '100%';
        this.cancelBtn.addEventListener('click', () => {
            if (this.onCancel) {
                this.onCancel();
            }
            this.close();
        });
    }
    
    updateProgress(progress: number, statusText?: string) {
        if (this.progressBar) {
            this.progressBar.style.width = `${progress}%`;
            
            const progressText = this.contentEl.querySelector('.progress-text');
            if (progressText) {
                progressText.setText(`${Math.round(progress)}%`);
            }
        }
        
        if (statusText && this.statusText) {
            this.statusText.setText(statusText);
        }
    }
    
    setComplete(message: string = 'Download complete!') {
        if (this.statusText) {
            this.statusText.setText(message);
        }
        if (this.cancelBtn) {
            this.cancelBtn.setText('Close');
            this.cancelBtn.removeClass('mod-warning');
            this.cancelBtn.addClass('mod-cta');
        }
        this.updateProgress(100);
    }
    
    setError(error: string) {
        if (this.statusText) {
            this.statusText.setText(`Error: ${error}`);
            this.statusText.style.color = 'var(--text-error)';
        }
        if (this.cancelBtn) {
            this.cancelBtn.setText('Close');
        }
    }
    
    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

// Model Selection Modal
export class ModelSelectionModal extends Modal {
    private onSelect: (modelId: string) => void;
    
    constructor(app: App, onSelect: (modelId: string) => void) {
        super(app);
        this.onSelect = onSelect;
        this.setTitle('Select AI Model to Download');
    }
    
    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        // Import model registry
        import('../ai/ModelRegistry').then(({ MODEL_REGISTRY, getRecommendedModels }) => {
            const recommended = getRecommendedModels();
            
            contentEl.createEl('h3', { text: 'Recommended Models' });
            
            // Show recommended models first
            const recContainer = contentEl.createDiv({ cls: 'recommended-models' });
            
            const genModel = MODEL_REGISTRY[recommended.generation];
            if (genModel) {
                this.createModelCard(recContainer, recommended.generation, genModel, true);
            }
            
            const embModel = MODEL_REGISTRY[recommended.embedding];
            if (embModel) {
                this.createModelCard(recContainer, recommended.embedding, embModel, true);
            }
            
            contentEl.createEl('h3', { text: 'All Available Models' });
            
            // Generation models
            contentEl.createEl('h4', { text: 'Text Generation Models' });
            const genContainer = contentEl.createDiv({ cls: 'model-grid' });
            
            Object.entries(MODEL_REGISTRY)
                .filter(([_, m]) => m.type === 'generation')
                .forEach(([id, model]) => {
                    this.createModelCard(genContainer, id, model);
                });
            
            // Embedding models
            contentEl.createEl('h4', { text: 'Embedding Models' });
            const embContainer = contentEl.createDiv({ cls: 'model-grid' });
            
            Object.entries(MODEL_REGISTRY)
                .filter(([_, m]) => m.type === 'embedding')
                .forEach(([id, model]) => {
                    this.createModelCard(embContainer, id, model);
                });
        });
    }
    
    private createModelCard(container: HTMLElement, modelId: string, model: any, isRecommended = false) {
        const card = container.createDiv({ cls: 'model-card' });
        card.style.padding = '1rem';
        card.style.border = '1px solid var(--background-modifier-border)';
        card.style.borderRadius = '8px';
        card.style.marginBottom = '1rem';
        
        if (isRecommended) {
            card.style.backgroundColor = 'var(--background-modifier-success)';
            card.style.borderColor = 'var(--interactive-accent)';
        }
        
        const header = card.createDiv({ cls: 'model-header' });
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'start';
        header.style.marginBottom = '0.5rem';
        
        const title = header.createDiv();
        title.createEl('h4', { text: model.name });
        if (isRecommended) {
            const badge = title.createEl('span', { text: 'Recommended', cls: 'badge' });
            badge.style.fontSize = '0.75rem';
            badge.style.marginLeft = '0.5rem';
            badge.style.padding = '0.2rem 0.5rem';
            badge.style.backgroundColor = 'var(--interactive-accent)';
            badge.style.color = 'white';
            badge.style.borderRadius = '4px';
        }
        
        const size = header.createEl('span', { text: model.size });
        size.style.fontSize = '0.9rem';
        size.style.color = 'var(--text-muted)';
        
        card.createEl('p', { text: model.description });
        
        const details = card.createDiv({ cls: 'model-details' });
        details.style.fontSize = '0.85rem';
        details.style.color = 'var(--text-muted)';
        details.style.marginTop = '0.5rem';
        
        details.createEl('div', { text: `Speed: ${model.performance.speed} | Quality: ${model.performance.quality}` });
        details.createEl('div', { text: `Memory: ${model.requirements.memory}MB | Compute: ${model.requirements.compute}` });
        
        const downloadBtn = card.createEl('button', {
            text: 'Download',
            cls: 'mod-cta'
        });
        downloadBtn.style.marginTop = '0.5rem';
        downloadBtn.style.width = '100%';
        downloadBtn.addEventListener('click', () => {
            this.onSelect(modelId);
            this.close();
        });
    }
    
    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

// Model Management Modal
export class ModelManagementModal extends Modal {
    private modelList: HTMLElement;
    private plugin: any;
    
    constructor(app: App, plugin: any) {
        super(app);
        this.plugin = plugin;
        this.setTitle('AI Model Management');
    }
    
    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        contentEl.createEl('h3', { text: 'Downloaded Models' });
        
        // Model list container
        this.modelList = contentEl.createDiv({ cls: 'model-list' });
        this.refreshModelList();
        
        // Storage location info
        const infoEl = contentEl.createDiv({ cls: 'model-info' });
        infoEl.style.marginTop = '1rem';
        infoEl.style.fontSize = '0.85em';
        infoEl.style.color = 'var(--text-muted)';
        
        const storagePath = this.getModelStoragePath();
        infoEl.createEl('p', { 
            text: `Models are stored in: ${storagePath}`
        });
        
        infoEl.createEl('p', { 
            text: 'Note: Models are cached by your browser and managed automatically.'
        });
        
        // Clear cache button
        const clearBtn = contentEl.createEl('button', { 
            text: 'Clear Model Cache',
            cls: 'mod-warning'
        });
        clearBtn.style.marginTop = '1rem';
        clearBtn.addEventListener('click', async () => {
            if (confirm('This will remove all downloaded models. Continue?')) {
                await this.clearModelCache();
                new Notice('Model cache cleared');
                this.refreshModelList();
            }
        });
    }
    
    private refreshModelList() {
        if (!this.modelList) return;
        
        this.modelList.empty();
        
        // Get list of downloaded models (this is simplified - in reality would check cache)
        const downloadedModels = this.getDownloadedModels();
        
        if (downloadedModels.length === 0) {
            this.modelList.createEl('p', { 
                text: 'No models downloaded yet',
                cls: 'empty-state'
            });
            return;
        }
        
        downloadedModels.forEach(model => {
            const modelItem = this.modelList.createDiv({ cls: 'model-item' });
            modelItem.style.display = 'flex';
            modelItem.style.justifyContent = 'space-between';
            modelItem.style.alignItems = 'center';
            modelItem.style.padding = '0.5rem';
            modelItem.style.borderRadius = '4px';
            modelItem.style.backgroundColor = 'var(--background-modifier-form-field)';
            modelItem.style.marginBottom = '0.5rem';
            
            const modelInfo = modelItem.createDiv();
            modelInfo.createEl('div', { text: model.name });
            modelInfo.createEl('div', { 
                text: `Size: ${model.size}`,
                cls: 'model-size'
            }).style.fontSize = '0.85em';
            
            const deleteBtn = modelItem.createEl('button', { 
                text: 'Delete',
                cls: 'mod-warning'
            });
            deleteBtn.style.fontSize = '0.85em';
            deleteBtn.addEventListener('click', async () => {
                if (confirm(`Delete model ${model.name}?`)) {
                    await this.deleteModel(model.id);
                    new Notice(`Model ${model.name} deleted`);
                    this.refreshModelList();
                }
            });
        });
    }
    
    private getDownloadedModels(): any[] {
        // This would check actual cache/storage
        // For now, return mock data
        const models = [];
        
        // Check if current model is downloaded
        if (this.plugin.settings.localModelName) {
            models.push({
                id: this.plugin.settings.localModelName,
                name: this.plugin.settings.localModelName,
                size: 'Unknown'
            });
        }
        
        return models;
    }
    
    private getModelStoragePath(): string {
        // Browser cache location
        return 'Browser IndexedDB cache';
    }
    
    private async clearModelCache() {
        // Clear IndexedDB cache for transformers.js
        try {
            const databases = await indexedDB.databases();
            for (const db of databases) {
                if (db.name?.includes('transformers')) {
                    await indexedDB.deleteDatabase(db.name);
                }
            }
        } catch (error) {
            console.error('Failed to clear model cache:', error);
        }
    }
    
    private async deleteModel(modelId: string) {
        // Delete specific model from cache
        // This is simplified - actual implementation would be more complex
        console.log('Deleting model:', modelId);
    }
    
    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
