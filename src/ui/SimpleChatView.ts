import { ItemView, WorkspaceLeaf, Notice, setIcon, TFile, Modal, App, Setting } from 'obsidian';
import VaultMindPlugin from '../main';

export const CHAT_VIEW_TYPE = 'vaultmind-chat';

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

export class ChatView extends ItemView {
    plugin: VaultMindPlugin;
    private messages: ChatMessage[] = [];
    private messagesEl: HTMLElement;
    private inputEl: HTMLTextAreaElement;
    private sendBtn: HTMLButtonElement;
    private attachedNotes: TFile[] = [];
    private isProcessing = false;

    constructor(leaf: WorkspaceLeaf, plugin: VaultMindPlugin) {
        super(leaf);
        this.plugin = plugin;
        console.debug('VaultMind Chat: Constructor called');
    }

    getViewType() {
        return CHAT_VIEW_TYPE;
    }

    getDisplayText() {
        return "VaultMind AI Chat";
    }

    getIcon() {
        return "message-circle";
    }

    async onOpen() {
        console.debug('VaultMind Chat: onOpen called');
        
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass('vaultmind-chat-container');
        
        // Create header with controls
        const header = container.createEl('div', { cls: 'vaultmind-chat-header' });
        const headerLeft = header.createEl('div', { cls: 'header-left' });
        headerLeft.createEl('h3', { text: 'VaultMind Assistant' });
        
        const controls = header.createEl('div', { cls: 'vaultmind-chat-controls' });
        
        // Attach notes button
        const attachBtn = controls.createEl('button', {
            cls: 'vaultmind-icon-button',
            attr: { 'aria-label': 'Attach notes' }
        });
        setIcon(attachBtn, 'paperclip');
        attachBtn.addEventListener('click', () => this.attachNotes());
        
        // Search button
        const searchBtn = controls.createEl('button', {
            cls: 'vaultmind-icon-button',
            attr: { 'aria-label': 'Search vault' }
        });
        setIcon(searchBtn, 'search');
        searchBtn.addEventListener('click', () => this.searchVault());
        
        // Clear button
        const clearBtn = controls.createEl('button', {
            cls: 'vaultmind-icon-button',
            attr: { 'aria-label': 'Clear chat' }
        });
        setIcon(clearBtn, 'trash-2');
        clearBtn.addEventListener('click', () => this.clearChat());
        
        // Context indicator
        const contextEl = container.createEl('div', { cls: 'vaultmind-chat-context' });
        this.updateContextIndicator(contextEl);
        
        // Messages area
        this.messagesEl = container.createEl('div', { cls: 'vaultmind-chat-messages' });
        
        // Add welcome message
        this.addWelcomeMessage();
        
        // Input area
        const inputContainer = container.createEl('div', { cls: 'vaultmind-chat-input-container' });
        
        this.inputEl = inputContainer.createEl('textarea', {
            cls: 'vaultmind-chat-input',
            attr: { 
                placeholder: 'Ask about your vault, tasks, goals...',
                rows: '2'
            }
        });
        
        this.inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        this.sendBtn = inputContainer.createEl('button', {
            cls: 'vaultmind-chat-send-button',
            text: 'Send'
        });
        this.sendBtn.addEventListener('click', () => this.sendMessage());
        
        console.debug('VaultMind Chat: UI created successfully');
    }

    private addWelcomeMessage() {
        const taskCount = this.plugin.taskEngine?.getTasks().length || 0;
        const goalCount = this.plugin.goalEngine?.getGoals().length || 0;
        
        this.addMessage({
            role: 'assistant',
            content: `👋 Hi! I'm your VaultMind AI assistant with full access to your vault.

I can help you with:
• 📝 **Notes**: Search, summarize, find connections
• ✅ **Tasks**: List, filter, analyze (${taskCount} tasks indexed)
• 🎯 **Goals**: Track progress (${goalCount} goals found)
• 🔍 **Smart Search**: Find any information

**Try asking:**
• "Show my overdue tasks"
• "What are my goals?"
• "Find notes about [topic]"

Use the 📎 button to attach specific notes for context.`,
            timestamp: new Date()
        });
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
        
        this.inputEl.value = '';
        this.setProcessing(true);
        
        try {
            // Get AI response
            const response = await this.getAIResponse(message);
            
            this.addMessage({
                role: 'assistant',
                content: response,
                timestamp: new Date()
            });
        } catch (error) {
            console.error('Chat error:', error);
            this.addMessage({
                role: 'assistant',
                content: 'Sorry, I encountered an error. Please check your AI settings.',
                timestamp: new Date()
            });
        } finally {
            this.setProcessing(false);
        }
    }

    private async getAIResponse(message: string): Promise<string> {
        // Check for AI provider
        if (!this.plugin.aiProvider) {
            if (this.plugin.aiManager) {
                this.plugin.aiProvider = await this.plugin.aiManager.getProvider();
            }
            
            if (!this.plugin.aiProvider) {
                return 'Please configure an AI provider (OpenAI, Claude, or Ollama) in settings.';
            }
        }
        
        // Build context
        let context = await this.buildContext(message);
        
        // Handle different query types
        const lower = message.toLowerCase();
        
        if (lower.includes('task') || lower.includes('overdue')) {
            return await this.handleTaskQuery(message);
        }
        
        if (lower.includes('goal')) {
            return await this.handleGoalQuery(message);
        }
        
        if (lower.includes('find') || lower.includes('search')) {
            return await this.handleSearchQuery(message);
        }
        
        // General query
        return await this.plugin.aiProvider.answerQuestion(message, context);
    }

    private async buildContext(query: string): Promise<string> {
        let context = '';
        
        // Add attached notes
        if (this.attachedNotes.length > 0) {
            context += '=== ATTACHED NOTES ===\n';
            for (const file of this.attachedNotes.slice(0, 3)) {
                const content = await this.plugin.app.vault.read(file);
                context += `📄 ${file.basename}:\n${content.substring(0, 500)}...\n\n`;
            }
        }
        
        // Add vault stats
        const notes = Array.from(this.plugin.vaultIndexer.getIndex().notes.values());
        const tasks = this.plugin.taskEngine?.getTasks() || [];
        const goals = this.plugin.goalEngine?.getGoals() || [];
        
        context += '\n=== VAULT CONTEXT ===\n';
        context += `Notes: ${notes.length} | Tasks: ${tasks.length} | Goals: ${goals.length}\n`;
        
        return context;
    }

    private async handleTaskQuery(message: string): Promise<string> {
        const tasks = this.plugin.taskEngine?.getTasks() || [];
        const lower = message.toLowerCase();
        
        let filtered = tasks;
        let title = 'Tasks';
        
        if (lower.includes('overdue')) {
            filtered = tasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date() && !t.completed);
            title = 'Overdue Tasks';
        } else if (lower.includes('today')) {
            const today = new Date().toDateString();
            filtered = tasks.filter(t => t.dueDate && new Date(t.dueDate).toDateString() === today);
            title = "Today's Tasks";
        } else if (lower.includes('pending')) {
            filtered = tasks.filter(t => !t.completed);
            title = 'Pending Tasks';
        }
        
        if (filtered.length === 0) {
            return `No ${title.toLowerCase()} found.`;
        }
        
        let response = `## ${title}\n\nFound ${filtered.length} tasks:\n\n`;
        
        filtered.slice(0, 10).forEach(task => {
            const checkbox = task.completed ? '✅' : '☐';
            const due = task.dueDate ? ` 📅 ${new Date(task.dueDate).toLocaleDateString()}` : '';
            const priority = task.priority ? ` [${task.priority}]` : '';
            const file = task.filePath ? ` [[${task.filePath}]]` : '';
            
            response += `${checkbox} ${task.content}${priority}${due}${file}\n`;
        });
        
        if (filtered.length > 10) {
            response += `\n... and ${filtered.length - 10} more tasks`;
        }
        
        return response;
    }

    private async handleGoalQuery(message: string): Promise<string> {
        const goals = this.plugin.goalEngine?.getGoals() || [];
        
        if (goals.length === 0) {
            return 'No goals found. Add goals to your notes using:\n- Frontmatter: `goal: "Your goal"`\n- Headings: `## Goal: Your goal`';
        }
        
        let response = `## Your Goals\n\nYou have ${goals.length} goals:\n\n`;
        
        goals.forEach(goal => {
            const status = goal.status === 'completed' ? '✅' : '🎯';
            const progress = '█'.repeat(Math.round(goal.progress / 10)) + '░'.repeat(10 - Math.round(goal.progress / 10));
            const file = goal.filePath ? ` [[${goal.filePath}]]` : '';
            
            response += `${status} **${goal.title}**${file}\n`;
            response += `Progress: ${progress} ${goal.progress}%\n\n`;
        });
        
        return response;
    }

    private async handleSearchQuery(message: string): Promise<string> {
        const notes = Array.from(this.plugin.vaultIndexer.getIndex().notes.values());
        const query = message.replace(/^(find|search)\s+/i, '').toLowerCase();
        
        const results = notes.filter(note => 
            note.title.toLowerCase().includes(query) ||
            (note.content || '').toLowerCase().includes(query)
        ).slice(0, 10);
        
        if (results.length === 0) {
            return `No notes found matching "${query}"`;
        }
        
        let response = `## Search Results\n\nFound ${results.length} notes:\n\n`;
        
        results.forEach(note => {
            response += `• [[${note.filePath}|${note.title}]]\n`;
        });
        
        return response;
    }

    private addMessage(message: ChatMessage) {
        this.messages.push(message);
        
        const messageEl = this.messagesEl.createEl('div', {
            cls: `vaultmind-chat-message ${message.role}`
        });
        
        messageEl.createEl('div', {
            cls: 'message-time',
            text: message.timestamp.toLocaleTimeString()
        });
        
        messageEl.createEl('div', {
            cls: 'message-content',
            text: message.content
        });
        
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }

    private setProcessing(processing: boolean) {
        this.isProcessing = processing;
        this.inputEl.disabled = processing;
        this.sendBtn.disabled = processing;
        this.sendBtn.textContent = processing ? 'Thinking...' : 'Send';
    }

    private attachNotes() {
        const modal = new AttachNotesModal(
            this.plugin.app,
            (files) => {
                this.attachedNotes = files;
                const contextEl = this.containerEl.querySelector('.vaultmind-chat-context') as HTMLElement;
                this.updateContextIndicator(contextEl);
                new Notice(`Attached ${files.length} notes`);
            }
        );
        modal.open();
    }

    private searchVault() {
        const modal = new SearchModal(
            this.plugin.app,
            async (query) => {
                const message = `Find notes about ${query}`;
                this.inputEl.value = message;
                await this.sendMessage();
            }
        );
        modal.open();
    }

    private clearChat() {
        this.messages = [];
        this.messagesEl.empty();
        this.addWelcomeMessage();
        new Notice('Chat cleared');
    }

    private updateContextIndicator(contextEl: HTMLElement) {
        contextEl.empty();
        
        if (this.attachedNotes.length > 0) {
            contextEl.createEl('span', {
                text: `Context: 📎 ${this.attachedNotes.length} notes attached`,
                cls: 'context-summary'
            });
        } else {
            contextEl.createEl('span', {
                text: 'Context: Full vault access',
                cls: 'context-summary muted'
            });
        }
    }

    setInitialMessage(message: string) {
        if (this.inputEl && message) {
            this.inputEl.value = message;
            this.inputEl.focus();
        }
    }

    async onClose() {
        // Cleanup if needed
    }
}

// Simple modal for attaching notes
class AttachNotesModal extends Modal {
    private onSelect: (files: TFile[]) => void;
    private selected: TFile[] = [];

    constructor(app: App, onSelect: (files: TFile[]) => void) {
        super(app);
        this.onSelect = onSelect;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        contentEl.createEl('h2', { text: 'Attach Notes' });
        
        const fileList = contentEl.createEl('div', { cls: 'file-list' });
        
        const files = this.app.vault.getMarkdownFiles()
            .sort((a, b) => b.stat.mtime - a.stat.mtime)
            .slice(0, 20);
        
        files.forEach(file => {
            const item = fileList.createEl('div', { cls: 'selectable-item' });
            const checkbox = item.createEl('input', { type: 'checkbox' });
            item.createEl('span', { text: file.basename });
            
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    this.selected.push(file);
                } else {
                    this.selected = this.selected.filter(f => f !== file);
                }
            });
        });
        
        const buttons = contentEl.createEl('div', { cls: 'modal-button-container' });
        
        const attachBtn = buttons.createEl('button', {
            text: 'Attach',
            cls: 'mod-cta'
        });
        
        attachBtn.addEventListener('click', () => {
            this.onSelect(this.selected);
            this.close();
        });
        
        const cancelBtn = buttons.createEl('button', { text: 'Cancel' });
        cancelBtn.addEventListener('click', () => this.close());
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

// Search modal
class SearchModal extends Modal {
    private onSearch: (query: string) => void;

    constructor(app: App, onSearch: (query: string) => void) {
        super(app);
        this.onSearch = onSearch;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        contentEl.createEl('h2', { text: 'Search Vault' });
        
        const input = contentEl.createEl('input', {
            type: 'text',
            placeholder: 'Enter search terms...',
            cls: 'search-input'
        });
        
        input.focus();
        
        const buttons = contentEl.createEl('div', { cls: 'modal-button-container' });
        
        const searchBtn = buttons.createEl('button', {
            text: 'Search',
            cls: 'mod-cta'
        });
        
        const search = () => {
            const query = input.value.trim();
            if (query) {
                this.onSearch(query);
                this.close();
            }
        };
        
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') search();
        });
        
        searchBtn.addEventListener('click', search);
        
        const cancelBtn = buttons.createEl('button', { text: 'Cancel' });
        cancelBtn.addEventListener('click', () => this.close());
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
