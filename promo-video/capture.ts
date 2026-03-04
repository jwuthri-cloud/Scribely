/**
 * Playwright capture script for Scribely promo video.
 *
 * Launches the real Electron app, drives it through scripted scenarios,
 * and saves screenshots + video clips to public/clips/.
 *
 * Usage:
 *   cd desktop && npm run build
 *   cd ../promo-video && npm run capture
 */

import { _electron as electron } from "playwright";
import { existsSync, mkdirSync, writeFileSync, renameSync } from "fs";
import path from "path";
import os from "os";

const DESKTOP_DIR = path.resolve(__dirname, "../desktop");
const CLIPS_DIR = path.resolve(__dirname, "public/clips");
const MAIN_JS = path.join(DESKTOP_DIR, "out/main/index.js");
const ELECTRON_BIN = path.join(
  DESKTOP_DIR,
  "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
);

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function preseedElectronStore() {
  const configDir = path.join(
    os.homedir(),
    "Library/Application Support/scribely-desktop"
  );
  mkdirSync(configDir, { recursive: true });
  const onboardingPath = path.join(configDir, "onboarding.json");
  writeFileSync(
    onboardingPath,
    JSON.stringify({ hasCompletedOnboarding: true })
  );
}

async function main() {
  if (!existsSync(MAIN_JS)) {
    console.error(
      `Desktop app not built. Run: cd desktop && npm run build\nExpected: ${MAIN_JS}`
    );
    process.exit(1);
  }
  if (!existsSync(ELECTRON_BIN)) {
    console.error(`Electron binary not found at ${ELECTRON_BIN}`);
    process.exit(1);
  }

  mkdirSync(CLIPS_DIR, { recursive: true });

  console.log("Pre-seeding electron-store (skip onboarding)...");
  preseedElectronStore();

  console.log("Launching Electron app...");

  const electronApp = await electron.launch({
    executablePath: ELECTRON_BIN,
    args: [MAIN_JS, "--no-sandbox"],
    cwd: DESKTOP_DIR,
    env: {
      ...process.env,
      SCRIBELY_SKIP_NATIVE: "1",
      NODE_ENV: "production",
    },
    recordVideo: {
      dir: CLIPS_DIR,
      size: { width: 1280, height: 900 },
    },
  });

  const page = await electronApp.firstWindow();
  console.log(`Window title: ${await page.title()}`);

  await page.waitForLoadState("domcontentloaded");
  await sleep(2000);

  // ── Skip onboarding if visible ─────────────────────────
  const skipBtn = page.locator("text=I'll do this later");
  if (
    await skipBtn
      .waitFor({ state: "visible", timeout: 3000 })
      .then(() => true)
      .catch(() => false)
  ) {
    console.log("Onboarding detected — skipping...");
    await skipBtn.click();
    await sleep(2000);
  }

  // ── 1. Empty state ─────────────────────────────────────
  console.log("Capturing: empty state...");
  await page.screenshot({
    path: path.join(CLIPS_DIR, "empty-state.png"),
    type: "png",
  });
  console.log("  -> empty-state.png");

  // ── 2. Chat — type a question (don't send, no API key) ─
  console.log("Capturing: chat with typed question...");

  const textarea = page.locator('textarea[placeholder="Ask anything..."]');
  if (
    await textarea
      .waitFor({ state: "visible", timeout: 5000 })
      .then(() => true)
      .catch(() => false)
  ) {
    await textarea.click();
    await sleep(300);
    await textarea.fill(
      "What were the key decisions made in this meeting?"
    );
    await sleep(500);

    await page.screenshot({
      path: path.join(CLIPS_DIR, "chat-typing.png"),
      type: "png",
    });
    console.log("  -> chat-typing.png");

    // Clear the input for a clean state
    await textarea.fill("");
    await sleep(300);
  } else {
    console.log("  (textarea not visible)");
  }

  // ── 3. Start meeting ───────────────────────────────────
  console.log("Capturing: meeting mode...");

  const recButton = page.locator('[aria-label="Start meeting"]');
  if (
    await recButton
      .waitFor({ state: "visible", timeout: 3000 })
      .then(() => true)
      .catch(() => false)
  ) {
    await recButton.click();
    await sleep(1500);

    // Dismiss the source picker dialog if it appears
    const cancelBtn = page.locator(
      '[aria-labelledby="source-picker-title"] >> text=Cancel'
    );
    const pickerVisible = await cancelBtn
      .waitFor({ state: "visible", timeout: 3000 })
      .then(() => true)
      .catch(() => false);

    if (pickerVisible) {
      console.log("  Source picker appeared — dismissing...");
      await cancelBtn.click();
      await sleep(1000);
    }

    // Meeting should now be active (even without recording source)
    await sleep(2000);

    await page.screenshot({
      path: path.join(CLIPS_DIR, "meeting-active.png"),
      type: "png",
    });
    console.log("  -> meeting-active.png");

    // Wait a bit more for transcript panel
    await sleep(2000);

    await page.screenshot({
      path: path.join(CLIPS_DIR, "meeting-transcript.png"),
      type: "png",
    });
    console.log("  -> meeting-transcript.png");

    // Stop meeting — use force click to bypass any overlay
    const stopButton = page.locator('[aria-label="Stop meeting"]');
    if (await stopButton.isVisible().catch(() => false)) {
      await stopButton.click({ force: true });
      await sleep(1000);
    }
  } else {
    console.log("  (rec button not visible)");
  }

  // ── 4. Settings view ───────────────────────────────────
  console.log("Capturing: settings...");

  const settingsBtn = page.locator('[aria-label="Settings"]');
  if (
    await settingsBtn
      .first()
      .waitFor({ state: "visible", timeout: 3000 })
      .then(() => true)
      .catch(() => false)
  ) {
    await settingsBtn.first().click();
    await sleep(1000);

    await page.screenshot({
      path: path.join(CLIPS_DIR, "settings.png"),
      type: "png",
    });
    console.log("  -> settings.png");

    const backBtn = page.locator('[aria-label="Back to chat"]');
    if (await backBtn.isVisible().catch(() => false)) {
      await backBtn.click();
      await sleep(500);
    }
  } else {
    console.log("  (settings button not visible)");
  }

  // ── 5. Full app screenshot ─────────────────────────────
  console.log("Capturing: final state...");
  await page.screenshot({
    path: path.join(CLIPS_DIR, "full-app.png"),
    type: "png",
  });
  console.log("  -> full-app.png");

  // ── Close and save video ───────────────────────────────
  console.log("Closing app and saving video...");
  await electronApp.close();

  const videoPath = await page.video()?.path();
  if (videoPath) {
    const dest = path.join(CLIPS_DIR, "full-session.webm");
    try {
      renameSync(videoPath, dest);
      console.log(`  -> full-session.webm`);
    } catch {
      console.log(`  Video saved at: ${videoPath}`);
    }
  }

  console.log(`\nAll clips saved to ${CLIPS_DIR}`);
  console.log("Done!");
}

main().catch((err) => {
  console.error("Capture failed:", err);
  process.exit(1);
});
