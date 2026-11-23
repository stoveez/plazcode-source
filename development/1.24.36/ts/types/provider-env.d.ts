// Names only providers/ files see: core/parser.js defines RSParse on the page before the site file.
declare const RSParse: any;
// core/stall-guard.js loads before every provider file.
declare const PlazCodeStallGuard: { frozenGap?: (lastBeatAt: number, now: number, opts?: { threshold?: number; normal?: number; cap?: number }) => number; [key: string]: any } | undefined;
// core/media.js loads before providers/ when running inside the extension; unit tests may load a provider standalone.
declare const PlazCodeMedia: PlazCodeMediaApi | undefined;
// PlazCode's settings and helpers (core/config.js) on the page.
declare const RS: any;
