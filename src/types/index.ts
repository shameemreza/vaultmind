// VaultMind Type Definitions

import { App, TFile, TFolder } from 'obsidian';

// ============= Task Types =============
export interface VaultMindTask {
    id: string;
    content: string;
    file: TFile | null; // Will be null in storage, populated at runtime
    filePath: string; // Store path to avoid circular references
    line: number;
    completed: boolean;
    dueDate?: Date;
    priority?: 'high' | 'medium' | 'low';
    tags: string[];
    goalId?: string;
    createdAt: Date;
    completedAt?: Date;
    estimatedTime?: number; // in minutes
    actualTime?: number;
}

export interface TaskStatistics {
    total: number;
    completed: number;
    overdue: number;
    dueToday: number;
    upcoming: number;
    completionRate: number;
    averageCompletionTime: number;
}

// ============= Goal Types =============
export interface VaultMindGoal {
    id: string;
    title: string;
    description?: string;
    file: TFile | null; // Will be null in storage, populated at runtime
    filePath: string; // Store path to avoid circular references
    targetDate?: Date;
    progress: number; // 0-100
    status: 'active' | 'completed' | 'paused' | 'cancelled';
    milestones: Milestone[];
    linkedTasks: string[]; // Task IDs
    createdAt: Date;
    updatedAt: Date;
    completedAt?: Date;
    category?: string;
}

export interface Milestone {
    id: string;
    title: string;
    completed: boolean;
    completedAt?: Date;
    targetDate?: Date;
}

// ============= Time Tracking Types =============
export interface TimeEntry {
    id: string;
    taskId?: string;
    goalId?: string;
    startTime: Date;
    endTime?: Date;
    duration?: number; // in minutes
    description?: string;
    tags: string[];
    file?: TFile;
}

export interface TimeStatistics {
    todayTotal: number;
    weekTotal: number;
    monthTotal: number;
    averageDaily: number;
    mostProductiveHours: number[];
    taskTimeDistribution: Record<string, number>;
}

// ============= Vault Index Types =============
export interface IndexedNote {
    file: TFile | null;
    filePath?: string; // Store path to avoid circular references
    title: string;
    content: string;
    frontmatter: Record<string, any>;
    tasks: Set<string> | VaultMindTask[];
    tags: string[];
    links: Set<string> | string[];
    backlinks?: Set<string> | string[];
    lastModified: Date;
    wordCount: number;
    embeddings?: Float32Array;
    embeddingVector?: Float32Array | null;
}

export interface VaultIndex {
    notes: Map<string, IndexedNote>;
    tasks: Map<string, VaultMindTask>;
    goals: Map<string, VaultMindGoal>;
    lastIndexed: Date;
    version: number;
}

// ============= AI Types =============
export interface AIProvider {
    name: string;
    type: 'local' | 'cloud' | 'external';
    initialize(): Promise<void>;
    generateSummary(content: string, options?: SummaryOptions): Promise<string>;
    answerQuestion(question: string, context: string): Promise<string>;
    generateSuggestions(context: AIContext): Promise<string[]>;
    cleanup(): Promise<void>;
}

export interface SummaryOptions {
    maxLength?: number;
    style?: 'brief' | 'detailed' | 'bullet-points';
    focus?: string[];
}

export interface AIContext {
    recentNotes?: IndexedNote[];
    tasks?: VaultMindTask[];
    goals?: VaultMindGoal[];
    timeEntries?: TimeEntry[];
    userQuery?: string;
}

export interface WebSearchResult {
    title: string;
    snippet: string;
    url: string;
    source: string;
    timestamp: Date;
}

// ============= Settings Types =============
export interface VaultMindSettings {
    // General
    enableAutoIndex: boolean;
    indexInterval: number; // minutes
    enableNotifications: boolean;
    
    // Task Settings
    taskSyntax: 'obsidian' | 'tasks-plugin' | 'both';
    defaultTaskPriority: 'high' | 'medium' | 'low';
    enableTaskReminders: boolean;
    reminderAdvanceTime: number; // minutes before due
    
    // Goal Settings
    goalReviewFrequency: 'daily' | 'weekly' | 'monthly';
    enableGoalSuggestions: boolean;
    
    // Time Tracking
    enableTimeTracking: boolean;
    autoStartTimer: boolean;
    pomodoroLength: number; // minutes
    breakLength: number; // minutes
    
    // AI Settings
    aiProvider: 'ollama' | 'openai' | 'anthropic' | 'gemini' | 'deepseek' | 'grok' | 'none';
    localModelName: string;
    embeddingModel?: string;
    localModelPath?: string;
    
    // API Keys and Endpoints
    apiKey?: string; // For web search APIs
    apiEndpoint?: string;
    openAIApiKey?: string;
    openAIModel?: string;
    claudeApiKey?: string;
    claudeModel?: string;
    ollamaEndpoint?: string;
    ollamaModel?: string;
    
    // Gemini Settings
    geminiApiKey?: string;
    geminiModel?: string;
    
    // DeepSeek Settings
    deepseekApiKey?: string;
    deepseekModel?: string;
    
    // Grok Settings
    grokApiKey?: string;
    grokModel?: string;
    
    maxTokens: number;
    temperature: number;
    enableWebSearch: boolean;
    webSearchProvider: 'duckduckgo' | 'brave' | 'custom';
    customSearchEndpoint?: string;
    
    // Reports
    enableDailyReport: boolean;
    dailyReportTime: string; // HH:MM
    enableWeeklyReview: boolean;
    weeklyReviewDay: number; // 0-6 (Sunday-Saturday)
    reportTemplate?: string;
    
    // Privacy
    enableCloudFeatures: boolean;
    sendAnonymousUsage: boolean;
    dataRetentionDays: number;
    encryptLocalCache: boolean;
    
    // UI
    showStatusBar: boolean;
    showRibbonIcon: boolean;
    dashboardPosition: 'left' | 'right';
    theme: 'auto' | 'light' | 'dark';
    
    // Dashboard Display Settings
    showTagsInDashboard: boolean;
    showTimeTrackingInDashboard: boolean;
    showQuickStatsInDashboard: boolean;
    showGoalsInDashboard: boolean;
    maxTasksPerSection: number;
}

export const DEFAULT_SETTINGS: VaultMindSettings = {
    // General
    enableAutoIndex: true,
    indexInterval: 30,
    enableNotifications: true,
    
    // Tasks
    taskSyntax: 'both',
    defaultTaskPriority: 'medium',
    enableTaskReminders: true,
    reminderAdvanceTime: 15,
    
    // Goals
    goalReviewFrequency: 'weekly',
    enableGoalSuggestions: true,
    
    // Time Tracking
    enableTimeTracking: false,
    autoStartTimer: false,
    pomodoroLength: 25,
    breakLength: 5,
    
    // AI
    aiProvider: 'none',
    localModelName: 'flan-t5-small', // Changed from phi-3-mini which isn't supported
    embeddingModel: 'all-minilm-l6',
    
    // API Configuration
    openAIApiKey: '',
    openAIModel: 'gpt-3.5-turbo',
    claudeApiKey: '',
    claudeModel: 'claude-3-haiku-20240307',
    ollamaEndpoint: 'http://localhost:11434',
    ollamaModel: 'llama2',
    
    maxTokens: 500,
    temperature: 0.7,
    enableWebSearch: false,
    webSearchProvider: 'duckduckgo',
    
    // Reports
    enableDailyReport: false,
    dailyReportTime: '09:00',
    enableWeeklyReview: false,
    weeklyReviewDay: 1, // Monday
    
    // Privacy
    enableCloudFeatures: false,
    sendAnonymousUsage: false,
    dataRetentionDays: 30,
    encryptLocalCache: false,
    
    // UI
    showStatusBar: true,
    showRibbonIcon: true,
    dashboardPosition: 'right',
    theme: 'auto',
    
    // Dashboard Display Settings
    showTagsInDashboard: true,
    showTimeTrackingInDashboard: true,
    showQuickStatsInDashboard: true,
    showGoalsInDashboard: true,
    maxTasksPerSection: 10
};

// ============= Notification Types =============
export interface VaultMindNotification {
    id: string;
    type: 'info' | 'warning' | 'error' | 'success' | 'reminder';
    title: string;
    message: string;
    timestamp: Date;
    read: boolean;
    actionable?: boolean;
    action?: () => void;
    actionLabel?: string;
    persistent: boolean;
    priority?: 'low' | 'medium' | 'high';
    source?: 'task' | 'goal' | 'time' | 'ai' | 'system';
}

// ============= Report Types =============
export interface DailyReport {
    date: Date;
    tasksCompleted: number;
    tasksCreated: number;
    goalProgress: Record<string, number>;
    timeTracked: number;
    topTags: string[];
    summary: string;
    highlights: string[];
    suggestions: string[];
}

export interface WeeklyReview {
    weekStart: Date;
    weekEnd: Date;
    statistics: {
        tasksCompleted: number;
        tasksCreated: number;
        goalsAchieved: number;
        totalTimeTracked: number;
        averageDailyTime: number;
        productivityScore: number;
    };
    trends: {
        taskCompletion: 'improving' | 'stable' | 'declining';
        timeManagement: 'improving' | 'stable' | 'declining';
        goalProgress: 'on-track' | 'behind' | 'ahead';
    };
    achievements: string[];
    challenges: string[];
    recommendations: string[];
}

// ============= Event Types =============
export interface VaultMindEvent {
    type: 'task-created' | 'task-completed' | 'goal-updated' | 
          'time-started' | 'time-stopped' | 'index-updated' |
          'report-generated' | 'ai-response';
    data: VaultMindTask | VaultMindGoal | TimeEntry | VaultIndex | string | Record<string, unknown>;
    timestamp: Date;
}

// ============= Service Interfaces =============
export interface IVaultIndexer {
    initialize(app: App): Promise<void>;
    indexVault(): Promise<VaultIndex>;
    indexFile(file: TFile): Promise<IndexedNote>;
    updateIndex(file: TFile): Promise<void>;
    removeFromIndex(path: string): Promise<void>;
    search(query: string): Promise<IndexedNote[]>;
    getIndex(): VaultIndex;
}

export interface ITaskEngine {
    initialize(app: App): Promise<void>;
    scanTasks(): Promise<VaultMindTask[]>;
    getTask(id: string): VaultMindTask | undefined;
    getTasks(filter?: TaskFilter): VaultMindTask[];
    updateTask(id: string, updates: Partial<VaultMindTask>): Promise<void>;
    getStatistics(): TaskStatistics;
}

export interface TaskFilter {
    completed?: boolean;
    dueDate?: { before?: Date; after?: Date };
    priority?: 'high' | 'medium' | 'low';
    tags?: string[];
    goalId?: string;
}

export interface IGoalEngine {
    initialize(app: App): Promise<void>;
    scanGoals(): Promise<VaultMindGoal[]>;
    getGoal(id: string): VaultMindGoal | undefined;
    updateGoal(id: string, updates: Partial<VaultMindGoal>): Promise<void>;
    calculateProgress(goalId: string): number;
    linkTask(goalId: string, taskId: string): Promise<void>;
}

export interface ITimeTracker {
    initialize(app: App): Promise<void>;
    startTracking(description?: string, taskId?: string, goalId?: string): Promise<void>;
    stopTracking(): Promise<TimeEntry>;
    pauseTracking(): Promise<void>;
    resumeTracking(): Promise<void>;
    getActiveEntry(): TimeEntry | null;
    getEntries(filter?: TimeFilter): TimeEntry[];
    getStatistics(): TimeStatistics;
}

export interface TimeFilter {
    startDate?: Date;
    endDate?: Date;
    taskId?: string;
    goalId?: string;
    tags?: string[];
}

export interface INotificationService {
    initialize(app: App): Promise<void>;
    notify(notification: Omit<VaultMindNotification, 'id' | 'timestamp' | 'read'>): void;
    getNotifications(unreadOnly?: boolean): VaultMindNotification[];
    markAsRead(id: string): void;
    clearNotifications(): void;
    scheduleReminder(taskId: string, time: Date): void;
}

// ============= Storage Types =============
export interface StorageAdapter {
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T): Promise<void>;
    delete(key: string): Promise<void>;
    clear(): Promise<void>;
    getAll<T>(): Promise<Map<string, T>>;
}

// ============= Dashboard Types =============
export interface DashboardData {
    tasks: {
        today: VaultMindTask[];
        overdue: VaultMindTask[];
        upcoming: VaultMindTask[];
        pending?: VaultMindTask[];  // All pending tasks
        projects?: string[];  // All project tags
    };
    goals: {
        active: VaultMindGoal[];
        recentProgress: Record<string, number>;
    };
    time: {
        todayTotal: number;
        currentSession?: TimeEntry;
        recentEntries: TimeEntry[];
    };
    notifications: VaultMindNotification[];
    quickStats: {
        tasksCompletedToday: number;
        goalsOnTrack: number;
        currentStreak: number;
        productivityScore: number;
    };
}

// ============= Utility Types =============
export type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type AsyncFunction<T = void> = () => Promise<T>;
export type EventHandler<T = any> = (data: T) => void;

// ============= Error Types =============
export class VaultMindError extends Error {
    constructor(
        message: string,
        public code: string,
        public details?: Record<string, unknown>
    ) {
        super(message);
        this.name = 'VaultMindError';
    }
}

export const ErrorCodes = {
    INDEXING_FAILED: 'INDEXING_FAILED',
    AI_INIT_FAILED: 'AI_INIT_FAILED',
    STORAGE_ERROR: 'STORAGE_ERROR',
    TASK_NOT_FOUND: 'TASK_NOT_FOUND',
    GOAL_NOT_FOUND: 'GOAL_NOT_FOUND',
    INVALID_SETTINGS: 'INVALID_SETTINGS',
    MODEL_LOAD_FAILED: 'MODEL_LOAD_FAILED',
    WEB_SEARCH_FAILED: 'WEB_SEARCH_FAILED',
    PERMISSION_DENIED: 'PERMISSION_DENIED'
} as const;
