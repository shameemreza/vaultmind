import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import { ConfirmModal } from "./ConfirmModal";
import VaultMindPlugin from "../main";

export class SettingsTab extends PluginSettingTab {
	plugin: VaultMindPlugin;

	constructor(app: App, plugin: VaultMindPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "VaultMind Settings" });

		// General Settings
		containerEl.createEl("h3", { text: "General" });

		new Setting(containerEl)
			.setName("Enable auto-indexing")
			.setDesc("Automatically index your vault at regular intervals")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableAutoIndex)
					.onChange(async (value) => {
						this.plugin.settings.enableAutoIndex = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Index interval")
			.setDesc("How often to re-index the vault (in minutes)")
			.addText((text) =>
				text
					.setPlaceholder("30")
					.setValue(String(this.plugin.settings.indexInterval))
					.onChange(async (value) => {
						const num = parseInt(value);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.indexInterval = num;
							await this.plugin.saveSettings();
						}
					})
			);

		// AI Settings
		containerEl.createEl("h3", { text: "AI Configuration" });

		new Setting(containerEl)
			.setName("AI Provider")
			.setDesc("Choose your AI provider")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("openai", "OpenAI")
					.addOption("anthropic", "Anthropic Claude")
					.addOption("ollama", "Ollama (Local)")
					.addOption("gemini", "Google Gemini")
					.addOption("deepseek", "DeepSeek")
					.addOption("grok", "Grok (X.AI)")
					.addOption("none", "Disabled")
					.setValue(this.plugin.settings.aiProvider)
					.onChange(async (value) => {
						this.plugin.settings.aiProvider = value;
						await this.plugin.saveSettings();
						new Notice("Restart required for AI changes");
					})
			);

		new Setting(containerEl)
			.setName("Enable web search")
			.setDesc("Allow AI to search the web for additional context")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableWebSearch)
					.onChange(async (value) => {
						this.plugin.settings.enableWebSearch = value;
						await this.plugin.saveSettings();
					})
			);

		if (this.plugin.settings.enableWebSearch) {
			new Setting(containerEl)
				.setName("Web search provider")
				.setDesc("Choose your web search provider")
				.addDropdown((dropdown) =>
					dropdown
						.addOption("duckduckgo", "DuckDuckGo (No API key)")
						.addOption("brave", "Brave Search (API key required)")
						.addOption("custom", "Custom")
						.setValue(this.plugin.settings.webSearchProvider)
						.onChange(async (value) => {
							this.plugin.settings.webSearchProvider = value;
							await this.plugin.saveSettings();
							// Refresh settings display to show/hide API key field
							this.display();
						})
				);

			// Show API key field for Brave or Custom search
			if (
				this.plugin.settings.webSearchProvider === "brave" ||
				this.plugin.settings.webSearchProvider === "custom"
			) {
				new Setting(containerEl)
					.setName("Search API Key")
					.setDesc(
						`API key for ${this.plugin.settings.webSearchProvider} search`
					)
					.addText((text) =>
						text
							.setPlaceholder("Enter API key...")
							.setValue(this.plugin.settings.apiKey || "")
							.onChange(async (value) => {
								this.plugin.settings.apiKey = value;
								await this.plugin.saveSettings();
							})
					);
			}

			// Custom endpoint for custom provider
			if (this.plugin.settings.webSearchProvider === "custom") {
				new Setting(containerEl)
					.setName("Custom Search Endpoint")
					.setDesc("API endpoint for custom search provider")
					.addText((text) =>
						text
							.setPlaceholder("https://api.example.com/search")
							.setValue(this.plugin.settings.apiEndpoint || "")
							.onChange(async (value) => {
								this.plugin.settings.apiEndpoint = value;
								await this.plugin.saveSettings();
							})
					);
			}
		}

		// Task Settings
		containerEl.createEl("h3", { text: "Task Management" });

		new Setting(containerEl)
			.setName("Task syntax")
			.setDesc("Which task syntax to recognize")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("obsidian", "Obsidian checkbox")
					.addOption("tasks-plugin", "Tasks plugin")
					.addOption("both", "Both")
					.setValue(this.plugin.settings.taskSyntax)
					.onChange(async (value) => {
						this.plugin.settings.taskSyntax = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Enable task reminders")
			.setDesc("Show reminders for upcoming tasks")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableTaskReminders)
					.onChange(async (value) => {
						this.plugin.settings.enableTaskReminders = value;
						await this.plugin.saveSettings();
					})
			);

		// Reports Settings
		containerEl.createEl("h3", { text: "Reports & Reviews" });

		new Setting(containerEl)
			.setName("Enable daily report")
			.setDesc("Automatically generate a daily summary")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableDailyReport)
					.onChange(async (value) => {
						this.plugin.settings.enableDailyReport = value;
						await this.plugin.saveSettings();
					})
			);

		if (this.plugin.settings.enableDailyReport) {
			new Setting(containerEl)
				.setName("Daily report time")
				.setDesc("When to generate the daily report (HH:MM)")
				.addText((text) =>
					text
						.setPlaceholder("09:00")
						.setValue(this.plugin.settings.dailyReportTime)
						.onChange(async (value) => {
							this.plugin.settings.dailyReportTime = value;
							await this.plugin.saveSettings();
						})
				);
		}

		new Setting(containerEl)
			.setName("Enable weekly review")
			.setDesc("Automatically generate a weekly review")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableWeeklyReview)
					.onChange(async (value) => {
						this.plugin.settings.enableWeeklyReview = value;
						await this.plugin.saveSettings();
					})
			);

		// UI Settings
		containerEl.createEl("h3", { text: "User Interface" });

		new Setting(containerEl)
			.setName("Show status bar")
			.setDesc("Display VaultMind stats in the status bar")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showStatusBar)
					.onChange(async (value) => {
						this.plugin.settings.showStatusBar = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Show ribbon icon")
			.setDesc("Display VaultMind icon in the left ribbon")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showRibbonIcon)
					.onChange(async (value) => {
						this.plugin.settings.showRibbonIcon = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Dashboard position")
			.setDesc("Where to open the dashboard")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("left", "Left sidebar")
					.addOption("right", "Right sidebar")
					.setValue(this.plugin.settings.dashboardPosition)
					.onChange(async (value) => {
						this.plugin.settings.dashboardPosition = value;
						await this.plugin.saveSettings();
					})
			);

		// Dashboard Display Settings
		containerEl.createEl("h3", { text: "Dashboard Display" });

		new Setting(containerEl)
			.setName("Show tags")
			.setDesc("Display hashtags extracted from tasks")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showTagsInDashboard)
					.onChange(async (value) => {
						this.plugin.settings.showTagsInDashboard = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Show time tracking")
			.setDesc("Display time tracking section")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showTimeTrackingInDashboard)
					.onChange(async (value) => {
						this.plugin.settings.showTimeTrackingInDashboard =
							value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Show quick stats")
			.setDesc("Display statistics overview")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showQuickStatsInDashboard)
					.onChange(async (value) => {
						this.plugin.settings.showQuickStatsInDashboard = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Show goals")
			.setDesc("Display goals section")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showGoalsInDashboard)
					.onChange(async (value) => {
						this.plugin.settings.showGoalsInDashboard = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Max tasks per section")
			.setDesc("Limit number of tasks shown")
			.addSlider((slider) =>
				slider
					.setLimits(5, 50, 5)
					.setValue(this.plugin.settings.maxTasksPerSection)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.maxTasksPerSection = value;
						await this.plugin.saveSettings();
					})
			);

		// Privacy Settings
		containerEl.createEl("h3", { text: "Privacy" });

		new Setting(containerEl)
			.setName("Enable cloud features")
			.setDesc(
				"Allow optional cloud AI features (data will be sent externally)"
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableCloudFeatures)
					.onChange(async (value) => {
						this.plugin.settings.enableCloudFeatures = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Data retention")
			.setDesc("How many days to keep cached data")
			.addText((text) =>
				text
					.setPlaceholder("30")
					.setValue(String(this.plugin.settings.dataRetentionDays))
					.onChange(async (value) => {
						const num = parseInt(value);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.dataRetentionDays = num;
							await this.plugin.saveSettings();
						}
					})
			);

		// Debug Settings
		containerEl.createEl("h3", { text: "Debug" });

		new Setting(containerEl)
			.setName("Clear all data")
			.setDesc("Remove all VaultMind data and cache (cannot be undone)")
			.addButton((button) =>
				button
					.setButtonText("Clear Data")
					.setWarning()
					.onClick(async () => {
						new ConfirmModal(
							this.plugin.app,
							"Are you sure? This will delete all VaultMind data!",
							async () => {
								const storage =
									this.plugin.vaultIndexer.storage;
								await storage.clear();
								new Notice("All VaultMind data cleared");
							},
							"Clear Data",
							"Cancel"
						).open();
					})
			);

		new Setting(containerEl)
			.setName("Re-index vault")
			.setDesc("Force a complete re-index of your vault")
			.addButton((button) =>
				button.setButtonText("Re-index").onClick(async () => {
					await this.plugin.indexVault();
				})
			);
	}
}
