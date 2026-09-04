import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import piexif from "piexifjs";
import { chromium } from "playwright";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const screenshotDirectory = path.resolve(".validation", "single-image-storage");

async function visible(locator, timeout = 90_000) {
  await locator.waitFor({ state: "visible", timeout });
}

function withJourneyExif(jpeg) {
  const exif = {
    "0th": { [piexif.ImageIFD.Orientation]: 6 },
    Exif: {
      [piexif.ExifIFD.DateTimeOriginal]: "2026:09:02 10:15:30",
      [piexif.ExifIFD.DateTimeDigitized]: "2026:09:02 10:15:30",
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

async function canvasPhoto(page, type, name, color) {
  const bytes = await page.evaluate(async ({ outputType, fill }) => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas unavailable in validation browser.");
    context.fillStyle = fill;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#f7f2e8";
    context.font = "48px serif";
    context.fillText("Triplog", 190, 250);
    const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not encode fixture.")), outputType, 0.9));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }, { outputType: type, fill: color });
  return { name, mimeType: type, buffer: Buffer.from(bytes) };
}

function isStorageUpload(request) {
  return request.method() === "POST" && request.url().includes("/api/storage/");
}

async function createAccountAndJourney(page, journeyName) {
  const email = `storage-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
  await page.goto(baseUrl);
  await visible(page.getByRole("button", { name: "Turn a trip into a book" }).first());
  await page.getByRole("button", { name: "Turn a trip into a book" }).first().click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("triplog-test-password");
  await page.getByRole("button", { name: "Create account" }).click();
  try {
    await page.waitForURL(/\/book/, { timeout: 60_000 });
  } catch (error) {
    const visibleErrors = await page.locator('[role="alert"]:visible, .form-error:visible').allTextContents();
    const screen = (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 1200);
    throw new Error(`Account creation did not open /book. Errors: ${visibleErrors.join(" | ") || "none"}. Screen: ${screen}`, { cause: error });
  }
  await visible(page.getByRole("heading", { name: "Your journeys" }));
  await page.getByRole("button", { name: "Create journey" }).click();
  await page.getByLabel("Destination or trip region").fill(journeyName);
  await page.getByLabel("Approximate start date").fill("2026-09-01");
  await page.getByLabel("Approximate end date").fill("2026-09-03");
  await page.getByRole("button", { name: "Continue to photos" }).click();
  await visible(page.getByText("Choose trip photos", { exact: true }));
}

async function permanentlyDeleteJourney(page, journeyName) {
  await page.goto(`${baseUrl}/book`);
  await visible(page.getByRole("heading", { name: "Your journeys" }));
  const card = page.locator(".journey-library-item").filter({ hasText: journeyName });
  await card.locator(".journey-actions summary").click();
  await card.getByRole("button", { name: "Delete", exact: true }).click();
  await card.getByRole("button", { name: "Move to Recently Deleted" }).click();
  await page.getByRole("tab", { name: /Recently Deleted/ }).click();
  const deleted = page.locator(".deleted-journey").filter({ hasText: journeyName });
  await visible(deleted);
  page.once("dialog", (dialog) => dialog.accept());
  await deleted.getByRole("button", { name: "Delete permanently" }).click();
  await deleted.waitFor({ state: "detached", timeout: 90_000 });
}

async function run() {
  await mkdir(screenshotDirectory, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const journeyName = `Storage validation ${Date.now()}`;
  let cleanedUp = false;
  const allStorageRequests = [];
  page.on("request", (request) => {
    if (isStorageUpload(request)) allStorageRequests.push(request.url());
  });

  try {
    await createAccountAndJourney(page, journeyName);

    const beforeHeic = allStorageRequests.length;
    await page.locator('input[type="file"]').setInputFiles({ name: "unsupported-on-this-browser.heic", mimeType: "image/heic", buffer: Buffer.from("not a decodable HEIC image") });
    await page.getByRole("button", { name: "Upload 1 selected photo" }).click();
    await visible(page.getByText(/cannot be prepared by this browser/i).first());
    assert.equal(allStorageRequests.length, beforeHeic, "An undecodable HEIC source must not be uploaded unchanged.");
    await page.getByRole("button", { name: "Remove unsupported-on-this-browser.heic" }).click();

    const jpeg = await readFile(path.resolve("public/images/coast.jpg"));
    const exifJpeg = withJourneyExif(jpeg);
    const beforeJpeg = allStorageRequests.length;
    await page.locator('input[type="file"]').setInputFiles({ name: "goa-with-evidence.jpg", mimeType: "image/jpeg", buffer: exifJpeg });
    await page.getByRole("button", { name: "Upload 1 selected photo" }).click();
    await visible(page.getByRole("button", { name: "Add memory or recommendation" }));
    assert.equal(allStorageRequests.length - beforeJpeg, 1, "A new JPEG must create exactly one storage upload.");
    await visible(page.locator(".geographic-map"));
    await page.getByText("Photo details", { exact: true }).click();
    await visible(page.getByRole("link", { name: "Saved web image" }));
    assert.equal(await page.getByRole("link", { name: "Original", exact: true }).count(), 0, "New photos must not expose a stored original.");
    await visible(page.getByText(/15\.5574, 73\.7504/));
    const evidenceText = await page.locator(".photo-evidence").innerText();
    assert.match(evidenceText, /2026/, "The original capture year must survive processing.");
    assert.doesNotMatch(evidenceText, /time unknown/i, "The original capture time must survive processing.");

    await page.getByRole("button", { name: /^Preview/ }).click();
    await visible(page.getByRole("button", { name: "Back to timeline" }));
    await visible(page.locator("img").first());
    await page.getByRole("button", { name: "Back to timeline" }).click();

    await page.getByRole("button", { name: /^Add(?: photos)?$/ }).click();
    await visible(page.getByText("Choose trip photos", { exact: true }));
    const road = await readFile(path.resolve("public/images/road.jpg"));
    const batch = Array.from({ length: 25 }, (_, index) => ({
      name: `mobile-batch-${String(index + 1).padStart(2, "0")}.jpg`,
      mimeType: "image/jpeg",
      buffer: road,
    }));
    const beforeBatch = allStorageRequests.length;
    await page.locator('input[type="file"]').setInputFiles(batch);
    await visible(page.getByText("25 photos selected", { exact: true }));
    await page.getByRole("button", { name: "Upload 25 selected photos" }).click();
    await visible(page.getByText("Unplaced photos"), 180_000);
    assert.equal(allStorageRequests.length - beforeBatch, 25, "A 25-photo batch must make 25 storage uploads, not 100.");

    await page.getByRole("button", { name: "Add", exact: true }).click();
    await visible(page.getByText("Choose trip photos", { exact: true }));
    const png = await canvasPhoto(page, "image/png", "batch-format.png", "#244336");
    const webp = await canvasPhoto(page, "image/webp", "batch-format.webp", "#a8563c");
    const failureBatch = [png, webp, { name: "batch-format.jpg", mimeType: "image/jpeg", buffer: jpeg }];
    let abortNextUpload = true;
    await page.route("**/api/storage/**", async (route) => {
      if (abortNextUpload && route.request().method() === "POST") {
        abortNextUpload = false;
        await route.abort("connectionfailed");
      } else {
        await route.continue();
      }
    });
    await page.locator('input[type="file"]').setInputFiles(failureBatch);
    await page.getByRole("button", { name: "Upload 3 selected photos" }).click();
    await visible(page.getByText(/2 new photos saved\. 1 file still needs Retry\./));
    assert.equal(await page.locator('.upload-selection-grid li[data-status="saved"]').count(), 2, "Two files should finish when one file fails.");
    assert.equal(await page.locator('.upload-selection-grid li[data-status="failed"]').count(), 1, "The failed file should remain visible for retry.");
    await page.unroute("**/api/storage/**");
    await page.locator(".retry-photo-button").click();
    await visible(page.getByText("Unplaced photos"), 180_000);
    await page.screenshot({ path: path.join(screenshotDirectory, "390-storage-result.png"), fullPage: true });

    await permanentlyDeleteJourney(page, journeyName);
    cleanedUp = true;
    console.log("Single-image storage browser checks passed: JPEG metadata/GPS, PNG, WebP, safe HEIC failure, one upload per photo, 25-photo batch, isolated failure/retry, journey map, share preview, and permanent deletion.");
  } finally {
    if (!cleanedUp) await permanentlyDeleteJourney(page, journeyName).catch((error) => console.error("Validation cleanup could not remove its disposable journey:", error));
    await context.close();
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
