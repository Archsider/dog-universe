export default function ReservationsLoading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="flex items-center justify-between">
        <div className="h-7 w-40 bg-gray-200 rounded" />
        <div className="h-8 w-32 bg-gray-100 rounded" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-8 w-24 bg-gray-100 rounded-full" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-[#F0D98A]/40 p-4 flex items-center gap-4">
            <div className="h-8 w-8 rounded-full bg-gray-100 flex-shrink-0" />
            <div className="flex-1">
              <div className="h-3 w-28 bg-gray-100 rounded mb-2" />
              <div className="h-2 w-40 bg-gray-50 rounded" />
            </div>
            <div className="h-5 w-20 bg-gray-100 rounded" />
            <div className="h-5 w-16 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
