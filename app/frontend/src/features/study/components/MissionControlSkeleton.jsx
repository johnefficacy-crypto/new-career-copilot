import React from "react";

export default function MissionControlSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" data-testid="mission-control-skeleton">
      <div>
        <div className="h-3 w-32 bg-clay-100 rounded" />
        <div className="mt-2 h-9 w-72 bg-clay-100 rounded" />
        <div className="mt-2 h-4 w-96 bg-clay-100 rounded" />
      </div>
      <div className="soft-card rounded-2xl p-6">
        <div className="h-4 w-48 bg-clay-100 rounded" />
        <div className="mt-4 space-y-2">
          <div className="h-3 w-3/4 bg-clay-100 rounded" />
          <div className="h-3 w-2/3 bg-clay-100 rounded" />
          <div className="h-3 w-1/2 bg-clay-100 rounded" />
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="soft-card rounded-2xl p-4">
            <div className="h-3 w-20 bg-clay-100 rounded" />
            <div className="mt-2 h-6 w-12 bg-clay-100 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
