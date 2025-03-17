import { modalController } from "@ionic/vue";

import config from "@/config.json";
type Environment = "development" | "production";

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

  convertDateString(dateString: string, userLocale = navigator.language) {
    // Create a new Date object from the input string (assumed to be in UTC)
    const date = new Date(dateString);

    // Get the user's preferred options for date formatting
    const options: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false, // Set to true for 12-hour format preference
      timeZoneName: "short", // Include the time zone abbreviation (e.g., "UTC", "CET")
    };

    // Format the date to the user's local time zone using toLocaleString
    const formattedDate = date.toLocaleString(userLocale, options);

    return formattedDate;
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
