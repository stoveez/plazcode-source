// Names seen by top-level extension pages and background worker (background.ts, popup.ts, ollama-page.ts).
declare function importScripts(...urls: string[]): void;

declare const PlazCodeIntegrity: {
  check(): Promise<void>;
};
declare const PlazCodeAskSite: {
  SITES: Array<{ hosts: string[]; url: string; name: string }>;
  FALLBACK: { url: string; name: string };
  siteFor(address: string): { url: string; name: string } | null;
  choose(chosen: unknown, last: unknown): { url: string; name: string; why: "chosen" | "current" | "fallback" };
};
declare const PlazCodePrefSync: {
  KEYS: string[];
  PENDING_KEY: string;
  META_KEY: string;
  create(deps: {
    fetch: (url: string, init?: any) => Promise<{ ok: boolean; json(): Promise<any> }>;
    storage: { get(keys: any): Promise<any>; set(items: any): Promise<void>; remove(keys: any): Promise<void> };
    url: string;
    later?: (fn: () => void, ms: number) => unknown;
    cancel?: (id: unknown) => void;
    now?: () => number;
  }): any;
};
declare const PlazCodeVersion: {
  render(element: Element | null, current: string, status: unknown, prefix?: string, extra?: string): void;
  detectBrowser(nav?: any): any;
  browserPage(nav?: any): any;
  outdatedLabel(page?: any): string;
  describe(current: string, status: unknown, now?: number): any;
  display(value: unknown): string;
  [key: string]: any;
};
declare var PlazCodeI18n: PlazCodeI18nApi;
declare var PlazCodeMountEffortPicker: (select: HTMLSelectElement | null) => { refresh(): void; close(focus?: boolean): void } | null;
