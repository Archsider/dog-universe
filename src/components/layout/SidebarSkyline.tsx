// Skyline Marrakech utilisé dans AdminSidebar — fond crème/doré gradient.
// Cohérent avec le bandeau ClientSidebar.
export function SidebarSkyline() {
  return (
    <div className="mx-3 mb-3 mt-2">
      <div
        className="relative rounded-xl overflow-hidden"
        style={{
          height: '80px',
          background: 'linear-gradient(135deg, #F5ECD8 0%, #EDD9A3 60%, #E8C97A 100%)',
        }}
      >
        <span
          className="absolute top-2 left-3 text-[8px] tracking-[3px] uppercase font-medium z-10"
          style={{ color: 'rgba(154,114,53,0.7)' }}
        >
          Marrakech
        </span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/marrakech-skyline.png"
          alt="Skyline Marrakech"
          style={{
            position: 'absolute',
            bottom: 0,
            left: '50%',
            transform: 'translateX(-50%)',
            height: '70px',
            width: 'auto',
            maxWidth: '100%',
            objectFit: 'contain',
            objectPosition: 'bottom center',
          }}
        />
      </div>
    </div>
  );
}
