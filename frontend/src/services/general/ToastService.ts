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
  /** Duration in ms before auto-dismissal (default scales with the message length) */
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

/** An optional follow-up the user can trigger from an error toast. */
export interface ToastAction {
  text: string;
  handler: () => void;
}

const MIN_DURATION_MS = 3000;
const MAX_DURATION_MS = 9000;
const BASE_DURATION_MS = 2000;
const MS_PER_CHARACTER = 55;
const ERROR_EXTRA_MS = 1500;

type ResolvedToast = ToastOptions & { text: string };

/** Reading time for a message: short ones stay short, long ones stay long enough to read. */
export const toastDurationFor = (text: string, isError = false): number => {
  const raw = BASE_DURATION_MS + text.length * MS_PER_CHARACTER + (isError ? ERROR_EXTRA_MS : 0);
  return Math.min(MAX_DURATION_MS, Math.max(MIN_DURATION_MS, raw));
};

const dedupeKey = (toast: ResolvedToast): string => `${toast.color ?? "dark"}|${toast.text}`;

/**
 * High-performance, queued Toast notification service.
 * * Features:
 * - **Sequential Queueing:** Prevents toast overlap by showing them one after another.
 * - **Instant Localization:** Resolves translation keys immediately upon entry to the queue.
 * - **Pre-computed Buttons:** Minimizes logic during the critical 'create' phase of the Ionic controller.
 */
class ToastService {
  /** Queue of pending toast configurations */
  private static toastQueue: ResolvedToast[] = [];
  /** Dedupe key of the toast currently on screen */
  private static activeKey: string | null = null;
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
    this.activeKey = dedupeKey(options);
    const {
      text: finalMessage,
      duration = toastDurationFor(options.text, options.color === "danger"),
      position = "bottom",
      positionAnchor = "nav-tab-bar",
      color = "dark",
      showCloseButton,
      closeButtonText,
      actionText,
      actionHandler,
    } = options;

    const buttons: ToastButton[] = [];
    if (actionText) buttons.push({ text: actionText, handler: actionHandler });
    if (showCloseButton) {
      buttons.push({
        text: closeButtonText || localizationService.t("toast.dismiss", undefined, "Dismiss"),
        role: "cancel",
      });
    }

    try {
      const toast = await toastController.create({
        message: finalMessage,
        duration,
        position,
        positionAnchor: positionAnchor || undefined,
        color,
        buttons: buttons.length > 0 ? buttons : undefined,
        cssClass: "toast-custom-class",
      });

      await toast.present();

      // Listen for dismissal to trigger the next toast in line
      toast.onDidDismiss().then(() => {
        this.isDisplayingToast = false;
        this.activeKey = null;
        this.showNextToast();
      });
    } catch (error) {
      console.error("[ToastService] Failed to present toast:", error);
      this.isDisplayingToast = false;
      this.activeKey = null;
      this.showNextToast();
    }
  }

  /**
   * Pushes a toast into the global queue.
   * @param {ToastOptions} options Toast configuration object.
   */
  static addToast(options: ToastOptions): void {
    const text =
      typeof options.message === "string"
        ? options.message
        : localizationService.t(
            options.message.key,
            options.message.vars,
            options.message.fallback,
          );
    const resolved: ResolvedToast = { ...options, text };
    const key = dedupeKey(resolved);
    if (key === this.activeKey || this.toastQueue.some((queued) => dedupeKey(queued) === key)) {
      return;
    }
    this.toastQueue.push(resolved);
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
   * Displays an error notification (Red) with a close button and an optional follow-up action.
   * @param message String or LocalizedMessage object.
   */
  static showError(
    message: string | LocalizedMessage,
    duration?: number,
    position?: ToastPosition,
    positionAnchor?: string,
    action?: ToastAction,
  ): void {
    this.addToast({
      message,
      duration,
      position,
      positionAnchor,
      color: "danger",
      showCloseButton: true,
      actionText: action?.text,
      actionHandler: action?.handler,
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
    actionText: string = localizationService.t("toast.retry", undefined, "Retry"),
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
        dismissButtonText || localizationService.t("toast.dismiss", undefined, "Dismiss"),
    });
  }

  /**
   * Forcefully closes the current toast and clears all pending notifications in the queue.
   */
  static async dismissAllToasts(): Promise<void> {
    this.toastQueue = [];
    this.activeKey = null;
    await toastController.dismiss();
    this.isDisplayingToast = false;
  }
}

export default ToastService;
