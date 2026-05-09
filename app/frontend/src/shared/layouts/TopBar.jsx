import React from "react";

export default function TopBar({ className = "", left, center, right }) {
  return <header className={`h-16 border-b border-border flex items-center gap-3 px-4 lg:px-6 sticky top-0 z-30 ${className}`}>{left}{center}{right}</header>;
}
