// Skyline Marrakech utilisé dans AdminSidebar — version PNG premium
// (remplace la version SVG inline pour cohérence avec ClientSidebar)
export function SidebarSkyline() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none select-none w-full opacity-50 relative h-[60px]"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/marrakech-skyline.png"
        alt=""
        aria-hidden="true"
        className="absolute bottom-0 left-0 w-full h-full object-contain object-bottom"
      />
    </div>
  );
}
