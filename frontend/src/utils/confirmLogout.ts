import { alertController } from "@ionic/vue";
import localizationService from "@/services/general/LocalizationService";

/** Asks before signing out; `logout` runs only when the user confirms. */
export const confirmLogout = async (logout: () => Promise<void> | void): Promise<void> => {
  const alert = await alertController.create({
    header: localizationService.t("logout.confirm_title"),
    message: localizationService.t("logout.confirm_message"),
    buttons: [
      { text: localizationService.t("common.cancel", undefined, "Cancel"), role: "cancel" },
      {
        text: localizationService.t("logout.confirm_action"),
        role: "confirm",
        handler: () => void logout(),
      },
    ],
  });
  await alert.present();
};
