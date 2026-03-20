# Dog Universe – Pension Canine: Full WordPress Audit Report

**Audited by:** Senior WordPress Core Developer · Web Performance Engineer · Cybersecurity Engineer · Technical SEO Expert
**Date:** 2026-03-20
**Verdict:** ❌ NOT production-grade — Critical security and performance issues found.

---

## STEP 1 — CODEBASE ANALYSIS

### How the site works

The page is a **Divi custom HTML block** containing a single self-contained component (`#du-pension-canine`) for a dog boarding service in Marrakech. It includes:

- **Pre-hero banner** — tagline bar
- **Hero section** — H1, AVIF image (LCP candidate), trust bar, CTA buttons
- **Why section** — 4 feature cards
- **CTA band** — conversion strip
- **Gallery** — 4 AVIF images in a grid
- **Pricing** — 2 rate cards
- **Price simulator** — interactive JS widget (date pickers, day/dog counters, pills)
- **Dog info form** — multi-dog AJAX form, honeypot, localStorage sync
- **Contract section** — shortcode `[du_contract_form]` + preview panel
- **FAQ** — JS accordion

**State management:** A single `master` object is kept in sync across the simulator, the fiche form, and the contract block. It persists to `localStorage`. Dog data is serialized separately as `du_dogs`.

**AJAX:** Form submits to `wp-admin/admin-ajax.php` with action `du_send_fiche`. No nonce is sent from the client — server-side verification unknown.

---

## STEP 2 — PERFORMANCE AUDIT

| # | Issue | Severity | Impact |
|---|-------|----------|--------|
| 1 | **`<style>` block inline in body** — ~6 KB of CSS injected into body, not cached by browser, causes FOUC risk, repeated parse on every page load | HIGH | Cache miss every load |
| 2 | **`<script>` block inline in body** — ~8 KB of JS not deferred, not cached | HIGH | Parse blocks rendering |
| 3 | **`Intl.NumberFormat` recreated on every `nf()` call** — `new Intl.NumberFormat("fr-MA")` inside a function called dozens of times per interaction | MEDIUM | CPU waste on every recalc |
| 4 | **`scroll-behavior: auto !important` on `:root`** — disables native smooth scroll, then JS re-implements it manually — redundant conflict | LOW | Confusing, janky scroll |
| 5 | **AVIF-only images, no JPEG/WebP fallback** — `<source type="image/avif">` is the only source; older Safari and some Android browsers fall back to the `<img src>` which is also the AVIF — identical, so no fallback exists | MEDIUM | Broken image on unsupported browsers |
| 6 | **Gallery `<source>` missing `sizes` attribute** — browser can't determine optimal image size to request | MEDIUM | Oversized image downloads |
| 7 | **Hero image missing explicit `sizes` attribute on `<source>`** — though `<img>` has it, the `<source>` element overrides without a sizes hint | LOW | Sub-optimal image selection |
| 8 | **`collectDogs()` called twice per `updatePreview()`** → `updatePreview()` → `pushToContractDogs()` → `collectDogs()`, and again via `saveDogs()` | LOW | Redundant DOM reads |
| 9 | **`content-visibility: auto` on sections inside an overflow:hidden parent** — the `#du-pension-canine` uses `overflow-x:hidden` which may defeat the rendering skip optimization | LOW | Optimization negated |

### What slows the site most
1. Inline CSS/JS — no HTTP caching, re-parsed on every load
2. AVIF-only with no fallback — potential 0-byte image renders
3. No preload hint for LCP image (hero)
4. NumberFormat allocation on every keystroke in the simulator

---

## STEP 3 — SECURITY AUDIT

| # | Issue | Severity | File/Location |
|---|-------|----------|---------------|
| 1 | **No nonce in AJAX request** — `fd.append("action","du_send_fiche")` is sent with no `wp_create_nonce()` value. Without server-side nonce verification, any site can forge a cross-origin form submission | **CRITICAL** | JS, line ~`fd.append("action","du_send_fiche")` |
| 2 | **Honeypot is client-side only** — `if(hp && hp.value) return;` — an attacker disabling JS or crafting a raw POST bypasses this entirely. Server-side check is mandatory | **HIGH** | JS, submit handler |
| 3 | **`localStorage` stores reservation data indefinitely** — `du_master` and `du_dogs` contain dates, pet names, owner data. This survives sessions, browser restarts, and is accessible to any JS on the page (XSS vector) | **MEDIUM** | JS, `persist()` / `saveDogs()` |
| 4 | **`innerHTML` used for dog block construction** — `fiche.dogsWrapper.innerHTML = html` — while current input is static (index numbers only), this pattern is fragile; future edits could introduce XSS if user data is ever interpolated | **MEDIUM** | JS, `dogBlock()` + `rebuildDogsIfNeeded()` |
| 5 | **`alert()` used for UX errors** — can be suppressed by browsers or popup blockers, causing silent failures. Also reveals internal error messages from server | **LOW** | JS, submit handler |
| 6 | **No `rel="noopener noreferrer"` on `tel:` link** — minor but the `<a href="tel:...">` link should include `rel="nofollow"` (already present) — acceptable |  LOW | HTML, CTA band |
| 7 | **Server-side sanitization unknown** — the AJAX handler (`du_send_fiche`) is not visible in this codebase. If it does not use `sanitize_text_field()`, `sanitize_email()`, `absint()`, `wp_kses()` and nonce verification, SQL injection and email injection are possible | **CRITICAL** | PHP (not visible) |

---

## STEP 4 — SEO & STRUCTURE

| # | Issue | Severity |
|---|-------|----------|
| 1 | **Potential duplicate H1** — this block renders an `<h1>` inside a Divi module. If the WordPress page also has an H1 (from the theme or Divi title), there will be two H1s on the page. Google may get confused about the primary topic | HIGH |
| 2 | **No Schema markup** — no `LocalBusiness`, `FAQPage`, or `PriceSpecification` structured data. Competitors with schema get rich results (star ratings, FAQ boxes, price snippets) | HIGH |
| 3 | **FAQ content hidden with `max-height: 0`** — Googlebot can index hidden accordion content in 2025, but schema is still needed for rich result eligibility | MEDIUM |
| 4 | **No `<meta name="description">` or Open Graph tags** visible in this block — should be set at theme/SEO-plugin level | MEDIUM |
| 5 | **Gallery images have good alt text** ✅ | — |
| 6 | **Hero image has `fetchpriority="high"` and `loading="eager"`** ✅ | — |
| 7 | **Heading hierarchy is correct** (H1 → H2 → H3) ✅ | — |

---

## STEP 5 — CODE QUALITY

| # | Issue | Severity |
|---|-------|----------|
| 1 | **`var` used throughout JS** — should be `const`/`let` for block scoping | MEDIUM |
| 2 | **`dogBlock()` builds HTML via string concatenation** — bad pattern, XSS risk if user data ever touches it | MEDIUM |
| 3 | **Optional chaining `?.` used inconsistently** — some places use `?.value`, others `if(el) el.value` — pick one | LOW |
| 4 | **`alert()` for user-facing messages** — blocks main thread, suppressible | LOW |
| 5 | **Repeated `qs()`/`qsa()` calls in render functions** — selectors are cached once at IIFE start (good), but `qs("#du-contract-block form")` is re-queried on every `pushToContract()` call | LOW |
| 6 | **Emojis directly in `<h3>` text nodes** — screen readers announce "tree emoji Un vaste espace de liberté" | LOW |
| 7 | **`try/catch` with empty `catch` blocks** — `catch(e){}` swallows errors silently | LOW |
| 8 | **`localStorage.getItem("du_master")` and `setItem` without quota check** — in private browsing mode, `setItem` throws a `QuotaExceededError` | LOW |

---

## STEP 6 — EXACT FIXES

### FIX 1 — CRITICAL: Add nonce to AJAX request

**File:** inline JS → `pension-canine.js` (after extraction)
**Problem:** CSRF possible — no nonce sent with form submission.

**Fix in PHP (plugin file):**
```php
// Enqueue script and pass nonce
wp_localize_script( 'du-pension-js', 'duPension', [
    'ajaxurl' => admin_url( 'admin-ajax.php' ),
    'nonce'   => wp_create_nonce( 'du_fiche_nonce' ),
]);
```

**Fix in AJAX handler (PHP):**
```php
function du_handle_fiche() {
    if ( ! check_ajax_referer( 'du_fiche_nonce', 'nonce', false ) ) {
        wp_send_json_error( [ 'message' => 'Token de sécurité invalide.' ], 403 );
    }
    // ... rest of handler
}
```

**Fix in JS:**
```js
// Replace:
fd.append("action", "du_send_fiche");

// With:
fd.append("action", "du_send_fiche");
fd.append("nonce", window.duPension?.nonce ?? "");
```

---

### FIX 2 — CRITICAL: Server-side sanitization in AJAX handler

**File:** WordPress plugin PHP
**Problem:** Unknown sanitization. Provide complete safe handler.

```php
function du_handle_fiche() {
    // 1. Nonce check
    if ( ! check_ajax_referer( 'du_fiche_nonce', 'nonce', false ) ) {
        wp_send_json_error( [ 'message' => 'Token invalide.' ], 403 );
    }

    // 2. Honeypot (server-side)
    if ( ! empty( $_POST['hp_url'] ) ) {
        wp_send_json_success(); // Silent — do not reveal detection
        return;
    }

    // 3. Sanitize all fields
    $owner_name  = sanitize_text_field( $_POST['owner_name']  ?? '' );
    $owner_phone = sanitize_text_field( $_POST['owner_phone'] ?? '' );
    $owner_email = sanitize_email(      $_POST['owner_email'] ?? '' );
    $date_in     = sanitize_text_field( $_POST['date_in']     ?? '' );
    $date_out    = sanitize_text_field( $_POST['date_out']    ?? '' );
    $dogs_count  = absint(              $_POST['dogs_count']  ?? 1  );
    $diet        = sanitize_textarea_field( $_POST['diet']  ?? '' );
    $meds        = sanitize_textarea_field( $_POST['meds']  ?? '' );
    $notes       = sanitize_textarea_field( $_POST['notes'] ?? '' );
    $sim_days    = absint( $_POST['sim_days']  ?? 0 );
    $sim_total   = absint( $_POST['sim_total'] ?? 0 );
    $dogs_text   = sanitize_textarea_field( $_POST['dogs_text'] ?? '' );

    // 4. Validate
    if ( ! is_email( $owner_email ) ) {
        wp_send_json_error( [ 'message' => 'Adresse e-mail invalide.' ] );
    }
    if ( empty( $owner_name ) || empty( $owner_phone ) ) {
        wp_send_json_error( [ 'message' => 'Nom et téléphone obligatoires.' ] );
    }
    $ts_in  = strtotime( $date_in );
    $ts_out = strtotime( $date_out );
    if ( ! $ts_in || ! $ts_out || $ts_out <= $ts_in ) {
        wp_send_json_error( [ 'message' => 'Dates invalides.' ] );
    }

    // 5. Build email (no SQL — using wp_mail only)
    $subject = sprintf( '[Pension] %s — %s → %s', $owner_name, $date_in, $date_out );
    $body  = "Propriétaire : $owner_name\n";
    $body .= "Téléphone    : $owner_phone\n";
    $body .= "Email        : $owner_email\n";
    $body .= "Entrée       : $date_in\nSortie : $date_out\n";
    $body .= "Chiens       : $dogs_count\n\n$dogs_text\n\n";
    $body .= "Alimentation : $diet\nMédicaments : $meds\nNotes : $notes\n";
    $body .= "\n[Simulateur] Jours : $sim_days | Total : {$sim_total} dhs";

    $headers = [
        'Content-Type: text/plain; charset=UTF-8',
        'Reply-To: ' . sanitize_email( $owner_email ),
    ];

    if ( wp_mail( get_option('admin_email'), $subject, $body, $headers ) ) {
        wp_send_json_success( [ 'message' => 'Fiche envoyée.' ] );
    } else {
        wp_send_json_error( [ 'message' => "Erreur d'envoi. Contactez-nous par téléphone." ] );
    }
}
add_action( 'wp_ajax_du_send_fiche',        'du_handle_fiche' );
add_action( 'wp_ajax_nopriv_du_send_fiche', 'du_handle_fiche' );
```

---

### FIX 3 — HIGH: Extract inline CSS/JS to enqueued files

**File:** WordPress theme/plugin
**Problem:** ~14 KB of CSS+JS inline, never cached.

```php
function du_pension_enqueue() {
    // Only load on pages containing the shortcode
    global $post;
    if ( ! is_a( $post, 'WP_Post' ) ) return;
    if ( ! has_shortcode( $post->post_content, 'du_pension' ) ) return;

    wp_enqueue_style(
        'du-pension',
        plugin_dir_url( __FILE__ ) . 'assets/pension-canine.css',
        [],
        '2.0.0'
    );

    wp_enqueue_script(
        'du-pension',
        plugin_dir_url( __FILE__ ) . 'assets/pension-canine.js',
        [],
        '2.0.0',
        [ 'strategy' => 'defer', 'in_footer' => true ]
    );

    wp_localize_script( 'du-pension', 'duPension', [
        'ajaxurl' => admin_url( 'admin-ajax.php' ),
        'nonce'   => wp_create_nonce( 'du_fiche_nonce' ),
    ]);
}
add_action( 'wp_enqueue_scripts', 'du_pension_enqueue' );
```

**Benefit:** Browser caches CSS+JS with versioned URL. First load parses once; subsequent visits serve from disk cache.

---

### FIX 4 — HIGH: Replace `innerHTML` dog block with DOM API

**Problem:** `fiche.dogsWrapper.innerHTML = html` — string concatenation is an XSS anti-pattern.

**Fix:** Use `document.createElement` (see `pension-canine.js` — `buildDogBlock()` function).

---

### FIX 5 — MEDIUM: Cache `Intl.NumberFormat` instance

**Problem:** `new Intl.NumberFormat("fr-MA")` runs inside `nf()` which is called on every keystroke.

```js
// BEFORE (inside IIFE, called per interaction):
function nf(n) {
    return new Intl.NumberFormat("fr-MA").format(n);
}

// AFTER (create once):
const numFmt = new Intl.NumberFormat("fr-MA");
const nf = (n) => numFmt.format(n);
```

---

### FIX 6 — MEDIUM: Replace `alert()` with toast notification

**Problem:** `alert()` blocks main thread, suppressible by browsers.

```js
// Toast implementation (see pension-canine.js — showToast())
const showToast = (msg, type = "success") => {
    let el = document.querySelector("#du-toast");
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
```

---

### FIX 7 — HIGH: Add Schema markup for SEO

**Add inside HTML template** (after opening `<div id="du-pension-canine">`):

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "LocalBusiness",
      "name": "Dog Universe",
      "description": "Pension canine premium à Marrakech — sans cages, groupes supervisés, hygiène vapeur",
      "url": "https://www.doguniverse.ma",
      "telephone": "+212669183981",
      "address": {
        "@type": "PostalAddress",
        "addressLocality": "Marrakech",
        "addressCountry": "MA"
      },
      "priceRange": "120 MAD/jour",
      "openingHoursSpecification": [{
        "@type": "OpeningHoursSpecification",
        "dayOfWeek": ["Monday","Tuesday","Wednesday","Thursday","Friday"],
        "opens": "10:00",
        "closes": "17:00"
      }],
      "aggregateRating": {
        "@type": "AggregateRating",
        "ratingValue": "4.9",
        "reviewCount": "283",
        "bestRating": "5"
      }
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Aurai-je des nouvelles de mon chien durant le séjour ?",
          "acceptedAnswer": { "@type": "Answer", "text": "Oui, sur demande. Photos/vidéos pendant les horaires d'accueil (lun–ven 10h–17h)." }
        },
        {
          "@type": "Question",
          "name": "Quelles vaccinations sont obligatoires ?",
          "acceptedAnswer": { "@type": "Answer", "text": "Vaccins à jour selon l'âge et le profil. Chien non vacciné = non admissible." }
        },
        {
          "@type": "Question",
          "name": "Les tarifs varient-ils selon la taille ou la race ?",
          "acceptedAnswer": { "@type": "Answer", "text": "Non, tarif unique de 120 dhs/jour. Remise automatique à partir de 32 jours ou 2 chiens (100 dhs/jour)." }
        }
      ]
    }
  ]
}
</script>
```

---

### FIX 8 — MEDIUM: Add `sizes` to gallery `<source>` elements

```html
<!-- BEFORE -->
<source type="image/avif" srcset="...image.avif">

<!-- AFTER -->
<source type="image/avif" srcset="...image.avif" sizes="(max-width: 768px) 50vw, 200px">
```

---

### FIX 9 — LOW: Fix emoji accessibility in headings

```html
<!-- BEFORE -->
<h3>🌳 Un vaste espace de liberté</h3>

<!-- AFTER -->
<h3><span aria-hidden="true">🌳</span> Un vaste espace de liberté</h3>
```

---

### FIX 10 — LOW: Add `focus-visible` styles for keyboard navigation

```css
.du-btn:focus-visible,
.sim2-btn:focus-visible,
.sim2-pill:focus-visible,
.du-acc-btn:focus-visible {
    outline: 3px solid var(--gold);
    outline-offset: 3px;
}
```

---

## STEP 7 — TOP 10 PERFORMANCE IMPROVEMENTS

| Priority | Improvement | Speed Gain |
|----------|-------------|------------|
| 🥇 1 | **Extract + enqueue CSS/JS** — enables HTTP caching (304 responses on repeat visits) | **Very High** |
| 🥈 2 | **Add `<link rel="preload">` for LCP image** in `wp_head` | **High** |
| 🥉 3 | **Cache `Intl.NumberFormat`** — eliminates object allocation on every keystroke | Medium |
| 4 | **Add WebP fallback** for AVIF images — prevents broken images on older browsers | High |
| 5 | **Add `sizes` to gallery `<source>`** — prevents 3–4x oversized image downloads on mobile | Medium |
| 6 | **Debounce `renderAll()`** on range input — currently fires on every pixel of drag | Low |
| 7 | **Remove `content-visibility` conflict** with `overflow-x:hidden` parent | Low |
| 8 | **Cache `qs("#du-contract-block form")`** — currently re-queried on every state change | Low |
| 9 | **Use `defer` on script** — already in footer but explicitly deferring allows parser continuation | Low |
| 10 | **Collapse `collectDogs()` calls** — called twice per preview update, reduce to one | Low |

---

## STEP 8 — SECURITY HARDENING

### Critical fixes
1. **Add nonce** — `wp_create_nonce` / `check_ajax_referer` (see Fix 1 above)
2. **Server-side honeypot check** — check `$_POST['hp_url']` in PHP, not JS
3. **Full input sanitization** — use `sanitize_text_field`, `sanitize_email`, `absint`, `sanitize_textarea_field` (see Fix 2)
4. **Validate dates server-side** — `strtotime()` check on PHP side
5. **Rate limiting** — add `set_transient()` per IP to prevent form spam flood:

```php
$ip_key = 'du_fiche_' . md5( $_SERVER['REMOTE_ADDR'] );
if ( get_transient( $ip_key ) ) {
    wp_send_json_error( [ 'message' => 'Trop de tentatives. Réessayez dans 1 minute.' ], 429 );
}
set_transient( $ip_key, 1, 60 ); // 1 request per minute per IP
```

### WordPress-specific protections
```php
// Block direct PHP access (add to every plugin file)
if ( ! defined( 'ABSPATH' ) ) { exit; }

// Add to wp-config.php
define( 'DISALLOW_FILE_EDIT', true );    // Disable theme/plugin editor in admin
define( 'WP_DEBUG_DISPLAY', false );     // Never display errors in production
define( 'WP_DEBUG_LOG', true );          // Log to /wp-content/debug.log instead

// Add to .htaccess (block xmlrpc if unused)
<Files xmlrpc.php>
    Order Deny,Allow
    Deny from all
</Files>
```

---

## STEP 9 — FINAL VERDICT

**Production-grade? ❌ NO**

### Biggest weaknesses
1. **No CSRF protection** — AJAX form has no nonce (critical, exploitable today)
2. **Inline CSS/JS** — kills browser caching, increases page weight on every load
3. **Client-only honeypot** — bypassed by any bot with raw HTTP POST
4. **No schema markup** — losing rich results (star ratings, FAQ boxes in Google SERPs)
5. **AVIF-only images** — no fallback for browsers that don't support AVIF

### Must fix immediately (before next marketing push)
1. ✅ Add nonce to AJAX (Fix 1) — **security**
2. ✅ Add server-side sanitization + validation (Fix 2) — **security**
3. ✅ Extract CSS/JS to enqueued files (Fix 3) — **performance**
4. ✅ Add Schema markup (Fix 7) — **SEO**
5. ✅ Add WebP fallback images — **compatibility**

### After immediate fixes
- Add rate limiting to AJAX handler
- Add WebP versions of all AVIF images
- Set up a WordPress caching plugin (WP Rocket or W3 Total Cache)
- Add `<link rel="preload">` for LCP image in theme's `wp_head`
- Test with Google Rich Results Test after schema deployment
