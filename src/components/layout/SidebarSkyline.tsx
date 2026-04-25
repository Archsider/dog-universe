export function SidebarSkyline() {
  return (
    <div aria-hidden="true" className="pointer-events-none select-none w-full opacity-50">
      <svg
        viewBox="0 0 256 60"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYEnd meet"
        className="block w-full h-[60px]"
      >
        <g fill="#F5E6CC">
          {/* Palmier gauche (grand) */}
          <rect x="13.5" y="36" width="1" height="22" rx="0.5" />
          <path d="M14 36 C 8 34, 3 36, 1 40 C 5 34, 10 33, 14 36 Z" />
          <path d="M14 36 C 20 34, 25 36, 27 40 C 23 34, 18 33, 14 36 Z" />
          <path d="M14 36 C 12 30, 10 26, 9 22 C 13 28, 14 32, 14 36 Z" />
          <path d="M14 36 C 16 30, 18 26, 19 22 C 15 28, 14 32, 14 36 Z" />
          <circle cx="14" cy="35.5" r="1" />

          {/* Palmier gauche (petit) */}
          <rect x="27.5" y="42" width="1" height="16" rx="0.5" />
          <path d="M28 42 C 24 40, 20 42, 18 45 C 22 40, 25 39, 28 42 Z" />
          <path d="M28 42 C 32 40, 36 42, 38 45 C 34 40, 31 39, 28 42 Z" />
          <path d="M28 42 C 27 37, 25 34, 25 31 C 28 34, 28 38, 28 42 Z" />
          <path d="M28 42 C 29 37, 31 34, 31 31 C 28 34, 28 38, 28 42 Z" />

          {/* Remparts crénelés gauche */}
          <path d="M46 58 L46 50 L50 50 L50 47 L54 47 L54 50 L58 50 L58 47 L62 47 L62 50 L66 50 L66 47 L70 47 L70 50 L74 50 L74 58 Z" />

          {/* Petite porte en arc */}
          <path d="M82 58 L82 46 Q 88 39 94 46 L94 58 Z" />

          {/* Bâtiment à coupole + arches */}
          <path d="M104 58 L104 44 L140 44 L140 58 Z" />
          <path d="M110 44 Q 122 30 134 44 Z" />
          <rect x="121.5" y="24" width="1" height="6" rx="0.5" />
          <circle cx="122" cy="23.5" r="1" />

          {/* Minaret type Koutoubia */}
          <rect x="160" y="18" width="14" height="40" />
          <rect x="162" y="13" width="10" height="5" />
          <rect x="164" y="7" width="6" height="6" />
          <rect x="166.5" y="2" width="1" height="5" />
          <circle cx="167" cy="2" r="1.2" />

          {/* Remparts crénelés droite */}
          <path d="M186 58 L186 50 L190 50 L190 47 L194 47 L194 50 L198 50 L198 47 L202 47 L202 50 L206 50 L206 58 Z" />

          {/* Palmier droite (grand) */}
          <rect x="223.5" y="34" width="1" height="24" rx="0.5" />
          <path d="M224 34 C 218 32, 213 34, 211 38 C 215 32, 220 31, 224 34 Z" />
          <path d="M224 34 C 230 32, 235 34, 237 38 C 233 32, 228 31, 224 34 Z" />
          <path d="M224 34 C 222 28, 220 24, 219 20 C 223 26, 224 30, 224 34 Z" />
          <path d="M224 34 C 226 28, 228 24, 229 20 C 225 26, 224 30, 224 34 Z" />
          <circle cx="224" cy="33.5" r="1" />

          {/* Palmier droite (petit) */}
          <rect x="243.5" y="40" width="1" height="18" rx="0.5" />
          <path d="M244 40 C 240 38, 236 40, 234 43 C 238 38, 241 37, 244 40 Z" />
          <path d="M244 40 C 248 38, 252 40, 254 43 C 250 38, 247 37, 244 40 Z" />
          <path d="M244 40 C 243 35, 241 32, 241 29 C 244 32, 244 36, 244 40 Z" />
          <path d="M244 40 C 245 35, 247 32, 247 29 C 244 32, 244 36, 244 40 Z" />

          {/* Ligne d'horizon */}
          <rect x="0" y="57.6" width="256" height="0.4" opacity="0.7" />
        </g>
      </svg>
    </div>
  );
}
