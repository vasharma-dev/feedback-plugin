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
      ".jcm-x:hover{background:rgba(128,128,128,.18)}" +
      ".jcm-ta{transition:border-color .12s ease, box-shadow .12s ease}" +
      ".jcm-ta:focus{border-color:var(--jcm)!important;box-shadow:0 0 0 3px color-mix(in srgb,var(--jcm) 22%,transparent)}" +
      ".jcm-ta::placeholder{color:#94a3b8}" +
      ".jcm-submit{transition:filter .12s ease, transform .1s ease}" +
      ".jcm-submit:hover:not(:disabled){filter:brightness(1.08)}" +
      ".jcm-submit:active:not(:disabled){transform:translateY(1px)}" +
      ".jcm-submit:disabled{opacity:.6;cursor:default}" +
      ".jcm-attach{transition:border-color .12s ease,background .12s ease}" +
      ".jcm-attach:hover{border-color:var(--jcm);background:rgba(128,128,128,.08)}" +
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
        theme: Object.assign(
          {
            color: "#6C2BD9",
            position: "bottom-right",
            launcherText: "Feedback",
            launcherIcon: "💬",
            headerTitle: "Share your feedback",
            headerSubtitle: "We read every message — thank you for helping us improve.",
            dialogBg: "#ffffff",
            emailField: "optional", // off | optional | required
            hideBranding: false,
          },
          opts.theme || {}
        ),
      };
      if (!this.cfg.key) return console.error("[jicama] missing data-key");
      injectStyles();
      this._mount();
      this._loadConfig(); // pull the project's saved theme from the server, then re-render
      return this;
    },

    // The dashboard is the source of truth for branding: fetch the project's theme and
    // apply it, so changing the look in the dashboard updates every embed — no code edits.
    _loadConfig: function () {
      var self = this;
      if (!window.fetch) return;
      fetch(this.cfg.api + "/v1/config", { headers: { Authorization: "Bearer " + this.cfg.key } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (cfg) {
          if (!cfg || !cfg.theme) return;
          Object.assign(self.cfg.theme, cfg.theme);
          if (!self.state.open) self._mount(); // refresh the launcher (skip if modal is open)
        })
        .catch(function () {});
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
          background: color, color: fgOn(color), border: "none", borderRadius: "999px",
          padding: "12px 18px 12px 16px", font: "600 14px " + FONT, cursor: "pointer",
          boxShadow: "0 6px 20px rgba(0,0,0,.22)", display: "flex", alignItems: "center", gap: "8px",
        }, pos),
        onclick: this.open.bind(this),
      }, [
        el("span", { style: { fontSize: "16px", lineHeight: "1" } }, [this.cfg.theme.launcherIcon || "💬"]),
        this.cfg.theme.launcherText || "Feedback",
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
      if (this._escHandler) { document.removeEventListener("keydown", this._escHandler); this._escHandler = null; }
      // Restore the page's scrolling exactly as it was before we opened.
      if (this._prevBodyOverflow !== undefined) {
        document.body.style.overflow = this._prevBodyOverflow;
        this._prevBodyOverflow = undefined;
      }
      if (this.modal) { this.modal.remove(); this.modal = null; }
    },

    _renderModal: function () {
      var self = this, color = this.cfg.theme.color;
      var pal = paletteFor(this.cfg.theme.dialogBg || "#fff");
      this._pal = pal;

      var typeRow = el("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" } },
        TYPES.map(function (t) {
          return el("button", {
            "class": "jcm-chip", "data-type": t.id, title: t.hint,
            style: chipStyle(t.id === self.state.type, color, pal),
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
          border: "1px solid " + pal.inputBorder, borderRadius: "10px", font: "14px " + FONT,
          resize: "vertical", color: pal.text, outline: "none", background: pal.inputBg,
        },
      });
      this._textarea = textarea;

      // Reporter email — per-org config: off | optional | required. Prefilled from SDK user.
      var emailMode = this.cfg.theme.emailField || "optional";
      var emailInput = null;
      this._email = null;
      if (emailMode !== "off") {
        emailInput = el("input", {
          "class": "jcm-ta", type: "email",
          placeholder: emailMode === "required" ? "you@example.com" : "you@example.com (optional)",
          autocomplete: "email", value: (this.cfg.user && this.cfg.user.email) || "",
          style: {
            width: "100%", boxSizing: "border-box", padding: "11px 12px", marginTop: "2px",
            border: "1px solid " + pal.inputBorder, borderRadius: "10px", font: "14px " + FONT,
            color: pal.text, outline: "none", background: pal.inputBg,
          },
        });
        this._email = emailInput;
      }

      // Styled attach control hiding the native file input.
      var fileInput = el("input", { type: "file", accept: "image/*",
        style: { display: "none" }, onchange: function (e) { self._onFile(e); } });
      this._fileInput = fileInput;
      var attachLabel = el("div", { "class": "jcm-attach",
        style: {
          display: "flex", alignItems: "center", gap: "8px", marginTop: "2px",
          border: "1px dashed " + pal.attachBorder, borderRadius: "10px", padding: "10px 12px",
          color: pal.muted, font: "13px " + FONT, cursor: "pointer",
        },
        onclick: function () { if (self.state.attachment) { self._clearFile(); } else { fileInput.click(); } },
      }, ["📎 ", el("span", { "data-attach-text": "1" }, ["Attach a screenshot (optional)"]), fileInput]);
      this._attachLabel = attachLabel;

      // Honeypot: hidden from humans, tempting to bots.
      var honeypot = el("input", { type: "text", name: "website", tabindex: "-1",
        autocomplete: "off", "aria-hidden": "true",
        style: { position: "absolute", left: "-9999px", opacity: "0", height: "0", width: "0" } });
      this._honeypot = honeypot;

      var status = el("div", { style: { font: "13px " + FONT, minHeight: "18px", color: pal.muted, marginTop: "8px" } });
      this._status = status;

      var submit = el("button", {
        "class": "jcm-submit",
        style: {
          width: "100%", background: color, color: fgOn(color), border: "none", borderRadius: "10px",
          padding: "12px 16px", font: "600 15px " + FONT, cursor: "pointer", marginTop: "14px",
          boxShadow: "0 4px 14px " + hexA(color, 0.35),
        },
        onclick: function () { self._submit(); },
      }, ["Send feedback"]);
      this._submit_btn = submit;

      var body = el("div", {}, [
        label("What's this about?", pal), typeRow,
        label("How was your experience?", pal), stars,
        label("Your message", pal), textarea,
        emailInput ? label(emailMode === "required" ? "Your email *" : "Your email", pal) : null, emailInput,
        label("Attachment", pal), attachLabel,
        honeypot, submit, status,
      ]);
      this._body = body;

      var card = el("div", {
        "class": "jcm-card",
        style: {
          background: this.cfg.theme.dialogBg || "#fff", borderRadius: "18px", padding: "22px", width: "min(440px, 94vw)",
          boxShadow: "0 24px 70px rgba(0,0,0,.32)", font: "14px " + FONT, color: pal.text,
          maxHeight: "92vh", overflowY: "auto", overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch", "--jcm": color,
        },
      }, [
        el("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" } }, [
          el("div", {}, [
            el("div", { style: { fontSize: "17px", fontWeight: "700", letterSpacing: "-.01em" } }, [this.cfg.theme.headerTitle || "Share your feedback"]),
            el("div", { style: { margin: "3px 0 0", color: pal.muted, fontSize: "13px" } }, [this.cfg.theme.headerSubtitle || "We read every message — thank you for helping us improve."]),
          ]),
          el("button", { "class": "jcm-x", title: "Close", style: closeBtnStyle(pal), onclick: this.close.bind(this) }, ["✕"]),
        ]),
        el("div", { style: { height: "14px" } }),
        body,
        this.cfg.theme.hideBranding ? null : footer(pal),
      ]);
      this._card = card;

      var overlay = el("div", {
        "class": "jcm-overlay",
        style: {
          position: "fixed", inset: "0", background: "rgba(15,23,42,.5)", backdropFilter: "blur(3px)",
          WebkitBackdropFilter: "blur(3px)", zIndex: 2147483647,
          display: "flex", alignItems: "center", justifyContent: "center", padding: "16px",
          overflowY: "auto", overscrollBehavior: "contain",
        },
        onclick: function (e) { if (e.target === overlay) self.close(); },
      }, [card]);

      this.modal = overlay;
      this._escHandler = function (e) { if (e.key === "Escape") self.close(); };
      document.addEventListener("keydown", this._escHandler);
      // Lock background scrolling so the wheel/touch acts on the dialog, not the page.
      this._prevBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      document.body.appendChild(overlay);
      this._refreshChips(); this._refreshStars();
      setTimeout(function () { textarea.focus(); }, 50);
    },

    _refreshChips: function () {
      var color = this.cfg.theme.color, self = this, pal = this._pal;
      [].forEach.call(this._typeRow.children, function (c) {
        Object.assign(c.style, chipStyle(c.getAttribute("data-type") === self.state.type, color, pal));
      });
    },
    _refreshStars: function () {
      var self = this, lit = this.state.hover || this.state.rating;
      [].forEach.call(this._stars.children, function (s) {
        var i = Number(s.getAttribute("data-star"));
        s.textContent = i <= lit ? "★" : "☆";
        s.style.color = i <= lit ? "#f59e0b" : self._pal.starOff;
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
      this._attachLabel.style.color = this._pal.muted;
      this._attachLabel.style.borderColor = this._pal.attachBorder;
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
      // Email field is per-org: off (no field) | optional | required.
      var emailMode = this.cfg.theme.emailField || "optional";
      var email = (this._email && this._email.value || "").trim();
      if (this._email && emailMode === "required" && !email) {
        this._status.style.color = "#dc2626";
        this._status.textContent = "Please enter your email.";
        this._email.focus();
        return;
      }
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        this._status.style.color = "#dc2626";
        this._status.textContent = "Please enter a valid email" + (emailMode === "required" ? "." : " (or leave it blank).");
        this._email.focus();
        return;
      }
      // Merge the typed email over any SDK-provided user context.
      var endUser = email ? Object.assign({}, this.cfg.user, { email: email }) : this.cfg.user;

      this._submit_btn.disabled = true;
      this._submit_btn.textContent = "Sending…";
      this._status.style.color = this._pal.muted;
      this._status.textContent = "";

      var payload = {
        type: s.type,
        message: message,
        rating: s.rating || null,
        _hp: this._honeypot.value,
        endUser: endUser,
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
        el("div", { style: { color: this._pal.muted, marginTop: "4px", fontSize: "14px" } }, ["Your feedback has been sent to the team."]),
      ]);
      this._body.replaceWith(success);
      this._body = success;
      setTimeout(self.close.bind(self), 1600);
    },
  };

  // ---- styling helpers ----
  // Pick a readable text palette based on how dark the dialog background is, so a dark
  // dialogBg automatically gets light text (and vice-versa).
  function paletteFor(bg) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(bg || "");
    var r = m ? parseInt(m[1], 16) : 255, g = m ? parseInt(m[2], 16) : 255, b = m ? parseInt(m[3], 16) : 255;
    var dark = (0.299 * r + 0.587 * g + 0.114 * b) < 140; // perceived luminance
    return dark
      ? { text: "#f1f5f9", muted: "#94a3b8", label: "#cbd5e1", inputBg: "rgba(255,255,255,.06)",
          inputBorder: "rgba(255,255,255,.18)", chipBg: "rgba(255,255,255,.06)", chipBorder: "rgba(255,255,255,.18)",
          chipText: "#cbd5e1", attachBorder: "rgba(255,255,255,.25)", footerBorder: "rgba(255,255,255,.12)", starOff: "#475569" }
      : { text: "#0f172a", muted: "#64748b", label: "#334155", inputBg: "#fff",
          inputBorder: "#e2e8f0", chipBg: "#fff", chipBorder: "#e2e8f0",
          chipText: "#334155", attachBorder: "#cbd5e1", footerBorder: "#f1f5f9", starOff: "#cbd5e1" };
  }
  function chipStyle(active, color, pal) {
    return {
      border: "1px solid " + (active ? color : pal.chipBorder),
      background: active ? hexA(color, 0.16) : pal.chipBg,
      color: active ? color : pal.chipText,
      fontWeight: active ? "600" : "500",
      borderRadius: "10px", padding: "9px 12px", cursor: "pointer",
      font: (active ? "600" : "500") + " 13px " + FONT, outline: "none", textAlign: "left",
    };
  }
  function closeBtnStyle(pal) {
    return {
      border: "none", background: "transparent", fontSize: "16px", cursor: "pointer",
      color: pal.muted, borderRadius: "8px", width: "30px", height: "30px", flexShrink: "0",
      lineHeight: "1",
    };
  }
  function label(t, pal) {
    return el("div", { style: { margin: "14px 0 6px", fontWeight: "600", color: pal.label, fontSize: "13px" } }, [t]);
  }
  function footer(pal) {
    return el("div", { style: {
      marginTop: "16px", paddingTop: "12px", borderTop: "1px solid " + pal.footerBorder,
      textAlign: "center", color: pal.muted, font: "12px " + FONT,
    } }, ["Powered by 🍠 jicama"]);
  }
  // Readable foreground (white or near-black) to place ON the brand color — so a light accent
  // (e.g. pale yellow) gets dark text on its buttons instead of unreadable white.
  function fgOn(hex) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
    if (!m) return "#fff";
    var lum = 0.299 * parseInt(m[1], 16) + 0.587 * parseInt(m[2], 16) + 0.114 * parseInt(m[3], 16);
    return lum > 150 ? "#0f172a" : "#fff";
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
