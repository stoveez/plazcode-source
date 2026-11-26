// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Built from development/1.25.0/ts/core/workshop-ui.ts (TypeScript): edit that file, then run node development/1.25.0/ts/build.cjs.
const PlazCodeWorkshopUI = (() => {
  'use strict';
  type ApiFn = (path: string, options?: RequestInit) => Promise<any>;
  type PrefsFn = () => Record<string, any>;
  type SetPrefsFn = (patch: Record<string, unknown>) => Promise<any>;
  type GoFn = (page: string, cat?: string) => void;

  interface WorkshopItem {
    id: string;
    slug: string;
    kind: 'skill' | 'specialist' | string;
    title: string;
    summary: string;
    author: string;
    version: string;
    category: string;
    engine: string;
    tags: string[];
    badge: string;
    review_status: string;
    body_bytes: number;
    file_count: number;
    rating_avg: number;
    rating_count: number;
    install_count: number;
  }

  interface OwnerUser {
    id: string;
    username: string;
    user_id?: string;
    linked_profile_count?: number;
    linked_usernames?: string[];
    created_at: number;
    last_seen_at?: number | null;
    online: boolean;
    app_version?: string;
    banned: boolean;
    banned_at?: number | null;
    terminated?: boolean;
    terminated_at?: number | null;
    ban_reason?: string;
    primary_owner?: boolean;
    is_owner?: boolean;
    profile_picture?: string | null;
  }

  interface OwnerGrant {
    target_key: string;
    target_type: 'user_id' | 'username' | string;
    user_id?: string;
    username?: string;
    linked_usernames?: string[];
    granted_by?: string;
    granted_at: number;
  }

  interface OwnerSkill extends WorkshopItem {
    status: string;
    featured?: boolean;
    author_key?: string;
    reviewed_by?: string;
    reject_reason?: string;
    report_count?: number;
    created_at?: number;
    updated_at?: number;
  }

  interface BannedAuthor {
    author_key: string;
    reason?: string;
    banned_at?: number;
  }

  interface OwnerStatus {
    is_owner?: boolean;
    account_owner?: boolean;
    workshop_owner?: boolean;
    unlocked?: boolean;
    has_account_token?: boolean;
    has_workshop_token?: boolean;
    registry_configured?: boolean;
  }

  const CATEGORIES = ['All categories', '3D Assets', 'Animation', 'Interface', 'Tools', 'Worldbuilding', 'Scripting'];

  function formatDateTime(ms?: number | null): string {
    if (!ms || typeof ms !== 'number' || ms <= 0) return 'Unknown';
    try { return new Date(ms).toLocaleString(); } catch { return 'Unknown'; }
  }

  function validAvatarDataUrl(v?: string | null): string | null {
    if (typeof v !== 'string') return null;
    return /^data:image\/(png|jpeg|gif);base64,[A-Za-z0-9+/=]+$/.test(v) ? v : null;
  }

  function formatBytes(bytes: number): string {
    if (!bytes || bytes < 1024) return Math.max(1, bytes || 0) + ' B';
    return Math.max(1, Math.round(bytes / 1024)) + ' KB';
  }

  function cardGlyph(category: string, kind: string): string {
    if (kind === 'specialist') {
      return '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 3l3 5.5L21 9.5l-4.5 4 1 6-5.5-3-5.5 3 1-6L3 9.5l6-1z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    }
    if (category === 'Interface') {
      return '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 9h18M9 9v11" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
    }
    if (category === 'Animation') {
      return '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 8.5l6 3.5-6 3.5z" fill="currentColor"/></svg>';
    }
    if (category === '3D Assets') {
      return '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    }
    return '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 3l9 9-9 9-9-9z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/></svg>';
  }

  function starSvg(size = 14): string {
    return `<svg class="ws-star-svg" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path d="M12 2.4l2.9 5.9 6.5.95-4.7 4.58 1.1 6.47L12 17.25 6.2 20.3l1.1-6.47-4.7-4.58 6.5-.95z"/></svg>`;
  }

  function formatOutOfFive(val: number): string {
    if (!val || !Number.isFinite(val) || val <= 0) return '0 / 5';
    const rounded = Math.round(val * 10) / 10;
    return (Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)) + ' / 5';
  }

  const wsStyle = `<style>
.ws-shell{display:grid;gap:16px}
.ws-head{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:12px}
.ws-head h2{margin:0;font-size:28px;font-weight:700;letter-spacing:-.02em}
.ws-head p{margin:4px 0 0;font-size:13px;color:var(--ink-soft,#9aa8be)}
.ws-banner{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-radius:14px;border:1px solid var(--pz-line,var(--stroke,#253650));background:var(--pz-card,var(--surface,#0a1423))}
.ws-banner-info{display:flex;flex-wrap:wrap;align-items:center;gap:10px;font-size:12.5px}
.ws-dot{width:8px;height:8px;border-radius:50%;background:var(--amber,#ffb33f)}
.ws-dot.on{background:var(--green,#31e0a4);box-shadow:0 0 10px rgb(49 224 164/.6)}
.ws-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:10px}
.ws-pills{display:inline-flex;gap:4px;padding:4px;border-radius:11px;border:1px solid var(--pz-line,var(--stroke,#253650));background:rgb(0 0 0/.2)}
.ws-pills button{padding:7px 14px;border-radius:8px;border:1px solid transparent;background:none;color:var(--ink-soft,#9aa8be);font-size:12.5px;font-weight:600;cursor:pointer}
.ws-pills button[aria-pressed=true]{background:var(--text,#f5f8ff);color:var(--on-text,#09111d)}
.ws-search{flex:1 1 240px;min-width:180px;padding:9px 13px;border-radius:11px;border:1px solid var(--pz-line,var(--stroke,#253650));background:rgb(0 0 0/.24);color:var(--text,#f5f8ff);font-size:13px}
.ws-select{padding:8px 11px;border-radius:10px;border:1px solid var(--pz-line,var(--stroke,#253650));background:var(--pz-card,var(--surface,#0a1423));color:var(--text,#f5f8ff);font-size:12.5px}
.ws-cats{display:flex;flex-wrap:wrap;gap:8px}
.ws-chip{padding:6px 13px;border-radius:999px;border:1px solid var(--pz-line,var(--stroke,#253650));background:rgb(255 255 255/.03);color:var(--ink-soft,#9aa8be);font-size:12px;font-weight:600;cursor:pointer}
.ws-chip[aria-pressed=true]{background:var(--text,#f5f8ff);border-color:var(--text,#f5f8ff);color:var(--on-text,#09111d)}
.ws-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:16px}
.ws-card{display:flex;flex-direction:column;border-radius:16px;border:1px solid var(--pz-line,var(--stroke,#253650));background:var(--pz-card,var(--surface,#0a1423));overflow:hidden;transition:border-color .18s ease,transform .18s ease}
.ws-card:hover{border-color:rgb(var(--pz-rgb,255 146 38)/.55);transform:translateY(-2px)}
.ws-card-banner{position:relative;height:78px;display:grid;place-items:center;background:radial-gradient(circle at 50% 0%,rgb(var(--pz-rgb,255 146 38)/.16),transparent 70%),linear-gradient(180deg,rgb(255 255 255/.04),transparent);border-bottom:1px solid var(--pz-line,var(--stroke,#1e2e46));color:var(--text,#f5f8ff)}
.ws-card-icon{width:40px;height:40px;border-radius:11px;border:1px solid var(--pz-line,var(--stroke,#2b3952));background:var(--canvas,#0a111d);display:grid;place-items:center}
.ws-badge{position:absolute;top:10px;right:10px;padding:3px 8px;border-radius:7px;font:700 10px/1.2 var(--pz-mono,monospace);letter-spacing:.08em;text-transform:uppercase;border:1px solid var(--pz-line,#324766);background:var(--canvas,#0a111d);color:var(--text,#f5f8ff)}
.ws-badge.featured{background:linear-gradient(135deg,var(--orange2,#ffc052),var(--orange,#ff9226));border-color:transparent;color:var(--on-accent,#0b0d12)}
.ws-card-body{flex:1 1 auto;padding:14px 16px;display:grid;gap:8px;align-content:start}
.ws-card-top{display:flex;align-items:center;justify-content:space-between;gap:8px}
.ws-card-top-left{display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
.ws-kind-pill{padding:3px 8px;border-radius:6px;border:1px solid var(--pz-line,#2b3952);font:700 10px/1.1 var(--pz-mono,monospace);text-transform:uppercase;color:var(--ink-soft,#9aa8be)}
.ws-rating-badge{display:inline-flex;align-items:center;gap:4px;font-size:11.5px;font-weight:700;color:var(--text,#f5f8ff);white-space:nowrap}
.ws-card-title{margin:0;font-size:15.5px;font-weight:700;color:var(--text,#f5f8ff)}
.ws-card-author{font-size:11.5px;color:var(--ink-soft,#9aa8be)}
.ws-card-review{font-size:11px;color:var(--green,#31e0a4)}
.ws-card-review.unreviewed{color:var(--amber,#ffb33f)}
html[data-theme-tone=light] .ws-card-review{color:#0d7a52}
html[data-theme-tone=light] .ws-card-review.unreviewed{color:#9a5d00}
.ws-card-summary{margin:0;font-size:12.5px;line-height:1.45;color:var(--ink-soft,#aebbd0);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.ws-tags{display:flex;flex-wrap:wrap;gap:5px}
.ws-tag{padding:2px 8px;border-radius:6px;border:1px solid var(--pz-line,#22324a);background:rgb(255 255 255/.03);font:500 10.5px/1.3 var(--pz-mono,monospace);color:var(--ink-soft,#94a3b8)}
.ws-card-foot{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 10px;padding:11px 16px;border-top:1px solid var(--pz-line,var(--stroke,#1e2e46));background:rgb(0 0 0/.14)}
.ws-foot-meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;font-size:11.5px;color:var(--ink-soft,#94a3b8);min-width:0}
.ws-foot-size{white-space:nowrap}
.ws-rate-group{display:inline-flex;align-items:center;gap:2px}
.ws-star-btn{display:inline-flex;align-items:center;justify-content:center;border:0;background:none;cursor:pointer;padding:1px;line-height:1;transition:transform .12s ease}
.ws-star-btn:hover{transform:scale(1.15)}
.ws-star-svg{display:block;fill:transparent;stroke:var(--ink-soft,#7c8ca6);stroke-width:1.9;stroke-linejoin:round}
.ws-star-btn.on .ws-star-svg,.ws-rating-badge .ws-star-svg{fill:#f5b82e;stroke:#7a4e00;stroke-width:1.9}
html[data-theme-tone=light] .ws-star-svg{stroke:#6c727f}
html[data-theme-tone=light] .ws-star-btn.on .ws-star-svg,html[data-theme-tone=light] .ws-rating-badge .ws-star-svg{fill:#f6be2c;stroke:#6b4200;stroke-width:2.1}
.ws-foot-actions{display:flex;align-items:center;gap:6px}
.ws-installed-pill{display:inline-flex;align-items:center;gap:4px;padding:5px 10px;border-radius:8px;border:1px solid var(--pz-line,var(--stroke,#2b3952));background:var(--canvas,#0a111d);color:var(--ink-soft,#9aa8be);font-size:11.5px;font-weight:600;white-space:nowrap}
.ws-report-btn{padding:6px 8px;border-radius:8px;border:1px solid var(--pz-line,#2b3952);background:transparent;color:var(--ink-soft,#94a3b8);font-size:11.5px;cursor:pointer}
.ws-report-btn:hover{color:var(--red,#ff696c);border-color:var(--red,#ff696c)}
.ws-modal{position:fixed;inset:0;z-index:130;display:grid;place-items:center;background:rgb(4 8 15/.76);backdrop-filter:blur(8px);padding:20px}
.ws-modal[hidden]{display:none}
.ws-modal-card{width:min(620px,95vw);max-height:88vh;overflow-y:auto;display:grid;gap:12px;padding:22px;border-radius:18px;border:1px solid var(--pz-line,var(--stroke,#2b3952));background:var(--canvas,#0d1522);box-shadow:0 32px 90px rgb(0 0 0/.65)}
.ws-modal-card label{display:grid;gap:5px;font-size:12.5px}
.ws-modal-card input,.ws-modal-card textarea,.ws-modal-card select{width:100%;padding:8px 10px;border-radius:9px;border:1px solid var(--pz-line,#2b3952);background:rgb(0 0 0/.24);color:var(--text,#f5f8ff);box-sizing:border-box}
.ws-form-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media(max-width:600px){.ws-form-row{grid-template-columns:1fr}}
.ws-scan-box{padding:10px 12px;border-radius:10px;border:1px solid var(--pz-line,#2b3952);font-size:12px}
.ws-scan-box.ok{border-color:#31e0a466;color:#31e0a4}
.ws-scan-box.bad{border-color:#ff696c66;color:#ff696c}
.ws-owner-card{width:min(940px,96vw);max-height:90vh;overflow-y:auto;display:grid;gap:14px;padding:22px;border-radius:18px;border:1px solid var(--pz-line,var(--stroke,#2b3952));background:var(--canvas,#0d1522);box-shadow:0 32px 90px rgb(0 0 0/.72)}
.ws-owner-list{display:grid;gap:10px}
.ws-owner-row{display:grid;gap:10px;padding:12px 14px;border-radius:13px;border:1px solid var(--pz-line,var(--stroke,#253650));background:var(--pz-card,var(--surface,#0a1423))}
.ws-owner-row-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px}
.ws-owner-user{display:flex;align-items:center;gap:12px;min-width:0}
.ws-avatar-img{width:38px;height:38px;border-radius:999px;object-fit:cover;border:1px solid var(--pz-line,#2b3952);flex:0 0 auto}
.ws-avatar-fallback{width:38px;height:38px;border-radius:999px;border:1px solid var(--pz-line,#2b3952);background:rgb(var(--pz-rgb,255 146 38)/.16);color:var(--text,#f5f8ff);display:grid;place-items:center;font:700 14px/1 var(--pz-mono,monospace);flex:0 0 auto}
.ws-presence{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--ink-soft,#9aa8be)}
.ws-pill-tag{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;font:700 10.5px/1.3 var(--pz-mono,monospace);text-transform:uppercase;border:1px solid var(--pz-line,#2b3952);color:var(--ink-soft,#9aa8be)}
.ws-pill-tag.warn{border-color:rgb(255 179 63/.55);color:var(--amber,#ffb33f)}
.ws-pill-tag.bad{border-color:rgb(255 105 108/.55);color:var(--red,#ff696c)}
.ws-pill-tag.ok{border-color:rgb(49 224 164/.55);color:var(--green,#31e0a4)}
.ws-owner-confirm{display:grid;gap:8px;padding:10px 12px;border-radius:10px;border:1px solid var(--pz-line,#2b3952);background:rgb(0 0 0/.28)}
.ws-count-pill{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:var(--red,#ff696c);color:#09111d;font:700 10.5px/1 var(--pz-mono,monospace)}
.ws-note-bar{padding:9px 12px;border-radius:10px;border:1px solid var(--pz-line,#253650);background:rgb(255 255 255/.03);font-size:12px;color:var(--ink-soft,#9aa8be)}
.ws-uid-chip{appearance:none;display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;border:1px solid rgb(var(--pz-rgb,255 146 38)/.42);background:rgb(var(--pz-rgb,255 146 38)/.1);color:var(--orange2,#ffd08a);font:700 11px/1.3 var(--pz-mono,ui-monospace,Consolas,monospace);cursor:pointer}
.ws-uid-chip:hover{background:rgb(var(--pz-rgb,255 146 38)/.22);border-color:var(--orange2,#ffd08a)}
.ws-uid-copy{appearance:none;padding:2px 7px;border-radius:999px;border:1px solid var(--pz-line,#2b3952);background:transparent;color:var(--ink-soft,#9aa8be);font-size:10.5px;font-weight:600;cursor:pointer}
.ws-uid-copy:hover{color:var(--text,#f5f8ff);border-color:var(--orange2,#ffd08a)}
.ws-grants-box{display:grid;gap:8px;padding:12px;border-radius:12px;border:1px solid var(--pz-line,#253650);background:var(--surface,#131d2f)}
.ws-grants-form{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.ws-grants-form input{flex:1 1 220px;min-width:180px;padding:7px 10px;border-radius:9px;border:1px solid var(--pz-line,#2b3952);background:rgb(0 0 0/.22);color:var(--text,#f5f8ff);font-size:12.5px}
.ws-grants-list{display:flex;flex-wrap:wrap;gap:6px}
.ws-grant-pill{display:inline-flex;align-items:center;gap:6px;padding:4px 9px;border-radius:999px;border:1px solid var(--pz-line,#2b3952);background:rgb(255 255 255/.04);font-size:11.5px;color:var(--text,#f5f8ff)}
.ws-grant-revoke{appearance:none;border:none;background:transparent;color:var(--red,#ff696c);font-weight:700;cursor:pointer;padding:0 2px;font-size:13px;line-height:1}
.ws-owner-view{display:grid;gap:12px}
.ws-owner-view[hidden],.ws-count-pill[hidden],.ws-uid-banner[hidden]{display:none}
.ws-uid-banner{display:flex;justify-content:space-between;align-items:center;gap:8px}
</style>`;

  function mount(host: HTMLElement, api: ApiFn, getPreferences: PrefsFn, setPreferences: SetPrefsFn, goPage?: GoFn) {
    host.innerHTML = wsStyle + `
<div class="ws-shell">
  <div class="ws-head">
    <div>
      <h2>Workshop</h2>
      <p>Share skills and specialists with the community, or install theirs in one click.</p>
    </div>
    <span data-ws="status" style="font-size:12.5px;color:var(--ink-soft,#9aa8be)" role="status" aria-live="polite"></span>
  </div>

  <div class="ws-banner">
    <div class="ws-banner-info">
      <span class="ws-dot" data-ws="reg-dot"></span>
      <strong>Public Registry</strong>
      <span data-ws="reg-text" style="color:var(--ink-soft,#9aa8be)">Offline starter catalog · Live Workshop unavailable right now</span>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <button type="button" class="softbtn" data-ws="reg-config" hidden>Configure Registry</button>
      <button type="button" class="softbtn" data-ws="reg-settings" hidden>Settings</button>
      <button type="button" class="accentbtn" data-ws="open-owner" hidden>Owner Panel <span data-ws="owner-badge" class="ws-count-pill" hidden>0</span></button>
      <button type="button" class="softbtn" data-ws="owner-unlock-btn" title="Owner access (Ctrl+Shift+O)" aria-label="Owner access" hidden>
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" style="vertical-align:-2px"><rect x="4" y="11" width="16" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 11V7a4 4 0 0 1 8 0v4" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>
      </button>
    </div>
  </div>

  <div class="ws-toolbar">
    <div class="ws-pills" role="group" aria-label="Filter by type">
      <button type="button" data-ws-kind="all" aria-pressed="true">All</button>
      <button type="button" data-ws-kind="skill" aria-pressed="false">Skills</button>
      <button type="button" data-ws-kind="specialist" aria-pressed="false">Specialists</button>
    </div>
    <input type="search" class="ws-search" data-ws="search" placeholder="Search the workshop..." aria-label="Search the workshop">
    <select class="ws-select" data-ws="engine" aria-label="Filter by engine">
      <option value="all">All engines</option>
      <option value="roblox">Roblox</option>
      <option value="blender">Blender</option>
      <option value="godot">Godot</option>
      <option value="unity">Unity</option>
      <option value="general">General</option>
    </select>
    <select class="ws-select" data-ws="sort" aria-label="Sort results">
      <option value="rating">Top rated</option>
      <option value="installs">Most installed</option>
      <option value="newest">Newest</option>
    </select>
    <button type="button" class="softbtn" data-ws="import-pkg">Import Package</button>
    <input type="file" data-ws="import-pkg-file" accept=".plazskill,.zip" hidden>
    <button type="button" class="accentbtn" data-ws="open-upload">Upload a Skill</button>
  </div>

  <div class="ws-cats" data-ws="categories" role="group" aria-label="Categories"></div>
  <div class="ws-grid" data-ws="grid"></div>

  <div class="ws-modal" data-ws="upload-modal" hidden role="dialog" aria-modal="true" aria-label="Upload a Skill">
    <div class="ws-modal-card">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h3 style="margin:0">Upload a Skill</h3>
        <button type="button" class="softbtn" data-ws="upload-close">Close</button>
      </div>
      <label>Local skill
        <select data-ws="up-skill"></select>
      </label>
      <div class="ws-form-row">
        <label>Title<input type="text" data-ws="up-title" placeholder="Skill or Specialist title"></label>
        <label>Type
          <select data-ws="up-kind"><option value="skill">Skill</option><option value="specialist">Specialist</option></select>
        </label>
      </div>
      <label>Summary<textarea rows="2" data-ws="up-summary" placeholder="What does this skill or specialist do?"></textarea></label>
      <div class="ws-form-row">
        <label>Category
          <select data-ws="up-category">
            <option>3D Assets</option><option>Animation</option><option>Interface</option>
            <option selected>Tools</option><option>Worldbuilding</option><option>Scripting</option>
          </select>
        </label>
        <label>Engine
          <select data-ws="up-engine">
            <option value="roblox">Roblox</option><option value="blender">Blender</option>
            <option value="godot">Godot</option><option value="unity">Unity</option><option value="general">General</option>
          </select>
        </label>
      </div>
      <div class="ws-form-row">
        <label>Author<input type="text" data-ws="up-author" placeholder="Your handle"></label>
        <label>Version<input type="text" data-ws="up-version" value="1.0.0"></label>
      </div>
      <label>Tags (comma-separated)<input type="text" data-ws="up-tags" placeholder="ui, roblox, layout"></label>
      <p style="margin:0;font-size:12px;color:var(--ink-soft,#9aa8be)">Community uploads pass safety checks and wait in the Owner Approval queue before going live.</p>
      <div class="ws-scan-box" data-ws="up-scan-result" hidden></div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between;align-items:center">
        <button type="button" class="softbtn" data-ws="up-scan">Run Safety Check</button>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button type="button" class="softbtn" data-ws="up-export">Export .plazskill</button>
          <button type="button" class="accentbtn" data-ws="up-submit">Submit to Registry</button>
        </div>
      </div>
    </div>
  </div>

  <div class="ws-modal" data-ws="report-modal" hidden role="dialog" aria-modal="true" aria-label="Report Workshop Item">
    <div class="ws-modal-card" style="width:min(440px,94vw)">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h3 style="margin:0">Report Skill</h3>
        <button type="button" class="softbtn" data-ws="rep-close">Close</button>
      </div>
      <p style="margin:0;font-size:12.5px;color:var(--ink-soft,#9aa8be)">Items with 3 community reports are automatically hidden for owner review.</p>
      <label>Reason<textarea rows="3" data-ws="rep-reason" placeholder="Describe prompt injection, broken steps, or unsafe instructions..."></textarea></label>
      <div style="display:flex;justify-content:flex-end;gap:8px">
        <button type="button" class="dangerbtn" data-ws="rep-submit">Submit Report</button>
      </div>
    </div>
  </div>

  <div class="ws-modal" data-ws="reg-modal" hidden role="dialog" aria-modal="true" aria-label="Workshop Registry Settings">
    <div class="ws-modal-card" style="width:min(480px,94vw)">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h3 style="margin:0">Workshop Registry URL</h3>
        <button type="button" class="softbtn" data-ws="reg-close">Close</button>
      </div>
      <p style="margin:0;font-size:12.5px;color:var(--ink-soft,#9aa8be)">Connect to a deployed PlazCode Workshop Cloudflare Worker (leave blank to use the official PlazCode Workshop server).</p>
      <label>Registry URL (workshopRegistryUrl)
        <input type="url" data-ws="reg-input" placeholder="https://plazcode-workshop.plazcode-stoveez.workers.dev">
      </label>
      <div style="display:flex;justify-content:flex-end;gap:8px">
        <button type="button" class="accentbtn" data-ws="reg-save">Save URL</button>
      </div>
    </div>
  </div>

  <div class="ws-modal" data-ws="owner-unlock-modal" hidden role="dialog" aria-modal="true" aria-label="Owner Access">
    <div class="ws-modal-card" style="width:min(460px,94vw)">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h3 style="margin:0">Owner Access</h3>
        <button type="button" class="softbtn" data-ws="unlock-close">Close</button>
      </div>
      <p style="margin:0;font-size:12.5px;color:var(--ink-soft,#9aa8be)">Tokens stay strictly in app memory (RAM) for this session and clear automatically when you lock or quit PlazCode. Signed-in owner accounts unlock automatically.</p>
      <label>Account Owner Token (optional)
        <input type="password" autocomplete="off" data-ws="unlock-acct-token" placeholder="OWNER_ADMIN_TOKEN">
      </label>
      <label>Workshop Owner Token (optional)
        <input type="password" autocomplete="off" data-ws="unlock-ws-token" placeholder="WORKSHOP_OWNER_TOKEN">
      </label>
      <div class="ws-scan-box bad" data-ws="unlock-error" hidden></div>
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
        <button type="button" class="dangerbtn" data-ws="unlock-lock" hidden>Lock Owner Session</button>
        <div style="display:flex;gap:8px;margin-left:auto">
          <button type="button" class="accentbtn" data-ws="unlock-submit">Unlock Owner Access</button>
        </div>
      </div>
    </div>
  </div>

  <div class="ws-modal" data-ws="owner-panel" hidden role="dialog" aria-modal="true" aria-label="Owner Moderation &amp; Users">
    <div class="ws-owner-card">
      <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px">
        <div>
          <h3 style="margin:0;font-size:20px">Owner Panel</h3>
          <p data-ws="owner-status-line" style="margin:2px 0 0;font-size:12px;color:var(--ink-soft,#9aa8be)">Manage PlazCode users, live presence, and pending Workshop submissions.</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <button type="button" class="softbtn" data-ws="owner-refresh">Refresh</button>
          <button type="button" class="softbtn" data-ws="owner-lock" hidden>Lock</button>
          <button type="button" class="softbtn" data-ws="owner-close">Close</button>
        </div>
      </div>

      <div class="ws-pills" role="tablist" aria-label="Owner Panel sections">
        <button type="button" role="tab" data-ws-owner-tab="users" aria-selected="true" aria-pressed="true">Users <span data-ws="owner-users-count"></span></button>
        <button type="button" role="tab" data-ws-owner-tab="banned" aria-selected="false" aria-pressed="false">Banned Profiles <span data-ws="owner-banned-count"></span></button>
        <button type="button" role="tab" data-ws-owner-tab="workshop" aria-selected="false" aria-pressed="false">Workshop Moderation <span data-ws="owner-pending-count"></span></button>
      </div>

      <section data-ws="owner-users-view" class="ws-owner-view">
        <div class="ws-note-bar">Passwords are encrypted with one-way scrypt hashing and cannot be viewed by anyone, including the owner. Click any User ID chip to view all profiles sharing that account.</div>
        <div class="ws-grants-box" data-ws="owner-grants-box">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
            <strong style="font-size:13px">Owner Panel Access Grants</strong>
            <small style="color:var(--ink-soft,#9aa8be)">Grant by Account User ID (PC-XXXX-XXXX) or username</small>
          </div>
          <div class="ws-grants-form">
            <input type="text" data-ws="owner-grant-input" placeholder="Enter User ID (PC-XXXX-XXXX) or username" aria-label="User ID or username to grant owner access">
            <button type="button" class="accentbtn" data-ws="owner-grant-add">Grant Owner</button>
          </div>
          <div class="ws-grants-list" data-ws="owner-grants-list"></div>
        </div>
        <div class="ws-toolbar">
          <div class="ws-pills" role="group" aria-label="Filter users">
            <button type="button" data-ws-ufilter="all" aria-pressed="true">All</button>
            <button type="button" data-ws-ufilter="online" aria-pressed="false">Online Now</button>
            <button type="button" data-ws-ufilter="banned" aria-pressed="false">Banned</button>
          </div>
          <input type="search" class="ws-search" data-ws="owner-user-search" placeholder="Search username or User ID (PC-...)..." aria-label="Search username or User ID">
        </div>
        <div class="ws-note-bar ws-uid-banner" data-ws="owner-uid-banner" hidden>
          <span data-ws="owner-uid-banner-text"></span>
          <button type="button" class="softbtn" data-ws="owner-uid-clear" style="padding:3px 9px;font-size:11.5px">Show all profiles</button>
        </div>
        <div class="ws-owner-list" data-ws="owner-users-list"></div>
      </section>

      <section data-ws="owner-banned-view" class="ws-owner-view" hidden>
        <div class="ws-note-bar">Banned users and all linked profiles on the same Account User ID are locked out from creating new profiles or using Guest mode. You can unban a banned profile to restore access, or permanently terminate it (cannot be unbanned).</div>
        <div class="ws-toolbar">
          <div class="ws-pills" role="group" aria-label="Filter banned profiles">
            <button type="button" data-ws-bfilter="banned" aria-pressed="true">All Banned</button>
            <button type="button" data-ws-bfilter="terminated" aria-pressed="false">Terminated (No Unban)</button>
          </div>
          <input type="search" class="ws-search" data-ws="owner-banned-search" placeholder="Look up banned username or User ID..." aria-label="Look up banned username or User ID">
        </div>
        <div class="ws-owner-list" data-ws="owner-banned-list"></div>
      </section>

      <section data-ws="owner-workshop-view" class="ws-owner-view" hidden>
        <div class="ws-toolbar">
          <div class="ws-pills" role="group" aria-label="Filter submissions">
            <button type="button" data-ws-wfilter="pending" aria-pressed="true">Pending</button>
            <button type="button" data-ws-wfilter="hidden" aria-pressed="false">Hidden</button>
            <button type="button" data-ws-wfilter="all" aria-pressed="false">All</button>
            <button type="button" data-ws-wfilter="approved" aria-pressed="false">Approved</button>
            <button type="button" data-ws-wfilter="rejected" aria-pressed="false">Rejected</button>
            <button type="button" data-ws-wfilter="removed" aria-pressed="false">Removed</button>
          </div>
          <input type="search" class="ws-search" data-ws="owner-ws-search" placeholder="Filter skills or authors..." aria-label="Filter Workshop submissions">
        </div>
        <div class="ws-owner-list" data-ws="owner-ws-list"></div>
        <div style="display:grid;gap:8px;padding-top:8px;border-top:1px solid var(--pz-line,#253650)">
          <strong style="font-size:13px">Banned Workshop Authors</strong>
          <div class="ws-owner-list" data-ws="owner-banned-authors"></div>
        </div>
      </section>
    </div>
  </div>
</div>`;

    const find = <T extends HTMLElement = HTMLElement>(name: string) => host.querySelector('[data-ws="' + name + '"]') as T;
    const status = (msg: string) => { find('status').textContent = msg || ''; };
    let kindFilter = 'all', categoryFilter = 'All categories', items: WorkshopItem[] = [], installedIds = new Set<string>();
    let localRatings: Record<string, number> = {}, localSkills: any[] = [], reportTargetId = '', busy = false;
    let ownerStatus: OwnerStatus = {};
    let ownerTab: 'users' | 'banned' | 'workshop' = 'users';
    let userFilter: 'all' | 'online' | 'banned' = 'all';
    let activeUserIdFilter = '';
    let ownerGrants: OwnerGrant[] = [];
    let bannedSubFilter: 'banned' | 'terminated' = 'banned';
    let wsModFilter: string = 'pending';
    let ownerUsers: OwnerUser[] = [];
    let ownerBannedUsers: OwnerUser[] = [];
    let ownerUserCounts: { total?: number; online?: number; banned?: number; terminated?: number } = {};
    let ownerSkills: OwnerSkill[] = [];
    let ownerWsCounts: Record<string, number> = {};
    let ownerBannedAuthors: BannedAuthor[] = [];
    let pendingUserConfirm: { id: string; mode: 'ban' | 'remove'; username: string } | null = null;
    let pendingBannedConfirm: { id: string; username: string } | null = null;
    let pendingRejectSkillId = '';

    const run = (fn: (...args: any[]) => Promise<void>) => async (...args: any[]) => {
      if (busy) return;
      busy = true;
      try { await fn(...args); } catch (e) { status((e as Error)?.message || String(e)); } finally { busy = false; }
    };

    function renderCategories() {
      const box = find('categories');
      box.replaceChildren();
      for (const cat of CATEGORIES) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ws-chip';
        btn.setAttribute('aria-pressed', String(categoryFilter === cat));
        btn.textContent = cat;
        btn.onclick = () => { categoryFilter = cat; renderCategories(); void refresh(); };
        box.appendChild(btn);
      }
    }

    function renderGrid() {
      const grid = find('grid');
      grid.replaceChildren();
      if (!items.length) {
        const empty = document.createElement('p');
        empty.style.color = 'var(--ink-soft,#9aa8be)';
        empty.textContent = 'No matching skills or specialists found.';
        grid.appendChild(empty);
        return;
      }
      const isBuiltInItem = (it: WorkshopItem): boolean =>
        it.badge === 'BUILT-IN' ||
        /\(built-in\)/i.test(it.author || '') ||
        (it.tags || []).includes('built-in') ||
        it.id.startsWith('starter-') ||
        it.id.startsWith('plazcode-spec-');
      const localSkillIds = new Set<string>(localSkills.map((s) => String(s?.id || '')));
      const localSkillTitles = new Set<string>(localSkills.map((s) => String(s?.title || '').trim().toLowerCase()).filter(Boolean));
      const isAlreadyAdded = (it: WorkshopItem): boolean =>
        installedIds.has(it.id) ||
        localSkillIds.has(it.id) ||
        (Boolean(it.slug) && localSkillIds.has('community-' + it.slug)) ||
        (Boolean(it.title) && localSkillTitles.has(it.title.trim().toLowerCase()));

      for (const item of items) {
        const card = document.createElement('article');
        card.className = 'ws-card';
        card.setAttribute('data-ws-card', item.id);

        const banner = document.createElement('div');
        banner.className = 'ws-card-banner';
        const icon = document.createElement('div');
        icon.className = 'ws-card-icon';
        icon.innerHTML = cardGlyph(item.category, item.kind);
        const badge = document.createElement('span');
        badge.className = 'ws-badge' + (item.badge === 'FEATURED' ? ' featured' : '');
        badge.textContent = item.badge || 'COMMUNITY';
        banner.append(icon, badge);

        const body = document.createElement('div');
        body.className = 'ws-card-body';
        const top = document.createElement('div');
        top.className = 'ws-card-top';
        const topLeft = document.createElement('div');
        topLeft.className = 'ws-card-top-left';
        const kindPill = document.createElement('span');
        kindPill.className = 'ws-kind-pill';
        kindPill.textContent = item.kind === 'specialist' ? 'Specialist' : 'Skill';
        const avgRating = (typeof item.rating_avg === 'number' && item.rating_avg > 0)
          ? item.rating_avg
          : (localRatings[item.id] || 0);
        const ratingBadge = document.createElement('span');
        ratingBadge.className = 'ws-rating-badge';
        ratingBadge.setAttribute('data-ws-rating', item.id);
        ratingBadge.innerHTML = starSvg(12) + `<span>${formatOutOfFive(avgRating)}</span>`;
        const rCount = Number(item.rating_count || 0);
        ratingBadge.title = rCount > 0 ? `${formatOutOfFive(avgRating)} (${rCount} rating${rCount === 1 ? '' : 's'})` : formatOutOfFive(avgRating);
        topLeft.append(kindPill, ratingBadge);
        const catSmall = document.createElement('small');
        catSmall.style.color = 'var(--ink-soft,#94a3b8)';
        catSmall.textContent = item.category;
        top.append(topLeft, catSmall);

        const title = document.createElement('h3');
        title.className = 'ws-card-title';
        title.textContent = item.title;

        const author = document.createElement('div');
        author.className = 'ws-card-author';
        author.textContent = `${item.author} · v${item.version}`;

        const review = document.createElement('div');
        const isReviewed = item.review_status.startsWith('reviewed');
        review.className = 'ws-card-review' + (isReviewed ? '' : ' unreviewed');
        review.textContent = item.review_status;

        const summary = document.createElement('p');
        summary.className = 'ws-card-summary';
        summary.textContent = item.summary;

        const tags = document.createElement('div');
        tags.className = 'ws-tags';
        for (const t of (item.tags || []).slice(0, 4)) {
          const pill = document.createElement('span');
          pill.className = 'ws-tag';
          pill.textContent = t;
          tags.appendChild(pill);
        }
        body.append(top, title, author, review, summary, tags);

        const foot = document.createElement('div');
        foot.className = 'ws-card-foot';
        const meta = document.createElement('div');
        meta.className = 'ws-foot-meta';
        const sizeSpan = document.createElement('span');
        sizeSpan.className = 'ws-foot-size';
        sizeSpan.textContent = `${formatBytes(item.body_bytes)} · ${item.file_count} file${item.file_count === 1 ? '' : 's'}`;
        const rateWrap = document.createElement('span');
        rateWrap.className = 'ws-rate-group';
        const curRating = localRatings[item.id] || Math.round(item.rating_avg || 0);
        for (let s = 1; s <= 5; s++) {
          const star = document.createElement('button');
          star.type = 'button';
          star.className = 'ws-star-btn' + (s <= curRating ? ' on' : '');
          star.innerHTML = starSvg(14);
          star.title = `Rate ${s} star${s === 1 ? '' : 's'}`;
          star.setAttribute('aria-label', star.title);
          star.onclick = run(async () => {
            const res = await api('/api/workshop/rate', { method: 'POST', body: JSON.stringify({ id: item.id, stars: s }) });
            localRatings[item.id] = s;
            item.rating_avg = res?.rating_avg ?? s;
            if (typeof res?.rating_count === 'number') item.rating_count = res.rating_count;
            else if (!item.rating_count) item.rating_count = 1;
            renderGrid();
            status(`Rated ${item.title} ${s}/5.`);
          });
          rateWrap.appendChild(star);
        }
        meta.append(sizeSpan, rateWrap);

        const actions = document.createElement('div');
        actions.className = 'ws-foot-actions';
        const repBtn = document.createElement('button');
        repBtn.type = 'button';
        repBtn.className = 'ws-report-btn';
        repBtn.textContent = 'Report';
        repBtn.onclick = () => {
          reportTargetId = item.id;
          find<HTMLTextAreaElement>('rep-reason').value = '';
          find('report-modal').hidden = false;
        };
        actions.append(repBtn);
        if (isBuiltInItem(item)) {
          const statePill = document.createElement('span');
          statePill.className = 'ws-installed-pill';
          statePill.setAttribute('data-ws-state', 'builtin');
          statePill.textContent = 'Built-in';
          actions.append(statePill);
        } else if (isAlreadyAdded(item)) {
          const statePill = document.createElement('span');
          statePill.className = 'ws-installed-pill';
          statePill.setAttribute('data-ws-state', 'installed');
          statePill.textContent = '✓ Added';
          actions.append(statePill);
        } else {
          const instBtn = document.createElement('button');
          instBtn.type = 'button';
          instBtn.className = 'accentbtn';
          instBtn.setAttribute('data-ws-install', item.id);
          instBtn.textContent = 'Install';
          instBtn.onclick = run(async () => {
            status(`Installing ${item.title}…`);
            const res = await api('/api/workshop/install', { method: 'POST', body: JSON.stringify({ id: item.id }) });
            installedIds.add(item.id);
            renderGrid();
            status(`Installed "${res?.installed?.title || item.title}" as a community skill (${res?.installed?.id || ''}).`);
          });
          actions.append(instBtn);
        }
        foot.append(meta, actions);

        card.append(banner, body, foot);
        grid.appendChild(card);
      }
    }

    async function refresh() {
      const q = encodeURIComponent(find<HTMLInputElement>('search').value.trim());
      const cat = encodeURIComponent(categoryFilter);
      const eng = encodeURIComponent(find<HTMLSelectElement>('engine').value);
      const sort = encodeURIComponent(find<HTMLSelectElement>('sort').value);
      const res = await api(`/api/workshop/catalog?q=${q}&kind=${kindFilter}&category=${cat}&engine=${eng}&sort=${sort}`);
      items = res?.items || [];
      installedIds = new Set<string>(res?.installed_ids || []);
      localRatings = res?.local_ratings || {};
      localSkills = res?.local_skills || [];

      const regUrl = String(res?.registry_url || '');
      const regState = String(res?.registry_status || 'offline');
      let canConfigure = Boolean(res?.can_configure_registry);
      const dot = find('reg-dot');
      dot.className = 'ws-dot' + (regState === 'connected' ? ' on' : '');
      const updateRegBanner = (allowUrl: boolean) => {
        const displayUrl = allowUrl ? (regUrl || String(getPreferences()?.workshopRegistryUrl || '')) : '';
        find('reg-config').hidden = !allowUrl;
        find('reg-settings').hidden = !(allowUrl && Boolean(goPage));
        find('reg-text').textContent = regState === 'connected'
          ? (allowUrl && displayUrl ? `Connected to ${displayUrl} · Browse and publish live` : 'Connected to PlazCode Workshop · Browse and publish live')
          : (allowUrl && displayUrl
              ? `Registry offline (${res?.registry_error || 'unreachable'}) · Showing built-in starter catalog`
              : 'Offline starter catalog · Live Workshop unavailable right now');
      };
      updateRegBanner(canConfigure);

      renderGrid();
      await refreshOwnerStatus();
      canConfigure = Boolean(res?.can_configure_registry || ownerStatus.is_owner || ownerStatus.unlocked);
      updateRegBanner(canConfigure);
    }

    function populateUploadSkills() {
      const sel = find<HTMLSelectElement>('up-skill');
      sel.replaceChildren();
      for (const s of localSkills) {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `${s.title || s.id} (${s.files?.length || 1} files)`;
        sel.appendChild(opt);
      }
      const syncSelected = () => {
        const chosen = localSkills.find(s => s.id === sel.value);
        if (!chosen) return;
        find<HTMLInputElement>('up-title').value = chosen.title || '';
        find<HTMLTextAreaElement>('up-summary').value = chosen.description || '';
        find<HTMLSelectElement>('up-engine').value = chosen.domain === 'blender' ? 'blender' : (chosen.domain === 'local' ? 'general' : 'roblox');
      };
      sel.onchange = syncSelected;
      syncSelected();
    }

    host.querySelectorAll<HTMLButtonElement>('[data-ws-kind]').forEach(btn => {
      btn.onclick = () => {
        kindFilter = btn.getAttribute('data-ws-kind') || 'all';
        host.querySelectorAll<HTMLButtonElement>('[data-ws-kind]').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
        void refresh();
      };
    });
    find('search').addEventListener('input', () => { void refresh(); });
    find('engine').addEventListener('change', () => { void refresh(); });
    find('sort').addEventListener('change', () => { void refresh(); });

    find('import-pkg').onclick = () => find<HTMLInputElement>('import-pkg-file').click();
    find('import-pkg-file').onchange = run(async () => {
      const input = find<HTMLInputElement>('import-pkg-file');
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;
      const bytes = new Uint8Array(await file.arrayBuffer());
      let bin = '';
      for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.slice(i, i + 8192));
      const res = await api('/api/workshop/install', { method: 'POST', body: JSON.stringify({ zip: btoa(bin) }) });
      status(`Imported package as "${res?.installed?.title || file.name}" (${res?.installed?.id || ''}).`);
    });

    find('open-upload').onclick = () => {
      populateUploadSkills();
      find('up-scan-result').hidden = true;
      find('upload-modal').hidden = false;
    };
    find('upload-close').onclick = () => { find('upload-modal').hidden = true; };

    function uploadPayload() {
      const tags = find<HTMLInputElement>('up-tags').value.split(',').map(t => t.trim()).filter(Boolean);
      return {
        skill_id: find<HTMLSelectElement>('up-skill').value,
        title: find<HTMLInputElement>('up-title').value.trim(),
        summary: find<HTMLTextAreaElement>('up-summary').value.trim(),
        kind: find<HTMLSelectElement>('up-kind').value,
        category: find<HTMLSelectElement>('up-category').value,
        engine: find<HTMLSelectElement>('up-engine').value,
        author: find<HTMLInputElement>('up-author').value.trim() || 'community',
        version: find<HTMLInputElement>('up-version').value.trim() || '1.0.0',
        tags,
      };
    }

    find('up-scan').onclick = run(async () => {
      const payload = uploadPayload();
      const res = await api('/api/workshop/scan', { method: 'POST', body: JSON.stringify({ skill_id: payload.skill_id }) });
      const box = find('up-scan-result');
      box.hidden = false;
      const v = res?.validation || {};
      const safe = Boolean(v?.safety?.safe);
      box.className = 'ws-scan-box ' + (safe ? 'ok' : 'bad');
      box.textContent = safe
        ? 'Safety check passed: no prompt injections, secrets, or unsafe paths.'
        : 'Blocked: ' + (v?.safety?.issues || []).map((i: any) => i.reason).join('; ');
    });

    find('up-export').onclick = run(async () => {
      const payload = uploadPayload();
      const res = await api('/api/workshop/export', { method: 'POST', body: JSON.stringify(payload) });
      const bin = atob(res.zip_base64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([arr], { type: 'application/zip' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename || 'skill.plazskill';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status(`Exported ${res.filename} (${formatBytes(res.bytes)}).`);
    });

    find('up-submit').onclick = run(async () => {
      const payload = uploadPayload();
      const res = await api('/api/workshop/upload', { method: 'POST', body: JSON.stringify(payload) });
      find('upload-modal').hidden = true;
      status(res?.message || 'Submitted for owner approval.');
      await refresh();
    });

    find('rep-close').onclick = () => { find('report-modal').hidden = true; };
    find('rep-submit').onclick = run(async () => {
      const reason = find<HTMLTextAreaElement>('rep-reason').value.trim();
      if (!reason) throw Error('Enter a reason for the report.');
      await api('/api/workshop/report', { method: 'POST', body: JSON.stringify({ id: reportTargetId, reason }) });
      find('report-modal').hidden = true;
      status('Report recorded. Thank you.');
    });

    find('reg-config').onclick = () => {
      find<HTMLInputElement>('reg-input').value = String(getPreferences()?.workshopRegistryUrl || '');
      find('reg-modal').hidden = false;
    };
    if (goPage) {
      find('reg-settings').onclick = () => goPage('settings', 'general');
    }
    find('reg-close').onclick = () => { find('reg-modal').hidden = true; };
    find('reg-save').onclick = run(async () => {
      const url = find<HTMLInputElement>('reg-input').value.trim();
      await setPreferences({ workshopRegistryUrl: url });
      find('reg-modal').hidden = true;
      await refresh();
      status(url ? 'Workshop registry URL saved.' : 'Reset to official PlazCode Workshop.');
    });

    function setOwnerStatusLine(msg: string) {
      find('owner-status-line').textContent = msg;
    }

    async function refreshOwnerStatus() {
      try {
        ownerStatus = await api('/api/owner/status') || {};
      } catch {
        ownerStatus = {};
      }
      const canOpen = Boolean(ownerStatus.is_owner || ownerStatus.unlocked);
      find('open-owner').hidden = !canOpen;
      find('owner-unlock-btn').hidden = !canOpen;
      find('owner-lock').hidden = !ownerStatus.unlocked;
      find('unlock-lock').hidden = !ownerStatus.unlocked;
      if (canOpen && ownerStatus.registry_configured && ownerStatus.workshop_owner) {
        try {
          const preview = await api('/api/owner/workshop/skills?status=pending');
          const pending = Number(preview?.counts?.pending || 0) + Number(preview?.counts?.hidden || 0);
          const badge = find('owner-badge');
          badge.hidden = pending <= 0;
          badge.textContent = String(pending);
          find('owner-pending-count').textContent = pending > 0 ? `(${pending})` : '';
        } catch {}
      } else {
        find('owner-badge').hidden = true;
      }
    }

    function selectOwnerTab(tab: 'users' | 'banned' | 'workshop') {
      ownerTab = tab;
      host.querySelectorAll<HTMLButtonElement>('[data-ws-owner-tab]').forEach(btn => {
        const active = btn.getAttribute('data-ws-owner-tab') === tab;
        btn.setAttribute('aria-pressed', String(active));
        btn.setAttribute('aria-selected', String(active));
      });
      find('owner-users-view').hidden = tab !== 'users';
      find('owner-banned-view').hidden = tab !== 'banned';
      find('owner-workshop-view').hidden = tab !== 'workshop';
    }

    function renderOwnerUsers() {
      const list = find('owner-users-list');
      list.replaceChildren();
      const total = Number(ownerUserCounts.total ?? ownerUsers.length);
      find('owner-users-count').textContent = total ? `(${total})` : '';
      if (!ownerUsers.length) {
        const empty = document.createElement('p');
        empty.style.color = 'var(--ink-soft,#9aa8be)';
        empty.textContent = 'No matching PlazCode user accounts found.';
        list.appendChild(empty);
        return;
      }
      for (const u of ownerUsers) {
        const row = document.createElement('div');
        row.className = 'ws-owner-row';
        row.setAttribute('data-ws-owner-user', u.id);

        const head = document.createElement('div');
        head.className = 'ws-owner-row-head';

        const left = document.createElement('div');
        left.className = 'ws-owner-user';
        const safePic = validAvatarDataUrl(u.profile_picture);
        if (safePic) {
          const img = document.createElement('img');
          img.className = 'ws-avatar-img';
          img.src = safePic;
          img.alt = `${u.username} avatar`;
          left.appendChild(img);
        } else {
          const avatar = document.createElement('div');
          avatar.className = 'ws-avatar-fallback';
          avatar.textContent = (u.username || '?').slice(0, 1).toUpperCase();
          left.appendChild(avatar);
        }

        const info = document.createElement('div');
        info.style.display = 'grid';
        info.style.gap = '3px';

        const titleRow = document.createElement('div');
        titleRow.style.display = 'flex';
        titleRow.style.flexWrap = 'wrap';
        titleRow.style.alignItems = 'center';
        titleRow.style.gap = '6px';

        const nameEl = document.createElement('strong');
        nameEl.textContent = u.username;
        titleRow.appendChild(nameEl);

        if (u.user_id) {
          const uidBtn = document.createElement('button');
          uidBtn.type = 'button';
          uidBtn.className = 'ws-uid-chip';
          uidBtn.setAttribute('data-ws-uid-filter', u.user_id);
          uidBtn.title = 'Click to view all profiles sharing this Account User ID';
          uidBtn.textContent = u.user_id;
          uidBtn.onclick = run(async () => {
            activeUserIdFilter = activeUserIdFilter === u.user_id ? '' : (u.user_id || '');
            await loadOwnerUsers();
          });
          const copyBtn = document.createElement('button');
          copyBtn.type = 'button';
          copyBtn.className = 'ws-uid-copy';
          copyBtn.textContent = 'Copy';
          copyBtn.onclick = () => {
            navigator.clipboard?.writeText(u.user_id || '').then(() => setOwnerStatusLine(`Copied User ID ${u.user_id}`)).catch(() => {});
          };
          titleRow.append(uidBtn, copyBtn);
        }

        if (u.is_owner) {
          const ownerTag = document.createElement('span');
          ownerTag.className = 'ws-pill-tag ok';
          ownerTag.textContent = u.primary_owner ? 'Primary Owner' : 'Owner';
          titleRow.appendChild(ownerTag);
        }
        if (u.terminated) {
          const termTag = document.createElement('span');
          termTag.className = 'ws-pill-tag bad';
          termTag.textContent = 'Terminated · No Unban';
          titleRow.appendChild(termTag);
        } else if (u.banned) {
          const banTag = document.createElement('span');
          banTag.className = 'ws-pill-tag bad';
          banTag.textContent = 'Banned';
          titleRow.appendChild(banTag);
        }

        const presence = document.createElement('span');
        presence.className = 'ws-presence';
        const dot = document.createElement('span');
        dot.className = 'ws-dot' + (u.online ? ' on' : '');
        const pText = document.createElement('span');
        pText.textContent = u.online
          ? `Using PlazCode now${u.app_version ? ' · v' + u.app_version : ''}`
          : (u.last_seen_at ? `Offline · last active ${formatDateTime(u.last_seen_at)}` : 'Offline · never seen');
        presence.append(dot, pText);

        const joined = document.createElement('small');
        joined.style.color = 'var(--ink-soft,#9aa8be)';
        const linkedInfo = (u.linked_profile_count || 0) > 1
          ? ` · ${u.linked_profile_count} linked profiles (${(u.linked_usernames || []).join(', ')})`
          : '';
        joined.textContent = `Joined ${formatDateTime(u.created_at)}${u.user_id ? ' · User ID: ' + u.user_id : ''}${linkedInfo}${u.banned && u.ban_reason ? ' · Ban reason: ' + u.ban_reason : ''}`;

        info.append(titleRow, presence, joined);
        left.appendChild(info);

        const actions = document.createElement('div');
        actions.style.display = 'flex';
        actions.style.gap = '6px';
        actions.style.flexWrap = 'wrap';
        if (!u.is_owner) {
          if (!u.terminated) {
            const banBtn = document.createElement('button');
            banBtn.type = 'button';
            banBtn.className = u.banned ? 'softbtn' : 'dangerbtn';
            banBtn.textContent = u.banned ? 'Unban' : 'Ban';
            banBtn.setAttribute('data-ws-user-ban', u.id);
            if (u.banned) {
              banBtn.onclick = run(async () => {
                await api('/api/owner/users/unban', {
                  method: 'POST',
                  body: JSON.stringify({ id: u.id, username: u.username, unban_workshop: true }),
                });
                setOwnerStatusLine(`Unbanned ${u.username}.`);
                await Promise.all([loadOwnerUsers(), loadOwnerBanned()]);
              });
            } else {
              banBtn.onclick = () => {
                pendingUserConfirm = { id: u.id, mode: 'ban', username: u.username };
                renderOwnerUsers();
              };
            }
            actions.append(banBtn);
          }

          const rmBtn = document.createElement('button');
          rmBtn.type = 'button';
          rmBtn.className = 'dangerbtn';
          rmBtn.textContent = 'Remove Profile';
          rmBtn.setAttribute('data-ws-user-remove', u.id);
          rmBtn.onclick = () => {
            pendingUserConfirm = { id: u.id, mode: 'remove', username: u.username };
            renderOwnerUsers();
          };
          actions.append(rmBtn);
        }
        head.append(left, actions);
        row.appendChild(head);

        if (pendingUserConfirm && pendingUserConfirm.id === u.id) {
          const confirmBox = document.createElement('div');
          confirmBox.className = 'ws-owner-confirm';
          const isBan = pendingUserConfirm.mode === 'ban';
          const msg = document.createElement('div');
          msg.style.fontSize = '12.5px';
          msg.textContent = isBan
            ? `Ban ${u.username} from PlazCode? Active sessions are revoked immediately.`
            : `Permanently delete ${u.username}'s profile, sessions, and synced settings? This cannot be undone.`;
          confirmBox.appendChild(msg);

          let reasonInput: HTMLInputElement | null = null;
          if (isBan) {
            reasonInput = document.createElement('input');
            reasonInput.type = 'text';
            reasonInput.placeholder = 'Optional ban reason (shown to user)';
            reasonInput.value = 'Banned by owner.';
            reasonInput.style.cssText = 'padding:7px 10px;border-radius:8px;border:1px solid var(--pz-line,#2b3952);background:rgb(0 0 0/.24);color:var(--text,#f5f8ff)';
            confirmBox.appendChild(reasonInput);
          }

          const wsCheckLabel = document.createElement('label');
          wsCheckLabel.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer';
          const wsCheck = document.createElement('input');
          wsCheck.type = 'checkbox';
          wsCheck.checked = true;
          wsCheckLabel.append(wsCheck, document.createTextNode('Also remove their Workshop uploads'));
          confirmBox.appendChild(wsCheckLabel);

          const cBtns = document.createElement('div');
          cBtns.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';
          const cancelBtn = document.createElement('button');
          cancelBtn.type = 'button';
          cancelBtn.className = 'softbtn';
          cancelBtn.textContent = 'Cancel';
          cancelBtn.onclick = () => { pendingUserConfirm = null; renderOwnerUsers(); };

          const confirmBtn = document.createElement('button');
          confirmBtn.type = 'button';
          confirmBtn.className = 'dangerbtn';
          confirmBtn.textContent = isBan ? 'Confirm Ban' : 'Confirm Remove';
          confirmBtn.setAttribute('data-ws-user-confirm', u.id);
          confirmBtn.onclick = run(async () => {
            if (isBan) {
              await api('/api/owner/users/ban', {
                method: 'POST',
                body: JSON.stringify({
                  id: u.id,
                  username: u.username,
                  reason: reasonInput?.value.trim() || 'Banned by owner.',
                  remove_workshop_skills: wsCheck.checked,
                }),
              });
              setOwnerStatusLine(`Banned ${u.username} from PlazCode.`);
            } else {
              await api('/api/owner/users/remove', {
                method: 'POST',
                body: JSON.stringify({
                  id: u.id,
                  username: u.username,
                  remove_workshop_skills: wsCheck.checked,
                }),
              });
              setOwnerStatusLine(`Removed ${u.username}'s PlazCode profile.`);
            }
            pendingUserConfirm = null;
            await Promise.all([loadOwnerUsers(), loadOwnerBanned()]);
            if (ownerStatus.registry_configured && ownerStatus.workshop_owner) await loadOwnerWorkshop();
          });
          cBtns.append(cancelBtn, confirmBtn);
          confirmBox.appendChild(cBtns);
          row.appendChild(confirmBox);
        }

        list.appendChild(row);
      }
    }

    function renderOwnerWorkshop() {
      const list = find('owner-ws-list');
      list.replaceChildren();
      const pending = Number(ownerWsCounts.pending || 0) + Number(ownerWsCounts.hidden || 0);
      find('owner-pending-count').textContent = pending > 0 ? `(${pending})` : '';
      const badge = find('owner-badge');
      badge.hidden = pending <= 0;
      badge.textContent = String(pending);

      if (!ownerStatus.registry_configured) {
        const empty = document.createElement('p');
        empty.style.color = 'var(--ink-soft,#9aa8be)';
        empty.textContent = 'Configure a Workshop Registry URL first to moderate community submissions.';
        list.appendChild(empty);
      } else if (!ownerSkills.length) {
        const empty = document.createElement('p');
        empty.style.color = 'var(--ink-soft,#9aa8be)';
        empty.textContent = `No Workshop items in "${wsModFilter}".`;
        list.appendChild(empty);
      } else {
        for (const s of ownerSkills) {
          const row = document.createElement('div');
          row.className = 'ws-owner-row';
          row.setAttribute('data-ws-owner-skill', s.id);

          const head = document.createElement('div');
          head.className = 'ws-owner-row-head';

          const left = document.createElement('div');
          left.style.cssText = 'display:grid;gap:4px;min-width:0;flex:1 1 320px';

          const topLine = document.createElement('div');
          topLine.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:6px';
          const titleEl = document.createElement('strong');
          titleEl.textContent = s.title;
          const stPill = document.createElement('span');
          stPill.className = 'ws-pill-tag ' + (s.status === 'approved' ? 'ok' : (s.status === 'pending' ? 'warn' : 'bad'));
          stPill.textContent = s.status;
          topLine.append(titleEl, stPill);
          if (s.featured) {
            const featPill = document.createElement('span');
            featPill.className = 'ws-pill-tag warn';
            featPill.textContent = 'Featured';
            topLine.appendChild(featPill);
          }
          if (Number(s.report_count || 0) > 0) {
            const repPill = document.createElement('span');
            repPill.className = 'ws-pill-tag bad';
            repPill.textContent = `${s.report_count} report${s.report_count === 1 ? '' : 's'}`;
            topLine.appendChild(repPill);
          }

          const meta = document.createElement('small');
          meta.style.color = 'var(--ink-soft,#9aa8be)';
          meta.textContent = `${s.author} · ${s.kind} · ${s.category} · ${s.engine} · v${s.version} · ${formatDateTime(s.created_at)}`;
          const sum = document.createElement('div');
          sum.style.fontSize = '12.5px';
          sum.textContent = s.summary;
          left.append(topLine, meta, sum);
          if (s.reject_reason) {
            const rej = document.createElement('small');
            rej.style.color = 'var(--red,#ff696c)';
            rej.textContent = `Rejected reason: ${s.reject_reason}`;
            left.appendChild(rej);
          }

          const actions = document.createElement('div');
          actions.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;align-items:center';
          const modAction = (action: string, payload: Record<string, unknown>, label: string) => run(async () => {
            await api('/api/owner/workshop/action', {
              method: 'POST',
              body: JSON.stringify({ action, payload }),
            });
            setOwnerStatusLine(`${label}: ${s.title}`);
            pendingRejectSkillId = '';
            await loadOwnerWorkshop();
            await refresh();
          });

          if (s.status !== 'approved') {
            const appBtn = document.createElement('button');
            appBtn.type = 'button';
            appBtn.className = 'accentbtn';
            appBtn.textContent = 'Approve';
            appBtn.setAttribute('data-ws-mod-approve', s.id);
            appBtn.onclick = modAction('approve', { id: s.id, featured: false }, 'Approved');
            actions.appendChild(appBtn);
          }
          const featBtn = document.createElement('button');
          featBtn.type = 'button';
          featBtn.className = 'softbtn';
          featBtn.textContent = s.featured ? 'Unfeature' : 'Approve & Feature';
          featBtn.onclick = modAction('approve', { id: s.id, featured: !s.featured }, s.featured ? 'Updated' : 'Featured');
          actions.appendChild(featBtn);

          if (s.status !== 'rejected') {
            const rejBtn = document.createElement('button');
            rejBtn.type = 'button';
            rejBtn.className = 'softbtn';
            rejBtn.textContent = 'Reject';
            rejBtn.onclick = () => { pendingRejectSkillId = s.id; renderOwnerWorkshop(); };
            actions.appendChild(rejBtn);
          }

          if (s.status !== 'removed') {
            const remBtn = document.createElement('button');
            remBtn.type = 'button';
            remBtn.className = 'dangerbtn';
            remBtn.textContent = 'Remove';
            remBtn.setAttribute('data-ws-mod-remove', s.id);
            remBtn.onclick = modAction('remove', { id: s.id }, 'Removed');
            actions.appendChild(remBtn);
          }

          if (s.author_key || s.author) {
            const banAuthBtn = document.createElement('button');
            banAuthBtn.type = 'button';
            banAuthBtn.className = 'dangerbtn';
            banAuthBtn.textContent = 'Ban Author';
            banAuthBtn.onclick = modAction('ban', {
              author_key: s.author_key || s.author,
              author: s.author,
              reason: 'Banned by owner.',
            }, 'Banned author');
            actions.appendChild(banAuthBtn);
          }

          head.append(left, actions);
          row.appendChild(head);

          if (pendingRejectSkillId === s.id) {
            const rejBox = document.createElement('div');
            rejBox.className = 'ws-owner-confirm';
            const rejInput = document.createElement('input');
            rejInput.type = 'text';
            rejInput.placeholder = 'Rejection reason shown in moderation history';
            rejInput.value = 'Does not meet Workshop guidelines.';
            rejInput.style.cssText = 'padding:7px 10px;border-radius:8px;border:1px solid var(--pz-line,#2b3952);background:rgb(0 0 0/.24);color:var(--text,#f5f8ff)';
            const btns = document.createElement('div');
            btns.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';
            const cBtn = document.createElement('button');
            cBtn.type = 'button';
            cBtn.className = 'softbtn';
            cBtn.textContent = 'Cancel';
            cBtn.onclick = () => { pendingRejectSkillId = ''; renderOwnerWorkshop(); };
            const sBtn = document.createElement('button');
            sBtn.type = 'button';
            sBtn.className = 'dangerbtn';
            sBtn.textContent = 'Confirm Reject';
            sBtn.onclick = run(async () => {
              await api('/api/owner/workshop/action', {
                method: 'POST',
                body: JSON.stringify({ action: 'reject', payload: { id: s.id, reason: rejInput.value.trim() || 'Does not meet Workshop guidelines.' } }),
              });
              pendingRejectSkillId = '';
              setOwnerStatusLine(`Rejected ${s.title}`);
              await loadOwnerWorkshop();
            });
            btns.append(cBtn, sBtn);
            rejBox.append(rejInput, btns);
            row.appendChild(rejBox);
          }
          list.appendChild(row);
        }
      }

      const bannedBox = find('owner-banned-authors');
      bannedBox.replaceChildren();
      if (!ownerBannedAuthors.length) {
        const none = document.createElement('small');
        none.style.color = 'var(--ink-soft,#9aa8be)';
        none.textContent = 'No banned Workshop authors.';
        bannedBox.appendChild(none);
      } else {
        for (const b of ownerBannedAuthors) {
          const item = document.createElement('div');
          item.className = 'ws-owner-row-head';
          item.style.cssText = 'padding:8px 10px;border-radius:9px;border:1px solid var(--pz-line,#253650)';
          const txt = document.createElement('span');
          txt.style.fontSize = '12px';
          txt.textContent = `${b.author_key}${b.reason ? ' — ' + b.reason : ''}`;
          const unbanBtn = document.createElement('button');
          unbanBtn.type = 'button';
          unbanBtn.className = 'softbtn';
          unbanBtn.textContent = 'Unban';
          unbanBtn.onclick = run(async () => {
            await api('/api/owner/workshop/action', {
              method: 'POST',
              body: JSON.stringify({ action: 'unban', payload: { author_key: b.author_key } }),
            });
            setOwnerStatusLine(`Unbanned author ${b.author_key}.`);
            await loadOwnerWorkshop();
          });
          item.append(txt, unbanBtn);
          bannedBox.appendChild(item);
        }
      }
    }

    function renderOwnerGrants() {
      const box = find('owner-grants-box');
      const list = find('owner-grants-list');
      if (!box || !list) return;
      box.hidden = !ownerStatus.account_owner;
      list.replaceChildren();
      if (!ownerGrants.length) {
        const none = document.createElement('small');
        none.style.color = 'var(--ink-soft,#9aa8be)';
        none.textContent = 'No delegated owner grants yet.';
        list.appendChild(none);
        return;
      }
      for (const g of ownerGrants) {
        const pill = document.createElement('span');
        pill.className = 'ws-grant-pill';
        const label = g.target_type === 'user_id'
          ? `${g.user_id || g.target_key.replace(/^uid:/, '')}${g.linked_usernames?.length ? ' (' + g.linked_usernames.join(', ') + ')' : ''}`
          : `${g.username || g.target_key.replace(/^user:/, '')}${g.user_id ? ' · ' + g.user_id : ''}`;
        const txt = document.createElement('span');
        txt.textContent = label;
        const revokeBtn = document.createElement('button');
        revokeBtn.type = 'button';
        revokeBtn.className = 'ws-grant-revoke';
        revokeBtn.title = 'Revoke owner access';
        revokeBtn.setAttribute('aria-label', `Revoke owner access for ${label}`);
        revokeBtn.setAttribute('data-ws-grant-revoke', g.target_key);
        revokeBtn.textContent = '×';
        revokeBtn.onclick = run(async () => {
          await api('/api/owner/grants/revoke', {
            method: 'POST',
            body: JSON.stringify({ target_key: g.target_key }),
          });
          setOwnerStatusLine(`Revoked Owner Panel access for ${label}.`);
          await Promise.all([loadOwnerGrants(), loadOwnerUsers()]);
        });
        pill.append(txt, revokeBtn);
        list.appendChild(pill);
      }
    }

    async function loadOwnerGrants() {
      if (!ownerStatus.account_owner) {
        ownerGrants = [];
        renderOwnerGrants();
        return;
      }
      try {
        const res = await api('/api/owner/grants');
        ownerGrants = res?.grants || [];
      } catch {
        ownerGrants = [];
      }
      renderOwnerGrants();
    }

    async function loadOwnerUsers() {
      if (!ownerStatus.account_owner) {
        ownerUsers = [];
        renderOwnerGrants();
        find('owner-users-list').replaceChildren();
        const msg = document.createElement('p');
        msg.style.color = 'var(--ink-soft,#9aa8be)';
        msg.textContent = 'Unlock with an Owner Account session or Account Owner Token to manage registered PlazCode users.';
        find('owner-users-list').appendChild(msg);
        return;
      }
      const q = encodeURIComponent(find<HTMLInputElement>('owner-user-search').value.trim());
      const uidParam = activeUserIdFilter ? `&user_id=${encodeURIComponent(activeUserIdFilter)}` : '';
      const banner = find('owner-uid-banner');
      if (banner) {
        banner.hidden = !activeUserIdFilter;
        if (activeUserIdFilter) {
          find('owner-uid-banner-text').textContent = `Showing all profiles linked to User ID ${activeUserIdFilter}`;
        }
      }
      const res = await api(`/api/owner/users?filter=${encodeURIComponent(userFilter)}&q=${q}${uidParam}`);
      ownerUsers = res?.users || [];
      ownerUserCounts = res?.counts || {};
      const bannedCount = Number(ownerUserCounts.banned || 0);
      find('owner-banned-count').textContent = bannedCount > 0 ? `(${bannedCount})` : '';
      renderOwnerUsers();
    }

    function renderOwnerBanned() {
      const list = find('owner-banned-list');
      list.replaceChildren();
      const bannedTotal = Number(ownerUserCounts.banned ?? ownerBannedUsers.length);
      find('owner-banned-count').textContent = bannedTotal > 0 ? `(${bannedTotal})` : '';
      if (!ownerBannedUsers.length) {
        const empty = document.createElement('p');
        empty.style.color = 'var(--ink-soft,#9aa8be)';
        empty.textContent = bannedSubFilter === 'terminated' ? 'No permanently terminated profiles found.' : 'No banned profiles found.';
        list.appendChild(empty);
        return;
      }
      for (const u of ownerBannedUsers) {
        const row = document.createElement('div');
        row.className = 'ws-owner-row';
        row.setAttribute('data-ws-owner-banned', u.id);

        const head = document.createElement('div');
        head.className = 'ws-owner-row-head';

        const left = document.createElement('div');
        left.className = 'ws-owner-user';
        const safePic = validAvatarDataUrl(u.profile_picture);
        if (safePic) {
          const img = document.createElement('img');
          img.className = 'ws-avatar-img';
          img.src = safePic;
          img.alt = `${u.username} avatar`;
          left.appendChild(img);
        } else {
          const avatar = document.createElement('div');
          avatar.className = 'ws-avatar-fallback';
          avatar.textContent = (u.username || '?').slice(0, 1).toUpperCase();
          left.appendChild(avatar);
        }

        const info = document.createElement('div');
        info.style.cssText = 'display:grid;gap:3px';
        const titleRow = document.createElement('div');
        titleRow.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:6px';
        const nameEl = document.createElement('strong');
        nameEl.textContent = u.username;
        titleRow.appendChild(nameEl);

        if (u.user_id) {
          const uidBtn = document.createElement('button');
          uidBtn.type = 'button';
          uidBtn.className = 'ws-uid-chip';
          uidBtn.textContent = u.user_id;
          uidBtn.title = 'Click to view all profiles sharing this Account User ID';
          uidBtn.onclick = run(async () => {
            activeUserIdFilter = u.user_id || '';
            selectOwnerTab('users');
            await loadOwnerUsers();
          });
          titleRow.appendChild(uidBtn);
        }

        const pill = document.createElement('span');
        pill.className = 'ws-pill-tag bad';
        pill.textContent = u.terminated ? 'Permanently Terminated · No Unban' : 'Banned';
        titleRow.appendChild(pill);

        const meta = document.createElement('small');
        meta.style.color = 'var(--ink-soft,#9aa8be)';
        const when = u.terminated && u.terminated_at ? `Terminated ${formatDateTime(u.terminated_at)}` : (u.banned_at ? `Banned ${formatDateTime(u.banned_at)}` : `Joined ${formatDateTime(u.created_at)}`);
        const linkedText = (u.linked_profile_count || 0) > 1 ? ` · ${u.linked_profile_count} linked profiles (${(u.linked_usernames || []).join(', ')})` : '';
        meta.textContent = `${when}${u.user_id ? ' · User ID: ' + u.user_id : ''}${linkedText}${u.ban_reason ? ' · Reason: ' + u.ban_reason : ''}`;
        info.append(titleRow, meta);
        left.appendChild(info);

        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;align-items:center';
        if (u.terminated) {
          const lockedTag = document.createElement('span');
          lockedTag.className = 'ws-pill-tag';
          lockedTag.textContent = 'Locked permanently (no unban)';
          actions.appendChild(lockedTag);
        } else {
          const unbanBtn = document.createElement('button');
          unbanBtn.type = 'button';
          unbanBtn.className = 'softbtn';
          unbanBtn.textContent = 'Unban Profile';
          unbanBtn.setAttribute('data-ws-banned-unban', u.id);
          unbanBtn.onclick = run(async () => {
            await api('/api/owner/users/unban', {
              method: 'POST',
              body: JSON.stringify({ id: u.id, username: u.username, unban_workshop: true }),
            });
            setOwnerStatusLine(`Unbanned ${u.username}. They can sign in and create profiles again.`);
            await Promise.all([loadOwnerBanned(), loadOwnerUsers()]);
          });

          const termBtn = document.createElement('button');
          termBtn.type = 'button';
          termBtn.className = 'dangerbtn';
          termBtn.textContent = 'Permanently Terminate';
          termBtn.setAttribute('data-ws-banned-terminate', u.id);
          termBtn.onclick = () => {
            pendingBannedConfirm = { id: u.id, username: u.username };
            renderOwnerBanned();
          };
          actions.append(unbanBtn, termBtn);
        }

        head.append(left, actions);
        row.appendChild(head);

        if (pendingBannedConfirm && pendingBannedConfirm.id === u.id && !u.terminated) {
          const confirmBox = document.createElement('div');
          confirmBox.className = 'ws-owner-confirm';
          const msg = document.createElement('div');
          msg.style.fontSize = '12.5px';
          msg.textContent = `Permanently terminate ${u.username}? Their data is wiped, they remain locked out across PlazCode, and this profile can NEVER be unbanned.`;
          const reasonInput = document.createElement('input');
          reasonInput.type = 'text';
          reasonInput.placeholder = 'Termination reason (shown if they attempt sign-in)';
          reasonInput.value = u.ban_reason || 'Permanently terminated by owner.';
          reasonInput.style.cssText = 'padding:7px 10px;border-radius:8px;border:1px solid var(--pz-line,#2b3952);background:rgb(0 0 0/.24);color:var(--text,#f5f8ff)';
          const wsCheckLabel = document.createElement('label');
          wsCheckLabel.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer';
          const wsCheck = document.createElement('input');
          wsCheck.type = 'checkbox';
          wsCheck.checked = true;
          wsCheckLabel.append(wsCheck, document.createTextNode('Also remove their Workshop uploads'));
          const cBtns = document.createElement('div');
          cBtns.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';
          const cancelBtn = document.createElement('button');
          cancelBtn.type = 'button';
          cancelBtn.className = 'softbtn';
          cancelBtn.textContent = 'Cancel';
          cancelBtn.onclick = () => { pendingBannedConfirm = null; renderOwnerBanned(); };
          const confirmBtn = document.createElement('button');
          confirmBtn.type = 'button';
          confirmBtn.className = 'dangerbtn';
          confirmBtn.textContent = 'Confirm Permanent Termination';
          confirmBtn.setAttribute('data-ws-banned-terminate-confirm', u.id);
          confirmBtn.onclick = run(async () => {
            await api('/api/owner/users/terminate', {
              method: 'POST',
              body: JSON.stringify({
                id: u.id,
                username: u.username,
                reason: reasonInput.value.trim() || 'Permanently terminated by owner.',
                remove_workshop_skills: wsCheck.checked,
              }),
            });
            pendingBannedConfirm = null;
            setOwnerStatusLine(`Permanently terminated ${u.username}. No unban is possible.`);
            await Promise.all([loadOwnerBanned(), loadOwnerUsers()]);
            if (ownerStatus.registry_configured && ownerStatus.workshop_owner) await loadOwnerWorkshop();
          });
          cBtns.append(cancelBtn, confirmBtn);
          confirmBox.append(msg, reasonInput, wsCheckLabel, cBtns);
          row.appendChild(confirmBox);
        }

        list.appendChild(row);
      }
    }

    async function loadOwnerBanned() {
      if (!ownerStatus.account_owner) {
        ownerBannedUsers = [];
        find('owner-banned-list').replaceChildren();
        const msg = document.createElement('p');
        msg.style.color = 'var(--ink-soft,#9aa8be)';
        msg.textContent = 'Unlock with an Owner Account session or Account Owner Token to manage banned profiles.';
        find('owner-banned-list').appendChild(msg);
        return;
      }
      const q = encodeURIComponent(find<HTMLInputElement>('owner-banned-search').value.trim());
      const res = await api(`/api/owner/users?filter=${encodeURIComponent(bannedSubFilter)}&q=${q}`);
      ownerBannedUsers = res?.users || [];
      if (res?.counts) ownerUserCounts = res.counts;
      renderOwnerBanned();
    }

    async function loadOwnerWorkshop() {
      if (!ownerStatus.registry_configured || !ownerStatus.workshop_owner) {
        ownerSkills = [];
        ownerBannedAuthors = [];
        renderOwnerWorkshop();
        return;
      }
      const q = encodeURIComponent(find<HTMLInputElement>('owner-ws-search').value.trim());
      const res = await api(`/api/owner/workshop/skills?status=${encodeURIComponent(wsModFilter)}&q=${q}`);
      ownerSkills = res?.skills || [];
      ownerWsCounts = res?.counts || {};
      ownerBannedAuthors = res?.banned_authors || [];
      renderOwnerWorkshop();
    }

    async function openOwnerPanel() {
      await refreshOwnerStatus();
      if (!ownerStatus.is_owner && !ownerStatus.unlocked) {
        find('unlock-error').hidden = true;
        find('owner-unlock-modal').hidden = false;
        return;
      }
      find('owner-panel').hidden = false;
      selectOwnerTab(ownerTab);
      await Promise.all([loadOwnerGrants(), loadOwnerUsers(), loadOwnerBanned(), loadOwnerWorkshop()]);
    }

    find('open-owner').onclick = run(openOwnerPanel);
    find('owner-close').onclick = () => { find('owner-panel').hidden = true; };
    find('owner-refresh').onclick = run(async () => {
      await Promise.all([loadOwnerGrants(), loadOwnerUsers(), loadOwnerBanned(), loadOwnerWorkshop()]);
      setOwnerStatusLine('Owner panel refreshed.');
    });
    find('owner-grant-add').onclick = run(async () => {
      const inp = find<HTMLInputElement>('owner-grant-input');
      const target = inp.value.trim();
      if (!target) throw Error('Enter a User ID (PC-XXXX-XXXX) or username first.');
      const res = await api('/api/owner/grants', {
        method: 'POST',
        body: JSON.stringify({ target }),
      });
      inp.value = '';
      const g = res?.grant;
      const who = g?.user_id || g?.username || target;
      setOwnerStatusLine(`Granted Owner Panel access to ${who}.`);
      await Promise.all([loadOwnerGrants(), loadOwnerUsers()]);
    });
    find('owner-uid-clear').onclick = run(async () => {
      activeUserIdFilter = '';
      await loadOwnerUsers();
    });
    const doOwnerLock = run(async () => {
      await api('/api/owner/lock', { method: 'POST', body: JSON.stringify({}) });
      find('owner-panel').hidden = true;
      find('owner-unlock-modal').hidden = true;
      find<HTMLInputElement>('unlock-acct-token').value = '';
      find<HTMLInputElement>('unlock-ws-token').value = '';
      await refreshOwnerStatus();
      status('Owner access locked.');
    });
    find('owner-lock').onclick = doOwnerLock;
    find('unlock-lock').onclick = doOwnerLock;

    find('owner-unlock-btn').onclick = async () => {
      await refreshOwnerStatus();
      find('unlock-error').hidden = true;
      find('owner-unlock-modal').hidden = false;
    };
    find('unlock-close').onclick = () => { find('owner-unlock-modal').hidden = true; };
    find('unlock-submit').onclick = run(async () => {
      const account_token = find<HTMLInputElement>('unlock-acct-token').value.trim();
      const workshop_token = find<HTMLInputElement>('unlock-ws-token').value.trim();
      const errBox = find('unlock-error');
      errBox.hidden = true;
      try {
        await api('/api/owner/unlock', {
          method: 'POST',
          body: JSON.stringify({ account_token, workshop_token }),
        });
        find<HTMLInputElement>('unlock-acct-token').value = '';
        find<HTMLInputElement>('unlock-ws-token').value = '';
        find('owner-unlock-modal').hidden = true;
        await openOwnerPanel();
      } catch (e) {
        errBox.hidden = false;
        errBox.textContent = (e as Error)?.message || 'Owner unlock failed.';
      }
    });

    host.querySelectorAll<HTMLButtonElement>('[data-ws-owner-tab]').forEach(btn => {
      btn.onclick = run(async () => {
        const raw = btn.getAttribute('data-ws-owner-tab');
        const tab = (raw === 'workshop' ? 'workshop' : raw === 'banned' ? 'banned' : 'users') as 'users' | 'banned' | 'workshop';
        selectOwnerTab(tab);
        if (tab === 'users') await loadOwnerUsers();
        else if (tab === 'banned') await loadOwnerBanned();
        else await loadOwnerWorkshop();
      });
    });
    host.querySelectorAll<HTMLButtonElement>('[data-ws-bfilter]').forEach(btn => {
      btn.onclick = run(async () => {
        bannedSubFilter = (btn.getAttribute('data-ws-bfilter') === 'terminated' ? 'terminated' : 'banned') as 'banned' | 'terminated';
        host.querySelectorAll<HTMLButtonElement>('[data-ws-bfilter]').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
        await loadOwnerBanned();
      });
    });
    find('owner-banned-search').addEventListener('input', () => { void loadOwnerBanned(); });
    host.querySelectorAll<HTMLButtonElement>('[data-ws-ufilter]').forEach(btn => {
      btn.onclick = run(async () => {
        userFilter = (btn.getAttribute('data-ws-ufilter') || 'all') as 'all' | 'online' | 'banned';
        host.querySelectorAll<HTMLButtonElement>('[data-ws-ufilter]').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
        await loadOwnerUsers();
      });
    });
    find('owner-user-search').addEventListener('input', () => { void loadOwnerUsers(); });

    host.querySelectorAll<HTMLButtonElement>('[data-ws-wfilter]').forEach(btn => {
      btn.onclick = run(async () => {
        wsModFilter = btn.getAttribute('data-ws-wfilter') || 'pending';
        host.querySelectorAll<HTMLButtonElement>('[data-ws-wfilter]').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
        await loadOwnerWorkshop();
      });
    });
    find('owner-ws-search').addEventListener('input', () => { void loadOwnerWorkshop(); });

    const onKey = (ev: KeyboardEvent) => {
      if ((ev.ctrlKey || ev.metaKey) && ev.shiftKey && (ev.key === 'O' || ev.key === 'o')) {
        if (!host.isConnected || host.hidden) return;
        ev.preventDefault();
        void openOwnerPanel();
      }
    };
    window.addEventListener('keydown', onKey);

    renderCategories();
    return { refresh };
  }

  return { mount };
})();
if (typeof module !== 'undefined') module.exports = PlazCodeWorkshopUI;
