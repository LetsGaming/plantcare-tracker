import { describe, expect, it } from "vitest";
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
import { icons, navIcons } from "@/theme/icons";

describe("icon family", () => {
  it("uses outline glyphs for every semantic action", () => {
    expect(icons).toEqual({
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
    });
  });

  it("pairs each navigation destination with an outline idle and filled selected glyph", () => {
    expect(navIcons).toEqual({
      plants: { idle: leafOutline, selected: leaf },
      substrates: { idle: cubeOutline, selected: cube },
      components: { idle: gridOutline, selected: grid },
      sales: { idle: pricetagOutline, selected: pricetag },
      debug: { idle: bugOutline, selected: bug },
    });
  });
});
