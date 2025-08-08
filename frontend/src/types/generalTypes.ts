interface AccordionItem {
  id: number | string;
  name: string;
  details?: Record<string, string | number | boolean>;
  components?: Array<string | object>;
}

interface PopoverField {
  label: string;
  value: string | number | boolean | (() => string);
}
