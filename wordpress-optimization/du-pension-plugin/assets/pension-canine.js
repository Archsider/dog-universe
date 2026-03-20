/**
 * Dog Universe – Pension Canine v2.0
 * pension-canine.js — optimized, secure, cacheable
 *
 * Key changes from v1 (inline script):
 *  - Nonce added to AJAX request (CSRF fix — CRITICAL)
 *  - alert() replaced with accessible toast notifications
 *  - Intl.NumberFormat cached at module level (perf fix)
 *  - buildDogBlock() uses document.createElement (no innerHTML with user data)
 *  - var → const/let throughout
 *  - Optional chaining used consistently
 *  - Contract form selector cached once
 *  - Range input debounced (prevents render storm on drag)
 *  - localStorage writes wrapped with try/catch (private mode safety)
 */
(function () {
  "use strict";

  /* ─── Constants ─────────────────────────────────────────── */
  const RATE_STD  = 120;
  const RATE_DISC = 100;
  const THRESHOLD = 32;
  const MIN_DAYS  = 1;
  const MAX_DAYS  = 120;
  const MIN_DOGS  = 1;
  const MAX_DOGS  = 10;

  /* ─── Cached NumberFormat (FIX: was re-created on every call) */
  const numFmt = new Intl.NumberFormat("fr-MA");
  const nf = (n) => numFmt.format(n);

  /* ─── DOM helpers ────────────────────────────────────────── */
  const qs  = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];

  /* ─── Date helpers ───────────────────────────────────────── */
  const isoToFr = (iso) => {
    if (!iso) return "—";
    try {
      const d = new Date(iso + "T00:00:00");
      return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("fr-FR");
    } catch { return "—"; }
  };

  const daysBetween = (a, b) => {
    if (!a || !b) return 0;
    const ms = new Date(b + "T00:00:00") - new Date(a + "T00:00:00");
    return isNaN(ms) || ms <= 0 ? 0 : Math.floor(ms / 86400000);
  };

  const clampInt = (v, min, max) => {
    v = parseInt(v, 10);
    return isNaN(v) ? min : Math.min(Math.max(v, min), max);
  };

  /* ─── Analytics ──────────────────────────────────────────── */
  const sendConv = (evt, params = {}) => {
    try {
      if (window.gtag) { window.gtag("event", evt, params); return; }
      (window.dataLayer = window.dataLayer || []).push({ event: evt, ...params });
    } catch { /* silent — analytics must never break UX */ }
  };

  /* ─── Toast (FIX: replaces alert()) ─────────────────────── */
  let toastTimer;
  const showToast = (msg, type = "success") => {
    let el = qs("#du-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "du-toast";
      el.setAttribute("role", "alert");
      el.setAttribute("aria-live", "assertive");
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = `du-toast du-toast--${type} du-toast--visible`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("du-toast--visible"), 5000);
  };

  /* ─── Application state ──────────────────────────────────── */
  const state = {
    date_in: "", date_out: "",
    days: 5, dogs: 1,
    total: 600, rate: RATE_STD,
  };

  const persistState = () => {
    try { localStorage.setItem("du_master", JSON.stringify(state)); } catch { /* private mode */ }
  };

  const restoreState = () => {
    try {
      const raw = localStorage.getItem("du_master");
      if (!raw) return;
      const obj = JSON.parse(raw);
      if (obj && typeof obj === "object") {
        state.date_in  = obj.date_in  || "";
        state.date_out = obj.date_out || "";
        state.days     = clampInt(obj.days || 5, MIN_DAYS, MAX_DAYS);
        state.dogs     = clampInt(obj.dogs || 1, MIN_DOGS, MAX_DOGS);
      }
    } catch { /* malformed storage */ }
  };

  const currentRate = () =>
    (state.days >= THRESHOLD || state.dogs >= 2) ? RATE_DISC : RATE_STD;

  const recalc = () => {
    if (state.date_in && state.date_out) {
      const calc = daysBetween(state.date_in, state.date_out);
      if (calc > 0) state.days = clampInt(calc, MIN_DAYS, MAX_DAYS);
    }
    state.rate  = currentRate();
    state.total = state.rate * state.days * state.dogs;
    persistState();
  };

  /* ─── Dog helpers ────────────────────────────────────────── */
  const clean = (v) => (v == null ? "" : String(v).trim());

  const dogLine = (d) => {
    const parts = [];
    if (clean(d.name))   parts.push("Nom: "          + clean(d.name));
    if (clean(d.breed))  parts.push("Race: "         + clean(d.breed));
    if (clean(d.age))    parts.push("Âge: "          + clean(d.age) + " ans");
    if (clean(d.weight)) parts.push("Poids: "        + clean(d.weight) + " kg");
    if (clean(d.sex))    parts.push("Sexe: "         + clean(d.sex));
    if (clean(d.fixed))  parts.push("Stérilisation: "+ clean(d.fixed));
    if (clean(d.vax))    parts.push("Vaccins: "      + clean(d.vax));
    return "• Chien " + (d.i || "?") + (parts.length ? " — " + parts.join(" | ") : "");
  };

  /* ─── DOM builder helpers ────────────────────────────────── */
  /**
   * Create an element with props and children.
   * FIX: replaces innerHTML string concatenation — no XSS risk even if
   *      user data is ever added to future dog fields.
   */
  const mkEl = (tag, attrs = {}, children = []) => {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if      (k === "class")    el.className   = v;
      else if (k === "for")      el.htmlFor     = v;
      else if (k === "required") el.required    = Boolean(v);
      else if (k === "rows")     el.rows        = v;
      else if (k === "type")     el.type        = v;
      else if (k === "name")     el.name        = v;
      else if (k === "placeholder") el.placeholder = v;
      else                       el.setAttribute(k, v);
    });
    children.forEach((c) => {
      el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return el;
  };

  const mkInput = (type, name, placeholder, required = false) =>
    mkEl("input", { type, name, placeholder, ...(required && { required: true }) });

  const mkSelect = (name, options, required = false) => {
    const sel = mkEl("select", { name, ...(required && { required: true }) });
    options.forEach(([val, label]) => {
      const opt = mkEl("option", {}, [label]);
      opt.value = val;
      sel.appendChild(opt);
    });
    return sel;
  };

  const mkTextarea = (name, rows, placeholder) =>
    mkEl("textarea", { name, rows, placeholder });

  /** Build a single dog block using DOM API — no innerHTML with user data. */
  const buildDogBlock = (n) => {
    const card = mkEl("div", { class: "du-card du-dog-card" });
    card.appendChild(mkEl("h3", {}, [`Chien ${n}`]));

    const gridA = mkEl("div", { class: "du-grid" });
    gridA.appendChild(mkInput("text",   `dog_name_${n}`,   `Nom du chien ${n}`, true));
    gridA.appendChild(mkInput("text",   `dog_breed_${n}`,  "Race"));
    gridA.appendChild(mkInput("number", `dog_age_${n}`,    "Âge (années)"));
    gridA.appendChild(mkInput("number", `dog_weight_${n}`, "Poids (kg)"));
    gridA.appendChild(mkSelect(`dog_sex_${n}`,
      [["","Sexe"],["Mâle","Mâle"],["Femelle","Femelle"]]));
    gridA.appendChild(mkSelect(`dog_fixed_${n}`,
      [["","Stérilisation"],["Non stérilisé","Non stérilisé"],["Stérilisé","Stérilisé"]]));
    gridA.appendChild(mkSelect(`dog_vax_${n}`,
      [["","Vaccinations ?"],["oui","Oui"],["non","Non (non admissible)"]], true));
    card.appendChild(gridA);

    const gridB = mkEl("div", { class: "du-grid" });
    gridB.appendChild(mkTextarea(`dog_temper_${n}`,      3, "Tempérament (joueur, calme, sensible...)"));
    gridB.appendChild(mkTextarea(`dog_toler_dogs_${n}`,  3, "Tolérance avec les chiens"));
    card.appendChild(gridB);

    card.appendChild(mkTextarea(`dog_toler_people_${n}`, 3, "Tolérance avec les humains"));
    return card;
  };

  /* ─── Simulator DOM refs (cached once) ──────────────────── */
  const sim = {
    dateIn:    qs("#sim2_date_in"),
    dateOut:   qs("#sim2_date_out"),
    daysVal:   qs("#sim2_days_val"),
    dogsVal:   qs("#sim2_dogs_val"),
    daysOut:   qs("#sim2_days"),
    dogsOut:   qs("#sim2_dogs"),
    rateOut:   qs("#sim2_rate"),
    totalOut:  qs("#sim2_total"),
    rangeDays: qs("#sim2_days_range"),
    minusDays: qs("#sim2_minus_days"),
    plusDays:  qs("#sim2_plus_days"),
    minusDogs: qs("#sim2_minus_dogs"),
    plusDogs:  qs("#sim2_plus_dogs"),
    flagBox:   qs("#sim2_flag"),
    flagReason:qs("#sim2_flag_reason"),
    pills:     qsa("#simulateur .sim2-pill"),
  };

  /* ─── Fiche DOM refs (cached once) ──────────────────────── */
  const fiche = {
    form:       qs("#du-fiche-form"),
    dateIn:     qs("#fiche_date_in"),
    dateOut:    qs("#fiche_date_out"),
    dogsCount:  qs("#fiche_dogs_count"),
    wrapper:    qs("#du-dogs-wrapper"),
    previewBox: qs("#fiche-preview"),
    previewPre: qs("#fiche-preview-content"),
    hidDays:    qs("#fiche_sim_days"),
    hidTotal:   qs("#fiche_sim_total"),
    submitBtn:  qs("#fiche_submit"),
    aliasName:  qs("#fiche_dog_name_alias"),
    aliasVax:   qs("#fiche_dog_vax_alias"),
  };

  /* ─── Contract form ref (cached once) ───────────────────── */
  const contractForm = qs("#du-contract-block form");

  /* ─── Dog block state ────────────────────────────────────── */
  let renderedDogsCount = 0;

  const snapshotDogs = () => {
    const snap = {};
    if (!fiche.wrapper) return snap;
    qsa("input[name^=dog_], select[name^=dog_], textarea[name^=dog_]", fiche.wrapper)
      .forEach((el) => { snap[el.name] = el.value; });
    return snap;
  };

  const restoreDogs = (snap) => {
    if (!fiche.wrapper) return;
    Object.entries(snap).forEach(([name, val]) => {
      const el = fiche.wrapper.querySelector(`[name="${CSS.escape(name)}"]`);
      if (el) el.value = val;
    });
  };

  const rebuildDogs = () => {
    if (!fiche.wrapper) return;
    const count = state.dogs;
    if (count === renderedDogsCount && fiche.wrapper.children.length) return;
    const snap = snapshotDogs();
    fiche.wrapper.innerHTML = "";
    fiche.wrapper.appendChild(mkEl("h3", {}, ["Chien(s)"]));
    for (let i = 0; i < count; i++) fiche.wrapper.appendChild(buildDogBlock(i + 1));
    restoreDogs(snap);
    renderedDogsCount = count;
  };

  const syncAliases = () => {
    if (!fiche.form) return;
    const n1 = fiche.form.querySelector('input[name="dog_name_1"]');
    const v1 = fiche.form.querySelector('select[name="dog_vax_1"]');
    if (fiche.aliasName) fiche.aliasName.value = n1?.value ?? "";
    if (fiche.aliasVax)  fiche.aliasVax.value  = v1?.value ?? "";
  };

  const collectDogs = () => {
    if (!fiche.form) return { count: state.dogs, dogs: [] };
    const count = state.dogs;
    const dogs  = [];
    for (let i = 1; i <= count; i++) {
      const g = (sel) => fiche.form.querySelector(sel)?.value ?? "";
      dogs.push({
        i,
        name:        g(`input[name="dog_name_${i}"]`),
        breed:       g(`input[name="dog_breed_${i}"]`),
        age:         g(`input[name="dog_age_${i}"]`),
        weight:      g(`input[name="dog_weight_${i}"]`),
        sex:         g(`select[name="dog_sex_${i}"]`),
        fixed:       g(`select[name="dog_fixed_${i}"]`),
        vax:         g(`select[name="dog_vax_${i}"]`),
        temper:      g(`textarea[name="dog_temper_${i}"]`),
        tolerDogs:   g(`textarea[name="dog_toler_dogs_${i}"]`),
        tolerPeople: g(`textarea[name="dog_toler_people_${i}"]`),
      });
    }
    return { count, dogs };
  };

  const saveDogs = () => {
    try { localStorage.setItem("du_dogs", JSON.stringify(collectDogs())); } catch { /* private mode */ }
  };

  const loadDogs = () => {
    try {
      const raw = localStorage.getItem("du_dogs");
      if (!raw) return null;
      const obj = JSON.parse(raw);
      return (obj && typeof obj === "object") ? obj : null;
    } catch { return null; }
  };

  /* ─── Contract helpers ───────────────────────────────────── */
  const ensureHidden = (form, name) => {
    let el = form.querySelector(`[name="${CSS.escape(name)}"]`);
    if (el) return el;
    el = document.createElement("input");
    el.type = "hidden";
    el.name = name;
    form.appendChild(el);
    return el;
  };

  /* ─── AJAX config ────────────────────────────────────────── */
  const getAjaxURL = () =>
    window.duPension?.ajaxurl ?? "/wp-admin/admin-ajax.php";

  /** FIX: nonce injected by wp_localize_script via du_pension_enqueue() */
  const getNonce = () => window.duPension?.nonce ?? "";

  /* ─── Render: simulator ──────────────────────────────────── */
  const renderSim = () => {
    if (sim.daysVal)    sim.daysVal.textContent  = state.days;
    if (sim.dogsVal)    sim.dogsVal.textContent  = state.dogs;
    if (sim.daysOut)    sim.daysOut.textContent  = state.days;
    if (sim.dogsOut)    sim.dogsOut.textContent  = state.dogs;
    if (sim.rateOut)    sim.rateOut.textContent  = nf(state.rate) + " dhs/j";
    if (sim.totalOut)   sim.totalOut.textContent = nf(state.total) + " dhs";
    if (sim.rangeDays)  sim.rangeDays.value       = state.days;

    sim.pills.forEach((p) => {
      p.classList.toggle("active", parseInt(p.dataset.days, 10) === state.days);
    });

    const reasons = [];
    if (state.days >= THRESHOLD) reasons.push("Long séjour");
    if (state.dogs >= 2)         reasons.push("Multi-chiens");
    if (sim.flagBox && sim.flagReason) {
      sim.flagBox.hidden          = !reasons.length;
      sim.flagReason.textContent  = reasons.join(" + ");
    }
  };

  /* ─── Render: contract preview ───────────────────────────── */
  const pushContractDogs = (form) => {
    if (!form) return;
    const payload = loadDogs() ?? collectDogs();

    ensureHidden(form, "dogs_json").value  = JSON.stringify(payload);
    ensureHidden(form, "dogs_count").value = String(payload.count ?? state.dogs ?? 1);

    const lines = (payload.dogs ?? []).map(dogLine).join("\n");
    ensureHidden(form, "dogs_text").value  = lines;

    const rec = qs("#ct_preview_dogs");
    if (rec) rec.textContent = lines || "—";
  };

  const pushToContract = () => {
    if (!contractForm) return;

    const setField = (names, val) => {
      for (const name of names) {
        const inp = contractForm.querySelector(`[name="${name}"]`);
        if (inp && inp.value !== val) {
          inp.value = val;
          ["input", "change"].forEach((evt) =>
            inp.dispatchEvent(new Event(evt, { bubbles: true }))
          );
          return;
        }
      }
    };

    if (state.date_in)  setField(["start_date","date_in","checkin","arrival","start"],   state.date_in);
    if (state.date_out) setField(["end_date","date_out","checkout","departure","end"],    state.date_out);

    const daysEl  = qs("#ct_preview_days");
    const rateEl  = qs("#ct_preview_rate");
    const totalEl = qs("#ct_preview_total");
    if (daysEl)  daysEl.textContent  = state.days  ? String(state.days)      : "—";
    if (rateEl)  rateEl.textContent  = state.days  ? nf(state.rate)+" dhs/j" : "—";
    if (totalEl) totalEl.textContent = state.total ? nf(state.total)+" dhs"  : "—";

    pushContractDogs(contractForm);
  };

  /* ─── Render: fiche ──────────────────────────────────────── */
  const updatePreview = () => {
    if (!fiche.form || !fiche.previewBox || !fiche.previewPre) return;
    syncAliases();
    saveDogs();
    pushContractDogs(contractForm);

    const fd  = new FormData(fiche.form);
    const out = [];
    fd.forEach((v, k) => { if (v && k !== "hp_url") out.push(`${k}: ${v}`); });
    fiche.previewPre.textContent = out.join("\n");
    fiche.previewBox.style.display = out.length ? "block" : "none";
  };

  const pushToFiche = () => {
    if (!fiche.form) return;
    if (fiche.dateIn  && state.date_in  && fiche.dateIn.value  !== state.date_in)  fiche.dateIn.value  = state.date_in;
    if (fiche.dateOut && state.date_out && fiche.dateOut.value !== state.date_out)  fiche.dateOut.value = state.date_out;
    if (fiche.dogsCount && String(fiche.dogsCount.value) !== String(state.dogs))    fiche.dogsCount.value = state.dogs;
    if (fiche.hidDays)  fiche.hidDays.value  = state.days;
    if (fiche.hidTotal) fiche.hidTotal.value = state.total;
    rebuildDogs();
    syncAliases();
    updatePreview();
  };

  const pullFromFiche = () => {
    if (!fiche.form) return;
    if (fiche.dateIn)    state.date_in  = fiche.dateIn.value  || "";
    if (fiche.dateOut)   state.date_out = fiche.dateOut.value || "";
    if (fiche.dogsCount) state.dogs     = clampInt(fiche.dogsCount.value, MIN_DOGS, MAX_DOGS);
    recalc();
    renderAll();
  };

  const renderAll = () => {
    renderSim();
    pushToFiche();
    pushToContract();
  };

  /* ─── Form validation ────────────────────────────────────── */
  const beforeSubmit = () => {
    if (!fiche.dateIn?.value || !fiche.dateOut?.value) {
      showToast("Merci de renseigner les dates (entrée + sortie).", "error");
      return false;
    }
    if (daysBetween(fiche.dateIn.value, fiche.dateOut.value) <= 0) {
      showToast("Dates invalides : la sortie doit être après l'entrée.", "error");
      return false;
    }
    return true;
  };

  /* ─── Form submit ────────────────────────────────────────── */
  if (fiche.form) {
    fiche.form.addEventListener("submit", (e) => {
      e.preventDefault();

      // Honeypot — client-side guard (server enforces this too)
      const hp = fiche.form.querySelector('input[name="hp_url"]');
      if (hp?.value) return;
      if (!beforeSubmit()) return;

      syncAliases();
      saveDogs();

      const fd = new FormData(fiche.form);
      fd.append("action", "du_send_fiche");
      fd.append("nonce",  getNonce()); // FIX: nonce for CSRF protection

      // Compat: some plugins expect dog_name / dog_vax at top level
      const dn1 = fd.get("dog_name_1") || "";
      const vx1 = fd.get("dog_vax_1")  || "";
      if (!fd.get("dog_name") && dn1) fd.append("dog_name", dn1);
      if (!fd.get("dog_vax")  && vx1) fd.append("dog_vax",  vx1);

      let oldText = "";
      if (fiche.submitBtn) {
        fiche.submitBtn.disabled = true;
        oldText = fiche.submitBtn.textContent;
        fiche.submitBtn.textContent = "Envoi…";
      }

      fetch(getAjaxURL(), { method: "POST", body: fd, credentials: "same-origin" })
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then((json) => {
          if (json?.success) {
            showToast("Fiche envoyée ✓ Nous vous contactons très vite.", "success");
            sendConv("fiche_sent", { dogs: state.dogs, days: state.days });
            try { fiche.form.reset(); } catch { /* noop */ }
            Object.assign(state, { date_in: "", date_out: "", days: 5, dogs: 1 });
            renderedDogsCount = 0;
            recalc();
            renderAll();
          } else {
            const msg = json?.data?.message || "Erreur inconnue";
            showToast("Envoi impossible. " + msg, "error");
          }
        })
        .catch(() => showToast("Problème réseau. Réessayez dans un instant.", "error"))
        .finally(() => {
          if (fiche.submitBtn) {
            fiche.submitBtn.disabled = false;
            fiche.submitBtn.textContent = oldText || "Envoyer la fiche";
          }
        });
    }, { passive: false });
  }

  /* ─── Simulator events ───────────────────────────────────── */
  const setDays = (v) => { state.days = clampInt(v, MIN_DAYS, MAX_DAYS); recalc(); renderAll(); };
  const setDogs = (v) => { state.dogs = clampInt(v, MIN_DOGS, MAX_DOGS); recalc(); renderAll(); };

  sim.minusDays?.addEventListener("click", () => setDays(state.days - 1));
  sim.plusDays?.addEventListener("click",  () => setDays(state.days + 1));
  sim.minusDogs?.addEventListener("click", () => setDogs(state.dogs - 1));
  sim.plusDogs?.addEventListener("click",  () => setDogs(state.dogs + 1));

  // FIX: debounce range input — prevents render storm on fast drag
  let rangeTimer;
  sim.rangeDays?.addEventListener("input", (e) => {
    clearTimeout(rangeTimer);
    rangeTimer = setTimeout(() => setDays(e.target.value), 30);
  });

  sim.pills.forEach((p) => p.addEventListener("click", () => setDays(p.dataset.days)));

  sim.dateIn?.addEventListener("change",  (e) => { state.date_in  = e.target.value; recalc(); renderAll(); });
  sim.dateOut?.addEventListener("change", (e) => { state.date_out = e.target.value; recalc(); renderAll(); });

  /* ─── Fiche events ───────────────────────────────────────── */
  fiche.dateIn?.addEventListener("change",    pullFromFiche);
  fiche.dateOut?.addEventListener("change",   pullFromFiche);
  fiche.dogsCount?.addEventListener("change", pullFromFiche);
  fiche.form?.addEventListener("input",       updatePreview);

  /* ─── FAQ accordion ──────────────────────────────────────── */
  qsa(".du-acc-item").forEach((item) => {
    const btn = qs(".du-acc-btn", item);
    if (!btn) return;
    btn.addEventListener("click", () => {
      const open = item.classList.toggle("active");
      btn.setAttribute("aria-expanded", String(open));
    });
  });

  /* ─── CTA tracking ───────────────────────────────────────── */
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-cta]");
    if (a) sendConv("cta_click", { cta_id: a.dataset.cta, location: location.pathname });
  });

  /* ─── Smooth scroll ──────────────────────────────────────── */
  qsa('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const sel = a.getAttribute("href");
      if (!sel || sel === "#") return;
      const target = qs(sel);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }, { passive: false });
  });

  /* ─── Init ───────────────────────────────────────────────── */
  restoreState();
  if (sim.dateIn  && state.date_in)  sim.dateIn.value  = state.date_in;
  if (sim.dateOut && state.date_out) sim.dateOut.value = state.date_out;
  recalc();
  renderAll();

})();
