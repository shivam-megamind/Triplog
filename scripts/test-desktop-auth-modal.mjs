import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const forest = "rgb(37, 70, 60)";
const password = "postcard-test-password";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
let mobileContext;
const browserErrors = [];
page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
page.on("pageerror", (error) => browserErrors.push(error.message));

try {
  await page.goto(baseUrl);
  const mobileSignIn = page.getByRole("button", { name: "Sign in" });
  await mobileSignIn.waitFor({ state: "visible" });
  const mobileBox = await mobileSignIn.boundingBox();
  assert.ok(mobileBox && mobileBox.width >= 44 && mobileBox.height >= 44, `Mobile Sign in hit area was ${JSON.stringify(mobileBox)}`);
  await mobileSignIn.click();
  await page.locator(".landing-auth-dialog").waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Close authentication" }).click();
  await page.locator(".landing-auth-backdrop").waitFor({ state: "hidden" });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(baseUrl);
  const buildAction = page.getByRole("button", { name: "Build my journey" }).first();
  await buildAction.click();

  const backdrop = page.locator(".landing-auth-backdrop");
  const dialog = page.locator(".landing-auth-dialog");
  await dialog.waitFor({ state: "visible" });
  assert.equal(await backdrop.evaluate((element) => element.parentElement === document.body), true, "Auth backdrop is trapped inside a landing-page stacking layer");

  const layers = await backdrop.evaluate((element) => {
    const dialogElement = element.querySelector(".landing-auth-dialog");
    return {
      backdropPointerEvents: getComputedStyle(element).pointerEvents,
      backdropZIndex: Number(getComputedStyle(element).zIndex),
      dialogPointerEvents: dialogElement ? getComputedStyle(dialogElement).pointerEvents : "missing",
      dialogZIndex: dialogElement ? Number(getComputedStyle(dialogElement).zIndex) : 0,
    };
  });
  assert.equal(layers.backdropPointerEvents, "auto");
  assert.equal(layers.dialogPointerEvents, "auto");
  assert.ok(layers.backdropZIndex > 0);
  assert.ok(layers.dialogZIndex > 0);

  await page.locator("main").evaluate((element) => {
    window.__postcardBehindModalClicks = 0;
    element.addEventListener("click", () => { window.__postcardBehindModalClicks += 1; });
  });
  assert.equal(await page.evaluate(() => document.elementFromPoint(10, 10)?.classList.contains("landing-auth-backdrop")), true);
  await page.mouse.click(10, 10);
  assert.equal(await page.evaluate(() => window.__postcardBehindModalClicks), 0, "Landing page received a click through the auth backdrop");
  await backdrop.waitFor({ state: "hidden" });

  await buildAction.click();
  const authCard = page.locator(".auth-card");
  const heading = authCard.locator("h2");
  assert.equal(await heading.textContent(), "Create a private account");
  assert.equal(await heading.evaluate((element) => getComputedStyle(element).color), forest);
  await authCard.getByRole("button", { name: "Already have an account? Sign in" }).click();
  assert.equal(await heading.textContent(), "Sign in");
  assert.equal(await heading.evaluate((element) => getComputedStyle(element).color), forest);
  await authCard.getByRole("button", { name: "New here? Create an account" }).click();

  const createAccount = authCard.getByRole("button", { name: "Create account" });
  const createBox = await createAccount.boundingBox();
  assert.ok(createBox);
  assert.equal(await page.evaluate(({ x, y }) => {
    const target = document.elementFromPoint(x, y);
    return Boolean(target?.closest(".auth-card button.primary-button"));
  }, { x: createBox.x + createBox.width / 2, y: createBox.y + createBox.height / 2 }), true, "Create account does not own its visible centre point");

  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `desktop-auth-${stamp}@example.com`;
  await authCard.getByLabel("Email").fill(email);
  await authCard.getByLabel("Password").fill(password);
  await createAccount.click();
  await page.waitForFunction(() => document.querySelector(".auth-card button.primary-button")?.textContent?.trim() === "Opening…");
  try {
  await page.waitForURL(/\/book/, { timeout: 90_000 });
  } catch (error) {
    const visibleErrors = await page.locator('[role="alert"]:visible').allTextContents();
    throw new Error(`Desktop account submit did not reach /book. URL: ${page.url()}. Form errors: ${visibleErrors.join(" | ") || "none"}. Browser errors: ${browserErrors.join(" | ") || "none"}. ${error instanceof Error ? error.message : String(error)}`);
  }
  await page.getByRole("heading", { name: "Your journeys" }).waitFor({ state: "visible" });

  mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(baseUrl);
  await mobilePage.getByRole("button", { name: "Sign in" }).click();
  const mobileAuthCard = mobilePage.locator(".auth-card");
  await mobileAuthCard.getByLabel("Email").fill(email);
  await mobileAuthCard.getByLabel("Password").fill(password);
  await mobileAuthCard.getByRole("button", { name: "Sign in", exact: true }).click();
  await mobilePage.waitForURL(/\/book/, { timeout: 90_000 });
  await mobilePage.getByRole("heading", { name: "Your journeys" }).waitFor({ state: "visible" });

  console.log(JSON.stringify({
    desktopCreateAccountClicked: true,
    backgroundClickBlocked: true,
    mobileSignInCompleted: true,
    authHeadingColor: forest,
    mobileSignInWidth: mobileBox.width,
    mobileSignInHeight: mobileBox.height,
  }));
} finally {
  await mobileContext?.close();
  await context.close();
  await browser.close();
}
