/*!
 * jicama feedback widget — embeddable, framework-free, ~1 file.
 * Zero-code usage:
 *   <script src=".../feedback.js" data-key="pk_..." data-api="https://api.jicama.tech"></script>
 * Programmatic usage (also exposed for the SDK):
 *   window.jicamaFeedback.init({ key, api, user, theme }); window.jicamaFeedback.open();
 */
(function () {
  "use strict";

  var TYPES = [
    { id: "bug", label: "🐞 Bug", hint: "Something is broken" },
    { id: "idea", label: "💡 Idea", hint: "A feature or improvement" },
    { id: "praise", label: "❤️ Praise", hint: "Tell us what you love" },
    { id: "question", label: "❓ Question", hint: "Ask us something" },
  ];

  var FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

  function captureMetadata() {
    var ua = navigator.userAgent;
    function pick(re) { var m = ua.match(re); return m ? m[0] : "unknown"; }
    return {
      url: location.href,
      browser: pick(/(Firefox|Edg|Chrome|Safari|OPR)[\/ ][\d.]+/) || "unknown",
      os: pick(/(Windows NT|Mac OS X|Android|Linux|iPhone|iPad)[^;)]*/) || "unknown",
      device: /Mobi|Android|iPhone|iPad/.test(ua) ? "mobile" : "desktop",
      screen: window.innerWidth + "x" + window.innerHeight,
      appVersion: window.__APP_VERSION__ || undefined,
      language: navigator.language,
    };
  }

  function el(tag, props, children) {
    var n = document.createElement(tag);
    if (props) Object.keys(props).forEach(function (k) {
      if (k === "style") Object.assign(n.style, props[k]);
      else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2).toLowerCase(), props[k]);
      else n.setAttribute(k, props[k]);
    });
    (children || []).forEach(function (c) {
      if (c == null) return;
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return n;
  }

  // Inject animation keyframes + hover/focus rules once (things inline styles can't express).
  function injectStyles() {
    if (document.getElementById("jcm-styles")) return;
    var css =
      "@keyframes jcm-fade{from{opacity:0}to{opacity:1}}" +
      "@keyframes jcm-pop{from{opacity:0;transform:translateY(12px) scale(.97)}to{opacity:1;transform:none}}" +
      "@keyframes jcm-pop-in{0%{transform:scale(0)}60%{transform:scale(1.15)}100%{transform:scale(1)}}" +
      ".jcm-launch{transition:transform .15s ease, box-shadow .15s ease}" +
      ".jcm-launch:hover{transform:translateY(-2px);box-shadow:0 10px 28px rgba(0,0,0,.28)}" +
      ".jcm-launch:active{transform:translateY(0)}" +
      ".jcm-overlay{animation:jcm-fade .18s ease both}" +
      ".jcm-card{animation:jcm-pop .24s cubic-bezier(.2,.8,.25,1) both}" +
      ".jcm-chip{transition:all .12s ease}" +
      ".jcm-x{transition:background .12s ease,color .12s ease}" +
      ".jcm-x:hover{background:#f1f5f9;color:#0f172a}" +
      ".jcm-ta{transition:border-color .12s ease, box-shadow .12s ease}" +
      ".jcm-ta:focus{border-color:var(--jcm)!important;box-shadow:0 0 0 3px color-mix(in srgb,var(--jcm) 22%,transparent)}" +
      ".jcm-ta::placeholder{color:#94a3b8}" +
      ".jcm-submit{transition:filter .12s ease, transform .1s ease}" +
      ".jcm-submit:hover:not(:disabled){filter:brightness(1.08)}" +
      ".jcm-submit:active:not(:disabled){transform:translateY(1px)}" +
      ".jcm-submit:disabled{opacity:.6;cursor:default}" +
      ".jcm-attach{transition:border-color .12s ease,background .12s ease}" +
      ".jcm-attach:hover{border-color:var(--jcm);background:#fafafa}" +
      ".jcm-star{transition:transform .1s ease}" +
      ".jcm-star:hover{transform:scale(1.18)}" +
      ".jcm-check{animation:jcm-pop-in .4s cubic-bezier(.2,.9,.3,1.2) both}";
    var s = el("style", { id: "jcm-styles" });
    s.textContent = css;
    document.head.appendChild(s);
  }

  var Widget = {
    cfg: null,
    state: { open: false, type: "bug", rating: 0, hover: 0, attachment: null },
    root: null,

    init: function (opts) {
      this.cfg = {
        key: opts.key,
        api: (opts.api || location.origin).replace(/\/$/, ""),
        user: opts.user || null,
        theme: Object.assign({ color: "#6C2BD9", position: "bottom-right" }, opts.theme || {}),
      };
      if (!this.cfg.key) return console.error("[jicama] missing data-key");
      injectStyles();
      this._mount();
      return this;
    },

    _mount: function () {
      if (this.root) this.root.remove();
      var color = this.cfg.theme.color;
      var pos = this.cfg.theme.position === "bottom-left"
        ? { left: "20px" } : { right: "20px" };

      var button = el("button", {
        "class": "jcm-launch", "aria-label": "Give feedback",
        style: Object.assign({
          position: "fixed", bottom: "20px", zIndex: 2147483646,
          background: color, color: "#fff", border: "none", borderRadius: "999px",
          padding: "12px 18px 12px 16px", font: "600 14px " + FONT, cursor: "pointer",
          boxShadow: "0 6px 20px rgba(0,0,0,.22)", display: "flex", alignItems: "center", gap: "8px",
        }, pos),
        onclick: this.open.bind(this),
      }, [
        el("span", { style: { fontSize: "16px", lineHeight: "1" } }, ["💬"]),
        "Feedback",
      ]);

      this.root = el("div");
      this.root.appendChild(button);
      this.button = button;
      document.body.appendChild(this.root);
    },

    open: function () {
      if (this.state.open) return;
      this.state = { open: true, type: "bug", rating: 0, hover: 0, attachment: null };
      this._renderModal();
    },

    close: function () {
      this.state.open = false;
      if (this.modal) { this.modal.remove(); this.modal = null; }
    },

    _renderModal: function () {
      var self = this, color = this.cfg.theme.color;

      var typeRow = el("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" } },
        TYPES.map(function (t) {
          return el("button", {
            "class": "jcm-chip", "data-type": t.id, title: t.hint,
            style: chipStyle(t.id === self.state.type, color),
            onclick: function () { self.state.type = t.id; self._refreshChips(); },
          }, [t.label]);
        }));
      this._typeRow = typeRow;

      var stars = el("div", { style: { display: "flex", gap: "4px", fontSize: "28px", cursor: "pointer", userSelect: "none" } },
        [1, 2, 3, 4, 5].map(function (i) {
          return el("span", {
            "class": "jcm-star", "data-star": String(i),
            onclick: function () { self.state.rating = (self.state.rating === i ? 0 : i); self._refreshStars(); },
            onmouseenter: function () { self.state.hover = i; self._refreshStars(); },
            onmouseleave: function () { self.state.hover = 0; self._refreshStars(); },
          }, ["☆"]);
        }));
      this._stars = stars;

      var textarea = el("textarea", {
        "class": "jcm-ta",
        placeholder: "Tell us what's on your mind…", rows: "4",
        style: {
          width: "100%", boxSizing: "border-box", padding: "11px 12px", marginTop: "2px",
          border: "1px solid #e2e8f0", borderRadius: "10px", font: "14px " + FONT,
          resize: "vertical", color: "#0f172a", outline: "none", background: "#fff",
        },
      });
      this._textarea = textarea;

      // Styled attach control hiding the native file input.
      var fileInput = el("input", { type: "file", accept: "image/*",
        style: { display: "none" }, onchange: function (e) { self._onFile(e); } });
      this._fileInput = fileInput;
      var attachLabel = el("div", { "class": "jcm-attach",
        style: {
          display: "flex", alignItems: "center", gap: "8px", marginTop: "2px",
          border: "1px dashed #cbd5e1", borderRadius: "10px", padding: "10px 12px",
          color: "#475569", font: "13px " + FONT, cursor: "pointer",
        },
        onclick: function () { if (self.state.attachment) { self._clearFile(); } else { fileInput.click(); } },
      }, ["📎 ", el("span", { "data-attach-text": "1" }, ["Attach a screenshot (optional)"]), fileInput]);
      this._attachLabel = attachLabel;

      // Honeypot: hidden from humans, tempting to bots.
      var honeypot = el("input", { type: "text", name: "website", tabindex: "-1",
        autocomplete: "off", "aria-hidden": "true",
        style: { position: "absolute", left: "-9999px", opacity: "0", height: "0", width: "0" } });
      this._honeypot = honeypot;

      var status = el("div", { style: { font: "13px " + FONT, minHeight: "18px", color: "#64748b", marginTop: "8px" } });
      this._status = status;

      var submit = el("button", {
        "class": "jcm-submit",
        style: {
          width: "100%", background: color, color: "#fff", border: "none", borderRadius: "10px",
          padding: "12px 16px", font: "600 15px " + FONT, cursor: "pointer", marginTop: "14px",
          boxShadow: "0 4px 14px " + hexA(color, 0.35),
        },
        onclick: function () { self._submit(); },
      }, ["Send feedback"]);
      this._submit_btn = submit;

      var body = el("div", {}, [
        label("What's this about?"), typeRow,
        label("How was your experience?"), stars,
        label("Your message"), textarea,
        label("Attachment"), attachLabel,
        honeypot, submit, status,
      ]);
      this._body = body;

      var card = el("div", {
        "class": "jcm-card",
        style: {
          background: "#fff", borderRadius: "18px", padding: "22px", width: "min(440px, 94vw)",
          boxShadow: "0 24px 70px rgba(0,0,0,.32)", font: "14px " + FONT, color: "#0f172a",
          maxHeight: "92vh", overflow: "auto", "--jcm": color,
        },
      }, [
        el("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" } }, [
          el("div", {}, [
            el("div", { style: { fontSize: "17px", fontWeight: "700", letterSpacing: "-.01em" } }, ["Share your feedback"]),
            el("div", { style: { margin: "3px 0 0", color: "#64748b", fontSize: "13px" } }, ["We read every message — thank you for helping us improve."]),
          ]),
          el("button", { "class": "jcm-x", title: "Close", style: closeBtnStyle, onclick: this.close.bind(this) }, ["✕"]),
        ]),
        el("div", { style: { height: "14px" } }),
        body,
        footer(),
      ]);
      this._card = card;

      var overlay = el("div", {
        "class": "jcm-overlay",
        style: {
          position: "fixed", inset: "0", background: "rgba(15,23,42,.5)", backdropFilter: "blur(3px)",
          WebkitBackdropFilter: "blur(3px)", zIndex: 2147483647,
          display: "flex", alignItems: "center", justifyContent: "center", padding: "16px",
        },
        onclick: function (e) { if (e.target === overlay) self.close(); },
      }, [card]);

      this.modal = overlay;
      this._escHandler = function (e) { if (e.key === "Escape") self.close(); };
      document.addEventListener("keydown", this._escHandler);
      document.body.appendChild(overlay);
      this._refreshChips(); this._refreshStars();
      setTimeout(function () { textarea.focus(); }, 50);
    },

    _refreshChips: function () {
      var color = this.cfg.theme.color, self = this;
      [].forEach.call(this._typeRow.children, function (c) {
        Object.assign(c.style, chipStyle(c.getAttribute("data-type") === self.state.type, color));
      });
    },
    _refreshStars: function () {
      var self = this, lit = this.state.hover || this.state.rating;
      [].forEach.call(this._stars.children, function (s) {
        var i = Number(s.getAttribute("data-star"));
        s.textContent = i <= lit ? "★" : "☆";
        s.style.color = i <= lit ? "#f59e0b" : "#cbd5e1";
      });
    },
    _onFile: function (e) {
      var f = e.target.files && e.target.files[0], self = this;
      if (!f) { this._clearFile(); return; }
      if (f.size > 4 * 1024 * 1024) { this._status.style.color = "#dc2626"; this._status.textContent = "Image too large (max 4MB)."; e.target.value = ""; return; }
      var reader = new FileReader();
      reader.onload = function () {
        self.state.attachment = { filename: f.name, mime: f.type, dataUrl: reader.result };
        var txt = self._attachLabel.querySelector("[data-attach-text]");
        if (txt) txt.textContent = "✓ " + f.name + "  (tap to remove)";
        self._attachLabel.style.color = "#16a34a";
        self._attachLabel.style.borderColor = "#86efac";
      };
      reader.readAsDataURL(f);
    },
    _clearFile: function () {
      this.state.attachment = null;
      if (this._fileInput) this._fileInput.value = "";
      var txt = this._attachLabel.querySelector("[data-attach-text]");
      if (txt) txt.textContent = "Attach a screenshot (optional)";
      this._attachLabel.style.color = "#475569";
      this._attachLabel.style.borderColor = "#cbd5e1";
    },

    _submit: function () {
      var self = this, s = this.state;
      var message = this._textarea.value.trim();
      if (!message) {
        this._status.style.color = "#dc2626";
        this._status.textContent = "Please enter a message.";
        this._textarea.focus();
        return;
      }
      this._submit_btn.disabled = true;
      this._submit_btn.textContent = "Sending…";
      this._status.style.color = "#64748b";
      this._status.textContent = "";

      var payload = {
        type: s.type,
        message: message,
        rating: s.rating || null,
        _hp: this._honeypot.value,
        endUser: this.cfg.user,
        metadata: captureMetadata(),
        attachments: s.attachment ? [s.attachment] : [],
      };

      fetch(this.cfg.api + "/v1/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + this.cfg.key },
        body: JSON.stringify(payload),
      })
        .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, b: b }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.b && res.b.error || "failed");
          self._showSuccess();
        })
        .catch(function (err) {
          self._submit_btn.disabled = false;
          self._submit_btn.textContent = "Send feedback";
          self._status.style.color = "#dc2626";
          self._status.textContent = "Couldn't send: " + err.message;
        });
    },

    _showSuccess: function () {
      var self = this, color = this.cfg.theme.color;
      var success = el("div", { style: { textAlign: "center", padding: "26px 8px 14px" } }, [
        el("div", { "class": "jcm-check", style: {
          width: "58px", height: "58px", margin: "0 auto 14px", borderRadius: "999px",
          background: hexA(color, 0.12), color: color, display: "flex", alignItems: "center",
          justifyContent: "center", fontSize: "30px", fontWeight: "700",
        } }, ["✓"]),
        el("div", { style: { fontSize: "18px", fontWeight: "700" } }, ["Thank you! 🎉"]),
        el("div", { style: { color: "#64748b", marginTop: "4px", fontSize: "14px" } }, ["Your feedback has been sent to the team."]),
      ]);
      this._body.replaceWith(success);
      this._body = success;
      setTimeout(self.close.bind(self), 1600);
    },
  };

  // ---- styling helpers ----
  function chipStyle(active, color) {
    return {
      border: "1px solid " + (active ? color : "#e2e8f0"),
      background: active ? hexA(color, 0.1) : "#fff",
      color: active ? color : "#334155",
      fontWeight: active ? "600" : "500",
      borderRadius: "10px", padding: "9px 12px", cursor: "pointer",
      font: (active ? "600" : "500") + " 13px " + FONT, outline: "none", textAlign: "left",
    };
  }
  var closeBtnStyle = {
    border: "none", background: "transparent", fontSize: "16px", cursor: "pointer",
    color: "#94a3b8", borderRadius: "8px", width: "30px", height: "30px", flexShrink: "0",
    lineHeight: "1",
  };
  function label(t) {
    return el("div", { style: { margin: "14px 0 6px", fontWeight: "600", color: "#334155", fontSize: "13px" } }, [t]);
  }
  function footer() {
    return el("div", { style: {
      marginTop: "16px", paddingTop: "12px", borderTop: "1px solid #f1f5f9",
      textAlign: "center", color: "#94a3b8", font: "12px " + FONT,
    } }, ["Powered by 🍠 jicama"]);
  }
  // hex (#rrggbb) -> rgba string with alpha, for soft tints/shadows from the theme color.
  function hexA(hex, a) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
    if (!m) return "rgba(108,43,217," + a + ")";
    return "rgba(" + parseInt(m[1], 16) + "," + parseInt(m[2], 16) + "," + parseInt(m[3], 16) + "," + a + ")";
  }

  // ---- expose + auto-init from <script data-key> ----
  window.jicamaFeedback = Widget;

  var current = document.currentScript;
  if (current && current.getAttribute("data-key")) {
    Widget.init({
      key: current.getAttribute("data-key"),
      api: current.getAttribute("data-api") || undefined,
      theme: {
        color: current.getAttribute("data-color") || undefined,
        position: current.getAttribute("data-position") || undefined,
      },
    });
  }
})();
