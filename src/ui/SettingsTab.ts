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

		new Setting(containerEl).setName("VaultMind settings").setHeading();

		// General Settings
		new Setting(containerEl).setName("General").setHeading();

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
		new Setting(containerEl).setName("AI configuration").setHeading();

		new Setting(containerEl)
			.setName("AI provider")
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
						this.plugin.settings.aiProvider = value as
							| "ollama"
							| "openai"
							| "anthropic"
							| "gemini"
							| "deepseek"
							| "grok"
							| "none";
						await this.plugin.saveSettings();
						new Notice("Restart required for AI changes");
					})
			);

		// Task Settings
		new Setting(containerEl).setName("Task management").setHeading();

		new Setting(containerEl)
			.setName("Task format")
			.setDesc("Which task format to recognize")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("obsidian", "Obsidian checkbox")
					.addOption("tasks-plugin", "Tasks plugin")
					.addOption("both", "Both")
					.setValue(this.plugin.settings.taskSyntax)
					.onChange(async (value) => {
						this.plugin.settings.taskSyntax = value as
							| "obsidian"
							| "tasks-plugin"
							| "both";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Task reminders")
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
		new Setting(containerEl).setName("Reports & reviews").setHeading();

		new Setting(containerEl)
			.setName("Daily report")
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
				.setName("Report time")
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
			.setName("Weekly review")
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
		new Setting(containerEl).setName("User interface").setHeading();

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
			.setDesc("Where to open the dashboard view")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("left", "Left sidebar")
					.addOption("right", "Right sidebar")
					.setValue(this.plugin.settings.dashboardPosition)
					.onChange(async (value) => {
						this.plugin.settings.dashboardPosition = value as
							| "left"
							| "right";
						await this.plugin.saveSettings();
					})
			);

		// Dashboard Display Settings
		new Setting(containerEl).setName("Dashboard display").setHeading();

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
		new Setting(containerEl).setName("Privacy").setHeading();

		new Setting(containerEl)
			.setName("Cloud features")
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
		new Setting(containerEl).setName("Debug").setHeading();

		new Setting(containerEl)
			.setName("Clear all data")
			.setDesc("Remove all VaultMind data and cache (cannot be undone)")
			.addButton((button) =>
				button
					.setButtonText("Clear data")
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
