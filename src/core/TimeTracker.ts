import { App } from 'obsidian';
import { TimeEntry, ITimeTracker, TimeFilter, TimeStatistics } from '../types';
import { generateId } from '../utils/helpers';
import { StorageService } from '../services/StorageService';

export class TimeTracker implements ITimeTracker {
    private app: App | null = null;
    private storage: StorageService;
    private entries: Map<string, TimeEntry> = new Map();
    private activeEntry: TimeEntry | null = null;
    
    constructor() {
        this.storage = new StorageService();
    }

    async initialize(app: App): Promise<void> {
        this.app = app;
        await this.storage.initialize();
        await this.loadEntries();
    }

    async startTracking(description?: string, taskId?: string, goalId?: string): Promise<void> {
        if (this.activeEntry) {
            await this.stopTracking();
        }
        
        this.activeEntry = {
            id: generateId('time'),
            taskId,
            goalId,
            startTime: new Date(),
            tags: [],
            description: description || 'Work Session'
        };
        
        await this.saveEntries();
    }

    async stopTracking(): Promise<TimeEntry> {
        if (!this.activeEntry) {
            throw new Error('No active time tracking');
        }
        
        this.activeEntry.endTime = new Date();
        this.activeEntry.duration = Math.floor(
            (this.activeEntry.endTime.getTime() - this.activeEntry.startTime.getTime()) / (1000 * 60)
        );
        
        this.entries.set(this.activeEntry.id, this.activeEntry);
        const entry = this.activeEntry;
        this.activeEntry = null;
        
        await this.saveEntries();
        return entry;
    }

    async pauseTracking(): Promise<void> {
        // Implementation for pausing
        if (this.activeEntry) {
            // Store pause time
            await this.saveEntries();
        }
    }

    async resumeTracking(): Promise<void> {
        // Implementation for resuming
        if (this.activeEntry) {
            // Calculate and add pause duration
            await this.saveEntries();
        }
    }

    getActiveEntry(): TimeEntry | null {
        return this.activeEntry;
    }

    getEntries(filter?: TimeFilter): TimeEntry[] {
        let entries = Array.from(this.entries.values());
        
        if (filter) {
            if (filter.startDate) {
                entries = entries.filter(e => e.startTime >= filter.startDate!);
            }
            
            if (filter.endDate) {
                entries = entries.filter(e => e.startTime <= filter.endDate!);
            }
            
            if (filter.taskId) {
                entries = entries.filter(e => e.taskId === filter.taskId);
            }
            
            if (filter.goalId) {
                entries = entries.filter(e => e.goalId === filter.goalId);
            }
            
            if (filter.tags && filter.tags.length > 0) {
                entries = entries.filter(e => 
                    filter.tags!.some(tag => e.tags.includes(tag))
                );
            }
        }
        
        return entries;
    }

    getTodayEntries(): TimeEntry[] {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        return this.getEntries({
            startDate: today,
            endDate: tomorrow
        });
    }

    getStatistics(): TimeStatistics {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekStart = new Date(today);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        
        const todayEntries = this.getEntries({
            startDate: today,
            endDate: new Date(today.getTime() + 24 * 60 * 60 * 1000)
        });
        
        const weekEntries = this.getEntries({
            startDate: weekStart,
            endDate: now
        });
        
        const monthEntries = this.getEntries({
            startDate: monthStart,
            endDate: now
        });
        
        const todayTotal = todayEntries.reduce((sum, e) => sum + (e.duration || 0), 0);
        const weekTotal = weekEntries.reduce((sum, e) => sum + (e.duration || 0), 0);
        const monthTotal = monthEntries.reduce((sum, e) => sum + (e.duration || 0), 0);
        
        // Calculate most productive hours
        const hourCounts = new Array(24).fill(0);
        for (const entry of this.entries.values()) {
            const hour = entry.startTime.getHours();
            hourCounts[hour] += entry.duration || 0;
        }
        
        const mostProductiveHours = hourCounts
            .map((count, hour) => ({ hour, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 3)
            .map(item => item.hour);
        
        // Calculate task time distribution
        const taskTimeDistribution: Record<string, number> = {};
        for (const entry of this.entries.values()) {
            if (entry.taskId) {
                taskTimeDistribution[entry.taskId] = 
                    (taskTimeDistribution[entry.taskId] || 0) + (entry.duration || 0);
            }
        }
        
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const averageDaily = monthTotal / daysInMonth;
        
        return {
            todayTotal,
            weekTotal,
            monthTotal,
            averageDaily,
            mostProductiveHours,
            taskTimeDistribution
        };
    }

    private async loadEntries(): Promise<void> {
        const stored = await this.storage.get<Array<[string, TimeEntry]>>('time-entries');
        if (stored) {
            this.entries = new Map(stored.map(([id, entry]) => [
                id,
                {
                    ...entry,
                    startTime: new Date(entry.startTime),
                    endTime: entry.endTime ? new Date(entry.endTime) : undefined
                }
            ]));
        }
        
        const activeId = await this.storage.get<string>('active-time-entry');
        if (activeId) {
            this.activeEntry = this.entries.get(activeId) || null;
        }
    }

    private async saveEntries(): Promise<void> {
        const entriesArray = Array.from(this.entries.entries());
        await this.storage.set('time-entries', entriesArray);
        
        if (this.activeEntry) {
            await this.storage.set('active-time-entry', this.activeEntry.id);
        } else {
            await this.storage.delete('active-time-entry');
        }
    }
}
