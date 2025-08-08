interface AccordionItem {
  id: number | string;
  name: string;
  details: Record<string, string | number | boolean>;
}

interface PopoverField {
  label: string;
  value: string | number | boolean | (() => string);
}