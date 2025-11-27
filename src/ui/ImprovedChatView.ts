import { ItemView, WorkspaceLeaf, Notice, setIcon, TFile, Modal, App, Setting } from 'obsidian';
import VaultMindPlugin from '../main';
import { AIContext } from '../types';

export const CHAT_VIEW_TYPE = 'vaultmind-chat';

interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
    context?: string[]; // Files used for context
}

export class ChatView extends ItemView {
    plugin: VaultMindPlugin;
    private messages: ChatMessage[] = [];
    private messagesEl: HTMLElement;
    private inputEl: HTMLTextAreaElement;
    private sendBtn: HTMLButtonElement;
    private isProcessing = false;
    private attachedNotes: TFile[] = []; // Notes to use as context
    private contextEl: HTMLElement; // Shows attached notes

    constructor(leaf: WorkspaceLeaf, plugin: VaultMindPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() {
        return CHAT_VIEW_TYPE;
    }

    getDisplayText() {
        return "VaultMind Chat";
    }

    getIcon() {
        return "message-circle";
    }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass('vaultmind-chat-container');

        // Create chat header with controls
        const header = container.createEl('div', { cls: 'vaultmind-chat-header' });
        const title = header.createEl('h3', { text: 'VaultMind Assistant' });
        
        // Add control buttons
        const controls = header.createEl('div', { cls: 'vaultmind-chat-controls' });
        
        // Attach note button
        const attachBtn = controls.createEl('button', {
            cls: 'vaultmind-icon-button',
            attr: { 'aria-label': 'Attach notes for context' }
        });
        setIcon(attachBtn, 'paperclip');
        attachBtn.addEventListener('click', () => this.selectNotesForContext());
        
        // Search vault button
        const searchBtn = controls.createEl('button', {
            cls: 'vaultmind-icon-button',
            attr: { 'aria-label': 'Search vault' }
        });
        setIcon(searchBtn, 'search');
        searchBtn.addEventListener('click', () => this.searchVaultForContext());
        
        // Clear button
        const clearBtn = controls.createEl('button', {
            cls: 'vaultmind-icon-button',
            attr: { 'aria-label': 'Clear chat' }
        });
        setIcon(clearBtn, 'trash-2');
        clearBtn.addEventListener('click', () => this.clearChat());

        // Context indicator (shows attached notes)
        this.contextEl = container.createEl('div', { cls: 'vaultmind-chat-context' });
        this.updateContextIndicator();

        // Create messages area
        this.messagesEl = container.createEl('div', { cls: 'vaultmind-chat-messages' });
        
        // Create input area
        const inputContainer = container.createEl('div', { cls: 'vaultmind-chat-input-container' });
        
        // Input field
        this.inputEl = inputContainer.createEl('textarea', {
            cls: 'vaultmind-chat-input',
            attr: { 
                placeholder: 'Ask me anything about your vault...',
                rows: '1'
            }
        });
        
        // Auto-resize textarea
        this.inputEl.addEventListener('input', () => {
            this.inputEl.style.height = 'auto';
            this.inputEl.style.height = this.inputEl.scrollHeight + 'px';
        });
        
        // Send on Enter (Shift+Enter for new line)
        this.inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        // Send button
        this.sendBtn = inputContainer.createEl('button', {
            cls: 'vaultmind-chat-send-button',
            text: 'Send'
        });
        this.sendBtn.addEventListener('click', () => this.sendMessage());
        
        // Add initial message
        this.addMessage({
            role: 'assistant',
            content: 'Hi! I\'m VaultMind Assistant. I can help you with:\n\n' +
                     '• 📝 Finding and summarizing notes\n' +
                     '• ✅ Managing tasks and goals\n' +
                     '• 🔍 Searching your vault\n' +
                     '• 💡 Generating insights\n\n' +
                     'Use the paperclip icon to attach specific notes, or just ask me anything!',
            timestamp: new Date()
        });
        
        // Check for active file
        const activeFile = this.plugin.app.workspace.getActiveFile();
        if (activeFile) {
            this.attachedNotes = [activeFile];
            this.updateContextIndicator();
        }
    }

    async onClose() {
        // Clean up if needed
    }

    /**
     * Open modal to select notes for context
     */
    private selectNotesForContext() {
        const modal = new NoteSelectionModal(this.plugin.app, this.plugin, (selected: TFile[]) => {
            this.attachedNotes = selected;
            this.updateContextIndicator();
            if (selected.length > 0) {
                new Notice(`Attached ${selected.length} note(s) for context`);
            }
        });
        modal.open();
    }

    /**
     * Search vault for relevant notes
     */
    private async searchVaultForContext() {
        const modal = new SearchModal(this.plugin.app, this.plugin, (query: string) => {
            this.searchAndAttachNotes(query);
        });
        modal.open();
    }

    /**
     * Search and attach relevant notes
     */
    private async searchAndAttachNotes(query: string) {
        const allNotes = Array.from(this.plugin.vaultIndexer.getIndex().notes.values());
        const relevantNotes = allNotes
            .filter(note => {
                const searchLower = query.toLowerCase();
                return note.title?.toLowerCase().includes(searchLower) || 
                       note.content?.toLowerCase().includes(searchLower);
            })
            .slice(0, 10)
            .map(note => this.plugin.app.vault.getAbstractFileByPath(note.filePath || ''))
            .filter((file): file is TFile => file instanceof TFile);
        
        this.attachedNotes = relevantNotes;
        this.updateContextIndicator();
        new Notice(`Found ${relevantNotes.length} relevant notes`);
    }

    /**
     * Update context indicator showing attached notes
     */
    private updateContextIndicator() {
        this.contextEl.empty();
        
        if (this.attachedNotes.length > 0) {
            this.contextEl.createEl('div', { 
                text: `Context: ${this.attachedNotes.length} note(s) attached`,
                cls: 'context-header'
            });
            
            const notesList = this.contextEl.createEl('div', { cls: 'context-notes' });
            this.attachedNotes.forEach(file => {
                const noteEl = notesList.createEl('span', { 
                    text: file.basename,
                    cls: 'context-note-badge'
                });
                
                // Click to remove
                noteEl.addEventListener('click', () => {
                    this.attachedNotes = this.attachedNotes.filter(f => f !== file);
                    this.updateContextIndicator();
                });
            });
        }
    }

    private async sendMessage() {
        const message = this.inputEl.value.trim();
        if (!message || this.isProcessing) return;

        // Add user message
        this.addMessage({
            role: 'user',
            content: message,
            timestamp: new Date()
        });

        // Clear input
        this.inputEl.value = '';
        this.inputEl.style.height = 'auto';
        
        // Disable input while processing
        this.setProcessing(true);

        try {
            // Get AI response with context
            const response = await this.getAIResponse(message);
            
            // Add assistant response
            this.addMessage({
                role: 'assistant',
                content: response,
                timestamp: new Date(),
                context: this.attachedNotes.map(f => f.path)
            });
        } catch (error) {
            console.error('VaultMind: Chat error', error);
            this.addMessage({
                role: 'assistant',
                content: 'Sorry, I encountered an error processing your request. Please try again.',
                timestamp: new Date()
            });
        } finally {
            this.setProcessing(false);
        }
    }

    private async getAIResponse(message: string): Promise<string> {
        // Check if AI provider is available
        if (!this.plugin.aiProvider) {
            if (this.plugin.aiManager) {
                this.plugin.aiProvider = await this.plugin.aiManager.getProvider();
            }
            
            if (!this.plugin.aiProvider) {
                return 'Please configure an AI provider in settings (OpenAI, Claude, or Ollama).';
            }
        }

        // Build context from attached notes and vault
        const context = await this.buildEnhancedContext(message);
        
        // Check message type and respond accordingly
        if (message.toLowerCase().includes('summarize')) {
            if (this.attachedNotes.length > 0) {
                const contents = await Promise.all(
                    this.attachedNotes.map(f => this.plugin.app.vault.read(f))
                );
                return await this.plugin.aiProvider.generateSummary(contents.join('\n\n'), {
                    style: 'detailed',
                    maxLength: 500
                });
            } else {
                return 'Please attach notes using the paperclip icon to summarize them.';
            }
        } else {
            // Answer question with full context
            return await this.plugin.aiProvider.answerQuestion(message, context);
        }
    }

    /**
     * Build enhanced context from attached notes and vault
     */
    private async buildEnhancedContext(query: string): Promise<string> {
        let context = '';
        
        // 1. Add attached notes context (highest priority)
        if (this.attachedNotes.length > 0) {
            context += '=== ATTACHED NOTES (User specifically selected these) ===\n\n';
            for (const file of this.attachedNotes) {
                const content = await this.plugin.app.vault.read(file);
                context += `📄 ${file.basename}:\n${content.substring(0, 1000)}\n\n`;
            }
        }
        
        // 2. Add relevant notes from vault search
        const allNotes = Array.from(this.plugin.vaultIndexer.getIndex().notes.values());
        const relevantNotes = allNotes
            .filter(note => {
                const searchLower = query.toLowerCase();
                return note.title?.toLowerCase().includes(searchLower) || 
                       note.content?.toLowerCase().includes(searchLower);
            })
            .filter(note => !this.attachedNotes.some(f => f.path === note.filePath))
            .slice(0, 3);
        
        if (relevantNotes.length > 0) {
            context += '=== RELEVANT NOTES FROM VAULT ===\n\n';
            for (const note of relevantNotes) {
                context += `📝 ${note.title}: ${note.content?.substring(0, 300)}...\n\n`;
            }
        }
        
        // 3. Add task context if relevant
        if (query.toLowerCase().includes('task') || query.toLowerCase().includes('todo')) {
            const tasks = this.plugin.taskEngine.getTasks({ completed: false });
            if (tasks.length > 0) {
                context += '=== TASKS ===\n';
                context += `Total pending: ${tasks.length}\n`;
                context += `Overdue: ${tasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date()).length}\n\n`;
                tasks.slice(0, 5).forEach(t => {
                    context += `- [ ] ${t.content}${t.dueDate ? ` (due ${new Date(t.dueDate).toLocaleDateString()})` : ''}\n`;
                });
                context += '\n';
            }
        }
        
        // 4. Add goal context if relevant
        if (query.toLowerCase().includes('goal')) {
            const goals = this.plugin.goalEngine.getGoals();
            if (goals.length > 0) {
                context += '=== GOALS ===\n';
                goals.slice(0, 3).forEach(g => {
                    context += `- ${g.title} (${g.progress}% complete)\n`;
                });
                context += '\n';
            }
        }
        
        // 5. Add vault statistics
        context += '=== VAULT INFO ===\n';
        context += `Total notes: ${allNotes.length}\n`;
        context += `Total tasks: ${this.plugin.taskEngine.getTasks().length}\n`;
        context += `Total goals: ${this.plugin.goalEngine.getGoals().length}\n`;
        
        return context;
    }

    private addMessage(message: ChatMessage) {
        this.messages.push(message);
        
        const messageEl = this.messagesEl.createEl('div', {
            cls: `vaultmind-chat-message ${message.role}`
        });
        
        // Add timestamp
        const time = messageEl.createEl('div', {
            cls: 'message-time',
            text: message.timestamp.toLocaleTimeString()
        });
        
        // Add content
        const content = messageEl.createEl('div', {
            cls: 'message-content',
            text: message.content
        });
        
        // Add context indicator if present
        if (message.context && message.context.length > 0) {
            const contextInfo = messageEl.createEl('div', {
                cls: 'message-context',
                text: `Used ${message.context.length} notes for context`
            });
        }
        
        // Scroll to bottom
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }

    private setProcessing(processing: boolean) {
        this.isProcessing = processing;
        this.inputEl.disabled = processing;
        this.sendBtn.disabled = processing;
        
        if (processing) {
            this.sendBtn.textContent = 'Thinking...';
            this.sendBtn.addClass('processing');
            
            // Add typing indicator
            const indicator = this.messagesEl.createEl('div', {
                cls: 'vaultmind-chat-typing'
            });
            // Create typing indicator dots
            indicator.createEl('span');
            indicator.createEl('span');
            indicator.createEl('span');
        } else {
            this.sendBtn.textContent = 'Send';
            this.sendBtn.removeClass('processing');
            
            // Remove typing indicator
            const indicator = this.messagesEl.querySelector('.vaultmind-chat-typing');
            if (indicator) indicator.remove();
        }
    }

    private clearChat() {
        this.messages = [];
        this.messagesEl.empty();
        this.attachedNotes = [];
        this.updateContextIndicator();
        
        // Show welcome message again
        this.addMessage({
            role: 'assistant',
            content: 'Chat cleared. How can I help you?',
            timestamp: new Date()
        });
    }
    
    /**
     * Set initial message in the input field
     */
    setInitialMessage(message: string) {
        if (this.inputEl && message) {
            this.inputEl.value = message;
            this.inputEl.focus();
        }
    }
}

/**
 * Modal for selecting notes to attach
 */
class NoteSelectionModal extends Modal {
    private plugin: VaultMindPlugin;
    private onSelect: (files: TFile[]) => void;
    private selected: Set<TFile> = new Set();

    constructor(app: App, plugin: VaultMindPlugin, onSelect: (files: TFile[]) => void) {
        super(app);
        this.plugin = plugin;
        this.onSelect = onSelect;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        contentEl.createEl('h2', { text: 'Select Notes for Context' });
        
        // Search input
        const searchInput = contentEl.createEl('input', {
            type: 'text',
            placeholder: 'Search notes...',
            cls: 'vaultmind-search-input'
        });
        
        // Notes list
        const listEl = contentEl.createEl('div', { cls: 'vaultmind-note-list' });
        
        // Get all notes
        const allFiles = this.app.vault.getMarkdownFiles();
        
        // Render notes
        const renderNotes = (filter: string = '') => {
            listEl.empty();
            
            const filtered = filter 
                ? allFiles.filter(f => f.basename.toLowerCase().includes(filter.toLowerCase()))
                : allFiles.slice(0, 50); // Show first 50 if no filter
            
            filtered.forEach(file => {
                const noteEl = listEl.createEl('div', { 
                    cls: 'vaultmind-note-item',
                    text: file.basename
                });
                
                if (this.selected.has(file)) {
                    noteEl.addClass('selected');
                }
                
                noteEl.addEventListener('click', () => {
                    if (this.selected.has(file)) {
                        this.selected.delete(file);
                        noteEl.removeClass('selected');
                    } else {
                        this.selected.add(file);
                        noteEl.addClass('selected');
                    }
                });
            });
        };
        
        // Initial render
        renderNotes();
        
        // Search functionality
        searchInput.addEventListener('input', () => {
            renderNotes(searchInput.value);
        });
        
        // Buttons
        const buttonContainer = contentEl.createEl('div', { cls: 'modal-button-container' });
        
        const selectBtn = buttonContainer.createEl('button', {
            text: 'Attach Selected',
            cls: 'mod-cta'
        });
        
        selectBtn.addEventListener('click', () => {
            this.onSelect(Array.from(this.selected));
            this.close();
        });
        
        const cancelBtn = buttonContainer.createEl('button', {
            text: 'Cancel'
        });
        
        cancelBtn.addEventListener('click', () => {
            this.close();
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

/**
 * Modal for searching vault
 */
class SearchModal extends Modal {
    private plugin: VaultMindPlugin;
    private onSearch: (query: string) => void;

    constructor(app: App, plugin: VaultMindPlugin, onSearch: (query: string) => void) {
        super(app);
        this.plugin = plugin;
        this.onSearch = onSearch;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        contentEl.createEl('h2', { text: 'Search Vault for Context' });
        
        const setting = new Setting(contentEl)
            .setName('Search Query')
            .setDesc('Enter keywords to find relevant notes')
            .addText(text => {
                text.setPlaceholder('e.g., project, meeting, ideas...')
                    .onChange(value => {
                        // Could add live preview here
                    });
                
                const searchBtn = contentEl.createEl('button', {
                    text: 'Search & Attach',
                    cls: 'mod-cta'
                });
                
                searchBtn.addEventListener('click', () => {
                    const query = text.getValue();
                    if (query) {
                        this.onSearch(query);
                        this.close();
                    }
                });
            });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
