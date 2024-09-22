import { toastController } from "@ionic/vue";

type ToastPosition = "top" | "middle" | "bottom";
type ToastColor =
  | "primary"
  | "secondary"
  | "tertiary"
  | "success"
  | "warning"
  | "danger"
  | "light"
  | "medium"
  | "dark";

interface ToastOptions {
  message: string;
  duration?: number;
  position?: ToastPosition;
  positionAnchor?: string;
  color?: ToastColor;
  showCloseButton?: boolean;
  closeButtonText?: string;
  actionText?: string;
  actionHandler?: () => void;
}

class ToastService {
  private static toastQueue: ToastOptions[] = [];
  private static isDisplayingToast: boolean = false;

  private static async showNextToast() {
    if (this.toastQueue.length === 0 || this.isDisplayingToast) {
      return;
    }

    this.isDisplayingToast = true;
    const {
      message,
      duration = 2000,
      position = "bottom",
      positionAnchor = "",
      color = "dark",
      showCloseButton,
      closeButtonText,
      actionText,
      actionHandler,
    } = this.toastQueue.shift()!;

    const toast = await toastController.create({
      message,
      duration,
      position,
      positionAnchor,
      color,
      buttons: showCloseButton
        ? [{ text: closeButtonText, role: "cancel" }]
        : actionText
        ? [{ text: actionText, handler: actionHandler }]
        : undefined,
    });

    await toast.present();
    toast.onDidDismiss().then(() => {
      this.isDisplayingToast = false;
      this.showNextToast(); // Show the next toast in the queue
    });
  }

  /**
   * Show a custom toast with message and options
   */
  static addToast(options: ToastOptions) {
    this.toastQueue.push(options);
    this.showNextToast(); // Attempt to show the next toast
  }

  /**
   * Show a success toast
   */
  static showSuccess(
    message: string,
    duration?: number,
    position?: ToastPosition,
    positionAnchor?: string
  ) {
    this.addToast({ message, duration, position, positionAnchor, color: "success" });
  }

  /**
   * Show an error toast
   */
  static showError(
    message: string,
    duration?: number,
    position?: ToastPosition,
    positionAnchor?: string
  ) {
    this.addToast({ message, duration, position, positionAnchor, color: "danger" });
  }

  /**
   * Show a warning toast
   */
  static showWarning(
    message: string,
    duration?: number,
    position?: ToastPosition,
    positionAnchor?: string
  ) {
    this.addToast({ message, duration, position, positionAnchor, color: "warning" });
  }

  /**
   * Show a toast with a button for custom actions (e.g. Undo, Retry)
   */
  static showToastWithAction(
    message: string,
    actionText: string = "Retry",
    actionHandler: () => void,
    duration: number = 4000,
    position: ToastPosition = "bottom",
    positionAnchor?: string,
    color: ToastColor = "dark"
  ) {
    this.addToast({
      message,
      actionText,
      actionHandler,
      duration,
      position,
      positionAnchor,
      color,
    });
  }

  /**
   * Show a toast that can be manually dismissed
   */
  static showDismissableToast(
    message: string,
    position: ToastPosition = "bottom",
    positionAnchor?: string,
    color: ToastColor = "medium",
    dismissButtonText: string = "Dismiss"
  ) {
    this.addToast({
      message,
      position,
      positionAnchor,
      color,
      showCloseButton: true,
      closeButtonText: dismissButtonText,
    });
  }

  /**
   * Dismiss all currently open toasts
   */
  static async dismissAllToasts() {
    await toastController.dismiss();
    this.toastQueue = []; // Clear the queue
    this.isDisplayingToast = false; // Reset the display state
  }
}

export default ToastService;
