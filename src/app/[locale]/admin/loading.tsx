export default function AdminLoading() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      {/* Page title skeleton */}
      <div className="h-8 w-48 bg-gray-200 rounded-lg" />

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-ivory-200 p-5 space-y-3">
            <div className="h-4 w-24 bg-gray-200 rounded" />
            <div className="h-7 w-16 bg-gray-200 rounded" />
          </div>
        ))}
      </div>

      {/* Main content card */}
      <div className="bg-white rounded-xl border border-ivory-200 p-6 space-y-4">
        <div className="h-5 w-40 bg-gray-200 rounded" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="h-10 w-10 bg-gray-200 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-3/4 bg-gray-200 rounded" />
              <div className="h-3 w-1/2 bg-gray-100 rounded" />
            </div>
            <div className="h-6 w-20 bg-gray-200 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
