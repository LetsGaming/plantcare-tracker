interface CalendarDates {
  date: string;
  category: Category;
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