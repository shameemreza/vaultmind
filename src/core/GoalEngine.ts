import { App } from 'obsidian';
import { VaultMindGoal, IGoalEngine } from '../types';
import { VaultIndexer } from './VaultIndexer';
import { TaskEngine } from './TaskEngine';

export class GoalEngine implements IGoalEngine {
    private app: App | null = null;
    private vaultIndexer: VaultIndexer;
    private taskEngine: TaskEngine;
    private goals: Map<string, VaultMindGoal> = new Map();
    
    constructor(vaultIndexer: VaultIndexer, taskEngine: TaskEngine) {
        this.vaultIndexer = vaultIndexer;
        this.taskEngine = taskEngine;
    }

    async initialize(app: App): Promise<void> {
        this.app = app;
        await this.scanGoals();
    }

    scanGoals(): Promise<VaultMindGoal[]> {
        const index = this.vaultIndexer.getIndex();
        this.goals.clear();
        
        // Get all goals from the index, filtering out stale goals
        for (const goal of index.goals.values()) {
            // Only add goals whose source file still exists
            if (goal.filePath && this.app) {
                const file = this.app.vault.getAbstractFileByPath(goal.filePath);
                if (file) {
                    this.goals.set(goal.id, goal);
                } else {
                    console.debug(`VaultMind: Removing stale goal "${goal.title}" - source file not found: ${goal.filePath}`);
                }
            } else if (!goal.filePath) {
                // Goals without file path are kept (might be programmatically created)
                this.goals.set(goal.id, goal);
            }
        }
        
        console.debug(`VaultMind: Found ${this.goals.size} valid goals`);
        return Promise.resolve(Array.from(this.goals.values()));
    }

    getGoal(id: string): VaultMindGoal | undefined {
        return this.goals.get(id);
    }

    getGoals(): VaultMindGoal[] {
        return Array.from(this.goals.values());
    }

    updateGoal(id: string, updates: Partial<VaultMindGoal>): Promise<void> {
        const goal = this.goals.get(id);
        if (!goal) {
            return Promise.reject(new Error(`Goal ${id} not found`));
        }
        
        Object.assign(goal, updates);
        goal.updatedAt = new Date();
        this.goals.set(id, goal);
        return Promise.resolve();
    }

    calculateProgress(goalId: string): number {
        const goal = this.goals.get(goalId);
        if (!goal) return 0;
        
        // Calculate based on milestones
        if (goal.milestones.length > 0) {
            const completed = goal.milestones.filter(m => m.completed).length;
            return (completed / goal.milestones.length) * 100;
        }
        
        // Calculate based on linked tasks
        if (goal.linkedTasks.length > 0) {
            const tasks = goal.linkedTasks
                .map(taskId => this.taskEngine.getTask(taskId))
                .filter((task): task is NonNullable<typeof task> => task !== undefined);
            
            const completed = tasks.filter(t => t.completed).length;
            return tasks.length > 0 ? (completed / tasks.length) * 100 : 0;
        }
        
        return goal.progress;
    }

    async linkTask(goalId: string, taskId: string): Promise<void> {
        const goal = this.goals.get(goalId);
        if (!goal) {
            throw new Error(`Goal ${goalId} not found`);
        }
        
        if (!goal.linkedTasks.includes(taskId)) {
            goal.linkedTasks.push(taskId);
            goal.progress = this.calculateProgress(goalId);
            await this.updateGoal(goalId, { linkedTasks: goal.linkedTasks, progress: goal.progress });
        }
    }
}
