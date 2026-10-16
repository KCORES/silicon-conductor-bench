import { describe, expect, it } from "vitest";
import { resolveDisplayModelName } from "../src/config.js";

describe("resolveDisplayModelName", () => {
  it("keeps the api model name when the alias is blank", () => {
    expect(
      resolveDisplayModelName({
        modelName: "Ling_3_plus_yayi",
        alias: "  ",
        pedestrianDemandEnabled: true,
      }),
    ).toBe("Ling_3_plus_yayi");
  });

  it("prefers a configured alias for logs and the web ui", () => {
    expect(
      resolveDisplayModelName({
        modelName: "Ling_3_plus_yayi",
        alias: " ling-3.1-flash ",
        pedestrianDemandEnabled: true,
      }),
    ).toBe("ling-3.1-flash");
  });

  it("keeps no-ped runs distinguishable when an alias is set", () => {
    expect(
      resolveDisplayModelName({
        modelName: "Ling_3_plus_yayi-no-ped",
        alias: "ling-3.1-flash",
        pedestrianDemandEnabled: false,
      }),
    ).toBe("ling-3.1-flash-no-ped");
    expect(
      resolveDisplayModelName({
        modelName: "Ling_3_plus_yayi-no-ped",
        alias: "ling-3.1-flash-no-ped",
        pedestrianDemandEnabled: false,
      }),
    ).toBe("ling-3.1-flash-no-ped");
  });
});
