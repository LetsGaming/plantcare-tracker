import { DateTime } from "luxon";
import { modalController } from "@ionic/vue";

import config from "@/config.json";
type Environment = "development" | "production";

const getLocalDate = (dateString: string) => {
  // Get the local time zone
  const timeZone = DateTime.local().zoneName;

  // If the date string is already in UTC (ends with 'Z'), parse it directly without 'zone: utc'
  let utcDate = DateTime.fromISO(dateString);

  // If the date string is in UTC (i.e., ends with 'Z'), make sure it's treated as UTC by adjusting the time zone
  if (dateString.endsWith("Z")) {
    utcDate = utcDate.setZone("utc", { keepLocalTime: true });
  }

  // Now convert to the local time zone
  const localDate = utcDate.setZone(timeZone);
  return localDate;
};

const Utils = {
  getConfig() {
    const environment = process.env.NODE_ENV || "development";
    const envConfig = config[environment as Environment];
    return envConfig;
  },

  getAppTitle(): string {
    return this.getConfig().frontend.app_title;
  },

  getApiBaseUrl(): string {
    const envConfig = this.getConfig();
    const apiUrl =
      envConfig.server.base_url +
      ("port" in envConfig.server ? `:${envConfig.server.port}` : "");
    return `${apiUrl}${envConfig.server.base_path}${envConfig.server.api_version}`;
  },

  // Check if cached data is expired
  isCacheExpired(timestamp: number): boolean {
    const expiry_ms = this.getConfig().storage.expire_h * 60 * 60 * 1000;
    return Date.now() - timestamp > expiry_ms;
  },

  convertToMillis(dateString: string): number {
    const localDate = getLocalDate(dateString);
    // Format the date in the desired format
    return localDate.toLocal().toMillis();
  },

  convertDateString(dateString: string) {
    // Check if the dateString is already formatted (basic check)
    if (
      isNaN(Date.parse(dateString)) &&
      !/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(dateString)
    ) {
      return dateString; // Return as-is if it doesn't look like an ISO date
    }

    const localDate = getLocalDate(dateString);

    // Format the date in the desired format
    return localDate.toLocaleString(DateTime.DATETIME_MED_WITH_WEEKDAY);
  },

  async closeOpenModal() {
    const topModal = await modalController.getTop();
    if (topModal) {
      await modalController.dismiss();
    }
  },

  async closeAllOpenModals() {
    let topModal = await modalController.getTop();
    while (topModal) {
      await modalController.dismiss();
      topModal = await modalController.getTop();
    }
  },
};

export default Utils;
