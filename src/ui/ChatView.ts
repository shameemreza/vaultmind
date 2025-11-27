import { ItemView, WorkspaceLeaf, Notice, setIcon } from 'obsidian';
import VaultMindPlugin from '../main';
import { AIContext } from '../types';

export const CHAT_VIEW_TYPE = 'vaultmind-chat';

interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
}

export class ChatView extends ItemView {
    plugin: VaultMindPlugin;
    private messages: ChatMessage[] = [];
    private messagesEl: HTMLElement;
    private inputEl: HTMLTextAreaElement;
    private sendBtn: HTMLButtonElement;
    private isProcessing = false;

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

        // Create chat header
        const header = container.createEl('div', { cls: 'vaultmind-chat-header' });
        const title = header.createEl('h3', { text: 'VaultMind Assistant' });
        
        // Add clear button
        const clearBtn = header.createEl('button', {
            cls: 'vaultmind-icon-button',
            attr: { 'aria-label': 'Clear chat' }
        });
        setIcon(clearBtn, 'trash-2');
        clearBtn.addEventListener('click', () => this.clearChat());

        // Create messages container
        this.messagesEl = container.createEl('div', { cls: 'vaultmind-chat-messages' });
        
        // Show welcome message
        this.addMessage({
            role: 'assistant',
            content: 'Hi! I\'m VaultMind, your AI assistant. I can help you with:\n\n' +
                     '• Answering questions about your vault\n' +
                     '• Summarizing notes and documents\n' +
                     '• Finding related information\n' +
                     '• Task and goal management insights\n\n' +
                     'How can I help you today?',
            timestamp: new Date()
        });

        // Create input area
        const inputContainer = container.createEl('div', { cls: 'vaultmind-chat-input' });
        
        this.inputEl = inputContainer.createEl('textarea', {
            cls: 'vaultmind-chat-textarea',
            attr: {
                placeholder: 'Type your message...',
                rows: '3'
            }
        });

        // Handle Enter key (send) and Shift+Enter (new line)
        this.inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Auto-resize textarea
        this.inputEl.addEventListener('input', () => {
            this.inputEl.style.height = 'auto';
            this.inputEl.style.height = Math.min(this.inputEl.scrollHeight, 200) + 'px';
        });

        // Create action buttons
        const actions = inputContainer.createEl('div', { cls: 'vaultmind-chat-actions' });
        
        // Attach note button
        const attachBtn = actions.createEl('button', {
            cls: 'vaultmind-icon-button',
            attr: { 
                'aria-label': 'Attach current note',
                title: 'Include current note as context'
            }
        });
        setIcon(attachBtn, 'paperclip');
        attachBtn.addEventListener('click', () => this.attachCurrentNote());

        // Send button
        this.sendBtn = actions.createEl('button', {
            cls: 'vaultmind-chat-send',
            text: 'Send'
        });
        setIcon(this.sendBtn, 'send');
        this.sendBtn.addEventListener('click', () => this.sendMessage());
    }

    async onClose() {
        // Clean up if needed
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
            // Get AI response
            const response = await this.getAIResponse(message);
            
            // Add assistant response
            this.addMessage({
                role: 'assistant',
                content: response,
                timestamp: new Date()
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
        // Check if AI provider is initialized
        if (!this.plugin.aiProvider) {
            // Try to initialize AI provider
            if (this.plugin.settings.aiProvider !== 'none') {
                await this.plugin.updateAIProvider();
            }
            
            if (!this.plugin.aiProvider) {
                return 'AI assistant is not available. Please configure an AI model in settings.';
            }
        }

        // Build context from vault
        const context = await this.buildContext(message);
        
        // Check if it's a question or a request for summary
        if (message.toLowerCase().includes('summarize') || 
            message.toLowerCase().includes('summary')) {
            // Generate summary
            const activeFile = this.plugin.app.workspace.getActiveFile();
            if (activeFile) {
                const content = await this.plugin.app.vault.read(activeFile);
                return await this.plugin.aiProvider.generateSummary(content, {
                    style: 'detailed',
                    maxLength: 300
                });
            } else {
                return 'Please open a note to summarize it.';
            }
        } else {
            // Answer question with context
            return await this.plugin.aiProvider.answerQuestion(message, context);
        }
    }

    private async buildContext(query: string): Promise<string> {
        let context = '';
        
        // Add relevant notes based on query
        // For now, we'll get all indexed notes and filter by relevance
        const allNotes = Array.from(this.plugin.vaultIndexer.getIndex().notes.values());
        const relevantNotes = allNotes
            .filter(note => {
                const searchLower = query.toLowerCase();
                return note.title?.toLowerCase().includes(searchLower) || 
                       note.content?.toLowerCase().includes(searchLower);
            })
            .slice(0, 5);
        
        if (relevantNotes.length > 0) {
            context += 'Relevant notes from vault:\n';
            for (const note of relevantNotes) {
                const summary = note.content?.substring(0, 200) || 'No content';
                context += `- ${note.title}: ${summary}\n`;
            }
            context += '\n';
        }

        // Add task context if relevant
        if (query.toLowerCase().includes('task') || query.toLowerCase().includes('todo')) {
            const tasks = this.plugin.taskEngine.getTasks({ completed: false });
            const taskCount = tasks.length;
            const overdue = tasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date()).length;
            
            context += `Task information:\n`;
            context += `- Total pending tasks: ${taskCount}\n`;
            context += `- Overdue tasks: ${overdue}\n`;
            
            if (tasks.length > 0) {
                context += 'Recent tasks:\n';
                tasks.slice(0, 5).forEach(t => {
                    context += `- ${t.content}${t.dueDate ? ` (due ${new Date(t.dueDate).toLocaleDateString()})` : ''}\n`;
                });
            }
            context += '\n';
        }

        // Add goal context if relevant
        if (query.toLowerCase().includes('goal') || query.toLowerCase().includes('objective')) {
            const goals = this.plugin.goalEngine.getGoals();
            if (goals.length > 0) {
                context += `Active goals:\n`;
                goals.slice(0, 3).forEach(g => {
                    context += `- ${g.title}: ${g.progress}% complete\n`;
                });
                context += '\n';
            }
        }

        // Add time tracking context if relevant
        if (query.toLowerCase().includes('time') || query.toLowerCase().includes('track')) {
            const stats = this.plugin.timeTracker.getStatistics();
            context += `Time tracking:\n`;
            context += `- Today: ${stats.todayTotal} minutes\n`;
            context += `- This week: ${stats.weekTotal} minutes\n`;
            context += `- Average daily: ${stats.averageDaily.toFixed(0)} minutes\n\n`;
        }

        return context || 'No specific context found in vault.';
    }

    private async attachCurrentNote() {
        const activeFile = this.plugin.app.workspace.getActiveFile();
        if (!activeFile) {
            new Notice('No active file to attach');
            return;
        }

        const content = await this.plugin.app.vault.read(activeFile);
        const truncated = content.length > 500 ? 
            content.substring(0, 500) + '...' : content;
        
        this.inputEl.value = `Regarding "${activeFile.basename}":\n${truncated}\n\n`;
        this.inputEl.focus();
        
        // Trigger resize
        this.inputEl.style.height = 'auto';
        this.inputEl.style.height = Math.min(this.inputEl.scrollHeight, 200) + 'px';
    }

    private addMessage(message: ChatMessage) {
        const messageEl = this.messagesEl.createEl('div', {
            cls: `vaultmind-chat-message vaultmind-chat-${message.role}`
        });

        // Add avatar/icon
        const avatar = messageEl.createEl('div', { cls: 'vaultmind-chat-avatar' });
        if (message.role === 'user') {
            setIcon(avatar, 'user');
        } else if (message.role === 'assistant') {
            setIcon(avatar, 'bot');
        }

        // Add message content
        const content = messageEl.createEl('div', { cls: 'vaultmind-chat-content' });
        
        // Handle markdown-like formatting in the response
        const lines = message.content.split('\n');
        lines.forEach((line, index) => {
            if (line.startsWith('•') || line.startsWith('-')) {
                // Bullet point
                const li = content.createEl('div', { cls: 'vaultmind-chat-bullet' });
                li.textContent = line.substring(1).trim();
            } else if (line.startsWith('#')) {
                // Heading
                const level = line.match(/^#+/)?.[0].length || 1;
                const heading = content.createEl(`h${Math.min(level + 2, 6)}` as any, {
                    cls: 'vaultmind-chat-heading'
                });
                heading.textContent = line.replace(/^#+\s*/, '');
            } else if (line.trim()) {
                // Regular paragraph
                const p = content.createEl('p');
                p.textContent = line;
            }
            
            // Add line break between elements (except last)
            if (index < lines.length - 1 && !line.trim() && lines[index + 1].trim()) {
                content.createEl('br');
            }
        });

        // Add timestamp
        const time = messageEl.createEl('div', { cls: 'vaultmind-chat-time' });
        time.textContent = this.formatTime(message.timestamp);

        // Store message
        this.messages.push(message);

        // Scroll to bottom
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }

    private formatTime(date: Date): string {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
            indicator.innerHTML = '<span></span><span></span><span></span>';
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
        
        // Show welcome message again
        this.addMessage({
            role: 'assistant',
            content: 'Chat cleared. How can I help you?',
            timestamp: new Date()
        });
    }
    
    /**
     * Set initial message in the input field
     * Used when opening chat with context
     */
    setInitialMessage(message: string) {
        if (this.inputEl && message) {
            this.inputEl.value = message;
            this.inputEl.focus();
        }
    }
    
}
