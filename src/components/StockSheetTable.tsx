import React, { useEffect, useMemo, useRef, useState } from "react";
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
  const [drafts, setDrafts] = useState<Record<string, { update?: string; yearNotes?: string }>>({});
  const [hideDispatched, setHideDispatched] = useState(false);
  const [savingRow, setSavingRow] = useState<string | null>(null);
  const saveTimers = useRef<Record<string, NodeJS.Timeout>>({});

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
        const reallocatedDealer = findLatestReallocatedDealer(chassisNo);
        return {
          id: key,
          chassisNo,
          update: value.update || "",
          yearNotes: value.yearNotes || "",
          dispatched: Boolean(value.dispatched),
          scheduleModel: scheduleInfo.model || "",
          scheduledDealer: scheduleInfo.scheduledDealer || "",
          reallocatedDealer: reallocatedDealer || "",
          customer: scheduleInfo.customerName || "",
        };
      })
      .sort((a, b) => a.chassisNo.localeCompare(b.chassisNo, undefined, { sensitivity: "base" }));
  }, [notes, schedule, reallocations]);

  const visibleRows = hideDispatched
    ? processedRows.filter((row) => !row.dispatched)
    : processedRows;

  useEffect(() => {
    return () => {
      Object.values(saveTimers.current).forEach((timer) => clearTimeout(timer));
    };
  }, []);

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

  const queueSaveRow = (rowId: string, chassisNo: string, update?: string, yearNotes?: string) => {
    const existing = saveTimers.current[rowId];
    if (existing) clearTimeout(existing);

    const timer = setTimeout(async () => {
      setSavingRow(rowId);
      try {
        await onSave(chassisNo, {
          chassisNo,
          update: update ?? drafts[rowId]?.update ?? notes[rowId]?.update ?? "",
          yearNotes: yearNotes ?? drafts[rowId]?.yearNotes ?? notes[rowId]?.yearNotes ?? "",
          updatedAt: new Date().toISOString(),
        });
        toast.success("Saved");
      } catch (error: any) {
        toast.error(error?.message || "Failed to save row");
      } finally {
        setSavingRow(null);
      }
    }, 400);

    saveTimers.current[rowId] = timer;
  };

  const handleDeleteRow = async (rowId: string, chassisNo: string) => {
    const pendingTimer = saveTimers.current[rowId];
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      delete saveTimers.current[rowId];
    }

    setSavingRow(rowId);
    try {
      await onDelete(chassisNo);
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[rowId];
        return next;
      });
      toast.success("Row deleted");
    } catch (error: any) {
      toast.error(error?.message || "Failed to delete row");
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
        </div>
      </CardHeader>
      <CardContent className="overflow-visible">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="w-10" aria-label="Delete" />
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
              const updateValue = draft.update ?? row.update;
              const yearNotesValue = draft.yearNotes ?? row.yearNotes;
              const isSaving = savingRow === row.id;

              return (
                <TableRow
                  key={row.id}
                  className={`${row.dispatched ? "bg-emerald-50" : ""} transition`}
                >
                  <TableCell className="align-top">
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
                  </TableCell>
                  <TableCell className="align-top font-semibold text-slate-800">
                    {row.chassisNo}
                  </TableCell>
                  <TableCell className="align-top text-slate-700">{row.scheduleModel || "-"}</TableCell>
                  <TableCell className="align-top text-slate-700">{row.scheduledDealer || "-"}</TableCell>
                  <TableCell className="align-top text-slate-700">{row.reallocatedDealer || "-"}</TableCell>
                  <TableCell className="align-top text-slate-700">{row.customer || "-"}</TableCell>
                  <TableCell className="align-top">
                    <Input
                      value={updateValue}
                      onChange={(e) => {
                        const value = e.target.value;
                        setDrafts((prev) => ({
                          ...prev,
                          [row.id]: { ...prev[row.id], update: value },
                        }));
                        queueSaveRow(row.id, row.chassisNo, value, yearNotesValue);
                      }}
                      placeholder="Notes / follow up"
                    />
                  </TableCell>
                  <TableCell className="align-top">
                    <Input
                      value={yearNotesValue}
                      onChange={(e) => {
                        const value = e.target.value;
                        setDrafts((prev) => ({
                          ...prev,
                          [row.id]: { ...prev[row.id], yearNotes: value },
                        }));
                        queueSaveRow(row.id, row.chassisNo, updateValue, value);
                      }}
                      placeholder="Year / other notes"
                    />
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
