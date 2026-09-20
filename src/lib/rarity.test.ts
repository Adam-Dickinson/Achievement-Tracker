import { describe, expect, it } from "vitest";
import { rarityFromPercent } from "./rarity";

describe("rarityFromPercent", () => {
  it("matches the Rust thresholds", () => {
    expect(rarityFromPercent(1.4)).toBe("ultra_rare");
    expect(rarityFromPercent(2)).toBe("rare");
    expect(rarityFromPercent(9.99)).toBe("rare");
    expect(rarityFromPercent(10)).toBe("uncommon");
    expect(rarityFromPercent(30)).toBe("uncommon");
    expect(rarityFromPercent(42)).toBe("common");
  });
});
