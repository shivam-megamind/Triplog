import assert from "node:assert/strict";
import test from "node:test";
import { canAddPhotos, chapterProblem, coordinateKey, localDateKey } from "./trip.ts";

test("complete reconstructed days can be published", () => {
  assert.equal(chapterProblem({ title: "Kyoto", photoCount: 2, days: [{ displayDate: "14 October 2025", place: "Gion, Kyoto", memory: "We found a quiet lane after the rain." }] }), null);
});

test("a day without the traveler's memory stays draft", () => {
  assert.equal(chapterProblem({ title: "Kyoto", photoCount: 1, days: [{ displayDate: "14 October 2025", place: "Gion", memory: " " }] }), "Add one memory for each day, in your own words.");
});

test("nearby coordinates share one cache key", () => {
  assert.equal(coordinateKey(35.00321, 135.77881), coordinateKey(35.00319, 135.77879));
});

test("capture dates group by the photo's local calendar day", () => {
  assert.equal(localDateKey(new Date(2025, 9, 14, 23, 45)), "2025-10-14");
});

test("photo additions are capped at six", () => {
  assert.equal(canAddPhotos(5, 1), true);
  assert.equal(canAddPhotos(5, 2), false);
});
