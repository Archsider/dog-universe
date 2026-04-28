export default function ClientLoading() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6 animate-pulse">
      {/* Page title skeleton */}
      <div className="h-8 w-48 bg-gray-200 rounded-lg" />

      {/* Content cards */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card p-6 space-y-4"
        >
          <div className="h-5 w-32 bg-gray-200 rounded" />
          <div className="space-y-3">
            <div className="h-4 w-full bg-gray-100 rounded" />
            <div className="h-4 w-5/6 bg-gray-100 rounded" />
            <div className="h-4 w-4/6 bg-gray-100 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
