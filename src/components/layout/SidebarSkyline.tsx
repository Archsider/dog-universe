// Skyline Marrakech utilisé dans AdminSidebar — fond sombre + skyline dorée Gemini.
export function SidebarSkyline() {
  return (
    <div className="px-3 pb-2 mt-2">
      <div
        className="relative h-28 rounded-xl overflow-hidden bg-[#1C1208]"
        style={{ boxShadow: 'inset 0 -2px 8px rgba(196,151,74,0.2)' }}
      >
        <p className="absolute top-2 left-3 text-[8px] tracking-[2px] uppercase text-[#C4974A]/80 z-10">
          Marrakech
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/marrakech-skyline.png"
          alt="Skyline Marrakech"
          className="absolute bottom-0 left-0 w-full h-full object-contain object-bottom"
        />
      </div>
    </div>
  );
}
