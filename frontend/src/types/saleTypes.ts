interface Sale {
    id: string;
    name: string;
    nameFull: string;
    seller: string;
    price: number;
    oldPrice: number;
    link: string;
    imageUrl?: string;
}

interface APISale {
    sale_id: string;
    sale_name: string;
    sale_name_full: string;
    sale_seller: string;
    sale_new_price: number;
    sale_old_price: number;
    sale_link: string;
    sale_image_url?: string;
}