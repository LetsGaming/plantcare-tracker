import Utils from "@/utils/utils";
import localizationService from "@/services/general/LocalizationService";

export const pageTitleFor = (route: { meta?: Record<string, unknown> }): string => {
  const appTitle = Utils.getAppTitle();
  const key = route.meta?.titleKey;
  if (typeof key !== "string") return appTitle;
  return `${localizationService.t(key, undefined, key)} · ${appTitle}`;
};

export const updateDocumentTitle = (route: { meta?: Record<string, unknown> }): void => {
  document.title = pageTitleFor(route);
};
