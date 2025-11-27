import { App, TFile } from 'obsidian';
import { 
    VaultMindTask, 
    ITaskEngine, 
    TaskFilter, 
    TaskStatistics,
    VaultIndex
} from '../types';
import { VaultIndexer } from './VaultIndexer';
import { generateTaskId } from '../utils/helpers';

export class TaskEngine implements ITaskEngine {
    private app: App | null = null;
    private vaultIndexer: VaultIndexer;
    private tasks: Map<string, VaultMindTask> = new Map();
    
    constructor(vaultIndexer: VaultIndexer) {
        this.vaultIndexer = vaultIndexer;
    }

    async initialize(app: App): Promise<void> {
        this.app = app;
        await this.scanTasks();
    }

    async scanTasks(): Promise<VaultMindTask[]> {
        const index = this.vaultIndexer.getIndex();
        this.tasks.clear();
        
        // Get all tasks from the index
        for (const task of index.tasks.values()) {
            this.tasks.set(task.id, task);
        }
        
        console.debug(`VaultMind: Found ${this.tasks.size} tasks`);
        return Array.from(this.tasks.values());
    }

    getTask(id: string): VaultMindTask | undefined {
        return this.tasks.get(id);
    }

    getTasks(filter?: TaskFilter): VaultMindTask[] {
        let tasks = Array.from(this.tasks.values());
        
        if (filter) {
            if (filter.completed !== undefined) {
                tasks = tasks.filter(t => t.completed === filter.completed);
            }
            
            if (filter.priority) {
                tasks = tasks.filter(t => t.priority === filter.priority);
            }
            
            if (filter.tags && filter.tags.length > 0) {
                tasks = tasks.filter(t => 
                    filter.tags!.some(tag => t.tags.includes(tag))
                );
            }
            
            if (filter.goalId) {
                tasks = tasks.filter(t => t.goalId === filter.goalId);
            }
            
            if (filter.dueDate) {
                tasks = tasks.filter(t => {
                    if (!t.dueDate) return false;
                    const dueDate = new Date(t.dueDate);
                    
                    if (filter.dueDate!.before && dueDate > filter.dueDate!.before) {
                        return false;
                    }
                    if (filter.dueDate!.after && dueDate < filter.dueDate!.after) {
                        return false;
                    }
                    
                    return true;
                });
            }
        }
        
        return tasks;
    }

    async updateTask(id: string, updates: Partial<VaultMindTask>): Promise<void> {
        const task = this.tasks.get(id);
        if (!task) {
            throw new Error(`Task ${id} not found`);
        }
        
        // Update task in memory
        Object.assign(task, updates);
        this.tasks.set(id, task);
        
        // TODO: Update task in the actual file
        // This would require modifying the markdown file
    }

    getStatistics(): TaskStatistics {
        const tasks = Array.from(this.tasks.values());
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const completed = tasks.filter(t => t.completed);
        const overdue = tasks.filter(t => 
            !t.completed && t.dueDate && new Date(t.dueDate) < today
        );
        const dueToday = tasks.filter(t => 
            !t.completed && t.dueDate && 
            new Date(t.dueDate) >= today && 
            new Date(t.dueDate) < tomorrow
        );
        const upcoming = tasks.filter(t => 
            !t.completed && t.dueDate && new Date(t.dueDate) >= tomorrow
        );
        
        const completionTimes = completed
            .filter(t => t.completedAt && t.createdAt)
            .map(t => new Date(t.completedAt!).getTime() - new Date(t.createdAt).getTime());
        
        const averageCompletionTime = completionTimes.length > 0
            ? completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length / (1000 * 60)
            : 0;
        
        return {
            total: tasks.length,
            completed: completed.length,
            overdue: overdue.length,
            dueToday: dueToday.length,
            upcoming: upcoming.length,
            completionRate: tasks.length > 0 ? (completed.length / tasks.length) * 100 : 0,
            averageCompletionTime
        };
    }
}
