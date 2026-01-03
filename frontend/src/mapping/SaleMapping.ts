export default class SaleMapper {
  // Helper function to map a single sale record
  static mapSale(sale: APISale): Sale {
    return {
      id: sale.sale_id,
      name: sale.sale_name,
      seller: sale.sale_seller,
      price: sale.sale_new_price,
      oldPrice: sale.sale_old_price,
      link: sale.sale_link,
      imageUrl: sale.sale_image_url,
    };
  }

  // Convert API response to an array of Sale records
  static convertToSales(response: any): Sale[] {
    if (Array.isArray(response)) {
      return response.map(this.mapSale);
    } else {
      return [this.mapSale(response)];
    }
  }
}
