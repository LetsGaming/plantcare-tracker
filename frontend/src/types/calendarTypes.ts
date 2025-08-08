interface CalendarDates {
  date: string;
  category: string;
  textColor: string;
  backgroundColor: string;
}

interface StoredCalendarDates {
  calendarDates: CalendarDates[];
}

interface EditDate {
  date: string;
  category: string;
}

interface Category {
  name: string;
  textColor: string;
  backgroundColor: string;
}

interface StoredCategories {
  categories: Category[];
}

interface PopoverItem {
  title: string;
  fields: PopoverField[];
}