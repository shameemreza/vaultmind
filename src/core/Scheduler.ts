import VaultMindPlugin from '../main';
import { parseTime } from '../utils/helpers';

export class Scheduler {
    private plugin: VaultMindPlugin;
    private intervals: Map<string, NodeJS.Timeout> = new Map();
    private running = false;
    
    constructor(plugin: VaultMindPlugin) {
        this.plugin = plugin;
    }

    start(): void {
        if (this.running) return;
        this.running = true;
        
        console.log('VaultMind: Scheduler started');
        
        // Schedule vault indexing
        if (this.plugin.settings.enableAutoIndex) {
            const indexInterval = this.plugin.settings.indexInterval * 60 * 1000;
            const indexTimer = setInterval(async () => {
                await this.plugin.vaultIndexer.indexVault();
            }, indexInterval);
            this.intervals.set('index', indexTimer);
        }
        
        // Schedule daily report
        if (this.plugin.settings.enableDailyReport) {
            this.scheduleDailyReport();
        }
        
        // Schedule weekly review
        if (this.plugin.settings.enableWeeklyReview) {
            this.scheduleWeeklyReview();
        }
        
        // Schedule task reminders check (every 5 minutes)
        if (this.plugin.settings.enableTaskReminders) {
            const reminderTimer = setInterval(() => {
                this.checkTaskReminders();
            }, 5 * 60 * 1000);
            this.intervals.set('reminders', reminderTimer);
        }
    }

    stop(): void {
        this.running = false;
        
        // Clear all intervals
        for (const [key, timer] of this.intervals.entries()) {
            clearInterval(timer);
        }
        this.intervals.clear();
        
        console.log('VaultMind: Scheduler stopped');
    }

    private scheduleDailyReport(): void {
        const time = parseTime(this.plugin.settings.dailyReportTime);
        if (!time) return;
        
        const checkDaily = () => {
            const now = new Date();
            if (now.getHours() === time.hours && now.getMinutes() === time.minutes) {
                this.generateDailyReport();
            }
        };
        
        // Check every minute
        const dailyTimer = setInterval(checkDaily, 60 * 1000);
        this.intervals.set('daily-report', dailyTimer);
    }

    private scheduleWeeklyReview(): void {
        const checkWeekly = () => {
            const now = new Date();
            if (now.getDay() === this.plugin.settings.weeklyReviewDay && now.getHours() === 9) {
                this.generateWeeklyReview();
            }
        };
        
        // Check every hour
        const weeklyTimer = setInterval(checkWeekly, 60 * 60 * 1000);
        this.intervals.set('weekly-review', weeklyTimer);
    }

    private async generateDailyReport(): Promise<void> {
        console.log('VaultMind: Generating daily report...');
        
        const summary = await this.plugin.generateDailySummary();
        if (summary) {
            // Create or update daily note
            const fileName = `Daily Report - ${new Date().toISOString().split('T')[0]}.md`;
            const existingFile = this.plugin.app.vault.getAbstractFileByPath(fileName);
            
            if (existingFile) {
                await this.plugin.app.vault.modify(existingFile as any, summary);
            } else {
                await this.plugin.app.vault.create(fileName, summary);
            }
            
            // Send notification
            this.plugin.notificationService.notify({
                type: 'info',
                title: 'Daily Report Ready',
                message: 'Your daily report has been generated.',
                persistent: false,
                source: 'system'
            });
        }
    }

    private async generateWeeklyReview(): Promise<void> {
        console.log('VaultMind: Generating weekly review...');
        
        // This would generate a comprehensive weekly review
        // For now, we'll use a simple implementation
        const stats = this.plugin.taskEngine.getStatistics();
        const timeStats = this.plugin.timeTracker.getStatistics();
        
        const review = `# Weekly Review - ${new Date().toLocaleDateString()}

## Task Statistics
- Total Tasks: ${stats.total}
- Completed: ${stats.completed}
- Completion Rate: ${stats.completionRate.toFixed(1)}%
- Overdue: ${stats.overdue}

## Time Statistics
- Week Total: ${timeStats.weekTotal} minutes
- Average Daily: ${timeStats.averageDaily.toFixed(0)} minutes

## Recommendations
- Focus on overdue tasks
- Maintain consistency
- Review and update goals
`;
        
        const fileName = `Weekly Review - ${new Date().toISOString().split('T')[0]}.md`;
        await this.plugin.app.vault.create(fileName, review);
        
        this.plugin.notificationService.notify({
            type: 'info',
            title: 'Weekly Review Ready',
            message: 'Your weekly review has been generated.',
            persistent: true,
            source: 'system'
        });
    }

    private checkTaskReminders(): void {
        const tasks = this.plugin.taskEngine.getTasks({ completed: false });
        const now = new Date();
        const reminderTime = this.plugin.settings.reminderAdvanceTime * 60 * 1000;
        
        for (const task of tasks) {
            if (task.dueDate) {
                const timeToDue = new Date(task.dueDate).getTime() - now.getTime();
                
                if (timeToDue > 0 && timeToDue <= reminderTime) {
                    this.plugin.notificationService.notify({
                        type: 'reminder',
                        title: 'Task Due Soon',
                        message: `"${task.content}" is due in ${Math.floor(timeToDue / 60000)} minutes`,
                        persistent: true,
                        source: 'task'
                    });
                }
            }
        }
    }
}
