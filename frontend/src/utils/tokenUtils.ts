import storageService from "@/services/general/StorageService";

// Constants
const TOKEN_KEY = process.env.TOKEN_KEY || "authToken";

// Centralized token management
const TokenUtils = {
  async getToken(): Promise<string | null> {
    return await storageService.get<string>(TOKEN_KEY);
  },

  async setToken(token: string): Promise<void> {
    await storageService.set(TOKEN_KEY, token);
  },

  async clearToken(): Promise<void> {
    await storageService.clear();
  },
};

export default TokenUtils;
