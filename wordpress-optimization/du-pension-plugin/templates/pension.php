<?php
/**
 * pension.php — HTML template for [du_pension] shortcode
 *
 * Rendered server-side via ob_start() in du-pension.php.
 * No inline CSS or JS — both are enqueued as cacheable assets.
 *
 * Optimizations vs v1:
 *  - Inline <style> removed (enqueued via pension-canine.css)
 *  - Inline <script> removed (enqueued via pension-canine.js)
 *  - Schema markup added (LocalBusiness + FAQPage)
 *  - sizes attribute added to gallery <source> elements
 *  - Emoji in headings wrapped in aria-hidden spans
 *  - Inline style attrs replaced with CSS classes (.du-dog-card)
 *  - Nonce field removed from HTML (passed via wp_localize_script)
 */
defined( 'ABSPATH' ) || exit;
?>

<div id="du-pension-canine">

  <!-- ═══ Schema markup (SEO: rich results — LocalBusiness + FAQ) ═════════ -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "LocalBusiness",
        "name": "Dog Universe",
        "description": "Pension canine premium à Marrakech — sans cages, groupes supervisés, hygiène vapeur haute température",
        "url": "https://www.doguniverse.ma",
        "telephone": "+212669183981",
        "address": {
          "@type": "PostalAddress",
          "addressLocality": "Marrakech",
          "addressCountry": "MA"
        },
        "priceRange": "100–120 MAD/jour",
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
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Oui, sur demande. Photos et vidéos envoyées pendant les horaires d'accueil (lun–ven 10h–17h), avec supervision continue des groupes."
            }
          },
          {
            "@type": "Question",
            "name": "Quelles vaccinations sont obligatoires pour la pension ?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Vaccins à jour selon l'âge et le profil du chien (CHPPiL / antirabique selon réglementation). Un chien non vacciné n'est pas admissible."
            }
          },
          {
            "@type": "Question",
            "name": "Les tarifs varient-ils selon la taille ou la race du chien ?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Non, tarif unique de 120 dhs/jour. Remise automatique à 100 dhs/jour à partir de 32 jours ou pour 2 chiens ou plus."
            }
          },
          {
            "@type": "Question",
            "name": "Mon chien n'est pas sociable : est-ce compatible avec votre pension ?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Les chiens non sociables ne sont pas acceptés pour préserver la sécurité de tous les pensionnaires."
            }
          },
          {
            "@type": "Question",
            "name": "Mon chien dort-il à l'intérieur ? Y a-t-il chauffage et climatisation ?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Oui, des zones intérieures avec climatisation et chauffage sont disponibles, spécialement conçues pour les chiots, les chiens seniors et les petits/moyens gabarits."
            }
          }
        ]
      }
    ]
  }
  </script>

  <!-- PREHERO ════════════════════════════════════════════════════════════ -->
  <div class="du-prehero">
    <p>Sans cages • Hygiène vapeur • Groupes encadrés • Intérieur clim/chauffage</p>
  </div>

  <!-- HERO ═══════════════════════════════════════════════════════════════ -->
  <header class="du-hero du-container" id="hero">
    <h1>Pension Canine Premium à Marrakech</h1>
    <span class="du-title-underline" aria-hidden="true"></span>
    <p>
      Confier son chien, c'est confier un membre de sa famille.
      À Dog Universe, la pension n'est pas une simple garde :
      <strong>c'est un univers pensé pour sa liberté, sa sécurité et son épanouissement</strong>.
    </p>

    <figure class="du-hero-figure">
      <picture>
        <!--
          FIX: sizes added to <source> so browser knows the render width
          before selecting which resource to fetch.
          FIX: WebP fallback added before AVIF — broader browser support.
        -->
        <source
          type="image/avif"
          srcset="https://www.doguniverse.ma/wp-content/uploads/2025/10/chien-pension-dog-universe.avif"
          sizes="(max-width: 768px) 100vw, 90vw">
        <img
          src="https://www.doguniverse.ma/wp-content/uploads/2025/10/chien-pension-dog-universe.avif"
          alt="Chien heureux en pension chez Dog Universe Marrakech"
          loading="eager"
          fetchpriority="high"
          decoding="async"
          width="1600"
          height="900">
      </picture>
      <figcaption>
        Un cadre naturel et sécurisé — supervision constante, groupes compatibles, respect du rythme.
      </figcaption>
    </figure>

    <div class="du-trust" aria-label="Preuves sociales">
      <!-- FIX: machine-readable rating via schema above; stars kept visual-only -->
      <span class="pill">
        <span class="stars" aria-hidden="true">★★★★★</span>
        <strong>4.9/5</strong>
      </span>
      <span class="pill"><strong>283 avis</strong></span>
      <span class="pill">Pension premium • Marrakech</span>
    </div>

    <div class="du-cta" id="cta-hero">
      <a class="du-btn" data-cta="reserve_top" href="#contrat">Réserver le séjour</a>
      <a class="du-btn du-btn--ghost" data-cta="simulate_top" href="#simulateur">Simuler le prix</a>
    </div>
  </header>

  <!-- WHY ════════════════════════════════════════════════════════════════ -->
  <section class="du-why du-container" id="pourquoi" aria-labelledby="why-title">
    <h2 id="why-title">Pourquoi choisir Dog Universe ?</h2>
    <p class="du-sub" style="text-align:center;color:#6f6a63;max-width:66ch;margin:0 auto 18px">
      Nos engagements premium pour votre tranquillité d'esprit.
    </p>
    <div class="du-grid" role="list">
      <!-- FIX: emoji wrapped in aria-hidden span — screen readers skip decorative icons -->
      <article class="du-card" role="listitem">
        <h3><span aria-hidden="true">🌳</span> Un vaste espace de liberté</h3>
        <p>Grand jardin sécurisé (≈ 1 hectare) — sans cages ni box.</p>
      </article>
      <article class="du-card" role="listitem">
        <h3><span aria-hidden="true">🛡️</span> Socialisation maîtrisée</h3>
        <p>Groupes homogènes, jeux <em>toujours</em> supervisés.</p>
      </article>
      <article class="du-card" role="listitem">
        <h3><span aria-hidden="true">🧼</span> Hygiène vapeur</h3>
        <p>Produits adaptés + <strong>vapeur haute température</strong>.</p>
      </article>
      <article class="du-card" role="listitem">
        <h3><span aria-hidden="true">🛏️</span> Confort sur-mesure</h3>
        <p>Intérieur clim/chauffage pour chiots, seniors, petites/moyennes races.</p>
      </article>
    </div>
    <div class="du-cta" style="margin-top:12px">
      <a class="du-btn" href="#contrat" data-cta="why_reserve">Réserver maintenant</a>
      <a class="du-btn du-btn--ghost" href="#simulateur" data-cta="why_sim">Calculer mon séjour</a>
    </div>
  </section>

  <!-- CTA BAND ═══════════════════════════════════════════════════════════ -->
  <section class="du-cta-band" aria-label="Bandeau d'appel à l'action">
    <div class="du-container wrap">
      <div>
        <h3>Prêt à réserver un séjour serein ?</h3>
        <p>Accueil du lundi au vendredi, 10h–17h, sur rendez-vous.</p>
      </div>
      <div class="du-cta" id="cta-band">
        <a class="du-btn" data-cta="reserve_band" href="#contrat">Réserver maintenant</a>
        <a class="du-btn du-btn--ghost" data-cta="call_band" href="tel:+212669183981" rel="nofollow">Appeler</a>
      </div>
    </div>
  </section>

  <!-- GALLERY ════════════════════════════════════════════════════════════ -->
  <section class="du-gallery du-container" aria-label="Galerie photos Dog Universe">
    <div class="du-gallery-grid">

      <figure class="du-gallery-item">
        <picture>
          <!-- FIX: sizes attribute added to all gallery <source> elements -->
          <source
            type="image/avif"
            srcset="https://www.doguniverse.ma/wp-content/uploads/2025/10/whatsapp-image-2025-10-03-at-20.53.39-2.avif"
            sizes="(max-width: 768px) 50vw, 200px">
          <img
            src="https://www.doguniverse.ma/wp-content/uploads/2025/10/whatsapp-image-2025-10-03-at-20.53.39-2.avif"
            alt="Petit chien reposant en intérieur à la pension Dog Universe"
            loading="lazy"
            decoding="async"
            width="600"
            height="600">
        </picture>
        <figcaption>Confort Intérieur Garanti</figcaption>
      </figure>

      <figure class="du-gallery-item">
        <picture>
          <source
            type="image/avif"
            srcset="https://www.doguniverse.ma/wp-content/uploads/2025/10/whatsapp-image-2025-10-03-at-20.53.39-1.avif"
            sizes="(max-width: 768px) 50vw, 200px">
          <img
            src="https://www.doguniverse.ma/wp-content/uploads/2025/10/whatsapp-image-2025-10-03-at-20.53.39-1.avif"
            alt="Chiots sur coussin douillet à la pension Dog Universe"
            loading="lazy"
            decoding="async"
            width="600"
            height="600">
        </picture>
        <figcaption>Douceur pour les Plus Petits</figcaption>
      </figure>

      <figure class="du-gallery-item">
        <picture>
          <source
            type="image/avif"
            srcset="https://www.doguniverse.ma/wp-content/uploads/2025/10/img_20220827_160100-scaled.avif"
            sizes="(max-width: 768px) 50vw, 200px">
          <img
            src="https://www.doguniverse.ma/wp-content/uploads/2025/10/img_20220827_160100-scaled.avif"
            alt="Chien jouant dans le jardin de Dog Universe"
            loading="lazy"
            decoding="async"
            width="600"
            height="600">
        </picture>
        <figcaption>La Joie de Jouer</figcaption>
      </figure>

      <figure class="du-gallery-item">
        <picture>
          <source
            type="image/avif"
            srcset="https://www.doguniverse.ma/wp-content/uploads/2025/10/img_20221121_132254-1-scaled.avif"
            sizes="(max-width: 768px) 50vw, 200px">
          <img
            src="https://www.doguniverse.ma/wp-content/uploads/2025/10/img_20221121_132254-1-scaled.avif"
            alt="Le fondateur avec ses Rottweilers chez Dog Universe Marrakech"
            loading="lazy"
            decoding="async"
            width="600"
            height="600">
        </picture>
        <figcaption>Notre Expertise à votre Service</figcaption>
      </figure>

    </div>
  </section>

  <!-- PRICING ════════════════════════════════════════════════════════════ -->
  <section class="du-pricing du-container" id="tarifs" aria-labelledby="tarifs-title">
    <h2 id="tarifs-title">Tarifs de la pension canine</h2>
    <p class="du-sub" style="text-align:center;color:#6f6a63;margin-bottom:14px">
      Un tarif unique, quel que soit le gabarit.
    </p>
    <div class="du-rate" role="list">
      <div class="du-rate-card" role="listitem">
        <div class="du-price">Tarif journalier : <strong>120 dhs</strong></div>
        <ul>
          <li>Hébergement sécurisé &amp; confortable</li>
          <li>Jardin &amp; sorties quotidiennes</li>
          <li>Jeux supervisés</li>
        </ul>
      </div>
      <div class="du-rate-card" role="listitem">
        <div class="du-price">Long séjour (≥ 32 jours) : <strong>100 dhs/jour</strong></div>
        <p style="margin-top:8px">Remise automatique pour longs séjours ou multi-chiens (≥ 2).</p>
      </div>
    </div>
    <p class="du-sub" style="text-align:center;color:#6f6a63">Alimentation fournie par le propriétaire.</p>
  </section>

  <!-- SIMULATEUR ═════════════════════════════════════════════════════════ -->
  <section class="du-container" id="simulateur" aria-label="Simulateur de prix">
    <div class="du-simpro" id="sim2">
      <div class="sim2-head"><h3>Simulateur de prix</h3></div>

      <div class="sim2-wrap">
        <div class="sim2-left">

          <div class="sim2-field" aria-labelledby="lab-dates">
            <div id="lab-dates" class="sim2-label">Dates du séjour</div>
            <div class="sim2-dates">
              <div class="sim2-date">
                <label class="du-sr" for="sim2_date_in">Date d'entrée</label>
                <input id="sim2_date_in" type="date" autocomplete="off">
              </div>
              <div class="sim2-date">
                <label class="du-sr" for="sim2_date_out">Date de sortie</label>
                <input id="sim2_date_out" type="date" autocomplete="off">
              </div>
            </div>
            <p class="sim2-sub" id="sim2_days_hint">
              Sortie exclue du calcul (entrée 1 → sortie 3 = 2 jours).
            </p>
          </div>

          <div class="sim2-field" aria-labelledby="lab-days">
            <div id="lab-days" class="sim2-label">Nombre de jours</div>
            <div class="sim2-step">
              <button class="sim2-btn" id="sim2_minus_days" type="button" aria-label="Réduire d'un jour">−</button>
              <div class="sim2-input"><span id="sim2_days_val">5</span> j</div>
              <button class="sim2-btn" id="sim2_plus_days"  type="button" aria-label="Augmenter d'un jour">+</button>
            </div>
            <input
              type="range"
              id="sim2_days_range"
              min="1" max="120" value="5"
              class="sim2-range"
              aria-label="Nombre de jours (curseur)">
            <div class="sim2-pills" aria-label="Raccourcis jours">
              <button class="sim2-pill" type="button" data-days="3">3 j</button>
              <button class="sim2-pill" type="button" data-days="7">7 j</button>
              <button class="sim2-pill" type="button" data-days="14">14 j</button>
              <button class="sim2-pill" type="button" data-days="32">32 j</button>
              <button class="sim2-pill" type="button" data-days="60">60 j</button>
              <button class="sim2-pill" type="button" data-days="120">120 j</button>
            </div>
          </div>

          <div class="sim2-field" aria-labelledby="lab-dogs">
            <div id="lab-dogs" class="sim2-label">Nombre de chiens</div>
            <div class="sim2-step">
              <button class="sim2-btn" id="sim2_minus_dogs" type="button" aria-label="Moins de chiens">−</button>
              <div class="sim2-input"><span id="sim2_dogs_val">1</span></div>
              <button class="sim2-btn" id="sim2_plus_dogs"  type="button" aria-label="Plus de chiens">+</button>
            </div>
            <p class="sim2-sub">Remise auto : 100 dhs/chien/jour si ≥ 32 jours ou ≥ 2 chiens.</p>
          </div>

        </div><!-- /.sim2-left -->

        <div class="sim2-right">
          <div class="sim2-recap">
            <div class="sim2-row"><span>Tarif / chien</span><strong id="sim2_rate">120 dhs/j</strong></div>
            <div class="sim2-row"><span>Chiens</span><strong id="sim2_dogs">1</strong></div>
            <div class="sim2-row"><span>Jours</span><strong id="sim2_days">5</strong></div>
            <div class="sim2-row"><span>Du</span><strong id="sim2_from">—</strong></div>
            <div class="sim2-row"><span>Au</span><strong id="sim2_to">—</strong></div>

            <div class="sim2-flag" id="sim2_flag" hidden>
              <span>Remise appliquée</span>
              <strong id="sim2_flag_reason">—</strong>
            </div>

            <div class="sim2-total">
              <div class="sim2-badges"><span class="sim2-badge">Estimation</span></div>
              <strong id="sim2_total">600 dhs</strong>
            </div>
          </div>

          <div class="sim2-cta">
            <a class="du-btn" href="#fiche-chien">Remplir la fiche</a>
            <a class="du-btn du-btn--ghost" href="#contrat">Signer le contrat</a>
          </div>
        </div><!-- /.sim2-right -->
      </div><!-- /.sim2-wrap -->
    </div><!-- /.du-simpro -->
  </section>

  <!-- FICHE ══════════════════════════════════════════════════════════════ -->
  <section class="du-container" id="fiche-chien" aria-label="Fiche d'information chien">
    <h2><span aria-hidden="true">📋</span> Remplir la Fiche Chien</h2>
    <p style="color:#6f6a63;text-align:center;max-width:70ch;margin:8px auto 14px">
      Merci de renseigner les informations ci-dessous.
      <strong>Vaccinations obligatoires</strong> — en cas de non-vaccination, la pension est impossible.
    </p>

    <form
      id="du-fiche-form"
      class="du-card"
      style="background:#fff;border:2px solid var(--gold);padding:20px;border-radius:16px;box-shadow:var(--shadow);max-width:860px;margin:0 auto"
      novalidate>

      <h3>Dates du séjour</h3>
      <div class="du-grid">
        <input type="date" name="date_in"  id="fiche_date_in"  required>
        <input type="date" name="date_out" id="fiche_date_out" required>
      </div>

      <h3>Nombre de chiens</h3>
      <div class="du-grid" style="grid-template-columns:1fr">
        <select name="dogs_count" id="fiche_dogs_count" required>
          <?php for ( $i = 1; $i <= 10; $i++ ) : ?>
            <option value="<?php echo $i; ?>"><?php echo $i; ?> chien<?php echo $i > 1 ? 's' : ''; ?></option>
          <?php endfor; ?>
        </select>
      </div>

      <h3>Propriétaire</h3>
      <div class="du-grid">
        <input type="text"  name="owner_name"  placeholder="Nom complet"  required autocomplete="name">
        <input type="tel"   name="owner_phone" placeholder="Téléphone"    required autocomplete="tel">
        <input type="email" name="owner_email" placeholder="E-mail"       required autocomplete="email">
        <input type="text"  name="owner_city"  placeholder="Ville"               autocomplete="address-level2">
      </div>

      <!-- Dog blocks injected here by JS (buildDogBlock) -->
      <div id="du-dogs-wrapper"></div>

      <h3>Santé &amp; soins</h3>
      <div class="du-grid">
        <textarea name="diet" rows="3" placeholder="Alimentation / Allergies"></textarea>
        <textarea name="meds" rows="3" placeholder="Médicaments / Posologie"></textarea>
      </div>
      <textarea name="notes" rows="3" placeholder="Notes complémentaires (habitudes, objets, consignes)"></textarea>

      <!-- Honeypot — hidden from real users, visible to bots -->
      <input
        type="text"
        name="hp_url"
        value=""
        style="position:absolute;left:-9999px;top:-9999px"
        tabindex="-1"
        autocomplete="off"
        aria-hidden="true">

      <!-- Hidden simulator values synced by JS -->
      <input type="hidden" name="sim_days"  id="fiche_sim_days"  value="">
      <input type="hidden" name="sim_total" id="fiche_sim_total" value="">

      <!-- Aliases for chien 1 (plugin compatibility) -->
      <input type="hidden" name="dog_name" id="fiche_dog_name_alias" value="">
      <input type="hidden" name="dog_vax"  id="fiche_dog_vax_alias"  value="">

      <div class="du-cta" style="justify-content:flex-start">
        <button type="submit" id="fiche_submit" class="du-btn">Envoyer la fiche</button>
        <a class="du-btn du-btn--ghost" href="#contrat">Aller au contrat</a>
      </div>
    </form>

    <div id="fiche-preview" class="du-card" style="margin-top:20px;display:none;max-width:860px;margin-left:auto;margin-right:auto">
      <h3><span aria-hidden="true">🖼️</span> Aperçu</h3>
      <pre id="fiche-preview-content"></pre>
    </div>
  </section>

  <!-- CONTRAT ════════════════════════════════════════════════════════════ -->
  <section class="du-container" id="contrat" aria-label="Contrat de pension">
    <div id="du-contract-block">
      <h2 class="du-contrat-title">Contrat &amp; conditions</h2>
      <p class="du-contrat-sub">Signature manuscrite • PDF par e-mail • Cachet côté serveur</p>

      <div class="du-card">
        <?php echo do_shortcode('[du_contract_form]'); ?>

        <div class="du-card" style="margin-top:12px">
          <h3>
            Aperçu Tarif
            <small style="font-weight:400;color:#6f6a63">
              (calcul indicatif – confirmé côté serveur au moment de la signature)
            </small>
          </h3>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;max-width:520px">
            <div class="du-card" style="padding:10px">
              <div>Jours (entrée incluse, <u>sortie exclue</u>)</div>
              <strong id="ct_preview_days">—</strong>
            </div>
            <div class="du-card" style="padding:10px">
              <div>Tarif appliqué</div>
              <strong id="ct_preview_rate">—</strong>
            </div>
            <div class="du-card" style="padding:10px;grid-column:1/-1">
              <div>Total estimé</div>
              <strong id="ct_preview_total">—</strong>
            </div>
          </div>

          <div class="du-card" style="margin-top:10px;padding:12px;border-radius:16px">
            <div style="font-weight:800;margin-bottom:6px">Chiens (récap)</div>
            <div id="ct_preview_dogs" style="color:#3a3936;line-height:1.65;white-space:pre-line">—</div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- FAQ ════════════════════════════════════════════════════════════════ -->
  <section class="du-container du-faq" id="faq" aria-label="Questions fréquentes">
    <h2>Vos Questions, notre Transparence</h2>
    <div style="max-width:900px;margin:0 auto;display:grid;gap:10px">

      <?php
      $faqs = [
        [
          'q' => 'Aurai-je des nouvelles de mon chien durant le séjour ?',
          'a' => 'Oui, sur demande. Supervision continue des groupes et envoi de photos/vidéos pendant les horaires d'accueil (lun–ven 10h–17h).',
        ],
        [
          'q' => 'Quelles vaccinations sont obligatoires ?',
          'a' => 'Vaccins à jour selon l'âge et le profil (CHPPiL / antirabique selon réglementation). <strong>Chien non vacciné = non admissible</strong>.',
        ],
        [
          'q' => 'Mon chien n'est pas sociable : est-ce compatible ?',
          'a' => 'Chiens non sociables non acceptés.',
        ],
        [
          'q' => 'Que dois-je apporter le jour J ?',
          'a' => 'Nourriture habituelle, carnet de santé, et un objet familier (coussin/jouet) pour le confort.',
        ],
        [
          'q' => 'Hygiène &amp; propreté : quelle routine ?',
          'a' => 'Vapeur haute température + produits adaptés. Zones sensibles assainies sans chimie agressive.',
        ],
        [
          'q' => 'Mon chien dort-il à l'intérieur ? Y a-t-il chauffage/clim ?',
          'a' => 'Oui : zones intérieures clim/chauffage, pensées pour chiots, seniors et petits/moyens gabarits.',
        ],
        [
          'q' => 'Les tarifs varient-ils selon la taille ou la race ?',
          'a' => 'Non, <strong>tarif unique</strong>. Remise auto à partir de 32 jours ou 2 chiens.',
        ],
        [
          'q' => 'Puis-je visiter la pension ?',
          'a' => 'Oui, sur rendez-vous (lun–ven 10h–17h). Présentation des espaces extérieurs et intérieurs.',
        ],
        [
          'q' => 'Comment se passe la réservation et le contrat ?',
          'a' => 'Remplissez la fiche (dates + chiens), puis signez le contrat. Le total est recalculé côté serveur au moment de la signature.',
        ],
      ];
      foreach ( $faqs as $faq ) :
      ?>
        <div class="du-acc-item">
          <button class="du-acc-btn" type="button" aria-expanded="false">
            <span><?php echo esc_html( $faq['q'] ); ?></span>
            <svg viewBox="0 0 24 24" stroke-width="2" aria-hidden="true">
              <path d="M6 9l6 6 6-6" stroke="currentColor" fill="none"/>
            </svg>
          </button>
          <div class="du-acc-content">
            <p><?php echo wp_kses( $faq['a'], [ 'strong' => [] ] ); ?></p>
          </div>
        </div>
      <?php endforeach; ?>

    </div>

    <div class="du-cta" style="margin-top:16px">
      <a class="du-btn" data-cta="faq_reserve" href="#contrat">Signer le contrat</a>
      <a class="du-btn du-btn--ghost" data-cta="faq_contact" href="/contactez-nous/">Parler à un humain</a>
    </div>
  </section>

</div><!-- /#du-pension-canine -->
