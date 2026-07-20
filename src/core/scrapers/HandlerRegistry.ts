import { log } from "../utils/logger";

export interface ScraperHandler {
  name: string;
  domains: string[]; // Domains this handler applies to
  execute: () => Promise<void>;
}

class Registry {
  private handlers: ScraperHandler[] = [];

  register(handler: ScraperHandler) {
    this.handlers.push(handler);
    log.info(`Registered scraper handler: ${handler.name}`);
  }

  async runMatchingHandlers(currentUrl: string) {
    const url = new URL(currentUrl);
    for (const handler of this.handlers) {
      if (handler.domains.some(domain => url.hostname.includes(domain))) {
        log.info(`Executing handler: ${handler.name} for domain ${url.hostname}`);
        try {
          await handler.execute();
        } catch (e) {
          log.error(`Error in handler ${handler.name}`, e);
        }
      }
    }
  }
}

export const HandlerRegistry = new Registry();
