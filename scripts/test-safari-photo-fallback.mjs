import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";
import { canvasPhoto, createAccountAndJourney, permanentlyDeleteJourney, trackStorageUploads } from "./photo-storage-test-helpers.mjs";

const execFile = promisify(execFileCallback);
const convexCli = path.resolve("node_modules/convex/bin/main.js");

async function convexRun(functionName, args, identity) {
  const command = [convexCli, "run", functionName, JSON.stringify(args), "--codegen", "disable"];
  if (identity) command.push("--identity", JSON.stringify(identity));
  const { stdout } = await execFile(process.execPath, command, { cwd: process.cwd(), maxBuffer: 50 * 1024 * 1024 });
  return stdout.trim() ? JSON.parse(stdout) : null;
}

async function inlineQuery(source) {
  const { stdout } = await execFile(process.execPath, [convexCli, "run", "--inline-query", source, "--codegen", "disable"], { cwd: process.cwd(), maxBuffer: 50 * 1024 * 1024 });
  return stdout.trim() ? JSON.parse(stdout) : null;
}

async function journeyAudit(title) {
  return await inlineQuery(`
    const trip = (await ctx.db.query("trips").collect()).filter((item) => item.title === ${JSON.stringify(title)}).sort((a, b) => b._creationTime - a._creationTime)[0];
    if (!trip) return null;
    const photos = await ctx.db.query("photos").withIndex("by_trip", (q) => q.eq("tripId", trip._id)).collect();
    const uploadItems = await ctx.db.query("uploadItems").withIndex("by_trip", (q) => q.eq("tripId", trip._id)).collect();
    const files = await Promise.all(photos.map((photo) => ctx.db.system.get(photo.storageId)));
    return { trip, photos, uploadItems, files };
  `);
}

async function waitForPhotos(title, count, timeout = 180_000) {
  const deadline = Date.now() + timeout;
  let lastAudit = null;
  while (Date.now() < deadline) {
    const audit = await journeyAudit(title);
    lastAudit = audit;
    if (audit?.photos.length === count && audit.uploadItems.every((item) => item.status === "uploaded")) return audit;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`Timed out waiting for ${count} saved photos in ${title}. Last state: ${JSON.stringify(lastAudit)}`);
}

async function forceWebpOutputFailures(page, count) {
  await page.addInitScript((failureLimit) => {
    const nativeToBlob = HTMLCanvasElement.prototype.toBlob;
    let failuresRemaining = failureLimit;
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
      if (type === "image/webp" && failuresRemaining > 0) {
        failuresRemaining -= 1;
        callback(new Blob([new Uint8Array([1])], { type: "image/png" }));
        return;
      }
      nativeToBlob.call(this, callback, type, quality);
    };
  }, count);
}

async function watchForFalseReselectionState(page) {
  await page.evaluate(() => {
    window.__postcardFalseReselectionState = false;
    const check = () => {
      if (document.querySelector(".unfinished-uploads")) window.__postcardFalseReselectionState = true;
    };
    new MutationObserver(check).observe(document.body, { childList: true, subtree: true });
    check();
  });
}

async function assertDeliveredImages(context, audit) {
  const trip = await convexRun("trips:getOne", { tripId: audit.trip._id }, { subject: audit.trip.ownerId });
  assert.equal(trip.photos.length, audit.photos.length);
  const imagePage = await context.newPage();
  try {
    for (const photo of trip.photos) {
      assert.equal(photo.url, photo.displayUrl);
      assert.equal(photo.url, photo.thumbnailUrl);
      const response = await context.request.get(photo.url);
      assert.equal(response.status(), 200);
      assert.ok(["image/webp", "image/jpeg", "image/png"].includes(response.headers()["content-type"] ?? ""));
      const dimensions = await imagePage.evaluate((url) => new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = () => reject(new Error(`Stored image failed to decode: ${url}`));
        image.src = url;
      }), photo.url);
      assert.ok(dimensions.width > 0 && dimensions.height > 0);
    }
  } finally {
    await imagePage.close();
  }
}

async function runFormatPath(browser, fixtures, mode) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  if (mode === "original_fallback") await forceWebpOutputFailures(page, fixtures.length);
  const title = `Safari ${mode} formats ${Date.now()}`;
  let created = false;
  let cleanedUp = false;
  try {
    await createAccountAndJourney(page, title);
    created = true;
    await watchForFalseReselectionState(page);
    const uploads = trackStorageUploads(page);
    await page.locator('input[type="file"]').setInputFiles(fixtures);
    await page.getByRole("button", { name: `Upload ${fixtures.length} selected photos` }).click();
    const audit = await waitForPhotos(title, fixtures.length);
    assert.equal(uploads.length, fixtures.length, "Every saved photo must create exactly one storage request.");
    assert.deepEqual(audit.photos.map((photo) => photo.storedPhotoKind), Array(fixtures.length).fill(mode));
    assert.ok(audit.photos.every((photo) => photo.storageLayout === "single_image_v1"));
    assert.ok(audit.photos.every((photo) => photo.thumbnailStorageId === undefined && photo.displayStorageId === undefined && photo.largeStorageId === undefined));
    const expectedTypes = mode === "optimized_webp" ? Array(fixtures.length).fill("image/webp") : fixtures.map((fixture) => fixture.mimeType);
    assert.deepEqual(audit.files.map((file) => file?.contentType), expectedTypes);
    assert.ok(audit.files.every((file) => file && file.size > 0));
    assert.deepEqual(uploads.map((upload) => upload.contentType), expectedTypes);
    assert.equal(await page.evaluate(() => window.__postcardFalseReselectionState), false, "A successful upload briefly asked for source reselection.");
    await assertDeliveredImages(context, audit);
    await permanentlyDeleteJourney(page, title);
    cleanedUp = true;
    return { mode, selected: fixtures.length, saved: audit.photos.length, storageRequests: uploads.length, storedTypes: expectedTypes, cleanedUp };
  } finally {
    if (created && !cleanedUp) await permanentlyDeleteJourney(page, title).catch((error) => console.error(`Cleanup failed for ${title}:`, error));
    await context.close();
  }
}

async function runMixedBatch(browser, fixtures) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await forceWebpOutputFailures(page, 1);
  const title = `Safari mixed batch ${Date.now()}`;
  let created = false;
  let cleanedUp = false;
  try {
    await createAccountAndJourney(page, title);
    created = true;
    await watchForFalseReselectionState(page);
    const uploads = trackStorageUploads(page);
    await page.locator('input[type="file"]').setInputFiles(fixtures);
    await page.getByRole("button", { name: `Upload ${fixtures.length} selected photos` }).click();
    const audit = await waitForPhotos(title, fixtures.length);
    assert.equal(uploads.length, fixtures.length);
    assert.equal(audit.photos.filter((photo) => photo.storedPhotoKind === "original_fallback").length, 1);
    assert.equal(audit.photos.filter((photo) => photo.storedPhotoKind === "optimized_webp").length, fixtures.length - 1);
    assert.ok(audit.uploadItems.every((item) => item.status === "uploaded"));
    assert.ok(audit.photos.every((photo) => photo.storageLayout === "single_image_v1"));
    assert.equal(await page.evaluate(() => window.__postcardFalseReselectionState), false, "The mixed successful batch briefly asked for source reselection.");
    await assertDeliveredImages(context, audit);
    await permanentlyDeleteJourney(page, title);
    cleanedUp = true;
    return { selected: fixtures.length, saved: audit.photos.length, fallback: 1, optimized: fixtures.length - 1, storageRequests: uploads.length, cleanedUp };
  } finally {
    if (created && !cleanedUp) await permanentlyDeleteJourney(page, title).catch((error) => console.error(`Cleanup failed for ${title}:`, error));
    await context.close();
  }
}

const browser = await chromium.launch({ headless: true });
try {
  const fixtureContext = await browser.newContext();
  const fixturePage = await fixtureContext.newPage();
  const formats = [
    await canvasPhoto(fixturePage, "image/jpeg", "safari-check.jpg", "#375548"),
    await canvasPhoto(fixturePage, "image/png", "safari-check.png", "#9b6a45"),
    await canvasPhoto(fixturePage, "image/webp", "safari-check.webp", "#49647a"),
  ];
  const mixed = [
    { ...formats[0], name: "mixed-1.jpg" },
    { ...formats[1], name: "mixed-2.png" },
    { ...formats[2], name: "mixed-3.webp" },
    { ...formats[0], name: "mixed-4.jpg" },
    { ...formats[1], name: "mixed-5.png" },
  ];
  await fixtureContext.close();

  const optimized = await runFormatPath(browser, formats, "optimized_webp");
  const fallback = await runFormatPath(browser, formats, "original_fallback");
  const batch = await runMixedBatch(browser, mixed);
  console.log(JSON.stringify({ optimized, fallback, batch }));
} finally {
  await browser.close();
}
