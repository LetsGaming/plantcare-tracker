import { describe, expect, it } from "vitest";
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
import { icons, navIcons } from "@/theme/icons";

describe("icon family", () => {
  it("uses outline glyphs for every semantic action", () => {
    expect(icons).toEqual({
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
