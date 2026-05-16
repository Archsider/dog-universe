// Skeleton screens for the dashboard. Animate-pulse on neutral
// rectangles — no spinners (Mehdi's brief). Matches the visual rhythm of
// the real cards so the layout doesn't shift on hydration.

function Box({ className = '' }: { className?: string }) {
  return <div className={`bg-[#F5EAD0]/70 rounded-md animate-pulse ${className}`} />;
}

export function ZoneNowSkeleton() {
  return (
    <section className="space-y-4">
      <Box className="h-5 w-32" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
          <Box className="h-4 w-24 mb-4" />
          <div className="space-y-4">
            <Box className="h-10 w-full" />
            <Box className="h-10 w-full" />
          </div>
        </div>
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
          <Box className="h-4 w-32 mb-4" />
          <Box className="h-12 w-full mb-3" />
          <Box className="h-10 w-full" />
        </div>
      </div>
      <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
        <Box className="h-4 w-24 mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Box className="h-20" />
          <Box className="h-20" />
          <Box className="h-20" />
        </div>
      </div>
    </section>
  );
}

export function ZoneWeekSkeleton() {
  return (
    <section className="space-y-4">
      <Box className="h-5 w-36" />
      <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
        <Box className="h-4 w-32 mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Box className="h-32" />
          <Box className="h-32" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Box className="h-32" />
        <Box className="h-32" />
      </div>
    </section>
  );
}

export function ZoneAlertsSkeleton() {
  return (
    <section className="space-y-4">
      <Box className="h-5 w-40" />
      <Box className="h-24" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Box className="h-32" />
        <Box className="h-32" />
      </div>
    </section>
  );
}
