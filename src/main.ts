import { Plugin, Notice, WorkspaceLeaf, Menu } from "obsidian";
import { VaultMindSettings, DEFAULT_SETTINGS, AIProvider } from "./types";
import { VaultIndexer } from "./core/VaultIndexer";
import { TaskEngine } from "./core/TaskEngine";
import { GoalEngine } from "./core/GoalEngine";
import { TimeTracker } from "./core/TimeTracker";
import { DashboardView, VIEW_TYPE_DASHBOARD } from "./ui/DashboardView";
import { AdvancedChatView, CHAT_VIEW_TYPE } from "./ui/AdvancedChatView";
import { BetterSettingsTab } from "./ui/BetterSettingsTab";
import { NotificationService } from "./services/NotificationService";
import { Scheduler } from "./core/Scheduler";
import { AIManager } from "./ai/AIManager";

export default class VaultMindPlugin extends Plugin {
	settings: VaultMindSettings;

	// Core services
	vaultIndexer: VaultIndexer;
	taskEngine: TaskEngine;
	goalEngine: GoalEngine;
	timeTracker: TimeTracker;
	notificationService: NotificationService;
	scheduler: Scheduler;
	ai: AIProvider | null = null; // AI provider instance
	aiProvider: AIProvider | null = null; // AI provider for chat
	aiManager: AIManager | null = null; // AI Manager for hot-swappable providers

	// UI elements
	statusBarItem: HTMLElement | null = null;
	ribbonIcon: HTMLElement | null = null;

	async onload() {
		// Loading plugin

		// Load settings first
		await this.loadSettings();

		// Register the dashboard view
		this.registerView(
			VIEW_TYPE_DASHBOARD,
			(leaf) => new DashboardView(leaf, this)
		);

		// Register the chat view
		this.registerView(
			CHAT_VIEW_TYPE,
			(leaf) => new AdvancedChatView(leaf, this)
		);

		// Register commands first (lightweight)
		this.registerCommands();

		// Add settings tab with better UX
		this.addSettingTab(new BetterSettingsTab(this.app, this));

		// Defer services initialization to not block startup
		void (async () => {
			// Initialize core services
			await this.initializeServices();

			// Register additional commands
			const { registerCommands } = await import("./commands");
			registerCommands(this);
		})();

		// Delay ribbon icons to ensure workspace is ready
		// This matches how other successful plugins do it
		this.app.workspace.onLayoutReady(() => {
			setTimeout(() => {
				// Dashboard icon
				this.ribbonIcon = this.addRibbonIcon(
					"brain",
					"Open dashboard",
					async () => {
						await this.openDashboard();
					}
				);
				this.ribbonIcon.addClass("vaultmind-ribbon-icon");

				// Chat icon
				const chatIcon = this.addRibbonIcon(
					"message-circle",
					"Open AI chat",
					async () => {
						await this.openChat();
					}
				);
				chatIcon.addClass("vaultmind-chat-icon");

				// Ribbon icons added
			}, 100);
		});

		// Add status bar
		if (this.settings.showStatusBar !== false) {
			this.addStatusBar();
		}

		// Auto-index vault on startup (delayed more to not slow startup)
		// Use requestIdleCallback for better performance
		const scheduleIndexing = () => {
			if ("requestIdleCallback" in window) {
				window.requestIdleCallback(
					() => {
						// Ensure services are initialized before indexing
						if (!this.vaultIndexer) {
							// Waiting for services
							setTimeout(scheduleIndexing, 1000);
							return;
						}
						// Auto-indexing vault
						void this.indexVault();
					},
					{ timeout: 10000 }
				);
			} else {
				setTimeout(() => {
					if (!this.vaultIndexer) {
						// Waiting for services
						setTimeout(scheduleIndexing, 1000);
						return;
					}
					// Auto-indexing vault
					void this.indexVault();
				}, 5000);
			}
		};
		scheduleIndexing();

		// Plugin loaded successfully
	}

	onunload(): void {
		// Unloading plugin

		// Stop background services
		if (this.scheduler) {
			this.scheduler.stop();
		}

		// Clean up UI elements
		if (this.statusBarItem) {
			this.statusBarItem.remove();
		}

		// Note: We don't detach leaves to preserve their position
		// when the plugin is reloaded/updated

		// Plugin unloaded
	}

	async loadSettings() {
		const loadedData = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData || {});

		// Ensure critical settings have defaults
		if (this.settings.showRibbonIcon === undefined) {
			this.settings.showRibbonIcon = true;
		}
		if (this.settings.showStatusBar === undefined) {
			this.settings.showStatusBar = true;
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private async initializeServices() {
		try {
			// Initialize vault indexer
			this.vaultIndexer = new VaultIndexer();
			await this.vaultIndexer.initialize(this.app);

			// Initialize task engine
			this.taskEngine = new TaskEngine(this.vaultIndexer);
			await this.taskEngine.initialize(this.app);

			// Initialize goal engine
			this.goalEngine = new GoalEngine(
				this.vaultIndexer,
				this.taskEngine
			);
			await this.goalEngine.initialize(this.app);

			// Initialize time tracker
			this.timeTracker = new TimeTracker();
			await this.timeTracker.initialize(this.app);

			// Initialize notification service
			this.notificationService = new NotificationService();
			await this.notificationService.initialize(this.app);

			// Initialize and start scheduler
			this.scheduler = new Scheduler(this);
			this.scheduler.start();
			// Scheduler activated

			// Initialize AI Manager (hot-swappable, no restart needed)
			this.aiManager = new AIManager(this.app, this.settings);
			this.aiProvider = await this.aiManager.getProvider();
			// AI Manager initialized

			// All services initialized
		} catch {
			// Service initialization failed
			new Notice(
				"Some features may be limited. Please restart Obsidian if issues persist."
			);
		}
	}

	private registerCommands() {
		// Dashboard command
		this.addCommand({
			id: "open-dashboard",
			name: "Open dashboard",
			callback: async () => {
				await this.openDashboard();
			},
		});

		// Index vault command
		this.addCommand({
			id: "index-vault",
			name: "Index vault",
			callback: async () => {
				await this.indexVault();
			},
		});

		// Quick task creation
		this.addCommand({
			id: "quick-task",
			name: "Create quick task",
			editorCallback: (editor) => {
				const selection = editor.getSelection();
				const task = `- [ ] ${selection || "New task"}`;
				editor.replaceSelection(task);
			},
		});

		// Toggle time tracking
		this.addCommand({
			id: "toggle-time-tracking",
			name: "Toggle time tracking",
			callback: async () => {
				if (this.timeTracker) {
					const activeEntry = this.timeTracker.getActiveEntry();
					if (activeEntry) {
						await this.timeTracker.stopTracking();
						new Notice("Time tracking stopped");
					} else {
						await this.timeTracker.startTracking();
						new Notice("Time tracking started");
					}
				}
			},
		});

		// Chat commands
		this.addCommand({
			id: "open-ai-chat",
			name: "Open AI chat",
			callback: async () => {
				await this.openChat();
			},
		});

		this.addCommand({
			id: "ask-ai-about-note",
			name: "Ask AI about current note",
			editorCallback: async (editor, view) => {
				const selection = editor.getSelection() || editor.getValue();
				await this.openChat();
				// Send the selected text to chat
				setTimeout(() => {
					const chatView = this.app.workspace.getLeavesOfType(
						CHAT_VIEW_TYPE
					)[0]?.view as AdvancedChatView;
					if (chatView && chatView.setInitialMessage) {
						chatView.setInitialMessage(selection);
					}
				}, 100);
			},
		});
	}

	private setupRibbonIcon() {
		// Legacy method - kept for compatibility
		// Icon is now added directly in onload()
		if (!this.ribbonIcon) {
			this.ribbonIcon = this.addRibbonIcon(
				"brain",
				"Open dashboard",
				async () => {
					await this.openDashboard();
				}
			);
			this.ribbonIcon.addClass("vaultmind-ribbon-icon");
		}
	}

	private addStatusBar() {
		this.statusBarItem = this.addStatusBarItem();

		// Make status bar clickable - opens dashboard
		this.statusBarItem.addClass("vaultmind-status-bar-clickable");
		this.statusBarItem.addEventListener("click", (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			// Opening dashboard
			void this.openDashboard();
		});

		// Add right-click menu to status bar
		this.statusBarItem.oncontextmenu = (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();

			const menu = new Menu();

		menu.addItem((item) =>
			item
				.setTitle("Open dashboard")
				.setIcon("brain")
				.onClick(async () => {
					await this.openDashboard();
				})
		);

		menu.addItem((item) =>
			item
				.setTitle("Index vault")
				.setIcon("refresh-cw")
				.onClick(async () => {
					await this.indexVault();
				})
		);

		menu.addItem((item) =>
			item
				.setTitle("Open AI chat")
				.setIcon("message-circle")
				.onClick(async () => {
					await this.openChat();
				})
		);

		menu.addSeparator();

		menu.addItem((item) =>
			item
				.setTitle("Start time tracking")
				.setIcon("clock")
				.onClick(async () => {
					if (!this.timeTracker.getActiveEntry()) {
						await this.timeTracker.startTracking(
							"Work Session"
						);
						new Notice("Time tracking started");
						this.updateStatusBar();
					}
				})
		);

		menu.addItem((item) =>
			item
				.setTitle("Stop time tracking")
				.setIcon("clock")
				.onClick(async () => {
					if (this.timeTracker.getActiveEntry()) {
						await this.timeTracker.stopTracking();
						new Notice("Time tracking stopped");
						this.updateStatusBar();
					}
				})
		);

			menu.addSeparator();

			menu.addItem((item) =>
				item
					.setTitle("Settings")
					.setIcon("settings")
					.onClick(() => {
						// Open settings tab
						// @ts-ignore
						this.app.setting.open();
						// @ts-ignore
						this.app.setting.openTabById("vaultmind");
					})
			);

			menu.showAtMouseEvent(e);
		};

		this.updateStatusBar();

		// Update status bar every minute
		this.registerInterval(
			window.setInterval(() => {
				this.updateStatusBar();
			}, 60000)
		);
	}

	private updateStatusBar() {
		if (!this.statusBarItem) return;

		try {
			// Check if time tracking is active
			const activeSession = this.timeTracker?.getActiveEntry();
			if (activeSession) {
				const duration = Math.floor(
					(Date.now() - activeSession.startTime.getTime()) / 60000
				);
				this.statusBarItem.setText(`Time: ${duration}m`);
				this.statusBarItem.setAttr(
					"title",
					"VaultMind: Time tracking active (click for dashboard)"
				);
				return;
			}

			// Show task stats
			const stats = this.taskEngine?.getStatistics();
			if (stats && stats.total > 0) {
				const pending = stats.total - stats.completed;
				if (pending > 0) {
					this.statusBarItem.setText(`Tasks: ${pending}`);
					this.statusBarItem.setAttr(
						"title",
						`VaultMind: ${pending} pending tasks (click for dashboard)`
					);
				} else {
					this.statusBarItem.setText("All tasks done");
					this.statusBarItem.setAttr(
						"title",
						"VaultMind: All tasks completed!"
					);
				}
		} else {
			this.statusBarItem.setText("Ready");
			this.statusBarItem.setAttr(
				"title",
				"Click for dashboard, right-click for menu"
			);
		}
	} catch {
		this.statusBarItem.setText("Ready");
		this.statusBarItem.setAttr(
			"title",
			"Click for dashboard"
		);
	}
	}

	async openChat() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(CHAT_VIEW_TYPE);

		if (leaves.length > 0) {
			// Chat view already exists, reveal it
			await workspace.revealLeaf(leaves[0]);
		} else {
			// Create new chat view in right sidebar
			leaf = workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({
					type: CHAT_VIEW_TYPE,
					active: true,
				});
				await workspace.revealLeaf(leaf);
			}
		}
	}

	async openDashboard() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_DASHBOARD);

		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			// Get or create leaf based on user setting
			const position = this.settings.dashboardPosition || "right";
			const targetLeaf =
				position === "left"
					? workspace.getLeftLeaf(false)
					: workspace.getRightLeaf(false);

			if (targetLeaf) {
				leaf = targetLeaf;
				await leaf.setViewState({
					type: VIEW_TYPE_DASHBOARD,
					active: true,
				});
			}
		}

		if (leaf) {
			await workspace.revealLeaf(leaf);
			// Trigger a refresh after opening
			const view = leaf.view as DashboardView;
			if (view && view.refresh) {
				await view.refresh();
			}
		}

		// Dashboard opened
	}

	async indexVault() {
		new Notice("Scanning vault for tasks and goals...");

		try {
			const startTime = Date.now();

			// Get all markdown files
			const files = this.app.vault.getMarkdownFiles();
			let totalTasks = 0;
			let completedTasks = 0;
			let totalGoals = 0;

			// Scan each file
			for (const file of files) {
				const content = await this.app.vault.read(file);

				// Count checkbox tasks
				const incompleteTasks = (content.match(/- \[ \]/gi) || [])
					.length;
				const completedTasksInFile = (content.match(/- \[x\]/gi) || [])
					.length;
				totalTasks += incompleteTasks + completedTasksInFile;
				completedTasks += completedTasksInFile;

				// Find goals in frontmatter or content
				if (
					content.includes("goal:") ||
					content.includes("Goal:") ||
					content.includes("## Goal") ||
					content.includes("# Goal")
				) {
					totalGoals++;
				}
			}

			// Call the actual indexer for proper storage
			await this.vaultIndexer.indexVault();
			const duration = Date.now() - startTime;

			// Show detailed results
			new Notice(
				`Indexed ${files.length} files in ${duration}ms\n` +
					`${totalTasks} tasks (${completedTasks} completed)\n` +
					`${totalGoals} goals found`,
				7000
			);

			// Update status bar if visible
			if (this.statusBarItem) {
				this.statusBarItem.setText(
					`Tasks: ${totalTasks - completedTasks}/${totalTasks}`
				);
			}

			// Refresh dashboard if open
			const leaves =
				this.app.workspace.getLeavesOfType(VIEW_TYPE_DASHBOARD);
			for (const leaf of leaves) {
				const view = leaf.view as DashboardView;
				if (view && typeof view.refresh === "function") {
					await view.refresh();
				}
			}
		} catch {
			// Indexing failed
			new Notice(
				"Unable to index vault. Some search features may be limited.",
				5000
			);
		}
	}

	/**
	 * Update AI provider when settings change (hot-swap without restart)
	 */
	async updateAIProvider() {
		if (this.aiManager) {
			this.aiManager.updateSettings(this.settings);
			this.aiProvider = await this.aiManager.getProvider();

			// Show status based on provider
		if (this.aiProvider) {
			const provider = this.settings.aiProvider;
			if (provider === "openai" && this.settings.openAIApiKey) {
				new Notice("OpenAI connected");
			} else if (
				provider === "anthropic" &&
				this.settings.claudeApiKey
			) {
				new Notice("Claude connected");
			} else if (provider === "ollama") {
				new Notice("Ollama connected");
			} else if (provider) {
				new Notice("AI provider connected");
			}
		} else if (this.settings.aiProvider !== "none") {
			new Notice("AI provider not configured");
		}

			new Notice("AI provider updated successfully");
		}
	}

	/**
	 * Test AI connection
	 */
	async testAIConnection(): Promise<boolean> {
		if (!this.aiManager) {
			new Notice("AI manager not initialized");
			return false;
		}

		// Ensure provider is created/updated
		this.aiProvider = await this.aiManager.getProvider();

		if (!this.aiProvider) {
			const provider = this.settings.aiProvider;
			if (provider === "none") {
				new Notice(
					"No AI provider selected. Please select one in settings."
				);
			} else {
				new Notice(
					`${provider} provider not configured. Check your API key.`
				);
			}
			return false;
		}

		const result = await this.aiManager.testConnection();
		if (result) {
			new Notice("AI connection successful");
		} else {
			const provider = this.settings.aiProvider;
			new Notice(
				`${provider} connection failed. Check your API key and settings.`
			);
		}
		return result;
	}

	generateDailySummary(): string {
		const now = new Date();
		const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const todayStr = now.toLocaleDateString("en-US", {
			weekday: "long",
			year: "numeric",
			month: "long",
			day: "numeric",
		});

		// Get all tasks
		const allTasks = this.taskEngine?.getTasks() || [];

		// Tasks completed today (check completedAt date)
		const completedToday = allTasks.filter((t) => {
			if (!t.completed || !t.completedAt) return false;
			const completedDate = new Date(t.completedAt);
			return completedDate >= today;
		});

		// Tasks due today (pending)
		const dueToday = allTasks.filter((t) => {
			if (t.completed || !t.dueDate) return false;
			const dueDate = new Date(t.dueDate);
			return (
				dueDate.getFullYear() === today.getFullYear() &&
				dueDate.getMonth() === today.getMonth() &&
				dueDate.getDate() === today.getDate()
			);
		});

		// Overdue tasks
		const overdue = allTasks.filter((t) => {
			if (t.completed || !t.dueDate) return false;
			const dueDate = new Date(t.dueDate);
			return dueDate < today;
		});

		// High priority pending tasks
		const highPriority = allTasks.filter(
			(t) => !t.completed && t.priority === "high"
		);

		// Time tracking stats
		const timeStats = this.timeTracker?.getStatistics();
		const todayMinutes = timeStats?.todayTotal || 0;
		const todayHours = Math.floor(todayMinutes / 60);
		const todayMins = todayMinutes % 60;

		// Get recently modified notes (last 24 hours)
		const recentFiles = this.app.vault
			.getMarkdownFiles()
			.filter((f) => {
				const mtime = new Date(f.stat.mtime);
				return mtime >= today;
			})
			.sort((a, b) => b.stat.mtime - a.stat.mtime)
			.slice(0, 5);

		// Goals progress
		const goals = this.goalEngine?.getGoals() || [];
		const activeGoals = goals.filter((g) => g.status === "active");

		// Build the summary
		let summary = `# 📅 Daily Summary - ${todayStr}\n\n`;

		// Today's highlights
		summary += `## 🎯 Today's Highlights\n\n`;
		summary += `| Metric | Count |\n`;
		summary += `|--------|-------|\n`;
		summary += `| ✅ Tasks completed today | ${completedToday.length} |\n`;
		summary += `| 📌 Tasks due today | ${dueToday.length} |\n`;
		summary += `| ⚠️ Overdue tasks | ${overdue.length} |\n`;
		summary += `| 🔴 High priority pending | ${highPriority.length} |\n`;
		if (todayMinutes > 0) {
			summary += `| ⏱️ Time tracked | ${todayHours}h ${todayMins}m |\n`;
		}
		summary += `\n`;

		// Tasks completed today
		if (completedToday.length > 0) {
			summary += `## ✅ Completed Today (${completedToday.length})\n\n`;
			completedToday.slice(0, 10).forEach((t) => {
				const cleanContent = t.content
					.replace(/📅\s*\d{4}-\d{2}-\d{2}/g, "")
					.replace(/[⏫🔼🔽]/gu, "")
					.trim();
				summary += `- [x] ${cleanContent}\n`;
			});
			if (completedToday.length > 10) {
				summary += `- *...and ${completedToday.length - 10} more*\n`;
			}
			summary += `\n`;
		}

		// Tasks due today
		if (dueToday.length > 0) {
			summary += `## 📌 Due Today (${dueToday.length})\n\n`;
			dueToday.forEach((t) => {
				const cleanContent = t.content
					.replace(/📅\s*\d{4}-\d{2}-\d{2}/g, "")
					.replace(/[⏫🔼🔽]/gu, "")
					.trim();
				const priority =
					t.priority === "high"
						? "🔴"
						: t.priority === "medium"
							? "🟡"
							: "🟢";
				summary += `- [ ] ${priority} ${cleanContent}\n`;
			});
			summary += `\n`;
		}

		// Overdue tasks (if any)
		if (overdue.length > 0) {
			summary += `## ⚠️ Overdue (${overdue.length})\n\n`;
			overdue.slice(0, 5).forEach((t) => {
				const cleanContent = t.content
					.replace(/📅\s*\d{4}-\d{2}-\d{2}/g, "")
					.replace(/[⏫🔼🔽]/gu, "")
					.trim();
				const daysOverdue = Math.floor(
					(today.getTime() - new Date(t.dueDate!).getTime()) /
						(1000 * 60 * 60 * 24)
				);
				summary += `- [ ] ${cleanContent} *(${daysOverdue} days overdue)*\n`;
			});
			if (overdue.length > 5) {
				summary += `- *...and ${overdue.length - 5} more overdue tasks*\n`;
			}
			summary += `\n`;
		}

		// High priority tasks
		if (highPriority.length > 0 && completedToday.length === 0) {
			summary += `## 🔴 High Priority\n\n`;
			highPriority.slice(0, 5).forEach((t) => {
				const cleanContent = t.content
					.replace(/📅\s*\d{4}-\d{2}-\d{2}/g, "")
					.replace(/[⏫🔼🔽]/gu, "")
					.trim();
				summary += `- [ ] ${cleanContent}\n`;
			});
			summary += `\n`;
		}

		// Active goals progress
		if (activeGoals.length > 0) {
			summary += `## 🎯 Goals Progress\n\n`;
			activeGoals.slice(0, 5).forEach((g) => {
				const progressBar = this.createProgressBar(g.progress);
				summary += `- **${g.title}** ${progressBar} ${g.progress}%\n`;
			});
			summary += `\n`;
		}

		// Recently modified notes
		if (recentFiles.length > 0) {
			summary += `## 📝 Notes Modified Today\n\n`;
			recentFiles.forEach((f) => {
				const mtime = new Date(f.stat.mtime);
				const timeStr = mtime.toLocaleTimeString("en-US", {
					hour: "2-digit",
					minute: "2-digit",
				});
				summary += `- [[${f.basename}]] *(${timeStr})*\n`;
			});
			summary += `\n`;
		}

		// Daily insight
		summary += `---\n\n`;
		summary += `*Generated at ${now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}*\n`;

		return summary;
	}

	private createProgressBar(progress: number): string {
		const filled = Math.round(progress / 10);
		const empty = 10 - filled;
		return `[${"█".repeat(filled)}${"░".repeat(empty)}]`;
	}

	async askQuestion(question: string): Promise<string> {
		if (this.aiProvider) {
			const context = this.buildQuickContext();
			return await this.aiProvider.answerQuestion(question, context);
		}
		return "Please configure an AI provider in settings to use this feature.";
	}

	private buildQuickContext(): string {
		const tasks = this.taskEngine.getTasks();
		const goals = this.goalEngine.getGoals();
		return `Tasks: ${tasks.length} total, ${
			tasks.filter((t) => !t.completed).length
		} pending. Goals: ${goals.length} total.`;
	}
}
