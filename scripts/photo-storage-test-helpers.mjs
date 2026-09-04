import assert from "node:assert/strict";

export const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3001";

export async function visible(locator, timeout = 90_000) {
  await locator.waitFor({ state: "visible", timeout });
}

export function isStorageUpload(request) {
  return request.method() === "POST" && request.url().includes("/api/storage/");
}

export function trackStorageUploads(page) {
  const uploads = [];
  page.on("request", (request) => {
    if (!isStorageUpload(request)) return;
    const body = request.postDataBuffer();
    uploads.push({
      bytes: body?.byteLength ?? 0,
      contentType: request.headers()["content-type"] ?? "",
      url: request.url(),
    });
  });
  return uploads;
}

export async function canvasPhoto(page, mimeType, name, color) {
  const bytes = await page.evaluate(async ({ type, fill }) => {
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
    const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not create test photo.")), type, 0.9));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }, { type: mimeType, fill: color });
  return { name, mimeType, buffer: Buffer.from(bytes) };
}

export async function createAccountAndJourney(page, journeyName) {
  const email = `storage-check-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
  await page.goto(baseUrl);
  await visible(page.getByRole("button", { name: "Turn a trip into a book" }).first());
  await page.getByRole("button", { name: "Turn a trip into a book" }).first().click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("triplog-test-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/book/, { timeout: 60_000 });
  await visible(page.getByRole("heading", { name: "Your journeys" }));
  await page.getByRole("button", { name: "Create journey" }).click();
  await page.getByLabel("Destination or trip region").fill(journeyName);
  await page.getByLabel("Approximate start date").fill("2026-09-01");
  await page.getByLabel("Approximate end date").fill("2026-09-03");
  await page.getByRole("button", { name: "Continue to photos" }).click();
  await visible(page.getByText("Choose trip photos", { exact: true }));
}

export async function waitForSavedCards(page, expected, timeout = 240_000) {
  await page.waitForFunction((count) => document.querySelectorAll('.upload-selection-grid li[data-status="saved"]').length === count, expected, { timeout });
  assert.equal(await page.locator('.upload-selection-grid li[data-status="failed"]').count(), 0, "No selected photo should fail.");
}

export async function permanentlyDeleteJourney(page, journeyName) {
  await page.goto(`${baseUrl}/book`);
  await visible(page.getByRole("heading", { name: "Your journeys" }));
  const card = page.locator(".journey-library-item").filter({ hasText: journeyName });
  await visible(card);
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
