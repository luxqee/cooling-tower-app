"use client";

import type { TableColumn, TableRowValue } from "@/lib/compliance/types";

interface TableFieldInputProps {
  columns: TableColumn[];
  rows: TableRowValue[];
  onChange: (rows: TableRowValue[]) => void;
}

export function TableFieldInput({ columns, rows, onChange }: TableFieldInputProps) {
  function updateCell(rowIndex: number, columnId: string, value: string) {
    const next = rows.map((row, i) => (i === rowIndex ? { ...row, [columnId]: value } : row));
    onChange(next);
  }

  function addRow() {
    const blank: TableRowValue = Object.fromEntries(columns.map((c) => [c.id, ""]));
    onChange([...rows, blank]);
  }

  function removeRow(rowIndex: number) {
    onChange(rows.filter((_, i) => i !== rowIndex));
  }

  return (
    <div className="space-y-2">
      {rows.map((row, rowIndex) => (
        <div key={rowIndex} className="rounded-lg border border-slate-300 dark:border-slate-600 p-3 space-y-2">
          {columns.map((col) => (
            <div key={col.id} className="space-y-1">
              <label className="text-xs font-medium text-slate-500">{col.label}</label>
              <textarea
                value={row[col.id] ?? ""}
                onChange={(e) => updateCell(rowIndex, col.id, e.target.value)}
                rows={2}
                className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm resize-none"
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() => removeRow(rowIndex)}
            className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400"
          >
            Remove row
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addRow}
        className="w-full min-h-[36px] rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 text-xs text-slate-500 hover:border-amber-400 hover:text-amber-600 transition-colors"
      >
        + Add row
      </button>
    </div>
  );
}
