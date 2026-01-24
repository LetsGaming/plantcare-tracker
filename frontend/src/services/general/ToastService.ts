import { toastController, ToastButton } from "@ionic/vue";
import localizationService from "@/services/general/LocalizationService";

/** Valid positions for the toast notification */
type ToastPosition = "top" | "middle" | "bottom";

/** Ionic-specific color palette keys */
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

/** Structure for messages that require localization lookup */
interface LocalizedMessage {
  /** The translation key (e.g., 'errors.network_failure') */
  key: string;
  /** Interpolation variables */
  vars?: Record<string, string | number>;
  /** Text to show if the key is missing */
  fallback?: string;
}

/** Configuration for creating a new toast */
interface ToastOptions {
  /** The message body or a localization object */
  message: string | LocalizedMessage;
  /** Duration in ms before auto-dismissal (default: 2000) */
  duration?: number;
  /** Screen position */
  position?: ToastPosition;
  /** Element ID or 'nav-tab-bar' to anchor the toast above */
  positionAnchor?: string;
  /** Ionic color theme */
  color?: ToastColor;
  /** If true, renders a close/cancel button */
  showCloseButton?: boolean;
  /** Text for the close button */
  closeButtonText?: string;
  /** Text for the primary action button */
  actionText?: string;
  /** Callback executed when the action button is clicked */
  actionHandler?: () => void;
}

/**
 * High-performance, queued Toast notification service.
 * * Features:
 * - **Sequential Queueing:** Prevents toast overlap by showing them one after another.
 * - **Instant Localization:** Resolves translation keys immediately upon entry to the queue.
 * - **Pre-computed Buttons:** Minimizes logic during the critical 'create' phase of the Ionic controller.
 */
class ToastService {
  /** Queue of pending toast configurations */
  private static toastQueue: ToastOptions[] = [];
  /** Semaphore to track if a toast is currently animating or visible */
  private static isDisplayingToast: boolean = false;

  /**
   * Processes the next item in the queue.
   * Logic: Shift from queue -> Resolve Message -> Create Controller -> Present -> Recurse on Dismiss.
   * @internal
   */
  private static async showNextToast(): Promise<void> {
    if (this.toastQueue.length === 0 || this.isDisplayingToast) {
      return;
    }

    this.isDisplayingToast = true;

    const options = this.toastQueue.shift()!;
    const {
      message: msgOrLoc,
      duration = 2000,
      position = "bottom",
      positionAnchor = "nav-tab-bar",
      color = "dark",
      showCloseButton,
      closeButtonText,
      actionText,
      actionHandler,
    } = options;

    // Resolve localization immediately before creation
    const finalMessage =
      typeof msgOrLoc === "string"
        ? msgOrLoc
        : localizationService.t(msgOrLoc.key, msgOrLoc.vars, msgOrLoc.fallback);

    // Pre-calculate button array to keep .create() clean
    let buttons: ToastButton[] | undefined = undefined;
    if (showCloseButton) {
      buttons = [{ text: closeButtonText || "Close", role: "cancel" }];
    } else if (actionText) {
      buttons = [{ text: actionText, handler: actionHandler }];
    }

    try {
      const toast = await toastController.create({
        message: finalMessage,
        duration,
        position,
        positionAnchor: positionAnchor || undefined,
        color,
        buttons,
        // Performance optimization: cssClass can be used for hardware acceleration if needed
        cssClass: "toast-custom-class",
      });

      await toast.present();

      // Listen for dismissal to trigger the next toast in line
      toast.onDidDismiss().then(() => {
        this.isDisplayingToast = false;
        this.showNextToast();
      });
    } catch (error) {
      console.error("[ToastService] Failed to present toast:", error);
      this.isDisplayingToast = false;
      this.showNextToast();
    }
  }

  /**
   * Pushes a toast into the global queue.
   * @param {ToastOptions} options Toast configuration object.
   */
  static addToast(options: ToastOptions): void {
    this.toastQueue.push(options);
    this.showNextToast();
  }

  /**
   * Displays a success notification (Green).
   * @param message String or LocalizedMessage object.
   */
  static showSuccess(
    message: string | LocalizedMessage,
    duration?: number,
    position?: ToastPosition,
    positionAnchor?: string,
  ): void {
    this.addToast({
      message,
      duration,
      position,
      positionAnchor,
      color: "success",
    });
  }

  /**
   * Displays an error notification (Red).
   * @param message String or LocalizedMessage object.
   */
  static showError(
    message: string | LocalizedMessage,
    duration?: number,
    position?: ToastPosition,
    positionAnchor?: string,
  ): void {
    this.addToast({
      message,
      duration,
      position,
      positionAnchor,
      color: "danger",
    });
  }

  /**
   * Displays a warning notification (Yellow/Orange).
   * @param message String or LocalizedMessage object.
   */
  static showWarning(
    message: string | LocalizedMessage,
    duration?: number,
    position?: ToastPosition,
    positionAnchor?: string,
  ): void {
    this.addToast({
      message,
      duration,
      position,
      positionAnchor,
      color: "warning",
    });
  }

  /**
   * Displays a toast with a primary action button (e.g., 'Undo', 'Retry').
   * @param message String or LocalizedMessage object.
   * @param actionText The button label.
   * @param actionHandler Callback on click.
   */
  static showToastWithAction(
    message: string | LocalizedMessage,
    actionText: string = localizationService.t(
      "toast.retry",
      undefined,
      "Retry",
    ),
    actionHandler: () => void,
    duration: number = 4000,
    position: ToastPosition = "bottom",
    positionAnchor?: string,
    color: ToastColor = "dark",
  ): void {
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
   * Displays a toast with a close/dismiss button that persists until clicked or duration ends.
   */
  static showDismissableToast(
    message: string | LocalizedMessage,
    position: ToastPosition = "bottom",
    positionAnchor?: string,
    color: ToastColor = "medium",
    dismissButtonText?: string,
  ): void {
    this.addToast({
      message,
      position,
      positionAnchor,
      color,
      showCloseButton: true,
      closeButtonText:
        dismissButtonText ||
        localizationService.t("toast.dismiss", undefined, "Dismiss"),
    });
  }

  /**
   * Forcefully closes the current toast and clears all pending notifications in the queue.
   */
  static async dismissAllToasts(): Promise<void> {
    this.toastQueue = [];
    await toastController.dismiss();
    this.isDisplayingToast = false;
  }
}

export default ToastService;
