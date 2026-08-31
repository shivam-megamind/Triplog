import assert from "node:assert/strict";
import test from "node:test";
import { canAddPhotos, chapterProblem, coordinateKey, localDateKey } from "./trip.ts";
import { groupPhotosIntoMoments, groupedPhotoCount, visualHashDistance } from "./reconstruction.ts";

test("complete reconstructed days can be published", () => {
  assert.equal(chapterProblem({ title: "Kyoto", photoCount: 2, days: [{ displayDate: "14 October 2025", place: "Gion, Kyoto" }], moments: [{ memory: "We found a quiet lane after the rain.", recommendation: "", warning: "", detail: "" }] }), null);
});

test("a journey without the traveler's words stays private", () => {
  assert.equal(chapterProblem({ title: "Kyoto", photoCount: 1, days: [{ displayDate: "", place: "" }], moments: [{ memory: " ", recommendation: "", warning: "", detail: "" }] }), "Add at least one detail in your own words before sharing.");
});

test("nearby coordinates share one cache key", () => {
  assert.equal(coordinateKey(35.00321, 135.77881), coordinateKey(35.00319, 135.77879));
});

test("capture dates group by the photo's local calendar day", () => {
  assert.equal(localDateKey(new Date(2025, 9, 14, 23, 45)), "2025-10-14");
});

test("photo additions are capped at five hundred", () => {
  assert.equal(canAddPhotos(499, 1), true);
  assert.equal(canAddPhotos(499, 2), false);
});

test("exact duplicates stay stored inside one moment", () => {
  const moments = groupPhotosIntoMoments([
    { id: "a", order: 0, dateKey: "2025-10-14", capturedAt: 1000, exactHash: "same" },
    { id: "b", order: 1, dateKey: "2025-10-14", capturedAt: 900_000, exactHash: "same" },
  ]);
  assert.deepEqual(moments.map((moment) => moment.photoIds), [["a", "b"]]);
  assert.equal(groupedPhotoCount(moments), 1);
});

test("a short camera burst becomes one moment", () => {
  const moments = groupPhotosIntoMoments([
    { id: "a", order: 0, dateKey: "2025-10-14", capturedAt: 1000, width: 1600, height: 1200 },
    { id: "b", order: 1, dateKey: "2025-10-14", capturedAt: 7000, width: 1600, height: 1200 },
    { id: "c", order: 2, dateKey: "2025-10-14", capturedAt: 11_000, width: 1600, height: 1200 },
  ]);
  assert.equal(moments.length, 1);
  assert.equal(moments[0].photoIds.length, 3);
});

test("separate stops stay separate moments", () => {
  const moments = groupPhotosIntoMoments([
    { id: "a", order: 0, dateKey: "2025-10-14", capturedAt: 1000, visualHash: "0".repeat(64) },
    { id: "b", order: 1, dateKey: "2025-10-14", capturedAt: 600_000, visualHash: "1".repeat(64) },
  ]);
  assert.equal(moments.length, 2);
  assert.equal(visualHashDistance("0".repeat(64), "1".repeat(64)), 64);
});

test("photos without dates preserve selected order", () => {
  const moments = groupPhotosIntoMoments([
    { id: "second", order: 1, dateKey: "undated" },
    { id: "first", order: 0, dateKey: "undated" },
  ]);
  assert.deepEqual(moments.map((moment) => moment.representativePhotoId), ["first", "second"]);
});
