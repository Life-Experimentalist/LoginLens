export abstract class BaseAIHandler {
  protected apiKey: string;
  
  constructor(apiKey: string) { 
    this.apiKey = apiKey; 
  }

  // Takes a sanitized DOM string (no PII, no passwords)
  abstract generateSelector(sanitizedHtml: string): Promise<{
    loginButtonSelector: string;
    oauthButtonSelectors: Record<string, string>; 
  }>;
}
