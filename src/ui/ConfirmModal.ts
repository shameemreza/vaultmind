import { App, Modal } from 'obsidian';

export class ConfirmModal extends Modal {
    private message: string;
    private onConfirm: () => void;
    private confirmText: string;
    private cancelText: string;

    constructor(
        app: App, 
        message: string, 
        onConfirm: () => void,
        confirmText: string = 'Confirm',
        cancelText: string = 'Cancel'
    ) {
        super(app);
        this.message = message;
        this.onConfirm = onConfirm;
        this.confirmText = confirmText;
        this.cancelText = cancelText;
    }

    onOpen() {
        const { contentEl } = this;
        
        contentEl.createEl('p', { 
            text: this.message,
            cls: 'vaultmind-confirm-message'
        });
        
        const buttonContainer = contentEl.createEl('div', {
            cls: 'vaultmind-confirm-buttons'
        });
        
        const confirmBtn = buttonContainer.createEl('button', {
            text: this.confirmText,
            cls: 'mod-warning'
        });
        
        confirmBtn.addEventListener('click', () => {
            this.close();
            this.onConfirm();
        });
        
        const cancelBtn = buttonContainer.createEl('button', {
            text: this.cancelText
        });
        
        cancelBtn.addEventListener('click', () => {
            this.close();
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
