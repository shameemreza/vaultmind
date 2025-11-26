# VaultMind - AI-Powered Task & Goal Management for Obsidian

[![Version](https://img.shields.io/badge/version-1.0.0-blue)](https://github.com/shameemreza/vaultmind)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Obsidian](https://img.shields.io/badge/Obsidian-Compatible-purple)](https://obsidian.md)

VaultMind is a comprehensive Obsidian plugin that brings AI-powered task management, goal tracking, and intelligent vault organization to your knowledge base. With advanced AI chat, automatic task detection, and smart scheduling, VaultMind transforms Obsidian into a powerful productivity hub.

<p align="center">
  <img src=".github/assets/demo.gif" alt="VaultMind Demo" width="800">
</p>

### AI-Powered Assistant

-   **Full Vault Access**: AI can search and analyze all your notes.
-   **Multi-Provider Support**: OpenAI, Claude, Ollama, or local fallback.
-   **Natural Language**: Ask questions naturally - What tasks are due today?
-   **Smart Context**: Understands your tasks, goals, and note relationships.
-   **Session Management**: Persistent chat history across sessions.

### Task Management

-   **Automatic Detection**: Finds all tasks across your vault.
-   **Flexible Priority System**: Multiple formats supported:
    -   Emoji: `⏫` (high), `🔼` (medium), `🔽` (low)
    -   Brackets: `[high]`, `[medium]`, `[low]`
    -   Exclamations: `!!!` (high), `!!` (medium), `!` (low)
    -   Letters: `(A)` (high), `(B)` (medium), `(C)` (low)
    -   Tags: `#priority/high`, `#priority/medium`, `#priority/low`
    -   Text: `priority:: high`
-   **Visual Priority Badges**: Color-coded badges (red/yellow/green).
-   **Priority Filtering**: Filter dashboard by priority level.
-   **Due Dates**: Supports `📅 2024-12-25` format.
-   **Interactive Dashboard**: Click to complete, filter by tags or priority.
-   **Overdue Tracking**: Visual indicators for overdue tasks.
-   **Tag-based Organization**: Filter and organize by project tags.

### Goal Tracking

-   **Multiple Formats**: Supports `[GOAL]`, `#goal/`, and frontmatter.
-   **Progress Visualization**: Track milestones and completion.
-   **Dashboard Integration**: See all goals with progress bars.
-   **AI Awareness**: Chat understands your goals and progress.

### Smart Scheduling

-   **Daily Summaries**: Automated morning task briefings.
-   **Weekly Reviews**: End-of-week progress reports.
-   **Smart Reminders**: Notifications for upcoming deadlines.
-   **Background Processing**: Non-intrusive vault indexing.

### Intelligent Search

-   **Natural Language**: Show me notes about project X.
-   **Fuzzy Matching**: Finds notes even with typos.
-   **Web Search**: DuckDuckGo and Brave Search integration.
-   **Context-Aware**: AI understands relationships between notes.

## Installation

### From Obsidian Community Plugins (Recommended)

1. Open **Settings** → **Community plugins**.
2. Click **Browse** and search for VaultMind.
3. Click **Install** and then **Enable**.

### Manual Installation

1. Download the latest release from [GitHub Releases](https://github.com/shameemreza/vaultmind/releases)
2. Extract files to your vault's `.obsidian/plugins/vaultmind/` folder.
3. Reload Obsidian.
4. Enable VaultMind in **Settings** → **Community plugins**.

## Getting Started

### Initial Setup

1. **Open VaultMind Dashboard**: Click the brain icon (🧠) in the ribbon.
2. **Configure AI Provider** (optional):
    - Go to **Settings** → **VaultMind**.
    - Choose your AI provider (OpenAI, Claude, Ollama).
    - Enter API key if required.
3. **Index Your Vault**: Happens automatically on first launch.

### Creating Tasks

VaultMind automatically detects tasks in standard Obsidian format with flexible priority options:

```
## Today's Tasks

-   [ ] Complete project review ⏫ 📅 2024-12-25
-   [ ] Fix critical bug [high]
-   [ ] Update documentation !!
-   [ ] Code review (B)
-   [ ] Write tests priority:: low
-   [ ] Team meeting #priority/medium
-   [x] Deploy to staging !!!

## Recurring Tasks

-   [ ] Weekly team meeting 🔁 every Monday.
-   [ ] Monthly report 📅 2024-12-31 ⏫ #reports.
```

**Supported formats:**

-   Priority: `⏫` (high), `🔼` (medium), `🔽` (low).
-   Due date: `📅 YYYY-MM-DD` or `@due(YYYY-MM-DD)`.
-   Tags: `#project` or `#work/meetings`.
-   Combined: `- [ ] Task ⏫ 📅 2024-12-25 #important`.

### Setting Goals

Define goals using multiple formats:

#### Method 1: Inline Goal Tag

```
[GOAL] Launch my product by Q1 2025
Progress: 30%
Milestones:

-   [x] Complete design
-   [ ] Build MVP
-   [ ] Beta testing
```

#### Method 2: Goal Tags

```
#goal/fitness-journey

-   [ ] Lose 10 pounds
-   [ ] Run 5K
        Progress: 45%
```

#### Method 3: Frontmatter

```
---
goal: Complete online course
progress: 60
deadline: 2025-03-31
---
```

### Using AI Chat

1. **Open Chat**: Click the message icon (💬) or press `Cmd/Ctrl + Shift + C`
2. **Ask Naturally**:

    - What tasks are due this week?
    - Show me all notes about project Alpha
    - Read the meeting notes from yesterday
    - What's my progress on fitness goals?

3. **Attach Context**:

    - Click 📎 to attach specific notes or folders.
    - AI automatically searches your vault when needed.

4. **Session Management**:
    - Chat history persists across sessions.
    - Switch between multiple conversation threads.
    - Delete old sessions to stay organized.

## Dashboard Overview

The VaultMind Dashboard provides:

### Tasks Section

-   **Overdue**: Red-highlighted urgent tasks.
-   **Today**: Tasks due today.
-   **This Week**: Upcoming 7-day tasks.
-   **Pending**: All incomplete tasks without dates.

### Goals Section

-   Visual progress bars.
-   Milestone tracking.
-   Click to open goal notes.

### Quick Actions

-   **Click task checkbox**: Mark complete.
-   **Click task text**: Open source note.
-   **Click tags**: Filter by that tag.
-   **Refresh button**: Update dashboard.

## Configuration

### AI Settings

-   **Provider**: Choose between OpenAI, Claude, Ollama, or Fallback.
-   **API Keys**: Securely stored in Obsidian settings.
-   **Model Selection**: Choose specific models per provider.
-   **Temperature**: Adjust AI creativity (0-1).

### Dashboard Settings

-   **Auto-refresh**: Update interval (5-60 minutes).
-   **Show completed**: Toggle completed tasks visibility.
-   **Task limit**: Maximum tasks per section.
-   **Date format**: Customize date display.

### Scheduler Settings

-   **Daily summary time**: When to show daily briefing.
-   **Weekly review day**: Day for weekly summary.
-   **Notification sound**: Enable/disable sounds.
-   **Auto-index**: Background vault scanning.

### Web Search

-   **DuckDuckGo**: Enabled by default (no API needed).
-   **Brave Search**: Optional (requires API key).
-   **Custom endpoint**: Add your own search API.

## Advanced Features

### Keyboard Shortcuts

-   `Cmd/Ctrl + Shift + C`: Open AI Chat.
-   `Cmd/Ctrl + Shift + D`: Open Dashboard.
-   `Cmd/Ctrl + Shift + R`: Refresh vault index.

### Command Palette

Access all features via command palette (`Cmd/Ctrl + P`):

-   `VaultMind: Open Dashboard`
-   `VaultMind: Open AI Chat`
-   `VaultMind: Index Vault`
-   `VaultMind: Show Daily Summary`
-   `VaultMind: Toggle Task Tracking`

### Time Tracking

Track time spent on tasks:

1. Select a task in the dashboard.
2. Click "Start Timer".
3. Work on your task.
4. Click "Stop Timer" when done.

### Templates Support

Create task templates in your Templates folder:

```
## Daily Review Template

-   [ ] Review calendar 📅 {{date}}
-   [ ] Check emails ⏫
-   [ ] Plan tomorrow's priorities
```

## Best Practices

### Task Organization

1. **Use consistent formats**: Pick one style and stick to it.
2. **Add context with tags**: `#project/name` for grouping.
3. **Set realistic due dates**: Avoid overloading days.
4. **Review regularly**: Use weekly reviews to adjust.

### Goal Setting

1. **Be specific**: "Launch product" not "work on project".
2. **Set milestones**: Break into measurable steps.
3. **Update progress**: Regular percentage updates.
4. **Link related notes**: Connect goals to project notes.

### AI Chat Tips

1. **Be specific**: "tasks due tomorrow" not "tasks".
2. **Attach relevant notes**: For focused responses.
3. **Use natural language**: Ask like talking to a colleague.
4. **Save important chats**: Keep sessions for reference.

## Troubleshooting

### Common Issues

**Tasks not appearing:**

-   Ensure task format is correct: `- [ ] Task text`
-   Check if file is `.md` extension
-   Manually refresh: `VaultMind: Index Vault`

**AI not responding:**

-   Verify API key in settings.
-   Check internet connection for cloud AI.
-   Try fallback mode if API fails.

**Goals showing 0% progress:**

-   Use format: `Progress: 30%` or `progress: 30`.
-   Place progress indicator near goal definition.
-   Ensure goal tags are recognized: `[GOAL]` or `#goal/`.

**Performance issues:**

-   Disable auto-indexing for large vaults.
-   Increase refresh interval.
-   Use manual indexing when needed.

## Privacy & Security

-   **Local by default**: All data stays in your vault.
-   **Optional cloud AI**: Only when explicitly configured.
-   **No telemetry**: Zero tracking or analytics.
-   **API keys encrypted**: Stored securely in Obsidian.
-   **Open source**: Audit the code yourself.

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Acknowledgments

-   Obsidian team for the amazing platform.
-   Community testers and contributors.
-   Open source libraries used in this project.

## Support

-   **Issues**: [GitHub Issues](https://github.com/shameemreza/vaultmind/issues)

---

**VaultMind** - Transform your Obsidian vault into an intelligent productivity system! 🚀
