import { h, render } from "vue";
import ConfirmDialog from "@/components/modal/ConfirmDialog.vue";

export interface ConfirmRequest {
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  requireText?: string;
  requireLabel?: string;
}

/**
 * Shows the shared ConfirmDialog from plain code and resolves with the user's
 * choice. The dialog mounts into its own host element and removes itself once
 * its dismiss animation has finished.
 */
export const presentConfirm = (request: ConfirmRequest): Promise<boolean> =>
  new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    let open = true;

    const draw = () =>
      render(
        h(ConfirmDialog, {
          ...request,
          isOpen: open,
          onConfirm: () => settle(true),
          onCancel: () => settle(false),
          onClosed: teardown,
        }),
        host,
      );

    const settle = (accepted: boolean) => {
      if (!open) return;
      open = false;
      draw();
      resolve(accepted);
    };

    const teardown = () => {
      render(null, host);
      host.remove();
    };

    draw();
  });
