import { App, TFile, CachedMetadata } from "obsidian";
import {
	VaultIndex,
	IndexedNote,
	VaultMindTask,
	VaultMindGoal,
	IVaultIndexer,
	VaultMindError,
	ErrorCodes,
} from "../types";
import { StorageService } from "../services/StorageService";
import { extractTasks } from "../utils/parser";
import { parseGoalsFromNote } from "../utils/goalParser";
import { debounce } from "../utils/helpers";

// Serialized types for storage
interface SerializedNote {
	file: null;
	filePath?: string;
	title: string;
	content: string;
	frontmatter: Record<string, unknown>;
	tasks: string[] | VaultMindTask[];
	tags: string[];
	links: string[];
	backlinks: string[];
	lastModified: Date;
	wordCount: number;
	embeddingVector: Float32Array | null;
}

interface SerializedGoal extends Omit<VaultMindGoal, "file" | "linkedTasks"> {
	file: null;
	linkedTasks: string[];
}

interface SerializedIndex {
	notes: Array<[string, SerializedNote]>;
	tasks: Array<[string, VaultMindTask]>;
	goals: Array<[string, SerializedGoal]>;
	lastIndexed: string;
	version: number;
}

export class VaultIndexer implements IVaultIndexer {
	private app: App;
	storage: StorageService; // Made public for access from plugin
	private index: VaultIndex;
	private indexing: boolean = false;
	private fileWatchers: Map<string, () => void> = new Map();

	constructor() {
		this.index = {
			notes: new Map(),
			tasks: new Map(),
			goals: new Map(),
			lastIndexed: new Date(),
			version: 1,
		};
		this.storage = new StorageService();
	}

	async initialize(app: App): Promise<void> {
		this.app = app;
		this.storage.initialize(app);

		// Load existing index from storage
		const storedIndex = await this.storage.get<SerializedIndex>(
			"vault-index"
		);
		if (storedIndex) {
			this.index = this.deserializeIndex(storedIndex);
		}

		// Set up file watchers
		this.registerFileWatchers();

		// Perform initial indexing if needed
		if (!storedIndex || this.isIndexOutdated()) {
			await this.indexVault();
		}
	}

	async indexVault(): Promise<VaultIndex> {
		if (this.indexing) {
			console.debug("VaultMind: Indexing already in progress");
			return this.index;
		}

		this.indexing = true;
		const startTime = Date.now();

		try {
			console.debug("VaultMind: Starting vault indexing...");

			// Clear existing index
			this.index.notes.clear();
			this.index.tasks.clear();

			// Get all markdown files
			const files = this.app.vault.getMarkdownFiles();
			const totalFiles = files.length;
			let processedFiles = 0;

			// Process files in batches to avoid blocking UI
			const batchSize = 10;
			for (let i = 0; i < files.length; i += batchSize) {
				const batch = files.slice(i, i + batchSize);
				await Promise.all(batch.map((file) => this.indexFile(file)));

				processedFiles += batch.length;

				// Update progress
				if (
					processedFiles % 50 === 0 ||
					processedFiles === totalFiles
				) {
					console.debug(
						`VaultMind: Indexed ${processedFiles}/${totalFiles} files`
					);
				}
			}

			this.index.lastIndexed = new Date();

			// Save index to storage
			await this.saveIndex();

			const duration = Date.now() - startTime;
			console.debug(`VaultMind: Indexing completed in ${duration}ms`);
			console.debug(
				`VaultMind: Indexed ${this.index.notes.size} notes, ${this.index.tasks.size} tasks`
			);

			return this.index;
		} catch (error) {
			console.error("VaultMind: Indexing failed", error);
			throw new VaultMindError(
				"Failed to index vault",
				ErrorCodes.INDEXING_FAILED,
				error
			);
		} finally {
			this.indexing = false;
		}
	}

	async indexFile(file: TFile): Promise<IndexedNote> {
		try {
			const content = await this.app.vault.read(file);
			const metadata = this.app.metadataCache.getFileCache(file);

			// Parse frontmatter
			const frontmatter = metadata?.frontmatter || {};

			// Extract tasks
			const tasks = extractTasks(content, file, metadata);

			// Extract goals
			const goals = parseGoalsFromNote(file, content, frontmatter);

			// Extract tags
			const tags = this.extractTags(metadata);

			// Extract links
			const links = this.extractLinks(metadata);

			// Count words
			const wordCount = this.countWords(content);

			// Create indexed note
			const indexedNote: IndexedNote = {
				file: null, // Don't store TFile to avoid circular references
				filePath: file.path,
				title: file.basename,
				content: content.slice(0, 5000), // Store first 5000 chars for quick access
				frontmatter,
				tasks,
				tags,
				links,
				lastModified: new Date(file.stat.mtime),
				wordCount,
			};

			// Add to index
			this.index.notes.set(file.path, indexedNote);

			// Add tasks to task index
			tasks.forEach((task) => {
				this.index.tasks.set(task.id, task);
			});

			// Add goals to goal index
			goals.forEach((goal) => {
				this.index.goals.set(goal.id, goal);
			});

			return indexedNote;
		} catch (error) {
			console.error(
				`VaultMind: Failed to index file ${file.path}`,
				error
			);
			throw error;
		}
	}

	async updateIndex(file: TFile): Promise<void> {
		// Debounced update to avoid excessive re-indexing
		const debouncedUpdate = debounce(async () => {
			console.debug(`VaultMind: Updating index for ${file.path}`);

			// Remove old tasks from this file
			const oldNote = this.index.notes.get(file.path);
			if (oldNote) {
				if (oldNote.tasks instanceof Set) {
					oldNote.tasks.forEach((taskId) => {
						this.index.tasks.delete(taskId);
					});
				} else if (Array.isArray(oldNote.tasks)) {
					oldNote.tasks.forEach((task) => {
						this.index.tasks.delete(task.id);
					});
				}
			}

			// Re-index the file
			await this.indexFile(file);

			// Save updated index
			await this.saveIndex();
		}, 1000);

		await debouncedUpdate();
	}

	async removeFromIndex(path: string): Promise<void> {
		const note = this.index.notes.get(path);
		if (note) {
			// Remove associated tasks
			if (note.tasks instanceof Set) {
				note.tasks.forEach((taskId) => {
					this.index.tasks.delete(taskId);
				});
			} else if (Array.isArray(note.tasks)) {
				note.tasks.forEach((task) => {
					this.index.tasks.delete(task.id);
				});
			}

			// Remove note from index
			this.index.notes.delete(path);

			// Save updated index
			await this.saveIndex();

			console.debug(`VaultMind: Removed ${path} from index`);
		}
	}

	search(query: string): Promise<IndexedNote[]> {
		const results: IndexedNote[] = [];
		const queryLower = query.toLowerCase();

		// Simple text search for now (will be enhanced with embeddings later)
		for (const note of this.index.notes.values()) {
			const searchableText = `${note.title} ${
				note.content
			} ${note.tags.join(" ")}`.toLowerCase();

			if (searchableText.includes(queryLower)) {
				results.push(note);
			}
		}

		// Sort by relevance (simple scoring for now)
		results.sort((a, b) => {
			const aScore = this.calculateRelevance(a, queryLower);
			const bScore = this.calculateRelevance(b, queryLower);
			return bScore - aScore;
		});

		return Promise.resolve(results.slice(0, 20)); // Return top 20 results
	}

	getIndex(): VaultIndex {
		return this.index;
	}

	// ============= Private Methods =============

	private registerFileWatchers(): void {
		// Watch for file changes
		this.app.vault.on("modify", (file) => {
			if (file instanceof TFile && file.extension === "md") {
				this.updateIndex(file);
			}
		});

		// Watch for file creation
		this.app.vault.on("create", (file) => {
			if (file instanceof TFile && file.extension === "md") {
				this.indexFile(file);
			}
		});

		// Watch for file deletion
		this.app.vault.on("delete", (file) => {
			if (file instanceof TFile) {
				this.removeFromIndex(file.path);
			}
		});

		// Watch for file rename
		this.app.vault.on("rename", (file, oldPath) => {
			if (file instanceof TFile && file.extension === "md") {
				this.removeFromIndex(oldPath);
				this.indexFile(file);
			}
		});
	}

	private extractTags(metadata: CachedMetadata | null): string[] {
		const tags: string[] = [];

		if (metadata?.tags) {
			metadata.tags.forEach((tag) => {
				tags.push(tag.tag.replace("#", ""));
			});
		}

		if (metadata?.frontmatter?.tags) {
			const frontmatterTags = metadata.frontmatter.tags;
			if (Array.isArray(frontmatterTags)) {
				tags.push(...frontmatterTags);
			} else if (typeof frontmatterTags === "string") {
				tags.push(...frontmatterTags.split(",").map((t) => t.trim()));
			}
		}

		return [...new Set(tags)]; // Remove duplicates
	}

	private extractLinks(metadata: CachedMetadata | null): string[] {
		const links: string[] = [];

		if (metadata?.links) {
			metadata.links.forEach((link) => {
				links.push(link.link);
			});
		}

		if (metadata?.embeds) {
			metadata.embeds.forEach((embed) => {
				links.push(embed.link);
			});
		}

		return [...new Set(links)];
	}

	private countWords(content: string): number {
		// Remove frontmatter
		const contentWithoutFrontmatter = content.replace(
			/^---[\s\S]*?---\n/,
			""
		);
		// Remove markdown syntax
		const plainText = contentWithoutFrontmatter
			.replace(/[#*_~`[\]()]/g, "")
			.replace(/!\[.*?\]\(.*?\)/g, "")
			.replace(/\[.*?\]\(.*?\)/g, "");

		const words = plainText.match(/\b\w+\b/g);
		return words ? words.length : 0;
	}

	private calculateRelevance(note: IndexedNote, query: string): number {
		let score = 0;

		// Title match (highest weight)
		if (note.title.toLowerCase().includes(query)) {
			score += 10;
		}

		// Tag match (high weight)
		if (note.tags.some((tag) => tag.toLowerCase().includes(query))) {
			score += 5;
		}

		// Content match (base weight)
		const contentMatches = (
			note.content.toLowerCase().match(new RegExp(query, "g")) || []
		).length;
		score += contentMatches;

		// Recent modification bonus
		const daysSinceModified =
			(Date.now() - note.lastModified.getTime()) / (1000 * 60 * 60 * 24);
		if (daysSinceModified < 7) {
			score += 2;
		}

		return score;
	}

	private isIndexOutdated(): boolean {
		if (!this.index.lastIndexed) return true;

		const hoursSinceIndex =
			(Date.now() - this.index.lastIndexed.getTime()) / (1000 * 60 * 60);
		return hoursSinceIndex > 24; // Re-index if older than 24 hours
	}

	private async saveIndex(): Promise<void> {
		try {
			const serializedIndex = this.serializeIndex(this.index);
			await this.storage.set("vault-index", serializedIndex);
		} catch (error) {
			console.error("VaultMind: Failed to save index", error);
		}
	}

	private serializeIndex(index: VaultIndex): SerializedIndex {
		// Convert Maps to serializable arrays, removing TFile references
		const notesArray: Array<[string, SerializedNote]> = Array.from(
			index.notes.entries()
		).map(([path, note]): [string, SerializedNote] => [
			path,
			{
				...note,
				file: null, // Don't serialize TFile object
				tasks:
					note.tasks instanceof Set
						? Array.from(note.tasks as Set<string>)
						: (note.tasks as VaultMindTask[]),
				links:
					note.links instanceof Set
						? Array.from(note.links as Set<string>)
						: (note.links as string[]),
				backlinks:
					note.backlinks instanceof Set
						? Array.from(note.backlinks as Set<string>)
						: (note.backlinks as string[]) || [],
				embeddingVector: note.embeddingVector || null,
			} as SerializedNote,
		]);

		const tasksArray: Array<[string, VaultMindTask]> = Array.from(
			index.tasks.entries()
		).map(([id, task]): [string, VaultMindTask] => [
			id,
			{
				...task,
				file: null, // Don't serialize TFile object
			},
		]);

		const goalsArray: Array<[string, SerializedGoal]> = Array.from(
			index.goals.entries()
		).map(([id, goal]): [string, SerializedGoal] => [
			id,
			{
				...goal,
				file: null, // Don't serialize TFile object
				linkedTasks: Array.from(goal.linkedTasks || []),
				milestones: goal.milestones || [],
			} as SerializedGoal,
		]);

		return {
			notes: notesArray,
			tasks: tasksArray,
			goals: goalsArray,
			lastIndexed: index.lastIndexed.toISOString(),
			version: index.version,
		};
	}

	private deserializeIndex(data: SerializedIndex): VaultIndex {
		// Convert arrays back to Maps with proper types
		const notesMap = new Map<string, IndexedNote>(
			(data.notes || []).map(([path, note]: [string, SerializedNote]) => [
				path,
				{
					...note,
					file: null, // File will be re-attached when needed
					tasks:
						Array.isArray(note.tasks) &&
						note.tasks.length > 0 &&
						typeof note.tasks[0] === "string"
							? new Set(note.tasks as string[])
							: (note.tasks as VaultMindTask[]),
					links: new Set((note.links as string[]) || []),
					backlinks: new Set((note.backlinks as string[]) || []),
				} as IndexedNote,
			])
		);

		const tasksMap = new Map<string, VaultMindTask>(data.tasks || []);

		const goalsMap = new Map<string, VaultMindGoal>(
			(data.goals || []).map(
				([id, goal]: [string, SerializedGoal]): [
					string,
					VaultMindGoal
				] => [
					id,
					{
						...goal,
						file: null,
						linkedTasks: goal.linkedTasks as string[], // VaultMindGoal expects string[], not Set
						milestones: goal.milestones || [],
					} as VaultMindGoal,
				]
			)
		);

		return {
			notes: notesMap,
			tasks: tasksMap,
			goals: goalsMap,
			lastIndexed: new Date(data.lastIndexed || Date.now()),
			version: data.version || 1,
		};
	}
}
