import { TFile } from 'obsidian';
import { format, formatRelative, differenceInDays, isToday, isTomorrow, isThisWeek } from 'date-fns';

// ============= Debounce & Throttle =============

export function debounce<T extends (...args: Parameters<T>) => ReturnType<T>>(
    func: T,
    delay: number
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
    let timeoutId: NodeJS.Timeout | null = null;
    
    return (...args: Parameters<T>) => {
        return new Promise<ReturnType<T>>((resolve) => {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            
            timeoutId = setTimeout(() => {
                resolve(func(...args));
            }, delay);
        });
    };
}

export function throttle<T extends (...args: Parameters<T>) => ReturnType<T>>(
    func: T,
    limit: number
): (...args: Parameters<T>) => ReturnType<T> | undefined {
    let inThrottle = false;
    let lastResult: ReturnType<T>;
    
    return (...args: Parameters<T>) => {
        if (!inThrottle) {
            lastResult = func(...args);
            inThrottle = true;
            
            setTimeout(() => {
                inThrottle = false;
            }, limit);
            
            return lastResult;
        }
        return undefined;
    };
}

// ============= ID Generation =============

export function generateId(prefix?: string): string {
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substring(2, 9);
    return prefix ? `${prefix}_${timestamp}_${randomPart}` : `${timestamp}_${randomPart}`;
}

export function generateTaskId(file: TFile, line: number): string {
    const fileHash = hashString(file.path);
    return `task_${fileHash}_${line}`;
}

export function generateGoalId(title: string): string {
    const titleHash = hashString(title.toLowerCase());
    return `goal_${titleHash}_${Date.now().toString(36)}`;
}

// ============= String Utilities =============

export function hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
}

export function truncateText(text: string, maxLength: number, suffix = '...'): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - suffix.length) + suffix;
}

export function capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

export function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/--+/g, '-')
        .trim();
}

// ============= Date Utilities =============

export function formatDate(date: Date, formatString = 'yyyy-MM-dd'): string {
    return format(date, formatString);
}

export function formatTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    
    if (hours === 0) {
        return `${mins}m`;
    } else if (mins === 0) {
        return `${hours}h`;
    } else {
        return `${hours}h ${mins}m`;
    }
}

export function getRelativeTime(date: Date): string {
    return formatRelative(date, new Date());
}

export function getDueDateStatus(dueDate: Date): 'overdue' | 'today' | 'tomorrow' | 'this-week' | 'future' {
    const now = new Date();
    const daysDiff = differenceInDays(dueDate, now);
    
    if (daysDiff < 0) return 'overdue';
    if (isToday(dueDate)) return 'today';
    if (isTomorrow(dueDate)) return 'tomorrow';
    if (isThisWeek(dueDate)) return 'this-week';
    return 'future';
}

export function parseTime(timeStr: string): { hours: number; minutes: number } | null {
    const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        return null;
    }
    
    return { hours, minutes };
}

// ============= Array Utilities =============

export function chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
}

export function unique<T>(array: T[]): T[] {
    return [...new Set(array)];
}

export function groupBy<T, K extends string | number | symbol>(
    array: T[],
    keyFn: (item: T) => K
): Record<K, T[]> {
    return array.reduce((groups, item) => {
        const key = keyFn(item);
        if (!groups[key]) {
            groups[key] = [];
        }
        groups[key].push(item);
        return groups;
    }, {} as Record<K, T[]>);
}

export function sortBy<T>(array: T[], keyFn: (item: T) => number | string): T[] {
    return [...array].sort((a, b) => {
        const aKey = keyFn(a);
        const bKey = keyFn(b);
        
        if (typeof aKey === 'number' && typeof bKey === 'number') {
            return aKey - bKey;
        }
        
        return String(aKey).localeCompare(String(bKey));
    });
}

// ============= Object Utilities =============

export function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
    const result = { ...target };
    
    for (const key in source) {
        const sourceValue = source[key];
        if (sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue)) {
            result[key] = deepMerge(
                (result[key] || {}) as Record<string, unknown>,
                sourceValue as Record<string, unknown>
            ) as T[Extract<keyof T, string>];
        } else {
            result[key] = sourceValue as T[Extract<keyof T, string>];
        }
    }
    
    return result;
}

export function pick<T extends Record<string, unknown>, K extends keyof T>(
    obj: T,
    keys: K[]
): Pick<T, K> {
    const result = {} as Pick<T, K>;
    
    for (const key of keys) {
        if (key in obj) {
            result[key] = obj[key];
        }
    }
    
    return result;
}

export function omit<T extends Record<string, unknown>, K extends keyof T>(
    obj: T,
    keys: K[]
): Omit<T, K> {
    const result = { ...obj };
    
    for (const key of keys) {
        delete result[key];
    }
    
    return result as Omit<T, K>;
}

// ============= Validation =============

export function isValidUrl(url: string): boolean {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}

export function isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

export function isValidDate(dateStr: string): boolean {
    const date = new Date(dateStr);
    return !isNaN(date.getTime());
}

// ============= Performance =============

export function measureTime<T>(
    fn: () => T,
    label?: string
): T {
    const start = performance.now();
    const result = fn();
    const duration = performance.now() - start;
    
    console.debug(`${label || 'Operation'} took ${duration.toFixed(2)}ms`);
    
    return result;
}

export async function measureTimeAsync<T>(
    fn: () => Promise<T>,
    label?: string
): Promise<T> {
    const start = performance.now();
    const result = await fn();
    const duration = performance.now() - start;
    
    console.debug(`${label || 'Async operation'} took ${duration.toFixed(2)}ms`);
    
    return result;
}

// ============= File Utilities =============

export function getFileExtension(path: string): string {
    const lastDot = path.lastIndexOf('.');
    return lastDot === -1 ? '' : path.slice(lastDot + 1);
}

export function getFileName(path: string): string {
    const lastSlash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
    return lastSlash === -1 ? path : path.slice(lastSlash + 1);
}

export function getFileNameWithoutExtension(path: string): string {
    const fileName = getFileName(path);
    const lastDot = fileName.lastIndexOf('.');
    return lastDot === -1 ? fileName : fileName.slice(0, lastDot);
}

// ============= Error Handling =============

export function tryOrDefault<T>(fn: () => T, defaultValue: T): T {
    try {
        return fn();
    } catch {
        return defaultValue;
    }
}

export async function tryOrDefaultAsync<T>(
    fn: () => Promise<T>,
    defaultValue: T
): Promise<T> {
    try {
        return await fn();
    } catch {
        return defaultValue;
    }
}

export async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelayMs: number = 1000
): Promise<T> {
    let lastError: Error | undefined;
    
    for (let i = 0; i < maxRetries; i++) {
        try {
            const result = await fn();
            return result;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            
            if (i < maxRetries - 1) {
                const delay = baseDelayMs * Math.pow(2, i);
                console.debug(`Retry attempt ${i + 1} after ${delay}ms`);
                await sleep(delay);
            }
        }
    }
    
    throw lastError;
}

// ============= Async Utilities =============

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function waitUntil(
    condition: () => boolean,
    timeoutMs: number = 5000,
    checkIntervalMs: number = 100
): Promise<void> {
    const startTime = Date.now();
    
    while (!condition()) {
        if (Date.now() - startTime > timeoutMs) {
            throw new Error('Timeout waiting for condition');
        }
        await sleep(checkIntervalMs);
    }
}

// ============= Math Utilities =============

export function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

export function lerp(start: number, end: number, t: number): number {
    return start + (end - start) * clamp(t, 0, 1);
}

export function roundTo(value: number, decimals: number): number {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
}

export function percentage(value: number, total: number): number {
    if (total === 0) return 0;
    return roundTo((value / total) * 100, 2);
}

// ============= Color Utilities =============

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

export function rgbToHex(r: number, g: number, b: number): string {
    return '#' + [r, g, b]
        .map(x => x.toString(16).padStart(2, '0'))
        .join('');
}
