"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Fragment } from "react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { ChevronLeft, ChevronRight, Trash2, AlertTriangle, Plus } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { weekDays, formatShortDate, toDateString } from "@/lib/schedule/dateUtils";
import { AssignNewModal } from "./AssignNewModal";

interface Technician {
  id: string;
  name: string;
}

interface Job {
  id: string;
  customerName: string;
  siteName: string;
}

interface ScheduleAssignment {
  id: string;
  assignedDate: string;
  endDate: string | null;
  user: { id: string; name: string; role: string };
  job: { id: string; customerName: string; siteName: string; siteAddress: string; status: string };
}

interface ScheduleGridProps {
  assignments: ScheduleAssignment[];
  technicians: Technician[];
  jobs: Job[];
  weekStartDate: string; // YYYY-MM-DD Monday
}

function AssignmentBlock({
  assignment,
  onDelete,
}: {
  assignment: ScheduleAssignment;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: assignment.id,
  });
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const isActive = assignment.job.status === "active";

  function handleDelete() {
    startTransition(async () => {
      const res = await fetch(`/api/schedule/assignments/${assignment.id}`, { method: "DELETE" });
      if (res.ok) onDelete();
    });
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded px-2 py-1.5 text-xs font-medium select-none relative group",
        isDragging ? "opacity-40 z-50 shadow-lg cursor-grabbing" : "cursor-grab",
        isActive
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
          : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
      )}
    >
      <div {...listeners} {...attributes} className="space-y-0.5">
        <p className="truncate font-semibold leading-tight">{assignment.job.customerName}</p>
        <p className="truncate opacity-75 leading-tight">{assignment.job.siteName}</p>
        {assignment.endDate && (
          <p className="opacity-60 text-[10px]">
            → {new Date(assignment.endDate).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
          </p>
        )}
      </div>
      {!confirming ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setConfirming(true);
          }}
          aria-label="Remove assignment"
          className="absolute top-0.5 right-0.5 flex p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      ) : (
        <div className="flex gap-1 mt-1 pt-1 border-t border-current/20">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setConfirming(false);
            }}
            className="flex-1 rounded bg-white/40 dark:bg-black/20 text-[10px] py-0.5"
          >
            ×
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
            disabled={isPending}
            className="flex-1 rounded bg-red-200 dark:bg-red-900/50 text-red-700 dark:text-red-300 text-[10px] py-0.5 disabled:opacity-40"
          >
            {isPending ? "…" : "✓"}
          </button>
        </div>
      )}
    </div>
  );
}

function GridCell({
  userId,
  dateStr,
  assignments,
  onCellClick,
  onDelete,
}: {
  userId: string;
  dateStr: string;
  assignments: ScheduleAssignment[];
  onCellClick: (userId: string, dateStr: string) => void;
  onDelete: (id: string) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `${userId}:${dateStr}` });

  return (
    <div
      ref={setNodeRef}
      onClick={() => {
        if (assignments.length === 0) onCellClick(userId, dateStr);
      }}
      className={cn(
        "min-h-[80px] border-r border-b border-slate-200 dark:border-slate-700 p-1 space-y-1",
        "transition-colors",
        assignments.length === 0 && "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40",
        isOver && "bg-amber-50 dark:bg-amber-900/20 ring-1 ring-inset ring-amber-300 dark:ring-amber-700"
      )}
    >
      {assignments.map((a) => (
        <AssignmentBlock key={a.id} assignment={a} onDelete={() => onDelete(a.id)} />
      ))}
    </div>
  );
}

function MobileAssignmentCard({
  assignment,
  onDelete,
}: {
  assignment: ScheduleAssignment;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const isActive = assignment.job.status === "active";

  function handleDelete() {
    startTransition(async () => {
      const res = await fetch(`/api/schedule/assignments/${assignment.id}`, { method: "DELETE" });
      if (res.ok) onDelete();
    });
  }

  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3 space-y-1",
        isActive
          ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20"
          : "border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{assignment.user.name}</p>
          <p className="text-xs text-slate-600 dark:text-slate-400 truncate">
            {assignment.job.customerName} — {assignment.job.siteName}
          </p>
          {assignment.endDate && (
            <p className="text-xs text-slate-400 mt-0.5">
              until {new Date(assignment.endDate).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
            </p>
          )}
        </div>
        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        ) : (
          <div className="flex gap-1 shrink-0">
            <button
              onClick={() => setConfirming(false)}
              className="min-h-[32px] px-2 rounded-lg border border-slate-300 dark:border-slate-600 text-xs"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={isPending}
              className="min-h-[32px] px-2 rounded-lg bg-red-600 text-white text-xs font-medium disabled:opacity-40"
            >
              {isPending ? "…" : "Delete"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function MobileList({
  assignments,
  days,
  onAddClick,
  onDelete,
}: {
  assignments: ScheduleAssignment[];
  days: Date[];
  onAddClick: (dateStr: string) => void;
  onDelete: (id: string) => void;
}) {
  const byDate = new Map<string, ScheduleAssignment[]>();
  for (const day of days) {
    byDate.set(toDateString(day), []);
  }
  for (const a of assignments) {
    const key = a.assignedDate.slice(0, 10);
    if (byDate.has(key)) byDate.get(key)!.push(a);
  }

  const todayStr = toDateString(new Date());

  return (
    <div className="space-y-6">
      {days.map((day) => {
        const dateStr = toDateString(day);
        const dayAssignments = byDate.get(dateStr) ?? [];
        return (
          <div key={dateStr}>
            <div className="flex items-center justify-between mb-2">
              <h3
                className={cn(
                  "text-sm font-semibold",
                  dateStr === todayStr
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-slate-500 dark:text-slate-400"
                )}
              >
                {dateStr === todayStr ? "Today — " : ""}{formatShortDate(day)}
              </h3>
              <button
                onClick={() => onAddClick(dateStr)}
                className="flex items-center gap-1 min-h-[32px] px-2.5 rounded-lg border border-slate-300 dark:border-slate-600 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Plus className="w-3.5 h-3.5" />
                Assign
              </button>
            </div>
            {dayAssignments.length === 0 ? (
              <p className="text-xs text-slate-400">No assignments</p>
            ) : (
              <div className="space-y-2">
                {dayAssignments.map((a) => (
                  <MobileAssignmentCard
                    key={a.id}
                    assignment={a}
                    onDelete={() => onDelete(a.id)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ScheduleGrid({
  assignments: initialAssignments,
  technicians,
  jobs,
  weekStartDate,
}: ScheduleGridProps) {
  const router = useRouter();
  const [assignments, setAssignments] = useState<ScheduleAssignment[]>(initialAssignments);
  const [modal, setModal] = useState<{ userId?: string; dateStr: string } | null>(null);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);

  const monday = new Date(weekStartDate);
  const days = weekDays(monday);
  const todayStr = toDateString(new Date());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  function prevWeek() {
    const prev = new Date(monday);
    prev.setDate(prev.getDate() - 7);
    router.push(`/schedule?week=${toDateString(prev)}`);
  }

  function nextWeek() {
    const next = new Date(monday);
    next.setDate(next.getDate() + 7);
    router.push(`/schedule?week=${toDateString(next)}`);
  }

  function thisWeek() {
    router.push("/schedule");
  }

  function handleDelete(id: string) {
    setAssignments((prev) => prev.filter((a) => a.id !== id));
  }

  function handleCreated(assignment: ScheduleAssignment) {
    setAssignments((prev) => [...prev, assignment]);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const assignment = assignments.find((a) => a.id === active.id);
    if (!assignment) return;

    const [targetUserId, targetDateStr] = (over.id as string).split(":");

    // Only allow moving within the same technician's row
    if (targetUserId !== assignment.user.id) return;
    if (targetDateStr === assignment.assignedDate.slice(0, 10)) return;

    const oldStart = new Date(assignment.assignedDate);
    const newStart = new Date(targetDateStr);
    // new Date("YYYY-MM-DD") is UTC midnight — no adjustment needed
    const delta = newStart.getTime() - oldStart.getTime();

    const newEndDate = assignment.endDate
      ? new Date(new Date(assignment.endDate).getTime() + delta).toISOString()
      : null;

    // Optimistic update
    const prevAssignments = assignments;
    setAssignments((prev) =>
      prev.map((a) =>
        a.id === assignment.id
          ? { ...a, assignedDate: newStart.toISOString(), endDate: newEndDate }
          : a
      )
    );

    const body: Record<string, string | null> = {
      assignedDate: newStart.toISOString(),
    };
    if (newEndDate !== null) body.endDate = newEndDate;

    fetch(`/api/schedule/assignments/${assignment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(async (res) => {
      if (!res.ok) {
        setAssignments(prevAssignments); // revert
      } else {
        const data = await res.json();
        if (data.warning) setConflictWarning(data.warning);
      }
    });
  }

  // Build lookup: { [techId]: { [dateStr]: Assignment[] } }
  const cellMap = new Map<string, Map<string, ScheduleAssignment[]>>();
  for (const tech of technicians) {
    const techMap = new Map<string, ScheduleAssignment[]>();
    for (const day of days) {
      techMap.set(toDateString(day), []);
    }
    cellMap.set(tech.id, techMap);
  }
  for (const a of assignments) {
    const dateStr = a.assignedDate.slice(0, 10);
    const techMap = cellMap.get(a.user.id);
    if (techMap?.has(dateStr)) {
      techMap.get(dateStr)!.push(a);
    }
  }

  const weekLabel = `${formatShortDate(days[0])} – ${formatShortDate(days[6])}`;

  return (
    <div className="space-y-4">
      {/* Header: week navigation */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Schedule</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{weekLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={thisWeek}
            className="min-h-[36px] px-3 rounded-lg border border-slate-300 dark:border-slate-600 text-sm"
          >
            Today
          </button>
          <button
            onClick={prevWeek}
            className="p-2 rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={nextWeek}
            className="p-2 rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Conflict warning banner */}
      {conflictWarning && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{conflictWarning}</span>
          <button
            onClick={() => setConflictWarning(null)}
            className="ml-auto text-amber-600 hover:text-amber-800 dark:text-amber-400"
          >
            ×
          </button>
        </div>
      )}

      {/* Mobile list view */}
      <div className="md:hidden">
        <MobileList
          assignments={assignments}
          days={days}
          onAddClick={(dateStr) => setModal({ dateStr })}
          onDelete={handleDelete}
        />
      </div>

      {/* Desktop grid view */}
      <div className="hidden md:block overflow-x-auto">
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div
            className="grid border-t border-l border-slate-200 dark:border-slate-700 min-w-[700px]"
            style={{ gridTemplateColumns: `160px repeat(7, 1fr)` }}
          >
            {/* Header row */}
            <div className="border-r border-b border-slate-200 dark:border-slate-700 px-3 py-2 bg-slate-50 dark:bg-slate-800/60" />
            {days.map((day) => {
              const dateStr = toDateString(day);
              return (
                <div
                  key={dateStr}
                  className={cn(
                    "border-r border-b border-slate-200 dark:border-slate-700 px-2 py-2 text-xs font-semibold text-center",
                    "bg-slate-50 dark:bg-slate-800/60",
                    dateStr === todayStr && "text-amber-600 dark:text-amber-400"
                  )}
                >
                  {formatShortDate(day)}
                </div>
              );
            })}

            {/* Technician rows */}
            {technicians.map((tech) => (
              <Fragment key={tech.id}>
                <div className="border-r border-b border-slate-200 dark:border-slate-700 px-3 py-2 flex items-start">
                  <span className="text-sm font-medium truncate">{tech.name}</span>
                </div>
                {days.map((day) => {
                  const dateStr = toDateString(day);
                  const cellAssignments = cellMap.get(tech.id)?.get(dateStr) ?? [];
                  return (
                    <GridCell
                      key={`${tech.id}:${dateStr}`}
                      userId={tech.id}
                      dateStr={dateStr}
                      assignments={cellAssignments}
                      onCellClick={(uid, ds) => setModal({ userId: uid, dateStr: ds })}

                      onDelete={handleDelete}
                    />
                  );
                })}
              </Fragment>
            ))}
          </div>
        </DndContext>
      </div>

      {/* Assignment creation modal */}
      {modal && (
        <AssignNewModal
          prefilledUserId={modal.userId}
          prefilledDate={modal.dateStr}
          technicians={technicians}
          jobs={jobs}
          onClose={() => setModal(null)}
          onCreated={handleCreated}
          onConflict={(warning) => setConflictWarning(warning)}
        />
      )}
    </div>
  );
}
