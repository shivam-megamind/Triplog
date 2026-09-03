import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3001";
const screenshotDirectory = path.resolve(".validation", "core-stabilization");

async function visible(locator, timeout = 30_000) {
  await locator.waitFor({ state: "visible", timeout });
}

async function noHorizontalOverflow(page) {
  const widths = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert.ok(widths.scrollWidth <= widths.width, `Horizontal overflow: ${JSON.stringify(widths)}`);
}

async function loadVisiblePhotos(page) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 600) {
    await page.evaluate((position) => window.scrollTo(0, position), y);
    await page.waitForTimeout(40);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function createAccountAndJourney(page) {
  const email = `core-pass-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
  await page.goto(baseUrl);
  const landingAction = page.getByRole("button", { name: "Turn a trip into a book" }).first();
  await visible(landingAction);
  await landingAction.click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("triplog-test-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/book/);
  await visible(page.getByRole("heading", { name: "Your journeys" }));
  assert.equal(await page.getByText("No personal notes added.").count(), 0);
  await page.getByRole("button", { name: "Create journey" }).click();
  await page.getByLabel("Destination or trip region").fill("Core pass coast");
  await page.getByLabel("Approximate start date").fill("2026-09-01");
  await page.getByLabel("Approximate end date").fill("2026-09-03");
  await page.getByRole("button", { name: "Continue to photos" }).click();
  await visible(page.getByText("Choose trip photos", { exact: true }));
  await page.locator('input[type="file"]').setInputFiles(path.resolve("public/images/coast.jpg"));
  await page.getByRole("button", { name: "Upload 1 selected photo" }).click();
  await visible(page.getByText("Unplaced photos"), 90_000);
  await page.locator('.review-photo-card input[type="date"]').fill("2026-09-02");
  await page.getByRole("button", { name: "Place on this date" }).click();
  await visible(page.getByRole("button", { name: "Add memory or recommendation" }), 90_000);
}

async function run() {
  await mkdir(screenshotDirectory, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();

  try {
    await createAccountAndJourney(page);
    assert.equal(await page.getByText("No personal notes added.").count(), 0);

    await page.getByRole("button", { name: "Add memory or recommendation" }).click();
    const save = page.getByRole("button", { name: "Save", exact: true });
    assert.equal(await save.isDisabled(), true, "Save should be disabled before a change");
    await page.getByRole("textbox", { name: /^Memory/ }).fill("The sea was calm just before sunset.");
    await page.getByRole("textbox", { name: /^Useful detail/ }).fill("The quieter path started beside the old wall.");
    await page.getByRole("textbox", { name: /^Recommendation/ }).fill("Arrive before the evening crowd.");
    await page.getByRole("textbox", { name: /^Warning/ }).fill("The rocks were slippery after rain.");
    await save.dblclick();
    await visible(page.getByText("Saved", { exact: true }));
    await visible(page.getByRole("button", { name: "Edit memory and tips" }));
    await visible(page.getByText("The quieter path started beside the old wall."));
    assert.equal(await page.getByRole("textbox", { name: /^Memory/ }).count(), 0, "Editor should close after save");

    await page.reload();
    await page.getByRole("button", { name: "Continue journey" }).click();
    await visible(page.getByText("The sea was calm just before sunset."));
    await visible(page.getByText("The quieter path started beside the old wall."));

    await page.getByRole("button", { name: "Add photos" }).click();
    await visible(page.getByText("1 already saved"));
    await page.getByRole("button", { name: "Back to journey" }).click();
    await visible(page.getByRole("heading", { name: "Core pass coast" }));
    await page.getByRole("button", { name: "Add photos" }).click();
    await visible(page.getByText("Choose trip photos", { exact: true }));
    await page.locator('input[type="file"]').setInputFiles(path.resolve("public/images/road.jpg"));
    await page.getByRole("button", { name: "Upload 1 selected photo" }).click();
    await visible(page.getByText("Unplaced photos"), 90_000);
    if (await page.locator(".review-photo-card:visible").count() === 0) {
      await page.locator("summary").filter({ hasText: "Unplaced photos" }).click();
    }
    const unplacedCard = page.locator(".review-photo-card:visible").last();
    await unplacedCard.locator('input[type="date"]').fill("2026-09-03");
    await unplacedCard.getByRole("button", { name: "Place on this date" }).click();
    await visible(page.getByText("2 photos", { exact: true }).first(), 90_000);

    await page.getByRole("button", { name: "Add photos" }).click();
    await visible(page.getByText("2 already saved"));
    await visible(page.getByText("Choose trip photos", { exact: true }));
    await page.locator('input[type="file"]').setInputFiles(path.resolve("public/images/road.jpg"));
    await visible(page.getByText(/road\.jpg is already safely uploaded/i));
    assert.equal(await page.getByRole("button", { name: "Choose photos to continue" }).isDisabled(), true);
    await page.getByRole("button", { name: "Back to journey" }).click();

    await page.getByRole("button", { name: "Preview and share" }).click();
    try {
      await visible(page.getByRole("button", { name: "Back to timeline" }), 10_000);
    } catch {
      const displayedError = await page.locator(".form-error:visible").allTextContents();
      const visiblePage = (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 1200);
      throw new Error(`Recipient preview did not open. Visible errors: ${displayedError.join(" | ") || "none"}. Page: ${visiblePage}`);
    }
    await page.getByRole("button", { name: "Back to timeline" }).click();
    await visible(page.getByRole("button", { name: "Add photos" }));

    for (const [name, width, height] of [
      ["desktop", 1440, 1000],
      ["tablet", 768, 1024],
      ["mobile", 390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      await noHorizontalOverflow(page);
      await visible(page.getByRole("button", { name: width <= 600 ? "Add" : "Add photos", exact: true }));
      await visible(page.getByRole("button", { name: width <= 600 ? "Preview" : "Preview and share", exact: true }));
      await loadVisiblePhotos(page);
      const firstTimelinePhoto = page.locator(".moment-photo-grid img").first();
      await firstTimelinePhoto.scrollIntoViewIfNeeded();
      await page.waitForFunction((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0, await firstTimelinePhoto.elementHandle());
      const photoBox = await firstTimelinePhoto.boundingBox();
      assert.ok(photoBox && photoBox.height >= 300, `Timeline photo is not readable at ${width}px: ${JSON.stringify(photoBox)}`);
      await page.screenshot({ path: path.join(screenshotDirectory, `${name}-timeline.png`) });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.join(screenshotDirectory, `${name}.png`), fullPage: true });
    }

    console.log("Core browser checks passed at 1440px, 768px, and 390px.");
  } finally {
    await context.close();
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
