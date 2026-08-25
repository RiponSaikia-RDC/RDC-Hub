// html-to-text ships no TypeScript types (and no @types/html-to-text
// package exists) — this covers just the bit of its API this project
// actually calls (see server/src/lib/gmail.ts). Loose on purpose: `options`
// mirrors the (large, deeply nested) real shape closely enough for our use
// without transcribing the whole thing.
declare module "html-to-text" {
  export interface HtmlToTextOptions {
    wordwrap?: number | false;
    selectors?: Array<{
      selector: string;
      format?: string;
      options?: Record<string, unknown>;
    }>;
    [key: string]: unknown;
  }

  export function convert(html: string, options?: HtmlToTextOptions): string;
}
