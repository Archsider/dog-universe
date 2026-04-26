// Skyline Marrakech utilisé dans AdminSidebar — bandeau gradient crème/doré.
// Cohérent avec le bandeau ClientSidebar.
export function SidebarSkyline() {
  return (
    <div className="mx-3 mb-3 mt-auto">
      <div
        className="relative rounded-xl overflow-hidden"
        style={{
          height: '90px',
          background: 'linear-gradient(180deg, #F5ECD8 0%, #E8C97A 100%)',
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
            color: 'rgba(154,114,53,0.8)',
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
            height: '85px',
            objectFit: 'cover',
            objectPosition: 'center bottom',
          }}
        />
      </div>
    </div>
  );
}
