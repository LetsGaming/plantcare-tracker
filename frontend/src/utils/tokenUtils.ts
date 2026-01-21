// TokenUtils.ts
import storageService from "@/services/general/StorageService";

const TOKEN_KEY = "authToken";

const TokenUtils = {
  async getToken(): Promise<string | null> {
    return await storageService.get<string>(TOKEN_KEY);
  },

  async setToken(token: string): Promise<void> {
    await storageService.set(TOKEN_KEY, token);
  },

  async clearToken(): Promise<void> {
    await storageService.remove(TOKEN_KEY);
  },
};

export default TokenUtils;
