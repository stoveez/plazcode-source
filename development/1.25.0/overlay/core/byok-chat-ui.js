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

  const parseMultiKeys = (raw) =>
    String(raw || '')
      .split(/[\r\n,]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

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

  function mount(opts) {
    let presets = [];
    let platforms = [];
    let activeModelId = null;
    let chats = [];
    let activeChat = null;
    let chatSearch = '';
    let chatMode = 'roblox';
    let planMode = false;
    let effort = 'default';
    let permMode = 'sandbox';
    let attachments = [];
    let stagedSkillFolders = [];
    let drawerOpen = false;
    let drawerTab = 'files';
    let fileQuery = '';
    let workspaceFiles = [];
    let activeRunId = null;
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
    let dropdownOpen = false;
    let initialized = false;

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
    };

    const loadPlatforms = async () => {
      try {
        const res = await opts.api('/api/byok/platforms');
        if (res && Array.isArray(res.presets)) presets = res.presets;
        if (res && Array.isArray(res.platforms)) platforms = res.platforms;
        if (res && typeof res.activeModelId === 'string') activeModelId = res.activeModelId;
      } catch (_e) {}
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

    const loadChatById = async (id) => {
      try {
        const res = await opts.api('/api/byok/chats?id=' + encodeURIComponent(id));
        if (res && res.chat) {
          const loaded = res.chat;
          activeChat = loaded;
          if (loaded.mode) chatMode = loaded.mode;
          if (loaded.modelId) activeModelId = loaded.modelId;
          renderChatPage();
        }
      } catch (_e) {}
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
    const renderRichContent = (raw) => {
      const text = String(raw || '');
      const parts = text.split(/```([a-zA-Z0-9_-]*)\r?\n([\s\S]*?)```/g);
      let html = '';
      for (let i = 0; i < parts.length; i += 3) {
        const prose = parts[i] || '';
        if (prose) {
          const escaped = esc(prose)
            .replace(/`([^`\n]+)`/g, '<code class="byok-inline-code">$1</code>')
            .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>');
          html += '<div class="byok-prose" data-i18n-user-content dir="auto">' + escaped + '</div>';
        }
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

    const renderToolCard = (tc) => {
      const statusCls = tc.status === 'ok' ? 'ok' : tc.status === 'running' ? 'run' : 'err';
      const argsStr = typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args || {}, null, 2);
      return (
        '<details class="byok-tool-card" data-status="' + esc(statusCls) + '">' +
        '<summary><span class="byok-tool-dot"></span><span class="byok-tool-name" data-i18n-user-content>' + esc(tc.name) + '</span>' +
        '<span class="byok-tool-status">' + esc(tc.status) + '</span></summary>' +
        '<div class="byok-tool-body" data-i18n-user-content dir="ltr">' +
        '<div class="byok-tool-sec"><strong>Args</strong><pre>' + esc(argsStr) + '</pre></div>' +
        (tc.output ? '<div class="byok-tool-sec"><strong>Output</strong><pre>' + esc(tc.output) + '</pre></div>' : '') +
        '</div></details>'
      );
    };

    // =========================================================================
    // Chat Page Rendering (#page-chat)
    // =========================================================================
    const renderModelSelectorHtml = () => {
      const active = resolveActiveModel();
      const label = active
        ? (active.model.displayName || active.model.name)
        : t('Select a model');
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
        '<div class="byok-model-dd">' +
        '<button type="button" class="softbtn byok-model-trigger" aria-expanded="' + (dropdownOpen ? 'true' : 'false') + '">' +
        '<span class="byok-health-dot" data-health="' + esc(active?.model.healthStatus?.status || 'unknown') + '"></span>' +
        '<span class="byok-model-trigger-name" data-i18n-user-content>' + esc(label) + '</span>' +
        (platTag ? '<span class="byok-model-trigger-plat" data-i18n-user-content>' + esc(platTag) + '</span>' : '') +
        '<span class="byok-caret">▾</span></button>' +
        '<div class="byok-dd-menu"' + (dropdownOpen ? '' : ' hidden') + '>' +
        '<div class="byok-dd-list">' + itemsHtml + '</div>' +
        '<div class="byok-dd-foot"><button type="button" class="softbtn byok-manage-models" data-pc-i18n>' + esc(t('Manage models')) + '</button></div>' +
        '</div></div>'
      );
    };

    const renderAttachmentsHtml = () => {
      if (!attachments.length && !stagedSkillFolders.length) return '';
      const chips = attachments.map((a, idx) =>
        '<span class="byok-att-chip" data-i18n-user-content>' + esc(a.name) +
        '<button type="button" class="byok-att-rm" data-rm-att="' + idx + '" aria-label="Remove">×</button></span>'
      );
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

    const renderComposerHtml = (sticky) => {
      const sending = !!activeRunId;
      const isLocal = chatMode === 'local';
      return (
        '<div class="byok-composer' + (sticky ? ' is-sticky' : '') + '">' +
        renderAttachmentsHtml() +
        '<textarea class="byok-input" data-byok-input data-i18n-user-content dir="auto" rows="' + (sticky ? '2' : '3') + '" placeholder="' + esc(t('Ask PlazCode to inspect, script, or build…')) + '"></textarea>' +
        '<div class="byok-composer-bar">' +
        '<div class="byok-composer-left">' +
        '<label class="softbtn byok-attach-btn" title="' + esc(t('Attach files or images')) + '">+<input type="file" multiple hidden data-byok-file></label>' +
        renderModelSelectorHtml() +
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
        (sending
          ? '<button type="button" class="dangerbtn byok-stop-btn" data-byok-stop data-pc-i18n>' + esc(t('Stop')) + '</button>'
          : '<button type="button" class="accentbtn byok-send-btn" data-byok-send data-pc-i18n>' + esc(t('Send')) + '</button>') +
        '</div></div></div>'
      );
    };

    const renderChatRail = () => {
      const host = opts.chatHost;
      if (!host) return;
      const listEl = host.querySelector('[data-byok-rail-list]');
      if (!listEl) return;
      const q = chatSearch.trim().toLowerCase();
      const filtered = chats.filter((c) => !q || c.title.toLowerCase().includes(q));
      if (!filtered.length) {
        listEl.innerHTML = '<div class="byok-rail-empty" data-pc-i18n>' + esc(t('No conversations yet')) + '</div>';
        return;
      }
      listEl.innerHTML = filtered.map((c) => {
        const isAct = activeChat && activeChat.id === c.id;
        return (
          '<div class="byok-rail-item' + (isAct ? ' active' : '') + '" data-open-chat="' + esc(c.id) + '" role="button" tabindex="0">' +
          '<div class="byok-rail-title" data-i18n-user-content dir="auto">' + esc(c.title || 'New Chat') + '</div>' +
          '<div class="byok-rail-meta"><span>' + esc(c.mode === 'local' ? 'AgentScript' : 'RobloxScript') + '</span>' +
          '<button type="button" class="byok-rail-del" data-del-chat="' + esc(c.id) + '" aria-label="' + esc(t('Delete')) + '">×</button></div>' +
          '</div>'
        );
      }).join('');
    };

    const renderDrawer = () => {
      const host = opts.chatHost;
      if (!host) return;
      const drawer = host.querySelector('[data-byok-drawer]');
      if (!drawer) return;
      drawer.hidden = !drawerOpen;
      if (!drawerOpen) return;
      const body = drawer.querySelector('[data-byok-drawer-body]');
      if (!body) return;
      drawer.querySelectorAll('[data-drawer-tab]').forEach((b) => {
        b.classList.toggle('active', b.getAttribute('data-drawer-tab') === drawerTab);
      });
      if (drawerTab === 'files') {
        const st = opts.getState ? opts.getState() || {} : {};
        const wsRoot = st.workspace_ready && st.workspace_root ? String(st.workspace_root) : '';
        const wsShort = wsRoot ? (wsRoot.split(/[\\/]/).filter(Boolean).pop() || wsRoot) : t('No workspace folder');
        const list = workspaceFiles.length
          ? workspaceFiles.map((f) => '<button type="button" class="byok-file-item" data-insert-file="' + esc(f) + '" data-i18n-user-content dir="ltr">' + esc(f) + '</button>').join('')
          : '<div class="byok-drawer-empty" data-pc-i18n>' + esc(t('No workspace files found')) + '</div>';
        body.innerHTML =
          '<div class="byok-ws-sub" style="text-align:left;margin:0 0 6px" title="' + esc(wsRoot || wsShort) + '"><span data-pc-i18n>' + esc(t('Workspace folder')) + '</span>: <strong data-i18n-user-content>' + esc(wsShort) + '</strong></div>' +
          '<input class="search byok-file-search" data-byok-file-search value="' + esc(fileQuery) + '" placeholder="' + esc(t('Search workspace files…')) + '">' +
          '<div class="byok-file-list">' + list + '</div>';
      } else {
        const changes = activeChat?.modifiedFiles || [];
        body.innerHTML = changes.length
          ? '<div class="byok-file-list">' + changes.map((ch) =>
              '<div class="byok-change-row"><span class="byok-change-act">' + esc(ch.action) + '</span><span class="byok-change-path" data-i18n-user-content dir="ltr">' + esc(ch.path) + '</span></div>'
            ).join('') + '</div>'
          : '<div class="byok-drawer-empty" data-pc-i18n>' + esc(t('No files modified in this chat yet.')) + '</div>';
      }
    };

    const renderChatPage = () => {
      const host = opts.chatHost;
      if (!host) return;
      const existingInput = host.querySelector('[data-byok-input]');
      const draftVal = existingInput ? existingInput.value : '';

      const hasMsgs = !!(activeChat && activeChat.messages && activeChat.messages.length > 0) || !!activeRunId;
      const starters = chatMode === 'local'
        ? [
            t('Audit the project structure and summarize key entry points'),
            t('Find and fix type or lint issues in the workspace'),
            t('Draft a refactor plan before editing any files'),
          ]
        : [
            t('Inspect ServerScriptService and check for Luau errors'),
            t('Create a round-based obby checkpoint system in Studio'),
            t('Audit the UI layout for responsiveness and scale'),
          ];

      let mainHtml = '';
      if (!hasMsgs) {
        const st = opts.getState ? opts.getState() || {} : {};
        const wsRoot = st.workspace_ready && st.workspace_root ? String(st.workspace_root) : '';
        const wsShort = wsRoot ? (wsRoot.split(/[\\/]/).filter(Boolean).pop() || wsRoot) : t('No workspace folder');
        const wsNote = chatMode === 'local'
          ? '<div class="byok-ws-sub" title="' + esc(wsRoot || wsShort) + '"><span data-pc-i18n>' + esc(t('Workspace folder')) + '</span>: <span data-i18n-user-content>' + esc(wsShort) + '</span></div>'
          : '';
        mainHtml =
          '<div class="byok-empty-view">' +
          '<div class="byok-mode-switch" role="group">' +
          '<button type="button" class="byok-mode-pill' + (chatMode === 'roblox' ? ' active' : '') + '" data-byok-mode="roblox">RobloxScript</button>' +
          '<button type="button" class="byok-mode-pill' + (chatMode === 'local' ? ' active' : '') + '" data-byok-mode="local">AgentScript</button>' +
          '</div>' +
          '<h1 class="byok-hero-title" data-pc-i18n>' + esc(t("Hi, what's your plan for today?")) + '</h1>' +
          renderComposerHtml(false) +
          wsNote +
          '<div class="byok-starters">' +
          starters.map((s) => '<button type="button" class="softbtn byok-starter-chip" data-byok-starter="' + esc(s) + '">' + esc(s) + '</button>').join('') +
          '</div></div>';
      } else {
        const msgsHtml = (activeChat?.messages || []).map((m) => {
          if (m.role === 'user') {
            const atts = (m.attachments || []).map((a) => '<span class="byok-msg-att" data-i18n-user-content>' + esc(a.name) + '</span>').join('');
            return '<div class="byok-msg byok-msg-user"><div class="byok-bubble">' + (atts ? '<div class="byok-msg-atts">' + atts + '</div>' : '') + renderRichContent(m.content) + '</div></div>';
          }
          const tools = (m.toolCalls || []).map(renderToolCard).join('');
          const errHtml = m.error ? renderErrorCard(m.error) : '';
          return (
            '<div class="byok-msg byok-msg-assistant">' +
            (m.modelLabel ? '<div class="byok-msg-model" data-i18n-user-content>' + esc(m.modelLabel) + '</div>' : '') +
            (m.reasoning ? '<details class="byok-reasoning"><summary data-pc-i18n>' + esc(t('Reasoning')) + '</summary><pre data-i18n-user-content>' + esc(m.reasoning) + '</pre></details>' : '') +
            tools +
            (m.content ? '<div class="byok-bubble">' + renderRichContent(m.content) + '</div>' : '') +
            errHtml +
            '</div>'
          );
        }).join('');

        let streamingHtml = '';
        if (activeRunId) {
          streamingHtml =
            '<div class="byok-msg byok-msg-assistant is-streaming">' +
            (streamInfo ? '<div class="byok-stream-info" data-i18n-user-content>' + esc(streamInfo) + '</div>' : '') +
            (streamReasoning ? '<details class="byok-reasoning" open><summary data-pc-i18n>' + esc(t('Reasoning')) + '</summary><pre data-i18n-user-content>' + esc(streamReasoning) + '</pre></details>' : '') +
            streamTools.map(renderToolCard).join('') +
            (streamText ? '<div class="byok-bubble">' + renderRichContent(streamText) + '</div>' : '<div class="byok-thinking" data-pc-i18n>' + esc(t('Thinking…')) + '</div>') +
            (streamError ? renderErrorCard(streamError) : '') +
            '</div>';
        }

        mainHtml =
          '<div class="byok-active-view">' +
          '<header class="byok-chat-topbar">' +
          '<div class="byok-chat-title" data-i18n-user-content dir="auto">' + esc(activeChat?.title || 'Chat') + '</div>' +
          '<div class="byok-topbar-actions">' +
          '<div class="byok-mode-switch compact" role="group">' +
          '<button type="button" class="byok-mode-pill' + (chatMode === 'roblox' ? ' active' : '') + '" data-byok-mode="roblox">RobloxScript</button>' +
          '<button type="button" class="byok-mode-pill' + (chatMode === 'local' ? ' active' : '') + '" data-byok-mode="local">AgentScript</button>' +
          '</div>' +
          renderModelSelectorHtml() +
          '<button type="button" class="softbtn byok-drawer-toggle' + (drawerOpen ? ' active' : '') + '" data-byok-toggle-drawer>' + esc(t('Files')) + ' / ' + esc(t('Changes')) + '</button>' +
          '</div></header>' +
          '<div class="byok-messages" data-byok-messages>' + msgsHtml + streamingHtml + '</div>' +
          renderComposerHtml(true) +
          '</div>';
      }

      host.innerHTML =
        '<div class="byok-chat-shell">' +
        '<aside class="byok-chat-rail">' +
        '<button type="button" class="accentbtn byok-new-chat" data-byok-new-chat data-pc-i18n>+ ' + esc(t('New Chat')) + '</button>' +
        '<input type="search" class="search byok-rail-search" data-byok-rail-search value="' + esc(chatSearch) + '" placeholder="' + esc(t('Search conversations')) + '">' +
        '<div class="byok-rail-list" data-byok-rail-list></div>' +
        '</aside>' +
        '<div class="byok-chat-stage">' + mainHtml + '</div>' +
        '<aside class="byok-drawer" data-byok-drawer' + (drawerOpen ? '' : ' hidden') + '>' +
        '<div class="byok-drawer-tabs"><button type="button" class="softbtn" data-drawer-tab="files" data-pc-i18n>' + esc(t('Files')) + '</button>' +
        '<button type="button" class="softbtn" data-drawer-tab="changes" data-pc-i18n>' + esc(t('Changes')) + '</button></div>' +
        '<div class="byok-drawer-body" data-byok-drawer-body></div>' +
        '</aside></div>';

      if (draftVal) {
        const nextInput = host.querySelector('[data-byok-input]');
        if (nextInput) nextInput.value = draftVal;
      }
      renderChatRail();
      renderDrawer();
      const msgBox = host.querySelector('[data-byok-messages]');
      if (msgBox) msgBox.scrollTop = msgBox.scrollHeight;
      localizeNode(host);
    };

    const sendChatMessage = async (textOverride) => {
      const host = opts.chatHost;
      const input = host?.querySelector('[data-byok-input]');
      const text = (textOverride !== undefined ? textOverride : input?.value || '').trim();
      if (!text && !attachments.length && !stagedSkillFolders.length) return;
      if (activeRunId) return;

      lastUserPrompt = text;
      const chosen = resolveActiveModel();
      if (!activeChat) {
        activeChat = {
          id: 'pending_' + Date.now(),
          title: text.slice(0, 48) || 'New Chat',
          mode: chatMode,
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
        mode: chatMode,
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

      try {
        const res = await opts.api('/api/byok/chat/send', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        if (!res || !res.ok) {
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
        renderChatPage();
        startEventPolling(res.runId);
        loadChats();
      } catch (e) {
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
              });
            } else if (ev.kind === 'tool_result') {
              const hit = streamTools.find((tc) => tc.id === ev.data?.id);
              if (hit) {
                hit.status = String(ev.data?.status || 'ok');
                hit.output = String(ev.data?.output || '');
              }
            } else if (ev.kind === 'error') {
              streamError = ev.data;
            }
          }
          if (res?.done) {
            clearInterval(pollTimer);
            pollTimer = 0;
            activeRunId = null;
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
      pollTimer = window.setInterval(tick, 220);
    };

    // =========================================================================
    // Model & API Key Manager (#byokModelsPanel) + Modals
    // =========================================================================
    const openModal = (innerHtml, onBind) => {
      const root = ensureModalRoot();
      if (!root) return;
      root.innerHTML = '<div class="byok-modal-backdrop"><div class="byok-modal settingcard" role="dialog" aria-modal="true">' + innerHtml + '</div></div>';
      root.hidden = false;
      localizeNode(root);
      onBind(root);
    };

    const closeModal = () => {
      if (!modalRoot) return;
      modalRoot.hidden = true;
      modalRoot.innerHTML = '';
    };

    const openAddModelModal = (preselectPlatform) => {
      let selectedPresetId = preselectPlatform?.presetId || 'openai';
      let discoveredList = [];

      const render = () => {
        const preset = presets.find((p) => p.id === selectedPresetId) || presets[0] || {
          id: 'openai',
          name: 'OpenAI',
          defaultEndpoint: 'https://api.openai.com',
          defaultRequestApi: 'chat_completions',
          requiresKey: true,
          defaultModels: ['gpt-4o'],
        };
        const epDefault = preselectPlatform ? preselectPlatform.endpointUrl : preset.defaultEndpoint;
        const fuDefault = preselectPlatform ? preselectPlatform.fullUrl : false;
        const suggestModels = discoveredList.length ? discoveredList : (preset.defaultModels || []);

        openModal(
          '<div class="byok-modal-head"><h3 data-pc-i18n>' + esc(t('Add Model')) + '</h3><button type="button" class="softbtn" data-modal-close>×</button></div>' +
          '<div class="byok-form-grid">' +
          '<label class="byok-field"><span data-pc-i18n>' + esc(t('Model Platform')) + '</span>' +
          '<input type="text" class="byok-plat-search" data-am-plat-filter placeholder="' + esc(t('Search platform…')) + '"' + (preselectPlatform ? ' disabled' : '') + '>' +
          '<select data-am-preset' + (preselectPlatform ? ' disabled' : '') + '>' +
          presets.map((p) => '<option value="' + esc(p.id) + '"' + (p.id === selectedPresetId ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('') +
          '</select></label>' +
          '<label class="byok-field"><div class="byok-field-row"><span data-pc-i18n>' + esc(t('API Endpoint')) + '</span>' +
          '<label class="byok-inline-toggle"><input type="checkbox" data-am-fullurl' + (fuDefault ? ' checked' : '') + '> <span data-pc-i18n>' + esc(t('Full URL')) + '</span></label></div>' +
          '<input type="text" data-am-endpoint dir="ltr" value="' + esc(epDefault) + '" placeholder="https://api.openai.com">' +
          '<small class="byok-url-preview" data-am-url-preview dir="ltr"></small></label>' +
          '<label class="byok-field"><span data-pc-i18n>' + esc(t('API Key')) + '</span>' +
          '<textarea rows="2" data-am-keys dir="ltr" placeholder="' + esc(preselectPlatform ? t('Leave empty to keep existing keys, or paste additional keys') : t('sk-... (one per line or comma-separated)')) + '"></textarea>' +
          '<small class="byok-hint" data-pc-i18n>' + esc(t('Supports multiple API keys (one per line or comma-separated) with automatic rotation on rate limits.')) + '</small></label>' +
          '<label class="byok-field"><div class="byok-field-row"><span data-pc-i18n>' + esc(t('Model Name')) + '</span>' +
          '<button type="button" class="softbtn" data-am-discover data-pc-i18n>' + esc(t('Discover')) + '</button></div>' +
          '<input type="text" data-am-model dir="ltr" value="' + esc(suggestModels[0] || '') + '" placeholder="gpt-4o">' +
          '<div class="byok-discover-chips" data-am-chips>' + suggestModels.slice(0, 8).map((m) => '<button type="button" class="softbtn byok-chip" data-pick-model="' + esc(m) + '">' + esc(m) + '</button>').join('') + '</div></label>' +
          '<div class="byok-two-col">' +
          '<label class="byok-field"><span data-pc-i18n>' + esc(t('Vision input')) + '</span><select data-am-vision><option value="auto">Auto</option><option value="enabled">Enabled</option><option value="disabled">Disabled</option></select></label>' +
          '<label class="byok-field"><span data-pc-i18n>' + esc(t('OpenAI request API')) + '</span><select data-am-api><option value="auto">Auto</option><option value="chat_completions">Chat Completions (/chat/completions)</option><option value="responses">Responses (/responses)</option><option value="anthropic">Anthropic (/messages)</option><option value="gemini">Gemini (:generateContent)</option></select></label>' +
          '</div>' +
          '<div class="byok-modal-err" data-am-err hidden></div>' +
          '</div>' +
          '<div class="byok-modal-foot"><button type="button" class="softbtn" data-modal-close data-pc-i18n>' + esc(t('Cancel')) + '</button>' +
          '<button type="button" class="accentbtn" data-am-save data-pc-i18n>' + esc(t('Save')) + '</button></div>',
          (root) => {
            const filterEl = root.querySelector('[data-am-plat-filter]');
            const presetSel = root.querySelector('[data-am-preset]');
            const epInput = root.querySelector('[data-am-endpoint]');
            const fuCheck = root.querySelector('[data-am-fullurl]');
            const keysInput = root.querySelector('[data-am-keys]');
            const modelInput = root.querySelector('[data-am-model]');
            const visionSel = root.querySelector('[data-am-vision]');
            const apiSel = root.querySelector('[data-am-api]');
            const previewEl = root.querySelector('[data-am-url-preview]');
            const chipsEl = root.querySelector('[data-am-chips]');
            const errEl = root.querySelector('[data-am-err]');

            const updateUrlPreview = () => {
              if (!previewEl || !epInput || !fuCheck || !apiSel || !modelInput) return;
              const u = previewTargetUrl(epInput.value, fuCheck.checked, apiSel.value, selectedPresetId, modelInput.value);
              previewEl.textContent = u ? '→ ' + u : '';
            };

            const bindChips = () => {
              chipsEl?.querySelectorAll('[data-pick-model]').forEach((b) => {
                (b).onclick = () => {
                  if (modelInput) modelInput.value = b.getAttribute('data-pick-model') || '';
                  updateUrlPreview();
                };
              });
            };
            bindChips();
            updateUrlPreview();

            if (filterEl && presetSel) {
              filterEl.oninput = () => {
                const q = filterEl.value.trim().toLowerCase();
                const matches = presets.filter((p) => !q || p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q));
                presetSel.innerHTML = matches.map((p) => '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>').join('');
                if (matches.length && !matches.some((p) => p.id === selectedPresetId)) {
                  selectedPresetId = matches[0].id;
                  presetSel.value = selectedPresetId;
                  presetSel.dispatchEvent(new Event('change'));
                }
              };
            }

            if (presetSel) {
              presetSel.onchange = () => {
                selectedPresetId = presetSel.value;
                const p = presets.find((x) => x.id === selectedPresetId);
                if (p && epInput) epInput.value = p.defaultEndpoint;
                if (p && modelInput && p.defaultModels.length) modelInput.value = p.defaultModels[0];
                if (p && chipsEl) {
                  chipsEl.innerHTML = (p.defaultModels || []).map((m) => '<button type="button" class="softbtn byok-chip" data-pick-model="' + esc(m) + '">' + esc(m) + '</button>').join('');
                  bindChips();
                }
                updateUrlPreview();
              };
            }

            epInput?.addEventListener('input', updateUrlPreview);
            fuCheck?.addEventListener('change', updateUrlPreview);
            apiSel?.addEventListener('change', updateUrlPreview);
            modelInput?.addEventListener('input', updateUrlPreview);

            root.querySelectorAll('[data-modal-close]').forEach((b) => {
              (b).onclick = closeModal;
            });

            const discBtn = root.querySelector('[data-am-discover]');
            if (discBtn) {
              discBtn.onclick = async () => {
                discBtn.disabled = true;
                if (errEl) errEl.hidden = true;
                try {
                  const res = await opts.api('/api/byok/models/discover', {
                    method: 'POST',
                    body: JSON.stringify({
                      platformId: preselectPlatform?.id,
                      presetId: selectedPresetId,
                      endpointUrl: epInput?.value || '',
                      fullUrl: fuCheck?.checked || false,
                      apiKeys: parseMultiKeys(keysInput?.value || ''),
                      requestApi: apiSel?.value || 'auto',
                    }),
                  });
                  if (res && res.ok && Array.isArray(res.models)) {
                    discoveredList = res.models;
                    if (chipsEl) {
                      chipsEl.innerHTML = discoveredList.slice(0, 12).map((m) => '<button type="button" class="softbtn byok-chip" data-pick-model="' + esc(m) + '">' + esc(m) + '</button>').join('');
                      bindChips();
                    }
                    if (modelInput && !modelInput.value && discoveredList[0]) {
                      modelInput.value = discoveredList[0];
                      updateUrlPreview();
                    }
                  } else if (errEl) {
                    errEl.hidden = false;
                    errEl.textContent = res?.error?.message || 'Could not discover models.';
                  }
                } catch (e) {
                  if (errEl) {
                    errEl.hidden = false;
                    errEl.textContent = e?.message || 'Discovery failed.';
                  }
                } finally {
                  discBtn.disabled = false;
                }
              };
            }

            const saveBtn = root.querySelector('[data-am-save]');
            if (saveBtn) {
              saveBtn.onclick = async () => {
                const modelName = modelInput?.value.trim() || '';
                if (!modelName) {
                  if (errEl) { errEl.hidden = false; errEl.textContent = t('Model Name is required.'); }
                  return;
                }
                saveBtn.disabled = true;
                try {
                  await opts.api('/api/byok/platforms', {
                    method: 'POST',
                    body: JSON.stringify({
                      id: preselectPlatform?.id,
                      presetId: selectedPresetId,
                      endpointUrl: epInput?.value.trim() || '',
                      fullUrl: fuCheck?.checked || false,
                      apiKeys: parseMultiKeys(keysInput?.value || ''),
                      model: {
                        name: modelName,
                        visionMode: visionSel?.value || 'auto',
                        requestApi: apiSel?.value || 'auto',
                        enabled: true,
                      },
                    }),
                  });
                  closeModal();
                  await loadPlatforms();
                  const sec = opts.modelsHost?.closest('details.settings-section');
                  if (sec && !sec.open) sec.open = true;
                } catch (e) {
                  if (errEl) { errEl.hidden = false; errEl.textContent = e?.message || 'Save failed.'; }
                } finally {
                  saveBtn.disabled = false;
                }
              };
            }
          }
        );
      };
      render();
    };

    const openEditPlatformModal = (plat) => {
      openModal(
        '<div class="byok-modal-head"><h3 data-pc-i18n>' + esc(t('Edit Platform & API Keys')) + '</h3><button type="button" class="softbtn" data-modal-close>×</button></div>' +
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
        '<div class="byok-modal-head"><h3 data-pc-i18n>' + esc(t('Configure Model')) + '</h3><button type="button" class="softbtn" data-modal-close>×</button></div>' +
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
        '<div class="byok-modal-head"><h3 data-pc-i18n>' + esc(t('Confirm Delete')) + '</h3><button type="button" class="softbtn" data-modal-close>×</button></div>' +
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

      if (opts.modelsActionsHost) {
        opts.modelsActionsHost.innerHTML = actionsHtml;
        localizeNode(opts.modelsActionsHost);
        host.innerHTML =
          bannerHtml +
          '<div class="byok-plat-list">' + platHtml + '</div>';
      } else {
        host.innerHTML =
          '<div class="byok-models-head">' +
          '<div><h3 data-pc-i18n>' + esc(t('Model')) + '</h3><p data-pc-i18n>' + esc(t('Manage AI platforms, multi-key rotation, and model health checks.')) + '</p></div>' +
          '<div class="byok-models-head-actions">' + actionsHtml + '</div></div>' +
          bannerHtml +
          '<div class="byok-plat-list">' + platHtml + '</div>';
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
            renderChatPage();
            return;
          }
          if (target.closest('.byok-manage-models') || target.closest('.byok-err-models')) {
            dropdownOpen = false;
            opts.navigateToModels();
            return;
          }
          if (target.closest('[data-byok-new-chat]')) {
            activeChat = null;
            attachments = [];
            stagedSkillFolders = [];
            activeRunId = null;
            renderChatPage();
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
          const modeBtn = target.closest('[data-byok-mode]');
          if (modeBtn) {
            chatMode = modeBtn.getAttribute('data-byok-mode') === 'local' ? 'local' : 'roblox';
            opts.patchPref('rsByokChatMode', chatMode);
            renderChatPage();
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
            if (activeRunId) {
              opts.api('/api/byok/chat/stop', { method: 'POST', body: JSON.stringify({ runId: activeRunId }) }).catch(() => {});
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
            if (drawerOpen && drawerTab === 'files') loadFiles();
            else renderChatPage();
            return;
          }
          const dTab = target.closest('[data-drawer-tab]');
          if (dTab) {
            drawerTab = dTab.getAttribute('data-drawer-tab') === 'changes' ? 'changes' : 'files';
            if (drawerTab === 'files') loadFiles();
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
          } else if (target.matches('[data-byok-file]')) {
            const input = target;
            const files = Array.from(input.files || []);
            for (const f of files) {
              const reader = new FileReader();
              if (f.type.startsWith('image/')) {
                reader.onload = () => {
                  const res = String(reader.result || '');
                  const b64 = res.includes(',') ? res.split(',')[1] : res;
                  attachments.push({ name: f.name, mimeType: f.type, dataBase64: b64 });
                  renderChatPage();
                };
                reader.readAsDataURL(f);
              } else {
                reader.onload = () => {
                  attachments.push({ name: f.name, mimeType: f.type || 'text/plain', textPreview: String(reader.result || '').slice(0, 12000) });
                  renderChatPage();
                };
                reader.readAsText(f);
              }
            }
            input.value = '';
          }
        });

        chatHost.addEventListener('input', (ev) => {
          const target = ev.target;
          if (!target) return;
          if (target.matches('[data-byok-rail-search]')) {
            chatSearch = target.value;
            renderChatRail();
          } else if (target.matches('[data-byok-file-search]')) {
            fileQuery = target.value;
            loadFiles();
          }
        });

        chatHost.addEventListener('keydown', (ev) => {
          const target = ev.target;
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

        let byokDragDepth = 0;
        chatHost.addEventListener('dragenter', (ev) => {
          if (!hasSkillDrop(ev.dataTransfer)) return;
          ev.preventDefault();
          byokDragDepth++;
          chatHost.classList.add('byok-skill-dragover');
        });
        chatHost.addEventListener('dragover', (ev) => {
          if (!hasSkillDrop(ev.dataTransfer)) return;
          ev.preventDefault();
          if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy';
        });
        chatHost.addEventListener('dragleave', () => {
          byokDragDepth = Math.max(0, byokDragDepth - 1);
          if (!byokDragDepth) chatHost.classList.remove('byok-skill-dragover');
        });
        chatHost.addEventListener('drop', (ev) => {
          if (!hasSkillDrop(ev.dataTransfer)) return;
          ev.preventDefault();
          byokDragDepth = 0;
          chatHost.classList.remove('byok-skill-dragover');
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
      await Promise.all([loadPlatforms(), loadChats()]);
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
      openAddModel: () => openAddModelModal(),
      syncState: () => {
        syncFromState();
        renderChatPage();
      },
    };
  }

  return { mount };
})();
