import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { createAccountAndJourney, permanentlyDeleteJourney, trackStorageUploads, visible } from "./photo-storage-test-helpers.mjs";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const journeyName = `25-photo storage check ${Date.now()}`;
let journeyCreated = false;
let cleanedUp = false;

try {
  await createAccountAndJourney(page, journeyName);
  journeyCreated = true;
  const jpeg = await readFile(path.resolve("public/images/road.jpg"));
  const files = Array.from({ length: 25 }, (_, index) => ({
    name: `batch-${String(index + 1).padStart(2, "0")}.jpg`,
    mimeType: "image/jpeg",
    buffer: jpeg,
  }));
  const uploads = trackStorageUploads(page);
  await page.locator('input[type="file"]').setInputFiles(files);
  await visible(page.getByText("25 photos selected", { exact: true }));
  assert.equal(await page.locator(".upload-selection-grid li").count(), 25, "Exactly 25 photos should be selected.");
  const startedAt = performance.now();
  await page.getByRole("button", { name: "Upload 25 selected photos" }).click();
  await visible(page.getByText("Unplaced photos"), 360_000);
  const elapsedMs = Math.round(performance.now() - startedAt);
  assert.equal(await page.locator(".review-photo-card").count(), 25, "All 25 selected photos should have durable review records.");
  assert.equal(uploads.length, 25, "Exactly one Convex storage upload should be made for each photo.");
  assert.ok(uploads.every((upload) => upload.contentType.startsWith("image/webp")), "Every durable upload should be WebP.");
  const totalBytes = uploads.reduce((sum, upload) => sum + upload.bytes, 0);
  assert.ok(totalBytes > 0, "Uploaded byte count should be available.");
  await permanentlyDeleteJourney(page, journeyName);
  cleanedUp = true;
  console.log(JSON.stringify({ selected: 25, saved: 25, storageUploads: uploads.length, totalBytes, elapsedMs, cleanedUp }));
} finally {
  if (journeyCreated && !cleanedUp) await permanentlyDeleteJourney(page, journeyName).catch((error) => console.error("Cleanup failed:", error));
  await context.close();
  await browser.close();
}
