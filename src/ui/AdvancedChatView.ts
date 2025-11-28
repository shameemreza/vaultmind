/* /skip The following are intentional design decisions:
 * 1. Inline styles (textarea height, progress bar width). These are dynamic values that MUST be set via JavaScript:
 *    * `this.inputEl.style.height` - Textarea auto-resize (value changes based on content).
 *    * `progressFill.style.width` - Progress bar (value is a percentage)
 *    Skip reason: Dynamic values for textarea auto-resize and progress bar width must be set inline via JavaScript as the values are calculated at runtime.
 * 2. Heading elements in Modals/Views (22 instances). The rule use `new Setting().setHeading()` is for settings tabs only. In modals and views like `DashboardView` and `AdvancedChatView`, using `createEl("h2")` is the correct approach.
 *    Skip reason: These headings are in modals and views, not settings tabs. The `Setting().setHeading()` API is designed for `PluginSettingTab` contexts only.
 */

import {
	ItemView,
	WorkspaceLeaf,
	Notice,
	setIcon,
	TFile,
	TFolder,
	Modal,
	App,
	Setting,
	MarkdownRenderer,
} from "obsidian";
import { ConfirmModal } from "./ConfirmModal";
import VaultMindPlugin from "../main";
import { VaultMindTask } from "../types";
import { ContextManager } from "../ai/ContextManager";

export const CHAT_VIEW_TYPE = "vaultmind-chat";

interface ChatMessage {
	role: "user" | "assistant" | "system";
	content: string;
	timestamp: Date;
	context?: {
		files?: string[];
		tasks?: number;
		goals?: number;
		searchResults?: Array<{ path: string; title: string }>;
	};
}

interface ChatSession {
	id: string;
	title: string;
	messages: ChatMessage[];
	createdAt: Date;
	updatedAt: Date;
}

export class AdvancedChatView extends ItemView {
	plugin: VaultMindPlugin;
	private messages: ChatMessage[] = [];
	private sessions: Map<string, ChatSession> = new Map();
	private currentSessionId: string;
	private messagesEl: HTMLElement;
	private inputEl: HTMLTextAreaElement;
	private sendBtn: HTMLButtonElement;
	private isProcessing = false;
	private attachedNotes: TFile[] = [];
	private attachedFolders: TFolder[] = [];
	private contextEl: HTMLElement;
	private contextManager: ContextManager;
	private sessionSelectEl: HTMLSelectElement;
	private includeAllNotes = false;
	private includeTasks = true;
	private includeGoals = true;

	constructor(leaf: WorkspaceLeaf, plugin: VaultMindPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.contextManager = new ContextManager();
		this.loadSessions();
		this.createNewSession();
	}

	getViewType() {
		return CHAT_VIEW_TYPE;
	}

	getDisplayText() {
		return "VaultMind AI Chat";
	}

	getIcon() {
		return "message-circle";
	}

	async onOpen() {
		const container = this.containerEl.children[1];

		try {
			container.empty();
			container.addClass("vaultmind-chat-container");

			// Create chat header with enhanced controls
			const header = container.createEl("div", {
				cls: "vaultmind-chat-header",
			});

			// Session management
			const sessionControl = header.createEl("div", {
				cls: "session-control",
			});

			// Session dropdown
			this.sessionSelectEl = sessionControl.createEl("select", {
				cls: "session-selector",
			});
			this.updateSessionSelector();

			this.sessionSelectEl.addEventListener("change", () => {
				const value = this.sessionSelectEl.value;
				if (value && value !== "" && value !== "actions") {
					this.switchSession(value);
				}
			});

			// Session action buttons
			const sessionActions = sessionControl.createEl("div", {
				cls: "session-actions",
			});

			// New session button
			const newSessionBtn = sessionActions.createEl("button", {
				cls: "vaultmind-icon-button",
				attr: { "aria-label": "New chat", title: "New chat" },
			});
			setIcon(newSessionBtn, "plus");
			newSessionBtn.addEventListener("click", () =>
				this.createNewSession()
			);

			// Delete current session button
			const deleteBtn = sessionActions.createEl("button", {
				cls: "vaultmind-icon-button",
				attr: {
					"aria-label": "Delete chat",
					title: "Delete current chat",
				},
			});
			setIcon(deleteBtn, "trash-2");
			deleteBtn.addEventListener("click", () =>
				this.deleteCurrentSession()
			);

			// Control buttons
			const controls = header.createEl("div", {
				cls: "vaultmind-chat-controls",
			});

			// Attach notes/folders button (includes search)
			const attachBtn = controls.createEl("button", {
				cls: "vaultmind-icon-button",
				attr: { "aria-label": "Attach notes/folders or search" },
			});
			setIcon(attachBtn, "paperclip");
			attachBtn.addEventListener("click", () =>
				this.openAdvancedAttachModal()
			);

			// Context settings button
			const settingsBtn = controls.createEl("button", {
				cls: "vaultmind-icon-button",
				attr: {
					"aria-label": "Context settings",
					title: "AI context settings",
				},
			});
			setIcon(settingsBtn, "settings");
			settingsBtn.addEventListener("click", () =>
				this.openContextSettings()
			);

			// Context indicator with detailed info
			this.contextEl = container.createEl("div", {
				cls: "vaultmind-chat-context",
			});
			this.updateContextIndicator();

			// Messages area with markdown rendering support
			this.messagesEl = container.createEl("div", {
				cls: "vaultmind-chat-messages",
			});
			await this.loadCurrentSession();

			// Input area with enhanced features
			const inputContainer = container.createEl("div", {
				cls: "vaultmind-chat-input-container",
			});

			// Input field
			this.inputEl = inputContainer.createEl("textarea", {
				cls: "vaultmind-chat-input",
				attr: {
					placeholder:
						"Ask about your vault, tasks, goals, or anything else...",
					rows: "2",
				},
			});

			// Auto-resize and keyboard shortcuts
			this.inputEl.addEventListener("input", () => {
				this.inputEl.style.height = "auto";
				this.inputEl.style.height =
					Math.min(this.inputEl.scrollHeight, 200) + "px";
			});

			this.inputEl.addEventListener("keydown", (e) => {
				if (e.key === "Enter" && !e.shiftKey) {
					e.preventDefault();
					this.sendMessage();
				}
			});

			// Send button with status
			this.sendBtn = inputContainer.createEl("button", {
				cls: "vaultmind-chat-send-button",
				text: "Send",
			});
			this.sendBtn.addEventListener("click", () => this.sendMessage());

			// Auto-attach current file if open
			const activeFile = this.plugin.app.workspace.getActiveFile();
			if (activeFile) {
				this.attachedNotes = [activeFile];
				this.updateContextIndicator();
			}

			// Show welcome message
			if (this.messages.length === 0) {
				this.addWelcomeMessage();
			}

			console.debug("VaultMind Chat: UI initialized successfully");
		} catch (error) {
			console.error("VaultMind Chat: Error initializing UI", error);
			// Create fallback UI
			this.createFallbackUI(container as HTMLElement);
		}
	}

	private createFallbackUI(container: HTMLElement) {
		container.empty();
		container.addClass("vaultmind-chat-container");

		// Create a working fallback UI
		const header = container.createEl("div", {
			cls: "vaultmind-chat-header",
		});
		header.createEl("h3", { text: "VaultMind Chat" });

		// Add basic controls
		const controls = header.createEl("div", {
			cls: "vaultmind-chat-controls",
		});
		const clearBtn = controls.createEl("button", {
			cls: "vaultmind-icon-button",
			attr: { "aria-label": "Clear chat" },
		});
		setIcon(clearBtn, "trash-2");
		clearBtn.addEventListener("click", () => {
			this.messages = [];
			this.messagesEl.empty();
			this.addWelcomeMessage();
		});

		// Messages area
		this.messagesEl = container.createEl("div", {
			cls: "vaultmind-chat-messages",
		});

		// Add a simple welcome message
		if (this.messages.length === 0) {
			this.messages = [];
			this.addWelcomeMessage();
		}

		// Input area
		const inputContainer = container.createEl("div", {
			cls: "vaultmind-chat-input-container",
		});
		this.inputEl = inputContainer.createEl("textarea", {
			cls: "vaultmind-chat-input",
			attr: {
				placeholder: "Type a message...",
				rows: "2",
			},
		});

		// Make input functional
		this.inputEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				this.sendMessage();
			}
		});

		this.sendBtn = inputContainer.createEl("button", {
			cls: "vaultmind-chat-send-button",
			text: "Send",
		});
		this.sendBtn.addEventListener("click", () => this.sendMessage());

		console.debug(
			"VaultMind Chat: Fallback UI created with basic functionality"
		);
	}

	private async addWelcomeMessage() {
		await this.addMessage({
			role: "assistant",
			content: `Hi! I'm your VaultMind AI assistant with **full access** to your vault.

I can help you with:
• **Notes**: Search, summarize, find connections
• **Tasks**: List, filter, analyze (${
				this.plugin.taskEngine?.getTasks().length || 0
			} tasks indexed)
• **Goals**: Track progress, suggest next steps (${
				this.plugin.goalEngine?.getGoals().length || 0
			} goals found)
• **Smart Search**: Find any information across your vault
• **Insights**: Discover patterns and connections

**Quick Commands:**
• "Show my overdue tasks"
• "Summarize notes about [topic]"
• "What are my goals?"
• "Find all notes mentioning [keyword]"

Use the paperclip button to attach specific files/folders, or I'll search your entire vault automatically!`,
			timestamp: new Date(),
		});
	}

	private async sendMessage() {
		const message = this.inputEl.value.trim();
		if (!message || this.isProcessing) return;

		// Add user message
		await this.addMessage({
			role: "user",
			content: message,
			timestamp: new Date(),
		});

		// Clear input
		this.inputEl.value = "";
		this.inputEl.style.height = "auto";

		// Disable while processing
		this.setProcessing(true);

		try {
			// Get comprehensive AI response
			const response = await this.getEnhancedAIResponse(message);

			// Add assistant response with context info
			await this.addMessage({
				role: "assistant",
				content: response.content,
				timestamp: new Date(),
				context: response.context,
			});

			// Save session
			this.saveCurrentSession();
		} catch (error) {
			console.error("VaultMind Chat Error:", error);
			await this.addMessage({
				role: "assistant",
				content:
					"❌ Sorry, I encountered an error. Please check your AI configuration in settings.",
				timestamp: new Date(),
			});
		} finally {
			this.setProcessing(false);
		}
	}

	private async getEnhancedAIResponse(message: string): Promise<{
		content: string;
		context?: {
			files?: string[];
			tasks?: number;
			goals?: number;
			searchResults?: Array<{ path: string; title: string }>;
		};
	}> {
		// Ensure AI provider is ready
		if (!this.plugin.aiProvider) {
			if (this.plugin.aiManager) {
				this.plugin.aiProvider =
					await this.plugin.aiManager.getProvider();
			}
			if (!this.plugin.aiProvider) {
				return {
					content:
						"⚠️ Please configure an AI provider (OpenAI, Claude, or Ollama) in settings.",
				};
			}
		}

		// Build comprehensive context (with fallback if indexer not ready)
		const context = await this.buildComprehensiveContext(message).catch(
			(err) => {
				console.warn(
					"VaultMind: Error building context, using fallback",
					err
				);
				return `User query: ${message}\nAttached notes: ${this.attachedNotes
					.map((n) => n.basename)
					.join(", ")}`;
			}
		);

		// Detect intent and handle appropriately
		const intent = this.detectIntent(message);

		let response = "";
		let searchResults: Array<{ path: string; title: string }> = [];

		switch (intent.type) {
			case "task_query":
				response = await this.handleTaskQuery(message, context);
				break;

			case "goal_query":
				response = await this.handleGoalQuery(message, context);
				break;

			case "note_search": {
				const results = await this.searchNotes(intent.query || message);
				searchResults = results;
				response = await this.handleNoteSearch(
					message,
					results,
					context
				);
				break;
			}

			case "summarize":
				response = await this.handleSummarization(message, context);
				break;

			default:
				// General question
				response = await this.plugin.aiProvider.answerQuestion(
					message,
					context
				);
		}

		return {
			content: response,
			context: {
				files: this.attachedNotes.map((f) => f.path),
				tasks: this.includeTasks
					? this.plugin.taskEngine?.getTasks().length
					: 0,
				goals: this.includeGoals
					? this.plugin.goalEngine?.getGoals().length
					: 0,
				searchResults,
			},
		};
	}

	private detectIntent(message: string): { type: string; query?: string } {
		const lower = message.toLowerCase();

		if (
			lower.includes("task") ||
			lower.includes("todo") ||
			lower.includes("overdue") ||
			lower.includes("due")
		) {
			return { type: "task_query" };
		}

		if (
			lower.includes("goal") ||
			lower.includes("objective") ||
			lower.includes("milestone") ||
			lower.includes("progress")
		) {
			return { type: "goal_query" };
		}

		// Extended note search patterns
		const notePatterns = [
			// Original patterns
			/(?:find|search|show|list)\s+(?:all\s+)?(?:notes?\s+)?(?:about|mentioning|containing|with)?\s*(.+)/i,
			// New patterns for direct note requests
			/(?:read|open|get|view)\s+(?:the\s+)?(?:note|file|document)?\s*(?:about|on|for)?\s*['""]?([^'""\n]+)['""]?/i,
			/what['']?s?\s+(?:in|inside)\s+(?:the\s+)?['""]?([^'""\n]+)['""]?\s*(?:note|file)?/i,
			/content\s+(?:of|from)\s+['""]?([^'""\n]+)['""]?/i,
			/(?:what|help)\s+.*?(?:added|wrote|put)\s+(?:in|to)\s+['""]?([^'""\n]+)['""]?\s*(?:note|notes)?/i,
			/['""]([^'""\n]+)['""]?\s+(?:note|file|document)/i,
		];

		for (const pattern of notePatterns) {
			const match = message.match(pattern);
			if (match) {
				return {
					type: "note_search",
					query: match[1]?.trim() || message,
				};
			}
		}

		// Check for generic search/find/show/read terms
		if (
			lower.includes("find") ||
			lower.includes("search") ||
			lower.includes("show") ||
			lower.includes("list") ||
			lower.includes("read") ||
			lower.includes("open") ||
			(lower.includes("what") && lower.includes("note"))
		) {
			return { type: "note_search", query: message };
		}

		if (lower.includes("summarize") || lower.includes("summary")) {
			return { type: "summarize" };
		}

		return { type: "general" };
	}

	private async handleTaskQuery(
		message: string,
		context: string
	): Promise<string> {
		const tasks = this.plugin.taskEngine?.getTasks() || [];
		const lower = message.toLowerCase();

		let relevantTasks = tasks;
		let title = "Tasks";

		// Filter based on query
		if (lower.includes("overdue")) {
			relevantTasks = tasks.filter(
				(t) =>
					t.dueDate &&
					new Date(t.dueDate) < new Date() &&
					!t.completed
			);
			title = "Overdue Tasks";
		} else if (lower.includes("today")) {
			const today = new Date().toDateString();
			relevantTasks = tasks.filter(
				(t) => t.dueDate && new Date(t.dueDate).toDateString() === today
			);
			title = "Today's Tasks";
		} else if (lower.includes("completed")) {
			relevantTasks = tasks.filter((t) => t.completed);
			title = "Completed Tasks";
		} else if (lower.includes("pending") || lower.includes("incomplete")) {
			relevantTasks = tasks.filter((t) => !t.completed);
			title = "Pending Tasks";
		}

		// Format response
		let response = `## ${title}\n\n`;

		if (relevantTasks.length === 0) {
			response += `No ${title.toLowerCase()} found.\n`;
		} else {
			response += `Found **${
				relevantTasks.length
			}** ${title.toLowerCase()}:\n\n`;

			// Group by priority or date
			const grouped = this.groupTasks(relevantTasks);

			for (const [group, groupTasks] of Object.entries(grouped)) {
				response += `### ${group}\n`;
				groupTasks.slice(0, 10).forEach((task) => {
					const checkbox = task.completed ? "[x]" : "[ ]";
					const dueDate = task.dueDate
						? new Date(task.dueDate).toLocaleDateString()
						: "";
					const due = task.dueDate ? ` (due: ${dueDate})` : "";
					const priority = task.priority ? ` [${task.priority}]` : "";
					const file = task.filePath ? ` [[${task.filePath}]]` : "";

					response += `- ${checkbox} ${task.content}${priority}${due}${file}\n`;
				});
				if (groupTasks.length > 10) {
					response += `... and ${groupTasks.length - 10} more\n`;
				}
				response += "\n";
			}
		}

		// Add context-aware suggestions
		if (this.plugin.aiProvider) {
			response += await this.plugin.aiProvider.answerQuestion(
				`Based on these tasks, what should I prioritize?`,
				response + "\n" + context
			);
		}

		return response;
	}

	private async handleGoalQuery(
		message: string,
		context: string
	): Promise<string> {
		const goals = this.plugin.goalEngine?.getGoals() || [];

		let response = `## Your Goals\n\n`;

		if (goals.length === 0) {
			response += `No goals found. Try adding goals to your notes using:\n`;
			response += `- Frontmatter: \`goal: "Your goal"\`\n`;
			response += `- Headings: \`## Goal: Your goal\`\n`;
			response += `- Tags: \`#goal/your-goal\`\n`;
		} else {
			response += `You have **${goals.length}** goals:\n\n`;

			// Sort by progress
			const sorted = goals.sort((a, b) => b.progress - a.progress);

			sorted.forEach((goal) => {
				const progressBar = this.createProgressBar(goal.progress);
				const status =
					goal.status === "completed"
						? "[COMPLETED]"
						: goal.status === "active"
						? "[ACTIVE]"
						: "[PAUSED]";
				const file = goal.filePath ? ` [[${goal.filePath}]]` : "";

				response += `${status} **${goal.title}**${file}\n`;
				response += `Progress: ${progressBar} ${goal.progress}%\n`;

				if (goal.targetDate) {
					const days = Math.ceil(
						(new Date(goal.targetDate).getTime() - Date.now()) /
							(1000 * 60 * 60 * 24)
					);
					response += `Target: ${new Date(
						goal.targetDate
					).toLocaleDateString()} (${days} days)\n`;
				}

				if (goal.milestones?.length > 0) {
					const completed = goal.milestones.filter(
						(m) => m.completed
					).length;
					response += `Milestones: ${completed}/${goal.milestones.length} completed\n`;
				}

				response += "\n";
			});

			// Add AI insights
			if (this.plugin.aiProvider) {
				response += "\n### Insights\n";
				response += await this.plugin.aiProvider.answerQuestion(
					"Based on these goals and their progress, what recommendations do you have?",
					response + "\n" + context
				);
			}
		}

		return response;
	}

	private async handleNoteSearch(
		message: string,
		searchResults: Array<{ path: string; title: string }>,
		context: string
	): Promise<string> {
		// Check if user is asking for specific note content
		const specificNotePatterns = [
			/(?:read|show|get|find|open|content of|from|in|view)\s+(?:the\s+)?(?:note|file|document)?\s*(?:about|on|for)?\s*['""]?([^'""\n]+)['""]?/i,
			/what['']?s?\s+(?:in|inside)\s+(?:the\s+)?['""]?([^'""\n]+)['""]?/i,
			/(?:what|help)\s+.*?(?:added|wrote|put)\s+(?:in|to)\s+['""]?([^'""\n]+)['""]?\s*(?:note|notes)?/i,
			/help\s+.*?(?:read|to\s+read)\s+['""]?([^'""\n]+)['""]?\s*(?:note|notes)?/i, // For "help me to read X note"
			/['""]([^'""\n]+)['""]?\s+(?:note|file|document)/i,
		];

		let targetNote: string | null = null;
		for (const pattern of specificNotePatterns) {
			const match = message.match(pattern);
			if (match) {
				targetNote = match[1]
					.trim()
					.replace(/\.md$/i, "")
					.replace(/\s+notes?$/i, "")
					.replace(/\s+content$/i, "");
				console.debug(
					`VaultMind: Detected note request for "${targetNote}"`
				);
				break;
			}
		}

		if (targetNote) {
			// Look for exact or close match
			const allFiles = this.plugin.app.vault.getMarkdownFiles();

			// Clean up the target note name for better matching
			const cleanTarget = targetNote
				.toLowerCase()
				.replace(/\s+note(s)?$/i, "") // Remove "note" or "notes" at end
				.replace(/^the\s+/i, "") // Remove "the" at beginning
				.trim();

			// Try exact match first
			const exactMatch = allFiles.find((f) => {
				const fileName = f.basename.toLowerCase();
				return fileName === cleanTarget;
			});

			if (exactMatch) {
				const content = await this.plugin.app.vault.read(exactMatch);
				return `## Content of [[${exactMatch.path}]]\n\n${content}`;
			}

			// Try fuzzy match for notes with similar names
			const normalizeStr = (str: string) => {
				return str
					.toLowerCase()
					.replace(/[-_]/g, " ") // Replace hyphens and underscores with spaces
					.replace(/\s+/g, " ") // Normalize multiple spaces
					.trim();
			};

			const normalizedTarget = normalizeStr(cleanTarget);

			// Try normalized exact match
			const normalizedMatch = allFiles.find((f) => {
				const fileName = normalizeStr(f.basename);
				return fileName === normalizedTarget;
			});

			if (normalizedMatch) {
				const content = await this.plugin.app.vault.read(
					normalizedMatch
				);
				return `## Content of [[${normalizedMatch.path}]]\n\n${content}`;
			}

			// Try partial match (contains the target string)
			const partialMatches = allFiles.filter((f) => {
				const fileName = normalizeStr(f.basename);
				// Check both ways - if filename contains query or query contains filename
				return (
					fileName.includes(normalizedTarget) ||
					normalizedTarget.includes(fileName)
				);
			});

			if (partialMatches.length === 1) {
				const content = await this.plugin.app.vault.read(
					partialMatches[0]
				);
				return `## Content of [[${partialMatches[0].path}]]\n\n${content}`;
			}

			if (partialMatches.length > 1) {
				let response = `## Found ${partialMatches.length} notes matching "${targetNote}":\n\n`;
				for (const file of partialMatches.slice(0, 5)) {
					const content = await this.plugin.app.vault.read(file);
					const snippet = content.substring(0, 150);
					response += `### [[${file.path}]]\n${snippet}...\n\n`;
				}
				response +=
					"\nWhich note did you mean? Please be more specific.";
				return response;
			}
		}

		// General search results
		let response = `## Search Results\n\n`;

		if (searchResults.length === 0) {
			console.debug(
				`VaultMind: No search results for query "${message}"`
			);
			// Try one more fallback - direct file search
			const allFiles = this.plugin.app.vault.getMarkdownFiles();
			const queryLower = message.toLowerCase();
			const fallbackResults = allFiles
				.filter((f) => {
					const fileName = f.basename.toLowerCase();
					return (
						fileName.includes(queryLower) ||
						queryLower.includes(fileName)
					);
				})
				.slice(0, 5);

			if (fallbackResults.length > 0) {
				response += `Found ${fallbackResults.length} potentially relevant notes:\n\n`;
				for (const file of fallbackResults) {
					response += `• [[${file.path}]]\n`;
				}
				response +=
					"\nTry clicking on one of these notes or be more specific with your query.";
			} else {
				response += "No notes found matching your query.\n";
			}
		} else {
			response += `Found **${searchResults.length}** relevant notes:\n\n`;

			for (const result of searchResults.slice(0, 10)) {
				// Make clickable link
				response += `• [[${result.path}|${result.title}]]\n`;

				// Add snippet if available
				const file = this.plugin.app.vault.getAbstractFileByPath(
					result.path
				);
				if (file instanceof TFile) {
					try {
						const content = await this.plugin.app.vault.read(file);
						const snippet = this.extractRelevantSnippet(
							content,
							message
						);
						if (snippet) {
							response += `  > ${snippet}\n`;
						}
					} catch (error) {
						console.error("Failed to read file:", result.path);
					}
				}
				response += "\n";
			}

			if (searchResults.length > 10) {
				response += `... and ${
					searchResults.length - 10
				} more results\n`;
			}
		}

		return response;
	}

	private async handleSummarization(
		message: string,
		context: string
	): Promise<string> {
		if (this.attachedNotes.length > 0) {
			// Summarize attached notes
			const contents = await Promise.all(
				this.attachedNotes
					.slice(0, 5)
					.map((f) => this.plugin.app.vault.read(f))
			);

			const combined = contents.join("\n\n---\n\n");
			if (this.plugin.aiProvider) {
				return await this.plugin.aiProvider.generateSummary(combined, {
					style: "detailed",
					maxLength: 800,
				});
			} else {
				return "AI provider not configured";
			}
		} else {
			// Provide vault overview
			return await this.generateVaultSummary();
		}
	}

	private async searchNotes(
		query: string
	): Promise<Array<{ path: string; title: string }>> {
		// Ensure vaultIndexer is available
		if (!this.plugin.vaultIndexer) {
			console.warn(
				"VaultMind: VaultIndexer not initialized, using fallback"
			);
			// Fallback to direct vault search
			const files = this.plugin.app.vault.getMarkdownFiles();
			const queryLower = query.toLowerCase();
			return files
				.filter((f) => f.basename.toLowerCase().includes(queryLower))
				.map((f) => ({
					path: f.path,
					title: f.basename,
				}));
		}

		// Use the search method from VaultIndexer
		try {
			const searchResults = await this.plugin.vaultIndexer.search(query);
			return searchResults.map((note) => ({
				path: note.filePath || "",
				title:
					note.title ||
					note.filePath?.split("/").pop()?.replace(".md", "") ||
					"Untitled",
			}));
		} catch (error) {
			console.warn("VaultMind: Search failed, using fallback", error);
			// Fallback to getting all notes from index
			const index = this.plugin.vaultIndexer.getIndex();
			const indexedNotes = Array.from(index?.notes?.values() || []);

			if (!indexedNotes || indexedNotes.length === 0) {
				// Final fallback to direct vault search
				const files = this.plugin.app.vault.getMarkdownFiles();
				return files.map((f) => ({
					path: f.path,
					title: f.basename,
				}));
			}

			const queryLower = query.toLowerCase();

			// Score and rank notes
			const scored = indexedNotes
				.map((note) => {
					let score = 0;
					const title = (note.title || "").toLowerCase();
					const content = (note.content || "").toLowerCase();

					// Title match is worth more
					if (title.includes(queryLower)) score += 10;

					// Count content matches
					const contentMatches = (
						content.match(new RegExp(queryLower, "gi")) || []
					).length;
					score += Math.min(contentMatches, 5);

					return { note, score };
				})
				.filter((item) => item.score > 0)
				.sort((a, b) => b.score - a.score)
				.slice(0, 20);

			return scored.map((item) => ({
				path: item.note.filePath || "",
				title:
					item.note.title ||
					item.note.filePath?.split("/").pop()?.replace(".md", "") ||
					"Untitled",
			}));
		}
	}

	private async buildComprehensiveContext(query: string): Promise<string> {
		// Use ContextManager for smart context building
		if (!this.plugin.vaultIndexer) {
			// Fallback context without indexer
			return `User query: ${query}\n\nAttached files: ${this.attachedNotes
				.map((n) => n.basename)
				.join(", ")}`;
		}

		const index = this.plugin.vaultIndexer.getIndex();
		const allNotes = Array.from(index?.notes?.values() || []);

		let context = await this.contextManager.buildContext(
			query,
			this.attachedNotes,
			this.includeAllNotes ? allNotes : allNotes.slice(0, 100),
			this.plugin.app.vault
		);

		// Add tasks if enabled
		if (this.includeTasks) {
			const tasks = this.plugin.taskEngine?.getTasks() || [];
			const pending = tasks.filter((t) => !t.completed).length;
			const overdue = tasks.filter(
				(t) =>
					t.dueDate &&
					new Date(t.dueDate) < new Date() &&
					!t.completed
			).length;

			context += `\n\n=== TASKS CONTEXT ===\n`;
			context += `Total: ${tasks.length} | Pending: ${pending} | Overdue: ${overdue}\n`;
		}

		// Add goals if enabled
		if (this.includeGoals) {
			const goals = this.plugin.goalEngine?.getGoals() || [];
			const active = goals.filter((g) => g.status === "active").length;

			context += `\n=== GOALS CONTEXT ===\n`;
			context += `Total: ${goals.length} | Active: ${active}\n`;
		}

		return context;
	}

	private groupTasks(
		tasks: VaultMindTask[]
	): Record<string, VaultMindTask[]> {
		const groups: Record<string, VaultMindTask[]> = {};

		tasks.forEach((task) => {
			let group = "Other";

			if (task.dueDate) {
				const due = new Date(task.dueDate);
				const today = new Date();
				const diff = Math.ceil(
					(due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
				);

				if (diff < 0) group = "Overdue";
				else if (diff === 0) group = "Today";
				else if (diff === 1) group = "Tomorrow";
				else if (diff <= 7) group = "This Week";
				else group = "Future";
			} else if (task.priority === "high") {
				group = "High Priority";
			} else if (task.priority === "medium") {
				group = "Medium Priority";
			}

			if (!groups[group]) groups[group] = [];
			groups[group].push(task);
		});

		return groups;
	}

	private createProgressBar(progress: number): string {
		const filled = Math.round(progress / 10);
		const empty = 10 - filled;
		return "█".repeat(filled) + "░".repeat(empty);
	}

	private extractRelevantSnippet(content: string, query: string): string {
		const sentences = content.match(/[^.!?]+[.!?]+/g) || [];
		const queryWords = query
			.toLowerCase()
			.split(/\s+/)
			.filter((w) => w.length > 3);

		for (const sentence of sentences) {
			const sentLower = sentence.toLowerCase();
			if (queryWords.some((word) => sentLower.includes(word))) {
				return sentence.trim().substring(0, 150) + "...";
			}
		}

		return content.substring(0, 150) + "...";
	}

	private generateVaultSummary(): string {
		const notes = Array.from(
			this.plugin.vaultIndexer.getIndex().notes.values()
		);
		const tasks = this.plugin.taskEngine?.getTasks() || [];
		const goals = this.plugin.goalEngine?.getGoals() || [];

		let summary = `# Vault Summary\n\n`;
		summary += `## 📊 Statistics\n`;
		summary += `• **Notes**: ${notes.length} total\n`;
		summary += `• **Tasks**: ${tasks.length} (${
			tasks.filter((t) => !t.completed).length
		} pending)\n`;
		summary += `• **Goals**: ${goals.length} (${
			goals.filter((g) => g.status === "active").length
		} active)\n`;
		summary += `• **Total Words**: ${notes
			.reduce((sum, n) => sum + n.wordCount, 0)
			.toLocaleString()}\n\n`;

		// Recent activity
		const recent = notes
			.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime())
			.slice(0, 5);

		summary += `## 📝 Recently Modified\n`;
		recent.forEach((note) => {
			summary += `• [[${note.filePath}|${
				note.title
			}]] - ${note.lastModified.toLocaleDateString()}\n`;
		});

		return summary;
	}

	private openAdvancedAttachModal() {
		const modal = new AdvancedAttachModal(
			this.plugin.app,
			this.plugin,
			(files, folders) => {
				this.attachedNotes = files;
				this.attachedFolders = folders;
				this.updateContextIndicator();
				new Notice(
					`Attached ${files.length} files and ${folders.length} folders`
				);
			}
		);
		modal.open();
	}

	private openSearchModal() {
		const modal = new VaultSearchModal(
			this.plugin.app,
			this.plugin,
			async (query) => {
				const results = await this.searchNotes(query);
				const files = results
					.map((r) =>
						this.plugin.app.vault.getAbstractFileByPath(r.path)
					)
					.filter((f): f is TFile => f instanceof TFile);

				this.attachedNotes = [...this.attachedNotes, ...files];
				this.updateContextIndicator();
				new Notice(`Found and attached ${files.length} relevant notes`);
			}
		);
		modal.open();
	}

	private openContextSettings() {
		const modal = new ContextSettingsModal(
			this.plugin.app,
			{
				includeAllNotes: this.includeAllNotes,
				includeTasks: this.includeTasks,
				includeGoals: this.includeGoals,
			},
			(settings) => {
				this.includeAllNotes = settings.includeAllNotes;
				this.includeTasks = settings.includeTasks;
				this.includeGoals = settings.includeGoals;
				this.updateContextIndicator();
			}
		);
		modal.open();
	}

	private updateContextIndicator() {
		this.contextEl.empty();

		const items = [];

		if (this.includeAllNotes) {
			items.push("All Notes");
		} else if (this.attachedNotes.length > 0) {
			items.push(`${this.attachedNotes.length} notes`);
		}

		if (this.attachedFolders.length > 0) {
			items.push(`${this.attachedFolders.length} folders`);
		}

		if (this.includeTasks) {
			items.push("Tasks");
		}

		if (this.includeGoals) {
			items.push("Goals");
		}

		if (items.length > 0) {
			this.contextEl.createEl("div", {
				text: `Context: ${items.join(" • ")}`,
				cls: "context-summary",
			});
		} else {
			this.contextEl.createEl("div", {
				text: "No specific context attached (searching entire vault)",
				cls: "context-summary muted",
			});
		}
	}

	private async addMessage(message: ChatMessage, skipPush: boolean = false) {
		if (!skipPush) {
			this.messages.push(message);
		}

		const messageEl = this.messagesEl.createEl("div", {
			cls: `vaultmind-chat-message ${message.role}`,
		});

		// Add timestamp
		const timeString = message.timestamp.toLocaleTimeString("en-US", {
			hour: "2-digit",
			minute: "2-digit",
		});
		messageEl.createEl("div", {
			cls: "message-time",
			text: timeString,
		});

		// Add content with markdown rendering
		const contentEl = messageEl.createEl("div", {
			cls: "message-content",
		});

		// Render content
		if (message.role === "assistant") {
			// For assistant messages, render as markdown
			await MarkdownRenderer.render(
				this.plugin.app,
				message.content,
				contentEl,
				"",
				this
			);

			// Make internal links clickable
			contentEl.findAll(".internal-link").forEach((link) => {
				link.addEventListener("click", (e) => {
					e.preventDefault();
					const href = link.getAttribute("href");
					if (href) {
						const file =
							this.plugin.app.metadataCache.getFirstLinkpathDest(
								href,
								""
							);
						if (file) {
							this.plugin.app.workspace.openLinkText(
								href,
								"",
								false
							);
						}
					}
				});
			});
		} else {
			contentEl.setText(message.content);
		}

		// Add context info if present
		if (message.context) {
			const contextEl = messageEl.createEl("div", {
				cls: "message-context-info",
			});

			const items = [];
			if (message.context.files?.length) {
				items.push(`${message.context.files.length} files`);
			}
			if (message.context.tasks) {
				items.push(`${message.context.tasks} tasks`);
			}
			if (message.context.goals) {
				items.push(`${message.context.goals} goals`);
			}
			if (message.context.searchResults?.length) {
				items.push(
					`${message.context.searchResults.length} search results`
				);
			}

			if (items.length > 0) {
				contextEl.setText(`Context used: ${items.join(", ")}`);
			}
		}

		// Scroll to bottom
		this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
	}

	private setProcessing(processing: boolean) {
		this.isProcessing = processing;
		this.inputEl.disabled = processing;
		this.sendBtn.disabled = processing;

		if (processing) {
			this.sendBtn.textContent = "Thinking...";
			this.sendBtn.addClass("processing");
		} else {
			this.sendBtn.textContent = "Send";
			this.sendBtn.removeClass("processing");
		}
	}

	// Session management
	private loadSessions() {
		const saved = this.plugin.app.loadLocalStorage(
			"vaultmind-chat-sessions"
		);
		if (saved) {
			try {
				const data = JSON.parse(saved);
				// Convert date strings back to Date objects
				this.sessions = new Map(
					Object.entries(data).map(
						([id, session]: [
							string,
							{
								id: string;
								title: string;
								messages: {
									role: string;
									content: string;
									timestamp: string | Date;
								}[];
								createdAt: string | Date;
								updatedAt: string | Date;
							}
						]) => {
							return [
								id,
								{
									...session,
									createdAt: new Date(session.createdAt),
									updatedAt: new Date(session.updatedAt),
									messages: (session.messages || []).map(
										(msg: {
											role: string;
											content: string;
											timestamp: string | Date;
										}) => ({
											role: msg.role as
												| "user"
												| "assistant"
												| "system",
											content: msg.content,
											timestamp: new Date(msg.timestamp),
										})
									),
								} as ChatSession,
							];
						}
					)
				);
			} catch (error) {
				console.error("Failed to load chat sessions:", error);
				this.sessions = new Map();
			}
		}
	}

	private saveSessions() {
		const data = Object.fromEntries(this.sessions);
		this.plugin.app.saveLocalStorage(
			"vaultmind-chat-sessions",
			JSON.stringify(data)
		);
	}

	private createNewSession() {
		const id = `session-${Date.now()}`;
		const session: ChatSession = {
			id,
			title: `New Chat`, // Will be updated with first message
			messages: [],
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		this.sessions.set(id, session);
		this.currentSessionId = id;
		this.messages = [];
		this.saveSessions();

		// Clear messages and show welcome immediately
		if (this.messagesEl) {
			this.messagesEl.empty();
			this.addWelcomeMessage();
		}

		if (this.sessionSelectEl) {
			this.updateSessionSelector();
		}
	}

	private deleteCurrentSession() {
		if (!this.currentSessionId) return;

		const session = this.sessions.get(this.currentSessionId);
		new ConfirmModal(
			this.plugin.app,
			`Delete "${session?.title || "Untitled"}"?`,
			() => {
				// Delete the session
				this.sessions.delete(this.currentSessionId);
				this.saveSessions();

				// Switch to another session or create new
				if (this.sessions.size > 0) {
					const nextSession = Array.from(this.sessions.keys())[0];
					this.switchSession(nextSession);
				} else {
					this.createNewSession();
				}
			},
			"Delete",
			"Cancel"
		).open();
	}

	private clearAllSessions() {
		if (this.sessions.size === 0) {
			new Notice("No sessions to clear");
			return;
		}

		new ConfirmModal(
			this.plugin.app,
			`Clear all ${this.sessions.size} chat sessions?`,
			() => {
				this.sessions.clear();
				this.saveSessions();
				this.createNewSession();
				new Notice("All chat sessions cleared");
			},
			"Clear All",
			"Cancel"
		).open();
	}

	private async switchSession(sessionId: string) {
		if (this.sessions.has(sessionId)) {
			this.saveCurrentSession();
			this.currentSessionId = sessionId;
			await this.loadCurrentSession();
		}
	}

	private async loadCurrentSession() {
		const session = this.sessions.get(this.currentSessionId);
		if (session) {
			this.messages = session.messages;
			this.messagesEl?.empty();

			if (this.messages.length === 0) {
				// Show welcome message if session is empty
				await this.addWelcomeMessage();
			} else {
				// Show existing messages (skip pushing since they're already in the array)
				for (const msg of this.messages) {
					await this.addMessage(msg, true);
				}
			}
		}
	}

	private saveCurrentSession() {
		const session = this.sessions.get(this.currentSessionId);
		if (session) {
			session.messages = this.messages;
			session.updatedAt = new Date();

			// Update session title with first user message if still default
			if (session.title === "New Chat" && this.messages.length > 0) {
				const firstUserMessage = this.messages.find(
					(m) => m.role === "user"
				);
				if (firstUserMessage) {
					// Take first 50 chars of the message as title
					const content = firstUserMessage.content.substring(0, 50);
					session.title =
						content.length < firstUserMessage.content.length
							? content + "..."
							: content;
				}
			}

			this.saveSessions();
			if (this.sessionSelectEl) {
				this.updateSessionSelector();
			}
		}
	}

	private getTimeAgo(date: Date | string): string {
		const now = new Date();
		const then = date instanceof Date ? date : new Date(date);
		const diff = now.getTime() - then.getTime();

		const minutes = Math.floor(diff / 60000);
		const hours = Math.floor(diff / 3600000);
		const days = Math.floor(diff / 86400000);

		if (minutes < 1) return "just now";
		if (minutes < 60) return `${minutes}m ago`;
		if (hours < 24) return `${hours}h ago`;
		if (days < 7) return `${days}d ago`;

		return then.toLocaleDateString();
	}

	private clearCurrentSession() {
		this.messages = [];
		this.messagesEl.empty();
		this.addWelcomeMessage();
		this.saveCurrentSession();
	}

	private updateSessionSelector() {
		if (!this.sessionSelectEl) return;

		this.sessionSelectEl.empty();

		// Filter and sort valid sessions
		const validSessions = Array.from(this.sessions.values())
			.filter((s) => s && s.updatedAt && s.id) // Filter out corrupted sessions
			.sort((a, b) => {
				try {
					const aTime =
						a.updatedAt instanceof Date
							? a.updatedAt.getTime()
							: new Date(a.updatedAt).getTime();
					const bTime =
						b.updatedAt instanceof Date
							? b.updatedAt.getTime()
							: new Date(b.updatedAt).getTime();
					return bTime - aTime;
				} catch {
					return 0;
				}
			});

		// Add placeholder if no sessions
		if (validSessions.length === 0) {
			this.sessionSelectEl.createEl("option", {
				text: "No chat sessions",
				value: "",
				attr: { disabled: "true" },
			});
		} else {
			validSessions.forEach((session, index) => {
				const messageCount = session.messages?.length || 0;
				const timeAgo = this.getTimeAgo(session.updatedAt);
				const title = session.title || "Untitled";

				// Truncate long titles
				const displayTitle =
					title.length > 30 ? title.substring(0, 30) + "..." : title;
				const displayText = `${displayTitle} (${messageCount} msg${
					messageCount !== 1 ? "s" : ""
				}) • ${timeAgo}`;

				const option = this.sessionSelectEl.createEl("option", {
					text: displayText,
					value: session.id,
				});

				if (session.id === this.currentSessionId) {
					option.selected = true;
				}
			});
		}
	}

	setInitialMessage(message: string) {
		if (this.inputEl && message) {
			this.inputEl.value = message;
			this.inputEl.focus();
		}
	}

	onClose(): Promise<void> {
		this.saveCurrentSession();
		return Promise.resolve();
	}
}

// Modal for advanced attachment
class AdvancedAttachModal extends Modal {
	private plugin: VaultMindPlugin;
	private onSelect: (files: TFile[], folders: TFolder[]) => void;
	private selectedFiles: Set<TFile> = new Set();
	private selectedFolders: Set<TFolder> = new Set();

	constructor(
		app: App,
		plugin: VaultMindPlugin,
		onSelect: (files: TFile[], folders: TFolder[]) => void
	) {
		super(app);
		this.plugin = plugin;
		this.onSelect = onSelect;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: "Attach files & folders" });

		// Search input
		const searchContainer = contentEl.createEl("div", {
			cls: "search-container",
		});
		const searchInput = searchContainer.createEl("input", {
			type: "text",
			placeholder: "Search for files or folders...",
			cls: "search-input",
		});

		// Tab buttons
		const tabContainer = contentEl.createEl("div", {
			cls: "tab-container",
		});
		const filesTab = tabContainer.createEl("button", {
			text: "Files",
			cls: "tab-button active",
		});
		const foldersTab = tabContainer.createEl("button", {
			text: "Folders",
			cls: "tab-button",
		});
		const recentTab = tabContainer.createEl("button", {
			text: "Recent",
			cls: "tab-button",
		});

		// Content container
		const contentContainer = contentEl.createEl("div", {
			cls: "content-container",
		});

		// Files view
		const filesView = contentContainer.createEl("div", {
			cls: "tab-content active",
		});
		const fileList = filesView.createEl("div", { cls: "file-list" });

		// Folders view
		const foldersView = contentContainer.createEl("div", {
			cls: "tab-content",
		});
		const folderList = foldersView.createEl("div", { cls: "folder-list" });

		// Recent view
		const recentView = contentContainer.createEl("div", {
			cls: "tab-content",
		});
		const recentList = recentView.createEl("div", { cls: "file-list" });

		// Tab switching
		const switchTab = (
			activeTab: HTMLButtonElement,
			activeView: HTMLElement
		) => {
			[filesTab, foldersTab, recentTab].forEach((tab) =>
				tab.removeClass("active")
			);
			[filesView, foldersView, recentView].forEach((view) =>
				view.removeClass("active")
			);
			activeTab.addClass("active");
			activeView.addClass("active");
		};

		filesTab.addEventListener("click", () =>
			switchTab(filesTab, filesView)
		);
		foldersTab.addEventListener("click", () =>
			switchTab(foldersTab, foldersView)
		);
		recentTab.addEventListener("click", () =>
			switchTab(recentTab, recentView)
		);

		// Load all files
		const allFiles = this.app.vault.getMarkdownFiles();
		let filteredFiles = allFiles;

		// Render files
		const renderFiles = (files: TFile[], container: HTMLElement) => {
			container.empty();
			files.slice(0, 50).forEach((file) => {
				const fileEl = container.createEl("div", {
					cls: "selectable-item",
				});
				const checkbox = fileEl.createEl("input", {
					type: "checkbox",
				}) as HTMLInputElement;
				checkbox.checked = this.selectedFiles.has(file);
				fileEl.createEl("span", { text: file.basename });
				fileEl.createEl("span", {
					text: file.path,
					cls: "file-path",
				});

				checkbox.addEventListener("change", () => {
					if (checkbox.checked) {
						this.selectedFiles.add(file);
					} else {
						this.selectedFiles.delete(file);
					}
					this.updateSelectionCount();
				});

				fileEl.addEventListener("click", (e) => {
					if (e.target !== checkbox) {
						checkbox.checked = !checkbox.checked;
						checkbox.dispatchEvent(new Event("change"));
					}
				});
			});
		};

		// Render folders
		const renderFolders = () => {
			folderList.empty();
			const folders = this.getAllFolders();
			folders.forEach((folder) => {
				const folderEl = folderList.createEl("div", {
					cls: "selectable-item",
				});
				const checkbox = folderEl.createEl("input", {
					type: "checkbox",
				}) as HTMLInputElement;
				checkbox.checked = this.selectedFolders.has(folder);
				folderEl.createEl("span", { text: folder.path });

				checkbox.addEventListener("change", () => {
					if (checkbox.checked) {
						this.selectedFolders.add(folder);
					} else {
						this.selectedFolders.delete(folder);
					}
					this.updateSelectionCount();
				});

				folderEl.addEventListener("click", (e) => {
					if (e.target !== checkbox) {
						checkbox.checked = !checkbox.checked;
						checkbox.dispatchEvent(new Event("change"));
					}
				});
			});
		};

		// Initial render
		renderFiles(allFiles, fileList);
		renderFolders();
		renderFiles(
			allFiles.sort((a, b) => b.stat.mtime - a.stat.mtime).slice(0, 20),
			recentList
		);

		// Search functionality
		searchInput.addEventListener("input", () => {
			const query = searchInput.value.toLowerCase();
			if (query) {
				filteredFiles = allFiles.filter(
					(file) =>
						file.basename.toLowerCase().includes(query) ||
						file.path.toLowerCase().includes(query)
				);
			} else {
				filteredFiles = allFiles;
			}
			renderFiles(filteredFiles, fileList);
		});

		// Selection count
		const selectionInfo = contentEl.createEl("div", {
			cls: "selection-info",
		});
		this.updateSelectionCount = () => {
			const count = this.selectedFiles.size + this.selectedFolders.size;
			selectionInfo.textContent =
				count > 0 ? `${count} items selected` : "";
		};

		// Buttons
		const buttonContainer = contentEl.createEl("div", {
			cls: "modal-button-container",
		});

		const attachBtn = buttonContainer.createEl("button", {
			text: "Attach selected",
			cls: "mod-cta",
		});

		attachBtn.addEventListener("click", () => {
			this.onSelect(
				Array.from(this.selectedFiles),
				Array.from(this.selectedFolders)
			);
			this.close();
		});

		const cancelBtn = buttonContainer.createEl("button", {
			text: "Cancel",
		});
		cancelBtn.addEventListener("click", () => this.close());
	}

	private updateSelectionCount: () => void = () => {};

	private getAllFolders(): TFolder[] {
		const folders: TFolder[] = [];

		const addFolder = (folder: TFolder) => {
			folders.push(folder);
			folder.children.forEach((child) => {
				if (child instanceof TFolder) {
					addFolder(child);
				}
			});
		};

		this.app.vault.getRoot().children.forEach((child) => {
			if (child instanceof TFolder) {
				addFolder(child);
			}
		});

		return folders;
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

// Search modal
class VaultSearchModal extends Modal {
	private plugin: VaultMindPlugin;
	private onSearch: (query: string) => Promise<void>;

	constructor(
		app: App,
		plugin: VaultMindPlugin,
		onSearch: (query: string) => Promise<void>
	) {
		super(app);
		this.plugin = plugin;
		this.onSearch = onSearch;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: "Search vault" });

		const searchInput = contentEl.createEl("input", {
			type: "text",
			placeholder: "Enter search terms...",
			cls: "search-input",
		});

		searchInput.focus();

		searchInput.addEventListener("keypress", async (e) => {
			if (e.key === "Enter") {
				const query = searchInput.value.trim();
				if (query) {
					await this.onSearch(query);
					this.close();
				}
			}
		});

		const buttonContainer = contentEl.createEl("div", {
			cls: "modal-button-container",
		});

		const searchBtn = buttonContainer.createEl("button", {
			text: "Search & attach",
			cls: "mod-cta",
		});

		searchBtn.addEventListener("click", async () => {
			const query = searchInput.value.trim();
			if (query) {
				await this.onSearch(query);
				this.close();
			}
		});

		const cancelBtn = buttonContainer.createEl("button", {
			text: "Cancel",
		});
		cancelBtn.addEventListener("click", () => this.close());
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

// Context settings modal
class ContextSettingsModal extends Modal {
	private settings: {
		includeAllNotes: boolean;
		includeTasks: boolean;
		includeGoals: boolean;
	};
	private onSave: (settings: {
		includeAllNotes: boolean;
		includeTasks: boolean;
		includeGoals: boolean;
	}) => void;

	constructor(
		app: App,
		settings: {
			includeAllNotes: boolean;
			includeTasks: boolean;
			includeGoals: boolean;
		},
		onSave: (settings: {
			includeAllNotes: boolean;
			includeTasks: boolean;
			includeGoals: boolean;
		}) => void
	) {
		super(app);
		this.settings = { ...settings };
		this.onSave = onSave;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: "Context settings" });

		new Setting(contentEl)
			.setName("Include all notes")
			.setDesc(
				"Give AI access to entire vault (may be slow for large vaults)"
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.settings.includeAllNotes)
					.onChange((value) => {
						this.settings.includeAllNotes = value;
					})
			);

		new Setting(contentEl)
			.setName("Include tasks")
			.setDesc("Give AI access to all tasks")
			.addToggle((toggle) =>
				toggle
					.setValue(this.settings.includeTasks)
					.onChange((value) => {
						this.settings.includeTasks = value;
					})
			);

		new Setting(contentEl)
			.setName("Include goals")
			.setDesc("Give AI access to all goals")
			.addToggle((toggle) =>
				toggle
					.setValue(this.settings.includeGoals)
					.onChange((value) => {
						this.settings.includeGoals = value;
					})
			);

		const buttonContainer = contentEl.createEl("div", {
			cls: "modal-button-container",
		});

		const saveBtn = buttonContainer.createEl("button", {
			text: "Save",
			cls: "mod-cta",
		});

		saveBtn.addEventListener("click", () => {
			this.onSave(this.settings);
			this.close();
		});

		const cancelBtn = buttonContainer.createEl("button", {
			text: "Cancel",
		});
		cancelBtn.addEventListener("click", () => this.close());
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
