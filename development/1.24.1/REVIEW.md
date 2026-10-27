# PlazCode 1.24.1

Repeated tool results previously collided with a 45-second payload-only delivery cache. Delivery now binds full text to the originating assistant turn, conversation and session; simultaneous callers share one pending promise, and only a confirmed retry is reused. Failed sends remain retryable and a second different message cannot overwrite an in-flight delivery.

ChatGPT’s native Stop control now wins over text-stability fallbacks and cached-command finalization. A long token/reasoning pause never produces premature cut-off feedback. Five minutes without progress while the control remains present pauses PlazCode without sending feedback or automatically stopping the AI. Hidden-tab wait intervals do not consume that limit. CodeMirror full-document publication tracks the document object rather than just its length, allowing equal-length replacements to refresh.

The existing desktop Skills navigation now opens a browsable searchable menu, readable starter names and detailed descriptions, methods, pitfalls and verification checks. All 11 starter references remain complete and separately licensed. Their full instructions can be read with pagination. Add skill opens the editor; an AI-assisted request can create a named detailed candidate. Native saves derive missing/generic names from the method description. Project adaptation and scope protections remain in force.

Validation: all exact-source platform CI jobs passed. See release-validation-1.24.1. New tests exercise production result-delivery, response-watcher and CodeMirror code, all starter-menu interactions, AI skill creation requests and authenticated native save/read persistence. Other providers and unrelated systems retain their prior code.
