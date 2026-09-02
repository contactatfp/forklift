import { browserClient } from "@/lib/solari/clients";
import { previewPath } from "@/lib/engine/preview";
import type { DemoStep } from "@/lib/types";
import { log } from "@/lib/log";

export type BrowserPass = {
  screenshot: Uint8Array | null;
  replayUrl: string | null;
  /** Solari browser session id; lets the card mint a fresh replay URL after the presigned one expires. */
  sessionId: string | null;
  consoleErrors: string[];
  networkErrors: string[];
};

/** Replay is documented as ~1–3s after release; in production the 404 lasted the whole 18s we gave it. */
const REPLAY_WAIT_MS = 45_000;

export async function fetchReplayUrl(sessionId: string, waitMs = 0): Promise<string | null> {
  const client = browserClient();
  const started = Date.now();
  try {
    for (;;) {
      try {
        const replay = await client.sessions.getReplayUrl(sessionId);
        return replay.url;
      } catch (err) {
        if (Date.now() - started >= waitMs) {
          log("replay.unavailable", { sessionId, err: String(err) });
          return null;
        }
        await sleep(2_000);
      }
    }
  } finally {
    await client.close().catch(() => undefined);
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function recordPreview(input: {
  previewUrl: string;
  health: string;
  demo: DemoStep[];
}): Promise<BrowserPass> {
  const client = browserClient();
  const consoleErrors: string[] = [];
  const networkErrors: string[] = [];
  let screenshot: Uint8Array | null = null;
  let replayUrl: string | null = null;
  let pageOpened = false;

  const browser = await client.launch({ recording: true });
  try {
    const page = await browser.newPage();
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => {
      consoleErrors.push(String(err));
    });
    page.on("requestfailed", (req) => {
      networkErrors.push(`${req.failure()?.errorText ?? "failed"} ${req.url()}`);
    });

    const steps = input.demo.length > 0 ? input.demo : [{ action: "goto" as const, path: input.health || "/" }];

    for (const step of steps) {
      if (step.action === "goto") {
        const url = previewPath(input.previewUrl, step.path || "/");
        // networkidle never settles on HMR/websocket apps — capture after DOM ready
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
        pageOpened = true;
        await sleep(800);
      } else if (step.action === "click") {
        if (step.selector) await page.locator(step.selector).click({ timeout: 10_000 });
        else if (step.text) await page.getByText(step.text).first().click({ timeout: 10_000 });
      } else if (step.action === "wait") {
        if (step.ms) await page.waitForTimeout(step.ms);
        if (step.selector) await page.locator(step.selector).waitFor({ timeout: step.timeoutMs ?? 15_000 });
        if (step.text) await page.getByText(step.text).first().waitFor({ timeout: step.timeoutMs ?? 15_000 });
      } else if (step.action === "screenshot") {
        const png = await page.screenshot({ fullPage: true, type: "png" });
        screenshot = png;
      }
    }

    // The recorder flushes in intervals; a goto-shot-close session ended before the
    // first flush and Solari never published a replay (the same key got one from a
    // 4s example.com session). Dwell, scroll the page once so the tape has motion.
    if (pageOpened) {
      try {
        await page.mouse.move(200, 200);
        for (let i = 1; i <= 3; i++) {
          await page.mouse.wheel(0, 400);
          await sleep(700);
        }
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: "auto" }));
        await sleep(1500);
      } catch {
        /* pages without a scrollable body still record fine */
      }
    }

    if (!screenshot && pageOpened) {
      const png = await page.screenshot({ fullPage: true, type: "png" });
      screenshot = png;
    }

    // browser.close() already releaseAndWait — a second DELETE 404s and can wipe the shot
    const sessionId = browser.id;
    await browser.close();
    await client.close();

    replayUrl = await fetchReplayUrl(sessionId, REPLAY_WAIT_MS);
    return {
      screenshot,
      replayUrl,
      sessionId,
      consoleErrors: consoleErrors.slice(0, 50),
      networkErrors: networkErrors.slice(0, 50),
    };
  } catch (err) {
    // last-ditch shot if the page opened before the throw
    if (!screenshot && pageOpened) {
      try {
        const ctx = browser.contexts()[0];
        const page = ctx?.pages()[0];
        if (page) screenshot = await page.screenshot({ fullPage: true, type: "png" });
      } catch {
        /* page already gone */
      }
    }
    try {
      await browser.close();
    } catch {
      /* already closed */
    }
    try {
      await client.close();
    } catch {
      /* ignore */
    }
    // keep a partial pass so the pipeline can still stamp the PNG
    if (screenshot) {
      log("browser.partial", { err: String(err) });
      return {
        screenshot,
        replayUrl: null,
        sessionId: browser.id,
        consoleErrors: consoleErrors.slice(0, 50),
        networkErrors: networkErrors.slice(0, 50),
      };
    }
    throw err;
  }
}
