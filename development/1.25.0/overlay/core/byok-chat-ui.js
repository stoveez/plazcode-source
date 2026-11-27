// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Built from development/1.25.0/ts/core/byok-chat-ui.ts (TypeScript): edit that file, then run node development/1.25.0/ts/build.cjs.
const PlazCodeByokChatUI = (() => {
  'use strict';

  ;






  ;











  ;












  ;








  ;









  ;







  ;






  ;










  ;







  ;













  ;








  ;






  ;






  ;




















  ;













  const t = (text, vars) => {
    try {
      const i18n = (globalThis).PlazCodeI18n;
      if (i18n && typeof i18n.t === 'function') return i18n.t(text, vars);
    } catch (_e) {}
    let out = String(text);
    if (vars) {
      for (const k of Object.keys(vars)) {
        out = out.replace(new RegExp('\\{' + k + '\\}', 'g'), String(vars[k]));
      }
    }
    return out;
  };

  const localizeNode = (el) => {
    if (!el) return;
    try {
      const i18n = (globalThis).PlazCodeI18n;
      if (i18n && typeof i18n.mountStatic === 'function') i18n.mountStatic(el);
    } catch (_e) {}
  };

  const esc = (s) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const requestApiLabel = (api) => {
    switch (api) {
      case 'chat_completions': return 'API · Chat';
      case 'responses': return 'API · Responses';
      case 'anthropic': return 'API · Anthropic';
      case 'gemini': return 'API · Gemini';
      default: return 'API · Auto';
    }
  };

  const presetLabel = (p) =>
    p.id === 'custom' ? t('Custom Endpoint') : p.name;

  const parseMultiKeys = (raw) =>
    String(raw || '')
      .split(/[\r\n,]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

  const eyeSvg = (revealed) =>
    revealed
      ? '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.77 21.77 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a21.8 21.8 0 0 1-2.16 3.19M1 1l22 22"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/></svg>'
      : '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';

  const previewTargetUrl = (endpoint, fullUrl, api, presetId, model) => {
    const raw = String(endpoint || '').trim();
    if (!raw) return '';
    if (fullUrl) return raw;
    const base = raw.replace(/\/+$/, '');
    let eff = api;
    if (eff === 'auto') {
      const low = base.toLowerCase();
      if (presetId === 'anthropic' || low.includes('anthropic.com')) eff = 'anthropic';
      else if (presetId === 'gemini' || low.includes('generativelanguage.googleapis.com')) eff = 'gemini';
      else eff = 'chat_completions';
    }
    const ver = /\/(v\d+(?:beta|alpha)?)$/i.test(base);
    if (eff === 'anthropic') return base.toLowerCase().endsWith('/messages') ? base : base + (ver ? '/messages' : '/v1/messages');
    if (eff === 'gemini') {
      const m = (model || 'gemini-2.5-flash').trim().replace(/^models\//, '');
      return /:generateContent$/i.test(base) ? base : base + (ver ? `/models/${m}:generateContent` : `/v1beta/models/${m}:generateContent`);
    }
    if (eff === 'responses') return base.toLowerCase().endsWith('/responses') ? base : base + (ver ? '/responses' : '/v1/responses');
    return base.toLowerCase().endsWith('/chat/completions') ? base : base + (ver ? '/chat/completions' : '/v1/chat/completions');
  };

  const readStorageSet = (key) => {
    try {
      const raw = globalThis.localStorage?.getItem(key);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set();
    } catch {
      return new Set();
    }
  };

  const writeStorageSet = (key, set) => {
    try {
      globalThis.localStorage?.setItem(key, JSON.stringify(Array.from(set)));
    } catch {}
  };

  const formatShortDate = (ms) => {
    if (!ms || !Number.isFinite(ms) || ms <= 0) return '';
    try {
      return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  const CUSTOM_STARTERS = ['qwen2.5-coder:14b', 'llama3.1:8b'];

  function mount(opts) {
    let presets = [];
    let platforms = [];
    let activeModelId = null;
    let chats = [];
    let activeChat = null;
    let chatSearch = '';
    let railTab = 'chats';
    let railFilter = 'active';
    let railCollapsed = false;
    let pinnedChatIds = readStorageSet('pc_byok_pinned_chats');
    let archivedChatIds = readStorageSet('pc_byok_archived_chats');
    let chatMode = 'roblox';
    let askByokModelId = '';
    let planMode = false;
    let effort = 'default';
    let permMode = 'sandbox';
    let attachments = [];
    let stagedSkillFolders = [];
    let drawerOpen = false;
    let drawerTab = 'tools';
    let toolQuery = '';
    let fileQuery = '';
    let workspaceFiles = [];
    let skillsList = [];
    let compactingChat = false;
    let connectionsList = [];
    let mcpCatalog = [];
    let connectionsLoaded = false;
    let connectionsUnavailable = false;
    let pendingAppToggle = {};
    let findOpen = false;
    let findQuery = '';
    let slashOpen = false;
    let activeRunId = null;
    let pendingSend = false;
    let cancelPendingSend = false;
    let stoppingRun = false;
    let pollTickFn = null;
    let toolTickTimer = 0;
    let streamText = '';
    let streamReasoning = '';
    let streamTools = [];
    let streamError = null;
    let streamInfo = '';
    let pollTimer = 0;
    let eventCursor = 0;
    let lastUserPrompt = '';
    let collapsedPlatforms = {};
    let modelsBanner = null;
    let clearFlashTimer = null;
    let clearFlashed = false;
    let modalRoot = null;
    let modalKeyHandler = null;
    let dropdownOpen = false;
    let initialized = false;
    let sbForm = null;

    const fallbackPreset = (id = 'openai') =>
      presets.find((p) => p.id === id) ||
      presets[0] || {
        id: 'openai',
        name: 'OpenAI',
        defaultEndpoint: 'https://api.openai.com',
        defaultRequestApi: 'chat_completions',
        requiresKey: true,
        defaultModels: ['gpt-4o'],
      };

    const makeFormState = (plat, defaultPresetId = 'openai') => {
      const preset = fallbackPreset(plat?.presetId || defaultPresetId);
      const initialModels = plat?.models?.length
        ? plat.models.map((m) => m.name).filter(Boolean)
        : (preset.defaultModels?.length ? [preset.defaultModels[0]] : []);
      const activePlatModel = plat?.models?.find((m) => m.id === activeModelId)?.name || '';
      const firstModel = plat?.models?.[0];
      return {
        platformId: plat?.id,
        presetId: preset.id,
        endpointUrl: plat ? plat.endpointUrl : preset.defaultEndpoint,
        fullUrl: plat ? plat.fullUrl : false,
        apiKeyDraft: '',
        keyRevealed: false,
        modelInputDraft: '',
        addedModels: initialModels,
        selectedModel: activePlatModel || initialModels[0] || '',
        discoveredModels: [],
        visionMode: firstModel?.visionMode || 'auto',
        requestApi: firstModel?.requestApi || (preset.defaultRequestApi) || 'auto',
        savedKeyCount: plat?.apiKeyCount || 0,
        testKind: 'idle',
        testText: t('Not tested'),
        errorText: '',
        discovering: false,
        saving: false,
      };
    };

    const ensureSidebarForm = (forceSync = false) => {
      const active = resolveActiveModel();
      const targetPlat = active?.platform || platforms[0];
      if (!sbForm || forceSync) {
        sbForm = makeFormState(targetPlat, targetPlat?.presetId || 'custom');
      } else if (!sbForm.platformId && targetPlat) {
        sbForm = makeFormState(targetPlat, targetPlat.presetId);
      }
      return sbForm;
    };

    const ensureModalRoot = () => {
      if (modalRoot && modalRoot.isConnected) return modalRoot;
      if (typeof document === 'undefined' || !document.body) return null;
      const div = document.createElement('div');
      div.id = 'byokModalRoot';
      div.className = 'byok-modal-root';
      div.hidden = true;
      document.body.appendChild(div);
      modalRoot = div;
      return modalRoot;
    };

    const enabledModels = () => {
      const list = [];
      for (const p of platforms) {
        if (!p.enabled) continue;
        for (const m of p.models || []) {
          if (m.enabled) list.push({ platform: p, model: m });
        }
      }
      return list;
    };

    const resolveActiveModel = () => {
      const list = enabledModels();
      if (!list.length) return null;
      if (activeModelId) {
        const hit = list.find((x) => x.model.id === activeModelId);
        if (hit) return hit;
      }
      return list[0];
    };

    const studioConnected = () => {
      const st = opts.getState ? opts.getState() || {} : {};
      return st.roblox_connected === true;
    };

    const effectiveChatMode = () =>
      chatMode === 'roblox' && !studioConnected() ? 'local' : chatMode;

    const getConnectedAskModels = () => {
      const out = [];
      for (const p of platforms) {
        if (!p.enabled) continue;
        const preset = presets.find((pr) => pr.id === p.presetId);
        const needsKey = preset ? preset.requiresKey : true;
        if (needsKey && (p.apiKeyCount || 0) <= 0) continue;
        for (const m of p.models || []) {
          if (m.enabled) out.push({ platform: p, model: m });
        }
      }
      return out;
    };

    const renderAskEngineSelectHtml = () => {
      const list = getConnectedAskModels();
      if (!list.length && !askByokModelId) return '';
      const hasSelected = !askByokModelId || list.some((x) => x.model.id === askByokModelId);
      const optionsHtml =
        '<option value=""' + (!askByokModelId ? ' selected' : '') + '>' + esc(t('Browser AI tab')) + '</option>' +
        list.map((x) =>
          '<option value="' + esc(x.model.id) + '"' + (x.model.id === askByokModelId ? ' selected' : '') + '>' +
          esc((x.model.displayName || x.model.name) + ' · ' + x.platform.name) + '</option>'
        ).join('') +
        (!hasSelected
          ? '<option value="' + esc(askByokModelId) + '" selected>' + esc(t('Unavailable API model')) + '</option>'
          : '');
      return '<select class="byok-ask-model-select" data-byok-ask-model aria-label="' + esc(t('Ask PlazCode engine')) + '">' + optionsHtml + '</select>';
    };

    const syncFromState = () => {
      const prefs = opts.getPrefs ? opts.getPrefs() || {} : {};
      if (prefs.rsByokChatMode === 'local' || prefs.rsByokChatMode === 'roblox') chatMode = prefs.rsByokChatMode;
      else if (prefs['rs-engine'] === 'local' || prefs['rs-engine'] === 'roblox') chatMode = prefs['rs-engine'];
      if (typeof prefs.rsPlanMode === 'boolean') planMode = prefs.rsPlanMode;
      if (['default', 'low', 'mid', 'high', 'max'].includes(prefs.rsByokEffort)) effort = prefs.rsByokEffort;
      if (['sandbox', 'ask', 'full'].includes(prefs.rsPermMode)) permMode = prefs.rsPermMode;
      if (typeof prefs.rsByokActiveModel === 'string' && prefs.rsByokActiveModel && !activeModelId) {
        activeModelId = prefs.rsByokActiveModel;
      }
      askByokModelId = typeof prefs.rsAskByokModel === 'string' ? prefs.rsAskByokModel.trim() : '';
    };

    const loadPlatforms = async () => {
      try {
        const res = await opts.api('/api/byok/platforms');
        if (res && Array.isArray(res.presets)) presets = res.presets;
        if (res && Array.isArray(res.platforms)) platforms = res.platforms;
        if (res && typeof res.activeModelId === 'string') activeModelId = res.activeModelId;
      } catch (_e) {}
      ensureSidebarForm(true);
      renderModelsPanel();
      renderChatPage();
    };

    const loadChats = async () => {
      try {
        const res = await opts.api('/api/byok/chats');
        if (res && Array.isArray(res.chats)) chats = res.chats;
      } catch (_e) {}
      renderChatRail();
    };

    const loadSkills = async () => {
      try {
        const res = await opts.api('/api/skills', {
          method: 'POST',
          body: JSON.stringify({ action: 'list' }),
        });
        if (res && Array.isArray(res.skills)) skillsList = res.skills;
      } catch (_e) {
        skillsList = [];
      }
      if (railTab === 'config') renderChatPage();
    };

    const loadChatById = async (id) => {
      try {
        const res = await opts.api('/api/byok/chats?id=' + encodeURIComponent(id));
        if (res && res.chat) {
          const loaded = res.chat;
          activeChat = loaded;
          if (loaded.mode) chatMode = loaded.mode;
          if (loaded.modelId) activeModelId = loaded.modelId;
          if (loaded.mode === 'roblox' && !studioConnected()) {
            streamInfo = t('Roblox Studio is not connected — using AgentScript until Studio connects.');
          }
          renderChatPage();
        }
      } catch (_e) {}
    };

    const CORE_APP_META = [
      { id: 'blender', name: 'Blender', tag: 'BL', blurb: t('3D modeling, materials & scene renders') },
      { id: 'figma', name: 'Figma', tag: 'FG', blurb: t('Read frames, layout & edit designs') },
      { id: 'godot', name: 'Godot', tag: 'GD', blurb: t('Scenes, nodes & GDScript project tools') },
      { id: 'unity', name: 'Unity', tag: 'UN', blurb: t('Editor scenes, C# scripts & assets') },
      { id: 'blockbench', name: 'Blockbench', tag: 'BB', blurb: t('Voxel meshes, textures & animations') },
    ];

    const loadConnections = async (_force = false) => {
      try {
        const [connRes, catRes] = await Promise.all([
          connectionsUnavailable
            ? Promise.resolve(null)
            : opts.api('/api/connections').catch(() => {
                connectionsUnavailable = true;
                return null;
              }),
          opts.api('/api/mcp/catalog').catch(() => null),
        ]);
        if (connRes && Array.isArray(connRes.apps)) connectionsList = connRes.apps;
        if (catRes && Array.isArray(catRes.servers)) mcpCatalog = catRes.servers;
        connectionsLoaded = true;
      } catch (_e) {}
      renderDrawer();
    };

    const getCreativeAppsSummary = () => {
      const st = opts.getState ? opts.getState() || {} : {};
      const byId = {};
      for (const app of connectionsList) {
        if (app && app.id) byId[app.id] = app;
      }
      const servers = {};
      if (Array.isArray(st.servers)) {
        for (const s of st.servers) {
          if (s && s.id) servers[s.id] = s;
        }
      }
      return CORE_APP_META.map((meta) => {
        const rep = byId[meta.id];
        let state = rep?.state || 'not_set_up';
        if (!rep) {
          if (meta.id === 'blender' && st.blender_connected) state = 'ready';
          else if (meta.id === 'figma' && st.figma?.connected) state = 'ready';
          else if (meta.id === 'blockbench' && (st.blockbench?.app?.connected || st.blockbench?.web?.connected)) state = 'ready';
          else if (servers[meta.id]?.alive) state = 'ready';
          else if (mcpCatalog.find((s) => s.id === meta.id && s.enabled)) state = 'needs_attention';
        }
        return {
          id: meta.id,
          name: rep?.name || meta.name,
          tag: meta.tag,
          state,
          line: rep?.line || meta.blurb,
        };
      });
    };

    const loadFiles = async () => {
      try {
        const res = await opts.api('/api/byok/files?q=' + encodeURIComponent(fileQuery));
        if (res && Array.isArray(res.files)) workspaceFiles = res.files;
      } catch (_e) {
        workspaceFiles = [];
      }
      renderDrawer();
    };

    // =========================================================================
    // Markdown / Code Formatting (XSS-safe: always escapes HTML first)
    // =========================================================================
    const normalizeProseSpacing = (raw) => {
      const chunks = String(raw || '').split('`');
      for (let idx = 0; idx < chunks.length; idx += 2) {
        chunks[idx] = chunks[idx]
          .replace(/\r\n/g, '\n')
          .replace(/\n{3,}/g, '\n\n')
          .replace(/(https?:\/\/[^\s<>]+)|([a-z]{3,}[.!?])([A-Z][a-z]{2,})/g, (_m, u, a, b) =>
            u ? u : a + ' ' + b
          );
      }
      return chunks.join('`');
    };

    const formatInlineMd = (raw) =>
      esc(normalizeProseSpacing(raw))
        .replace(/`([^`\n]+)`/g, '<code class="byok-inline-code">$1</code>')
        .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^*\w])\*([^*\n]+?)\*(?=[^*\w]|$)/g, '$1<em>$2</em>');

    const renderProseBlocks = (prose) => {
      const normalized = normalizeProseSpacing(prose).trim();
      if (!normalized) return '';
      const lines = normalized.split('\n');
      let out = '';
      let para = [];
      const flushPara = () => {
        if (!para.length) return;
        out += '<p class="byok-md-p">' + formatInlineMd(para.join('\n')).replace(/\n/g, '<br>') + '</p>';
        para = [];
      };
      let i = 0;
      while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();
        if (!trimmed) {
          flushPara();
          i++;
          continue;
        }
        const hMatch = /^#{1,3}\s+(.+)$/.exec(trimmed);
        if (hMatch) {
          flushPara();
          out += '<h4 class="byok-md-h">' + formatInlineMd(hMatch[1]) + '</h4>';
          i++;
          continue;
        }
        if (/^\s*[-*•]\s+/.test(line)) {
          flushPara();
          const items = [];
          while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) {
            items.push('<li>' + formatInlineMd(lines[i].replace(/^\s*[-*•]\s+/, '')) + '</li>');
            i++;
          }
          out += '<ul class="byok-md-list">' + items.join('') + '</ul>';
          continue;
        }
        if (/^\s*\d+[.)]\s+/.test(line)) {
          flushPara();
          const items = [];
          while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
            items.push('<li>' + formatInlineMd(lines[i].replace(/^\s*\d+[.)]\s+/, '')) + '</li>');
            i++;
          }
          out += '<ol class="byok-md-list">' + items.join('') + '</ol>';
          continue;
        }
        para.push(line);
        i++;
      }
      flushPara();
      return out ? '<div class="byok-prose" data-i18n-user-content dir="auto">' + out + '</div>' : '';
    };

    const renderRichContent = (raw) => {
      const text = String(raw || '');
      const parts = text.split(/```([a-zA-Z0-9_-]*)\r?\n([\s\S]*?)```/g);
      let html = '';
      for (let i = 0; i < parts.length; i += 3) {
        const prose = parts[i] || '';
        if (prose) html += renderProseBlocks(prose);
        if (i + 2 < parts.length) {
          const lang = esc(parts[i + 1] || 'text');
          const code = parts[i + 2] || '';
          html +=
            '<div class="byok-codeblock" data-i18n-user-content dir="ltr">' +
            '<div class="byok-codehead"><span>' + lang + '</span>' +
            '<button type="button" class="softbtn byok-copy-code">' + esc(t('Copy')) + '</button></div>' +
            '<pre><code>' + esc(code) + '</code></pre></div>';
        }
      }
      return html || '<div class="byok-prose" data-i18n-user-content dir="auto"></div>';
    };

    const renderErrorCard = (err) => {
      const retryBadge = err.retryable
        ? '<span class="byok-badge byok-badge-retry" data-pc-i18n>' + esc(t('Retryable')) + '</span>'
        : '';
      const retryBtn = err.retryable
        ? '<button type="button" class="accentbtn byok-retry-btn" data-pc-i18n>' + esc(t('Retry')) + '</button>'
        : '';
      return (
        '<div class="byok-error-card" role="alert">' +
        '<div class="byok-error-head">' +
        '<span class="byok-badge byok-badge-provider" data-pc-i18n>' + esc(t('Model provider')) + '</span>' +
        retryBadge +
        '</div>' +
        '<div class="byok-error-msg" data-i18n-user-content dir="auto">' + esc(err.message) + '</div>' +
        '<div class="byok-error-sug" data-i18n-user-content dir="auto">' + esc(err.suggestion) + '</div>' +
        '<details class="byok-error-tech"><summary data-pc-i18n>' + esc(t('Technical Details')) + '</summary>' +
        '<pre data-i18n-user-content dir="ltr">' + esc(err.technicalDetails || err.code) + '</pre></details>' +
        '<div class="byok-error-actions">' + retryBtn +
        '<button type="button" class="softbtn byok-err-models" data-pc-i18n>' + esc(t('Manage models')) + '</button></div>' +
        '</div>'
      );
    };

    const formatElapsedSec = (ms) => {
      const clamped = Math.max(0, Number.isFinite(ms) ? ms : 0);
      if (clamped < 10000) return (clamped / 1000).toFixed(1) + 's';
      const secs = Math.round(clamped / 1000);
      if (secs < 60) return secs + 's';
      const mins = Math.floor(secs / 60);
      const rem = secs % 60;
      return mins + 'm ' + rem + 's';
    };

    const estimateToolExpectedMs = (tc) => {
      if (tc.name === 'run_command') {
        const asked = Number(tc.args && tc.args.timeout_seconds);
        if (Number.isFinite(asked) && asked > 0) return Math.min(600000, Math.max(5000, asked * 1000));
        return Math.min(tc.budgetMs || 60000, 30000);
      }
      if (/^(read_file|list_directory|script_read|file_info|env_info|workspace_info)$/.test(tc.name)) return 4000;
      if (/^(luau_check|analyze_luau|execute_luau|grep_files|search_files|read_files|read_scripts|screen_capture|screen_record)$/.test(tc.name)) return 15000;
      return Math.min(Math.max(tc.budgetMs ? tc.budgetMs * 0.35 : 10000, 4000), 45000);
    };

    const computeToolProgress = (tc, now) => {
      const running = tc.status === 'running';
      const expected = estimateToolExpectedMs(tc);
      if (running) {
        const elapsedMs = Math.max(0, tc.startedAt ? now - tc.startedAt : 0);
        const pct = Math.min(95, Math.max(3, Math.round(95 * (1 - Math.exp(-(elapsedMs / expected) * 1.5)))));
        return { elapsedMs, pct, running: true, hasTiming: true };
      }
      const hasTiming = typeof tc.durationMs === 'number' || typeof tc.startedAt === 'number';
      const elapsedMs = typeof tc.durationMs === 'number'
        ? Math.max(0, tc.durationMs)
        : (tc.startedAt ? Math.max(0, now - tc.startedAt) : 0);
      const pct = tc.status === 'ok'
        ? 100
        : Math.min(95, Math.max(8, Math.round(95 * (1 - Math.exp(-(elapsedMs / expected) * 1.5)))));
      return { elapsedMs, pct, running: false, hasTiming };
    };

    const syncToolTickTimer = () => {
      const hasRunning = !!activeRunId && streamTools.some((tc) => tc.status === 'running');
      if (!hasRunning) {
        if (toolTickTimer) {
          clearInterval(toolTickTimer);
          toolTickTimer = 0;
        }
        return;
      }
      if (toolTickTimer) return;
      toolTickTimer = setInterval(() => {
        const host = opts.chatHost;
        if (!host || !activeRunId || !streamTools.some((tc) => tc.status === 'running')) {
          clearInterval(toolTickTimer);
          toolTickTimer = 0;
          return;
        }
        const now = Date.now();
        for (const tc of streamTools) {
          if (tc.status !== 'running') continue;
          const p = computeToolProgress(tc, now);
          const safeId = tc.id.replace(/["\\]/g, '\\$&');
          const tEl = host.querySelector(`[data-tool-timer="${safeId}"]`);
          if (tEl) tEl.textContent = formatElapsedSec(p.elapsedMs);
          const pEl = host.querySelector(`[data-tool-pct="${safeId}"]`);
          if (pEl) pEl.textContent = '~' + p.pct + '%';
          const bEl = host.querySelector(`[data-tool-progress="${safeId}"]`);
          if (bEl) bEl.style.width = p.pct + '%';
        }
      }, 200);
    };

    const summarizeToolArgs = (args) => {
      if (!args || typeof args !== 'object') return '';
      const raw = args.command ?? args.cmd ?? args.path ?? args.query ?? args.pattern ?? args.action ?? args.code;
      if (typeof raw !== 'string') return '';
      const clean = raw.replace(/\s+/g, ' ').trim();
      return clean.length > 46 ? clean.slice(0, 45) + '…' : clean;
    };

    const renderReasoningHtml = (rawText, streaming) => {
      const cleaned = normalizeProseSpacing(rawText).trim();
      if (!cleaned) return '';
      const lineCount = cleaned.split('\n').filter((l) => l.trim().length > 0).length;
      const metaText = streaming ? t('Thinking…') : t('{count} lines', { count: lineCount || 1 });
      return (
        '<details class="byok-reasoning"' + (streaming ? ' open' : '') + '>' +
        '<summary><span class="byok-reasoning-chev" aria-hidden="true">▸</span>' +
        '<span class="byok-reasoning-badge" aria-hidden="true">✦</span>' +
        '<span class="byok-reasoning-title" data-pc-i18n>' + esc(t('Reasoning')) + '</span>' +
        '<span class="byok-reasoning-meta">' + esc(metaText) + '</span></summary>' +
        '<div class="byok-reasoning-body" data-i18n-user-content dir="auto">' + esc(cleaned) + '</div>' +
        '</details>'
      );
    };

    const renderToolCard = (tc) => {
      const statusCls = tc.status === 'ok' ? 'ok' : tc.status === 'running' ? 'run' : 'err';
      const argsStr = typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args || {}, null, 2);
      const argHint = summarizeToolArgs(tc.args);
      const prog = computeToolProgress(tc, Date.now());
      const pctLabel = prog.running ? '~' + prog.pct + '%' : prog.pct + '%';
      const pctTitle = t('Estimated progress against command timeout budget');
      return (
        '<details class="byok-tool-card" data-status="' + esc(statusCls) + '">' +
        '<summary><span class="byok-tool-chev" aria-hidden="true">▸</span>' +
        '<span class="byok-tool-dot"></span>' +
        '<span class="byok-tool-name" data-i18n-user-content>' + esc(tc.name) + '</span>' +
        (argHint ? '<span class="byok-tool-arg" data-i18n-user-content dir="ltr">' + esc(argHint) + '</span>' : '') +
        '<span class="byok-tool-spacer"></span>' +
        (prog.hasTiming ? '<span class="byok-tool-timer" data-tool-timer="' + esc(tc.id) + '">' + esc(formatElapsedSec(prog.elapsedMs)) + '</span>' : '') +
        (prog.hasTiming ? '<span class="byok-tool-pct" data-tool-pct="' + esc(tc.id) + '" title="' + esc(pctTitle) + '">' + esc(pctLabel) + '</span>' : '') +
        '<span class="byok-tool-status">' + esc(tc.status) + '</span></summary>' +
        (prog.hasTiming
          ? '<div class="byok-tool-progress" aria-hidden="true"><div class="byok-tool-progress-fill" data-tool-progress="' + esc(tc.id) + '" style="width:' + prog.pct + '%"></div></div>'
          : '') +
        '<div class="byok-tool-body" data-i18n-user-content dir="ltr">' +
        '<div class="byok-tool-sec"><strong>Args</strong><pre>' + esc(argsStr) + '</pre></div>' +
        (tc.output ? '<div class="byok-tool-sec"><strong>Output</strong><pre>' + esc(tc.output) + '</pre></div>' : '') +
        '</div></details>'
      );
    };

    // =========================================================================
    // Shared Model & API Form (used by Add Model Modal AND Sidebar Model & API tab)
    // =========================================================================
    const suggestedModelsFor = (state) => {
      const preset = fallbackPreset(state.presetId);
      const base = state.discoveredModels.length
        ? state.discoveredModels
        : (state.presetId === 'custom'
            ? CUSTOM_STARTERS
            : (preset.defaultModels || []));
      return base.filter((m) => !state.addedModels.includes(m)).slice(0, 10);
    };

    const renderModelListInnerHtml = (state, prefix) => {
      if (!state.addedModels.length) {
        return '<div class="byok-hint" data-pc-i18n>' + esc(t('Add at least one Model ID above or pick a quick suggestion.')) + '</div>';
      }
      return state.addedModels.map((m) => {
        const isSel = (state.selectedModel || state.addedModels[0]) === m;
        return (
          '<div class="byok-id-row' + (isSel ? ' active' : '') + '" data-select-added-model="' + esc(m) + '" tabindex="0">' +
          '<span class="byok-id-name" data-i18n-user-content dir="ltr">' + esc(m) + '</span>' +
          '<button type="button" class="byok-id-rm" data-' + prefix + '-rm-model="' + esc(m) + '" aria-label="' + esc(t('Delete')) + '">×</button>' +
          '</div>'
        );
      }).join('');
    };

    const renderQuickChipsInnerHtml = (state) =>
      suggestedModelsFor(state)
        .map((m) => '<button type="button" class="softbtn byok-chip byok-suggest-chip" data-pick-model="' + esc(m) + '" data-i18n-user-content dir="ltr">+ ' + esc(m) + '</button>')
        .join('');

    const renderModelFormFieldsHtml = (
      state,
      prefix,
      options = {}
    ) => {
      const epPlaceholder = state.presetId === 'custom' ? 'http://127.0.0.1:4000/v1' : (fallbackPreset(state.presetId).defaultEndpoint || 'https://api.openai.com');
      const activePreviewModel = state.modelInputDraft.trim() || state.selectedModel || state.addedModels[0] || '';
      const previewUrl = previewTargetUrl(state.endpointUrl, state.fullUrl, state.requestApi, state.presetId, activePreviewModel);
      const savedNote = state.savedKeyCount > 0
        ? '<span class="byok-saved-keys-badge">' + esc(t('{count} saved', { count: state.savedKeyCount })) + '</span>'
        : '';
      const chipsHtml = renderQuickChipsInnerHtml(state);
      return (
        '<div class="byok-form-grid' + (options.compact ? ' is-compact' : '') + '">' +
        '<div class="byok-field">' +
        '<label class="byok-eyebrow-label" for="byok-' + prefix + '-preset" data-pc-i18n>' + esc(t('PROVIDER')) + '</label>' +
        '<select id="byok-' + prefix + '-preset" data-' + prefix + '-preset' + (options.lockPreset ? ' disabled' : '') + '>' +
        presets.map((p) => '<option value="' + esc(p.id) + '"' + (p.id === state.presetId ? ' selected' : '') + '>' + esc(presetLabel(p)) + '</option>').join('') +
        '</select></div>' +

        '<div class="byok-field">' +
        '<div class="byok-field-row">' +
        '<label class="byok-eyebrow-label" for="byok-' + prefix + '-model-input" data-pc-i18n>' + esc(t('MODEL IDS')) + '</label>' +
        '<button type="button" class="softbtn byok-discover-btn" data-' + prefix + '-discover data-pc-i18n>' + esc(t('Discover')) + '</button>' +
        '</div>' +
        '<input id="byok-' + prefix + '-model-input" type="text" data-' + prefix + '-model-input dir="ltr" value="' + esc(state.modelInputDraft) + '" placeholder="' + esc(t('Add Model ID (e.g. gpt-4o, gemini-2.5-flash)')) + '">' +
        '<button type="button" class="softbtn byok-add-id-btn" data-' + prefix + '-add-model data-pc-i18n>+ ' + esc(t('ADD MODEL ID')) + '</button>' +
        '<div class="byok-discover-chips" data-' + prefix + '-chips' + (chipsHtml ? '' : ' hidden') + '>' + chipsHtml + '</div>' +
        '<div class="byok-id-list" data-' + prefix + '-model-list>' + renderModelListInnerHtml(state, prefix) + '</div>' +
        '</div>' +

        '<div class="byok-field">' +
        '<label class="byok-eyebrow-label" for="byok-' + prefix + '-endpoint" data-pc-i18n>' + esc(t('ENDPOINT URL')) + '</label>' +
        '<input id="byok-' + prefix + '-endpoint" type="text" data-' + prefix + '-endpoint dir="ltr" value="' + esc(state.endpointUrl) + '" placeholder="' + esc(epPlaceholder) + '">' +
        '<small class="byok-url-preview" data-' + prefix + '-url-preview dir="ltr" title="' + esc(previewUrl) + '">' + (previewUrl ? 'POST → ' + esc(previewUrl) : '') + '</small>' +
        '</div>' +

        '<div class="byok-field">' +
        '<div class="byok-field-row">' +
        '<label class="byok-eyebrow-label" for="byok-' + prefix + '-keys" data-pc-i18n>' + esc(t('API KEY')) + '</label>' +
        savedNote +
        '</div>' +
        '<div class="byok-key-wrap">' +
        '<input id="byok-' + prefix + '-keys" type="' + (state.keyRevealed ? 'text' : 'password') + '" autocomplete="off" data-' + prefix + '-keys dir="ltr" value="' + esc(state.apiKeyDraft) + '" placeholder="' + esc(state.savedKeyCount > 0 ? t('Enter new key to add or leave blank') : 'sk-...') + '">' +
        '<button type="button" class="byok-key-toggle" data-' + prefix + '-key-toggle aria-label="' + esc(t('Toggle API key visibility')) + '" aria-pressed="' + (state.keyRevealed ? 'true' : 'false') + '">' + eyeSvg(state.keyRevealed) + '</button>' +
        '</div></div>' +

        '<div class="byok-test-row">' +
        '<button type="button" class="softbtn byok-test-btn" data-' + prefix + '-test data-pc-i18n>' + esc(t('TEST API CONNECTION')) + '</button>' +
        '<span class="byok-test-status" data-' + prefix + '-test-status data-state="' + esc(state.testKind) + '" data-i18n-user-content>' + esc(state.testText) + '</span>' +
        '</div>' +

        '<details class="byok-advanced">' +
        '<summary data-pc-i18n>' + esc(t('Advanced')) + '</summary>' +
        '<div class="byok-advanced-body">' +
        '<label class="byok-inline-toggle"><input type="checkbox" data-' + prefix + '-fullurl' + (state.fullUrl ? ' checked' : '') + '> <span data-pc-i18n>' + esc(t('Full URL')) + '</span></label>' +
        '<div class="byok-two-col">' +
        '<label class="byok-field"><span data-pc-i18n>' + esc(t('Vision input')) + '</span><select data-' + prefix + '-vision>' +
        '<option value="auto"' + (state.visionMode === 'auto' ? ' selected' : '') + '>Auto</option>' +
        '<option value="enabled"' + (state.visionMode === 'enabled' ? ' selected' : '') + '>Enabled</option>' +
        '<option value="disabled"' + (state.visionMode === 'disabled' ? ' selected' : '') + '>Disabled</option>' +
        '</select></label>' +
        '<label class="byok-field"><span data-pc-i18n>' + esc(t('OpenAI request API')) + '</span><select data-' + prefix + '-api>' +
        '<option value="auto"' + (state.requestApi === 'auto' ? ' selected' : '') + '>Auto</option>' +
        '<option value="chat_completions"' + (state.requestApi === 'chat_completions' ? ' selected' : '') + '>Chat Completions (/chat/completions)</option>' +
        '<option value="responses"' + (state.requestApi === 'responses' ? ' selected' : '') + '>Responses (/responses)</option>' +
        '<option value="anthropic"' + (state.requestApi === 'anthropic' ? ' selected' : '') + '>Anthropic (/messages)</option>' +
        '<option value="gemini"' + (state.requestApi === 'gemini' ? ' selected' : '') + '>Gemini (:generateContent)</option>' +
        '</select></label>' +
        '</div></div></details>' +
        '</div>'
      );
    };

    const bindModelFormControls = (
      container,
      state,
      prefix,
      onSaved
    ) => {
      const q = (attr) =>
        container.querySelector(`[data-${prefix}-${attr}]`);

      const presetSel = q('preset');
      const modelInput = q('model-input');
      const addBtn = q('add-model');
      const chipsEl = q('chips');
      const listEl = q('model-list');
      const epInput = q('endpoint');
      const fuCheck = q('fullurl');
      const keysInput = q('keys');
      const keyToggle = q('key-toggle');
      const previewEl = q('url-preview');
      const testBtn = q('test');
      const testStatusEl = q('test-status');
      const discBtn = q('discover');
      const visionSel = q('vision');
      const apiSel = q('api');
      const errEl = q('err');
      const saveBtn = q('save');

      const showErr = (msg) => {
        state.errorText = msg;
        if (errEl) {
          errEl.hidden = !msg;
          errEl.textContent = msg;
        }
      };

      const setTestStatus = (kind, text) => {
        state.testKind = kind;
        state.testText = text;
        if (testStatusEl) {
          testStatusEl.setAttribute('data-state', kind);
          testStatusEl.textContent = text;
          testStatusEl.title = text;
        }
      };

      const updateUrlPreview = () => {
        const activeModel = (modelInput?.value || '').trim() || state.selectedModel || state.addedModels[0] || '';
        const u = previewTargetUrl(state.endpointUrl, state.fullUrl, state.requestApi, state.presetId, activeModel);
        if (previewEl) {
          previewEl.textContent = u ? 'POST → ' + u : '';
          previewEl.title = u || '';
        }
      };

      const refreshChipsAndList = () => {
        if (listEl) {
          listEl.innerHTML = renderModelListInnerHtml(state, prefix);
          bindListAndChips();
        }
        if (chipsEl) {
          const chHtml = renderQuickChipsInnerHtml(state);
          chipsEl.innerHTML = chHtml;
          chipsEl.hidden = !chHtml;
          bindListAndChips();
        }
        updateUrlPreview();
      };

      const addModelId = (rawId) => {
        const id = String(rawId || '').trim();
        if (!id) return false;
        if (!state.addedModels.includes(id)) {
          state.addedModels.push(id);
        }
        state.selectedModel = id;
        showErr('');
        return true;
      };

      const bindListAndChips = () => {
        chipsEl?.querySelectorAll('[data-pick-model]').forEach((b) => {
          (b).onclick = () => {
            const pick = b.getAttribute('data-pick-model') || '';
            if (addModelId(pick)) {
              if (modelInput && modelInput.value.trim() === pick) {
                modelInput.value = '';
                state.modelInputDraft = '';
              }
              refreshChipsAndList();
            }
          };
        });
        listEl?.querySelectorAll('[data-select-added-model]').forEach((row) => {
          (row).onclick = (ev) => {
            if ((ev.target)?.closest(`[data-${prefix}-rm-model]`)) return;
            state.selectedModel = row.getAttribute('data-select-added-model') || '';
            refreshChipsAndList();
          };
        });
        listEl?.querySelectorAll(`[data-${prefix}-rm-model]`).forEach((btn) => {
          (btn).onclick = (ev) => {
            ev.stopPropagation();
            const rm = btn.getAttribute(`data-${prefix}-rm-model`) || '';
            state.addedModels = state.addedModels.filter((m) => m !== rm);
            if (state.selectedModel === rm) {
              state.selectedModel = state.addedModels[0] || '';
            }
            refreshChipsAndList();
          };
        });
      };
      bindListAndChips();
      updateUrlPreview();

      if (presetSel) {
        presetSel.onchange = () => {
          state.presetId = presetSel.value;
          const p = fallbackPreset(state.presetId);
          state.endpointUrl = p.defaultEndpoint || '';
          state.fullUrl = false;
          state.discoveredModels = [];
          state.requestApi = (p.defaultRequestApi) || 'auto';
          state.addedModels = p.defaultModels?.length ? [p.defaultModels[0]] : [];
          state.selectedModel = state.addedModels[0] || '';
          if (epInput) {
            epInput.value = state.endpointUrl;
            epInput.placeholder = state.presetId === 'custom' ? 'http://127.0.0.1:4000/v1' : (p.defaultEndpoint || 'https://api.openai.com');
          }
          if (fuCheck) fuCheck.checked = false;
          if (apiSel) apiSel.value = state.requestApi;
          setTestStatus('idle', t('Not tested'));
          showErr('');
          refreshChipsAndList();
        };
      }

      if (modelInput) {
        modelInput.oninput = () => {
          state.modelInputDraft = modelInput.value;
          updateUrlPreview();
        };
        modelInput.onkeydown = (ev) => {
          if (ev.key === 'Enter') {
            ev.preventDefault();
            if (addModelId(modelInput.value)) {
              modelInput.value = '';
              state.modelInputDraft = '';
              refreshChipsAndList();
            }
          }
        };
      }

      if (addBtn) {
        addBtn.onclick = () => {
          const val = modelInput?.value || state.modelInputDraft;
          if (addModelId(val)) {
            if (modelInput) modelInput.value = '';
            state.modelInputDraft = '';
            refreshChipsAndList();
            modelInput?.focus();
          } else {
            showErr(t('Enter a Model ID first.'));
          }
        };
      }

      if (epInput) {
        epInput.oninput = () => {
          state.endpointUrl = epInput.value;
          updateUrlPreview();
        };
      }

      if (keysInput) {
        keysInput.oninput = () => {
          state.apiKeyDraft = keysInput.value;
        };
      }

      if (keyToggle && keysInput) {
        keyToggle.onclick = () => {
          state.keyRevealed = !state.keyRevealed;
          keysInput.type = state.keyRevealed ? 'text' : 'password';
          keyToggle.setAttribute('aria-pressed', state.keyRevealed ? 'true' : 'false');
          keyToggle.innerHTML = eyeSvg(state.keyRevealed);
        };
      }

      if (fuCheck) {
        fuCheck.onchange = () => {
          state.fullUrl = fuCheck.checked;
          updateUrlPreview();
        };
      }
      if (visionSel) {
        visionSel.onchange = () => {
          state.visionMode = (visionSel.value) || 'auto';
        };
      }
      if (apiSel) {
        apiSel.onchange = () => {
          state.requestApi = (apiSel.value) || 'auto';
          updateUrlPreview();
        };
      }

      if (discBtn) {
        discBtn.onclick = async () => {
          discBtn.disabled = true;
          state.discovering = true;
          showErr('');
          try {
            const res = await opts.api('/api/byok/models/discover', {
              method: 'POST',
              body: JSON.stringify({
                platformId: state.platformId,
                presetId: state.presetId,
                endpointUrl: state.endpointUrl.trim(),
                fullUrl: state.fullUrl,
                apiKeys: parseMultiKeys(state.apiKeyDraft),
                requestApi: state.requestApi,
              }),
            });
            if (res && res.ok && Array.isArray(res.models)) {
              state.discoveredModels = res.models;
              if (!state.addedModels.length && !state.modelInputDraft.trim() && res.models[0]) {
                addModelId(res.models[0]);
              }
              refreshChipsAndList();
            } else {
              showErr(res?.error?.message || t('Could not discover models.'));
            }
          } catch (e) {
            showErr(e?.message || t('Discovery failed.'));
          } finally {
            state.discovering = false;
            discBtn.disabled = false;
          }
        };
      }

      if (testBtn) {
        testBtn.onclick = async () => {
          const testModel = (modelInput?.value || state.modelInputDraft).trim() || state.selectedModel || state.addedModels[0] || '';
          if (!testModel) {
            setTestStatus('err', t('Add a Model ID first'));
            return;
          }
          if (!state.endpointUrl.trim()) {
            setTestStatus('err', t('Enter an Endpoint URL first'));
            return;
          }
          testBtn.disabled = true;
          showErr('');
          setTestStatus('testing', t('Testing…'));
          try {
            const res = await opts.api('/api/byok/models/health', {
              method: 'POST',
              body: JSON.stringify({
                platformId: state.platformId,
                presetId: state.presetId,
                endpointUrl: state.endpointUrl.trim(),
                fullUrl: state.fullUrl,
                apiKeys: parseMultiKeys(state.apiKeyDraft),
                modelName: testModel,
                requestApi: state.requestApi,
                visionMode: state.visionMode,
              }),
            });
            if (res && res.ok) {
              setTestStatus('ok', res.health?.message || t('Connected'));
            } else {
              setTestStatus('err', res?.error?.message || res?.health?.message || t('Connection failed'));
            }
          } catch (e) {
            setTestStatus('err', e?.message || t('Connection failed'));
          } finally {
            testBtn.disabled = false;
          }
        };
      }

      if (saveBtn) {
        saveBtn.onclick = async () => {
          const uncommitted = (modelInput?.value || state.modelInputDraft).trim();
          if (uncommitted) {
            addModelId(uncommitted);
            if (modelInput) modelInput.value = '';
            state.modelInputDraft = '';
            refreshChipsAndList();
          }
          if (!state.addedModels.length) {
            showErr(t('Add at least one Model ID.'));
            return;
          }
          saveBtn.disabled = true;
          state.saving = true;
          showErr('');
          try {
            const modelPayloads = state.addedModels.map((name) => ({
              name,
              visionMode: state.visionMode,
              requestApi: state.requestApi,
              enabled: true,
            }));
            await opts.api('/api/byok/platforms', {
              method: 'POST',
              body: JSON.stringify({
                id: state.platformId,
                presetId: state.presetId,
                endpointUrl: state.endpointUrl.trim(),
                fullUrl: state.fullUrl,
                apiKeys: parseMultiKeys(state.apiKeyDraft),
                models: modelPayloads,
                model: modelPayloads[0],
              }),
            });
            state.apiKeyDraft = '';
            await onSaved();
          } catch (e) {
            showErr(e?.message || t('Save failed.'));
          } finally {
            state.saving = false;
            saveBtn.disabled = false;
          }
        };
      }
    };

    // =========================================================================
    // Modals (#byokModalRoot)
    // =========================================================================
    const closeModal = () => {
      if (modalKeyHandler && typeof document !== 'undefined') {
        document.removeEventListener('keydown', modalKeyHandler);
        modalKeyHandler = null;
      }
      if (!modalRoot) return;
      modalRoot.hidden = true;
      modalRoot.innerHTML = '';
    };

    const openModal = (innerHtml, onBind, cardClass = '') => {
      const root = ensureModalRoot();
      if (!root) return;
      if (modalKeyHandler && typeof document !== 'undefined') {
        document.removeEventListener('keydown', modalKeyHandler);
        modalKeyHandler = null;
      }
      root.innerHTML =
        '<div class="byok-modal-backdrop">' +
        '<div class="byok-modal settingcard' + (cardClass ? ' ' + cardClass : '') + '" role="dialog" aria-modal="true">' +
        innerHtml +
        '</div></div>';
      root.hidden = false;
      const backdrop = root.querySelector('.byok-modal-backdrop');
      if (backdrop) {
        backdrop.addEventListener('click', (ev) => {
          if (ev.target === backdrop) closeModal();
        });
      }
      if (typeof document !== 'undefined') {
        modalKeyHandler = (ev) => {
          if (ev.key === 'Escape' && modalRoot && !modalRoot.hidden) {
            ev.preventDefault();
            closeModal();
          }
        };
        document.addEventListener('keydown', modalKeyHandler);
      }
      localizeNode(root);
      onBind(root);
    };

    const openAddModelModal = (preselectPlatform) => {
      const state = makeFormState(preselectPlatform, preselectPlatform?.presetId || 'openai');
      openModal(
        '<div class="byok-modal-head">' +
        '<h3 data-pc-i18n>' + esc(t('Add Model')) + '</h3>' +
        '<button type="button" class="softbtn byok-modal-close" data-modal-close>×</button>' +
        '</div>' +
        renderModelFormFieldsHtml(state, 'am', { lockPreset: !!preselectPlatform }) +
        '<div class="byok-modal-err" data-am-err hidden></div>' +
        '<div class="byok-modal-foot">' +
        '<button type="button" class="softbtn" data-modal-close data-pc-i18n>' + esc(t('Cancel')) + '</button>' +
        '<button type="button" class="accentbtn" data-am-save data-pc-i18n>' + esc(t('Save')) + '</button>' +
        '</div>',
        (root) => {
          root.querySelectorAll('[data-modal-close]').forEach((b) => {
            (b).onclick = closeModal;
          });
          bindModelFormControls(root, state, 'am', async () => {
            closeModal();
            await loadPlatforms();
            const sec = opts.modelsHost?.closest('details.settings-section');
            if (sec && !sec.open) sec.open = true;
          });
        },
        'byok-modal-add'
      );
    };

    const openEditPlatformModal = (plat) => {
      openModal(
        '<div class="byok-modal-head"><h3 data-pc-i18n>' + esc(t('Edit Platform & API Keys')) + '</h3><button type="button" class="softbtn byok-modal-close" data-modal-close>×</button></div>' +
        '<div class="byok-form-grid">' +
        '<label class="byok-field"><span data-pc-i18n>' + esc(t('Platform Name')) + '</span><input type="text" data-ep-name value="' + esc(plat.name) + '"></label>' +
        '<label class="byok-field"><div class="byok-field-row"><span data-pc-i18n>' + esc(t('API Endpoint')) + '</span>' +
        '<label class="byok-inline-toggle"><input type="checkbox" data-ep-fullurl' + (plat.fullUrl ? ' checked' : '') + '> <span data-pc-i18n>' + esc(t('Full URL')) + '</span></label></div>' +
        '<input type="text" data-ep-url dir="ltr" value="' + esc(plat.endpointUrl) + '"></label>' +
        '<div class="byok-field"><span data-pc-i18n>' + esc(t('API Keys (Auto-rotates on 429)')) + '</span>' +
        '<div class="byok-key-list">' +
        (plat.apiKeyPreviews.length
          ? plat.apiKeyPreviews.map((pv, i) =>
              '<div class="byok-key-row"><span>#' + (i + 1) + '</span><code dir="ltr">' + esc(pv) + '</code>' +
              '<button type="button" class="dangerbtn byok-rm-key" data-rm-key="' + i + '">×</button></div>'
            ).join('')
          : '<div class="byok-hint">' + esc(t('No API keys saved yet.')) + '</div>') +
        '</div>' +
        '<textarea rows="2" data-ep-add-keys dir="ltr" placeholder="' + esc(t('Add new key(s), one per line or comma-separated')) + '"></textarea></div>' +
        '</div>' +
        '<div class="byok-modal-foot"><button type="button" class="softbtn" data-modal-close data-pc-i18n>' + esc(t('Cancel')) + '</button>' +
        '<button type="button" class="accentbtn" data-ep-save data-pc-i18n>' + esc(t('Save')) + '</button></div>',
        (root) => {
          root.querySelectorAll('[data-modal-close]').forEach((b) => { (b).onclick = closeModal; });
          root.querySelectorAll('[data-rm-key]').forEach((b) => {
            (b).onclick = async () => {
              const idx = Number(b.getAttribute('data-rm-key'));
              await opts.api('/api/byok/platforms', {
                method: 'PUT',
                body: JSON.stringify({ id: plat.id, removeKeyIndex: idx }),
              });
              await loadPlatforms();
              const updated = platforms.find((p) => p.id === plat.id);
              if (updated) openEditPlatformModal(updated);
              else closeModal();
            };
          });
          const saveBtn = root.querySelector('[data-ep-save]');
          if (saveBtn) {
            saveBtn.onclick = async () => {
              const name = (root.querySelector('[data-ep-name]'))?.value.trim();
              const endpointUrl = (root.querySelector('[data-ep-url]'))?.value.trim();
              const fullUrl = (root.querySelector('[data-ep-fullurl]'))?.checked || false;
              const addKeys = parseMultiKeys((root.querySelector('[data-ep-add-keys]'))?.value || '');
              await opts.api('/api/byok/platforms', {
                method: 'PUT',
                body: JSON.stringify({ id: plat.id, name, endpointUrl, fullUrl, addKeys }),
              });
              closeModal();
              await loadPlatforms();
            };
          }
        }
      );
    };

    const openConfigModelModal = (plat, m) => {
      openModal(
        '<div class="byok-modal-head"><h3 data-pc-i18n>' + esc(t('Configure Model')) + '</h3><button type="button" class="softbtn byok-modal-close" data-modal-close>×</button></div>' +
        '<div class="byok-form-grid">' +
        '<label class="byok-field"><span data-pc-i18n>' + esc(t('Model Name')) + '</span><input type="text" data-cm-name dir="ltr" value="' + esc(m.name) + '"></label>' +
        '<label class="byok-field"><div class="byok-field-row"><span data-pc-i18n>' + esc(t('API Endpoint Override (optional)')) + '</span>' +
        '<label class="byok-inline-toggle"><input type="checkbox" data-cm-fullurl' + ((m.fullUrl ?? plat.fullUrl) ? ' checked' : '') + '> <span data-pc-i18n>' + esc(t('Full URL')) + '</span></label></div>' +
        '<input type="text" data-cm-ep dir="ltr" value="' + esc(m.endpointUrl || '') + '" placeholder="' + esc(plat.endpointUrl) + '"></label>' +
        '<div class="byok-two-col">' +
        '<label class="byok-field"><span data-pc-i18n>' + esc(t('Vision input')) + '</span><select data-cm-vision>' +
        ['auto', 'enabled', 'disabled'].map((v) => '<option value="' + v + '"' + (m.visionMode === v ? ' selected' : '') + '>' + v + '</option>').join('') +
        '</select></label>' +
        '<label class="byok-field"><span data-pc-i18n>' + esc(t('OpenAI request API')) + '</span><select data-cm-api>' +
        ['auto', 'chat_completions', 'responses', 'anthropic', 'gemini'].map((v) => '<option value="' + v + '"' + (m.requestApi === v ? ' selected' : '') + '>' + v + '</option>').join('') +
        '</select></label>' +
        '</div></div>' +
        '<div class="byok-modal-foot"><button type="button" class="softbtn" data-modal-close data-pc-i18n>' + esc(t('Cancel')) + '</button>' +
        '<button type="button" class="accentbtn" data-cm-save data-pc-i18n>' + esc(t('Save')) + '</button></div>',
        (root) => {
          root.querySelectorAll('[data-modal-close]').forEach((b) => { (b).onclick = closeModal; });
          const saveBtn = root.querySelector('[data-cm-save]');
          if (saveBtn) {
            saveBtn.onclick = async () => {
              const name = (root.querySelector('[data-cm-name]'))?.value.trim() || m.name;
              const ep = (root.querySelector('[data-cm-ep]'))?.value.trim() || '';
              const fu = (root.querySelector('[data-cm-fullurl]'))?.checked || false;
              const visionMode = (root.querySelector('[data-cm-vision]'))?.value || 'auto';
              const requestApi = (root.querySelector('[data-cm-api]'))?.value || 'auto';
              await opts.api('/api/byok/platforms', {
                method: 'PUT',
                body: JSON.stringify({
                  id: plat.id,
                  model: { id: m.id, name, endpointUrl: ep, fullUrl: fu, visionMode, requestApi, enabled: m.enabled },
                }),
              });
              closeModal();
              await loadPlatforms();
            };
          }
        }
      );
    };

    const openDeleteConfirm = (title, onConfirm) => {
      openModal(
        '<div class="byok-modal-head"><h3 data-pc-i18n>' + esc(t('Confirm Delete')) + '</h3><button type="button" class="softbtn byok-modal-close" data-modal-close>×</button></div>' +
        '<p class="byok-confirm-text" data-i18n-user-content>' + esc(title) + '</p>' +
        '<div class="byok-modal-foot"><button type="button" class="softbtn" data-modal-close data-pc-i18n>' + esc(t('Cancel')) + '</button>' +
        '<button type="button" class="dangerbtn" data-del-ok data-pc-i18n>' + esc(t('Delete')) + '</button></div>',
        (root) => {
          root.querySelectorAll('[data-modal-close]').forEach((b) => { (b).onclick = closeModal; });
          const ok = root.querySelector('[data-del-ok]');
          if (ok) ok.onclick = async () => { ok.disabled = true; await onConfirm(); closeModal(); };
        }
      );
    };

    // =========================================================================
    // Chat Page Rendering (#page-chat)
    // =========================================================================
    const renderModelSelectorHtml = (compact = true) => {
      const active = resolveActiveModel();
      const label = active ? (active.model.displayName || active.model.name) : t('Select a model');
      const platTag = active ? active.platform.name : '';
      const all = enabledModels();
      let itemsHtml = '';
      if (!all.length) {
        itemsHtml = '<div class="byok-dd-empty" data-pc-i18n>' + esc(t('No enabled models yet.')) + '</div>';
      } else {
        itemsHtml = all.map(({ platform, model }) => {
          const isSel = active && active.model.id === model.id;
          const h = model.healthStatus?.status || 'unknown';
          return (
            '<button type="button" class="byok-dd-item' + (isSel ? ' active' : '') + '" data-select-model="' + esc(model.id) + '">' +
            '<span class="byok-health-dot" data-health="' + esc(h) + '"></span>' +
            '<span class="byok-dd-name" data-i18n-user-content>' + esc(model.displayName || model.name) + '</span>' +
            '<span class="byok-dd-plat" data-i18n-user-content>' + esc(platform.name) + '</span>' +
            '</button>'
          );
        }).join('');
      }
      return (
        '<div class="byok-model-dd' + (compact ? ' is-topbar' : '') + '">' +
        '<button type="button" class="softbtn byok-model-trigger" aria-expanded="' + (dropdownOpen ? 'true' : 'false') + '" title="' + esc(platTag ? `${label} · ${platTag}` : label) + '">' +
        '<span class="byok-health-dot" data-health="' + esc(active?.model.healthStatus?.status || 'unknown') + '"></span>' +
        '<span class="byok-model-trigger-name" data-i18n-user-content>' + esc(label) + '</span>' +
        (!compact && platTag ? '<span class="byok-model-trigger-plat" data-i18n-user-content>' + esc(platTag) + '</span>' : '') +
        '<span class="byok-caret">▾</span></button>' +
        '<div class="byok-dd-menu"' + (dropdownOpen ? '' : ' hidden') + '>' +
        '<div class="byok-dd-list">' + itemsHtml + '</div>' +
        '<div class="byok-dd-foot">' +
        '<button type="button" class="softbtn byok-manage-models" data-pc-i18n>' + esc(t('Manage models')) + '</button>' +
        '</div></div></div>'
      );
    };

    const renderAttachmentsHtml = () => {
      if (!attachments.length && !stagedSkillFolders.length) return '';
      const chips = [];
      const seenVideos = new Set();
      attachments.forEach((a, idx) => {
        if (a.sourceVideo) {
          if (seenVideos.has(a.sourceVideo)) return;
          seenVideos.add(a.sourceVideo);
          const count = attachments.filter((x) => x.sourceVideo === a.sourceVideo).length;
          chips.push(
            '<span class="byok-att-chip byok-att-video-chip" data-i18n-user-content>🎬 ' +
            esc(a.sourceVideo) + ' · ' + esc(t('{count} frames', { count })) +
            '<button type="button" class="byok-att-rm" data-rm-video="' + esc(a.sourceVideo) + '" aria-label="Remove">×</button></span>'
          );
          return;
        }
        const safeImg =
          a.mimeType.startsWith('image/') &&
          a.dataBase64 &&
          /^(image\/(?:png|jpeg|jpg|webp|gif))$/i.test(a.mimeType) &&
          /^[A-Za-z0-9+/=\r\n]+$/.test(a.dataBase64)
            ? '<img class="byok-att-thumb" src="data:' + esc(a.mimeType) + ';base64,' + esc(a.dataBase64) + '" alt="">'
            : '';
        chips.push(
          '<span class="byok-att-chip" data-i18n-user-content>' +
          safeImg +
          '<span>' + esc(a.name) + '</span>' +
          '<button type="button" class="byok-att-rm" data-rm-att="' + idx + '" aria-label="Remove">×</button></span>'
        );
      });
      for (let i = 0; i < stagedSkillFolders.length; i++) {
        const s = stagedSkillFolders[i];
        const summary = `${s.source} (${s.skillCount} skill${s.skillCount === 1 ? '' : 's'})`;
        chips.push(
          '<span class="byok-att-chip byok-skill-drop-chip" data-i18n-user-content>📁 ' + esc(summary) +
          ' <button type="button" class="softbtn byok-skill-add-now" data-add-skill-folder="' + esc(s.stagedId) + '">Add now</button>' +
          '<button type="button" class="byok-att-rm" data-rm-skill-folder="' + i + '" aria-label="Remove">×</button></span>'
        );
      }
      return '<div class="byok-att-row">' + chips.join('') + '</div>';
    };

    const SLASH_COMMANDS = [
      { cmd: '/tools', desc: t('Toggle live Tools & Context drawer') },
      { cmd: '/apps', desc: t('Connect Blender, Figma, Godot, Unity & Blockbench') },
      { cmd: '/model', desc: t('Open Add Model & API Key panel') },
      { cmd: '/plan', desc: t('Toggle Plan mode before editing') },
      { cmd: '/compact', desc: t('Compact older messages to free context space') },
      { cmd: '/roblox', desc: t('Switch engine to RobloxScript') },
      { cmd: '/agent', desc: t('Switch engine to AgentScript') },
      { cmd: '/export', desc: t('Export this conversation to Markdown') },
      { cmd: '/clear', desc: t('Start a fresh conversation') },
    ];

    const renderComposerHtml = (sticky) => {
      const sending = !!activeRunId || pendingSend;
      const effMode = effectiveChatMode();
      const isLocal = effMode === 'local';
      const studioOn = studioConnected();
      const st = opts.getState ? opts.getState() || {} : {};
      const readyLabel = compactingChat
        ? t('Compacting…')
        : stoppingRun
          ? t('Stopping…')
          : sending
            ? t('Streaming…')
          : isLocal
            ? (st.workspace_ready ? t('Ready · Workspace') : t('Ready · Local'))
            : (studioOn ? t('Ready · Studio On') : t('Ready · Waiting Studio'));
      const slashHtml = slashOpen
        ? '<div class="byok-slash-menu" data-byok-slash-menu>' +
          SLASH_COMMANDS.map((c) =>
            '<button type="button" class="byok-slash-item" data-slash-cmd="' + esc(c.cmd) + '">' +
            '<code>' + esc(c.cmd) + '</code><span>' + esc(c.desc) + '</span></button>'
          ).join('') +
          '</div>'
        : '';
      return (
        '<div class="byok-composer' + (sticky ? ' is-sticky' : '') + '">' +
        slashHtml +
        renderAttachmentsHtml() +
        '<textarea class="byok-input" data-byok-input data-i18n-user-content dir="auto" rows="2" placeholder="' + esc(t('Ask anything, attach files, or type / for quick commands…')) + '"></textarea>' +
        '<div class="byok-composer-bar">' +
        '<div class="byok-composer-left">' +
        '<button type="button" class="byok-pill-btn byok-slash-btn' + (slashOpen ? ' active' : '') + '" data-byok-slash>/ ' + esc(t('Commands')) + '</button>' +
        '<label class="softbtn byok-attach-btn" title="' + esc(t('Attach files, images, or videos')) + '" aria-label="' + esc(t('Attach files, images, or videos')) + '">' +
        '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 3.2v9.6M3.2 8h9.6"/></svg>' +
        '<input type="file" multiple hidden accept="image/*,video/*,.txt,.md,.json,.lua,.luau,.ts,.tsx,.js,.jsx,.rs,.py,.css,.html,.xml,.yaml,.yml,.toml,.csv" data-byok-file></label>' +
        (isLocal
          ? '<select class="byok-pill-sel" data-byok-perm aria-label="Permissions">' +
            '<option value="sandbox"' + (permMode === 'sandbox' ? ' selected' : '') + '>' + esc(t('Access: Sandbox')) + '</option>' +
            '<option value="ask"' + (permMode === 'ask' ? ' selected' : '') + '>' + esc(t('Access: Ask')) + '</option>' +
            '<option value="full"' + (permMode === 'full' ? ' selected' : '') + '>' + esc(t('Access: Full')) + '</option>' +
            '</select>'
          : '') +
        '<button type="button" class="byok-pill-btn' + (planMode ? ' active' : '') + '" data-byok-plan aria-pressed="' + (planMode ? 'true' : 'false') + '" data-pc-i18n>' + esc(t('Plan')) + '</button>' +
        '<select class="byok-pill-sel" data-byok-effort aria-label="Effort">' +
        '<option value="default"' + (effort === 'default' ? ' selected' : '') + '>' + esc(t('Effort: Default')) + '</option>' +
        '<option value="low"' + (effort === 'low' ? ' selected' : '') + '>' + esc(t('Effort: Low')) + '</option>' +
        '<option value="mid"' + (effort === 'mid' ? ' selected' : '') + '>' + esc(t('Effort: Medium')) + '</option>' +
        '<option value="high"' + (effort === 'high' ? ' selected' : '') + '>' + esc(t('Effort: High')) + '</option>' +
        '<option value="max"' + (effort === 'max' ? ' selected' : '') + '>' + esc(t('Effort: Max')) + '</option>' +
        '</select>' +
        '</div>' +
        '<div class="byok-composer-right">' +
        '<span class="byok-composer-status" data-i18n-user-content>' + esc(readyLabel) + '</span>' +
        (sending
          ? '<button type="button" class="dangerbtn byok-stop-btn" data-byok-stop data-pc-i18n' + (stoppingRun ? ' disabled' : '') + '>' + esc(stoppingRun ? t('Stopping…') : t('Stop')) + '</button>'
          : '<button type="button" class="accentbtn byok-send-btn" data-byok-send data-pc-i18n>' + esc(t('Send')) + '</button>') +
        '</div></div></div>'
      );
    };

    const renderChatRail = () => {
      const host = opts.chatHost;
      if (!host || railTab !== 'chats') return;
      const listEl = host.querySelector('[data-byok-rail-list]');
      if (!listEl) return;
      const q = chatSearch.trim().toLowerCase();
      const filtered = chats
        .filter((c) => {
          const isArch = archivedChatIds.has(c.id);
          if (railFilter === 'archived' ? !isArch : isArch) return false;
          return !q || c.title.toLowerCase().includes(q);
        })
        .sort((a, b) => {
          const pa = pinnedChatIds.has(a.id) ? 1 : 0;
          const pb = pinnedChatIds.has(b.id) ? 1 : 0;
          if (pa !== pb) return pb - pa;
          return (b.updatedAt || 0) - (a.updatedAt || 0);
        });
      if (!filtered.length) {
        listEl.innerHTML = '<div class="byok-rail-empty" data-pc-i18n>' + esc(t(railFilter === 'archived' ? 'No archived chats' : 'No conversations yet')) + '</div>';
        return;
      }
      listEl.innerHTML = filtered.map((c) => {
        const isAct = activeChat && activeChat.id === c.id;
        const isPinned = pinnedChatIds.has(c.id);
        const isArchived = archivedChatIds.has(c.id);
        const dStr = formatShortDate(c.updatedAt);
        const msgCount = Number(c.messageCount || 0);
        return (
          '<div class="byok-rail-item' + (isAct ? ' active' : '') + '" data-open-chat="' + esc(c.id) + '" role="button" tabindex="0">' +
          '<div class="byok-rail-item-top">' +
          '<div class="byok-rail-title" data-i18n-user-content dir="auto">' + esc(c.title || 'New Chat') + '</div>' +
          '<div class="byok-rail-actions">' +
          '<button type="button" class="byok-rail-act' + (isPinned ? ' on' : '') + '" data-pin-chat="' + esc(c.id) + '" title="' + esc(t('Pin chat')) + '" aria-label="' + esc(t('Pin chat')) + '">★</button>' +
          '<button type="button" class="byok-rail-act' + (isArchived ? ' on' : '') + '" data-archive-chat="' + esc(c.id) + '" title="' + esc(t(isArchived ? 'Unarchive chat' : 'Archive chat')) + '" aria-label="' + esc(t(isArchived ? 'Unarchive chat' : 'Archive chat')) + '">▣</button>' +
          '<button type="button" class="byok-rail-del" data-del-chat="' + esc(c.id) + '" aria-label="' + esc(t('Delete')) + '">×</button>' +
          '</div></div>' +
          '<div class="byok-rail-meta"><span>' + esc(msgCount) + ' ' + esc(t('msgs')) + ' · ' + esc(c.mode === 'local' ? 'AgentScript' : 'RobloxScript') + '</span>' +
          (dStr ? '<span>' + esc(dStr) + '</span>' : '') +
          '</div></div>'
        );
      }).join('');
    };

    const renderDrawer = () => {
      const host = opts.chatHost;
      if (!host) return;
      const drawer = host.querySelector('[data-byok-drawer]');
      const rail = host.querySelector('.byok-chat-rail');
      if (rail) rail.hidden = drawerOpen;
      host.querySelectorAll('[data-deck-tools]').forEach((b) => b.classList.toggle('active', drawerOpen));
      host.querySelectorAll('[data-rail-tab]').forEach((b) => {
        b.classList.toggle('active', !drawerOpen && b.getAttribute('data-rail-tab') === railTab);
      });
      if (!drawer) return;
      drawer.hidden = !drawerOpen;
      if (!drawerOpen) return;
      const body = drawer.querySelector('[data-byok-drawer-body]');
      if (!body) return;
      drawer.querySelectorAll('[data-drawer-tab]').forEach((b) => {
        b.classList.toggle('active', b.getAttribute('data-drawer-tab') === drawerTab);
      });
      const st = opts.getState ? opts.getState() || {} : {};
      const tel = st.telemetry || {};
      const okCmds = Number(tel.commands_succeeded || 0);
      const errCmds = Number(tel.commands_failed || 0);
      const totCmds = Number(tel.commands_run ?? (okCmds + errCmds));
      const bridgeText = st.bridge_connected ? t('Bridge online') : t('Bridge offline');
      const statsEl = drawer.querySelector('[data-byok-drawer-stats]');
      if (statsEl) {
        statsEl.textContent = `${totCmds} cmds (${okCmds} ok · ${errCmds} err) · ${bridgeText}`;
      }

      if (drawerTab === 'tools') {
        const allTools = Array.isArray(st.tools) ? st.tools : [];
        const q = toolQuery.trim().toLowerCase();
        const filtered = allTools.filter((tool) =>
          !q ||
          String(tool.name || '').toLowerCase().includes(q) ||
          String(tool.description || '').toLowerCase().includes(q)
        );
        const listHtml = filtered.length
          ? '<div class="byok-tool-catalog">' + filtered.map((tool) =>
              '<button type="button" class="byok-tool-catalog-card" data-prefill-tool="' + esc(tool.name) + '">' +
              '<div class="byok-tool-catalog-name" data-i18n-user-content dir="ltr">' + esc(tool.name) + '</div>' +
              (tool.description ? '<div class="byok-tool-catalog-desc" data-i18n-user-content dir="auto">' + esc(tool.description) + '</div>' : '') +
              '</button>'
            ).join('') + '</div>'
          : '<div class="byok-drawer-empty" data-pc-i18n>' + esc(t('No matching tools found')) + '</div>';
        body.innerHTML =
          '<input type="text" class="byok-file-search" data-byok-tool-search value="' + esc(toolQuery) + '" placeholder="' + esc(t('Search tools (e.g. script, luau, read)…')) + '">' +
          '<div class="byok-hint" data-pc-i18n>' + esc(t('Click any tool to prefill a ready command prompt in chat.')) + '</div>' +
          listHtml;
      } else if (drawerTab === 'apps') {
        const apps = getCreativeAppsSummary();
        const extraServers = mcpCatalog.filter((s) => !CORE_APP_META.some((c) => c.id === s.id));
        const appCardsHtml = apps.map((app) => {
          const badgeText = app.state === 'ready'
            ? t('Connected')
            : app.state === 'needs_attention'
              ? t('Needs attention')
              : app.state === 'setting_up'
                ? t('Setting up')
                : t('Not connected');
          const btnLabel = app.state === 'ready' ? t('Manage') : t('Connect');
          return (
            '<div class="byok-app-card" data-state="' + esc(app.state) + '">' +
            '<div class="byok-app-top">' +
            '<span class="byok-app-badge" data-app="' + esc(app.id) + '">' + esc(app.tag) + '</span>' +
            '<div class="byok-app-info"><strong data-i18n-user-content>' + esc(app.name) + '</strong>' +
            '<small data-i18n-user-content>' + esc(app.line) + '</small></div>' +
            '<button type="button" class="' + (app.state === 'ready' ? 'softbtn' : 'accentbtn') + ' byok-app-connect" data-byok-connect-app="' + esc(app.id) + '">' + esc(btnLabel) + '</button>' +
            '</div>' +
            '<div class="byok-app-status"><span class="byok-status-dot ' + (app.state === 'ready' ? 'ok' : 'warn') + '"></span><span>' + esc(badgeText) + '</span></div>' +
            '</div>'
          );
        }).join('');
        const extraHtml = extraServers.length
          ? '<details class="byok-advanced"><summary data-pc-i18n>' + esc(t('More MCP servers')) + ' (' + extraServers.length + ')</summary><div class="byok-mcp-extra-list">' +
            extraServers.map((srv) => {
              const busy = !!pendingAppToggle[srv.id];
              return (
                '<div class="byok-mcp-extra-row">' +
                '<div class="byok-mcp-extra-text"><strong data-i18n-user-content>' + esc(srv.name) + '</strong>' +
                (srv.description ? '<small data-i18n-user-content>' + esc(srv.description) + '</small>' : '') + '</div>' +
                '<button type="button" class="toggle' + (srv.enabled ? ' on' : '') + '" role="switch" aria-checked="' + (srv.enabled ? 'true' : 'false') + '" data-byok-toggle-mcp="' + esc(srv.id) + '"' + (busy ? ' disabled' : '') + '></button>' +
                '</div>'
              );
            }).join('') +
            '</div></details>'
          : '';
        body.innerHTML =
          '<div class="byok-hint" data-pc-i18n>' + esc(t('Connect 3D, design, or game tools once — your API AI can use them directly here.')) + '</div>' +
          '<div class="byok-app-list">' + appCardsHtml + '</div>' +
          extraHtml +
          '<button type="button" class="softbtn byok-open-full-conn" data-byok-open-connections data-pc-i18n>' + esc(t('Open Apps & servers')) + '</button>';
      } else if (drawerTab === 'files') {
        const wsRoot = st.workspace_ready && st.workspace_root ? String(st.workspace_root) : '';
        const wsShort = wsRoot ? (wsRoot.split(/[\\/]/).filter(Boolean).pop() || wsRoot) : t('No workspace folder');
        const list = workspaceFiles.length
          ? workspaceFiles.map((f) => '<button type="button" class="byok-file-item" data-insert-file="' + esc(f) + '" data-i18n-user-content dir="ltr">' + esc(f) + '</button>').join('')
          : '<div class="byok-drawer-empty" data-pc-i18n>' + esc(t('No workspace files found')) + '</div>';
        body.innerHTML =
          '<div class="byok-ws-sub" style="text-align:left;margin:0 0 6px" title="' + esc(wsRoot || wsShort) + '"><span data-pc-i18n>' + esc(t('Workspace folder')) + '</span>: <strong data-i18n-user-content>' + esc(wsShort) + '</strong></div>' +
          '<input type="text" class="byok-file-search" data-byok-file-search value="' + esc(fileQuery) + '" placeholder="' + esc(t('Search workspace files…')) + '">' +
          '<div class="byok-file-list">' + list + '</div>';
      } else {
        const changes = activeChat?.modifiedFiles || [];
        body.innerHTML = changes.length
          ? '<div class="byok-file-list">' + changes.map((ch) =>
              '<div class="byok-change-row"><span class="byok-change-act">' + esc(ch.action) + '</span><span class="byok-change-path" data-i18n-user-content dir="ltr">' + esc(ch.path) + '</span></div>'
            ).join('') + '</div>'
          : '<div class="byok-drawer-empty" data-pc-i18n>' + esc(t('No files modified in this chat yet.')) + '</div>';
      }
      localizeNode(drawer);
    };

    const renderSidebarTabHtml = () => {
      const activeCount = chats.filter((c) => !archivedChatIds.has(c.id)).length;
      const archivedCount = chats.filter((c) => archivedChatIds.has(c.id)).length;
      if (railTab === 'chats') {
        return (
          '<input type="text" class="byok-rail-search" data-byok-rail-search value="' + esc(chatSearch) + '" placeholder="' + esc(t('Filter chats…')) + '">' +
          '<div class="byok-rail-subtabs">' +
          '<button type="button" class="byok-subtab' + (railFilter === 'active' ? ' active' : '') + '" data-rail-filter="active">' + esc(t('Active')) + ' (' + activeCount + ')</button>' +
          '<button type="button" class="byok-subtab' + (railFilter === 'archived' ? ' active' : '') + '" data-rail-filter="archived">' + esc(t('Archived')) + ' (' + archivedCount + ')</button>' +
          '</div>' +
          '<div class="byok-rail-list" data-byok-rail-list></div>'
        );
      }
      const formState = ensureSidebarForm();
      const effMode = effectiveChatMode();
      const studioOn = studioConnected();
      const askSelHtml = renderAskEngineSelectHtml();
      const enabledSkills = skillsList.filter((s) => s && s.enabled !== false).slice(0, 10);
      const skillsHtml = enabledSkills.length
        ? enabledSkills.map((s) => '<span class="byok-skill-chip" data-i18n-user-content>' + esc(s.title || s.name || 'Skill') + '</span>').join('')
        : '<span class="byok-hint" data-pc-i18n>' + esc(t('No enabled skills')) + '</span>';
      return (
        '<div class="byok-rail-config" data-byok-sb-config>' +
        renderModelFormFieldsHtml(formState, 'sb', { compact: true }) +
        '<div class="byok-modal-err" data-sb-err hidden></div>' +
        '<button type="button" class="accentbtn byok-sb-save-btn" data-sb-save data-pc-i18n>' + esc(t('Save Model & API')) + '</button>' +
        '<div class="byok-field">' +
        '<span class="byok-eyebrow-label" data-pc-i18n>' + esc(t('TOOL ENGINE')) + '</span>' +
        '<div class="byok-engine-seg" role="group">' +
        '<button type="button" class="byok-engine-btn' + (effMode === 'roblox' ? ' active' : '') + '" data-byok-mode="roblox"' + (studioOn ? '' : ' disabled aria-disabled="true" title="' + esc(t('Connect Roblox Studio to use RobloxScript')) + '"') + '>RobloxScript</button>' +
        '<button type="button" class="byok-engine-btn' + (effMode === 'local' ? ' active' : '') + '" data-byok-mode="local">AgentScript</button>' +
        '</div></div>' +
        (askSelHtml
          ? '<div class="byok-field"><span class="byok-eyebrow-label" data-pc-i18n>' + esc(t('ASK PLAZCODE ENGINE')) + '</span>' + askSelHtml + '</div>'
          : '') +
        '<div class="byok-field">' +
        '<span class="byok-eyebrow-label" data-pc-i18n>' + esc(t('SKILLS')) + '</span>' +
        '<div class="byok-skill-chips">' + skillsHtml + '</div>' +
        '</div></div>'
      );
    };

    const renderChatPage = () => {
      const host = opts.chatHost;
      if (!host) return;
      const existingInput = host.querySelector('[data-byok-input]');
      const draftVal = existingInput ? existingInput.value : '';

      const st = opts.getState ? opts.getState() || {} : {};
      const effMode = effectiveChatMode();
      const studioOn = studioConnected();
      const allTools = Array.isArray(st.tools) ? st.tools : [];
      const toolCount = allTools.length;
      const wsRoot = st.workspace_ready && st.workspace_root ? String(st.workspace_root) : '';
      const wsShort = wsRoot ? (wsRoot.split(/[\\/]/).filter(Boolean).pop() || wsRoot) : t('No workspace folder');
      const active = resolveActiveModel();
      const activeChatCount = chats.filter((c) => !archivedChatIds.has(c.id)).length;
      const hasMsgs = !!(activeChat && activeChat.messages && activeChat.messages.length > 0) || !!activeRunId || pendingSend;
      const fq = findQuery.trim().toLowerCase();

      const starterCards = effMode === 'local'
        ? [
            { title: t('Map Workspace Structure'), desc: t('Summarize key entry points, config files, and architecture.'), prompt: t('Audit the project structure and summarize key entry points') },
            { title: t('Fix Type & Lint Issues'), desc: t('Find broken imports, type mismatches, and failing checks.'), prompt: t('Find and fix type or lint issues in the workspace') },
            { title: t('Draft a Refactor Plan'), desc: t('Propose safe incremental improvements before editing code.'), prompt: t('Draft a refactor plan before editing any files') },
            { title: t('Review Recent Changes'), desc: t('Inspect git status and diff for potential edge cases.'), prompt: t('Review recent changes in git status and summarize any risks') },
          ]
        : [
            { title: t('Inspect Studio Hierarchy'), desc: t('Search game.Workspace and list major models, services, and scripts.'), prompt: t('Inspect ServerScriptService and check for Luau errors') },
            { title: t('Luau Script Health Check'), desc: t('Run static checks and find broken references across scripts.'), prompt: t('Scan scripts for Luau warnings, missing requires, or errors') },
            { title: t('Build a Gameplay System'), desc: t('Create modular server & client scripts synced into Studio.'), prompt: t('Create a round-based obby checkpoint system in Studio') },
            { title: t('Audit UI Responsiveness'), desc: t('Review StarterGui layouts, constraints, and text scaling.'), prompt: t('Audit the UI layout for responsiveness and scale') },
          ];

      const quickChips = effMode === 'local'
        ? [
            { label: t('Project Overview'), prompt: t('Audit the project structure and summarize key entry points') },
            { label: t('Run Tests'), prompt: t('Run the project tests and report any failures') },
            { label: t('Git Status'), prompt: t('Check git status and summarize uncommitted changes') },
            { label: t('Find Bugs'), prompt: t('Inspect the main entry files for bugs or edge cases') },
          ]
        : [
            { label: t('Inspect Workspace'), prompt: t('Inspect game.Workspace and list top-level models') },
            { label: t('Luau Check'), prompt: t('Check all scripts for Luau syntax or runtime issues') },
            { label: t('Audit UI'), prompt: t('Audit StarterGui responsiveness and layout scale') },
            { label: t('List Tools'), prompt: t('Summarize which Studio tools are ready right now') },
          ];

      let centerBodyHtml = '';
      if (!hasMsgs) {
        const platReady = !!(platforms.some((p) => p.enabled && (p.apiKeyCount > 0 || presets.find((pr) => pr.id === p.presetId)?.requiresKey === false)));
        const modelReady = !!active;
        const envReady = effMode === 'local' ? !!wsRoot : studioOn;
        const envText = effMode === 'local'
          ? (studioOn
              ? (wsRoot ? t('Workspace ready ({folder} · {count} tools live)', { folder: wsShort, count: toolCount }) : t('No workspace folder selected'))
              : t('Roblox Studio not connected — using AgentScript'))
          : (studioOn ? t('Roblox Studio connected ({count} tools live)', { count: toolCount }) : t('Waiting for Roblox Studio ({count} tools available)', { count: toolCount }));
        const engineLabel = effMode === 'local' ? 'AgentScript' : 'RobloxScript';

        centerBodyHtml =
          '<div class="byok-welcome-scroll">' +
          '<div class="byok-welcome-card">' +
          '<div class="byok-hero-split">' +
          '<div class="byok-welcome-head">' +
          '<div class="byok-hero-eyebrow"><span class="byok-status-dot ' + (envReady ? 'ok' : 'warn') + '"></span><span>' + esc(engineLabel) + '</span></div>' +
          '<h1 class="byok-hero-title">PlazCode Direct Chat</h1>' +
          '<p class="byok-hero-sub">' + esc(t("Hi, what's your plan for today?")) + ' ' + esc(t('Run Roblox Studio commands, AgentScript workspace tools, and your saved skills straight from your own API key. Type / for quick commands.')) + '</p>' +
          '</div>' +
          '<div class="byok-checklist-card">' +
          '<div class="byok-checklist-title" data-pc-i18n>' + esc(t('Quick Setup Checklist')) + '</div>' +
          '<button type="button" class="byok-check-row" data-byok-open-config>' +
          '<span class="byok-status-dot ' + (platReady ? 'ok' : 'warn') + '"></span>' +
          '<span>' + esc(platReady ? t('Provider key ready ({name})', { name: active?.platform.name || platforms[0]?.name || 'API' }) : t('No provider key configured yet — click to add')) + '</span>' +
          '</button>' +
          '<button type="button" class="byok-check-row" data-byok-open-config>' +
          '<span class="byok-status-dot ' + (modelReady ? 'ok' : 'warn') + '"></span>' +
          '<span>' + esc(modelReady ? t('Model selected ({name})', { name: active?.model.name || '' }) : t('Select or add a model to start chatting')) + '</span>' +
          '</button>' +
          '<div class="byok-check-row">' +
          '<span class="byok-status-dot ' + (envReady ? 'ok' : 'warn') + '"></span>' +
          '<span>' + esc(envText) + '</span>' +
          '</div>' +
          '<button type="button" class="byok-check-row" data-byok-open-apps>' +
          '<span class="byok-status-dot ' + (getCreativeAppsSummary().some((a) => a.state === 'ready') ? 'ok' : 'warn') + '"></span>' +
          '<span>' + esc(t('Apps & MCP ({count} connected — Blender, Figma, Godot, Unity, Blockbench)', { count: getCreativeAppsSummary().filter((a) => a.state === 'ready').length })) + '</span>' +
          '</button>' +
          '</div></div>' +
          '<div class="byok-starter-grid">' +
          starterCards.map((c, idx) =>
            '<button type="button" class="byok-starter-card" data-byok-starter="' + esc(c.prompt) + '">' +
            '<div class="byok-starter-top"><span class="byok-starter-num">0' + (idx + 1) + '</span><span class="byok-starter-arrow" aria-hidden="true">↗</span></div>' +
            '<strong data-i18n-user-content>' + esc(c.title) + '</strong>' +
            '<small data-i18n-user-content>' + esc(c.desc) + '</small>' +
            '</button>'
          ).join('') +
          '</div></div></div>';
      } else {
        const msgsHtml = (activeChat?.messages || []).map((m) => {
          const isMatch = fq && String(m.content || '').toLowerCase().includes(fq);
          const matchCls = isMatch ? ' is-find-match' : '';
          if (m.role === 'system') {
            const sysKind = m.kind === 'compact' ? 'compact' : 'mode_switch';
            if (sysKind === 'compact') {
              const firstLine = String(m.content || '').split('\n')[0] || t('Compacted earlier conversation');
              return (
                '<details class="byok-system-notice' + matchCls + '" data-kind="compact">' +
                '<summary data-i18n-user-content>' + esc(firstLine) + '</summary>' +
                '<div class="byok-system-body" data-i18n-user-content dir="auto">' + renderRichContent(m.content) + '</div>' +
                '</details>'
              );
            }
            return '<div class="byok-system-notice' + matchCls + '" data-kind="' + esc(sysKind) + '" data-i18n-user-content dir="auto">' + esc(m.content) + '</div>';
          }
          if (m.role === 'user') {
            const atts = (m.attachments || []).map((a) => '<span class="byok-msg-att" data-i18n-user-content>' + esc(a.name) + '</span>').join('');
            return '<div class="byok-msg byok-msg-user' + matchCls + '"><div class="byok-bubble">' + (atts ? '<div class="byok-msg-atts">' + atts + '</div>' : '') + renderRichContent(m.content) + '</div></div>';
          }
          const tools = (m.toolCalls || []).map(renderToolCard).join('');
          const errHtml = m.error ? renderErrorCard(m.error) : '';
          const unverifiedHtml = m.unverifiedClaim
            ? '<div class="byok-unverified-pill" data-pc-i18n>' + esc(t('No tools ran on this turn — verify any claimed checks.')) + '</div>'
            : '';
          return (
            '<div class="byok-msg byok-msg-assistant' + matchCls + '">' +
            (m.modelLabel ? '<div class="byok-msg-model" data-i18n-user-content>' + esc(m.modelLabel) + '</div>' : '') +
            (m.reasoning ? renderReasoningHtml(m.reasoning, false) : '') +
            tools +
            (m.content ? '<div class="byok-bubble">' + renderRichContent(m.content) + '</div>' : '') +
            unverifiedHtml +
            errHtml +
            '</div>'
          );
        }).join('');

        let streamingHtml = '';
        if (activeRunId || pendingSend) {
          streamingHtml =
            '<div class="byok-msg byok-msg-assistant is-streaming">' +
            (streamInfo ? '<div class="byok-stream-info" data-i18n-user-content>' + esc(streamInfo) + '</div>' : '') +
            (streamReasoning ? renderReasoningHtml(streamReasoning, true) : '') +
            streamTools.map(renderToolCard).join('') +
            (streamText ? '<div class="byok-bubble">' + renderRichContent(streamText) + '</div>' : '<div class="byok-thinking" data-pc-i18n>' + esc(t('Thinking…')) + '</div>') +
            (streamError ? renderErrorCard(streamError) : '') +
            '</div>';
        }
        centerBodyHtml = '<div class="byok-messages" data-byok-messages>' + msgsHtml + streamingHtml + '</div>';
      }

      const matchCount = fq
        ? (activeChat?.messages || []).filter((m) => String(m.content || '').toLowerCase().includes(fq)).length
        : 0;
      const findBarHtml = findOpen
        ? '<div class="byok-find-bar" data-byok-find-bar>' +
          '<input type="text" class="byok-find-input" data-byok-find-input value="' + esc(findQuery) + '" placeholder="' + esc(t('Find in conversation…')) + '">' +
          '<span class="byok-find-count">' + esc(fq ? `${matchCount}` : '') + '</span>' +
          '<button type="button" class="softbtn byok-tb-btn" data-byok-find-close>×</button>' +
          '</div>'
        : '';

      const quickStripHtml = !hasMsgs
        ? '<div class="byok-quick-chips">' +
          quickChips.map((q) => '<button type="button" class="softbtn byok-quick-chip" data-byok-starter="' + esc(q.prompt) + '">' + esc(q.label) + '</button>').join('') +
          '</div>'
        : '';

      const wsNote = effMode === 'local'
        ? '<div class="byok-ws-sub" title="' + esc(wsRoot || wsShort) + '"><span data-pc-i18n>' + esc(t('Workspace folder')) + '</span>: <span data-i18n-user-content>' + esc(wsShort) + '</span></div>'
        : '';

      const footerSummary = active
        ? `${active.platform.name} · ${active.model.displayName || active.model.name}`
        : t('No model configured');

      host.innerHTML =
        '<div class="byok-chat-shell' + (railCollapsed ? ' is-rail-collapsed' : '') + '">' +
        '<div class="byok-chat-stage">' +
        '<header class="byok-stage-topbar">' +
        '<div class="byok-stage-top-left">' +
        '<span class="byok-status-dot ' + (active ? 'ok' : 'warn') + '"></span>' +
        '<div class="byok-chat-title" data-i18n-user-content dir="auto" title="' + esc(activeChat?.title || t('New Chat')) + '">' + esc(activeChat?.title || t('New Chat')) + '</div>' +
        '<div class="byok-mode-switch compact" role="group">' +
        '<button type="button" class="byok-mode-pill' + (effMode === 'roblox' ? ' active' : '') + '" data-byok-mode="roblox"' + (studioOn ? '' : ' disabled aria-disabled="true" title="' + esc(t('Connect Roblox Studio to use RobloxScript')) + '"') + '>RobloxScript</button>' +
        '<button type="button" class="byok-mode-pill' + (effMode === 'local' ? ' active' : '') + '" data-byok-mode="local">AgentScript</button>' +
        '</div>' +
        renderModelSelectorHtml(true) +
        '</div>' +
        '<div class="byok-topbar-actions">' +
        '<button type="button" class="softbtn byok-apps-pill' + (drawerOpen && !railCollapsed && drawerTab === 'apps' ? ' active' : '') + '" data-byok-open-apps title="' + esc(t('Connect Blender, Figma, Godot, Unity & Blockbench')) + '">' +
        '<span class="byok-status-dot ' + (getCreativeAppsSummary().some((a) => a.state === 'ready') ? 'ok' : 'warn') + '"></span>' +
        '<span>' + esc(t('Apps')) + ' · ' + getCreativeAppsSummary().filter((a) => a.state === 'ready').length + '</span>' +
        '</button>' +
        '<button type="button" class="byok-tools-pill' + (drawerOpen && !railCollapsed && drawerTab !== 'apps' ? ' active' : '') + '" data-byok-toggle-drawer title="' + esc(t('Toggle Tools & Context')) + '">' +
        '<span class="byok-status-dot ' + (effMode === 'local' ? (wsRoot ? 'ok' : 'warn') : (studioOn ? 'ok' : 'warn')) + '"></span>' +
        '<span>' + toolCount + ' ' + esc(t('tools')) + '</span>' +
        '</button>' +
        '<button type="button" class="softbtn byok-tb-btn' + (findOpen ? ' active' : '') + '" data-byok-find>' + esc(t('FIND')) + '</button>' +
        '<button type="button" class="softbtn byok-tb-btn" data-byok-export>' + esc(t('EXPORT')) + '</button>' +
        '<button type="button" class="softbtn byok-tb-btn" data-byok-clear>' + esc(t('CLEAR')) + '</button>' +
        '<button type="button" class="softbtn byok-tb-btn byok-rail-toggle-btn' + (!railCollapsed ? ' active' : '') + '" data-byok-toggle-rail title="' + esc(t('Toggle sidebar')) + '" aria-label="' + esc(t('Toggle sidebar')) + '">☰</button>' +
        '</div></header>' +
        findBarHtml +
        centerBodyHtml +
        '<div class="byok-stage-foot">' +
        renderComposerHtml(hasMsgs) +
        quickStripHtml +
        wsNote +
        '</div></div>' +

        '<section class="byok-studio-deck"' + (railCollapsed ? ' hidden' : '') + '>' +
        '<div class="byok-deck-head">' +
        '<span class="byok-eyebrow-label" data-pc-i18n>' + esc(t('WORKSPACE')) + '</span>' +
        '<button type="button" class="accentbtn byok-new-chat" data-byok-new-chat data-pc-i18n>+ ' + esc(t('NEW CHAT')) + '</button>' +
        '</div>' +
        '<div class="byok-rail-tabs" role="tablist">' +
        '<button type="button" role="tab" class="byok-rail-tab' + (!drawerOpen && railTab === 'chats' ? ' active' : '') + '" data-rail-tab="chats" aria-selected="' + (!drawerOpen && railTab === 'chats' ? 'true' : 'false') + '">' + esc(t('Chats')) + ' <span class="byok-tab-count">' + activeChatCount + '</span></button>' +
        '<button type="button" role="tab" class="byok-rail-tab' + (!drawerOpen && railTab === 'config' ? ' active' : '') + '" data-rail-tab="config" aria-selected="' + (!drawerOpen && railTab === 'config' ? 'true' : 'false') + '">' + esc(t('Model & API')) + '</button>' +
        '<button type="button" role="tab" class="byok-rail-tab' + (drawerOpen ? ' active' : '') + '" data-deck-tools aria-selected="' + (drawerOpen ? 'true' : 'false') + '">' + esc(t('Tools')) + '</button>' +
        '</div>' +

        '<aside class="byok-chat-rail"' + (drawerOpen ? ' hidden' : '') + '>' +
        '<div class="byok-rail-body">' + renderSidebarTabHtml() + '</div>' +
        '<div class="byok-rail-footer">' +
        '<span class="byok-health-dot" data-health="' + esc(active?.model.healthStatus?.status || 'unknown') + '"></span>' +
        '<span class="byok-rail-footer-name" data-i18n-user-content title="' + esc(footerSummary) + '">' + esc(footerSummary) + '</span>' +
        '<button type="button" class="softbtn byok-config-btn" data-byok-open-config>CONFIG</button>' +
        '</div>' +
        '</aside>' +

        '<aside class="byok-drawer" data-byok-drawer' + (drawerOpen ? '' : ' hidden') + '>' +
        '<div class="byok-drawer-head">' +
        '<span class="byok-eyebrow-label" data-pc-i18n>' + esc(t('TOOLS & CONTEXT')) + '</span>' +
        '<button type="button" class="softbtn byok-tb-btn" data-byok-toggle-drawer aria-label="' + esc(t('Close')) + '">×</button>' +
        '</div>' +
        '<div class="byok-drawer-stats" data-byok-drawer-stats data-i18n-user-content></div>' +
        '<div class="byok-drawer-tabs">' +
        '<button type="button" class="softbtn" data-drawer-tab="tools" data-pc-i18n>' + esc(t('Tools')) + '</button>' +
        '<button type="button" class="softbtn" data-drawer-tab="apps" data-pc-i18n>' + esc(t('Apps')) + '</button>' +
        '<button type="button" class="softbtn" data-drawer-tab="files" data-pc-i18n>' + esc(t('Files')) + '</button>' +
        '<button type="button" class="softbtn" data-drawer-tab="changes" data-pc-i18n>' + esc(t('Changes')) + '</button>' +
        '</div>' +
        '<div class="byok-drawer-body" data-byok-drawer-body></div>' +
        '</aside>' +
        '</section></div>';

      if (draftVal) {
        const nextInput = host.querySelector('[data-byok-input]');
        if (nextInput) nextInput.value = draftVal;
      }
      if (railTab === 'config') {
        const sbWrap = host.querySelector('[data-byok-sb-config]');
        if (sbWrap && sbForm) {
          bindModelFormControls(sbWrap, sbForm, 'sb', async () => {
            await loadPlatforms();
          });
        }
      } else {
        renderChatRail();
      }
      renderDrawer();
      const msgBox = host.querySelector('[data-byok-messages]');
      if (msgBox) {
        const firstMatch = fq ? msgBox.querySelector('.is-find-match') : null;
        if (firstMatch) firstMatch.scrollIntoView({ block: 'center' });
        else msgBox.scrollTop = msgBox.scrollHeight;
      }
      syncToolTickTimer();
      localizeNode(host);
    };

    const switchChatMode = (nextMode) => {
      if (nextMode === 'roblox' && !studioConnected()) {
        streamInfo = t('Connect Roblox Studio to use RobloxScript mode.');
        renderChatPage();
        return;
      }
      const prevMode = effectiveChatMode();
      chatMode = nextMode;
      opts.patchPref('rsByokChatMode', chatMode);
      const nextLabel = nextMode === 'local' ? 'AgentScript' : 'RobloxScript';
      if (prevMode !== nextMode) {
        streamInfo = t('Switched to {mode} — your connected AI will be notified automatically.', { mode: nextLabel });
        if (activeChat && !activeChat.id.startsWith('pending_') && !activeRunId && !pendingSend) {
          opts.api('/api/byok/chat/mode', {
            method: 'POST',
            body: JSON.stringify({ chatId: activeChat.id, mode: nextMode }),
          }).then((res) => {
            if (res && res.chat) {
              activeChat = res.chat;
            }
            renderChatPage();
          }).catch(() => {});
        }
      }
      renderChatPage();
    };

    const runCompactChat = async () => {
      if (activeRunId || pendingSend || compactingChat) return;
      if (!activeChat || activeChat.id.startsWith('pending_') || (activeChat.messages || []).length < 3) {
        streamInfo = t('Not enough messages to compact yet.');
        renderChatPage();
        return;
      }
      compactingChat = true;
      streamInfo = t('Compacting older conversation context…');
      renderChatPage();
      try {
        const res = await opts.api('/api/byok/chat/compact', {
          method: 'POST',
          body: JSON.stringify({
            chatId: activeChat.id,
            modelId: resolveActiveModel()?.model.id,
          }),
        });
        if (res && res.ok && res.chat) {
          activeChat = res.chat;
          streamInfo = t('Compacted {before} messages into a summary ({saved} chars freed).', {
            before: Number(res.beforeCount || 0),
            saved: Number(res.savedChars || 0),
          });
          loadChats();
        } else {
          streamInfo = res?.error || t('Could not compact conversation.');
        }
      } catch (e) {
        streamInfo = e?.message || t('Could not compact conversation.');
      } finally {
        compactingChat = false;
        renderChatPage();
      }
    };

    const extractVideoFramesFallback = async (file) => {
      if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
        return [{
          name: file.name || 'video.mp4',
          mimeType: 'text/plain',
          textPreview: `[Attached video: ${file.name || 'video'} (${Math.max(1, Math.round((file.size || 0) / 1024))} KB)]`,
          sourceVideo: file.name || 'video',
        }];
      }
      const video = document.createElement('video');
      const url = URL.createObjectURL(file);
      try {
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';
        await new Promise((resolve, reject) => {
          const tmr = setTimeout(() => reject(new Error('timeout')), 10000);
          video.onloadeddata = () => { clearTimeout(tmr); resolve(); };
          video.onerror = () => { clearTimeout(tmr); reject(new Error('decode')); };
          video.src = url;
        });
        const w = video.videoWidth || 640;
        const h = video.videoHeight || 360;
        const ratio = Math.min(1, 1280 / Math.max(w, h));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(w * ratio));
        canvas.height = Math.max(1, Math.round(h * ratio));
        const ctx = canvas.getContext('2d');
        const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
        const count = Math.min(6, Math.max(2, Math.ceil(dur)));
        const out = [];
        for (let i = 0; i < count; i++) {
          const ts = count === 1 ? 0 : (dur - 0.05) * (i / (count - 1));
          if (Math.abs(video.currentTime - ts) > 0.02) {
            await new Promise((resolve) => {
              const tmr = setTimeout(resolve, 2500);
              video.onseeked = () => { clearTimeout(tmr); resolve(); };
              video.currentTime = ts;
            });
          }
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
            const b64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : '';
            if (b64) {
              out.push({
                name: `${file.name} - frame ${i + 1} at ${ts.toFixed(1)}s.jpg`,
                mimeType: 'image/jpeg',
                dataBase64: b64,
                sourceVideo: file.name,
              });
            }
          }
        }
        if (out.length) return out;
      } catch (_e) {
      } finally {
        try { video.pause(); video.removeAttribute('src'); video.load(); } catch {}
        try { URL.revokeObjectURL(url); } catch {}
      }
      return [{
        name: file.name || 'video.mp4',
        mimeType: 'text/plain',
        textPreview: `[Attached video: ${file.name || 'video'} (${Math.max(1, Math.round((file.size || 0) / 1024))} KB)]`,
        sourceVideo: file.name || 'video',
      }];
    };

    const normalizeAttachedFile = (raw, idx) => {
      if (raw.name && raw.name.trim() && raw.name !== 'image.png') return raw;
      const ext = raw.type?.startsWith('video/') ? (raw.type.split('/')[1] || 'mp4') : (raw.type?.split('/')[1] || 'png');
      const prefix = raw.type?.startsWith('video/') ? 'pasted-video' : 'screenshot';
      try {
        return new File([raw], `${prefix}-${Date.now()}-${idx}.${ext}`, { type: raw.type || 'image/png' });
      } catch {
        return raw;
      }
    };

    const attachInputFiles = async (rawFiles) => {
      const files = rawFiles.filter(Boolean).map(normalizeAttachedFile);
      if (!files.length) return;
      const mediaFiles = [];
      const textFiles = [];
      for (const f of files) {
        const mime = (f.type || '').toLowerCase();
        const nameLower = (f.name || '').toLowerCase();
        if (
          mime.startsWith('image/') ||
          mime.startsWith('video/') ||
          /\.(png|jpe?g|webp|gif|bmp|mp4|mov|webm|mkv|avi|m4v)$/.test(nameLower)
        ) {
          mediaFiles.push(f);
        } else {
          textFiles.push(f);
        }
      }

      const mediaHelper = (globalThis).PlazCodeMedia;
      if (mediaFiles.length) {
        for (const mf of mediaFiles) {
          const isVideo = (mf.type || '').startsWith('video/') || /\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(mf.name || '');
          try {
            if (mediaHelper && typeof mediaHelper.prepare === 'function') {
              const prep = await mediaHelper.prepare([mf], {
                nativeVideo: false,
                frames: true,
                convert: (file, vid) =>
                  opts.api('/api/media/convert?video=' + (vid ? 'true' : 'false'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/octet-stream' },
                    body: file,
                  }),
              });
              const items = Array.isArray(prep?.files) ? prep.files : [];
              for (const item of items) {
                if (item && item.data) {
                  attachments.push({
                    name: String(item.name || mf.name),
                    mimeType: String(item.mimeType || 'image/jpeg'),
                    dataBase64: String(item.data),
                    ...(isVideo ? { sourceVideo: mf.name } : {}),
                  });
                }
              }
              if (prep?.notice) streamInfo = String(prep.notice);
              renderChatPage();
              continue;
            }
          } catch (err) {
            streamInfo = String(err?.message || err || '');
          }
          if (isVideo) {
            const frames = await extractVideoFramesFallback(mf);
            attachments.push(...frames);
            renderChatPage();
          } else {
            await new Promise((resolve) => {
              const reader = new FileReader();
              reader.onload = () => {
                const res = String(reader.result || '');
                const b64 = res.includes(',') ? res.split(',')[1] : res;
                attachments.push({
                  name: mf.name,
                  mimeType: mf.type || 'image/png',
                  dataBase64: b64,
                });
                resolve();
              };
              reader.onerror = () => resolve();
              reader.readAsDataURL(mf);
            });
            renderChatPage();
          }
        }
      }

      for (const tf of textFiles) {
        await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            attachments.push({
              name: tf.name,
              mimeType: tf.type || 'text/plain',
              textPreview: String(reader.result || '').slice(0, 12000),
            });
            resolve();
          };
          reader.onerror = () => resolve();
          reader.readAsText(tf);
        });
        renderChatPage();
      }
    };

    const runSlashAction = (cmd) => {
      slashOpen = false;
      const c = cmd.trim().toLowerCase();
      if (c === '/clear') {
        activeChat = null;
        attachments = [];
        stagedSkillFolders = [];
        activeRunId = null;
        renderChatPage();
      } else if (c === '/tools') {
        drawerOpen = !drawerOpen;
        if (drawerOpen) drawerTab = 'tools';
        renderChatPage();
      } else if (c === '/apps') {
        drawerOpen = true;
        railCollapsed = false;
        drawerTab = 'apps';
        loadConnections(true);
        renderChatPage();
      } else if (c === '/model') {
        renderChatPage();
        openAddModelModal();
      } else if (c === '/plan') {
        planMode = !planMode;
        opts.patchPref('rsPlanMode', planMode);
        renderChatPage();
      } else if (c === '/compact') {
        runCompactChat();
      } else if (c === '/roblox') {
        switchChatMode('roblox');
      } else if (c === '/agent') {
        switchChatMode('local');
      } else if (c === '/export') {
        exportActiveChat();
        renderChatPage();
      }
    };

    const exportActiveChat = () => {
      const msgs = activeChat?.messages || [];
      const title = activeChat?.title || 'PlazCode Direct Chat';
      const md = ['# ' + title, ''].concat(
        msgs.map((m) => `## ${m.role === 'user' ? 'User' : (m.modelLabel || 'Assistant')}\n\n${m.content || ''}\n`)
      ).join('\n');
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          navigator.clipboard.writeText(md).catch(() => {});
        }
      } catch {}
      streamInfo = msgs.length
        ? t('Copied conversation Markdown ({count} messages) to clipboard.', { count: msgs.length })
        : t('No messages to export yet.');
    };

    const sendChatMessage = async (textOverride) => {
      const host = opts.chatHost;
      const input = host?.querySelector('[data-byok-input]');
      const text = (textOverride !== undefined ? textOverride : input?.value || '').trim();
      if (!text && !attachments.length && !stagedSkillFolders.length) return;
      if (text.startsWith('/') && SLASH_COMMANDS.some((s) => s.cmd === text.toLowerCase())) {
        if (input) input.value = '';
        runSlashAction(text);
        return;
      }
      if (activeRunId || pendingSend) return;

      lastUserPrompt = text;
      pendingSend = true;
      cancelPendingSend = false;
      stoppingRun = false;
      const sendMode = effectiveChatMode();
      const chosen = resolveActiveModel();
      if (!activeChat) {
        activeChat = {
          id: 'pending_' + Date.now(),
          title: text.slice(0, 48) || 'New Chat',
          mode: sendMode,
          modelId: chosen?.model.id || null,
          messages: [],
          modifiedFiles: [],
        };
      }

      const sendAtts = attachments.slice();
      for (const s of stagedSkillFolders) {
        const titlesText = s.titles.length ? ': ' + s.titles.slice(0, 8).join(', ') : '';
        sendAtts.push({
          name: `Skill folder · ${s.source}`,
          mimeType: 'text/plain',
          textPreview: `[Dropped skill folder: "${s.source}" — ${s.skillCount} skill(s) ready${titlesText} (staged_id: ${s.stagedId})]`,
        });
      }
      if (input) input.value = '';
      slashOpen = false;
      attachments = [];
      stagedSkillFolders = [];
      streamText = '';
      streamReasoning = '';
      streamTools = [];
      streamError = null;
      streamInfo = '';
      eventCursor = 0;

      const payload = {
        chatId: activeChat.id.startsWith('pending_') ? undefined : activeChat.id,
        modelId: chosen?.model.id,
        message: text,
        mode: sendMode,
        attachments: sendAtts,
        planMode,
        effort,
        permMode,
      };

      activeChat.messages.push({
        id: 'local_' + Date.now(),
        role: 'user',
        content: text,
        attachments: sendAtts,
        createdAt: Date.now(),
      });
      renderChatPage();

      try {
        const res = await opts.api('/api/byok/chat/send', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        pendingSend = false;
        if (!res || !res.ok) {
          stoppingRun = false;
          cancelPendingSend = false;
          if (res?.error?.code === 'studio_not_connected') {
            chatMode = 'local';
            opts.patchPref('rsByokChatMode', 'local');
          }
          streamError = res?.error || {
            code: 'send_failed',
            message: res?.error || 'Could not start chat run.',
            retryable: true,
            suggestion: 'Check your selected model and try again.',
            technicalDetails: JSON.stringify(res || {}),
          };
          renderChatPage();
          return;
        }
        activeChat.id = res.chatId;
        if (res.title) activeChat.title = res.title;
        activeRunId = res.runId;
        if (cancelPendingSend) {
          cancelPendingSend = false;
          stoppingRun = true;
          streamInfo = t('Stopping…');
          opts.api('/api/byok/chat/stop', {
            method: 'POST',
            body: JSON.stringify({ runId: res.runId, chatId: res.chatId }),
          }).then(() => { if (pollTickFn) pollTickFn(); }).catch(() => {});
        }
        renderChatPage();
        startEventPolling(res.runId);
        loadChats();
      } catch (e) {
        pendingSend = false;
        stoppingRun = false;
        cancelPendingSend = false;
        activeChat.messages.push({
          id: 'err_' + Date.now(),
          role: 'assistant',
          content: '',
          error: {
            code: 'no_model_configured',
            message: e?.message || 'Failed to send message.',
            retryable: false,
            suggestion: 'Configure an enabled model and API key in Settings > Models.',
            technicalDetails: String(e?.message || e),
          },
          createdAt: Date.now(),
        });
        renderChatPage();
      }
    };

    const startEventPolling = (runId) => {
      if (pollTimer) clearInterval(pollTimer);
      const tick = async () => {
        if (!activeRunId || activeRunId !== runId) {
          clearInterval(pollTimer);
          pollTimer = 0;
          pollTickFn = null;
          return;
        }
        try {
          const res = await opts.api('/api/byok/chat/events/' + encodeURIComponent(runId) + '?after=' + eventCursor);
          const evs = Array.isArray(res?.events) ? res.events : [];
          let dirty = false;
          for (const ev of evs) {
            eventCursor = Math.max(eventCursor, Number(ev.seq || 0) + 1);
            dirty = true;
            if (ev.kind === 'delta') streamText += String(ev.data?.text || '');
            else if (ev.kind === 'reasoning') streamReasoning += String(ev.data?.text || '');
            else if (ev.kind === 'info') streamInfo = String(ev.data?.message || '');
            else if (ev.kind === 'tool_start') {
              streamTools.push({
                id: String(ev.data?.id || ''),
                name: String(ev.data?.name || ''),
                args: ev.data?.args || {},
                status: 'running',
                startedAt: typeof ev.data?.startedAt === 'number' ? ev.data.startedAt : Date.now(),
                budgetMs: typeof ev.data?.budgetMs === 'number' ? ev.data.budgetMs : undefined,
              });
            } else if (ev.kind === 'tool_result') {
              const hit = streamTools.find((tc) => tc.id === ev.data?.id);
              if (hit) {
                hit.status = String(ev.data?.status || 'ok');
                hit.output = String(ev.data?.output || '');
                if (typeof ev.data?.startedAt === 'number') hit.startedAt = ev.data.startedAt;
                if (typeof ev.data?.durationMs === 'number') hit.durationMs = ev.data.durationMs;
                if (typeof ev.data?.budgetMs === 'number') hit.budgetMs = ev.data.budgetMs;
              }
            } else if (ev.kind === 'error') {
              streamError = ev.data;
            }
          }
          if (res?.done) {
            clearInterval(pollTimer);
            pollTimer = 0;
            pollTickFn = null;
            if (toolTickTimer) {
              clearInterval(toolTickTimer);
              toolTickTimer = 0;
            }
            activeRunId = null;
            pendingSend = false;
            cancelPendingSend = false;
            stoppingRun = false;
            if (res.chat) activeChat = res.chat;
            streamText = '';
            streamReasoning = '';
            streamTools = [];
            streamError = null;
            streamInfo = '';
            renderChatPage();
            loadChats();
          } else if (dirty) {
            renderChatPage();
          }
        } catch (_e) {}
      };
      pollTickFn = tick;
      pollTimer = setInterval(tick, 220);
    };

    // =========================================================================
    // Model & API Key Manager (#byokModelsPanel)
    // =========================================================================
    const renderModelsPanel = () => {
      const host = opts.modelsHost;
      if (!host) return;
      const bannerHtml = modelsBanner
        ? '<div class="byok-alert" data-kind="' + esc(modelsBanner.kind) + '"><span data-i18n-user-content>' + esc(modelsBanner.text) + '</span><button type="button" class="byok-alert-close" data-dismiss-banner>×</button></div>'
        : '';
      const platHtml = !platforms.length
        ? '<div class="byok-models-empty" data-pc-i18n>' + esc(t('No model platforms configured yet. Click + Add Model to connect OpenAI, Anthropic, Gemini, Ollama, or any custom endpoint.')) + '</div>'
        : platforms.map((p) => {
            const isOpen = collapsedPlatforms[p.id] !== true;
            const rows = (p.models || []).map((m) => {
              const hs = m.healthStatus || {};
              const st = hs.status || 'unknown';
              const tip = hs.message ? esc(hs.message) : esc(st);
              const showEye = m.visionMode !== 'disabled';
              return (
                '<div class="byok-model-row" data-model-id="' + esc(m.id) + '">' +
                '<span class="byok-health-dot" data-health="' + esc(st) + '" title="' + tip + '"></span>' +
                '<span class="byok-model-name" data-i18n-user-content>' + esc(m.name) + '</span>' +
                (showEye ? '<span class="byok-vision-badge" title="Vision: ' + esc(m.visionMode) + '">👁</span>' : '') +
                '<span class="byok-api-badge">' + esc(requestApiLabel(m.requestApi)) + '</span>' +
                '<div class="byok-model-actions">' +
                '<button type="button" class="toggle' + (m.enabled ? ' on' : '') + '" role="switch" aria-checked="' + (m.enabled ? 'true' : 'false') + '" data-toggle-model="' + esc(p.id) + ':' + esc(m.id) + '"></button>' +
                '<button type="button" class="softbtn byok-icon-btn" title="' + esc(t('Configure')) + '" data-cfg-model="' + esc(p.id) + ':' + esc(m.id) + '">⚙</button>' +
                '<button type="button" class="softbtn byok-icon-btn" title="' + esc(t('Health Check')) + '" data-health-model="' + esc(p.id) + ':' + esc(m.id) + '">♥</button>' +
                '<button type="button" class="dangerbtn byok-icon-btn" title="' + esc(t('Delete')) + '" data-del-model="' + esc(p.id) + ':' + esc(m.id) + '">🗑</button>' +
                '</div></div>'
              );
            }).join('');

            return (
              '<details class="byok-plat-acc" data-plat-acc="' + esc(p.id) + '"' + (isOpen ? ' open' : '') + '>' +
              '<summary class="byok-plat-head">' +
              '<div class="byok-plat-info"><strong data-i18n-user-content>' + esc(p.name) + '</strong>' +
              '<span class="byok-plat-counts">Model (' + (p.models?.length || 0) + ') | API Key (' + (p.apiKeyCount || 0) + ')</span></div>' +
              '<div class="byok-plat-controls">' +
              '<button type="button" class="toggle' + (p.enabled ? ' on' : '') + '" role="switch" aria-checked="' + (p.enabled ? 'true' : 'false') + '" data-toggle-plat="' + esc(p.id) + '"></button>' +
              '<button type="button" class="softbtn byok-icon-btn" title="' + esc(t('Add Model / Key')) + '" data-plat-add="' + esc(p.id) + '">+</button>' +
              '<button type="button" class="softbtn byok-icon-btn" title="' + esc(t('Edit Platform & Keys')) + '" data-plat-edit="' + esc(p.id) + '">✎</button>' +
              '<button type="button" class="dangerbtn byok-icon-btn" title="' + esc(t('Remove Platform')) + '" data-plat-del="' + esc(p.id) + '">−</button>' +
              '</div></summary>' +
              '<div class="byok-plat-body">' + (rows || '<div class="byok-models-empty" data-pc-i18n>' + esc(t('No models in this platform yet.')) + '</div>') + '</div>' +
              '</details>'
            );
          }).join('');

      const actionsHtml =
        '<button type="button" class="softbtn' + (clearFlashed ? ' byok-cleared-flash' : '') + '" data-byok-clear-health data-pc-i18n>' + esc(t('Clear status')) + '</button>' +
        '<button type="button" class="accentbtn" data-byok-add-model data-pc-i18n>+ ' + esc(t('Add Model')) + '</button>';

      const askSelHtml = renderAskEngineSelectHtml();
      const askCardHtml = askSelHtml
        ? '<div class="byok-ask-power-card">' +
          '<div class="byok-ask-power-head"><strong data-pc-i18n>' + esc(t('Ask PlazCode engine')) + '</strong>' +
          '<small data-pc-i18n>' + esc(t('Choose whether the browser Ask PlazCode panel uses your browser AI tab or a connected API model.')) + '</small></div>' +
          askSelHtml +
          '</div>'
        : '';

      if (opts.modelsActionsHost) {
        opts.modelsActionsHost.innerHTML = actionsHtml;
        localizeNode(opts.modelsActionsHost);
        host.innerHTML =
          bannerHtml +
          '<div class="byok-plat-list">' + platHtml + '</div>' +
          askCardHtml;
      } else {
        host.innerHTML =
          '<div class="byok-models-head">' +
          '<div><h3 data-pc-i18n>' + esc(t('Model')) + '</h3><p data-pc-i18n>' + esc(t('Manage AI platforms, multi-key rotation, and model health checks.')) + '</p></div>' +
          '<div class="byok-models-head-actions">' + actionsHtml + '</div></div>' +
          bannerHtml +
          '<div class="byok-plat-list">' + platHtml + '</div>' +
          askCardHtml;
      }

      localizeNode(host);
    };

    // =========================================================================
    // Event Delegation (Chat & Models)
    // =========================================================================
    const bindHostEvents = () => {
      const chatHost = opts.chatHost;
      if (chatHost && !(chatHost)._byokBound) {
        (chatHost)._byokBound = true;
        chatHost.addEventListener('click', (ev) => {
          const target = ev.target;
          if (!target) return;

          if (target.closest('.byok-model-trigger')) {
            dropdownOpen = !dropdownOpen;
            renderChatPage();
            return;
          }
          const pickModel = target.closest('[data-select-model]');
          if (pickModel) {
            const mid = pickModel.getAttribute('data-select-model') || '';
            activeModelId = mid;
            dropdownOpen = false;
            opts.patchPref('rsByokActiveModel', mid);
            opts.api('/api/byok/platforms', { method: 'PUT', body: JSON.stringify({ activeModelId: mid }) }).catch(() => {});
            ensureSidebarForm(true);
            renderChatPage();
            return;
          }
          if (target.closest('.byok-manage-models') || target.closest('.byok-err-models')) {
            dropdownOpen = false;
            opts.navigateToModels();
            return;
          }
          if (target.closest('[data-byok-open-config]')) {
            dropdownOpen = false;
            const active = resolveActiveModel();
            openAddModelModal(active?.platform);
            return;
          }
          if (target.closest('[data-byok-toggle-rail]')) {
            railCollapsed = !railCollapsed;
            if (railCollapsed) drawerOpen = false;
            renderChatPage();
            return;
          }
          const rTabBtn = target.closest('[data-rail-tab]');
          if (rTabBtn) {
            drawerOpen = false;
            railCollapsed = false;
            railTab = rTabBtn.getAttribute('data-rail-tab') === 'config' ? 'config' : 'chats';
            if (railTab === 'config') ensureSidebarForm();
            renderChatPage();
            return;
          }
          if (target.closest('[data-deck-tools]')) {
            drawerOpen = true;
            railCollapsed = false;
            if (drawerTab === 'files') loadFiles();
            else renderChatPage();
            return;
          }
          const rFilterBtn = target.closest('[data-rail-filter]');
          if (rFilterBtn) {
            railFilter = rFilterBtn.getAttribute('data-rail-filter') === 'archived' ? 'archived' : 'active';
            renderChatPage();
            return;
          }
          const pinBtn = target.closest('[data-pin-chat]');
          if (pinBtn) {
            ev.stopPropagation();
            const cid = pinBtn.getAttribute('data-pin-chat') || '';
            if (pinnedChatIds.has(cid)) pinnedChatIds.delete(cid);
            else pinnedChatIds.add(cid);
            writeStorageSet('pc_byok_pinned_chats', pinnedChatIds);
            renderChatRail();
            return;
          }
          const archBtn = target.closest('[data-archive-chat]');
          if (archBtn) {
            ev.stopPropagation();
            const cid = archBtn.getAttribute('data-archive-chat') || '';
            if (archivedChatIds.has(cid)) archivedChatIds.delete(cid);
            else archivedChatIds.add(cid);
            writeStorageSet('pc_byok_archived_chats', archivedChatIds);
            renderChatPage();
            return;
          }
          if (target.closest('[data-byok-new-chat]') || target.closest('[data-byok-clear]')) {
            activeChat = null;
            attachments = [];
            stagedSkillFolders = [];
            activeRunId = null;
            slashOpen = false;
            renderChatPage();
            return;
          }
          if (target.closest('[data-byok-find]') || target.closest('[data-byok-find-close]')) {
            findOpen = target.closest('[data-byok-find-close]') ? false : !findOpen;
            if (!findOpen) findQuery = '';
            renderChatPage();
            if (findOpen) (chatHost.querySelector('[data-byok-find-input]'))?.focus();
            return;
          }
          if (target.closest('[data-byok-export]')) {
            exportActiveChat();
            if (!activeChat && streamInfo) {
              activeChat = { id: 'pending_' + Date.now(), title: 'New Chat', mode: chatMode, modelId: null, messages: [], modifiedFiles: [] };
            }
            renderChatPage();
            return;
          }
          if (target.closest('[data-byok-slash]')) {
            slashOpen = !slashOpen;
            renderChatPage();
            return;
          }
          const slashCmdBtn = target.closest('[data-slash-cmd]');
          if (slashCmdBtn) {
            runSlashAction(slashCmdBtn.getAttribute('data-slash-cmd') || '');
            return;
          }
          const delChatBtn = target.closest('[data-del-chat]');
          if (delChatBtn) {
            ev.stopPropagation();
            const cid = delChatBtn.getAttribute('data-del-chat') || '';
            opts.api('/api/byok/chats/' + encodeURIComponent(cid), { method: 'DELETE' }).then(() => {
              if (activeChat && activeChat.id === cid) activeChat = null;
              loadChats();
              renderChatPage();
            });
            return;
          }
          const openChat = target.closest('[data-open-chat]');
          if (openChat) {
            const cid = openChat.getAttribute('data-open-chat') || '';
            loadChatById(cid);
            return;
          }
          if (target.closest('[data-byok-open-apps]')) {
            drawerOpen = true;
            railCollapsed = false;
            drawerTab = 'apps';
            loadConnections(true);
            renderChatPage();
            return;
          }
          const connAppBtn = target.closest('[data-byok-connect-app]');
          if (connAppBtn) {
            const appId = connAppBtn.getAttribute('data-byok-connect-app') || '';
            if (appId && typeof opts.openConnection === 'function') {
              opts.openConnection(appId);
            } else if (typeof opts.navigateToConnections === 'function') {
              opts.navigateToConnections();
            }
            return;
          }
          if (target.closest('[data-byok-open-connections]')) {
            if (typeof opts.navigateToConnections === 'function') opts.navigateToConnections();
            return;
          }
          const mcpTogBtn = target.closest('[data-byok-toggle-mcp]');
          if (mcpTogBtn) {
            const sid = mcpTogBtn.getAttribute('data-byok-toggle-mcp') || '';
            const srv = mcpCatalog.find((s) => s.id === sid);
            if (sid && srv) {
              pendingAppToggle[sid] = true;
              renderDrawer();
              opts.api('/api/mcp/toggle', {
                method: 'POST',
                body: JSON.stringify({ id: sid, enabled: !srv.enabled }),
              }).finally(() => {
                delete pendingAppToggle[sid];
                loadConnections(true);
              });
            }
            return;
          }
          const modeBtn = target.closest('[data-byok-mode]');
          if (modeBtn) {
            const nextMode = modeBtn.getAttribute('data-byok-mode') === 'local' ? 'local' : 'roblox';
            switchChatMode(nextMode);
            return;
          }
          if (target.closest('[data-byok-plan]')) {
            planMode = !planMode;
            opts.patchPref('rsPlanMode', planMode);
            renderChatPage();
            return;
          }
          const starter = target.closest('[data-byok-starter]');
          if (starter) {
            sendChatMessage(starter.getAttribute('data-byok-starter') || '');
            return;
          }
          const prefillTool = target.closest('[data-prefill-tool]');
          if (prefillTool) {
            const name = prefillTool.getAttribute('data-prefill-tool') || '';
            const inp = chatHost.querySelector('[data-byok-input]');
            if (inp && name) {
              const prefixText = `Use \`${name}\` to `;
              inp.value = inp.value ? inp.value.trimEnd() + '\n' + prefixText : prefixText;
              inp.focus();
            }
            return;
          }
          const addSkillBtn = target.closest('[data-add-skill-folder]');
          if (addSkillBtn) {
            const sid = addSkillBtn.getAttribute('data-add-skill-folder') || '';
            (addSkillBtn).disabled = true;
            opts.api('/api/skills', {
              method: 'POST',
              body: JSON.stringify({ action: 'import_folder', staged_id: sid }),
            }).then((res) => {
              stagedSkillFolders = stagedSkillFolders.filter((s) => s.stagedId !== sid);
              const count = Number(res?.added || 0) + Number(res?.updated || 0);
              streamInfo = `Added ${count || 1} skill(s) from dropped folder — ready for automatic use.`;
              renderChatPage();
            }).catch((err) => {
              streamInfo = String(err?.message || err || 'Could not import skill folder.');
              renderChatPage();
            });
            return;
          }
          const rmSkillBtn = target.closest('[data-rm-skill-folder]');
          if (rmSkillBtn) {
            const idx = Number(rmSkillBtn.getAttribute('data-rm-skill-folder'));
            stagedSkillFolders.splice(idx, 1);
            renderChatPage();
            return;
          }
          const rmVideo = target.closest('[data-rm-video]');
          if (rmVideo) {
            const vname = rmVideo.getAttribute('data-rm-video') || '';
            attachments = attachments.filter((a) => a.sourceVideo !== vname);
            renderChatPage();
            return;
          }
          const rmAtt = target.closest('[data-rm-att]');
          if (rmAtt) {
            const idx = Number(rmAtt.getAttribute('data-rm-att'));
            attachments.splice(idx, 1);
            renderChatPage();
            return;
          }
          if (target.closest('[data-byok-send]')) {
            sendChatMessage();
            return;
          }
          if (target.closest('[data-byok-stop]')) {
            if (pendingSend && !activeRunId) {
              cancelPendingSend = true;
              stoppingRun = true;
              streamInfo = t('Stopping…');
              renderChatPage();
              return;
            }
            if (activeRunId) {
              stoppingRun = true;
              streamInfo = t('Stopping…');
              const rid = activeRunId;
              const cid = activeChat?.id;
              renderChatPage();
              opts.api('/api/byok/chat/stop', {
                method: 'POST',
                body: JSON.stringify({ runId: rid, chatId: cid }),
              }).then(() => { if (pollTickFn) pollTickFn(); }).catch(() => {});
            }
            return;
          }
          if (target.closest('.byok-retry-btn')) {
            const lastUser = [...(activeChat?.messages || [])].reverse().find((m) => m.role === 'user');
            const retryText = lastUser?.content || lastUserPrompt;
            if (retryText) sendChatMessage(retryText);
            return;
          }
          if (target.closest('[data-byok-toggle-drawer]')) {
            drawerOpen = !drawerOpen;
            if (drawerOpen) railCollapsed = false;
            if (drawerOpen && drawerTab === 'files') loadFiles();
            else renderChatPage();
            return;
          }
          const dTab = target.closest('[data-drawer-tab]');
          if (dTab) {
            const nextTab = dTab.getAttribute('data-drawer-tab');
            drawerTab = nextTab === 'changes' ? 'changes' : nextTab === 'files' ? 'files' : nextTab === 'apps' ? 'apps' : 'tools';
            if (drawerTab === 'files') loadFiles();
            else if (drawerTab === 'apps') loadConnections(!connectionsLoaded);
            else renderDrawer();
            return;
          }
          const insFile = target.closest('[data-insert-file]');
          if (insFile) {
            const p = insFile.getAttribute('data-insert-file') || '';
            const inp = chatHost.querySelector('[data-byok-input]');
            if (inp) {
              inp.value = (inp.value ? inp.value + ' ' : '') + '@' + p;
              inp.focus();
            }
            return;
          }
          const copyBtn = target.closest('.byok-copy-code');
          if (copyBtn) {
            const pre = copyBtn.closest('.byok-codeblock')?.querySelector('pre');
            if (pre && navigator.clipboard) {
              navigator.clipboard.writeText(pre.textContent || '').then(() => {
                copyBtn.textContent = t('Copied');
                setTimeout(() => { copyBtn.textContent = t('Copy'); }, 1500);
              }).catch(() => {});
            }
            return;
          }
          if (dropdownOpen && !target.closest('.byok-model-dd')) {
            dropdownOpen = false;
            renderChatPage();
          }
        });

        chatHost.addEventListener('change', (ev) => {
          const target = ev.target;
          if (!target) return;
          if (target.matches('[data-byok-perm]')) {
            permMode = (target).value;
            opts.patchPref('rsPermMode', permMode);
          } else if (target.matches('[data-byok-effort]')) {
            effort = (target).value;
            opts.patchPref('rsByokEffort', effort);
          } else if (target.matches('[data-byok-ask-model]')) {
            askByokModelId = (target).value.trim();
            opts.patchPref('rsAskByokModel', askByokModelId);
            renderModelsPanel();
            renderChatPage();
          } else if (target.matches('[data-byok-file]')) {
            const input = target;
            const files = Array.from(input.files || []);
            if (files.length) attachInputFiles(files);
            input.value = '';
          }
        });

        chatHost.addEventListener('input', (ev) => {
          const target = ev.target;
          if (!target) return;
          if (target.matches('[data-byok-rail-search]')) {
            chatSearch = target.value;
            renderChatRail();
          } else if (target.matches('[data-byok-tool-search]')) {
            toolQuery = target.value;
            const pos = target.selectionStart;
            renderDrawer();
            const again = chatHost.querySelector('[data-byok-tool-search]');
            if (again) {
              again.focus();
              if (pos !== null) try { again.setSelectionRange(pos, pos); } catch {}
            }
          } else if (target.matches('[data-byok-file-search]')) {
            fileQuery = target.value;
            loadFiles();
          } else if (target.matches('[data-byok-find-input]')) {
            findQuery = target.value;
            const pos = target.selectionStart;
            renderChatPage();
            const again = chatHost.querySelector('[data-byok-find-input]');
            if (again) {
              again.focus();
              if (pos !== null) try { again.setSelectionRange(pos, pos); } catch {}
            }
          } else if (target.matches('[data-byok-input]')) {
            const shouldSlash = target.value === '/';
            if (shouldSlash !== slashOpen) {
              slashOpen = shouldSlash;
              const v = target.value;
              const pos = target.selectionStart;
              renderChatPage();
              const again = chatHost.querySelector('[data-byok-input]');
              if (again) {
                again.value = v;
                again.focus();
                if (pos !== null) try { again.setSelectionRange(pos, pos); } catch {}
              }
            }
          }
        });

        chatHost.addEventListener('keydown', (ev) => {
          const target = ev.target;
          if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'f' || ev.key === 'F')) {
            ev.preventDefault();
            findOpen = true;
            renderChatPage();
            (chatHost.querySelector('[data-byok-find-input]'))?.focus();
            return;
          }
          if (ev.key === 'Enter' && !ev.shiftKey && target?.matches('[data-byok-input]')) {
            ev.preventDefault();
            sendChatMessage();
          }
        });

        const hasSkillDrop = (dt) => {
          if (!dt || !Array.from(dt.types || []).includes('Files')) return false;
          const items = Array.from(dt.items || []);
          for (const it of items) {
            try {
              const entry = (it).webkitGetAsEntry?.();
              if (entry && entry.isDirectory) return true;
            } catch {}
          }
          const files = Array.from(dt.files || []);
          return files.some((f) => /\.zip$/i.test(f.name || '') || /^SKILL\.md$/i.test(f.name || ''));
        };

        const readSkillDrop = async (dt) => {
          const skillsUi = (globalThis).PlazCodeSkillsUI;
          if (skillsUi && typeof skillsUi.droppedFiles === 'function' && typeof skillsUi.folderRequest === 'function') {
            const { items, source } = await skillsUi.droppedFiles(dt);
            if (items.length === 1 && /\.zip$/i.test(items[0].file?.name || '')) {
              const bytes = new Uint8Array(await items[0].file.arrayBuffer());
              let bin = '';
              for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.slice(i, i + 8192));
              return { action: 'stage_folder', source: items[0].file.name.replace(/\.zip$/i, ''), zip: btoa(bin) };
            }
            const req = await skillsUi.folderRequest(items, source);
            return { ...req, action: 'stage_folder' };
          }
          const ctx = (globalThis).PlazCodeSkillContext;
          if (ctx && typeof ctx.readDroppedFolder === 'function') {
            return await ctx.readDroppedFolder(dt);
          }
          const entries = Array.from(dt?.items || []).map((it) => it.webkitGetAsEntry?.()).filter(Boolean);
          const collected = [];
          const walk = async (entry, prefix) => {
            const rel = prefix ? prefix + '/' + entry.name : entry.name;
            if (entry.name?.startsWith('.') || entry.name === 'node_modules' || entry.name === '__MACOSX') return;
            if (entry.isFile) {
              const f = await new Promise((resolve, reject) => entry.file(resolve, reject));
              collected.push({ path: rel, file: f });
              return;
            }
            if (!entry.isDirectory) return;
            const reader = entry.createReader();
            for (;;) {
              const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
              if (!batch.length) break;
              for (const child of batch) await walk(child, rel);
            }
          };
          for (const e of entries) await walk(e, '');
          const files = [];
          for (const c of collected) {
            if (c.file.size <= 1024 * 1024) files.push({ path: c.path, text: await c.file.text() });
          }
          return { action: 'stage_folder', source: entries[0]?.name || 'Dropped skills', files };
        };

        chatHost.addEventListener('paste', (ev) => {
          const target = ev.target;
          if (!target || (!target.matches('[data-byok-input]') && !target.closest('.byok-composer'))) return;
          const dt = (ev).clipboardData;
          if (!dt) return;
          const files = [];
          const seen = new Set();
          const pushFile = (f) => {
            if (!f) return;
            const key = `${f.name}|${f.size}|${f.type}`;
            if (seen.has(key)) return;
            seen.add(key);
            files.push(f);
          };
          for (const item of Array.from(dt.items || [])) {
            if (item.kind === 'file') pushFile(item.getAsFile());
          }
          for (const f of Array.from(dt.files || [])) pushFile(f);
          if (!files.length) return;
          ev.preventDefault();
          attachInputFiles(files);
        });

        const hasAnyFileDrop = (dt) =>
          !!dt && (hasSkillDrop(dt) || Array.from(dt.types || []).includes('Files') || (dt.files && dt.files.length > 0));

        let byokDragDepth = 0;
        chatHost.addEventListener('dragenter', (ev) => {
          if (!hasAnyFileDrop(ev.dataTransfer)) return;
          ev.preventDefault();
          byokDragDepth++;
          chatHost.classList.add('byok-skill-dragover');
        });
        chatHost.addEventListener('dragover', (ev) => {
          if (!hasAnyFileDrop(ev.dataTransfer)) return;
          ev.preventDefault();
          if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy';
        });
        chatHost.addEventListener('dragleave', () => {
          byokDragDepth = Math.max(0, byokDragDepth - 1);
          if (!byokDragDepth) chatHost.classList.remove('byok-skill-dragover');
        });
        chatHost.addEventListener('drop', (ev) => {
          if (!hasAnyFileDrop(ev.dataTransfer)) return;
          ev.preventDefault();
          byokDragDepth = 0;
          chatHost.classList.remove('byok-skill-dragover');
          if (!hasSkillDrop(ev.dataTransfer)) {
            const files = Array.from(ev.dataTransfer?.files || []);
            if (files.length) attachInputFiles(files);
            return;
          }
          readSkillDrop(ev.dataTransfer).then(async (stageReq) => {
            const res = await opts.api('/api/skills', { method: 'POST', body: JSON.stringify(stageReq) });
            if (!res || !res.ok || !res.staged_id) throw Error(res?.error || 'Could not read dropped skill folder.');
            const titles = Array.isArray(res.skills) ? res.skills.map((s) => String(s.title || '').trim()).filter(Boolean) : [];
            stagedSkillFolders.push({
              stagedId: String(res.staged_id),
              source: String(res.source || 'Dropped skills'),
              skillCount: Number(res.skill_count || titles.length || 0),
              titles,
            });
            streamInfo = `Skill folder "${res.source}" (${res.skill_count || titles.length} skills) attached — ask AI to add them or click Add now.`;
            renderChatPage();
          }).catch((err) => {
            streamInfo = String(err?.message || err || 'Could not stage dropped skill folder.');
            renderChatPage();
          });
        });
      }

      const handleClearHealth = () => {
        opts.api('/api/byok/health/clear', { method: 'POST', body: '{}' }).then(() => {
          modelsBanner = { kind: 'ok', text: t('Health status cleared.') };
          clearFlashed = true;
          if (clearFlashTimer) clearTimeout(clearFlashTimer);
          clearFlashTimer = setTimeout(() => {
            clearFlashed = false;
            renderModelsPanel();
          }, 1400);
          loadPlatforms();
        });
      };

      const mActionsHost = opts.modelsActionsHost;
      if (mActionsHost && !(mActionsHost)._byokBound) {
        (mActionsHost)._byokBound = true;
        mActionsHost.addEventListener('click', (ev) => {
          const target = ev.target;
          if (!target) return;
          if (target.closest('[data-byok-add-model]')) {
            ev.preventDefault();
            ev.stopPropagation();
            openAddModelModal();
            return;
          }
          if (target.closest('[data-byok-clear-health]')) {
            ev.preventDefault();
            ev.stopPropagation();
            handleClearHealth();
            return;
          }
        });
        const stopSummaryKey = (ev) => {
          const target = ev.target;
          if ((ev.key === ' ' || ev.key === 'Enter') && target?.closest('button')) {
            ev.stopPropagation();
          }
        };
        mActionsHost.addEventListener('keydown', stopSummaryKey);
        mActionsHost.addEventListener('keyup', stopSummaryKey);
      }

      const mHost = opts.modelsHost;
      if (mHost && !(mHost)._byokBound) {
        (mHost)._byokBound = true;
        mHost.addEventListener('click', (ev) => {
          const target = ev.target;
          if (!target) return;
          if (target.closest('[data-dismiss-banner]')) {
            modelsBanner = null;
            renderModelsPanel();
            return;
          }
          if (target.closest('[data-byok-add-model]')) {
            openAddModelModal();
            return;
          }
          if (target.closest('[data-byok-clear-health]')) {
            handleClearHealth();
            return;
          }
          const togPlat = target.closest('[data-toggle-plat]');
          if (togPlat) {
            ev.preventDefault();
            ev.stopPropagation();
            const pid = togPlat.getAttribute('data-toggle-plat') || '';
            const p = platforms.find((x) => x.id === pid);
            if (p) {
              opts.api('/api/byok/platforms', { method: 'PUT', body: JSON.stringify({ id: pid, enabled: !p.enabled }) }).then(loadPlatforms);
            }
            return;
          }
          const platAdd = target.closest('[data-plat-add]');
          if (platAdd) {
            ev.preventDefault();
            ev.stopPropagation();
            const p = platforms.find((x) => x.id === platAdd.getAttribute('data-plat-add'));
            if (p) openAddModelModal(p);
            return;
          }
          const platEdit = target.closest('[data-plat-edit]');
          if (platEdit) {
            ev.preventDefault();
            ev.stopPropagation();
            const p = platforms.find((x) => x.id === platEdit.getAttribute('data-plat-edit'));
            if (p) openEditPlatformModal(p);
            return;
          }
          const platDel = target.closest('[data-plat-del]');
          if (platDel) {
            ev.preventDefault();
            ev.stopPropagation();
            const pid = platDel.getAttribute('data-plat-del') || '';
            const p = platforms.find((x) => x.id === pid);
            openDeleteConfirm(t('Remove platform "{name}" and all its saved API keys?', { name: p?.name || pid }), async () => {
              await opts.api('/api/byok/platforms?platformId=' + encodeURIComponent(pid), { method: 'DELETE' });
              await loadPlatforms();
            });
            return;
          }
          const togMod = target.closest('[data-toggle-model]');
          if (togMod) {
            const [pid, mid] = (togMod.getAttribute('data-toggle-model') || '').split(':');
            const p = platforms.find((x) => x.id === pid);
            const m = p?.models.find((x) => x.id === mid);
            if (p && m) {
              opts.api('/api/byok/platforms', {
                method: 'PUT',
                body: JSON.stringify({ id: pid, model: { id: mid, name: m.name, enabled: !m.enabled } }),
              }).then(loadPlatforms);
            }
            return;
          }
          const cfgMod = target.closest('[data-cfg-model]');
          if (cfgMod) {
            const [pid, mid] = (cfgMod.getAttribute('data-cfg-model') || '').split(':');
            const p = platforms.find((x) => x.id === pid);
            const m = p?.models.find((x) => x.id === mid);
            if (p && m) openConfigModelModal(p, m);
            return;
          }
          const healthMod = target.closest('[data-health-model]');
          if (healthMod) {
            const [pid, mid] = (healthMod.getAttribute('data-health-model') || '').split(':');
            const m = platforms.find((x) => x.id === pid)?.models.find((x) => x.id === mid);
            modelsBanner = { kind: 'ok', text: t('Checking health for {name}…', { name: m?.name || mid }) };
            renderModelsPanel();
            opts.api('/api/byok/models/health', {
              method: 'POST',
              body: JSON.stringify({ platformId: pid, modelId: mid }),
            }).then((res) => {
              if (res && res.ok) {
                modelsBanner = { kind: 'ok', text: (m?.name || mid) + ': ' + (res.health?.message || 'OK') };
              } else {
                modelsBanner = { kind: 'err', text: (m?.name || mid) + ': ' + (res?.error?.message || res?.health?.message || 'Health check failed') };
              }
              loadPlatforms();
            }).catch((e) => {
              modelsBanner = { kind: 'err', text: String(e?.message || e) };
              renderModelsPanel();
            });
            return;
          }
          const delMod = target.closest('[data-del-model]');
          if (delMod) {
            const [pid, mid] = (delMod.getAttribute('data-del-model') || '').split(':');
            const m = platforms.find((x) => x.id === pid)?.models.find((x) => x.id === mid);
            openDeleteConfirm(t('Delete model "{name}"?', { name: m?.name || mid }), async () => {
              await opts.api('/api/byok/platforms?platformId=' + encodeURIComponent(pid) + '&modelId=' + encodeURIComponent(mid), { method: 'DELETE' });
              await loadPlatforms();
            });
            return;
          }
        });

        mHost.addEventListener('change', (ev) => {
          const target = ev.target;
          if (target && target.matches('[data-byok-ask-model]')) {
            askByokModelId = (target).value.trim();
            opts.patchPref('rsAskByokModel', askByokModelId);
            renderModelsPanel();
            renderChatPage();
          }
        });

        mHost.addEventListener('toggle', (ev) => {
          const acc = ev.target;
          if (acc && acc.matches('[data-plat-acc]')) {
            const pid = acc.getAttribute('data-plat-acc') || '';
            collapsedPlatforms[pid] = !acc.open;
          }
        }, true);
      }
    };

    const refresh = async () => {
      syncFromState();
      bindHostEvents();
      const chatVisible = !!(opts.chatHost && (!opts.chatHost.closest('.page') || opts.chatHost.closest('.page.active')));
      await Promise.all([
        loadPlatforms(),
        loadChats(),
        loadSkills(),
        chatVisible ? loadConnections(true) : Promise.resolve(),
      ]);
    };

    if (!initialized) {
      initialized = true;
      syncFromState();
      bindHostEvents();
      renderModelsPanel();
      renderChatPage();
      try {
        const i18n = (globalThis).PlazCodeI18n;
        if (i18n && typeof i18n.onChange === 'function') {
          i18n.onChange(() => {
            renderModelsPanel();
            renderChatPage();
          });
        }
      } catch (_e) {}
    }

    return {
      refresh,
      refreshConnections: () => loadConnections(true),
      openAddModel: () => openAddModelModal(),
      syncState: () => {
        syncFromState();
        renderModelsPanel();
        renderChatPage();
      },
    };
  }

  return { mount };
})();
if (typeof module !== 'undefined') module.exports = PlazCodeByokChatUI;
