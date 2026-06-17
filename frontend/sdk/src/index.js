/**
 * @jicama/feedback — thin SDK over the ingest API + the embeddable widget.
 *
 *   import { Feedback } from '@jicama/feedback';
 *   Feedback.init({ key: 'pk_...', user: { id, email }, theme: { color: '#6C2BD9' } });
 *   Feedback.open();                      // open the widget UI
 *   await Feedback.submit({ type: 'bug', message: 'x', rating: 4 }); // headless, no UI
 *
 * The widget script (feedback.js) is loaded on demand the first time you call open(),
 * so importing the SDK costs nothing until you actually need UI.
 */

const WIDGET_URL_DEFAULT = "https://cdn.jicama.tech/feedback.js";

export const Feedback = {
  _cfg: null,

  init(opts) {
    if (!opts || !opts.key) throw new Error("[jicama] Feedback.init needs { key }");
    this._cfg = {
      key: opts.key,
      api: (opts.api || "https://api.jicama.tech").replace(/\/$/, ""),
      widgetUrl: opts.widgetUrl || WIDGET_URL_DEFAULT,
      user: opts.user || null,
      theme: opts.theme || {},
    };
    return this;
  },

  /** Open the floating widget UI (lazy-loads feedback.js, then inits + opens it). */
  async open() {
    const cfg = this._require();
    const w = await this._ensureWidget();
    w.init({ key: cfg.key, api: cfg.api, user: cfg.user, theme: cfg.theme });
    w.open();
  },

  /** Headless submit — POST straight to the ingest API, no UI. Returns the created record. */
  async submit(feedback) {
    const cfg = this._require();
    const res = await fetch(cfg.api + "/v1/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + cfg.key },
      body: JSON.stringify({
        type: feedback.type,
        message: feedback.message,
        rating: feedback.rating ?? null,
        endUser: feedback.user ?? cfg.user,
        metadata: feedback.metadata ?? {},
        attachments: feedback.attachments ?? [],
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "submit_failed");
    return body;
  },

  _require() {
    if (!this._cfg) throw new Error("[jicama] call Feedback.init({ key }) first");
    return this._cfg;
  },

  _ensureWidget() {
    if (typeof window === "undefined") {
      return Promise.reject(new Error("[jicama] open() requires a browser; use submit() on server"));
    }
    if (window.jicamaFeedback) return Promise.resolve(window.jicamaFeedback);
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = this._cfg.widgetUrl;
      s.onload = () => resolve(window.jicamaFeedback);
      s.onerror = () => reject(new Error("[jicama] failed to load widget"));
      document.head.appendChild(s);
    });
  },
};

export default Feedback;
