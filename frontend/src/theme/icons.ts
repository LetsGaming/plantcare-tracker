import {
  addCircleOutline,
  chevronBackOutline,
  chevronDownOutline,
  chevronForwardOutline,
  bug,
  bugOutline,
  closeOutline,
  cloudUploadOutline,
  createOutline,
  cube,
  cubeOutline,
  filterOutline,
  grid,
  gridOutline,
  leaf,
  leafOutline,
  logOutOutline,
  peopleOutline,
  personOutline,
  pricetag,
  pricetagOutline,
  pulseOutline,
  settingsOutline,
  swapVerticalOutline,
} from "ionicons/icons";

/** One outline family for the whole app. Filled glyphs only mark a selected state. */
export const icons = {
  add: addCircleOutline,
  chevronBack: chevronBackOutline,
  chevronDown: chevronDownOutline,
  chevronForward: chevronForwardOutline,
  close: closeOutline,
  edit: createOutline,
  filter: filterOutline,
  upload: cloudUploadOutline,
  logout: logOutOutline,
  profile: personOutline,
  settings: settingsOutline,
  sort: swapVerticalOutline,
  pulse: pulseOutline,
  segmentPublic: peopleOutline,
  segmentPrivate: personOutline,
} as const;

export type NavDestination = "plants" | "substrates" | "components" | "sales" | "debug";

export const navIcons: Record<NavDestination, { idle: string; selected: string }> = {
  plants: { idle: leafOutline, selected: leaf },
  substrates: { idle: cubeOutline, selected: cube },
  components: { idle: gridOutline, selected: grid },
  sales: { idle: pricetagOutline, selected: pricetag },
  debug: { idle: bugOutline, selected: bug },
};
