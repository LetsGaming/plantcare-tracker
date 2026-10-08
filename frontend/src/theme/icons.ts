import {
  addCircleOutline,
  bug,
  bugOutline,
  closeOutline,
  cloudUploadOutline,
  createOutline,
  cube,
  cubeOutline,
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
} from "ionicons/icons";

/** One outline family for the whole app. Filled glyphs only mark a selected state. */
export const icons = {
  add: addCircleOutline,
  close: closeOutline,
  edit: createOutline,
  upload: cloudUploadOutline,
  logout: logOutOutline,
  profile: personOutline,
  settings: settingsOutline,
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
