import { describe, expect, it } from "@jest/globals";
import { render, screen } from "@testing-library/react";
import { HdrMetadataDetails } from "../src/app/viewer/view/illuminance-details";

const KEY_LABEL_REGEX = /^(CAPDATE|COMPUTED_VERTICAL_ILLUMINANCE|FORMAT|VIEW)$/;

describe("HdrMetadataDetails ordering", () => {
  it("lifts the computed vertical illuminance above alphabetical keys", () => {
    render(
      <HdrMetadataDetails
        metadata={{
          CAPDATE: "2020:11:23 12:31:37",
          COMPUTED_VERTICAL_ILLUMINANCE: "297.23",
          FORMAT: "32-bit_rle_rgbe",
          VIEW: "-vta -vv 180 -vh 180",
        }}
      />
    );

    const keys = screen
      .getAllByText(KEY_LABEL_REGEX)
      .map((element) => element.textContent);

    expect(keys).toEqual([
      "FORMAT",
      "COMPUTED_VERTICAL_ILLUMINANCE",
      "VIEW",
      "CAPDATE",
    ]);
  });
});
