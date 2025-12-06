import { TFile } from 'obsidian';
import { VaultMindGoal, Milestone } from '../types';

interface GoalFrontmatter {
    goal?: string | GoalData | GoalData[];
    goals?: string | GoalData | GoalData[];
    objective?: string | string[];
    objectives?: string | string[];
}

type GoalStatus = 'active' | 'completed' | 'paused' | 'cancelled';

interface GoalData {
    title?: string;
    name?: string;
    description?: string;
    progress?: number;
    targetDate?: string;
    status?: GoalStatus;
    category?: string;
    milestones?: MilestoneData[];
    completedDate?: string;
}

interface MilestoneData {
    id?: string;
    title?: string;
    name?: string;
    completed?: boolean;
    completedAt?: string;
    targetDate?: string;
    date?: Date;
}

/**
 * Parse goals from note content and frontmatter
 * Goals can be defined in multiple ways:
 * 1. Frontmatter: goal: "Goal title"
 * 2. Heading with goal keyword: ## Goal: Complete project
 * 3. Special syntax: [GOAL] Goal description
 * 4. Tags: #goal/project-name
 */
export function parseGoalsFromNote(
    file: TFile, 
    content: string, 
    frontmatter: GoalFrontmatter | null | undefined
): VaultMindGoal[] {
    const goals: VaultMindGoal[] = [];
    
    // 1. Check frontmatter for goals
    if (frontmatter) {
        const goalData = frontmatter.goal || frontmatter.goals;
        if (goalData) {
            if (typeof goalData === 'string') {
                goals.push(createGoal(file, goalData, 'frontmatter'));
            } else if (Array.isArray(goalData)) {
                goalData.forEach(g => {
                    if (typeof g === 'string') {
                        goals.push(createGoal(file, g, 'frontmatter'));
                    } else if (g.title) {
                        goals.push(createGoal(file, g.title, 'frontmatter', g));
                    }
                });
            } else if (goalData.title) {
                goals.push(createGoal(file, goalData.title, 'frontmatter', goalData));
            }
        }
        
        // Check for objectives/targets as goals
        if (frontmatter.objective || frontmatter.objectives) {
            const objData = frontmatter.objective || frontmatter.objectives;
            if (typeof objData === 'string') {
                goals.push(createGoal(file, objData, 'objective'));
            } else if (Array.isArray(objData)) {
                objData.forEach(o => {
                    if (typeof o === 'string') {
                        goals.push(createGoal(file, o, 'objective'));
                    }
                });
            }
        }
    }
    
    // 2. Parse from content - headings with goal keyword
    const headingPattern = /^#{1,6}\s+(Goal|Objective|Target|Milestone):\s*(.+)$/gmi;
    let match;
    while ((match = headingPattern.exec(content)) !== null) {
        const title = match[2].trim();
        if (title) {
            goals.push(createGoal(file, title, match[1].toLowerCase()));
        }
    }
    
    // 3. Special syntax [GOAL] or [OBJECTIVE]
    const goalSyntaxPattern = /\[(GOAL|OBJECTIVE|TARGET)\]\s*(.+?)(?:\n|$)/gi;
    while ((match = goalSyntaxPattern.exec(content)) !== null) {
        const title = match[2].trim();
        if (title) {
            const goal = createGoal(file, title, match[1].toLowerCase());
            // Look for progress indicator near this goal (within next 5 lines)
            const goalIndex = match.index;
            const nearbyContent = content.substring(goalIndex, goalIndex + 300);
            const progressMatch = nearbyContent.match(/(?:Progress|progress)[:\s]+(\d+)%?/i);
            if (progressMatch) {
                const progressValue = Math.min(100, Math.max(0, parseInt(progressMatch[1])));
                goal.progress = progressValue;
                console.debug(`VaultMind: Found progress ${progressValue}% for goal "${title}"`);
            }
            goals.push(goal);
        }
    }
    
    // 4. Parse from tags #goal/...
    const tagPattern = new RegExp('#goal/([a-zA-Z0-9_-]+)', 'g');
    while ((match = tagPattern.exec(content)) !== null) {
        const goalName = match[1].replace(/-/g, ' ').replace(/_/g, ' ');
        const goal = createGoal(file, goalName, 'tag');
        // Look for progress indicator near this tag (within next 5 lines)
        const tagIndex = match.index;
        const nearbyContent = content.substring(tagIndex, tagIndex + 300);
        const progressMatch = nearbyContent.match(/(?:Progress|progress)[:\s]+(\d+)%?/i);
        if (progressMatch) {
            const progressValue = Math.min(100, Math.max(0, parseInt(progressMatch[1])));
            goal.progress = progressValue;
            console.debug(`VaultMind: Found progress ${progressValue}% for goal tag "${goalName}"`);
        }
        goals.push(goal);
    }
    
    // 5. Parse milestones and progress from content
    goals.forEach(goal => {
        // Parse milestones
        const milestonePattern = /- \[[ x]\] (?:Milestone:\s*)?(.+)/gi;
        const milestones: Milestone[] = [];
        let milestoneMatch;
        
        // Look for milestones in the vicinity of the goal
        const goalIndex = content.indexOf(goal.title);
        const nearbyContent = content.substring(goalIndex, Math.min(goalIndex + 500, content.length));
        
        while ((milestoneMatch = milestonePattern.exec(nearbyContent)) !== null) {
            const milestoneText = milestoneMatch[1].trim();
            // Skip if it's a progress indicator
            if (!milestoneText.toLowerCase().startsWith('progress:')) {
                milestones.push({
                    id: `milestone-${Date.now()}-${milestones.length}`,
                    title: milestoneText,
                    completed: milestoneMatch[0].includes('[x]'),
                });
            }
        }
        
        if (milestones.length > 0) {
            goal.milestones = milestones;
        }
        
        // Also check for standalone Progress lines like "- [ ] Progress: 30"
        const progressLineMatch = nearbyContent.match(/- \[[ x]\]\s*(?:Progress|progress)[:\s]+(\d+)%?/i);
        if (progressLineMatch && !goal.progress) {
            const progressValue = Math.min(100, Math.max(0, parseInt(progressLineMatch[1])));
            goal.progress = progressValue;
            console.debug(`VaultMind: Found progress from checkbox line ${progressValue}% for goal "${goal.title}"`);
        }
    });
    
    // 6. Calculate initial progress
    goals.forEach(goal => {
        if (goal.milestones.length > 0) {
            const completed = goal.milestones.filter(m => m.completed).length;
            goal.progress = Math.round((completed / goal.milestones.length) * 100);
        }
    });
    
    return goals;
}

/**
 * Create a goal object
 */
function createGoal(
    file: TFile, 
    title: string, 
    type: string, 
    metadata: GoalData = {}
): VaultMindGoal {
    const id = `goal-${file.path}-${title.toLowerCase().replace(/\s+/g, '-')}`;
    
    // Convert MilestoneData to Milestone
    const milestones: Milestone[] = (metadata.milestones || []).map((m, index): Milestone => ({
        id: m.id || `milestone-${index}`,
        title: m.title || m.name || `Milestone ${index + 1}`,
        completed: m.completed || false,
        completedAt: m.completedAt ? new Date(m.completedAt) : undefined,
        targetDate: m.targetDate ? new Date(m.targetDate) : undefined,
    }));

    return {
        id,
        title,
        description: metadata.description || '',
        category: metadata.category || type,
        status: metadata.status || 'active',
        progress: metadata.progress || 0,
        targetDate: metadata.targetDate ? new Date(metadata.targetDate) : undefined,
        completedAt: metadata.completedDate ? new Date(metadata.completedDate) : undefined,
        milestones,
        linkedTasks: [],
        file: null,
        filePath: file.path,
        createdAt: new Date(),
        updatedAt: new Date()
    };
}

/**
 * Examples of goal formats:
 * 
 * Frontmatter:
 * ---
 * goal: Complete Project X
 * goals:
 *   - title: Learn TypeScript
 *     progress: 50
 *     targetDate: 2024-12-31
 *   - Write 50k words
 * objective: Improve coding skills
 * ---
 * 
 * Content:
 * ## Goal: Master Obsidian plugin development
 * [GOAL] Publish plugin to community
 * #goal/fitness-journey
 * 
 * - [ ] Milestone: Complete basic features
 * - [x] Milestone: Setup project structure
 */
