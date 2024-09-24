const Utils = {
  // Check if cached data is expired
  isCacheExpired(
    timestamp: number,
    expiry_ms: number = 24 * 60 * 60 * 1000
  ): boolean {
    return Date.now() - timestamp > expiry_ms;
  },

  convertDateString(dateString: string, userLocale = navigator.language) {
    // Create a new Date object from the input string
    const date = new Date(dateString);

    // Get the user's preferred options for date formatting
    const options = {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false, // Set to true 12-hour format prefered
    } as Intl.DateTimeFormatOptions;

    // Format the date according to the user's locale
    const formattedDate = new Intl.DateTimeFormat(userLocale, options).format(
      date
    );

    return formattedDate;
  },
};

export default Utils;
