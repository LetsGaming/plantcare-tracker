import localizationService from "@/services/general/LocalizationService";
import { presentConfirm } from "@/utils/presentConfirm";

/** Asks before signing out; `logout` runs only when the user confirms. */
export const confirmLogout = async (logout: () => Promise<void> | void): Promise<void> => {
  const confirmed = await presentConfirm({
    title: localizationService.t("logout.confirm_title"),
    message: localizationService.t("logout.confirm_message"),
    confirmLabel: localizationService.t("logout.confirm_action"),
    cancelLabel: localizationService.t("common.cancel", undefined, "Cancel"),
  });
  if (confirmed) await logout();
};
