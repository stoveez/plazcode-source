// Shared ambient types and browser/extension globals across providers/, core/, and top-level scripts.
interface ChromeEvent<T extends (...args: any[]) => any = (...args: any[]) => void> {
  addListener(callback: T, ...extra: any[]): void;
  removeListener?(callback: T): void;
  hasListener?(callback: T): boolean;
}
interface ChromeStorageChange {
  oldValue?: any;
  newValue?: any;
}
interface ChromeStorageArea {
  get(keys?: string | string[] | Record<string, any> | null): Promise<Record<string, any>>;
  get(keys: string | string[] | Record<string, any> | null, callback: (items: Record<string, any>) => void): Promise<Record<string, any>> | void;
  set(items: Record<string, any>): Promise<void>;
  set(items: Record<string, any>, callback: () => void): Promise<void> | void;
  remove(keys: string | string[]): Promise<void>;
  remove(keys: string | string[], callback: () => void): Promise<void> | void;
  clear?(): Promise<void>;
}
interface ChromeTab {
  id?: number;
  windowId?: number;
  active?: boolean;
  url?: string;
  pendingUrl?: string;
  title?: string;
  status?: string;
  lastAccessed?: number;
  [key: string]: any;
}
interface ChromeWindow {
  id?: number;
  focused?: boolean;
  type?: string;
  state?: string;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  tabs?: ChromeTab[];
  [key: string]: any;
}
interface ChromeMessageSender {
  tab?: ChromeTab;
  frameId?: number;
  documentId?: string;
  id?: string;
  url?: string;
  origin?: string;
  [key: string]: any;
}
interface ChromePort {
  name: string;
  sender?: ChromeMessageSender;
  watch?: number;
  onMessage: ChromeEvent<(message: any, port: ChromePort) => void>;
  onDisconnect: ChromeEvent<(port: ChromePort) => void>;
  postMessage(message: any): void;
  disconnect(): void;
  [key: string]: any;
}
interface ChromeDebuggee {
  tabId?: number;
  extensionId?: string;
  targetId?: string;
}
interface ChromeWebRequestDetails {
  requestId: string;
  url: string;
  method: string;
  frameId: number;
  tabId: number;
  documentId?: string;
  documentUrl?: string;
  initiator?: string;
  originUrl?: string;
  type: string;
  timeStamp: number;
  statusCode?: number;
  [key: string]: any;
}
interface ChromeApi {
  runtime: {
    id: string;
    lastError?: { message?: string };
    getURL(path: string): string;
    getManifest(): { version: string; name?: string; [key: string]: any };
    getPlatformInfo(callback?: (info: { os: string; arch?: string; nacl_arch?: string }) => void): Promise<{ os: string; arch?: string; nacl_arch?: string }>;
    sendMessage(message: any): Promise<any>;
    sendMessage(message: any, callback: (response: any) => void): any;
    sendMessage(message: any, options: Record<string, any>, callback?: (response: any) => void): any;
    sendMessage(extensionId: string, message: any, options?: Record<string, any>, callback?: (response: any) => void): any;
    connect(connectInfo?: { name?: string }): ChromePort;
    reload(): void;
    onMessage: ChromeEvent<(message: any, sender: ChromeMessageSender, sendResponse: (response?: any) => void) => boolean | void | Promise<any>>;
    onConnect: ChromeEvent<(port: ChromePort) => void>;
    onInstalled: ChromeEvent<(details: { reason: string; previousVersion?: string }) => void>;
    onStartup: ChromeEvent<() => void>;
    [key: string]: any;
  };
  storage: {
    local: ChromeStorageArea;
    session: ChromeStorageArea;
    sync?: ChromeStorageArea;
    onChanged: ChromeEvent<(changes: Record<string, ChromeStorageChange>, areaName: string) => void>;
  };
  tabs: {
    query(queryInfo: Record<string, any>): Promise<ChromeTab[]>;
    query(queryInfo: Record<string, any>, callback: (tabs: ChromeTab[]) => void): void;
    get(tabId: number): Promise<ChromeTab>;
    get(tabId: number, callback: (tab: ChromeTab) => void): void;
    create(createProperties: Record<string, any>): Promise<ChromeTab>;
    create(createProperties: Record<string, any>, callback: (tab: ChromeTab) => void): void;
    update(tabId: number, updateProperties: Record<string, any>): Promise<ChromeTab>;
    update(tabId: number, updateProperties: Record<string, any>, callback: (tab?: ChromeTab) => void): void;
    update(updateProperties: Record<string, any>): Promise<ChromeTab>;
    sendMessage(tabId: number, message: any): Promise<any>;
    sendMessage(tabId: number, message: any, callback: (response: any) => void): any;
    sendMessage(tabId: number, message: any, options: Record<string, any>): Promise<any>;
    sendMessage(tabId: number, message: any, options: Record<string, any>, callback: (response: any) => void): any;
    captureVisibleTab(windowId?: number, options?: Record<string, any>): Promise<string>;
    captureVisibleTab(windowId: number, options: Record<string, any>, callback: (dataUrl: string) => void): void;
    captureTab?(tabId?: number, options?: Record<string, any>): Promise<string>;
    onActivated: ChromeEvent<(activeInfo: { tabId: number; windowId: number }) => void>;
    onUpdated: ChromeEvent<(tabId: number, changeInfo: { status?: string; url?: string; title?: string; [key: string]: any }, tab: ChromeTab) => void>;
    onRemoved: ChromeEvent<(tabId: number, removeInfo: { windowId: number; isWindowClosing: boolean }) => void>;
    [key: string]: any;
  };
  windows: {
    get(windowId: number, queryOptions?: Record<string, any>): Promise<ChromeWindow>;
    get(windowId: number, queryOptions: Record<string, any>, callback: (win: ChromeWindow) => void): void;
    getCurrent(queryOptions?: Record<string, any>): Promise<ChromeWindow>;
    getCurrent(queryOptions: Record<string, any>, callback: (win: ChromeWindow) => void): void;
    getLastFocused(queryOptions?: Record<string, any>): Promise<ChromeWindow>;
    getLastFocused(queryOptions: Record<string, any>, callback: (win: ChromeWindow) => void): void;
    getAll(queryOptions?: Record<string, any>): Promise<ChromeWindow[]>;
    getAll(queryOptions: Record<string, any>, callback: (wins: ChromeWindow[]) => void): void;
    create(createData?: Record<string, any>): Promise<ChromeWindow>;
    create(createData: Record<string, any>, callback: (win?: ChromeWindow) => void): void;
    update(windowId: number, updateInfo: Record<string, any>): Promise<ChromeWindow>;
    update(windowId: number, updateInfo: Record<string, any>, callback: (win: ChromeWindow) => void): void;
    remove(windowId: number): Promise<void>;
    remove(windowId: number, callback: () => void): void;
    onRemoved: ChromeEvent<(windowId: number) => void>;
    [key: string]: any;
  };
  scripting: {
    executeScript(injection: Record<string, any>): Promise<Array<{ result?: any; frameId?: number; documentId?: string }>>;
    [key: string]: any;
  };
  sidePanel: {
    open(options: { tabId?: number; windowId?: number }): Promise<void>;
    setOptions(options: { tabId?: number; path?: string; enabled?: boolean }): Promise<void>;
    [key: string]: any;
  };
  debugger: {
    attach(target: ChromeDebuggee, requiredVersion: string): Promise<void>;
    detach(target: ChromeDebuggee): Promise<void>;
    sendCommand(target: ChromeDebuggee, method: string, commandParams?: Record<string, any>): Promise<any>;
    onEvent: ChromeEvent<(source: ChromeDebuggee, method: string, params?: any) => void>;
    onDetach: ChromeEvent<(source: ChromeDebuggee, reason: string) => void>;
    [key: string]: any;
  };
  webRequest: {
    onBeforeRequest: ChromeEvent<(details: ChromeWebRequestDetails) => void>;
    onCompleted: ChromeEvent<(details: ChromeWebRequestDetails) => void>;
    onErrorOccurred: ChromeEvent<(details: ChromeWebRequestDetails) => void>;
    [key: string]: any;
  };
  commands: {
    onCommand: ChromeEvent<(command: string, tab?: ChromeTab) => void>;
    [key: string]: any;
  };
  permissions: {
    contains(permissions: { origins?: string[]; permissions?: string[] }): Promise<boolean>;
    [key: string]: any;
  };
  [key: string]: any;
}
declare const chrome: ChromeApi;
declare var browser: ChromeApi | undefined;

interface PlazCodeLanguage {
  code: string;
  name: string;
  nativeName: string;
  dir: "ltr" | "rtl";
}
interface PlazCodeI18nApi {
  languages: readonly PlazCodeLanguage[];
  normalize(code: string): string;
  t(source: string, values?: Record<string, unknown>): string;
  setLanguage(value: string): void;
  getLanguage(): string;
  mountStatic(root?: ParentNode | null): void;
  mountPicker(host: Element | null, options?: { value?: string; onChange?: (value: string) => void | Promise<void>; [key: string]: any }): { host: Element; refresh(next: string): void; readonly value: string; destroy(): void } | null;
  onChange(fn: (value: string) => void): () => void;
  [key: string]: any;
}
interface PlazCodeTextApi {
  readonly required: boolean;
  ready(): Promise<boolean>;
  t(key: string): string;
  f(key: string, values: unknown[]): string;
  title(): string;
  loaded(): boolean;
  error(): string;
  [key: string]: any;
}
interface PlazCodeTabKeepAwakeState {
  enabled: boolean;
  running: boolean;
  active: boolean;
}
interface PlazCodeTabKeepAwakeController {
  setEnabled(next: boolean): boolean;
  setActive(next: boolean): boolean;
  update(patch: { enabled?: boolean; active?: boolean }): boolean;
  isEnabled(): boolean;
  isRunning(): boolean;
  isActive(): boolean;
  state(): PlazCodeTabKeepAwakeState;
  destroy(): void;
}
interface PlazCodeTabKeepAwakeApi extends PlazCodeTabKeepAwakeController {
  EVENT_NAME: string;
  DATASET_KEY: string;
  create(options?: { doc?: Document | null; enabled?: boolean; active?: boolean }): PlazCodeTabKeepAwakeController;
}
interface PlazCodeDomCacheStats {
  epoch: number;
  size: number;
  hits: number;
  misses: number;
  invalidations: number;
  reasons: Record<string, number>;
}
interface PlazCodeDomCacheInstance {
  STRUCTURAL_TTL_MS: number;
  BUSY_TTL_MS: number;
  epoch(): number;
  cached<T>(key: string, compute: () => T, opts?: { kind?: "structural" | "busy"; ttlMs?: number; checkConnected?: boolean }): T;
  invalidate(reason?: "mutation" | "url" | "disconnected" | "ttl" | "action" | "manual"): number;
  observe(target?: Node | null): boolean;
  wrapProvider<T extends Record<string, any>>(provider: T): T;
  stats(): PlazCodeDomCacheStats;
  resetStats(): void;
  destroy(): void;
}
interface PlazCodeDomCacheApi {
  STRUCTURAL_TTL_MS: number;
  BUSY_TTL_MS: number;
  STRUCTURAL_METHODS: string[];
  BUSY_METHODS: string[];
  create(options?: {
    doc?: Document | null;
    win?: Window | null;
    root?: Node | null;
    now?: () => number;
    getUrl?: () => string;
    structuralTtlMs?: number;
    busyTtlMs?: number;
    ignoreRecords?: (records: MutationRecord[]) => boolean;
    MutationObserverCtor?: typeof MutationObserver;
  }): PlazCodeDomCacheInstance;
}
interface PlazCodeMediaApi {
  mime(file: File): string;
  fileFrom(data: ImagePayload, index?: number): File;
  encode(file: File): Promise<{ mimeType: string; data: string; name: string }>;
  pixels(file: File, allowVideo?: boolean, progress?: (message: string) => void, quality?: unknown): Promise<any>;
  prepare(files: File[] | FileList, options?: Record<string, any>): Promise<{ files: ImagePayload[]; notice?: string; [key: string]: any }>;
  validate(payloads: unknown): void;
  MAX_BYTES: number;
  MAX_FILES: number;
  [key: string]: any;
}

interface Window {
  chrome: ChromeApi;
  __rsLimitOutgoing?: (text: string) => string;
  __rsChatgptCm?: boolean;
  __rsCraxNet?: boolean;
  __rsQwenNet?: boolean;
  __plazcodeBlockbench?: { version: string; run(cmd: string, args?: Record<string, unknown>): any; ops: Array<{ name: string; change: boolean }> };
  __plazcodeControl?: any;
  __plazcodeDebugCapture?: any;
  __plazcodeInputIsolation?: any;
  __plazcodeTabKeepAwakeMain?: boolean;
  __plazcodeDomCacheStats?: () => PlazCodeDomCacheStats;
  __vaultImport?: any;
  __ollamaHistory?: () => any[];
  __ollamaModel?: () => string | null;
  __ollamaBusy?: () => boolean;
  __rsPermMode?: () => string;
  __rsSafety?: () => any;
  __rsAlwaysChanged?: any;
  __rsFullAccess?: () => boolean;
  __rsDiag?: any;
  __rsTheme?: () => string;
  __rsEngine?: () => string;
  __rsUndo?: any;
  __rsMode?: any;
  __rsWorkMode?: () => string;
  __rsShowApproach?: () => boolean;
  __rsPlanMode?: () => boolean;
  __rsAutoDebug?: () => boolean;
  __rsMultiAgent?: () => boolean;
  __rsPlaytest?: () => boolean;
  __rsUiCheck?: () => boolean;
  __rsExtraThinking?: () => boolean;
  __rsForge?: () => boolean;
  __rsThinkingLevel?: () => string;
  __rsBlender?: () => boolean;
  webkitAudioContext?: typeof AudioContext;
  Quill?: any;
  navigation?: any;
  PlazCodeI18n?: PlazCodeI18nApi;
  PlazCodeLocaleData?: Record<string, Record<string, string>>;
  PlazCodeText?: PlazCodeTextApi;
  PlazCodeVaultApi?: any;
  PlazCodeReliability?: any;
}

interface HTMLSelectElement {
  _ultraPicker?: { refresh(): void; close(focus?: boolean): void } | null;
}

interface Permissions {
  query(permissionDesc: PermissionDescriptor | { name: string }): Promise<PermissionStatus>;
}

declare const module: { exports: unknown } | undefined;
declare const PlazCodePlazLibData: unknown;
declare var __plazcodeControl: any;
