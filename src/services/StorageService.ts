import { App } from "obsidian";
import { StorageAdapter, VaultMindError, ErrorCodes } from "../types";

/**
 * StorageService using Obsidian's built-in storage API
 * This is vault-specific and uses Obsidian's recommended storage APIs
 */
export class StorageService implements StorageAdapter {
	private app: App | null = null;
	private prefix = "vaultmind_";
	private memoryCache: Map<string, unknown> = new Map();

	initialize(app?: App): void {
		if (app) {
			this.app = app;
		}
		console.debug("VaultMind: Storage service initialized (localStorage)");
	}

	private getStorageKey(key: string): string {
		return this.prefix + key;
	}

	private loadFromStorage(key: string): string | null {
		if (!this.app) {
			console.warn("VaultMind: App not initialized, cannot load from storage");
			return null;
		}
		return this.app.loadLocalStorage(this.getStorageKey(key));
	}

	private saveToStorage(key: string, value: string): void {
		if (!this.app) {
			console.warn("VaultMind: App not initialized, cannot save to storage");
			return;
		}
		this.app.saveLocalStorage(this.getStorageKey(key), value);
	}

	private removeFromStorage(key: string): void {
		if (!this.app) {
			console.warn("VaultMind: App not initialized, cannot remove from storage");
			return;
		}
		this.app.saveLocalStorage(this.getStorageKey(key), null);
	}

	get<T>(key: string): Promise<T | null> {
		try {
			// Check memory cache first
			if (this.memoryCache.has(key)) {
				return Promise.resolve(this.memoryCache.get(key) as T);
			}

			// Try storage
			const stored = this.loadFromStorage(key);
			if (stored) {
				const value = JSON.parse(stored) as T;
				this.memoryCache.set(key, value);
				return Promise.resolve(value);
			}

			return Promise.resolve(null);
		} catch {
			console.error(`VaultMind: Failed to get key ${key}`);
			return Promise.resolve(null);
		}
	}

	set<T>(key: string, value: T): Promise<void> {
		try {
			// Update memory cache
			this.memoryCache.set(key, value);

			// Persist to storage
			this.saveToStorage(key, JSON.stringify(value));
			return Promise.resolve();
		} catch (err) {
			console.error(`VaultMind: Failed to set key ${key}`);
			// If storage is full, clear old data
			if (
				err instanceof DOMException &&
				err.name === "QuotaExceededError"
			) {
				void this.cleanup();
				// Try again
				try {
					this.saveToStorage(key, JSON.stringify(value));
					return Promise.resolve();
				} catch {
					return Promise.reject(
						new VaultMindError(
							"Storage quota exceeded",
							ErrorCodes.STORAGE_ERROR
						)
					);
				}
			}
			return Promise.resolve();
		}
	}

	delete(key: string): Promise<void> {
		this.memoryCache.delete(key);
		this.removeFromStorage(key);
		return Promise.resolve();
	}

	clear(): Promise<void> {
		// Get keys before clearing cache
		const keysToRemove = Array.from(this.memoryCache.keys());
		this.memoryCache.clear();

		// Clear all VaultMind keys from storage
		for (const key of keysToRemove) {
			this.removeFromStorage(key);
		}

		console.debug("VaultMind: Storage cleared");
		return Promise.resolve();
	}

	getAll<T>(): Promise<Map<string, T>> {
		// Return what's in cache since we don't have a way to enumerate all keys
		const result = new Map<string, T>();
		for (const [key, value] of this.memoryCache) {
			result.set(key, value as T);
		}
		return Promise.resolve(result);
	}

	// Cache methods (simplified)
	async getCache<T>(key: string): Promise<T | null> {
		return await this.get<T>("cache_" + key);
	}

	async setCache<T>(key: string, value: T, ttlMs?: number): Promise<void> {
		const cacheEntry = {
			data: value,
			timestamp: Date.now(),
			ttl: ttlMs,
		};
		await this.set("cache_" + key, cacheEntry);
	}

	async deleteCache(key: string): Promise<void> {
		await this.delete("cache_" + key);
	}

	async clearCache(): Promise<void> {
		// Clear cache entries from memory cache
		const keysToDelete: string[] = [];
		for (const [key] of this.memoryCache) {
			if (key.startsWith("cache_")) {
				keysToDelete.push(key);
			}
		}
		for (const key of keysToDelete) {
			await this.delete(key);
		}
		console.debug("VaultMind: Cache cleared");
	}

	cleanup(): Promise<void> {
		// Remove old cache entries
		const now = Date.now();
		const keysToDelete: string[] = [];

		for (const [key, value] of this.memoryCache) {
			if (key.startsWith("cache_")) {
				const cacheValue = value as { ttl?: number; timestamp?: number };
				if (cacheValue.ttl && cacheValue.timestamp && now > cacheValue.timestamp + cacheValue.ttl) {
					keysToDelete.push(key);
				}
			}
		}

		for (const key of keysToDelete) {
			void this.delete(key);
		}
		return Promise.resolve();
	}

	getStorageSize(): Promise<number> {
		let size = 0;

		// Estimate size from memory cache
		for (const [key, value] of this.memoryCache) {
			size += key.length + JSON.stringify(value).length;
		}

		return Promise.resolve(size);
	}

	/**
	 * Check if storage is available
	 */
	isAvailable(): boolean {
		if (!this.app) {
			return false;
		}
		try {
			const testKey = "__vaultmind_test__";
			this.app.saveLocalStorage(testKey, "test");
			this.app.saveLocalStorage(testKey, null);
			return true;
		} catch {
			return false;
		}
	}
}
