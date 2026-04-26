// Skyline Marrakech utilisé dans AdminSidebar — version PNG Gemini transparent.
// Aligné sur le pattern ClientSidebar (gradient + opacity 80).
export function SidebarSkyline() {
  return (
    <div className="px-3 pb-2 mt-2">
      <div className="relative h-16 rounded-xl overflow-hidden bg-gradient-to-r from-[#F5ECD8] to-[#EDD9A3]">
        <p className="absolute top-2 left-3 text-[8px] tracking-[2px] uppercase text-[#9A7235]/60 z-10">
          Marrakech
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/marrakech-skyline.png"
          alt="Skyline Marrakech"
          className="absolute bottom-0 left-0 w-full h-full object-contain object-bottom opacity-80"
        />
      </div>
    </div>
  );
}
