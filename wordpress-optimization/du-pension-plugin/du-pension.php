<?php
/**
 * Plugin Name:  Dog Universe – Pension Canine
 * Plugin URI:   https://www.doguniverse.ma
 * Description:  Bloc pension canine premium : simulateur de prix, fiche chien multi-dogs, contrat. Enqueue sécurisé, nonce AJAX, sanitisation complète.
 * Version:      2.0.0
 * Author:       Dog Universe
 * License:      Proprietary
 * Text Domain:  du-pension
 */

// ─── Guard ───────────────────────────────────────────────────────────────────
defined( 'ABSPATH' ) || exit;

define( 'DU_PENSION_VERSION', '2.0.0' );
define( 'DU_PENSION_DIR',     plugin_dir_path( __FILE__ ) );
define( 'DU_PENSION_URL',     plugin_dir_url( __FILE__ ) );

// ─── Asset enqueue ────────────────────────────────────────────────────────────
/**
 * Enqueue CSS and JS only on pages containing [du_pension].
 *
 * FIX (HIGH): Assets were inline — no browser caching possible.
 *             Now loaded from separate files with versioned URLs.
 * FIX (CRITICAL): nonce generated here and passed to JS via wp_localize_script.
 */
function du_pension_enqueue(): void {
    global $post;
    if ( ! is_a( $post, 'WP_Post' ) ) {
        return;
    }
    if ( ! has_shortcode( $post->post_content, 'du_pension' ) ) {
        return;
    }

    // CSS — no dependencies, load in <head>
    wp_enqueue_style(
        'du-pension',
        DU_PENSION_URL . 'assets/pension-canine.css',
        [],
        DU_PENSION_VERSION
    );

    // Preload LCP image hint — injected before CSS for maximum effect
    add_action( 'wp_head', 'du_pension_preload_lcp', 1 );

    // JS — defer, load in footer (non-blocking)
    wp_enqueue_script(
        'du-pension',
        DU_PENSION_URL . 'assets/pension-canine.js',
        [],
        DU_PENSION_VERSION,
        [
            'strategy'  => 'defer',
            'in_footer' => true,
        ]
    );

    // Pass ajaxurl + nonce to JS (FIX CRITICAL: nonce enables CSRF protection)
    wp_localize_script(
        'du-pension',
        'duPension',
        [
            'ajaxurl' => admin_url( 'admin-ajax.php' ),
            'nonce'   => wp_create_nonce( 'du_fiche_nonce' ),
        ]
    );
}
add_action( 'wp_enqueue_scripts', 'du_pension_enqueue' );

// ─── LCP preload hint ─────────────────────────────────────────────────────────
/**
 * Emit a <link rel="preload"> for the hero image.
 * Tells the browser to fetch the LCP image immediately, before CSS/JS parse.
 * Expected Lighthouse gain: 0.3–0.8 s on LCP metric.
 */
function du_pension_preload_lcp(): void {
    echo '<link rel="preload" as="image" '
        . 'href="https://www.doguniverse.ma/wp-content/uploads/2025/10/chien-pension-dog-universe.avif" '
        . 'type="image/avif" '
        . 'fetchpriority="high">' . "\n";
}

// ─── Shortcode [du_pension] ───────────────────────────────────────────────────
/**
 * Render the pension block via an include (clean separation of concerns).
 * Template uses esc_html() / wp_kses() for all dynamic output.
 */
function du_pension_shortcode(): string {
    ob_start();
    include DU_PENSION_DIR . 'templates/pension.php';
    return ob_get_clean();
}
add_shortcode( 'du_pension', 'du_pension_shortcode' );

// ─── AJAX handler: du_send_fiche ─────────────────────────────────────────────
/**
 * Process the dog fiche form submission.
 *
 * Security checklist:
 *  ✅ Nonce verification (check_ajax_referer)
 *  ✅ Server-side honeypot check
 *  ✅ Input sanitization (sanitize_text_field, sanitize_email, absint, sanitize_textarea_field)
 *  ✅ Email validation (is_email)
 *  ✅ Date validation (strtotime)
 *  ✅ Required field check
 *  ✅ Per-IP rate limiting (set_transient)
 *  ✅ No direct DB writes — email only via wp_mail
 */
function du_handle_fiche(): void {
    // 1. CSRF — verify nonce (FIX CRITICAL)
    if ( ! check_ajax_referer( 'du_fiche_nonce', 'nonce', false ) ) {
        wp_send_json_error( [ 'message' => 'Token de sécurité invalide. Rechargez la page.' ], 403 );
    }

    // 2. Honeypot — server-side (FIX HIGH: client-only guard is bypassable)
    if ( ! empty( $_POST['hp_url'] ) ) {
        // Silent success — do not reveal detection to bots
        wp_send_json_success();
        return;
    }

    // 3. Per-IP rate limiting — max 1 submission per 60 s
    $ip_key = 'du_fiche_' . md5( sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ?? '' ) ) );
    if ( get_transient( $ip_key ) ) {
        wp_send_json_error( [ 'message' => 'Trop de tentatives. Réessayez dans 1 minute.' ], 429 );
    }

    // 4. Sanitize all fields (FIX CRITICAL: prevents injection, XSS, email header injection)
    $owner_name  = sanitize_text_field(     wp_unslash( $_POST['owner_name']  ?? '' ) );
    $owner_phone = sanitize_text_field(     wp_unslash( $_POST['owner_phone'] ?? '' ) );
    $owner_email = sanitize_email(          wp_unslash( $_POST['owner_email'] ?? '' ) );
    $owner_city  = sanitize_text_field(     wp_unslash( $_POST['owner_city']  ?? '' ) );
    $date_in     = sanitize_text_field(     wp_unslash( $_POST['date_in']     ?? '' ) );
    $date_out    = sanitize_text_field(     wp_unslash( $_POST['date_out']    ?? '' ) );
    $dogs_count  = absint(                               $_POST['dogs_count']  ?? 1   );
    $diet        = sanitize_textarea_field( wp_unslash( $_POST['diet']        ?? '' ) );
    $meds        = sanitize_textarea_field( wp_unslash( $_POST['meds']        ?? '' ) );
    $notes       = sanitize_textarea_field( wp_unslash( $_POST['notes']       ?? '' ) );
    $sim_days    = absint(                               $_POST['sim_days']    ?? 0   );
    $sim_total   = absint(                               $_POST['sim_total']   ?? 0   );
    $dogs_text   = sanitize_textarea_field( wp_unslash( $_POST['dogs_text']   ?? '' ) );

    // 5. Validate required fields
    if ( empty( $owner_name ) ) {
        wp_send_json_error( [ 'message' => 'Le nom est obligatoire.' ] );
    }
    if ( empty( $owner_phone ) ) {
        wp_send_json_error( [ 'message' => 'Le téléphone est obligatoire.' ] );
    }
    if ( ! is_email( $owner_email ) ) {
        wp_send_json_error( [ 'message' => 'Adresse e-mail invalide.' ] );
    }

    // 6. Validate dates
    $ts_in  = strtotime( $date_in );
    $ts_out = strtotime( $date_out );
    if ( ! $ts_in || ! $ts_out ) {
        wp_send_json_error( [ 'message' => 'Dates manquantes.' ] );
    }
    if ( $ts_out <= $ts_in ) {
        wp_send_json_error( [ 'message' => 'La date de sortie doit être après la date d\'entrée.' ] );
    }

    $days_count = (int) round( ( $ts_out - $ts_in ) / DAY_IN_SECONDS );
    if ( $days_count < 1 || $days_count > 365 ) {
        wp_send_json_error( [ 'message' => 'Durée de séjour invalide.' ] );
    }

    // 7. Build and send email
    $subject  = sprintf( '[Pension Dog Universe] %s — %s → %s', $owner_name, $date_in, $date_out );

    $body  = "=== PROPRIÉTAIRE ===\n";
    $body .= "Nom       : {$owner_name}\n";
    $body .= "Téléphone : {$owner_phone}\n";
    $body .= "Email     : {$owner_email}\n";
    $body .= "Ville     : {$owner_city}\n\n";

    $body .= "=== SÉJOUR ===\n";
    $body .= "Entrée  : {$date_in}\n";
    $body .= "Sortie  : {$date_out}\n";
    $body .= "Durée   : {$days_count} jour(s)\n";
    $body .= "Chiens  : {$dogs_count}\n\n";

    if ( $dogs_text ) {
        $body .= "=== CHIENS ===\n{$dogs_text}\n\n";
    }

    $body .= "=== SANTÉ & SOINS ===\n";
    $body .= "Alimentation : {$diet}\n";
    $body .= "Médicaments  : {$meds}\n";
    $body .= "Notes        : {$notes}\n\n";

    $body .= "=== SIMULATEUR ===\n";
    $body .= "Jours estimés : {$sim_days} | Total estimé : {$sim_total} dhs\n";

    $headers = [
        'Content-Type: text/plain; charset=UTF-8',
        'Reply-To: ' . sanitize_email( $owner_email ),
    ];

    // 8. Set rate-limit transient (after validation, before send)
    set_transient( $ip_key, 1, 60 );

    if ( wp_mail( get_option( 'admin_email' ), $subject, $body, $headers ) ) {
        wp_send_json_success( [ 'message' => 'Fiche envoyée avec succès.' ] );
    } else {
        // Don't expose wp_mail internals; log privately
        error_log( 'du_pension: wp_mail failed for ' . sanitize_email( $owner_email ) );
        wp_send_json_error( [ 'message' => "Erreur d'envoi. Contactez-nous directement par téléphone." ] );
    }
}
add_action( 'wp_ajax_du_send_fiche',        'du_handle_fiche' );
add_action( 'wp_ajax_nopriv_du_send_fiche', 'du_handle_fiche' );

// ─── Recommended wp-config.php additions ─────────────────────────────────────
/*
 * Add these to wp-config.php for hardening (outside the plugin, as notes):
 *
 * define( 'DISALLOW_FILE_EDIT', true );   // Disable WP admin code editor
 * define( 'WP_DEBUG_DISPLAY', false );    // Never echo errors to screen in production
 * define( 'WP_DEBUG_LOG', true );         // Log errors to /wp-content/debug.log
 * define( 'FORCE_SSL_ADMIN', true );      // Force HTTPS in wp-admin
 *
 * And to .htaccess (block xmlrpc.php if unused):
 *
 * <Files xmlrpc.php>
 *   Order Deny,Allow
 *   Deny from all
 * </Files>
 */
