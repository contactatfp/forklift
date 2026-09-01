import { EventEmitter } from "node:events";
import type { EngineEvent } from "@/lib/types";

class Hub extends EventEmitter {
  publish(jobId: string, event: EngineEvent) {
    this.emit(`job:${jobId}`, event);
  }

  subscribe(jobId: string, fn: (event: EngineEvent) => void): () => void {
    const key = `job:${jobId}`;
    this.on(key, fn);
    return () => {
      this.off(key, fn);
    };
  }
}

const globalForHub = globalThis as unknown as { forkliftHub?: Hub };

export function getHub(): Hub {
  if (!globalForHub.forkliftHub) {
    const hub = new Hub();
    hub.setMaxListeners(200);
    globalForHub.forkliftHub = hub;
  }
  return globalForHub.forkliftHub;
}
