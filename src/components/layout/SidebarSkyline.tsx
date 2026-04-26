// Skyline Marrakech utilisé dans AdminSidebar — fond noir, skyline dorée Gemini.
// Cohérent avec le bandeau ClientSidebar.
export function SidebarSkyline() {
  return (
    <div className="mx-3 mb-3 mt-auto">
      <div
        className="relative rounded-xl overflow-hidden"
        style={{
          height: '90px',
          background: '#0E0C08',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: '8px',
            left: '12px',
            fontSize: '8px',
            letterSpacing: '3px',
            textTransform: 'uppercase',
            color: 'rgba(196,151,74,0.8)',
            fontWeight: '600',
            zIndex: 10,
          }}
        >
          Marrakech
        </span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/marrakech-skyline.png"
          alt=""
          style={{
            position: 'absolute',
            bottom: '-4px',
            left: 0,
            right: 0,
            width: '100%',
            height: '80px',
            objectFit: 'cover',
            objectPosition: 'center center',
          }}
        />
      </div>
    </div>
  );
}
