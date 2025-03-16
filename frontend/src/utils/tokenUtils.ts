// TokenUtils.ts
import storageService from "@/services/general/StorageService";
import CalendarService from "@/services/CalendarService";

const TOKEN_KEY = "authToken";

const TokenUtils = {
  async getToken(): Promise<string | null> {
    return await storageService.get<string>(TOKEN_KEY);
  },

  async setToken(token: string): Promise<void> {
    await storageService.set(TOKEN_KEY, token);
  },

  async clearToken(): Promise<void> {
    // Backup calendar data
    const categories = await CalendarService.getCategories();
    const dates = await CalendarService.getDates();

    // Clear all other storage except calendar
    const keys = await storageService.keys();
    const keysToRemove = keys.filter(
      (key) => key !== "date_categories" && key !== "reminder_dates"
    );
    await storageService.removeMultiple(keysToRemove);

    // Restore calendar data
    await CalendarService.saveCategories(categories);
    await CalendarService.saveDates(dates);
  },
};

export default TokenUtils;
