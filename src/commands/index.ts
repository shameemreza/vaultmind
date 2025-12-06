import { Notice, TFile } from 'obsidian';
import VaultMindPlugin from '../main';

export function registerCommands(plugin: VaultMindPlugin): void {
    // Dashboard command
    plugin.addCommand({
        id: 'open-dashboard',
        name: 'Open dashboard',
        callback: async () => {
            await plugin.openDashboard();
        }
    });
    
    // Chat command
    plugin.addCommand({
        id: 'open-chat',
        name: 'Open AI chat',
        callback: async () => {
            await plugin.openChat();
        }
    });

    // Index vault command
    plugin.addCommand({
        id: 'index-vault',
        name: 'Index vault',
        callback: async () => {
            await plugin.indexVault();
        }
    });

    // Generate daily summary command
    plugin.addCommand({
        id: 'generate-daily-summary',
        name: 'Generate daily summary',
        callback: async () => {
            const summary = plugin.generateDailySummary();
            if (summary) {
                // Create a new note with the summary
                const fileName = `Daily Summary - ${new Date().toISOString().split('T')[0]}.md`;
                const file = await plugin.app.vault.create(fileName, summary);
                await plugin.app.workspace.getLeaf().openFile(file);
                new Notice('Daily summary generated!');
            }
        }
    });

    // Start/Stop time tracking
    plugin.addCommand({
        id: 'toggle-time-tracking',
        name: 'Toggle time tracking',
        callback: async () => {
            const activeEntry = plugin.timeTracker.getActiveEntry();
            if (activeEntry) {
                await plugin.timeTracker.stopTracking();
                new Notice('Time tracking stopped');
            } else {
                await plugin.timeTracker.startTracking('Quick Session');
                new Notice('Time tracking started');
            }
        }
    });

    // Quick task creation
    plugin.addCommand({
        id: 'quick-task',
        name: 'Create quick task',
        editorCallback: (editor) => {
            const selection = editor.getSelection();
            const task = `- [ ] ${selection || 'New task'}`;
            editor.replaceSelection(task);
        }
    });

    // Ask AI a question
    plugin.addCommand({
        id: 'ask-ai',
        name: 'Ask AI',
        callback: () => {
            // This will be implemented with a modal
            new Notice('Ask AI feature coming soon!');
        }
    });

    // Scan tasks command
    plugin.addCommand({
        id: 'scan-tasks',
        name: 'Scan all tasks',
        callback: async () => {
            const tasks = await plugin.taskEngine.scanTasks();
            new Notice(`Found ${tasks.length} tasks in your vault`);
        }
    });

    // Show notifications
    plugin.addCommand({
        id: 'show-notifications',
        name: 'Show notifications',
        callback: () => {
            const notifications = plugin.notificationService.getNotifications(true);
            if (notifications.length === 0) {
                new Notice('No new notifications');
            } else {
                new Notice(`You have ${notifications.length} unread notifications`);
            }
        }
    });

    // Clear cache command (for debugging)
    plugin.addCommand({
        id: 'clear-cache',
        name: 'Clear cache',
        callback: async () => {
            const storage = plugin.vaultIndexer.storage;
            await storage.clearCache();
            new Notice('Cache cleared');
        }
    });

    // Reload AI model
    plugin.addCommand({
        id: 'reload-ai',
        name: 'Reload AI model',
        callback: async () => {
            if (plugin.ai) {
                new Notice('Reloading AI model...');
                await plugin.ai.cleanup();
                await plugin.ai.initialize();
                new Notice('AI model reloaded');
            } else {
                new Notice('AI is not enabled');
            }
        }
    });
    
    // Model download commands removed - using cloud providers only
    
    // Test Ollama connection
    plugin.addCommand({
        id: 'test-ollama',
        name: 'Test Ollama connection',
        callback: async () => {
            if (plugin.settings.aiProvider !== 'ollama') {
                new Notice('Please set AI provider to Ollama in settings first');
                return;
            }
            
            try {
                new Notice('Testing Ollama…');
                
                // Test with a simple prompt
                const testPrompt = 'Say "Hello from Ollama" if you can see this message.';
                const response = await plugin.aiProvider?.answerQuestion(testPrompt, '');
                
                if (response) {
                    new Notice(`Ollama responded: ${response.substring(0, 100)}`);
                    console.debug('VaultMind: Ollama test response:', response);
                } else {
                    new Notice('No response from Ollama');
                }
            } catch (error) {
                console.error('VaultMind: Ollama test failed:', error);
                new Notice(`Ollama test failed: ${(error as Error).message}`);
            }
        }
    });
    
    // Test notification commands
    plugin.addCommand({
        id: 'test-notification',
        name: 'Test notification',
        callback: () => {
            plugin.notificationService.notify({
                type: 'info',
                title: 'Test Notification',
                message: 'This is a test notification with sound if notification.mp3 is configured.',
                priority: 'high',
                persistent: false,
                source: 'system'
            });
            new Notice('Test notification sent! Check if sound played.');
        }
    });
    
    plugin.addCommand({
        id: 'test-warning',
        name: 'Test warning notification',
        callback: () => {
            plugin.notificationService.notify({
                type: 'warning',
                title: 'Warning Test',
                message: 'This is a warning notification. High priority notifications play sound.',
                priority: 'high',
                persistent: true,
                source: 'system'
            });
        }
    });
    
    plugin.addCommand({
        id: 'test-reminder',
        name: 'Test task reminder',
        callback: () => {
            plugin.notificationService.notify({
                type: 'reminder',
                title: 'Task Reminder',
                message: 'Example: "Review meeting notes" is due in 15 minutes',
                priority: 'high',
                persistent: true,
                source: 'task',
                actionable: true,
                actionLabel: 'View Task',
                action: () => {
                    new Notice('Task action triggered (demo)');
                    void plugin.openDashboard();
                }
            });
        }
    });
    
    plugin.addCommand({
        id: 'test-success',
        name: 'Test success notification',
        callback: () => {
            plugin.notificationService.notify({
                type: 'success',
                title: 'Success!',
                message: 'Task completed successfully. This notification has medium priority.',
                priority: 'medium',
                persistent: false,
                source: 'system'
            });
        }
    });
    
    // Generate daily summary (alternative)
    plugin.addCommand({
        id: 'generate-daily-summary',
        name: 'Generate daily summary',
        callback: async () => {
            new Notice('Generating daily summary…');
            const summary = plugin.generateDailySummary();
            if (summary) {
                // Create a new note with the summary
                const fileName = `Daily Summary - ${new Date().toISOString().split('T')[0]}.md`;
                const existingFile = plugin.app.vault.getAbstractFileByPath(fileName);
                
                if (existingFile instanceof TFile) {
                    await plugin.app.vault.modify(existingFile, summary);
                } else {
                    await plugin.app.vault.create(fileName, summary);
                }
                
                new Notice('Daily summary generated!');
                // Open the file
                const file = plugin.app.vault.getAbstractFileByPath(fileName);
                if (file instanceof TFile) {
                    await plugin.app.workspace.getLeaf().openFile(file);
                }
            } else {
                new Notice('Failed to generate daily summary');
            }
        }
    });

    // Generate weekly review
    plugin.addCommand({
        id: 'generate-weekly-review',
        name: 'Generate weekly review',
        callback: async () => {
            new Notice('Generating weekly review...');
            
            const stats = plugin.taskEngine.getStatistics();
            const timeStats = plugin.timeTracker.getStatistics();
            
            const review = `# Weekly Review - ${new Date().toLocaleDateString()}

## Task Statistics
- Total Tasks: ${stats.total}
- Completed: ${stats.completed}
- Completion Rate: ${stats.completionRate.toFixed(1)}%
- Overdue: ${stats.overdue}

## Time Statistics  
- Week Total: ${timeStats.weekTotal} minutes
- Today: ${timeStats.todayTotal} minutes
- Average Daily: ${timeStats.averageDaily.toFixed(0)} minutes

## Recent Activity
${plugin.timeTracker.getEntries().slice(-5).map((e) => 
    `- ${e.description || 'Unnamed'}: ${e.duration || 0}min on ${new Date(e.startTime).toLocaleDateString()}`
).join('\n')}

## Recommendations
- Focus on ${stats.overdue} overdue tasks
- Maintain consistency in daily work
- Review and update goals regularly
`;
            
            const fileName = `Weekly Review - ${new Date().toISOString().split('T')[0]}.md`;
            await plugin.app.vault.create(fileName, review);
            
            new Notice('Weekly review generated!');
            // Open the file
            const file = plugin.app.vault.getAbstractFileByPath(fileName);
            if (file instanceof TFile) {
                await plugin.app.workspace.getLeaf().openFile(file);
            }
        }
    });
}
