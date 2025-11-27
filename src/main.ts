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
		setTimeout(async () => {
			// Initialize core services
			await this.initializeServices();

			// Register additional commands
			const { registerCommands } = await import("./commands");
			registerCommands(this);
		}, 50); // Reduced delay for faster initialization

		// Delay ribbon icons to ensure workspace is ready
		// This matches how other successful plugins do it
		this.app.workspace.onLayoutReady(() => {
			setTimeout(() => {
				// Dashboard icon
				this.ribbonIcon = this.addRibbonIcon(
					"brain",
					"VaultMind Dashboard",
					async () => {
						await this.openDashboard();
					}
				);
				this.ribbonIcon.addClass("vaultmind-ribbon-icon");

				// Chat icon
				const chatIcon = this.addRibbonIcon(
					"message-circle",
					"VaultMind AI Chat",
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
					async () => {
						// Ensure services are initialized before indexing
						if (!this.vaultIndexer) {
							// Waiting for services
							setTimeout(scheduleIndexing, 1000);
							return;
						}
						// Auto-indexing vault
						await this.indexVault();
					},
					{ timeout: 10000 }
				);
			} else {
				setTimeout(async () => {
					if (!this.vaultIndexer) {
						// Waiting for services
						setTimeout(scheduleIndexing, 1000);
						return;
					}
					// Auto-indexing vault
					await this.indexVault();
				}, 5000);
			}
		};
		scheduleIndexing();

		// Plugin loaded successfully
	}

	async onunload() {
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
		} catch (error) {
			// Service initialization failed
			new Notice(
				"VaultMind: Some features may be limited. Please restart Obsidian if issues persist."
			);
		}
	}

	private registerCommands() {
		// Dashboard command
		this.addCommand({
			id: "open-dashboard",
			name: "Open Dashboard",
			callback: async () => {
				await this.openDashboard();
			},
		});

		// Index vault command
		this.addCommand({
			id: "index-vault",
			name: "Index Vault",
			callback: async () => {
				await this.indexVault();
			},
		});

		// Quick task creation
		this.addCommand({
			id: "quick-task",
			name: "Create Quick Task",
			editorCallback: (editor) => {
				const selection = editor.getSelection();
				const task = `- [ ] ${selection || "New task"}`;
				editor.replaceSelection(task);
			},
		});

		// Toggle time tracking
		this.addCommand({
			id: "toggle-time-tracking",
			name: "Toggle Time Tracking",
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
			name: "Open AI Chat",
			callback: async () => {
				await this.openChat();
			}
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
				"Open VaultMind Dashboard",
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
		this.statusBarItem.style.cursor = "pointer";
		this.statusBarItem.addEventListener("click", async (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			// Opening dashboard
			await this.openDashboard();
		});

		// Add right-click menu to status bar
		this.statusBarItem.oncontextmenu = (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();

			const menu = new Menu();

			menu.addItem((item) =>
				item
					.setTitle("Open Dashboard")
					.setIcon("brain")
					.onClick(async () => {
						await this.openDashboard();
					})
			);

			menu.addItem((item) =>
				item
					.setTitle("Index Vault")
					.setIcon("refresh-cw")
					.onClick(async () => {
						await this.indexVault();
					})
			);

			menu.addItem((item) =>
				item
					.setTitle("Open AI Chat")
					.setIcon("message-circle")
					.onClick(async () => {
						await this.openChat();
					})
			);

			menu.addSeparator();

			menu.addItem((item) =>
				item
					.setTitle("Start Time Tracking")
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
					.setTitle("Stop Time Tracking")
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
				this.statusBarItem.setText("VaultMind");
				this.statusBarItem.setAttr(
					"title",
					"VaultMind: Click for dashboard, right-click for menu"
				);
			}
		} catch (error) {
			this.statusBarItem.setText("VaultMind");
			this.statusBarItem.setAttr(
				"title",
				"VaultMind: Click for dashboard"
			);
		}
	}

	async openChat() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(CHAT_VIEW_TYPE);

		if (leaves.length > 0) {
			// Chat view already exists, reveal it
			workspace.revealLeaf(leaves[0]);
		} else {
			// Create new chat view in right sidebar
			leaf = workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({
					type: CHAT_VIEW_TYPE,
					active: true,
				});
				workspace.revealLeaf(leaf);
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
			workspace.revealLeaf(leaf);
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
			const index = await this.vaultIndexer.indexVault();
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
			leaves.forEach((leaf) => {
				const view = leaf.view as DashboardView;
				if (view && typeof view.refresh === "function") {
					view.refresh();
				}
			});
		} catch (error) {
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
			await this.aiManager.updateSettings(this.settings);
			this.aiProvider = await this.aiManager.getProvider();

			// Show status based on provider
			if (this.aiProvider) {
				const provider = this.settings.aiProvider;
				if (provider === "openai" && this.settings.openAIApiKey) {
					new Notice("✓ OpenAI connected");
				} else if (
					provider === "anthropic" &&
					this.settings.claudeApiKey
				) {
					new Notice("✓ Claude connected");
				} else if (provider === "ollama") {
					new Notice("✓ Ollama connected");
				} else if (provider) {
					new Notice("✓ AI provider connected");
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
		if (this.aiManager) {
			const result = await this.aiManager.testConnection();
			if (result) {
				new Notice("✓ AI connection successful");
			} else {
				new Notice("✗ AI connection failed");
			}
			return result;
		}
		return false;
	}

	async generateDailySummary(): Promise<string> {
		// Simplified version without AI for now
		const tasks = this.taskEngine?.getTasks() || [];
		const tasksCompleted = tasks.filter((t) => t.completed).length;
		const tasksTotal = tasks.length;

		const summary = `# Daily Summary - ${new Date().toLocaleDateString()}

## Task Statistics
- Total Tasks: ${tasksTotal}
- Completed: ${tasksCompleted}
- Completion Rate: ${
			tasksTotal > 0
				? ((tasksCompleted / tasksTotal) * 100).toFixed(1)
				: 0
		}%

## Notes
- AI features will be available in v0.2.0
- Use the dashboard for detailed statistics
`;

		return summary;
	}

	async askQuestion(question: string): Promise<string> {
		// Simplified version
		return "AI features are coming in v0.2.0. This will include local LLM support with 18+ models.";
	}
}
