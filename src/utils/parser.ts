import { TFile, CachedMetadata } from 'obsidian';
import { VaultMindTask, VaultMindGoal } from '../types';
import { generateTaskId, generateGoalId } from './helpers';

// ============= Task Parsing =============

export function extractTasks(
    content: string,
    file: TFile,
    metadata: CachedMetadata | null
): VaultMindTask[] {
    const tasks: VaultMindTask[] = [];
    const lines = content.split('\n');
    
    // Parse checkbox tasks
    lines.forEach((line, index) => {
        const checkboxTask = parseCheckboxTask(line, file, index + 1);
        if (checkboxTask) {
            tasks.push(checkboxTask);
        }
    });
    
    // Also check metadata for tasks (for compatibility with Tasks plugin)
    if (metadata?.listItems) {
        metadata.listItems.forEach(item => {
            if (item.task !== undefined) {
                const line = lines[item.position.start.line];
                const task = parseTasksPluginSyntax(line, file, item.position.start.line + 1, item.task);
                if (task && !tasks.find(t => t.id === task.id)) {
                    tasks.push(task);
                }
            }
        });
    }
    
    return tasks;
}

function parseCheckboxTask(line: string, file: TFile, lineNumber: number): VaultMindTask | null {
    // Match checkbox syntax: - [ ] or - [x] or * [ ] etc.
    const checkboxRegex = /^[\s]*[-*+]\s+\[([ xX])\]\s+(.*)$/;
    const match = line.match(checkboxRegex);
    
    if (!match) return null;
    
    const completed = match[1] !== ' ';
    const content = match[2];
    
    // Parse additional metadata from content
    const { cleanContent, dueDate, priority, tags, estimatedTime } = parseTaskMetadata(content);
    
    return {
        id: generateTaskId(file, lineNumber),
        content: cleanContent,
        file: null, // Don't store TFile to avoid circular references
        filePath: file.path,
        line: lineNumber,
        completed,
        dueDate,
        priority,
        tags,
        createdAt: new Date(file.stat.ctime),
        completedAt: completed ? new Date(file.stat.mtime) : undefined,
        estimatedTime
    };
}

function parseTasksPluginSyntax(
    line: string,
    file: TFile,
    lineNumber: number,
    taskStatus: string
): VaultMindTask | null {
    const completed = taskStatus === 'x' || taskStatus === 'X';
    
    // Extract content after the checkbox
    const contentMatch = line.match(/^[\s]*[-*+]\s+\[.\]\s+(.*)$/);
    if (!contentMatch) return null;
    
    const content = contentMatch[1];
    const { cleanContent, dueDate, priority, tags, estimatedTime } = parseTaskMetadata(content);
    
    return {
        id: generateTaskId(file, lineNumber),
        content: cleanContent,
        file: null, // Don't store TFile to avoid circular references
        filePath: file.path,
        line: lineNumber,
        completed,
        dueDate,
        priority,
        tags,
        createdAt: new Date(file.stat.ctime),
        completedAt: completed ? new Date(file.stat.mtime) : undefined,
        estimatedTime
    };
}

function parseTaskMetadata(content: string): {
    cleanContent: string;
    dueDate?: Date;
    priority?: 'high' | 'medium' | 'low';
    tags: string[];
    estimatedTime?: number;
} {
    let cleanContent = content;
    let dueDate: Date | undefined;
    let priority: 'high' | 'medium' | 'low' | undefined;
    const tags: string[] = [];
    let estimatedTime: number | undefined;
    
    // Parse due date (📅 YYYY-MM-DD or due:: YYYY-MM-DD)
    const dueDateRegex = /(?:📅|🗓️|due::)\s*(\d{4}-\d{2}-\d{2})/gi;
    const dueDateMatch = dueDateRegex.exec(content);
    if (dueDateMatch) {
        dueDate = new Date(dueDateMatch[1]);
        cleanContent = cleanContent.replace(dueDateMatch[0], '').trim();
    }
    
    // Parse priority (⏫ high, 🔼 medium, 🔽 low or priority:: high/medium/low)
    const priorityEmojis: Record<string, 'high' | 'medium' | 'low'> = {
        '⏫': 'high',
        '🔼': 'medium', 
        '🔽': 'low'
    };
    
    for (const [emoji, prio] of Object.entries(priorityEmojis)) {
        if (content.includes(emoji)) {
            priority = prio;
            cleanContent = cleanContent.replace(emoji, '').trim();
            break;
        }
    }
    
    // Also check text-based priority
    const priorityTextRegex = /priority::\s*(high|medium|low)/i;
    const priorityTextMatch = priorityTextRegex.exec(content);
    if (priorityTextMatch && !priority) {
        priority = priorityTextMatch[1].toLowerCase() as 'high' | 'medium' | 'low';
        cleanContent = cleanContent.replace(priorityTextMatch[0], '').trim();
    }
    
    // Parse tags (#tag format)
    const tagRegex = /#([a-zA-Z0-9_-]+)/g;
    let tagMatch;
    while ((tagMatch = tagRegex.exec(content)) !== null) {
        tags.push(tagMatch[1]);
        cleanContent = cleanContent.replace(tagMatch[0], '').trim();
    }
    
    // Parse estimated time (⏱️ 30m or time:: 30m)
    const timeRegex = /(?:⏱️|time::)\s*(\d+)\s*([hm])/i;
    const timeMatch = timeRegex.exec(content);
    if (timeMatch) {
        const value = parseInt(timeMatch[1]);
        const unit = timeMatch[2].toLowerCase();
        estimatedTime = unit === 'h' ? value * 60 : value;
        cleanContent = cleanContent.replace(timeMatch[0], '').trim();
    }
    
    return {
        cleanContent,
        dueDate,
        priority,
        tags,
        estimatedTime
    };
}

// ============= Goal Parsing =============

export function extractGoals(
    content: string,
    file: TFile,
    frontmatter: Record<string, any>
): VaultMindGoal[] {
    const goals: VaultMindGoal[] = [];
    
    // Check frontmatter for goal definition
    if (frontmatter.goal || frontmatter.objective) {
        const goalData = frontmatter.goal || frontmatter.objective;
        const goal = parseGoalFromFrontmatter(goalData, file);
        if (goal) {
            goals.push(goal);
        }
    }
    
    // Look for goal sections in content
    const goalSections = extractGoalSections(content);
    goalSections.forEach(section => {
        const goal = parseGoalFromSection(section, file);
        if (goal) {
            goals.push(goal);
        }
    });
    
    return goals;
}

function parseGoalFromFrontmatter(
    goalData: any,
    file: TFile
): VaultMindGoal | null {
    if (typeof goalData === 'string') {
        // Simple goal definition
        return {
            id: generateGoalId(goalData),
            title: goalData,
            file: null, // Don't store TFile to avoid circular references
        filePath: file.path,
            progress: 0,
            status: 'active',
            milestones: [],
            linkedTasks: [],
            createdAt: new Date(file.stat.ctime),
            updatedAt: new Date(file.stat.mtime)
        };
    } else if (typeof goalData === 'object') {
        // Complex goal definition
        return {
            id: generateGoalId(goalData.title || goalData.name || 'untitled'),
            title: goalData.title || goalData.name || 'Untitled Goal',
            description: goalData.description,
            file: null, // Don't store TFile to avoid circular references
        filePath: file.path,
            targetDate: goalData.targetDate ? new Date(goalData.targetDate) : undefined,
            progress: goalData.progress || 0,
            status: goalData.status || 'active',
            milestones: parseGoalMilestones(goalData.milestones || []),
            linkedTasks: [],
            createdAt: new Date(file.stat.ctime),
            updatedAt: new Date(file.stat.mtime),
            category: goalData.category
        };
    }
    
    return null;
}

function extractGoalSections(content: string): string[] {
    const sections: string[] = [];
    const goalHeaderRegex = /^#{1,6}\s+(?:Goal|Objective|Target|Aim):\s+(.+)$/gm;
    let match;
    
    while ((match = goalHeaderRegex.exec(content)) !== null) {
        const startIndex = match.index;
        let endIndex = content.length;
        
        // Find the next header at the same or higher level
        const headerLevel = match[0].match(/^#+/)?.[0].length || 1;
        const nextHeaderRegex = new RegExp(`^#{1,${headerLevel}}\\s`, 'gm');
        nextHeaderRegex.lastIndex = startIndex + match[0].length;
        
        const nextMatch = nextHeaderRegex.exec(content);
        if (nextMatch) {
            endIndex = nextMatch.index;
        }
        
        sections.push(content.substring(startIndex, endIndex));
    }
    
    return sections;
}

function parseGoalFromSection(section: string, file: TFile): VaultMindGoal | null {
    const lines = section.split('\n');
    const headerLine = lines[0];
    
    const titleMatch = headerLine.match(/^#{1,6}\s+(?:Goal|Objective|Target|Aim):\s+(.+)$/);
    if (!titleMatch) return null;
    
    const title = titleMatch[1];
    const milestones: any[] = [];
    let description = '';
    let targetDate: Date | undefined;
    let category: string | undefined;
    
    // Parse the rest of the section
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Check for milestone
        if (line.startsWith('- [ ]') || line.startsWith('- [x]')) {
            const completed = line.startsWith('- [x]');
            const content = line.replace(/^- \[.\]\s*/, '');
            milestones.push({
                id: generateGoalId(content),
                title: content,
                completed,
                completedAt: completed ? new Date() : undefined
            });
        }
        // Check for metadata
        else if (line.startsWith('Target:') || line.startsWith('Deadline:')) {
            const dateStr = line.replace(/^(Target|Deadline):\s*/, '');
            targetDate = new Date(dateStr);
        } else if (line.startsWith('Category:')) {
            category = line.replace(/^Category:\s*/, '');
        }
        // Otherwise it's part of the description
        else if (line.length > 0) {
            description += line + '\n';
        }
    }
    
    return {
        id: generateGoalId(title),
        title,
        description: description.trim(),
        file: null, // Don't store TFile to avoid circular references
        filePath: file.path,
        targetDate,
        progress: calculateProgressFromMilestones(milestones),
        status: 'active',
        milestones: parseGoalMilestones(milestones),
        linkedTasks: [],
        createdAt: new Date(file.stat.ctime),
        updatedAt: new Date(file.stat.mtime),
        category
    };
}

function parseGoalMilestones(milestones: any[]): any[] {
    if (!Array.isArray(milestones)) return [];
    
    return milestones.map((m, index) => {
        if (typeof m === 'string') {
            return {
                id: generateGoalId(m),
                title: m,
                completed: false
            };
        }
        return {
            id: m.id || generateGoalId(m.title || `milestone-${index}`),
            title: m.title || m.name || `Milestone ${index + 1}`,
            completed: m.completed || false,
            completedAt: m.completedAt ? new Date(m.completedAt) : undefined,
            targetDate: m.targetDate ? new Date(m.targetDate) : undefined
        };
    });
}

function calculateProgressFromMilestones(milestones: any[]): number {
    if (milestones.length === 0) return 0;
    
    const completed = milestones.filter(m => m.completed).length;
    return Math.round((completed / milestones.length) * 100);
}

// ============= Markdown Parsing =============

export function parseMarkdownContent(content: string): {
    headings: { level: number; text: string; line: number }[];
    codeBlocks: { language: string; code: string; line: number }[];
    links: { text: string; url: string; line: number }[];
    images: { alt: string; url: string; line: number }[];
    blockquotes: { text: string; line: number }[];
    tables: { headers: string[]; rows: string[][]; line: number }[];
} {
    const result = {
        headings: [] as any[],
        codeBlocks: [] as any[],
        links: [] as any[],
        images: [] as any[],
        blockquotes: [] as any[],
        tables: [] as any[]
    };
    
    const lines = content.split('\n');
    let inCodeBlock = false;
    let currentCodeBlock: any = null;
    let inTable = false;
    let currentTable: any = null;
    
    lines.forEach((line, index) => {
        // Code blocks
        if (line.startsWith('```')) {
            if (!inCodeBlock) {
                const language = line.slice(3).trim();
                currentCodeBlock = { language, code: '', line: index + 1 };
                inCodeBlock = true;
            } else {
                result.codeBlocks.push(currentCodeBlock);
                currentCodeBlock = null;
                inCodeBlock = false;
            }
            return;
        }
        
        if (inCodeBlock && currentCodeBlock) {
            currentCodeBlock.code += line + '\n';
            return;
        }
        
        // Headings
        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
            result.headings.push({
                level: headingMatch[1].length,
                text: headingMatch[2],
                line: index + 1
            });
        }
        
        // Links
        const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
        let linkMatch;
        while ((linkMatch = linkRegex.exec(line)) !== null) {
            result.links.push({
                text: linkMatch[1],
                url: linkMatch[2],
                line: index + 1
            });
        }
        
        // Images
        const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
        let imageMatch;
        while ((imageMatch = imageRegex.exec(line)) !== null) {
            result.images.push({
                alt: imageMatch[1],
                url: imageMatch[2],
                line: index + 1
            });
        }
        
        // Blockquotes
        if (line.startsWith('>')) {
            result.blockquotes.push({
                text: line.slice(1).trim(),
                line: index + 1
            });
        }
        
        // Tables
        if (line.includes('|')) {
            if (!inTable) {
                currentTable = { headers: [], rows: [], line: index + 1 };
                const cells = line.split('|').map(c => c.trim()).filter(c => c);
                currentTable.headers = cells;
                inTable = true;
            } else if (line.match(/^[\s\-|]+$/)) {
                // Table separator line, skip
            } else {
                const cells = line.split('|').map(c => c.trim()).filter(c => c);
                currentTable.rows.push(cells);
            }
        } else if (inTable && currentTable) {
            result.tables.push(currentTable);
            currentTable = null;
            inTable = false;
        }
    });
    
    // Handle unclosed blocks
    if (currentCodeBlock) {
        result.codeBlocks.push(currentCodeBlock);
    }
    if (currentTable) {
        result.tables.push(currentTable);
    }
    
    return result;
}

// ============= Time Parsing =============

export function parseTimeBlocks(content: string): {
    startTime?: Date;
    endTime?: Date;
    duration?: number;
    description?: string;
}[] {
    const timeBlocks: any[] = [];
    const timeBlockRegex = /(?:^|\n)(?:Time|Duration|Session):\s*(.+?)(?:\n|$)/gi;
    let match;
    
    while ((match = timeBlockRegex.exec(content)) !== null) {
        const timeStr = match[1];
        const parsed = parseTimeString(timeStr);
        if (parsed) {
            timeBlocks.push(parsed);
        }
    }
    
    return timeBlocks;
}

function parseTimeString(str: string): any {
    // Parse various time formats
    // Examples: "10:00-11:30", "2h 30m", "9am to 11:30am"
    
    // Format: HH:MM-HH:MM
    const rangeMatch = str.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
    if (rangeMatch) {
        const startHour = parseInt(rangeMatch[1]);
        const startMin = parseInt(rangeMatch[2]);
        const endHour = parseInt(rangeMatch[3]);
        const endMin = parseInt(rangeMatch[4]);
        
        const today = new Date();
        const startTime = new Date(today);
        startTime.setHours(startHour, startMin, 0, 0);
        
        const endTime = new Date(today);
        endTime.setHours(endHour, endMin, 0, 0);
        
        const duration = (endTime.getTime() - startTime.getTime()) / (1000 * 60);
        
        return { startTime, endTime, duration };
    }
    
    // Format: Xh Ym
    const durationMatch = str.match(/(?:(\d+)\s*h(?:ours?)?)?\s*(?:(\d+)\s*m(?:ins?|inutes?)?)?/i);
    if (durationMatch && (durationMatch[1] || durationMatch[2])) {
        const hours = parseInt(durationMatch[1] || '0');
        const minutes = parseInt(durationMatch[2] || '0');
        const duration = hours * 60 + minutes;
        
        return { duration };
    }
    
    return null;
}
