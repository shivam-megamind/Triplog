import assert from "node:assert/strict";
import { chromium } from "playwright";
import { canvasPhoto, createAccountAndJourney, permanentlyDeleteJourney, trackStorageUploads, visible } from "./photo-storage-test-helpers.mjs";

const format = process.argv[2];
assert.ok(format === "png" || format === "webp", "Run with png or webp.");
const mimeType = `image/${format}`;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const journeyName = `${format.toUpperCase()} storage check ${Date.now()}`;
let journeyCreated = false;
let cleanedUp = false;

try {
  await createAccountAndJourney(page, journeyName);
  journeyCreated = true;
  const source = await canvasPhoto(page, mimeType, `source.${format}`, format === "png" ? "#244336" : "#a8563c");
  const uploads = trackStorageUploads(page);
  await page.locator('input[type="file"]').setInputFiles(source);
  await page.getByRole("button", { name: "Upload 1 selected photo" }).click();
  await visible(page.getByText("Unplaced photos"), 180_000);
  assert.equal(await page.locator(".review-photo-card").count(), 1, "The source should create one saved photo record.");
  assert.equal(uploads.length, 1, "The source should create exactly one Convex storage request.");
  assert.ok(uploads[0].contentType.startsWith("image/webp"), "The durable upload should be WebP.");
  await permanentlyDeleteJourney(page, journeyName);
  cleanedUp = true;
  console.log(JSON.stringify({ sourceFormat: format, savedRecords: 1, storageUploads: 1, storedFormat: "image/webp", cleanedUp }));
} finally {
  if (journeyCreated && !cleanedUp) await permanentlyDeleteJourney(page, journeyName).catch((error) => console.error("Cleanup failed:", error));
  await context.close();
  await browser.close();
}
