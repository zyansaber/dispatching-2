import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
}

const StockSheetTable: React.FC<StockSheetTableProps> = ({
  notes,
  schedule,
  reallocations,
  onSave,
}) => {
  const [newChassis, setNewChassis] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { update?: string; yearNotes?: string }>>({});
  const [hideDispatched, setHideDispatched] = useState(false);
  const [savingRow, setSavingRow] = useState<string | null>(null);

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

  const pickScheduleInfo = (chassisNo: string) => {
    const match = schedule.find(
      (item) => item.Chassis?.toLowerCase().trim() === chassisNo.toLowerCase().trim()
    );

    return {
      model: (match as any)?.Model || (match as any)?.model || "",
      scheduledDealer:
        (match as any)?.Dealer ||
        (match as any)?.dealer ||
        (match as any)?.["Scheduled Dealer"] ||
        "",
      customerName:
        (match as any)?.Customer ||
        (match as any)?.customer ||
        (match as any)?.["Customer Name"] ||
        "",
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

  const handleSaveRow = async (rowId: string, chassisNo: string) => {
    const draft = drafts[rowId];
    const patch = {
      update: draft?.update ?? notes[rowId]?.update ?? "",
      yearNotes: draft?.yearNotes ?? notes[rowId]?.yearNotes ?? "",
      updatedAt: new Date().toISOString(),
    };
    setSavingRow(rowId);
    try {
      await onSave(chassisNo, { chassisNo, ...patch });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[rowId];
        return next;
      });
      toast.success("Row saved");
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
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="min-w-[170px]">Chassis No</TableHead>
              <TableHead className="min-w-[140px]">Model</TableHead>
              <TableHead className="min-w-[180px]">Scheduled Dealer</TableHead>
              <TableHead className="min-w-[190px]">Latest Reallocation Dealer</TableHead>
              <TableHead className="min-w-[170px]">Customer Name</TableHead>
              <TableHead className="min-w-[220px]">Update</TableHead>
              <TableHead className="min-w-[180px]">Year / Notes</TableHead>
              <TableHead className="w-[120px] text-center">Dispatched</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-sm text-slate-500 py-6">
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
                  <TableCell className="align-top font-semibold text-slate-800">
                    {row.chassisNo}
                  </TableCell>
                  <TableCell className="align-top text-slate-700">{row.scheduleModel || "-"}</TableCell>
                  <TableCell className="align-top text-slate-700">{row.scheduledDealer || "-"}</TableCell>
                  <TableCell className="align-top text-slate-700">{row.reallocatedDealer || "-"}</TableCell>
                  <TableCell className="align-top text-slate-700">{row.customer || "-"}</TableCell>
                  <TableCell className="align-top">
                    <Textarea
                      value={updateValue}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [row.id]: { ...prev[row.id], update: e.target.value },
                        }))
                      }
                      placeholder="Notes / follow up"
                      className="min-h-[90px]"
                    />
                  </TableCell>
                  <TableCell className="align-top">
                    <Textarea
                      value={yearNotesValue}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [row.id]: { ...prev[row.id], yearNotes: e.target.value },
                        }))
                      }
                      placeholder="Year / other notes"
                      className="min-h-[90px]"
                    />
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="flex flex-col gap-2 items-center">
                      <Button
                        size="sm"
                        variant={row.dispatched ? "default" : "outline"}
                        onClick={() => toggleDispatched(row.id, row.chassisNo, !row.dispatched)}
                        disabled={isSaving}
                        className="w-full"
                      >
                        {row.dispatched ? "Dispatched" : "Mark Dispatched"}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleSaveRow(row.id, row.chassisNo)}
                        disabled={isSaving}
                        className="w-full"
                      >
                        Save
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
