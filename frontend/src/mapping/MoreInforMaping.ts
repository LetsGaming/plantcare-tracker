export default class MoreInfoMapper {
  /**
   * Maps a raw API data structure to the application's MoreInfo model.
   * Defensive against nulls and non-array links during streaming.
   */
  static mapMoreInfo(moreInfo: APIMoreInfo): MoreInfo {
    return {
      links: Array.isArray(moreInfo?.links) ? [...moreInfo.links] : [],
      ai: moreInfo?.ai || "",
    };
  }

  /**
   * Converts the response to an array of MoreInfo objects.
   * This is compatible with the cumulative object built in MoreInfoService.
   */
  static convertToMoreInfo(
    response: APIMoreInfo | APIMoreInfo[] | null | undefined,
  ): MoreInfo[] {
    if (!response) {
      return [];
    }

    // If it's already an array (like when loading from storage), map each item
    if (Array.isArray(response)) {
      return response.map((item) => this.mapMoreInfo(item));
    }

    // If it's the cumulative object from the stream, wrap it in an array for the UI loop
    return [this.mapMoreInfo(response)];
  }
}
