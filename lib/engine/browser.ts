import { browserClient } from "@/lib/solari/clients";
import type { DemoStep } from "@/lib/types";
import { log } from "@/lib/log";

export type BrowserPass = {
  screenshot: Uint8Array | null;
  replayUrl: string | null;
  consoleErrors: string[];
  networkErrors: string[];
};

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
        const url = step.path.startsWith("http")
          ? step.path
          : new URL(step.path || "/", input.previewUrl).toString();
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

    if (!screenshot && pageOpened) {
      const png = await page.screenshot({ fullPage: true, type: "png" });
      screenshot = png;
    }

    // browser.close() already releaseAndWait — a second DELETE 404s and can wipe the shot
    const sessionId = browser.id;
    await browser.close();

    for (let i = 0; i < 12; i++) {
      try {
        const replay = await client.sessions.getReplayUrl(sessionId);
        replayUrl = replay.url;
        break;
      } catch (err) {
        log("replay.poll", { i, err: String(err) });
        await sleep(1500);
      }
    }

    await client.close();
    return {
      screenshot,
      replayUrl,
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
        consoleErrors: consoleErrors.slice(0, 50),
        networkErrors: networkErrors.slice(0, 50),
      };
    }
    throw err;
  }
}
