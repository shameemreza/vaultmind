import { App, Notice } from "obsidian";
import { VaultMindNotification, INotificationService } from "../types";
import { generateId } from "../utils/helpers";

export class NotificationService implements INotificationService {
	private app: App | null = null;
	private notifications: Map<string, VaultMindNotification> = new Map();
	private scheduledReminders: Map<string, NodeJS.Timeout> = new Map();

	async initialize(app: App): Promise<void> {
		this.app = app;
		// Load saved notifications
		await this.loadNotifications();

		// Using system notifications only
	}

	notify(
		notification: Omit<VaultMindNotification, "id" | "timestamp" | "read">
	): void {
		const fullNotification: VaultMindNotification = {
			...notification,
			id: generateId("notif"),
			timestamp: new Date(),
			read: false,
		};

		this.notifications.set(fullNotification.id, fullNotification);

		// System will play default notification sound

		// Show Obsidian notice (without emojis)
		const notice = new Notice(
			`${fullNotification.title}\n${fullNotification.message}`,
			fullNotification.persistent ? 0 : 5000
		);

		// Add action button if actionable
		if (
			fullNotification.actionable &&
			fullNotification.action &&
			fullNotification.actionLabel
		) {
			const noticeWithEl = notice as Notice & { messageEl: HTMLElement };
			const actionEl = noticeWithEl.messageEl.createEl("button", {
				text: fullNotification.actionLabel,
				cls: "vaultmind-action-button",
			});
			actionEl.addEventListener("click", () => {
				fullNotification.action!();
				notice.hide();
				this.markAsRead(fullNotification.id);
			});
		}

		void this.saveNotifications();
	}

	getNotifications(unreadOnly: boolean = false): VaultMindNotification[] {
		const notifications = Array.from(this.notifications.values());

		if (unreadOnly) {
			return notifications.filter((n) => !n.read);
		}

		return notifications.sort(
			(a, b) => b.timestamp.getTime() - a.timestamp.getTime()
		);
	}

	markAsRead(id: string): void {
		const notification = this.notifications.get(id);
		if (notification) {
			notification.read = true;
			void this.saveNotifications();
		}
	}

	clearNotifications(): void {
		this.notifications.clear();
		void this.saveNotifications();
	}

	scheduleReminder(taskId: string, time: Date): void {
		// Cancel existing reminder for this task
		const existingReminder = this.scheduledReminders.get(taskId);
		if (existingReminder) {
			clearTimeout(existingReminder);
		}

		const delay = time.getTime() - Date.now();
		if (delay > 0) {
			const timeout = setTimeout(() => {
				this.notify({
					type: "reminder",
					title: "Task Reminder",
					message: `Task ${taskId} is due now`,
					persistent: true,
					source: "task",
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
