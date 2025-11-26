import { App, Notice } from 'obsidian';
import { VaultMindNotification, INotificationService } from '../types';
import { generateId } from '../utils/helpers';

export class NotificationService implements INotificationService {
    private app: App | null = null;
    private notifications: Map<string, VaultMindNotification> = new Map();
    private scheduledReminders: Map<string, NodeJS.Timeout> = new Map();
    private notificationSound: HTMLAudioElement | null = null;
    
    async initialize(app: App): Promise<void> {
        this.app = app;
        // Load saved notifications
        await this.loadNotifications();
        
        // Initialize notification sound (user can place notification.mp3 in plugin folder)
        this.initializeSound();
    }
    
    private async initializeSound() {
        if (!this.app) return;
        
        try {
            // Try to load notification sound from plugin folder
            // The mp3 file should be in the same folder as main.js
            try {
                // Get the plugin manifest to find the plugin directory
                const manifest = (this.app as any).plugins?.manifests?.vaultmind;
                if (manifest) {
                    // Use the app:// protocol which Obsidian understands
                    const soundPath = `app://local/${(this.app.vault.adapter as any).basePath}/.obsidian/plugins/vaultmind/notification.mp3`;
                    this.notificationSound = new Audio(soundPath);
                    this.notificationSound.volume = 0.5; // Set default volume to 50%
                    
                    // Test if it can load
                    await new Promise((resolve, reject) => {
                        if (this.notificationSound) {
                            this.notificationSound.addEventListener('canplaythrough', resolve, { once: true });
                            this.notificationSound.addEventListener('error', reject, { once: true });
                            this.notificationSound.load();
                        }
                    });
                    
                    console.log('VaultMind: Notification sound loaded from:', soundPath);
                } else {
                    // Fallback: try relative path
                    this.notificationSound = new Audio('./notification.mp3');
                    this.notificationSound.volume = 0.5;
                    console.log('VaultMind: Trying relative path for notification sound');
                }
            } catch {
                console.log('VaultMind: No notification.mp3 found, using system notifications only');
                this.notificationSound = null;
            }
        } catch (error) {
            console.error('VaultMind: Failed to load notification sound:', error);
        }
    }
    
    private playSound() {
        if (this.notificationSound) {
            try {
                // Clone the audio element to allow multiple simultaneous plays
                const sound = this.notificationSound.cloneNode() as HTMLAudioElement;
                sound.volume = this.notificationSound.volume;
                sound.play().catch(e => {
                    console.error('VaultMind: Failed to play notification sound:', e);
                });
            } catch (error) {
                console.error('VaultMind: Error playing sound:', error);
            }
        }
    }

    notify(notification: Omit<VaultMindNotification, 'id' | 'timestamp' | 'read'>): void {
        const fullNotification: VaultMindNotification = {
            ...notification,
            id: generateId('notif'),
            timestamp: new Date(),
            read: false
        };
        
        this.notifications.set(fullNotification.id, fullNotification);
        
        // Play notification sound for important notifications
        if (notification.priority === 'high' || notification.type === 'warning' || notification.type === 'error' || notification.type === 'reminder') {
            this.playSound();
        }
        
        // Show Obsidian notice (without emojis)
        const notice = new Notice(
            `${fullNotification.title}\n${fullNotification.message}`,
            fullNotification.persistent ? 0 : 5000
        );
        
        // Add action button if actionable
        if (fullNotification.actionable && fullNotification.action && fullNotification.actionLabel) {
            const actionEl = notice.noticeEl.createEl('button', {
                text: fullNotification.actionLabel,
                cls: 'vaultmind-action-button'
            });
            actionEl.addEventListener('click', () => {
                fullNotification.action!();
                notice.hide();
                this.markAsRead(fullNotification.id);
            });
        }
        
        this.saveNotifications();
    }

    getNotifications(unreadOnly: boolean = false): VaultMindNotification[] {
        const notifications = Array.from(this.notifications.values());
        
        if (unreadOnly) {
            return notifications.filter(n => !n.read);
        }
        
        return notifications.sort((a, b) => 
            b.timestamp.getTime() - a.timestamp.getTime()
        );
    }

    markAsRead(id: string): void {
        const notification = this.notifications.get(id);
        if (notification) {
            notification.read = true;
            this.saveNotifications();
        }
    }

    clearNotifications(): void {
        this.notifications.clear();
        this.saveNotifications();
    }

    scheduleReminder(taskId: string, time: Date): void {
        // Cancel existing reminder for this task
        if (this.scheduledReminders.has(taskId)) {
            clearTimeout(this.scheduledReminders.get(taskId)!);
        }
        
        const delay = time.getTime() - Date.now();
        if (delay > 0) {
            const timeout = setTimeout(() => {
                this.notify({
                    type: 'reminder',
                    title: 'Task Reminder',
                    message: `Task ${taskId} is due now`,
                    persistent: true,
                    source: 'task'
                });
                this.scheduledReminders.delete(taskId);
            }, delay);
            
            this.scheduledReminders.set(taskId, timeout);
        }
    }


    private async loadNotifications(): Promise<void> {
        // In a real implementation, this would load from storage
        // For now, we'll start with empty notifications
    }

    private async saveNotifications(): Promise<void> {
        // In a real implementation, this would save to storage
        // For now, we'll keep them in memory only
    }
}
