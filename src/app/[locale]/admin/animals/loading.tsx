export default function AnimalsLoading() {
  return (
    <div className="animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="h-8 w-28 bg-gray-200 rounded-lg" />
        <div className="flex items-center gap-3">
          <div className="h-4 w-8 bg-gray-100 rounded" />
          <div className="h-9 w-36 bg-gray-200 rounded-lg" />
        </div>
      </div>

      {/* Filter bar: search + species pills */}
      <div className="flex gap-3 mb-6 flex-wrap items-center">
        <div className="flex-1 min-w-[200px] h-10 bg-gray-100 rounded-lg" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-9 w-20 bg-gray-100 rounded-lg" />
        ))}
      </div>

      {/* Grid of animal cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="bg-white rounded-xl border border-gray-200 overflow-hidden"
          >
            {/* Photo area */}
            <div className="h-36 w-full bg-gray-100" />
            {/* Card body */}
            <div className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="space-y-1.5">
                  <div className="h-5 w-24 bg-gray-200 rounded" />
                  <div className="h-3 w-16 bg-gray-100 rounded" />
                </div>
                <div className="h-6 w-14 bg-gray-100 rounded-full" />
              </div>
              <div className="flex items-center gap-2">
                <div className="h-5 w-5 bg-gray-100 rounded-full shrink-0" />
                <div className="h-3 w-28 bg-gray-100 rounded" />
              </div>
              <div className="flex gap-3">
                <div className="h-4 w-20 bg-gray-100 rounded" />
                <div className="h-4 w-16 bg-gray-100 rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
