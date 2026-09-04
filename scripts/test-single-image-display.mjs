import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import piexif from "piexifjs";
import { chromium } from "playwright";
import { createAccountAndJourney, permanentlyDeleteJourney, trackStorageUploads, visible } from "./photo-storage-test-helpers.mjs";

const execFile = promisify(execFileCallback);
const convexCli = path.resolve("node_modules/convex/bin/main.js");
const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const forceOriginalFallback = process.env.FORCE_ORIGINAL_FALLBACK === "1";

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

function withJourneyExif(jpeg) {
  const exif = {
    "0th": { [piexif.ImageIFD.Orientation]: 1 },
    Exif: {
      [piexif.ExifIFD.DateTimeOriginal]: "2026:08:15 10:15:30",
      [piexif.ExifIFD.DateTimeDigitized]: "2026:08:15 10:15:30",
    },
    GPS: {
      [piexif.GPSIFD.GPSLatitudeRef]: "N",
      [piexif.GPSIFD.GPSLatitude]: [[15, 1], [33, 1], [265932, 10000]],
      [piexif.GPSIFD.GPSLongitudeRef]: "E",
      [piexif.GPSIFD.GPSLongitude]: [[73, 1], [45, 1], [14076, 10000]],
    },
  };
  return Buffer.from(piexif.insert(piexif.dump(exif), jpeg.toString("binary")), "binary");
}

async function imageDetails(locator, timeout = 90_000) {
  await visible(locator, timeout);
  await locator.scrollIntoViewIfNeeded();
  const handle = await locator.elementHandle();
  assert.ok(handle, "Expected an image element.");
  await locator.page().waitForFunction((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0, handle, { timeout });
  return await locator.evaluate((image) => ({
    src: image.getAttribute("src"),
    currentSrc: image.currentSrc,
    width: image.naturalWidth,
    height: image.naturalHeight,
  }));
}

const browser = await chromium.launch({ headless: true });
const ownerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
const ownerPage = await ownerContext.newPage();
if (forceOriginalFallback) {
  await ownerPage.addInitScript(() => {
    const nativeToBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
      if (type === "image/webp") {
        callback(new Blob([new Uint8Array([1])], { type: "image/png" }));
        return;
      }
      nativeToBlob.call(this, callback, type, quality);
    };
  });
}
const journeyName = `Display regression ${Date.now()}`;
const journeyTitle = `${journeyName} story`;
const sourceName = "single-display-regression.jpg";
let journeyCreated = false;
let cleanedUp = false;
let recipientContext;

try {
  await createAccountAndJourney(ownerPage, journeyName);
  journeyCreated = true;
  const sourceJpeg = withJourneyExif(await readFile(path.resolve("public/images/coast.jpg")));
  const uploads = trackStorageUploads(ownerPage);

  await ownerPage.locator('input[type="file"]').setInputFiles({ name: sourceName, mimeType: "image/jpeg", buffer: sourceJpeg });
  await ownerPage.getByRole("button", { name: "Upload 1 selected photo" }).click();
  await visible(ownerPage.getByText("Possibly unrelated", { exact: false }), 180_000);
  assert.equal(uploads.length, 1, "A fresh JPEG must make exactly one Convex storage request.");
  assert.ok(uploads[0].contentType.startsWith(forceOriginalFallback ? "image/jpeg" : "image/webp"), "The one durable upload must match the expected optimized or fallback type.");

  const reviewImage = await imageDetails(ownerPage.locator(".review-photo-card img").first());
  const audit = await inlineQuery(`
    const trip = (await ctx.db.query("trips").collect()).filter((item) => item.title === ${JSON.stringify(journeyName)}).sort((a, b) => b._creationTime - a._creationTime)[0];
    if (!trip) return null;
    const photos = await ctx.db.query("photos").withIndex("by_trip", (q) => q.eq("tripId", trip._id)).collect();
    const photo = photos[0];
    const file = photo ? await ctx.db.system.get(photo.storageId) : null;
    return { tripId: trip._id, ownerId: trip.ownerId, photos, file };
  `);
  assert.ok(audit, "The disposable journey record should exist.");
  assert.equal(audit.photos.length, 1, "The JPEG should create one photo record.");
  const photo = audit.photos[0];
  assert.equal(photo.storageLayout, "single_image_v1");
  assert.equal(photo.storedPhotoKind, forceOriginalFallback ? "original_fallback" : "optimized_webp");
  assert.equal(photo.thumbnailStorageId, undefined);
  assert.equal(photo.displayStorageId, undefined);
  assert.equal(photo.largeStorageId, undefined);
  assert.equal(audit.file?._id, photo.storageId);
  assert.equal(audit.file?.contentType, forceOriginalFallback ? "image/jpeg" : "image/webp");
  assert.ok(audit.file?.size > 0, "The stored image must contain bytes.");
  assert.equal(photo.hasGpsMetadata, true);
  assert.equal(photo.hasDateMetadata, true);
  assert.ok(Math.abs(photo.latitude - 15.557387) < 0.00001);
  assert.ok(Math.abs(photo.longitude - 73.750391) < 0.00001);
  assert.equal(new Date(photo.capturedAt).getFullYear(), 2026);

  const identity = { subject: audit.ownerId };
  const savedTrip = await convexRun("trips:getOne", { tripId: audit.tripId }, identity);
  const savedPhoto = savedTrip.photos.find((item) => item._id === photo._id);
  assert.equal(savedPhoto.url, savedPhoto.displayUrl);
  assert.equal(savedPhoto.url, savedPhoto.thumbnailUrl);
  assert.ok(savedPhoto.url.includes(`/photo?storageId=${photo.storageId}`));
  const copies = await convexRun("trips:getPhotoCopies", { photoId: photo._id }, identity);
  assert.equal(copies.storageLayout, "single_image_v1");
  assert.equal(copies.savedImageUrl, savedPhoto.url);

  const assetPage = await ownerContext.newPage();
  const assetResponse = await assetPage.goto(savedPhoto.url);
  assert.equal(assetResponse?.status(), 200);
  assert.equal(assetResponse?.headers()["content-type"], forceOriginalFallback ? "image/jpeg" : "image/webp");
  const storedDimensions = await assetPage.evaluate(() => ({ width: document.images[0]?.naturalWidth, height: document.images[0]?.naturalHeight }));
  assert.ok(storedDimensions.width > 0 && storedDimensions.height > 0, "The stored image must decode as an image.");
  if (!forceOriginalFallback) assert.ok(Math.max(storedDimensions.width, storedDimensions.height) <= 1600, "The optimized WebP must stay within 1600 pixels.");
  await assetPage.close();

  await ownerPage.reload();
  await visible(ownerPage.getByRole("heading", { name: "Your journeys" }));
  const libraryCard = ownerPage.locator(".journey-library-item").filter({ hasText: journeyName });
  const libraryImage = await imageDetails(libraryCard.locator("img"));
  await libraryCard.getByRole("button", { name: "Continue journey" }).click();
  const reopenedReviewImage = await imageDetails(ownerPage.locator(".review-photo-card img").first());

  await ownerPage.getByRole("button", { name: "Restore photo" }).click();
  await visible(ownerPage.getByRole("button", { name: "Add memory or recommendation" }), 180_000);
  const timelineImage = await imageDetails(ownerPage.locator(".moment-photo-grid img").first());
  await visible(ownerPage.locator(".geographic-map"));
  await ownerPage.getByRole("button", { name: /^Stop 1:/ }).click();
  const mapDetailImage = await imageDetails(ownerPage.locator(".map-stop-detail img"));
  await ownerPage.getByText("Photo details", { exact: true }).click();
  const evidence = await ownerPage.locator(".photo-evidence").innerText();
  assert.match(evidence, /2026/);
  assert.match(evidence, /15\.5574, 73\.7504/);

  await ownerPage.locator('summary[aria-label="More journey actions"]').click();
  await ownerPage.getByRole("button", { name: "Edit title and main photo" }).click();
  assert.equal(await ownerPage.locator("details.workspace-menu").getAttribute("open"), null, "Edit title and main photo must close the mobile menu.");
  await visible(ownerPage.locator('[aria-label="Edit journey title and main photo"]'));
  await ownerPage.getByRole("textbox", { name: /^Journey title/ }).fill(journeyTitle);
  await ownerPage.getByRole("button", { name: "Save", exact: true }).click();
  await visible(ownerPage.getByText("Title and main photo saved"));
  await ownerPage.locator('summary[aria-label="More journey actions"]').click();
  await ownerPage.getByRole("button", { name: "Edit trip details" }).click();
  assert.equal(await ownerPage.locator("details.workspace-menu").getAttribute("open"), null, "Edit trip details must close the mobile menu.");
  const detailsEditor = ownerPage.locator('[aria-label="Edit trip details"]');
  await visible(detailsEditor);
  await detailsEditor.getByRole("button", { name: "Cancel" }).click();
  await ownerPage.getByRole("button", { name: /^Preview/ }).click();
  await visible(ownerPage.getByRole("button", { name: "Back to timeline" }));
  const previewImage = await imageDetails(ownerPage.locator(".timeline-preview-screen img").first());
  await ownerPage.getByRole("button", { name: "Publish and create link" }).click();
  await visible(ownerPage.getByText("Journey shared. Recipients must sign in to see the full timeline."));
  const shareUrl = await ownerPage.locator(".share-link input").inputValue();
  assert.ok(shareUrl.startsWith(`${baseUrl}/share/`));

  recipientContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const recipientPage = await recipientContext.newPage();
  await recipientPage.goto(shareUrl);
  const signedOutShareImage = await imageDetails(recipientPage.locator(".limited-preview img"));
  await recipientPage.getByRole("button", { name: "New here? Create an account" }).click();
  await recipientPage.getByLabel("Email").fill(`display-recipient-${Date.now()}@example.com`);
  await recipientPage.getByLabel("Password").fill("triplog-test-password");
  await recipientPage.getByRole("button", { name: "Create account" }).click();
  await visible(recipientPage.getByText("Shared journey", { exact: true }), 90_000);
  const sharedJourneyImage = await imageDetails(recipientPage.locator(".public-shell img").first());

  const legacy = await inlineQuery(`
    const photos = await ctx.db.query("photos").collect();
    const photo = photos.find((item) => item.storageLayout === undefined && item.thumbnailStorageId !== undefined && item.displayStorageId !== undefined && item.largeStorageId !== undefined);
    if (!photo) return null;
    const trip = await ctx.db.get(photo.tripId);
    return trip ? { photo, ownerId: trip.ownerId } : null;
  `);
  assert.ok(legacy, "A legacy photo should remain available for compatibility validation.");
  const legacyCopies = await convexRun("trips:getPhotoCopies", { photoId: legacy.photo._id }, { subject: legacy.ownerId });
  assert.equal(legacyCopies.storageLayout, "legacy");
  assert.ok(legacyCopies.originalUrl.includes(`storageId=${legacy.photo.storageId}`));
  assert.ok(legacyCopies.thumbnailUrl.includes(`storageId=${legacy.photo.thumbnailStorageId}`));
  assert.ok(legacyCopies.displayUrl.includes(`storageId=${legacy.photo.displayStorageId}`));
  assert.ok(legacyCopies.largeUrl.includes(`storageId=${legacy.photo.largeStorageId}`));
  const legacyResponse = await ownerContext.request.get(legacyCopies.thumbnailUrl);
  assert.equal(legacyResponse.status(), 200);
  assert.ok((legacyResponse.headers()["content-type"] ?? "").startsWith("image/"));

  await permanentlyDeleteJourney(ownerPage, journeyTitle);
  cleanedUp = true;
  console.log(JSON.stringify({
    selected: 1,
    mode: forceOriginalFallback ? "original_fallback" : "optimized_webp",
    savedPhotoRecords: 1,
    storageUploads: uploads.length,
    storedContentType: audit.file.contentType,
    storedBytes: audit.file.size,
    storedDimensions,
    storageLayout: photo.storageLayout,
    backendUrlsMatch: savedPhoto.url === savedPhoto.displayUrl && savedPhoto.url === savedPhoto.thumbnailUrl,
    reviewImage,
    libraryImage,
    reopenedReviewImage,
    timelineImage,
    mapDetailImage,
    previewImage,
    signedOutShareImage,
    sharedJourneyImage,
    gpsPreserved: photo.hasGpsMetadata,
    captureTimePreserved: photo.hasDateMetadata,
    legacyThumbnailStatus: legacyResponse.status(),
    cleanedUp,
  }));
} finally {
  await recipientContext?.close();
  if (journeyCreated && !cleanedUp) await permanentlyDeleteJourney(ownerPage, journeyTitle).catch(async () => {
    await permanentlyDeleteJourney(ownerPage, journeyName).catch((error) => console.error("Cleanup failed:", error));
  });
  await ownerContext.close();
  await browser.close();
}
