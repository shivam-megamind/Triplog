import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import piexif from "piexifjs";
import { chromium } from "playwright";
import { permanentlyDeleteJourney, visible } from "./photo-storage-test-helpers.mjs";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const password = "triplog-test-password";

function withJourneyExif(jpeg, hour) {
  const exif = {
    "0th": { [piexif.ImageIFD.Orientation]: 1 },
    Exif: {
      [piexif.ExifIFD.DateTimeOriginal]: `2026:09:02 ${String(hour).padStart(2, "0")}:15:30`,
      [piexif.ExifIFD.DateTimeDigitized]: `2026:09:02 ${String(hour).padStart(2, "0")}:15:30`,
    },
    GPS: {
      [piexif.GPSIFD.GPSLatitudeRef]: "N",
      [piexif.GPSIFD.GPSLatitude]: [[15, 1], [29, 1], [0, 1]],
      [piexif.GPSIFD.GPSLongitudeRef]: "E",
      [piexif.GPSIFD.GPSLongitude]: [[73, 1], [49, 1], [0, 1]],
    },
  };
  return Buffer.from(piexif.insert(piexif.dump(exif), jpeg.toString("binary")), "binary");
}

async function imageSource(locator) {
  await visible(locator);
  const handle = await locator.elementHandle();
  assert.ok(handle);
  await locator.page().waitForFunction((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0, handle);
  const source = await locator.getAttribute("src");
  assert.ok(source);
  const parsed = new URL(source, baseUrl);
  return parsed.searchParams.get("url") ?? parsed.href;
}

async function createJourney(page, destination, photos, options = {}) {
  await page.goto(`${baseUrl}/book`);
  await visible(page.getByRole("heading", { name: "Your journeys" }));
  await page.getByRole("button", { name: "Create journey" }).click();
  await page.getByLabel("Destination or trip region").fill(destination);
  await page.getByLabel("Approximate start date").fill("2026-09-01");
  await page.getByLabel("Approximate end date").fill("2026-09-03");
  await page.getByRole("button", { name: "Continue to photos" }).click();
  await visible(page.getByText("Choose trip photos", { exact: true }));
  await page.locator('input[type="file"]').setInputFiles(photos);
  await page.getByRole("button", { name: `Upload ${photos.length} selected photo${photos.length === 1 ? "" : "s"}` }).click();
  await visible(page.getByRole("button", { name: "Add memory or recommendation" }).first(), 180_000);

  let coverSource = await imageSource(page.locator(".compact-journey-header img"));
  if (options.coverFileName) {
    await page.locator('summary[aria-label="More journey actions"]').click();
    await page.getByRole("button", { name: "Edit title and main photo" }).click();
    if (options.editedTitle) await page.getByRole("textbox", { name: /^Journey title/ }).fill(options.editedTitle);
    await page.locator(".identity-controls select").selectOption({ label: options.coverFileName });
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await visible(page.getByText("Title and main photo saved"));
    coverSource = await imageSource(page.locator(".compact-journey-header img"));
  } else {
    assert.equal(await page.getByRole("textbox", { name: /^Journey title/ }).count(), 0, "The automatic title must not be touched.");
    assert.equal(await page.locator(".identity-controls select").count(), 0, "The automatic cover must not be touched.");
  }

  await page.getByRole("button", { name: /^Preview/ }).click();
  await visible(page.getByRole("button", { name: "Publish and create link" }));
  assert.equal(await page.getByRole("button", { name: "Publish and create link" }).isDisabled(), false);
  assert.equal(await page.getByText(/Confirm the journey title/i).count(), 0);
  assert.equal(await page.getByText(/Confirm the cover photograph/i).count(), 0);
  const publishedTitle = (await page.locator(".timeline-preview-screen h1").last().textContent())?.trim();
  assert.ok(publishedTitle);
  await page.getByRole("button", { name: "Publish and create link" }).click();
  await visible(page.getByText("Journey shared. Recipients must sign in to see the full timeline."));
  const shareUrl = await page.locator(".share-link input").inputValue();
  assert.ok(shareUrl.startsWith(`${baseUrl}/share/`));
  return { coverSource, publishedTitle, shareUrl };
}

const browser = await chromium.launch({ headless: true });
const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const ownerPage = await ownerContext.newPage();
const stamp = Date.now();
const autoDestination = `Automatic title ${stamp}`;
const editedDestination = `Edited title ${stamp}`;
const editedTitle = `Our edited journey ${stamp}`;
const createdDestinations = [];

try {
  await ownerPage.goto(baseUrl);
  await visible(ownerPage.getByText("Postcard", { exact: true }).first());
  assert.equal((await ownerPage.locator("body").innerText()).includes("Triplog"), false);
  await ownerPage.setViewportSize({ width: 390, height: 844 });
  await visible(ownerPage.getByText("Postcard", { exact: true }).first());
  assert.equal(await ownerPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);

  await ownerPage.getByRole("button", { name: "Build my journey" }).first().click();
  await visible(ownerPage.getByLabel("Create a Postcard account"));
  await ownerPage.getByLabel("Email").fill(`postcard-publishing-${stamp}@example.com`);
  await ownerPage.getByLabel("Password").fill(password);
  await ownerPage.getByRole("button", { name: "Create account" }).click();
  try {
    await visible(ownerPage.getByRole("heading", { name: "Your journeys" }), 60_000);
  } catch {
    throw new Error(`Sign-up did not open the journey library. Page: ${(await ownerPage.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 1_200)}`);
  }

  const [coast, road] = await Promise.all([
    readFile(path.resolve("public/images/coast.jpg")),
    readFile(path.resolve("public/images/road.jpg")),
  ]);
  createdDestinations.push(autoDestination);
  const automatic = await createJourney(ownerPage, autoDestination, [{ name: `${autoDestination}-automatic.jpg`, mimeType: "image/jpeg", buffer: withJourneyExif(coast, 10) }]);
  assert.notEqual(automatic.publishedTitle, "");

  const chosenCoverName = `${editedDestination}-chosen-cover.jpg`;
  createdDestinations.push(editedDestination);
  const edited = await createJourney(ownerPage, editedDestination, [
    { name: `${editedDestination}-first-cover.jpg`, mimeType: "image/jpeg", buffer: withJourneyExif(coast, 11) },
    { name: chosenCoverName, mimeType: "image/jpeg", buffer: withJourneyExif(road, 12) },
  ], { coverFileName: chosenCoverName, editedTitle });
  assert.equal(edited.publishedTitle, editedTitle);

  const recipientContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const recipientPage = await recipientContext.newPage();
  await recipientPage.goto(automatic.shareUrl);
  await visible(recipientPage.getByRole("heading", { name: automatic.publishedTitle }));
  await visible(recipientPage.getByText("Postcard", { exact: true }).first());
  assert.equal(await imageSource(recipientPage.locator(".limited-preview img")), automatic.coverSource);

  const editedPreviewPage = await recipientContext.newPage();
  await editedPreviewPage.goto(edited.shareUrl);
  await visible(editedPreviewPage.getByRole("heading", { name: editedTitle }));
  assert.equal(await imageSource(editedPreviewPage.locator(".limited-preview img")), edited.coverSource);
  await editedPreviewPage.close();

  await recipientPage.getByRole("button", { name: "New here? Create an account" }).click();
  await recipientPage.getByLabel("Email").fill(`postcard-recipient-${stamp}@example.com`);
  await recipientPage.getByLabel("Password").fill(password);
  await recipientPage.getByRole("button", { name: "Create account" }).click();
  await visible(recipientPage.locator(".public-shell"), 90_000);
  assert.equal((await recipientPage.locator(".journey-bar-title").textContent())?.trim(), "Postcard · Read only");
  await visible(recipientPage.getByRole("heading", { name: automatic.publishedTitle }));

  await recipientPage.goto(edited.shareUrl);
  await visible(recipientPage.locator(".public-shell"));
  assert.equal((await recipientPage.locator(".journey-bar-title").textContent())?.trim(), "Postcard · Read only");
  await visible(recipientPage.getByRole("heading", { name: editedTitle }));
  await recipientContext.close();

  console.log(JSON.stringify({
    automaticTitle: automatic.publishedTitle,
    automaticShareUrl: automatic.shareUrl,
    editedTitle: edited.publishedTitle,
    editedShareUrl: edited.shareUrl,
    bothShareLinksOpened: true,
    automaticCoverUntouched: true,
    automaticCoverMatchedShare: true,
    changedCoverMatchedShare: true,
    postcardDesktopAndMobile: true,
  }));
} finally {
  for (const destination of createdDestinations.reverse()) {
    await permanentlyDeleteJourney(ownerPage, destination).catch((error) => console.error(`Cleanup failed for ${destination}:`, error));
  }
  await ownerContext.close();
  await browser.close();
}
