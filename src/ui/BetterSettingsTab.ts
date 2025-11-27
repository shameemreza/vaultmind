import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import VaultMindPlugin from "../main";

export class BetterSettingsTab extends PluginSettingTab {
	plugin: VaultMindPlugin;

	constructor(app: App, plugin: VaultMindPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Header
		containerEl.createEl("h2", { text: "VaultMind Settings" });

		// General Settings
		this.createGeneralSettings(containerEl);

		// AI Configuration (Dynamic)
		this.createAISettings(containerEl);

		// Task Management
		this.createTaskSettings(containerEl);

		// Dashboard Settings
		this.createDashboardSettings(containerEl);

		// Advanced Settings
		this.createAdvancedSettings(containerEl);
	}

	private createGeneralSettings(containerEl: HTMLElement) {
		containerEl.createEl("h3", { text: "General" });

		new Setting(containerEl)
			.setName("Auto-index vault")
			.setDesc("Automatically index your vault on startup")
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

		new Setting(containerEl)
			.setName("Enable notifications")
			.setDesc("Show notifications for important events")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableNotifications)
					.onChange(async (value) => {
						this.plugin.settings.enableNotifications = value;
						await this.plugin.saveSettings();
					})
			);
	}

	private createAISettings(containerEl: HTMLElement) {
		containerEl.createEl("h3", { text: "AI Configuration" });

		// AI Provider dropdown
		new Setting(containerEl)
			.setName("AI Provider")
			.setDesc("Choose your AI provider (no restart required)")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("openai", "OpenAI (GPT)")
					.addOption("anthropic", "Claude (Anthropic)")
					.addOption("ollama", "Ollama (Self-hosted)")
					.addOption("gemini", "Google Gemini")
					.addOption("deepseek", "DeepSeek")
					.addOption("grok", "Grok (X.AI)")
					.addOption("none", "Disabled")
					.setValue(this.plugin.settings.aiProvider)
					.onChange(async (value) => {
						this.plugin.settings.aiProvider = value as any;
						await this.plugin.saveSettings();

						// Hot-swap provider without restart
						await this.plugin.updateAIProvider();

						// Refresh settings display to show/hide provider-specific fields
						this.display();
					})
			);

		// Test connection button
		new Setting(containerEl)
			.setName("Test AI Connection")
			.setDesc("Verify your AI provider is working")
			.addButton((button) =>
				button
					.setButtonText("Test Connection")
					.setCta()
					.onClick(async () => {
						button.setDisabled(true);
						button.setButtonText("Testing...");

						const success = await this.plugin.testAIConnection();

						button.setButtonText(
							success ? "✓ Connected" : "✗ Failed"
						);
						setTimeout(() => {
							button.setButtonText("Test Connection");
							button.setDisabled(false);
						}, 2000);
					})
			);

		// Provider-specific settings
		const provider = this.plugin.settings.aiProvider;

		if (provider === "openai") {
			this.createOpenAISettings(containerEl);
		} else if (provider === "anthropic") {
			this.createClaudeSettings(containerEl);
		} else if (provider === "ollama") {
			this.createOllamaSettings(containerEl);
		} else if (provider === "gemini") {
			this.createGeminiSettings(containerEl);
		} else if (provider === "deepseek") {
			this.createDeepSeekSettings(containerEl);
		} else if (provider === "grok") {
			this.createGrokSettings(containerEl);
		}

		// Web Search Settings
		containerEl.createEl("h4", { text: "Web Search" });

		new Setting(containerEl)
			.setName("Enable web search")
			.setDesc("Allow AI to search the web for additional context")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableWebSearch)
					.onChange(async (value) => {
						this.plugin.settings.enableWebSearch = value;
						await this.plugin.saveSettings();
						this.display(); // Refresh to show/hide search provider settings
					})
			);

		if (this.plugin.settings.enableWebSearch) {
			new Setting(containerEl)
				.setName("Search provider")
				.setDesc("Choose your web search provider")
				.addDropdown((dropdown) =>
					dropdown
						.addOption("duckduckgo", "DuckDuckGo (No API key)")
						.addOption("brave", "Brave Search")
						.addOption("custom", "Custom")
						.setValue(this.plugin.settings.webSearchProvider)
						.onChange(async (value) => {
							this.plugin.settings.webSearchProvider =
								value as any;
							await this.plugin.saveSettings();
							this.display(); // Refresh to show/hide API key field
						})
				);

			if (this.plugin.settings.webSearchProvider === "brave") {
				new Setting(containerEl)
					.setName("Brave API Key")
					.setDesc("Get from brave.com/search/api")
					.addText((text) =>
						text
							.setPlaceholder("Enter API key")
							.setValue(this.plugin.settings.apiKey || "")
							.onChange(async (value) => {
								this.plugin.settings.apiKey = value;
								await this.plugin.saveSettings();
							})
					)
					.addExtraButton((button) =>
						button
							.setIcon("eye")
							.setTooltip("Show/hide API key")
							.onClick(() => {
								const input = containerEl.querySelector(
									".brave-api-key-input"
								) as HTMLInputElement;
								if (input) {
									input.type =
										input.type === "password"
											? "text"
											: "password";
								}
							})
					);
			}

			if (this.plugin.settings.webSearchProvider === "custom") {
				new Setting(containerEl)
					.setName("Custom Search Endpoint")
					.setDesc("API endpoint for custom search provider")
					.addText((text) =>
						text
							.setPlaceholder("https://api.example.com/search")
							.setValue(
								this.plugin.settings.customSearchEndpoint || ""
							)
							.onChange(async (value) => {
								this.plugin.settings.customSearchEndpoint =
									value;
								await this.plugin.saveSettings();
							})
					);
			}
		}
	}

	private createOpenAISettings(containerEl: HTMLElement) {
		containerEl.createEl("h4", { text: "OpenAI Settings" });

		new Setting(containerEl)
			.setName("OpenAI API Key")
			.setDesc("Get from platform.openai.com/api-keys")
			.addText((text) => {
				text.inputEl.type = "password";
				text.inputEl.addClass("openai-api-key-input");
				return text
					.setPlaceholder("sk-...")
					.setValue(this.plugin.settings.openAIApiKey || "")
					.onChange(async (value) => {
						this.plugin.settings.openAIApiKey = value;
						await this.plugin.saveSettings();
						// Hot-swap provider
						await this.plugin.updateAIProvider();
					});
			})
			.addExtraButton((button) =>
				button
					.setIcon("eye")
					.setTooltip("Show/hide API key")
					.onClick(() => {
						const input = containerEl.querySelector(
							".openai-api-key-input"
						) as HTMLInputElement;
						if (input) {
							input.type =
								input.type === "password" ? "text" : "password";
						}
					})
			);

		new Setting(containerEl)
			.setName("Model")
			.setDesc("Choose GPT model (3.5 is cheaper, 4 is smarter)")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("gpt-3.5-turbo", "GPT-3.5 Turbo (Fast & Cheap)")
					.addOption("gpt-3.5-turbo-16k", "GPT-3.5 Turbo 16K")
					.addOption("gpt-4", "GPT-4")
					.addOption("gpt-4-32k", "GPT-4 32K")
					.addOption("gpt-4-turbo", "GPT-4 Turbo")
					.addOption("gpt-4o", "GPT-4o (Optimized)")
					.addOption("gpt-4o-mini", "GPT-4o Mini (Cheap)")
					.setValue(
						this.plugin.settings.openAIModel || "gpt-3.5-turbo"
					)
					.onChange(async (value) => {
						this.plugin.settings.openAIModel = value;
						await this.plugin.saveSettings();
						await this.plugin.updateAIProvider();
					})
			);

		// Cost estimate
		containerEl.createDiv({
			cls: "setting-item-description",
			text: "💡 Estimated cost: ~$0.10/day for typical use with GPT-3.5",
		});
	}

	private createClaudeSettings(containerEl: HTMLElement) {
		containerEl.createEl("h4", { text: "Claude Settings" });

		new Setting(containerEl)
			.setName("Claude API Key")
			.setDesc("Get from console.anthropic.com")
			.addText((text) => {
				text.inputEl.type = "password";
				text.inputEl.addClass("claude-api-key-input");
				return text
					.setPlaceholder("sk-ant-...")
					.setValue(this.plugin.settings.claudeApiKey || "")
					.onChange(async (value) => {
						this.plugin.settings.claudeApiKey = value;
						await this.plugin.saveSettings();
						await this.plugin.updateAIProvider();
					});
			})
			.addExtraButton((button) =>
				button
					.setIcon("eye")
					.setTooltip("Show/hide API key")
					.onClick(() => {
						const input = containerEl.querySelector(
							".claude-api-key-input"
						) as HTMLInputElement;
						if (input) {
							input.type =
								input.type === "password" ? "text" : "password";
						}
					})
			);

		new Setting(containerEl)
			.setName("Model")
			.setDesc("Choose Claude model")
			.addDropdown((dropdown) =>
				dropdown
					.addOption(
						"claude-3-haiku-20240307",
						"Claude 3 Haiku (Fast & Cheap)"
					)
					.addOption(
						"claude-3-sonnet-20240229",
						"Claude 3 Sonnet (Balanced)"
					)
					.addOption(
						"claude-3-opus-20240229",
						"Claude 3 Opus (Most Capable)"
					)
					.addOption(
						"claude-3-5-sonnet-20241022",
						"Claude 3.5 Sonnet (Latest)"
					)
					.addOption("claude-2.1", "Claude 2.1 (Legacy)")
					.addOption("claude-instant-1.2", "Claude Instant (Fastest)")
					.setValue(
						this.plugin.settings.claudeModel ||
							"claude-3-haiku-20240307"
					)
					.onChange(async (value) => {
						this.plugin.settings.claudeModel = value;
						await this.plugin.saveSettings();
						await this.plugin.updateAIProvider();
					})
			);

		containerEl.createDiv({
			cls: "setting-item-description",
			text: "💡 Haiku is recommended for most use cases",
		});
	}

	private createOllamaSettings(containerEl: HTMLElement) {
		containerEl.createEl("h4", { text: "Ollama Settings" });

		new Setting(containerEl)
			.setName("Ollama Endpoint")
			.setDesc("URL where Ollama is running")
			.addText((text) =>
				text
					.setPlaceholder("http://localhost:11434")
					.setValue(
						this.plugin.settings.ollamaEndpoint ||
							"http://localhost:11434"
					)
					.onChange(async (value) => {
						this.plugin.settings.ollamaEndpoint = value;
						await this.plugin.saveSettings();
						await this.plugin.updateAIProvider();
					})
			);

		new Setting(containerEl)
			.setName("Model")
			.setDesc("Ollama model to use (e.g., qwen3-vl:8b, llama2, mistral)")
			.addText((text) =>
				text
					.setPlaceholder("qwen3-vl:8b")
					.setValue(this.plugin.settings.ollamaModel || "qwen3-vl:8b")
					.onChange(async (value) => {
						this.plugin.settings.ollamaModel = value;
						await this.plugin.saveSettings();
						await this.plugin.updateAIProvider();
					})
			);

		// Help text
		containerEl.createDiv({
			cls: "setting-item-description",
			text: "📖 Install Ollama from ollama.ai, then run: ollama pull qwen3-vl:8b (or your preferred model)",
		});
	}

	private createTaskSettings(containerEl: HTMLElement) {
		containerEl.createEl("h3", { text: "Task Management" });

		new Setting(containerEl)
			.setName("Task syntax")
			.setDesc("Which task syntax to recognize")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("obsidian", "Obsidian (- [ ])")
					.addOption("tasks-plugin", "Tasks plugin")
					.addOption("both", "Both")
					.setValue(this.plugin.settings.taskSyntax)
					.onChange(async (value) => {
						this.plugin.settings.taskSyntax = value as any;
						await this.plugin.saveSettings();
						// Re-index to pick up new tasks
						await this.plugin.indexVault();
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

		if (this.plugin.settings.enableTaskReminders) {
			new Setting(containerEl)
				.setName("Reminder advance time")
				.setDesc("Minutes before due time to show reminder")
				.addText((text) =>
					text
						.setPlaceholder("15")
						.setValue(
							String(this.plugin.settings.reminderAdvanceTime)
						)
						.onChange(async (value) => {
							const num = parseInt(value);
							if (!isNaN(num) && num > 0) {
								this.plugin.settings.reminderAdvanceTime = num;
								await this.plugin.saveSettings();
							}
						})
				);
		}
	}

	private createDashboardSettings(containerEl: HTMLElement) {
		containerEl.createEl("h3", { text: "Dashboard" });

		new Setting(containerEl)
			.setName("Show tags section")
			.setDesc("Display tags in the dashboard")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showTagsInDashboard)
					.onChange(async (value) => {
						this.plugin.settings.showTagsInDashboard = value;
						await this.plugin.saveSettings();
						this.refreshDashboard();
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
						this.refreshDashboard();
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
						this.refreshDashboard();
					})
			);

		new Setting(containerEl)
			.setName("Max tasks per section")
			.setDesc("Maximum number of tasks to show in each section")
			.addText((text) =>
				text
					.setPlaceholder("10")
					.setValue(String(this.plugin.settings.maxTasksPerSection))
					.onChange(async (value) => {
						const num = parseInt(value);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.maxTasksPerSection = num;
							await this.plugin.saveSettings();
							this.refreshDashboard();
						}
					})
			);
	}

	private createAdvancedSettings(containerEl: HTMLElement) {
		containerEl.createEl("h3", { text: "Advanced" });

		new Setting(containerEl)
			.setName("Max tokens")
			.setDesc("Maximum tokens for AI responses")
			.addText((text) =>
				text
					.setPlaceholder("500")
					.setValue(String(this.plugin.settings.maxTokens))
					.onChange(async (value) => {
						const num = parseInt(value);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.maxTokens = num;
							await this.plugin.saveSettings();
						}
					})
			);

		new Setting(containerEl)
			.setName("Temperature")
			.setDesc("AI creativity (0.0 = focused, 1.0 = creative)")
			.addSlider((slider) =>
				slider
					.setLimits(0, 1, 0.1)
					.setValue(this.plugin.settings.temperature)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.temperature = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Show status bar")
			.setDesc("Show VaultMind in the status bar")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showStatusBar)
					.onChange(async (value) => {
						this.plugin.settings.showStatusBar = value;
						await this.plugin.saveSettings();
						// Restart required for status bar changes
						new Notice(
							"Restart Obsidian to apply status bar changes"
						);
					})
			);

		new Setting(containerEl)
			.setName("Show ribbon icon")
			.setDesc("Show VaultMind icon in the ribbon")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showRibbonIcon)
					.onChange(async (value) => {
						this.plugin.settings.showRibbonIcon = value;
						await this.plugin.saveSettings();
						// Restart required for ribbon changes
						new Notice("Restart Obsidian to apply ribbon changes");
					})
			);
	}

	private refreshDashboard() {
		const leaves = this.app.workspace.getLeavesOfType(
			"vaultmind-dashboard"
		);
		leaves.forEach((leaf) => {
			const view = leaf.view;
			if ("refresh" in view && typeof view.refresh === "function") {
				view.refresh();
			}
		});
	}

	private createGeminiSettings(containerEl: HTMLElement) {
		containerEl.createEl("h4", { text: "Google Gemini Settings" });

		new Setting(containerEl)
			.setName("Gemini API Key")
			.setDesc("Get from makersuite.google.com/app/apikey")
			.addText((text) => {
				text.inputEl.type = "password";
				return text
					.setPlaceholder("AIza...")
					.setValue(this.plugin.settings.geminiApiKey || "")
					.onChange(async (value) => {
						this.plugin.settings.geminiApiKey = value;
						await this.plugin.saveSettings();
						await this.plugin.updateAIProvider();
					});
			});

		new Setting(containerEl)
			.setName("Model")
			.setDesc("Gemini model to use")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("gemini-pro", "Gemini Pro")
					.addOption("gemini-1.5-pro", "Gemini 1.5 Pro")
					.addOption("gemini-1.5-flash", "Gemini 1.5 Flash (Fast)")
					.setValue(this.plugin.settings.geminiModel || "gemini-pro")
					.onChange(async (value) => {
						this.plugin.settings.geminiModel = value;
						await this.plugin.saveSettings();
						await this.plugin.updateAIProvider();
					})
			);

		containerEl.createDiv({
			cls: "setting-item-description",
			text: "💡 Gemini Pro is recommended for most use cases",
		});
	}

	private createDeepSeekSettings(containerEl: HTMLElement) {
		containerEl.createEl("h4", { text: "DeepSeek Settings" });

		new Setting(containerEl)
			.setName("DeepSeek API Key")
			.setDesc("Get from platform.deepseek.com")
			.addText((text) => {
				text.inputEl.type = "password";
				return text
					.setPlaceholder("sk-...")
					.setValue(this.plugin.settings.deepseekApiKey || "")
					.onChange(async (value) => {
						this.plugin.settings.deepseekApiKey = value;
						await this.plugin.saveSettings();
						await this.plugin.updateAIProvider();
					});
			});

		new Setting(containerEl)
			.setName("Model")
			.setDesc("DeepSeek model to use")
			.addText((text) =>
				text
					.setPlaceholder("deepseek-chat")
					.setValue(
						this.plugin.settings.deepseekModel || "deepseek-chat"
					)
					.onChange(async (value) => {
						this.plugin.settings.deepseekModel = value;
						await this.plugin.saveSettings();
						await this.plugin.updateAIProvider();
					})
			);

		containerEl.createDiv({
			cls: "setting-item-description",
			text: "💡 DeepSeek offers competitive performance at lower costs",
		});
	}

	private createGrokSettings(containerEl: HTMLElement) {
		containerEl.createEl("h4", { text: "Grok Settings (X.AI)" });

		new Setting(containerEl)
			.setName("Grok API Key")
			.setDesc("Get from console.x.ai")
			.addText((text) => {
				text.inputEl.type = "password";
				return text
					.setPlaceholder("xai-...")
					.setValue(this.plugin.settings.grokApiKey || "")
					.onChange(async (value) => {
						this.plugin.settings.grokApiKey = value;
						await this.plugin.saveSettings();
						await this.plugin.updateAIProvider();
					});
			});

		new Setting(containerEl)
			.setName("Model")
			.setDesc("Grok model to use")
			.addText((text) =>
				text
					.setPlaceholder("grok-beta")
					.setValue(this.plugin.settings.grokModel || "grok-beta")
					.onChange(async (value) => {
						this.plugin.settings.grokModel = value;
						await this.plugin.saveSettings();
						await this.plugin.updateAIProvider();
					})
			);

		containerEl.createDiv({
			cls: "setting-item-description",
			text: "💡 Grok provides responses with personality and humor",
		});
	}
}
