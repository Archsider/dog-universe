'use client';

function SkeletonLine({ w = 'w-full', h = 'h-4' }: { w?: string; h?: string }) {
  return <div className={`${w} ${h} bg-gray-100 rounded animate-pulse`} />;
}

function SkeletonBlock({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonLine key={i} w={i === lines - 1 ? 'w-3/4' : 'w-full'} />
      ))}
    </div>
  );
}

/** Skeleton that mirrors the 5-section panel structure. */
export default function PanelSkeleton() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      {/* Aperçu */}
      <div className="space-y-3">
        <SkeletonLine w="w-1/3" h="h-3" />
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
            <SkeletonLine w="w-1/2" h="h-3" />
            <SkeletonLine w="w-3/4" />
          </div>
          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
            <SkeletonLine w="w-1/2" h="h-3" />
            <SkeletonLine w="w-3/4" />
          </div>
          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
            <SkeletonLine w="w-1/2" h="h-3" />
            <SkeletonLine w="w-2/3" />
          </div>
          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
            <SkeletonLine w="w-1/2" h="h-3" />
            <SkeletonLine w="w-1/2" />
          </div>
        </div>
      </div>

      {/* Animaux */}
      <div className="space-y-3">
        <SkeletonLine w="w-1/4" h="h-3" />
        <div className="flex gap-3">
          <div className="w-12 h-12 rounded-full bg-gray-100" />
          <div className="flex-1 space-y-2 pt-1">
            <SkeletonLine w="w-1/3" />
            <SkeletonLine w="w-1/2" h="h-3" />
          </div>
        </div>
      </div>

      {/* Facturation */}
      <div className="space-y-3">
        <SkeletonLine w="w-1/4" h="h-3" />
        <div className="bg-gray-50 rounded-lg p-4">
          <SkeletonBlock lines={3} />
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-3">
        <SkeletonLine w="w-1/4" h="h-3" />
        <div className="bg-gray-50 rounded h-20" />
      </div>
    </div>
  );
}
