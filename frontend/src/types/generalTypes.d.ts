interface OverviewItem {
  id: number | string;
  name: string;
  imageUrl?: string;
  description?: string;
  isNew?: boolean;
}

interface PopoverItem {
  title: string;
  fields: PopoverField[];
}

interface PopoverField {
  label: string;
  value: string | number | boolean | (() => string);
}
