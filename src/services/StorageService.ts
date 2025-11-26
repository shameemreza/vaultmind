import { StorageAdapter, VaultMindError, ErrorCodes } from '../types';

/**
 * Simplified StorageService using localStorage instead of IndexedDB
 * This avoids the idb dependency issue
 */
export class StorageService implements StorageAdapter {
    private prefix = 'vaultmind_';
    private memoryCache: Map<string, any> = new Map();

    async initialize(): Promise<void> {
        console.log('VaultMind: Storage service initialized (localStorage)');
    }

    async get<T>(key: string): Promise<T | null> {
        try {
            // Check memory cache first
            if (this.memoryCache.has(key)) {
                return this.memoryCache.get(key) as T;
            }

            // Try localStorage
            const stored = localStorage.getItem(this.prefix + key);
            if (stored) {
                const value = JSON.parse(stored);
                this.memoryCache.set(key, value);
                return value as T;
            }

            return null;
        } catch (error) {
            console.error(`VaultMind: Failed to get key ${key}`, error);
            return null;
        }
    }

    async set<T>(key: string, value: T): Promise<void> {
        try {
            // Update memory cache
            this.memoryCache.set(key, value);

            // Persist to localStorage
            localStorage.setItem(this.prefix + key, JSON.stringify(value));
        } catch (error) {
            console.error(`VaultMind: Failed to set key ${key}`, error);
            // If localStorage is full, clear old data
            if (error instanceof DOMException && error.name === 'QuotaExceededError') {
                this.cleanup();
                // Try again
                try {
                    localStorage.setItem(this.prefix + key, JSON.stringify(value));
                } catch (retryError) {
                    throw new VaultMindError(
                        'Storage quota exceeded',
                        ErrorCodes.STORAGE_ERROR,
                        retryError
                    );
                }
            }
        }
    }

    async delete(key: string): Promise<void> {
        this.memoryCache.delete(key);
        localStorage.removeItem(this.prefix + key);
    }

    async clear(): Promise<void> {
        this.memoryCache.clear();
        
        // Clear all VaultMind keys from localStorage
        const keys = Object.keys(localStorage);
        for (const key of keys) {
            if (key.startsWith(this.prefix)) {
                localStorage.removeItem(key);
            }
        }
        
        console.log('VaultMind: Storage cleared');
    }

    async getAll<T>(): Promise<Map<string, T>> {
        const result = new Map<string, T>();
        
        const keys = Object.keys(localStorage);
        for (const key of keys) {
            if (key.startsWith(this.prefix)) {
                const cleanKey = key.substring(this.prefix.length);
                try {
                    const value = JSON.parse(localStorage.getItem(key) || '');
                    result.set(cleanKey, value);
                } catch (error) {
                    console.error(`Failed to parse ${key}`, error);
                }
            }
        }
        
        return result;
    }

    // Cache methods (simplified)
    async getCache<T>(key: string): Promise<T | null> {
        return this.get<T>('cache_' + key);
    }

    async setCache<T>(key: string, value: T, ttlMs?: number): Promise<void> {
        const cacheEntry = {
            data: value,
            timestamp: Date.now(),
            ttl: ttlMs
        };
        await this.set('cache_' + key, cacheEntry);
    }

    async deleteCache(key: string): Promise<void> {
        await this.delete('cache_' + key);
    }

    async clearCache(): Promise<void> {
        const keys = Object.keys(localStorage);
        for (const key of keys) {
            if (key.startsWith(this.prefix + 'cache_')) {
                localStorage.removeItem(key);
            }
        }
        console.log('VaultMind: Cache cleared');
    }

    async cleanup(): Promise<void> {
        // Remove old cache entries
        const keys = Object.keys(localStorage);
        const now = Date.now();
        
        for (const key of keys) {
            if (key.startsWith(this.prefix + 'cache_')) {
                try {
                    const item = JSON.parse(localStorage.getItem(key) || '');
                    if (item.ttl && now > item.timestamp + item.ttl) {
                        localStorage.removeItem(key);
                    }
                } catch (error) {
                    // Remove corrupted entries
                    localStorage.removeItem(key);
                }
            }
        }
    }

    async getStorageSize(): Promise<number> {
        let size = 0;
        const keys = Object.keys(localStorage);
        
        for (const key of keys) {
            if (key.startsWith(this.prefix)) {
                const value = localStorage.getItem(key) || '';
                size += key.length + value.length;
            }
        }
        
        return size * 2; // Approximate bytes (UTF-16)
    }

    async export(): Promise<string> {
        const data = await this.getAll();
        return JSON.stringify(Array.from(data.entries()), null, 2);
    }

    async import(jsonData: string): Promise<void> {
        try {
            const entries = JSON.parse(jsonData);
            
            if (!Array.isArray(entries)) {
                throw new Error('Invalid import data format');
            }

            for (const [key, value] of entries) {
                await this.set(key, value);
            }

            console.log(`VaultMind: Imported ${entries.length} entries`);
        } catch (error) {
            console.error('VaultMind: Failed to import data', error);
            throw new VaultMindError(
                'Failed to import storage data',
                ErrorCodes.STORAGE_ERROR,
                error
            );
        }
    }
}
