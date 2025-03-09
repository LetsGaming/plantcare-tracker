export default class MoreInfoMapper {
  // Helper function to map a single watering record
  static mapMoreInfo(moreInfo: APIMoreInfo): MoreInfo {
    return {
      links: moreInfo.links,
      ai: moreInfo.ai,
    };
  }

  // Convert API response to an array of WateringRecords
  static convertToMoreInfo(response: APIMoreInfo): MoreInfo[] {
    if (Array.isArray(response)) {
      return response.map(this.mapMoreInfo);
    } else {
      return [this.mapMoreInfo(response)];
    }
  }
}
