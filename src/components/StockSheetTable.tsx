import React, { useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  DispatchingNoteData,
  DispatchingNoteEntry,
  ReallocationData,
  ScheduleData,
} from "@/types";

interface StockSheetTableProps {
  notes: DispatchingNoteData;
  schedule: ScheduleData;
  reallocations: ReallocationData;
  onSave: (chassisNo: string, patch: Partial<DispatchingNoteEntry>) => Promise<void>;
  onDelete: (chassisNo: string) => Promise<void>;
}

const StockSheetTable: React.FC<StockSheetTableProps> = ({
  notes,
  schedule,
  reallocations,
  onSave,
  onDelete,
}) => {
  const [newChassis, setNewChassis] = useState("");
  const [drafts, setDrafts] = useState<
    Record<
      string,
      {
        update?: string;
        yearNotes?: string;
        model?: string;
        scheduledDealer?: string;
        reallocatedDealer?: string;
        customerName?: string;
      }
    >
  >({});
  const [hideDispatched, setHideDispatched] = useState(false);
  const [savingRow, setSavingRow] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const findLatestReallocatedDealer = (chassisNo: string) => {
    const entries = reallocations[chassisNo];
    if (!entries) return "";
    const ids = Object.keys(entries);
    if (!ids.length) return "";

    const parseDate = (value?: string) => {
      if (!value) return 0;
      const [d, m, y] = value.split("/").map((v) => Number(v));
      if (Number.isFinite(d) && Number.isFinite(m) && Number.isFinite(y)) {
        const date = new Date(y < 100 ? 2000 + y : y, (m || 1) - 1, d || 1);
        return date.getTime();
      }
      const timestamp = Date.parse(value);
      return Number.isFinite(timestamp) ? timestamp : 0;
    };

    const latest = ids.reduce((latestId, current) => {
      const latestDate = parseDate(entries[latestId]?.date || entries[latestId]?.submitTime);
      const currentDate = parseDate(entries[current]?.date || entries[current]?.submitTime);
      return currentDate > latestDate ? current : latestId;
    });

    return (
      entries[latest]?.reallocatedTo ||
      entries[latest]?.dealer ||
      entries[latest]?.customer ||
      ""
    );
  };

  const scheduleLookup = useMemo(() => {
    const map = new Map<string, { model?: string; scheduledDealer?: string; customerName?: string }>();
    (schedule || []).forEach((item: any) => {
      if (!item || typeof item !== "object") return;
      const rawChassis =
        item?.Chassis ||
        item?.["Chassis No"] ||
        item?.chassis ||
        item?.chassisNo ||
        item?.chassis_number;
      const chassisKey = typeof rawChassis === "string" ? rawChassis.toLowerCase().trim() : "";
      if (!chassisKey) return;

      map.set(chassisKey, {
        model: item?.Model || item?.model || "",
        scheduledDealer: item?.Dealer || item?.dealer || item?.["Scheduled Dealer"] || "",
        customerName: item?.Customer || item?.customer || item?.["Customer Name"] || "",
      });
    });
    return map;
  }, [schedule]);

  const noteIndexByChassis = useMemo(() => {
    const map = new Map<string, { id: string; entry: DispatchingNoteEntry }>();
    Object.entries(notes || {}).forEach(([id, entry]) => {
      const chassis = (entry?.chassisNo || id || "").toLowerCase().trim();
      if (chassis) {
        map.set(chassis, { id, entry });
      }
    });
    return map;
  }, [notes]);

  const pickScheduleInfo = (chassisNo: string) => {
    const info = scheduleLookup.get(chassisNo.toLowerCase().trim());
    return {
      model: info?.model || "",
      scheduledDealer: info?.scheduledDealer || "",
      customerName: info?.customerName || "",
    };
  };

  const processedRows = useMemo(() => {
    const entries = Object.entries(notes || {});
    return entries
      .map(([key, value]) => {
        const chassisNo = value.chassisNo || key;
        const scheduleInfo = pickScheduleInfo(chassisNo);
        const manualReallocated = value.reallocatedDealer || "";
        const reallocatedDealer = manualReallocated || findLatestReallocatedDealer(chassisNo);
        return {
          id: key,
          chassisNo,
          update: value.update || "",
          yearNotes: value.yearNotes || "",
          dispatched: Boolean(value.dispatched),
          scheduleModel: value.model || scheduleInfo.model || "",
          scheduledDealer: value.scheduledDealer || scheduleInfo.scheduledDealer || "",
          reallocatedDealer: reallocatedDealer || "",
          customer: value.customerName || scheduleInfo.customerName || "",
        };
      })
      .sort((a, b) => a.chassisNo.localeCompare(b.chassisNo, undefined, { sensitivity: "base" }));
  }, [notes, schedule, reallocations]);

  const visibleRows = hideDispatched
    ? processedRows.filter((row) => !row.dispatched)
    : processedRows;

  const splitCsvLine = (line: string) => {
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === "\"") {
        if (inQuotes && line[i + 1] === "\"") {
          current += "\"";
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        cells.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }

    cells.push(current.trim());
    return cells;
  };

  const normalizeHeaderKey = (header: string) => {
    const normalized = header.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (["chassis", "chassisno", "chassisnumber"].includes(normalized)) return "chassisNo";
    if (["update", "updates"].includes(normalized)) return "update";
    if (["yearnotes", "year", "notes", "yearornotes", "yearothernotes"].includes(normalized)) return "yearNotes";
    if (["dispatched", "status"].includes(normalized)) return "dispatched";
    return "";
  };

  const parseUploadedTemplate = (text: string) => {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (!lines.length) return [] as Array<Partial<DispatchingNoteEntry> & { chassisNo: string }>;

    const headers = splitCsvLine(lines[0]).map(normalizeHeaderKey);
    const entries: Array<Partial<DispatchingNoteEntry> & { chassisNo: string }> = [];

    for (let i = 1; i < lines.length; i++) {
      const cells = splitCsvLine(lines[i]);
      const record: Partial<DispatchingNoteEntry> & { chassisNo?: string } = {};

      headers.forEach((headerKey, idx) => {
        if (!headerKey) return;
        const cell = cells[idx] ?? "";
        if (headerKey === "dispatched") {
          const normalized = cell.toLowerCase();
          record.dispatched = ["true", "yes", "y", "1", "dispatched"].includes(normalized);
        } else if (headerKey === "yearNotes") {
          record.yearNotes = cell;
        } else if (headerKey === "update") {
          record.update = cell;
        } else if (headerKey === "chassisNo") {
          record.chassisNo = cell;
        }
      });

      const chassisNo = (record.chassisNo || "").trim();
      if (!chassisNo) continue;
      entries.push({
        chassisNo,
        update: record.update ?? "",
        yearNotes: record.yearNotes ?? "",
        dispatched: record.dispatched,
      });
    }

    return entries;
  };

  const handleAddChassis = async () => {
    const chassisNo = newChassis.trim();
    if (!chassisNo) return;
    setSavingRow(chassisNo);
    try {
      await onSave(chassisNo, {
        chassisNo,
        dispatched: false,
        createdAt: new Date().toISOString(),
      });
      setNewChassis("");
      toast.success("Chassis added to Stock Sheet");
    } catch (error: any) {
      toast.error(error?.message || "Failed to add chassis");
    } finally {
      setSavingRow(null);
    }
  };

  const handleDownloadTemplate = () => {
    const header = "Chassis No,Update,Year/Notes,Dispatched";
    const sample = "ABC123456,Optional update,Optional year or other notes,false";
    const content = `${header}\n${sample}`;
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "dispatchingnote_template.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  const handleUploadTemplate = async (file: File) => {
    setImporting(true);
    try {
      const text = await file.text();
      const entries = parseUploadedTemplate(text);
      if (!entries.length) {
        toast.error("No valid rows found in file");
        return;
      }

      let success = 0;
      let failed = 0;

      for (const entry of entries) {
        const chassisKey = entry.chassisNo.toLowerCase().trim();
        const existing = noteIndexByChassis.get(chassisKey);
        const patch: Partial<DispatchingNoteEntry> = {
          chassisNo: entry.chassisNo.trim(),
          update: entry.update,
          yearNotes: entry.yearNotes,
          updatedAt: new Date().toISOString(),
        };

        if (typeof entry.dispatched === "boolean") {
          patch.dispatched = entry.dispatched;
        } else if (!existing) {
          patch.dispatched = false;
        }

        if (!existing) {
          patch.createdAt = new Date().toISOString();
        }

        try {
          await onSave(entry.chassisNo, patch);
          success += 1;
        } catch (error) {
          console.error(error);
          failed += 1;
        }
      }

      if (success) {
        toast.success(`Imported ${success} row${success > 1 ? "s" : ""}`);
      }
      if (failed) {
        toast.error(`${failed} row${failed > 1 ? "s" : ""} failed to import`);
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to import template");
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDeleteRow = async (rowId: string, chassisNo: string) => {
    setSavingRow(rowId);
    try {
      await onDelete(chassisNo);
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[rowId];
        return next;
      });
      if (editingRowId === rowId) {
        setEditingRowId(null);
      }
      toast.success("Row deleted");
    } catch (error: any) {
      toast.error(error?.message || "Failed to delete row");
    } finally {
      setSavingRow(null);
    }
  };

  const startEditingRow = (rowId: string, data: {
    chassisNo: string;
    update: string;
    yearNotes: string;
    scheduleModel: string;
    scheduledDealer: string;
    reallocatedDealer: string;
    customer: string;
  }) => {
    setEditingRowId(rowId);
    setDrafts((prev) => ({
      ...prev,
      [rowId]: {
        update: data.update,
        yearNotes: data.yearNotes,
        model: data.scheduleModel,
        scheduledDealer: data.scheduledDealer,
        reallocatedDealer: data.reallocatedDealer,
        customerName: data.customer,
      },
    }));
  };

  const saveEditedRow = async (rowId: string, chassisNo: string) => {
    const draft = drafts[rowId] || {};
    const current = processedRows.find((row) => row.id === rowId);
    if (!current) return;

    setSavingRow(rowId);
    try {
      await onSave(chassisNo, {
        chassisNo,
        update: draft.update ?? current.update ?? "",
        yearNotes: draft.yearNotes ?? current.yearNotes ?? "",
        model: draft.model ?? current.scheduleModel ?? "",
        scheduledDealer: draft.scheduledDealer ?? current.scheduledDealer ?? "",
        reallocatedDealer: draft.reallocatedDealer ?? current.reallocatedDealer ?? "",
        customerName: draft.customerName ?? current.customer ?? "",
        updatedAt: new Date().toISOString(),
      });
      toast.success("Saved");
      setEditingRowId(null);
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[rowId];
        return next;
      });
    } catch (error: any) {
      toast.error(error?.message || "Failed to save row");
    } finally {
      setSavingRow(null);
    }
  };

  const toggleDispatched = async (rowId: string, chassisNo: string, dispatched: boolean) => {
    setSavingRow(rowId);
    try {
      await onSave(chassisNo, {
        chassisNo,
        dispatched,
        updatedAt: new Date().toISOString(),
      });
      toast.success(dispatched ? "Marked as dispatched" : "Marked as pending");
    } catch (error: any) {
      toast.error(error?.message || "Failed to update dispatched status");
    } finally {
      setSavingRow(null);
    }
  };

  return (
    <Card className="shadow-sm border-slate-200">
      <CardHeader className="flex flex-col gap-2 pb-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-xl font-semibold">Stock Sheet</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant={hideDispatched ? "default" : "outline"}
              size="sm"
              onClick={() => setHideDispatched((v) => !v)}
            >
              {hideDispatched ? "Showing Pending" : "Hide Dispatched"}
            </Button>
            <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">
              {visibleRows.filter((r) => r.dispatched).length} dispatched / {processedRows.length} total
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            placeholder="Enter chassis number"
            value={newChassis}
            onChange={(e) => setNewChassis(e.target.value)}
            className="w-64"
          />
          <Button onClick={handleAddChassis} disabled={!newChassis.trim() || savingRow === newChassis.trim()}>
            Add to Stock Sheet
          </Button>
          <Button variant="outline" onClick={handleDownloadTemplate}>
            Download Template
          </Button>
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            {importing ? "Uploading..." : "Upload Template"}
          </Button>
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            ref={fileInputRef}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                handleUploadTemplate(file);
              }
            }}
          />
        </div>
      </CardHeader>
      <CardContent className="overflow-visible">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="w-16" aria-label="Row actions" />
              <TableHead className="min-w-[150px]">Chassis No</TableHead>
              <TableHead className="min-w-[120px]">Model</TableHead>
              <TableHead className="min-w-[160px]">Scheduled Dealer</TableHead>
              <TableHead className="min-w-[170px]">Latest Reallocation Dealer</TableHead>
              <TableHead className="min-w-[150px]">Customer Name</TableHead>
              <TableHead className="min-w-[180px]">Update</TableHead>
              <TableHead className="min-w-[160px]">Year / Notes</TableHead>
              <TableHead className="w-[110px] text-center">Dispatched</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-sm text-slate-500 py-6">
                  {hideDispatched ? "No pending records" : "No stock sheet records yet"}
                </TableCell>
              </TableRow>
            )}

            {visibleRows.map((row) => {
              const draft = drafts[row.id] || {};
              const isSaving = savingRow === row.id;
              const isEditing = editingRowId === row.id;

              const updateValue = isEditing ? draft.update ?? row.update : row.update;
              const yearNotesValue = isEditing ? draft.yearNotes ?? row.yearNotes : row.yearNotes;
              const modelValue = isEditing
                ? draft.model ?? row.scheduleModel
                : row.scheduleModel;
              const scheduledDealerValue = isEditing
                ? draft.scheduledDealer ?? row.scheduledDealer
                : row.scheduledDealer;
              const reallocatedDealerValue = isEditing
                ? draft.reallocatedDealer ?? row.reallocatedDealer
                : row.reallocatedDealer;
              const customerValue = isEditing
                ? draft.customerName ?? row.customer
                : row.customer;

              return (
                <TableRow
                  key={row.id}
                  className={`${row.dispatched ? "bg-emerald-50" : ""} transition`}
                >
                  <TableCell className="align-top">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-500 hover:text-red-600"
                        onClick={() => handleDeleteRow(row.id, row.chassisNo)}
                        disabled={isSaving}
                        aria-label="Delete row"
                      >
                        ×
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-500 hover:text-blue-600"
                        onClick={() =>
                          isEditing
                            ? saveEditedRow(row.id, row.chassisNo)
                            : startEditingRow(row.id, {
                                chassisNo: row.chassisNo,
                                update: row.update,
                                yearNotes: row.yearNotes,
                                scheduleModel: row.scheduleModel,
                                scheduledDealer: row.scheduledDealer,
                                reallocatedDealer: row.reallocatedDealer,
                                customer: row.customer,
                              })
                        }
                        disabled={isSaving}
                        aria-label={isEditing ? "Save row" : "Edit row"}
                      >
                        {isEditing ? "💾" : "✎"}
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="align-top font-semibold text-slate-800">
                    {row.chassisNo}
                  </TableCell>
                  <TableCell className="align-top text-slate-700">
                    {isEditing ? (
                      <Input
                        value={modelValue}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [row.id]: { ...prev[row.id], model: e.target.value },
                          }))
                        }
                        placeholder="Model"
                      />
                    ) : (
                      modelValue || "-"
                    )}
                  </TableCell>
                  <TableCell className="align-top text-slate-700">
                    {isEditing ? (
                      <Input
                        value={scheduledDealerValue}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [row.id]: { ...prev[row.id], scheduledDealer: e.target.value },
                          }))
                        }
                        placeholder="Scheduled Dealer"
                      />
                    ) : (
                      scheduledDealerValue || "-"
                    )}
                  </TableCell>
                  <TableCell className="align-top text-slate-700">
                    {isEditing ? (
                      <Input
                        value={reallocatedDealerValue}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [row.id]: { ...prev[row.id], reallocatedDealer: e.target.value },
                          }))
                        }
                        placeholder="Latest Reallocation Dealer"
                      />
                    ) : (
                      reallocatedDealerValue || "-"
                    )}
                  </TableCell>
                  <TableCell className="align-top text-slate-700">
                    {isEditing ? (
                      <Input
                        value={customerValue}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [row.id]: { ...prev[row.id], customerName: e.target.value },
                          }))
                        }
                        placeholder="Customer Name"
                      />
                    ) : (
                      customerValue || "-"
                    )}
                  </TableCell>
                  <TableCell className="align-top">
                    {isEditing ? (
                      <Input
                        value={updateValue}
                        onChange={(e) => {
                          const value = e.target.value;
                          setDrafts((prev) => ({
                            ...prev,
                            [row.id]: { ...prev[row.id], update: value },
                          }));
                        }}
                        placeholder="Notes / follow up"
                      />
                    ) : (
                      <div className="text-slate-700">{updateValue || "-"}</div>
                    )}
                  </TableCell>
                  <TableCell className="align-top">
                    {isEditing ? (
                      <Input
                        value={yearNotesValue}
                        onChange={(e) => {
                          const value = e.target.value;
                          setDrafts((prev) => ({
                            ...prev,
                            [row.id]: { ...prev[row.id], yearNotes: value },
                          }));
                        }}
                        placeholder="Year / other notes"
                      />
                    ) : (
                      <div className="text-slate-700">{yearNotesValue || "-"}</div>
                    )}
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="flex items-center justify-center">
                      <Button
                        size="sm"
                        variant={row.dispatched ? "default" : "outline"}
                        onClick={() => toggleDispatched(row.id, row.chassisNo, !row.dispatched)}
                        disabled={isSaving}
                        className="w-full"
                      >
                        {row.dispatched ? "Dispatched" : "Mark Dispatched"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export default StockSheetTable;
