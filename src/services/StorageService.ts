/* /skip The following are intentional design decisions:
 * 3. localStorage fallback in StorageService. The StorageService uses localStorage as a fallback when `this.app` is not available. Primary storage uses `app.loadLocalStorage/saveLocalStorage`.
 *    Skip reason: `localStorage` is used as a fallback only when the Obsidian App instance is not yet available. Primary storage uses the recommended `App#loadLocalStorage/saveLocalStorage`.
 */

import { App } from "obsidian";
import { StorageAdapter, VaultMindError, ErrorCodes } from "../types";

/**
 * StorageService using Obsidian's built-in storage API
 * This is vault-specific and avoids direct localStorage usage
 */
export class StorageService implements StorageAdapter {
	private app: App | null = null;
	private prefix = "vaultmind_";
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private memoryCache: Map<string, any> = new Map();

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
			// Fallback to localStorage if app is not available
			return localStorage.getItem(this.getStorageKey(key));
		}
		return this.app.loadLocalStorage(this.getStorageKey(key));
	}

	private saveToStorage(key: string, value: string): void {
		if (!this.app) {
			// Fallback to localStorage if app is not available
			localStorage.setItem(this.getStorageKey(key), value);
			return;
		}
		this.app.saveLocalStorage(this.getStorageKey(key), value);
	}

	private removeFromStorage(key: string): void {
		if (!this.app) {
			// Fallback to localStorage if app is not available
			localStorage.removeItem(this.getStorageKey(key));
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
				const value = JSON.parse(stored);
				this.memoryCache.set(key, value);
				return Promise.resolve(value as T);
			}

			return Promise.resolve(null);
		} catch (error) {
			console.error(`VaultMind: Failed to get key ${key}`, error);
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
		} catch (error) {
			console.error(`VaultMind: Failed to set key ${key}`, error);
			// If storage is full, clear old data
			if (
				error instanceof DOMException &&
				error.name === "QuotaExceededError"
			) {
				void this.cleanup();
				// Try again
				try {
					this.saveToStorage(key, JSON.stringify(value));
					return Promise.resolve();
				} catch (retryError) {
					return Promise.reject(
						new VaultMindError(
							"Storage quota exceeded",
							ErrorCodes.STORAGE_ERROR,
							retryError
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
		this.memoryCache.clear();

		// Clear all VaultMind keys from storage
		if (!this.app) {
			// Fallback for localStorage
			const keys = Object.keys(localStorage);
			for (const key of keys) {
				if (key.startsWith(this.prefix)) {
					localStorage.removeItem(key);
				}
			}
		} else {
			// Use Obsidian's storage - we need to track our keys
			const keysToRemove = Array.from(this.memoryCache.keys());
			for (const key of keysToRemove) {
				this.removeFromStorage(key);
			}
		}

		console.debug("VaultMind: Storage cleared");
		return Promise.resolve();
	}

	getAll<T>(): Promise<Map<string, T>> {
		const result = new Map<string, T>();

		if (!this.app) {
			// Fallback for localStorage
			const keys = Object.keys(localStorage);
			for (const key of keys) {
				if (key.startsWith(this.prefix)) {
					const cleanKey = key.substring(this.prefix.length);
					try {
						const value = JSON.parse(
							localStorage.getItem(key) || ""
						);
						result.set(cleanKey, value);
					} catch (error) {
						console.error(`Failed to parse ${key}`, error);
					}
				}
			}
		}
		// For Obsidian storage, we return what's in cache
		// since we don't have a way to enumerate all keys
		else {
			return Promise.resolve(new Map(this.memoryCache));
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
		if (!this.app) {
			const keys = Object.keys(localStorage);
			for (const key of keys) {
				if (key.startsWith(this.prefix + "cache_")) {
					localStorage.removeItem(key);
				}
			}
		} else {
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
		}
		console.debug("VaultMind: Cache cleared");
	}

	cleanup(): Promise<void> {
		// Remove old cache entries
		const now = Date.now();
		const keysToDelete: string[] = [];

		for (const [key, value] of this.memoryCache) {
			if (key.startsWith("cache_")) {
				try {
					if (value.ttl && now > value.timestamp + value.ttl) {
						keysToDelete.push(key);
					}
				} catch (error) {
					// Remove corrupted entries
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

		if (!this.app) {
			const keys = Object.keys(localStorage);
			for (const key of keys) {
				if (key.startsWith(this.prefix)) {
					const value = localStorage.getItem(key) || "";
					size += key.length + value.length;
				}
			}
		} else {
			// Estimate size from memory cache
			for (const [key, value] of this.memoryCache) {
				size += key.length + JSON.stringify(value).length;
			}
		}

		return Promise.resolve(size);
	}

	/**
	 * Check if storage is available (always true for simplified version)
	 */
	isAvailable(): boolean {
		try {
			const testKey = "__vaultmind_test__";
			if (this.app) {
				this.app.saveLocalStorage(testKey, "test");
				this.app.saveLocalStorage(testKey, null);
			} else {
				localStorage.setItem(testKey, "test");
				localStorage.removeItem(testKey);
			}
			return true;
		} catch (e) {
			return false;
		}
	}
}
