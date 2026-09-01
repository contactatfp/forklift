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
    let screenshot: Uint8Array | null = null;

    for (const step of steps) {
      if (step.action === "goto") {
        const url = step.path.startsWith("http")
          ? step.path
          : new URL(step.path || "/", input.previewUrl).toString();
        await page.goto(url, { waitUntil: "networkidle", timeout: 45_000 });
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

    if (!screenshot) {
      const png = await page.screenshot({ fullPage: true, type: "png" });
      screenshot = png;
    }

    const sessionId = browser.id;
    await browser.close();
    await client.sessions.releaseAndWait(sessionId);

    let replayUrl: string | null = null;
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
    return { screenshot, replayUrl, consoleErrors: consoleErrors.slice(0, 50), networkErrors: networkErrors.slice(0, 50) };
  } catch (err) {
    try {
      await browser.close();
    } catch {
      /* already closed */
    }
    await client.close();
    throw err;
  }
}
