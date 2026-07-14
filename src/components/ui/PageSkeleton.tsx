export function PageSkeleton({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Sidebar-shaped placeholder (desktop only, matches Sidebar.tsx's w-64) */}
      <div className="hidden lg:block fixed left-0 top-0 h-screen w-64 border-r border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
      <div className="lg:pl-64">
        {/* Topbar-shaped placeholder (matches TopBar.tsx's h-16) */}
        <div className="h-16 border-b border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
        <main className="px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
