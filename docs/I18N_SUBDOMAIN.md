# i18n — Subdomain routing (plan)

## Pourquoi

Aujourd'hui le routing locale est sur le path : `app.doguniverse.ma/fr/admin`
(géré par `next-intl` + `src/middleware.ts`). On évalue un passage à un
routing par subdomain : `fr.doguniverse.ma`, `en.doguniverse.ma`,
`ar.doguniverse.ma`.

### Bénéfices attendus

1. **SEO Maroc** : Google indexe mieux les subdomains comme entités séparées.
   Un site `fr.doguniverse.ma` est pertinent pour requêtes francophones,
   `ar.doguniverse.ma` pour le marché arabe local. Aujourd'hui les pages
   `/fr/...` et `/ar/...` sont vues comme variantes de la même origin.
2. **Branding** : URL plus propre et plus pro. `fr.doguniverse.ma/pension` >
   `app.doguniverse.ma/fr/pension`.
3. **Cookies / cache scoping** : possibilité de cookies/CDN scopés par locale.
4. **Analytics** : segmentation propre par audience linguistique dans GA/Plausible.

### Risques

1. **Redirection des liens existants** : tous les liens externes
   (réseaux sociaux, emails) pointent vers `/fr/...`. Mitigation : 301 redirect.
2. **Setup DNS / TLS multi-domaine** : besoin de wildcard cert (`*.doguniverse.ma`).
3. **NextAuth / cookies** : domain cookie à scoper sur `.doguniverse.ma`
   (avec le point initial) pour cross-subdomain auth.
4. **PWA manifest** : le service worker est scopé par origin → un SW par
   subdomain. Risque de cache divergent.

## Architecture cible

### Niveau DNS

```
A      doguniverse.ma          → Vercel
CNAME  *.doguniverse.ma        → cname.vercel-dns.com
```

Wildcard cert auto-provisionné par Vercel (Let's Encrypt).

### Niveau Vercel

Domaines à ajouter dans le projet :
- `doguniverse.ma` (root → marketing landing)
- `app.doguniverse.ma` (existant — backward compat 6 mois)
- `fr.doguniverse.ma`
- `en.doguniverse.ma`
- `ar.doguniverse.ma`

### Niveau code — middleware

Modification future de `src/middleware.ts` (NON faite aujourd'hui) :

```ts
// Pseudo-code
export default async function middleware(req: NextRequest) {
  const host = req.headers.get('host') ?? '';
  const subdomain = host.split('.')[0];

  // Détecter locale par subdomain
  if (['fr', 'en', 'ar'].includes(subdomain)) {
    const url = req.nextUrl.clone();
    // Si l'URL n'a pas déjà /[locale], rewrite
    if (!url.pathname.startsWith(`/${subdomain}`)) {
      url.pathname = `/${subdomain}${url.pathname}`;
      return NextResponse.rewrite(url);
    }
  }

  // ... reste du middleware existant (rate-limit, auth, etc.)
}
```

`next.config.mjs` : ajouter `i18n.localeDetection: false` pour empêcher
next-intl de redirect vers `/fr` quand le host est déjà `fr.*`.

### Niveau cookies

NextAuth config : `cookies.sessionToken.options.domain = '.doguniverse.ma'`
(avec point initial = wildcard sous-domaines, support cross-subdomain auth).

## Roadmap (3 phases)

### Phase 1 — Status quo (aujourd'hui)

- Paths actifs : `/fr/...`, `/en/...`, `/ar/...`
- Subdomains non configurés
- Ce doc seul

### Phase 2 — Dual mode (6 semaines)

- DNS configuré (wildcard)
- Subdomains acceptés en plus des paths
- Middleware rewrite : `fr.doguniverse.ma/admin` → `/fr/admin` interne
- Tests E2E sur les deux modes
- Sitemap `<xhtml:link rel="alternate" hreflang="fr">` etc. pour SEO
- Communication users : "vous pouvez aussi utiliser fr.doguniverse.ma"

### Phase 3 — Subdomain canonique (3 mois)

- Redirect 301 `/fr/*` → `https://fr.doguniverse.ma/*`
- Idem `/en/*` → `en.doguniverse.ma`, `/ar/*` → `ar.doguniverse.ma`
- `app.doguniverse.ma` redirige vers le subdomain de la locale par défaut du user
- Mise à jour de tous les emails transactionnels (URLs)
- Mise à jour des QR codes carte membre (encodage de l'URL si pertinent)

## Tests à écrire (Playwright)

- Visite `fr.doguniverse.ma/pension` → contenu fr, locale switch en haut visible
- Visite `en.doguniverse.ma/admin` après login → reste sur subdomain, pas de path locale
- Login sur `fr.doguniverse.ma` → cookie `domain=.doguniverse.ma` → session active sur `en.doguniverse.ma`
- 301 `/fr/admin` (legacy) → `https://fr.doguniverse.ma/admin`

## NE PAS faire aujourd'hui

- Pas de modif de `src/middleware.ts` — le path-based routing fonctionne.
- Pas de modif de `next.config.mjs`.
- Pas de modif des emails templates.
- Ce doc pose le plan, l'implémentation se fait quand le besoin SEO/branding
  devient prioritaire (probablement Q4 2026 si croissance trafic organique).
