import { ItemView, WorkspaceLeaf, Notice, setIcon, TFile, Modal, App } from 'obsidian';
import VaultMindPlugin from '../main';
import { DashboardData } from '../types';
import { parseTaskMetadata } from '../utils/parser';

export const VIEW_TYPE_DASHBOARD = 'vaultmind-dashboard';

export class DashboardView extends ItemView {
    plugin: VaultMindPlugin;
    private activeTagFilter: string | null = null;
    private activePriorityFilter: 'all' | 'high' | 'medium' | 'low' | 'none' = 'all';
    private refreshInterval: number | null = null;
    private timeUpdateInterval: number | null = null;
    private sortByPriority: boolean = true;
    
    constructor(leaf: WorkspaceLeaf, plugin: VaultMindPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return VIEW_TYPE_DASHBOARD;
    }

    getDisplayText(): string {
        return 'VaultMind Dashboard';
    }

    getIcon(): string {
        return 'brain';
    }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass('vaultmind-dashboard');
        
        // Create dashboard header
        const header = container.createEl('div', { cls: 'vaultmind-header' });
        const titleContainer = header.createEl('div', { cls: 'vaultmind-title-container' });
        
        // Add brain icon using Obsidian's icon system
        const iconEl = titleContainer.createEl('span', { cls: 'vaultmind-header-icon' });
        setIcon(iconEl, 'brain');
        
        const titleEl = titleContainer.createEl('h2', { text: 'VaultMind Dashboard' });
        
        // Add last updated time
        const now = new Date();
        titleEl.setAttr('title', `Last updated: ${now.toLocaleTimeString()}`);
        
        // Create refresh button with immediate visual feedback
        const refreshBtn = header.createEl('button', {
            text: 'Refresh',
            cls: 'vaultmind-button'
        });
        
        // Track if currently refreshing
        let isRefreshing = false;
        
        // Hover effects are handled by CSS
        
        // Add click visual feedback
        refreshBtn.addEventListener('mousedown', () => {
            if (!isRefreshing) {
                refreshBtn.addClass('vaultmind-scale-down');
            }
        });
        refreshBtn.addEventListener('mouseup', () => {
            if (!isRefreshing) {
                refreshBtn.removeClass('vaultmind-scale-down');
            }
        });
        
        refreshBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Prevent double-clicks
            if (isRefreshing) {
                // Already refreshing
                return;
            }
            
            // Refresh button clicked
            isRefreshing = true;
            
            // Immediate visual feedback
            refreshBtn.setText('Refreshing...');
            refreshBtn.addClass('vaultmind-disabled');
            refreshBtn.addClass('vaultmind-spinning');
            
            try {
                // Starting vault index
                // Re-index vault first
                await this.plugin.indexVault();
                
                // Wait a bit for indexing to complete
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // Refreshing dashboard
                // Refresh the entire dashboard
                await this.refresh();
                    
                new Notice('Dashboard refreshed!');
                // Dashboard refreshed
            } catch (error) {
                // Refresh failed
                new Notice('Unable to refresh dashboard. Please try again.');
            } finally {
                // Re-enable button
                isRefreshing = false;
                refreshBtn.setText('Refresh');
                refreshBtn.removeClass('vaultmind-disabled');
                refreshBtn.removeClass('vaultmind-spinning');
            }
        });
        
        // Create dashboard sections
        const content = container.createEl('div', { cls: 'vaultmind-content' });
        
        let statsContainer: HTMLElement | null = null;
        let tasksContainer: HTMLElement | null = null;
        let goalsContainer: HTMLElement | null = null;
        let timeContainer: HTMLElement | null = null;
        
        // Quick stats (conditional)
        if (this.plugin.settings.showQuickStatsInDashboard !== false) {
            const statsSection = content.createEl('div', { cls: 'vaultmind-section' });
            const statsHeader = statsSection.createEl('h3');
            const statsIcon = statsHeader.createEl('span', { cls: 'section-icon' });
            setIcon(statsIcon, 'bar-chart-2');
            statsHeader.createEl('span', { text: ' Quick Stats' });
            statsContainer = statsSection.createEl('div', { cls: 'vaultmind-stats' });
        }
        
        // Tasks section (always shown)
        const tasksSection = content.createEl('div', { cls: 'vaultmind-section' });
        const tasksHeader = tasksSection.createEl('h3', { cls: 'tasks-header-with-filters' });
        tasksHeader.empty(); // Clear any existing content
        tasksHeader.addClass('vaultmind-tasks-header');
        
        // Title part
        const tasksTitlePart = tasksHeader.createEl('div', { cls: 'tasks-title vaultmind-tasks-title-part' });
        const tasksIcon = tasksTitlePart.createEl('span', { cls: 'section-icon' });
        setIcon(tasksIcon, 'check-square');
        tasksTitlePart.createEl('span', { text: ' Tasks' });
        
        // Filter buttons
        const filterContainer = tasksHeader.createEl('div', { cls: 'task-filters-inline vaultmind-filter-container' });
        
        const priorities = [
            { value: 'all', label: 'All' },
            { value: 'high', label: 'High' },
            { value: 'medium', label: 'Medium' },
            { value: 'low', label: 'Low' }
        ];
        
        priorities.forEach(priority => {
            const btn = filterContainer.createEl('button', {
                text: priority.label,
                cls: `filter-btn-inline ${this.activePriorityFilter === priority.value ? 'active' : ''}`
            });
            btn.addEventListener('click', () => {
                // Toggle filter - if clicking the same filter, reset to 'all'
                if (this.activePriorityFilter === priority.value && priority.value !== 'all') {
                    this.activePriorityFilter = 'all';
                } else {
                    this.activePriorityFilter = priority.value as any;
                }
                this.refresh();
            });
        });
        
        tasksContainer = tasksSection.createEl('div', { cls: 'vaultmind-tasks' });
        
        // Goals section (conditional)
        if (this.plugin.settings.showGoalsInDashboard !== false) {
            const goalsSection = content.createEl('div', { cls: 'vaultmind-section' });
            const goalsHeader = goalsSection.createEl('h3');
            const goalsIcon = goalsHeader.createEl('span', { cls: 'section-icon' });
            setIcon(goalsIcon, 'target');
            goalsHeader.createEl('span', { text: ' Goals' });
            goalsContainer = goalsSection.createEl('div', { cls: 'vaultmind-goals' });
        }
        
        // Time tracking section (conditional)
        if (this.plugin.settings.showTimeTrackingInDashboard !== false) {
            const timeSection = content.createEl('div', { cls: 'vaultmind-section' });
            const timeHeader = timeSection.createEl('h3');
            const timeIcon = timeHeader.createEl('span', { cls: 'section-icon' });
            setIcon(timeIcon, 'clock');
            timeHeader.createEl('span', { text: ' Time Tracking' });
            timeContainer = timeSection.createEl('div', { cls: 'vaultmind-time' });
        }
        
        // Load data (only for enabled sections)
        await this.loadDashboardData(
            statsContainer,
            tasksContainer,
            goalsContainer,
            timeContainer
        );
        
        // Set up auto-refresh every 5 minutes
        if (this.refreshInterval) {
            window.clearInterval(this.refreshInterval);
        }
        this.refreshInterval = window.setInterval(async () => {
            // Auto-refreshing
            await this.refresh();
        }, 5 * 60 * 1000); // 5 minutes
    }

    async onClose() {
        // Clean up auto-refresh
        if (this.refreshInterval) {
            window.clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
        if (this.timeUpdateInterval) {
            window.clearInterval(this.timeUpdateInterval);
            this.timeUpdateInterval = null;
        }
    }

    async refresh() {
        // Refreshing dashboard
        
        // Clear any existing intervals
        if (this.refreshInterval) {
            window.clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
        if (this.timeUpdateInterval) {
            window.clearInterval(this.timeUpdateInterval);
            this.timeUpdateInterval = null;
        }
        
        // Completely re-render the dashboard
        await this.onOpen();
        
        // Dashboard refresh complete
    }

    private async loadDashboardData(
        statsEl: HTMLElement | null,
        tasksEl: HTMLElement | null,
        goalsEl: HTMLElement | null,
        timeEl: HTMLElement | null
    ) {
        // Get dashboard data
        const data = await this.getDashboardData();
        
        // Render quick stats (if enabled)
        if (statsEl) {
            this.renderQuickStats(statsEl, data);
        }
        
        // Render tasks (always)
        if (tasksEl) {
            this.renderTasks(tasksEl, data);
        }
        
        // Render goals (if enabled)
        if (goalsEl) {
            this.renderGoals(goalsEl, data);
        }
        
        // Render time tracking (if enabled)
        if (timeEl) {
            this.renderTimeTracking(timeEl, data);
        }
    }

    private async getDashboardData(): Promise<DashboardData> {
        // Getting dashboard data
        
        // Manually scan vault for real tasks
        const files = this.plugin.app.vault.getMarkdownFiles();
        const realTasks: any[] = [];
        const projects = new Set<string>();
        
        for (const file of files) {
            const content = await this.plugin.app.vault.read(file);
            const lines = content.split('\n');
            
            lines.forEach((line, index) => {
                const taskMatch = line.match(/^\s*- \[([ x])\]\s+(.+)/);
                if (taskMatch) {
                    const completed = taskMatch[1] === 'x';
                    const text = taskMatch[2];
                    const dateMatch = text.match(/📅\s*(\d{4}-\d{2}-\d{2})/);
                    const dueDate = dateMatch ? new Date(dateMatch[1]) : null;
                    
                    // Extract projects from #project tags
                    const projectMatches = text.match(/#([\w-]+)/g);
                    if (projectMatches) {
                        projectMatches.forEach(p => projects.add(p));
                    }
                    
                    // Use the parser to get proper priority
                    const parsedTask = parseTaskMetadata(text.replace(/^- \[([ x])\] /, ''));
                    
                    const taskObj = {
                        id: `${file.path}-${index}`,
                        content: text,
                        text,
                        completed,
                        dueDate: parsedTask.dueDate || dueDate,
                        completedAt: completed ? new Date() : null,
                        priority: parsedTask.priority, // Use parsed priority, not hardcoded
                        filePath: file.path,
                        lineNumber: index,
                        project: projectMatches ? projectMatches[0] : null,
                        tags: parsedTask.tags
                    };
                    
                    // Debug log for first few tasks
                    if (realTasks.length < 5) {
                        // Task created
                    }
                    
                    realTasks.push(taskObj);
                }
            });
        }
        
        // Tasks found in vault
        
        // Use real tasks if found, otherwise fall back to engine
        const tasks = realTasks.length > 0 ? realTasks : this.plugin.taskEngine.getTasks();
        const goals = this.plugin.goalEngine.getGoals();
        const timeStats = this.plugin.timeTracker.getStatistics();
        const notifications = this.plugin.notificationService.getNotifications(true);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        return {
            tasks: {
                today: tasks.filter(t => 
                    t.dueDate && 
                    new Date(t.dueDate).toDateString() === today.toDateString() &&
                    !t.completed
                ),
                overdue: tasks.filter(t => 
                    t.dueDate && 
                    new Date(t.dueDate) < today &&
                    !t.completed
                ),
                upcoming: tasks.filter(t => 
                    t.dueDate && 
                    new Date(t.dueDate) > today &&
                    !t.completed
                ).slice(0, 5),
                pending: tasks.filter(t => !t.completed), // All pending tasks
                projects: Array.from(projects) // All projects found
            },
            goals: {
                active: goals.filter(g => g.status === 'active').slice(0, 5),
                recentProgress: {}
            },
            time: {
                todayTotal: timeStats.todayTotal,
                currentSession: this.plugin.timeTracker.getActiveEntry() || undefined,
                recentEntries: this.plugin.timeTracker.getTodayEntries()
            },
            notifications,
            quickStats: {
                tasksCompletedToday: tasks.filter(t => 
                    t.completedAt && 
                    new Date(t.completedAt).toDateString() === today.toDateString()
                ).length,
                goalsOnTrack: goals.filter(g => g.progress >= 50).length,
                currentStreak: 0, // TODO: Calculate streak
                productivityScore: 0 // TODO: Calculate score
            }
        };
    }

    private renderQuickStats(container: HTMLElement, data: DashboardData) {
        container.empty();
        
        // Calculate accurate time today including active session
        let totalMinutesToday = data.time.todayTotal || 0;
        if (data.time.currentSession) {
            const sessionMinutes = Math.floor(
                (Date.now() - new Date(data.time.currentSession.startTime).getTime()) / (1000 * 60)
            );
            totalMinutesToday += sessionMinutes;
        }
        
        const hours = Math.floor(totalMinutesToday / 60);
        const minutes = totalMinutesToday % 60;
        const timeDisplay = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
        
        const stats = [
            { label: 'Tasks Today', value: data.tasks.today.length, icon: 'calendar' },
            { label: 'Completed', value: data.quickStats.tasksCompletedToday, icon: 'check-circle' },
            { label: 'Overdue', value: data.tasks.overdue.length, icon: 'alert-triangle' },
            { label: 'Time Today', value: timeDisplay, icon: 'clock' }
        ];
        
        stats.forEach(stat => {
            const statEl = container.createEl('div', { cls: 'vaultmind-stat' });
            const iconEl = statEl.createEl('span', { cls: 'stat-icon' });
            setIcon(iconEl, stat.icon);
            statEl.createEl('span', { text: String(stat.value), cls: 'stat-value' });
            statEl.createEl('span', { text: stat.label, cls: 'stat-label' });
        });
    }

    private renderTasks(container: HTMLElement, data: DashboardData) {
        container.empty();
        
        // IMPORTANT: Never show "No active goals" here - this is the TASKS section!
        
        // Helper function to create clickable task with checkbox
        const createTaskElement = (task: any, list: HTMLElement, isOverdue: boolean = false) => {
            const li = list.createEl('li');
            li.addClass('vaultmind-task-item');
            
            // Add checkbox
            const checkbox = li.createEl('input', {
                type: 'checkbox',
                cls: 'task-checkbox'
            }) as HTMLInputElement;
            checkbox.checked = task.completed || false;
            checkbox.addClass('vaultmind-checkbox');
            checkbox.addClass('vaultmind-checkbox-wrapper');
            checkbox.addClass('vaultmind-flex-shrink-0');
            
            // Handle checkbox click
            checkbox.addEventListener('click', async (e) => {
                e.stopPropagation();
                // Toggle task completion
                
                // If task was being tracked and is now completed, stop tracking
                const activeEntry = this.plugin.timeTracker.getActiveEntry();
                if (activeEntry && activeEntry.description === task.content && !checkbox.checked) {
                    await this.plugin.timeTracker.stopTracking();
                    new Notice('Time tracking stopped (task completed)');
                }
                
                // Update task in file
                if (task.filePath) {
                    const file = this.plugin.app.vault.getAbstractFileByPath(task.filePath);
                    if (file && file instanceof TFile) {
                        const content = await this.plugin.app.vault.read(file);
                        const lines = content.split('\n');
                        if (lines[task.lineNumber]) {
                            // Toggle the checkbox in the file
                            lines[task.lineNumber] = lines[task.lineNumber].replace(
                                /- \[([ x])\]/,
                                checkbox.checked ? '- [x]' : '- [ ]'
                            );
                            await this.plugin.app.vault.modify(file, lines.join('\n'));
                            new Notice(checkbox.checked ? 'Task completed!' : 'Task uncompleted');
                            
                            // Refresh dashboard
                            setTimeout(() => this.refresh(), 500);
                        }
                    }
                }
            });
            
            // Add priority badge if task has priority
            if (task.priority) {
                const priorityBadge = li.createEl('span', {
                    cls: `priority-badge priority-${task.priority}`,
                    text: task.priority.toUpperCase(),
                    attr: { 'title': `${task.priority} priority` }
                });
            }
            
            const taskContentEl = li.createEl('span', { cls: 'task-content' });
            
            // Parse content for tags and make them clickable
            const content = task.content || 'Untitled task';
            const tagPattern = /#[a-zA-Z0-9_\/\-]+/g;
            let lastIndex = 0;
            let match: RegExpExecArray | null;
            
            while ((match = tagPattern.exec(content)) !== null) {
                // Add text before the tag
                if (match.index > lastIndex) {
                    taskContentEl.appendText(content.substring(lastIndex, match.index));
                }
                
                // Add the tag as a clickable element
                const tagEl = taskContentEl.createEl('span', {
                    cls: 'task-tag clickable-tag',
                    text: match[0]
                });
                tagEl.addClass('vaultmind-tag');
                const tagText = match[0];
                tagEl.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.filterTasksByTag(tagText);
                });
                
                lastIndex = match.index + match[0].length;
            }
            
            // Add remaining text after last tag
            if (lastIndex < content.length) {
                taskContentEl.appendText(content.substring(lastIndex));
            }
            
            // If no tags found, just set the text
            if (lastIndex === 0) {
                taskContentEl.setText(content);
            }
            
            if (isOverdue) li.addClass('overdue');
            if (task.priority === 'high') li.addClass('high-priority');
            
            // Make task clickable to open the file
            if (task.filePath && task.filePath.trim() !== '') {
                // Task has file path
                taskContentEl.addEventListener('click', async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    // Opening task file
                    const file = this.plugin.app.vault.getAbstractFileByPath(task.filePath);
                    if (file && file instanceof TFile) {
                        const leaf = this.plugin.app.workspace.getLeaf(false);
                        await leaf.openFile(file);
                        // Move cursor to the task line if possible
                        const view = leaf.view;
                        if (view && 'editor' in view && task.lineNumber !== undefined) {
                            const editor = (view as any).editor;
                            editor.setCursor({ line: task.lineNumber, ch: 0 });
                            editor.scrollIntoView({ from: { line: task.lineNumber, ch: 0 }, to: { line: task.lineNumber, ch: 0 } }, true);
                        }
                    } else {
                        console.error('VaultMind: File not found:', task.filePath);
                        new Notice(`Could not open file: ${task.filePath}`);
                    }
                });
                taskContentEl.addClass('vaultmind-task-content');
            } else {
                // If no file path, log for debugging
                console.warn('VaultMind: Task without filePath:', task.content, 'Task object:', task);
                taskContentEl.addClass('vaultmind-task-disabled');
                taskContentEl.title = 'Source file not found';
            }
        };
        
        // Apply filters and sorting
        const filteredOverdue = this.sortTasksByPriority(
            this.applyPriorityFilter(this.applyTagFilter(data.tasks.overdue))
        );
        const filteredToday = this.sortTasksByPriority(
            this.applyPriorityFilter(this.applyTagFilter(data.tasks.today))
        );
        const filteredUpcoming = this.sortTasksByPriority(
            this.applyPriorityFilter(this.applyTagFilter(data.tasks.upcoming))
        );
        
        // Show active tag filter if any
        if (this.activeTagFilter) {
            const filterInfo = container.createEl('div', { 
                cls: 'active-tag-filter',
                text: `Filtering by tag: ${this.activeTagFilter} `
            });
            filterInfo.style.marginBottom = '10px';
            filterInfo.style.fontSize = '12px';
            filterInfo.style.color = 'var(--text-muted)';
            
            const clearBtn = filterInfo.createEl('button', {
                text: 'Clear',
                cls: 'clear-tag-filter'
            });
            clearBtn.style.marginLeft = '8px';
            clearBtn.style.fontSize = '11px';
            clearBtn.addEventListener('click', () => {
                this.activeTagFilter = null;
                this.refresh();
            });
        }
        
        // Check if any tasks match the filter
        const pendingWithoutDatesPreview = this.sortTasksByPriority(
            this.applyPriorityFilter(this.applyTagFilter(
                ((data.tasks as any).pending?.filter((t: any) => !t.dueDate) || [])))
        );
        const hasFilteredTasks = filteredOverdue.length > 0 || filteredToday.length > 0 || 
                                 filteredUpcoming.length > 0 || pendingWithoutDatesPreview.length > 0;
        
        if (!hasFilteredTasks && this.activePriorityFilter !== 'all') {
            const noResultsEl = container.createEl('div', { 
                cls: 'no-filter-results',
                text: `No tasks found with ${this.activePriorityFilter} priority`
            });
            noResultsEl.style.padding = '20px';
            noResultsEl.style.textAlign = 'center';
            noResultsEl.style.color = 'var(--text-muted)';
            noResultsEl.style.fontStyle = 'italic';
        }
        
        // Overdue tasks
        if (filteredOverdue.length > 0) {
            const overdueEl = container.createEl('div', { cls: 'task-group' });
            const overdueHeader = overdueEl.createEl('h4');
            const overdueIcon = overdueHeader.createEl('span', { cls: 'task-group-icon' });
            setIcon(overdueIcon, 'alert-triangle');
            overdueHeader.createEl('span', { text: ` Overdue (${filteredOverdue.length})` });
            const overdueList = overdueEl.createEl('ul');
            // Show up to 10 overdue tasks initially
            const maxOverdue = Math.min(10, filteredOverdue.length);
            filteredOverdue.slice(0, maxOverdue).forEach(task => {
                createTaskElement(task, overdueList, true);
            });
            
            // Show remaining count if there are more
            if (filteredOverdue.length > maxOverdue) {
                const moreEl = overdueList.createEl('li', { 
                    text: `... and ${filteredOverdue.length - maxOverdue} more overdue tasks`,
                    cls: 'more-tasks-note'
                });
                moreEl.addClass('vaultmind-more-tasks');
            }
        }
        
        // Today's tasks
        if (filteredToday.length > 0) {
            const todayEl = container.createEl('div', { cls: 'task-group' });
            const todayHeader = todayEl.createEl('h4');
            const todayIcon = todayHeader.createEl('span', { cls: 'task-group-icon' });
            setIcon(todayIcon, 'calendar');
            todayHeader.createEl('span', { text: ` Today (${filteredToday.length})` });
            const todayList = todayEl.createEl('ul');
            // Show up to 10 today's tasks initially
            const maxToday = Math.min(10, filteredToday.length);
            filteredToday.slice(0, maxToday).forEach(task => {
                createTaskElement(task, todayList);
            });
            
            // Show remaining count if there are more
            if (filteredToday.length > maxToday) {
                const moreEl = todayList.createEl('li', { 
                    text: `... and ${filteredToday.length - maxToday} more tasks for today`,
                    cls: 'more-tasks-note'
                });
                moreEl.addClass('vaultmind-more-tasks');
            }
        }
        
        // Upcoming tasks
        if (filteredUpcoming.length > 0) {
            const upcomingEl = container.createEl('div', { cls: 'task-group' });
            const upcomingHeader = upcomingEl.createEl('h4');
            const upcomingIcon = upcomingHeader.createEl('span', { cls: 'task-group-icon' });
            setIcon(upcomingIcon, 'calendar-days');
            upcomingHeader.createEl('span', { text: ` Upcoming` });
            const             upcomingList = upcomingEl.createEl('ul');
            filteredUpcoming.forEach(task => {
                createTaskElement(task, upcomingList);
            });
        }
        
        // All pending tasks (without dates) - apply both filters
        const allPending = (data.tasks as any).pending?.filter((t: any) => !t.dueDate) || [];
        const pendingWithoutDates = this.sortTasksByPriority(
            this.applyPriorityFilter(this.applyTagFilter(allPending))
        );
        
        if (pendingWithoutDates.length > 0) {
            const pendingEl = container.createEl('div', { cls: 'task-group' });
            const pendingHeader = pendingEl.createEl('h4');
            const pendingIcon = pendingHeader.createEl('span', { cls: 'task-group-icon' });
            setIcon(pendingIcon, 'list-checks');
            
            // Show filtered count if filter is active
            const hasFilter = this.activeTagFilter || this.activePriorityFilter !== 'all';
            const headerText = hasFilter && allPending.length !== pendingWithoutDates.length
                ? ` Pending (${pendingWithoutDates.length} of ${allPending.length})`
                : ` Pending (${pendingWithoutDates.length})`;
            pendingHeader.createEl('span', { text: headerText });
            
            const pendingList = pendingEl.createEl('ul');
            
            // Show first batch of tasks
            const initialShow = 10;
            let showing = initialShow;
            
            const renderPendingTasks = (count: number) => {
                pendingList.empty();
                pendingWithoutDates.slice(0, count).forEach((task: any) => {
                    createTaskElement(task, pendingList);
                });
                
                // Add "Show more/less" button if there are more tasks
                if (pendingWithoutDates.length > initialShow) {
                    const buttonContainer = pendingList.createEl('li', { cls: 'show-more-container' });
                    buttonContainer.style.listStyle = 'none';
                    buttonContainer.style.marginTop = '10px';
                    
                    const showMoreBtn = buttonContainer.createEl('button', {
                        text: count < pendingWithoutDates.length 
                            ? `Show ${Math.min(10, pendingWithoutDates.length - count)} more (${pendingWithoutDates.length - count} remaining)`
                            : 'Show less',
                        cls: 'mod-cta'
                    });
                    showMoreBtn.style.width = '100%';
                    showMoreBtn.style.fontSize = '0.9em';
                    showMoreBtn.style.padding = '4px 8px';
                    
                    showMoreBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (showing < pendingWithoutDates.length) {
                            showing = Math.min(showing + 10, pendingWithoutDates.length);
                        } else {
                            showing = initialShow;
                        }
                        renderPendingTasks(showing);
                    });
                }
            };
            
            renderPendingTasks(showing);
        }
        
        // Tags (only show if enabled in settings)
        if (this.plugin.settings.showTagsInDashboard !== false) {  // Default to true
            const projects = (data.tasks as any).projects || [];
            if (projects.length > 0) {
                const projectsEl = container.createEl('div', { cls: 'task-group' });
                const projectsHeader = projectsEl.createEl('h4');
                const projectsIcon = projectsHeader.createEl('span', { cls: 'task-group-icon' });
                setIcon(projectsIcon, 'tag');
                projectsHeader.createEl('span', { text: ` Tags` });
                const projectsList = projectsEl.createEl('div', { cls: 'project-tags' });
                projects.forEach((project: string) => {
                    const tag = projectsList.createEl('span', { 
                        text: project, 
                        cls: 'project-tag' 
                    });
                    // Make tags clickable to filter tasks
                    tag.addClass('vaultmind-tag');
                    
                    tag.addEventListener('click', () => {
                        // Filter by tag
                        this.filterTasksByTag(project);
                    });
                });
            }
        }
        
        // Only show empty message if NO tasks at all
        const allPendingForCheck = (data.tasks as any).pending || [];
        if (allPendingForCheck.length === 0 && data.tasks.overdue.length === 0 && data.tasks.today.length === 0 && data.tasks.upcoming.length === 0) {
            const emptyEl = container.createEl('div', { cls: 'empty-state' });
            emptyEl.setText('No pending tasks!');
        }
    }

    private renderGoals(container: HTMLElement, data: DashboardData) {
        container.empty();
        
        if (data.goals.active.length === 0) {
            container.createEl('p', { text: 'No active goals', cls: 'empty-state' });
            return;
        }
        
        data.goals.active.forEach(goal => {
            const goalEl = container.createEl('div', { cls: 'goal-item' });
            
            // Make goal title clickable
            const titleEl = goalEl.createEl('h4', { cls: 'goal-title clickable' });
            titleEl.setText(goal.title);
            
            // Log progress value for debugging
            console.debug(`VaultMind: Goal "${goal.title}" has progress: ${goal.progress}%`);
            
            // Add click handler to open the source file
            if (goal.filePath) {
                titleEl.addClass('vaultmind-goal-clickable');
                titleEl.addEventListener('click', async () => {
                    const file = this.plugin.app.vault.getAbstractFileByPath(goal.filePath);
                    if (file && file instanceof TFile) {
                        const leaf = this.plugin.app.workspace.getLeaf(false);
                        await leaf.openFile(file);
                        new Notice(`Opened goal: ${goal.title}`);
                    } else {
                        new Notice('Goal source file not found');
                    }
                });
                // Hover effects handled by CSS
            } else {
                titleEl.addClass('vaultmind-goal-disabled');
                titleEl.title = 'Source file not found';
            }
            
            // Progress bar with proper value
            const progressValue = goal.progress || 0;
            const progressBar = goalEl.createEl('div', { cls: 'progress-bar' });
            const progressFill = progressBar.createEl('div', { cls: 'progress-fill' });
            progressFill.style.width = `${progressValue}%`; // Dynamic value must stay inline
            
            const progressText = goalEl.createEl('span', { 
                text: `${progressValue}% complete`,
                cls: 'progress-text'
            });
            
            if (goal.targetDate) {
                const daysLeft = Math.floor(
                    (new Date(goal.targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                );
                goalEl.createEl('span', { 
                    text: `${daysLeft} days remaining`,
                    cls: 'deadline-text'
                });
            }
        });
    }

    private renderTimeTracking(container: HTMLElement, data: DashboardData) {
        container.empty();
        
        // Clear any existing interval
        if (this.timeUpdateInterval) {
            window.clearInterval(this.timeUpdateInterval);
            this.timeUpdateInterval = null;
        }
        
        // Current session
        if (data.time.currentSession) {
            const sessionEl = container.createEl('div', { cls: 'current-session' });
            const headerEl = sessionEl.createEl('h4');
            const headerIcon = headerEl.createEl('span', { cls: 'time-icon' });
            setIcon(headerIcon, 'timer');
            headerEl.createEl('span', { text: ' Active Session' });
            
            // Create duration element that updates in real-time
            const durationEl = sessionEl.createEl('p', { cls: 'session-duration' });
            
            // Update duration immediately and then every second
            const updateDuration = () => {
                const now = Date.now();
                const startTime = new Date(data.time.currentSession!.startTime).getTime();
                const totalSeconds = Math.floor((now - startTime) / 1000);
                const hours = Math.floor(totalSeconds / 3600);
                const minutes = Math.floor((totalSeconds % 3600) / 60);
                const seconds = totalSeconds % 60;
                
                let timeStr = '';
                if (hours > 0) {
                    timeStr = `${hours}h ${minutes}m ${seconds}s`;
                } else if (minutes > 0) {
                    timeStr = `${minutes}m ${seconds}s`;
                } else {
                    timeStr = `${seconds}s`;
                }
                
                durationEl.setText(timeStr);
                
                // Also update status bar
                if (this.plugin.statusBarItem) {
                    this.plugin.statusBarItem.setText(`Time: ${timeStr}`);
                }
            };
            
            updateDuration(); // Update immediately
            
            // Set up interval to update every second
            this.timeUpdateInterval = window.setInterval(updateDuration, 1000);
            
            const stopBtn = sessionEl.createEl('button', { 
                text: 'Stop Tracking',
                cls: 'stop-tracking-btn'
            });
            
            // Make button fully interactive
            stopBtn.addClass('vaultmind-interactive-btn');
            
            // Use addEventListener for better compatibility
            stopBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.debug('Stop tracking button clicked');
                try {
                    await this.plugin.timeTracker.stopTracking();
                    new Notice('Time tracking stopped');
                    await this.refresh();
                    // Update status bar if visible
                    if (this.plugin.statusBarItem) {
                        this.plugin.statusBarItem.setText('VaultMind: No active session');
                    }
                } catch (error) {
                    // Failed to stop tracking
                    new Notice('Unable to stop time tracking. Please try again.');
                }
            });
        } else {
            const buttonContainer = container.createEl('div', { cls: 'time-button-container' });
            const startBtn = buttonContainer.createEl('button', {
                text: 'Start Tracking',
                cls: 'start-tracking-btn'
            });
            
            // Make button fully interactive
            startBtn.addClass('vaultmind-interactive-btn');
            
            // Use addEventListener for better compatibility
            startBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.debug('Start tracking button clicked');
                
                // Show task selection modal
                const modal = new TaskSelectionModal(
                    this.plugin.app,
                    (data.tasks as any).pending || [],
                    async (selectedTask) => {
                        try {
                            const taskName = selectedTask ? selectedTask.content : 'Work Session';
                            const taskId = selectedTask ? selectedTask.id : undefined;
                            await this.plugin.timeTracker.startTracking(taskName, taskId);
                            new Notice(`Time tracking started: ${taskName}`);
                            await this.refresh();
                            // Update status bar if visible
                            if (this.plugin.statusBarItem) {
                                this.plugin.statusBarItem.setText('VaultMind: ⏱️ Tracking...');
                            }
                        } catch (error) {
                            console.error('Failed to start tracking:', error);
                            new Notice('Failed to start tracking');
                        }
                    }
                );
                modal.open();
            });
            
            // Add explanation text
            const helpText = buttonContainer.createEl('p', { 
                text: 'Track time spent on tasks and projects',
                cls: 'time-help-text'
            });
            helpText.addClass('vaultmind-help-text');
        }
        
        // Today's total (including current session)
        let totalMinutesToday = data.time.todayTotal || 0;
        if (data.time.currentSession) {
            const sessionMinutes = Math.floor(
                (Date.now() - new Date(data.time.currentSession.startTime).getTime()) / (1000 * 60)
            );
            totalMinutesToday += sessionMinutes;
        }
        
        const hours = Math.floor(totalMinutesToday / 60);
        const minutes = totalMinutesToday % 60;
        const totalEl = container.createEl('p', { cls: 'time-total' });
        totalEl.setText(`Today's Total: ${hours}h ${minutes}m`);
        
        // Recent entries
        if (data.time.recentEntries.length > 0) {
            const recentEl = container.createEl('div', { cls: 'recent-entries' });
            recentEl.createEl('h4', { text: 'Recent Entries' });
            const listContainer = recentEl.createDiv({ cls: 'recent-entries-list' });
            listContainer.addClass('vaultmind-scrollable-list');
            
            const list = listContainer.createEl('ul');
            
            // Show more entries and ensure descriptions are shown
            data.time.recentEntries.slice(0, 10).forEach(entry => {
                const li = list.createEl('li');
                const time = `${entry.duration || 0}m`;
                const desc = entry.description || 'Unnamed session';
                const startTime = new Date(entry.startTime).toLocaleTimeString();
                li.setText(`${time} - ${desc} (${startTime})`);
            });
            
            if (data.time.recentEntries.length > 10) {
                const moreEl = list.createEl('li');
                moreEl.setText(`... and ${data.time.recentEntries.length - 10} more`);
                moreEl.addClass('vaultmind-text-muted');
                moreEl.style.fontStyle = 'italic'; // Keep italic for emphasis
            }
        }
    }
    
    /**
     * Filter tasks by tag
     */
    private filterTasksByTag(tag: string) {
        if (this.activeTagFilter === tag) {
            // Clear filter if clicking same tag
            this.activeTagFilter = null;
            new Notice('Tag filter cleared');
        } else {
            this.activeTagFilter = tag;
            new Notice(`Filtering by tag: ${tag}`);
        }
        
        // Refresh the dashboard with filter
        this.refresh();
    }
    
    /**
     * Apply tag filter to tasks
     */
    private applyTagFilter(tasks: any[]): any[] {
        if (!this.activeTagFilter) return tasks;
        
        return tasks.filter(task => {
            const content = task.content || '';
            return content.includes(this.activeTagFilter);
        });
    }
    
    /**
     * Apply priority filter to tasks
     */
    private applyPriorityFilter(tasks: any[]): any[] {
        if (this.activePriorityFilter === 'all') return tasks;
        
        const filtered = tasks.filter(task => {
            if (this.activePriorityFilter === 'none') {
                return !task.priority;
            } else {
                return task.priority === this.activePriorityFilter;
            }
        });
        
        return filtered;
    }
    
    /**
     * Sort tasks by priority
     */
    private sortTasksByPriority(tasks: any[]): any[] {
        if (!this.sortByPriority) return tasks;
        
        const priorityOrder: Record<string, number> = { 
            'high': 0, 
            'medium': 1, 
            'low': 2 
        };
        
        return tasks.sort((a, b) => {
            // First sort by priority
            const aPriority = a.priority ? priorityOrder[a.priority] : 3;
            const bPriority = b.priority ? priorityOrder[b.priority] : 3;
            const priorityDiff = aPriority - bPriority;
            
            if (priorityDiff !== 0) return priorityDiff;
            
            // Then by due date if both have dates
            if (a.dueDate && b.dueDate) {
                return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
            }
            
            // Tasks with due dates come first
            if (a.dueDate) return -1;
            if (b.dueDate) return 1;
            
            // Finally alphabetically
            return (a.content || '').localeCompare(b.content || '');
        });
    }
}

// Task Selection Modal for Time Tracking
class TaskSelectionModal extends Modal {
    private tasks: any[];
    private onSelect: (task: any) => void;
    
    constructor(app: App, tasks: any[], onSelect: (task: any) => void) {
        super(app);
        this.tasks = tasks;
        this.onSelect = onSelect;
    }
    
    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        contentEl.createEl('h2', { text: 'Select Task to Track' });
        
        // Quick start button (no specific task)
        const quickStartBtn = contentEl.createEl('button', {
            text: 'Quick Start (No specific task)',
            cls: 'mod-cta'
        });
        quickStartBtn.addClass('vaultmind-modal-full-width');
        quickStartBtn.addEventListener('click', () => {
            this.onSelect(null);
            this.close();
        });
        
        // Filter input
        const filterContainer = contentEl.createDiv({ cls: 'task-filter-container' });
        const filterInput = filterContainer.createEl('input', {
            type: 'text',
            placeholder: 'Filter tasks...'
        });
        filterInput.addClass('vaultmind-modal-full-width');
        
        // Task list container
        const taskListContainer = contentEl.createDiv({ cls: 'task-selection-list' });
        taskListContainer.addClass('vaultmind-scrollable-400');
        
        // Render tasks
        const renderTasks = (filter: string = '') => {
            taskListContainer.empty();
            
            const filteredTasks = filter 
                ? this.tasks.filter(t => t.content.toLowerCase().includes(filter.toLowerCase()))
                : this.tasks;
            
            if (filteredTasks.length === 0) {
                taskListContainer.createEl('p', { 
                    text: 'No tasks found',
                    cls: 'empty-state'
                });
                return;
            }
            
            filteredTasks.slice(0, 20).forEach(task => {
                const taskItem = taskListContainer.createDiv({ cls: 'task-selection-item' });
                taskItem.addClass('vaultmind-task-item-pad');
                
                // Add task content
                const taskContent = taskItem.createEl('div', { text: task.content });
                
                // Add metadata (project, due date)
                const metadata = [];
                if (task.project) metadata.push(task.project);
                if (task.dueDate) metadata.push(`Due: ${new Date(task.dueDate).toLocaleDateString()}`);
                if (metadata.length > 0) {
                    const metaEl = taskItem.createEl('div', { 
                        text: metadata.join(' • '),
                        cls: 'task-metadata'
                    });
                    metaEl.addClass('vaultmind-task-meta');
                }
                
                // Hover effect
                // Hover effects handled by CSS
                
                // Click to select
                taskItem.addEventListener('click', () => {
                    this.onSelect(task);
                    this.close();
                });
            });
        };
        
        // Initial render
        renderTasks();
        
        // Filter on input
        filterInput.addEventListener('input', (e) => {
            renderTasks((e.target as HTMLInputElement).value);
        });
        
        // Focus filter input
        filterInput.focus();
    }
    
    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
