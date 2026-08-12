import { isHostOrSubdomainOf } from '../utils/domain'
import { log } from '../utils/logger'

export interface ScraperHandler {
  name: string
  domains: string[] // Domains this handler applies to
  execute: () => Promise<void>
}

class Registry {
  private handlers: ScraperHandler[] = []

  register(handler: ScraperHandler) {
    this.handlers.push(handler)
    log.info(`Registered scraper handler: ${handler.name}`)
  }

  async runMatchingHandlers(currentUrl: string) {
    let hostname: string
    try {
      hostname = new URL(currentUrl).hostname
    } catch {
      // An unparseable URL matches nothing rather than throwing out of the
      // content script's entry point.
      return
    }

    for (const handler of this.handlers) {
      // Not a substring test: handlers run inside a content script injected
      // into every http/https page and then read identities out of
      // page-controlled DOM, so this is a trust boundary.
      if (!handler.domains.some((d) => isHostOrSubdomainOf(hostname, d))) {
        continue
      }
      log.info(`Executing handler: ${handler.name} for domain ${hostname}`)
      try {
        await handler.execute()
      } catch (e) {
        log.error(`Error in handler ${handler.name}`, e)
      }
    }
  }
}

export const HandlerRegistry = new Registry()
