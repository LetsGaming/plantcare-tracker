const Utils = {
// Check if cached data is expired
isCacheExpired (timestamp: number, expiry_ms: number = 24 * 60 * 60 * 1000): boolean {
    return Date.now() - timestamp > expiry_ms;
  }
}

export default Utils