import React, { useEffect, useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowUpDown, AlertTriangle, Mail, RefreshCw } from "lucide-react";
import { ProcessedDispatchEntry, ProcessedReallocationEntry } from "@/types";
import { getGRDaysColor, getGRDaysWidth, reportError } from "@/lib/firebase";
import { patchDispatch } from "@/lib/firebase";
import { sendReportEmail, EmailData } from "@/lib/emailjs";
import { toast } from "sonner";

/* ====================== DispatchStats（保持旧接口） ====================== */
interface DispatchStatsProps {
  total: number;
  invalidStock: number;
  snowyStock: number;
  canBeDispatched: number;
  onFilterChange: (filter: string) => void;
  activeFilter: string;
  onRefresh: () => void;
}

export const DispatchStats: React.FC<DispatchStatsProps> = ({
  total,
  invalidStock,
  snowyStock,
  canBeDispatched,
  onFilterChange,
  activeFilter,
  onRefresh
}) => {
  const cards = [
    { label: "Total Number", value: total, filter: "all", color: "text-blue-600" },
    { label: "Invalid Stock", value: invalidStock, filter: "invalid", color: "text-red-600" },
    { label: "Snowy Stock", value: snowyStock, filter: "snowy", color: "text-purple-600" },
    { label: "Can be Dispatched", value: canBeDispatched, filter: "canBeDispatched", color: "text-emerald-600" }
  ];
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={onRefresh} variant="outline" className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4" />
          <span>Refresh</span>
        </Button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((card) => (
          <Card
            key={card.filter}
            className={`cursor-pointer transition-all hover:shadow-md ${activeFilter === card.filter ? "ring-2 ring-blue-500" : ""}`}
            onClick={() => onFilterChange(card.filter)}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-gray-600 truncate">{card.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-xl font-bold ${card.color}`}>{card.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

/* ====================== DispatchTable（两行布局 + 实时/乐观更新 + OnHold卡片） ====================== */
interface DispatchTableProps {
  data: ProcessedDispatchEntry[];
  searchTerm: string;
  onSearchChange: (term: string) => void;
  filter: string;
  allData: ProcessedDispatchEntry[];
  reallocationData: ProcessedReallocationEntry[];
}

export const DispatchTable: React.FC<DispatchTableProps> = ({
  data, searchTerm, onSearchChange, filter, allData, reallocationData
}) => {
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc'; } | null>(null);
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);

  // 行内编辑状态
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const [pickupDraft, setPickupDraft]   = useState<Record<string, string>>({});

  // 乐观更新（UI 即时反映）
  const [optimistic, setOptimistic]     = useState<Record<string, Partial<ProcessedDispatchEntry>>>({});
  const [saving, setSaving]             = useState<Record<string, boolean>>({});
  const [error, setError]               = useState<Record<string, string | undefined>>({});

  const applyOptimistic = (id: string, patch: Partial<ProcessedDispatchEntry>) => {
    setOptimistic((m) => ({ ...m, [id]: { ...(m[id] || {}), ...patch } }));
  };

  // 父数据同步时，自动清理已一致的乐观覆盖
  useEffect(() => {
    if (!allData?.length) return;
    setOptimistic((cur) => {
      const next = { ...cur };
      for (const id of Object.keys(cur)) {
        const base = allData.find(e => e["Chassis No"] === id);
        if (!base) continue;
        const p = cur[id];
        const match =
          (p.OnHold === undefined || p.OnHold === base.OnHold) &&
          (p.Comment === undefined || p.Comment === base.Comment) &&
          (p.EstimatedPickupAt === undefined || p.EstimatedPickupAt === base.EstimatedPickupAt);
        if (match) delete next[id];
      }
      return next;
    });
  }, [allData]);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const safeStringIncludes = (value: any, s: string) =>
    value !== null && value !== undefined && String(value).toLowerCase().includes(s);

  // 合并乐观层
  const mergedAll = useMemo(() => {
    const map: Record<string, ProcessedDispatchEntry> = {};
    for (const e of allData) map[e["Chassis No"]] = { ...e, ...(optimistic[e["Chassis No"]] || {}) };
    return Object.values(map);
  }, [allData, optimistic]);

  // 过滤 + 排序
  const filteredAndSortedData = useMemo(() => {
    const searchLower = (searchTerm || "").toLowerCase();
    const base = (data.length ? data : allData).map(e => ({ ...e, ...(optimistic[e["Chassis No"]] || {}) }));

    let filtered = searchTerm
      ? base.filter(entry => {
          const dispatchMatch = (
            safeStringIncludes(entry["Chassis No"], searchLower) ||
            safeStringIncludes(entry.Customer, searchLower) ||
            safeStringIncludes(entry.Model, searchLower) ||
            safeStringIncludes(entry["Matched PO No"], searchLower) ||
            safeStringIncludes(entry["SAP Data"], searchLower) ||
            safeStringIncludes(entry["Scheduled Dealer"], searchLower) ||
            safeStringIncludes(entry.Code, searchLower) ||
            safeStringIncludes(entry.Statuscheck, searchLower) ||
            safeStringIncludes(entry.DealerCheck, searchLower) ||
            safeStringIncludes(entry.reallocatedTo, searchLower) ||
            safeStringIncludes(entry.Comment, searchLower) ||
            safeStringIncludes(entry.EstimatedPickupAt, searchLower)
          );
          const reallocationMatch = reallocationData.some(re =>
            re.chassisNumber === entry["Chassis No"] && (
              safeStringIncludes(re.chassisNumber, searchLower) ||
              safeStringIncludes(re.customer, searchLower) ||
              safeStringIncludes(re.model, searchLower) ||
              safeStringIncludes(re.originalDealer, searchLower) ||
              safeStringIncludes(re.reallocatedTo, searchLower) ||
              safeStringIncludes(re.regentProduction, searchLower) ||
              safeStringIncludes(re.issue?.type, searchLower)
            )
          );
          return dispatchMatch || reallocationMatch;
        })
      : base;

    if (sortConfig) {
      filtered = [...filtered].sort((a, b) => {
        const aValue = a[sortConfig.key as keyof ProcessedDispatchEntry];
        const bValue = b[sortConfig.key as keyof ProcessedDispatchEntry];
        if (sortConfig.key === "GR to GI Days") {
          return sortConfig.direction === 'asc'
            ? (Number(aValue) || 0) - (Number(bValue) || 0)
            : (Number(bValue) || 0) - (Number(aValue) || 0);
        }
        const aStr = String(aValue ?? '').toLowerCase();
        const bStr = String(bValue ?? '').toLowerCase();
        return sortConfig.direction === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
      });
    }
    return filtered;
  }, [data, allData, optimistic, searchTerm, sortConfig, reallocationData]);

  // 主表 & On Hold
  const activeRows = filteredAndSortedData.filter(e => !e.OnHold);
  const onHoldRows  = filteredAndSortedData.filter(e => e.OnHold);

  const maxGRDays = Math.max(...mergedAll.map(entry => entry["GR to GI Days"] || 0), 1);

  // 日期工具
  const isoToDatetimeLocal = (iso?: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const datetimeLocalToIso = (v: string) => (v ? new Date(v).toISOString() : null);
  const minDatetimeLocalNow = () => {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  };
  const minDT = useMemo(minDatetimeLocalNow, []);

  // 写库（乐观 + 回滚）
  const handleToggleOnHold = async (row: ProcessedDispatchEntry, next: boolean) => {
    const id = row["Chassis No"];
    const optimisticPatch = { OnHold: next, OnHoldAt: new Date().toISOString(), OnHoldBy: "webapp" as const };
    applyOptimistic(id, optimisticPatch);
    setSaving((s) => ({ ...s, [id]: true }));
    setError((e) => ({ ...e, [id]: undefined }));
    try {
      await patchDispatch(id, optimisticPatch);
    } catch (err: any) {
      setOptimistic((m) => {
        const prev = { ...(m[id] || {}) };
        delete prev.OnHold; delete prev.OnHoldAt; delete prev.OnHoldBy;
        return { ...m, [id]: prev };
      });
      setError((e) => ({ ...e, [id]: err?.message || "Update failed" }));
    } finally {
      setSaving((s) => ({ ...s, [id]: false }));
    }
  };

  const handleSaveComment = async (row: ProcessedDispatchEntry) => {
    const id = row["Chassis No"];
    const value = commentDraft[id] ?? row.Comment ?? ""; // 允许空字符串保存
    applyOptimistic(id, { Comment: value });
    setSaving((s) => ({ ...s, [id]: true }));
    setError((e) => ({ ...e, [id]: undefined }));
    try {
      await patchDispatch(id, { Comment: value });
    } catch (err: any) {
      setOptimistic((m) => {
        const prev = { ...(m[id] || {}) };
        delete prev.Comment;
        return { ...m, [id]: prev };
      });
      setError((e) => ({ ...e, [id]: err?.message || "Update failed" }));
    } finally {
      setSaving((s) => ({ ...s, [id]: false }));
    }
  };

  const handleSavePickup = async (row: ProcessedDispatchEntry) => {
    const id = row["Chassis No"];
    const localVal = pickupDraft[id] ?? isoToDatetimeLocal(row.EstimatedPickupAt);
    if (localVal) {
      const picked = new Date(localVal);
      if (picked < new Date()) {
        setError((e) => ({ ...e, [id]: "Pick-up time must be today or later" }));
        return;
      }
    }
    const iso = localVal ? datetimeLocalToIso(localVal) : null;
    applyOptimistic(id, { EstimatedPickupAt: iso });
    setSaving((s) => ({ ...s, [id]: true }));
    setError((e) => ({ ...e, [id]: undefined }));
    try {
      await patchDispatch(id, { EstimatedPickupAt: iso });
    } catch (err: any) {
      setOptimistic((m) => {
        const prev = { ...(m[id] || {}) };
        delete prev.EstimatedPickupAt;
        return { ...m, [id]: prev };
      });
      setError((e) => ({ ...e, [id]: err?.message || "Update failed" }));
    } finally {
      setSaving((s) => ({ ...s, [id]: false }));
    }
  };

  // 报告邮件
  const handleReportError = async (chassisNo: string) => {
    const entry = mergedAll.find(e => e["Chassis No"] === chassisNo);
    if (!entry) return;
    setSendingEmail(chassisNo);
    try {
      const emailData: EmailData = {
        chassisNo: entry["Chassis No"],
        sapData: entry["SAP Data"] || "N/A",
        scheduledDealer: entry["Scheduled Dealer"] || "N/A",
        reallocatedTo: entry.reallocatedTo || "No Reallocation",
      };
      const emailSent = await sendReportEmail(emailData);
      if (emailSent) {
        const errorDetails = `Dealer Check Mismatch - SAP Data: ${entry["SAP Data"] || "N/A"}, Scheduled Dealer: ${entry["Scheduled Dealer"] || "N/A"}, Reallocation To: ${entry.reallocatedTo || "N/A"}`;
        await reportError(chassisNo, errorDetails);
        toast.success(`Report sent successfully for chassis ${chassisNo}! Email notification sent to dispatch team.`);
      } else {
        toast.error("Failed to send email report. Please check your connection and try again.");
      }
    } catch (error) {
      console.error("Error sending report:", error);
      toast.error("Failed to send report. Please try again.");
    } finally {
      setSendingEmail(null);
    }
  };

  const SortableHeader = ({ children, sortKey, className = "" }: { children: React.ReactNode; sortKey: string; className?: string }) => (
    <TableHead className={`cursor-pointer hover:bg-gray-50 align-top ${className}`} onClick={() => handleSort(sortKey)}>
      <div className="flex items-center gap-1">
        <span className="truncate">{children}</span>
        <ArrowUpDown className="h-3 w-3 shrink-0" />
      </div>
    </TableHead>
  );

  return (
    <div className="space-y-6">
      {/* 主表（未 On Hold） */}
      <Card className="w-full max-w-none">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
            <CardTitle className="text-lg">
              Dispatch Data {filter !== 'all' && `(${filter === 'canBeDispatched' ? 'Can be Dispatched' : filter.charAt(0).toUpperCase() + filter.slice(1)})`}
            </CardTitle>
            <Input
              placeholder="Search all fields..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full sm:max-w-sm"
            />
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-visible">
            <Table className="w-full table-auto">
              <TableHeader>
                <TableRow>
                  <SortableHeader sortKey="Chassis No">Chassis No</SortableHeader>
                  <SortableHeader sortKey="GR to GI Days">GR Days</SortableHeader>
                  <SortableHeader sortKey="Customer">Customer</SortableHeader>
                  <SortableHeader sortKey="Model">Model</SortableHeader>
                  <SortableHeader sortKey="SAP Data">SAP Data</SortableHeader>
                  <SortableHeader sortKey="Scheduled Dealer">Scheduled Dealer</SortableHeader>
                  <SortableHeader sortKey="Matched PO No">Matched PO No</SortableHeader>
                  <SortableHeader sortKey="Code">Code</SortableHeader>
                  <TableHead>On Hold</TableHead>
                  <SortableHeader sortKey="Statuscheck">Status</SortableHeader>
                  <SortableHeader sortKey="DealerCheck">Dealer</SortableHeader>
                  <SortableHeader sortKey="reallocatedTo">Reallocation</SortableHeader>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {activeRows.map((entry, idx) => {
                  const id = entry["Chassis No"];
                  const barColor = getGRDaysColor(entry["GR to GI Days"] || 0);
                  const barWidth = getGRDaysWidth(entry["GR to GI Days"] || 0, maxGRDays);
                  const isLoading = sendingEmail === id;
                  const rowBg = idx % 2 === 0 ? "bg-white" : "bg-gray-50";

                  const commentValue = commentDraft[id] ?? (entry.Comment ?? "");
                  const pickupLocal  = pickupDraft[id]  ?? (entry.EstimatedPickupAt ? isoToDatetimeLocal(entry.EstimatedPickupAt) : "");

                  return (
                    <React.Fragment key={id}>
                      {/* 第一行：核心字段 */}
                      <TableRow className={`align-top ${rowBg}`}>
                        <TableCell className="font-medium text-sm whitespace-normal break-words">{id}</TableCell>

                        <TableCell className="whitespace-normal break-words">
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span>{entry["GR to GI Days"] ?? "-"}</span>
                              <span className="text-gray-500">days</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-1.5">
                              <div className={`h-1.5 rounded-full ${barColor}`} style={{ width: `${barWidth}%` }} />
                            </div>
                          </div>
                        </TableCell>

                        <TableCell className="text-sm whitespace-normal break-words">{entry.Customer || "-"}</TableCell>
                        <TableCell className="text-sm whitespace-normal break-words">{entry.Model || "-"}</TableCell>
                        <TableCell className="text-sm whitespace-normal break-words">{entry["SAP Data"] || "-"}</TableCell>
                        <TableCell className="text-sm whitespace-normal break-words">{entry["Scheduled Dealer"] || "-"}</TableCell>
                        <TableCell className="text-sm whitespace-normal break-words">{entry["Matched PO No"] || "-"}</TableCell>
                        <TableCell className="text-sm whitespace-normal break-words">{entry.Code || "-"}</TableCell>

                        <TableCell>
                          <Button
                            size="sm"
                            className={entry.OnHold ? "bg-red-600 text-white" : "bg-amber-500 text-white"}
                            disabled={saving[id]}
                            onClick={() => handleToggleOnHold(entry, !entry.OnHold)}
                          >
                            {entry.OnHold ? "Cancel On Hold" : "On Hold"}
                          </Button>
                        </TableCell>

                        <TableCell>
                          <span className={`px-2 py-1 rounded-full text-xs ${entry.Statuscheck === 'OK' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {entry.Statuscheck}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded-full text-xs ${entry.DealerCheck === 'OK' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {entry.DealerCheck}
                          </span>
                        </TableCell>
                        <TableCell className="font-medium text-blue-600 text-sm whitespace-normal break-words">
                          {entry.reallocatedTo || "-"}
                        </TableCell>

                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleReportError(id)}
                            disabled={isLoading}
                            className="flex items-center gap-1 text-xs"
                          >
                            {isLoading ? (<><Mail className="h-3 w-3 animate-pulse" /><span className="hidden sm:inline">Sending...</span></>) : (<><AlertTriangle className="h-3 w-3" /><span className="hidden sm:inline">Report</span></>)}
                          </Button>
                        </TableCell>
                      </TableRow>

                      {/* 第二行：扩展编辑区（Comment / Estimated pickup） */}
                      <TableRow className={`${rowBg}`}>
                        <TableCell colSpan={13}>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-3">
                            {/* Comment（允许空白保存） */}
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500 w-28 shrink-0">Comment</span>
                              <Input
                                className="w-full"
                                placeholder="Add a comment"
                                value={commentValue}
                                onChange={(e) => setCommentDraft((m) => ({ ...m, [id]: e.target.value }))}
                                onKeyDown={(e) => { if (e.key === "Enter") handleSaveComment(entry); }}
                              />
                              <Button size="sm" variant="secondary" disabled={saving[id]} onClick={() => handleSaveComment(entry)}>
                                Save
                              </Button>
                            </div>

                            {/* Estimated pickup time（今天以后） */}
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500 w-28 shrink-0">Estimated pickup</span>
                              <input
                                type="datetime-local"
                                className="px-2 py-1 border rounded w-full"
                                min={minDT}
                                value={pickupLocal}
                                onChange={(e) => setPickupDraft((m) => ({ ...m, [id]: e.target.value }))}
                              />
                              <Button size="sm" variant="secondary" disabled={saving[id]} onClick={() => handleSavePickup(entry)}>
                                Save
                              </Button>
                            </div>
                          </div>
                          {error[id] && <div className="text-xs text-red-600 mt-1">{error[id]}</div>}
                        </TableCell>
                      </TableRow>
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* On Hold 卡片区 */}
      <OnHoldBoard
        rows={onHoldRows}
        saving={saving}
        error={error}
        commentDraft={commentDraft}
        pickupDraft={pickupDraft}
        setCommentDraft={setCommentDraft}
        setPickupDraft={setPickupDraft}
        handlers={{ handleToggleOnHold, handleSaveComment, handleSavePickup }}
      />
    </div>
  );
};

/* ====================== On Hold 卡片（供上面引用） ====================== */
const OnHoldBoard: React.FC<{
  rows: ProcessedDispatchEntry[];
  saving: Record<string, boolean>;
  error: Record<string, string | undefined>;
  commentDraft: Record<string, string>;
  pickupDraft: Record<string, string>;
  setCommentDraft: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setPickupDraft: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  handlers: {
    handleToggleOnHold: (row: ProcessedDispatchEntry, next: boolean) => Promise<void>;
    handleSaveComment: (row: ProcessedDispatchEntry) => Promise<void>;
    handleSavePickup: (row: ProcessedDispatchEntry) => Promise<void>;
  };
}> = ({
  rows, saving, error, commentDraft, pickupDraft, setCommentDraft, setPickupDraft, handlers
}) => {
  if (!rows.length) return null;
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg">On Hold</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {rows.map((row, idx) => {
            const id = row["Chassis No"];
            const bg = idx % 2 === 0 ? "bg-white" : "bg-gray-50";
            const commentValue = commentDraft[id] ?? (row.Comment ?? "");
            const pickupLocal  = pickupDraft[id]  ?? (row.EstimatedPickupAt ? new Date(row.EstimatedPickupAt).toISOString().slice(0,16) : "");

            return (
              <div key={id} className={`rounded-xl border p-3 ${bg}`}>
                <div className="flex items-center justify-between">
                  <div className="font-semibold">{id}</div>
                  <Button
                    size="sm"
                    className="bg-red-600 text-white"
                    disabled={saving[id]}
                    onClick={() => handlers.handleToggleOnHold(row, false)}
                  >
                    Cancel On Hold
                  </Button>
                </div>
                <div className="mt-2 text-sm space-y-1">
                  <div><span className="text-gray-500">Customer：</span>{row.Customer || "-"}</div>
                  <div><span className="text-gray-500">Model：</span>{row.Model || "-"}</div>
                  <div><span className="text-gray-500">Code：</span>{row.Code || "-"}</div>
                  <div><span className="text-gray-500">Matched PO No：</span>{row["Matched PO No"] || "-"}</div>
                </div>

                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      className="w-full"
                      placeholder="Add a comment"
                      value={commentValue}
                      onChange={(e) => setCommentDraft((m) => ({ ...m, [id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") handlers.handleSaveComment(row); }}
                    />
                    <Button size="sm" variant="secondary" disabled={saving[id]} onClick={() => handlers.handleSaveComment(row)}>
                      Save
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="datetime-local"
                      className="px-2 py-1 border rounded w-full"
                      min={new Date().toISOString().slice(0,16)}
                      value={pickupLocal}
                      onChange={(e) => setPickupDraft((m) => ({ ...m, [id]: e.target.value }))}
                    />
                    <Button size="sm" variant="secondary" disabled={saving[id]} onClick={() => handlers.handleSavePickup(row)}>
                      Save
                    </Button>
                  </div>
                  {error[id] && <div className="text-xs text-red-600">{error[id]}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

/* ====================== ReallocationTable（保持旧接口，简化实现） ====================== */
interface ReallocationTableProps {
  data: ProcessedReallocationEntry[];
  searchTerm: string;
  onSearchChange: (term: string) => void;
  dispatchData: ProcessedDispatchEntry[];
}

export const ReallocationTable: React.FC<ReallocationTableProps> = ({
  data, searchTerm, onSearchChange, dispatchData
}) => {
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc'; } | null>(null);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const safeStringIncludes = (v: any, s: string) => v !== null && v !== undefined && String(v).toLowerCase().includes(s);

  const filteredAndSortedData = useMemo(() => {
    const s = (searchTerm || "").toLowerCase();
    let filtered = s
      ? data.filter(re =>
          safeStringIncludes(re.chassisNumber, s) ||
          safeStringIncludes(re.customer, s) ||
          safeStringIncludes(re.model, s) ||
          safeStringIncludes(re.originalDealer, s) ||
          safeStringIncludes(re.reallocatedTo, s) ||
          safeStringIncludes(re.regentProduction, s) ||
          safeStringIncludes(re.issue?.type, s) ||
          dispatchData.some(d => d["Chassis No"] === re.chassisNumber && (
            safeStringIncludes(d["Scheduled Dealer"], s) || safeStringIncludes(d["SAP Data"], s)
          ))
        )
      : data;

    if (sortConfig) {
      filtered = [...filtered].sort((a: any, b: any) => {
        const aValue = (a as any)[sortConfig.key];
        const bValue = (b as any)[sortConfig.key];
        const aStr = String(aValue ?? '').toLowerCase();
        const bStr = String(bValue ?? '').toLowerCase();
        return sortConfig.direction === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
      });
    }
    return filtered;
  }, [data, dispatchData, searchTerm, sortConfig]);

  const SortableHeader = ({ children, sortKey, className = "" }: { children: React.ReactNode; sortKey: string; className?: string }) => (
    <TableHead className={`cursor-pointer hover:bg-gray-50 ${className}`} onClick={() => handleSort(sortKey)}>
      <div className="flex items-center gap-1">
        <span className="truncate">{children}</span>
        <ArrowUpDown className="h-3 w-3 shrink-0" />
      </div>
    </TableHead>
  );

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <CardTitle className="text-lg">Reallocation</CardTitle>
          <Input
            placeholder="Search reallocations..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full sm:max-w-sm"
          />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-visible">
          <Table className="w-full table-auto">
            <TableHeader>
              <TableRow>
                <SortableHeader sortKey="chassisNumber">Chassis</SortableHeader>
                <SortableHeader sortKey="customer">Customer</SortableHeader>
                <SortableHeader sortKey="model">Model</SortableHeader>
                <SortableHeader sortKey="originalDealer">Original Dealer</SortableHeader>
                <SortableHeader sortKey="reallocatedTo">Reallocated To</SortableHeader>
                <SortableHeader sortKey="regentProduction">Regent Production</SortableHeader>
                <SortableHeader sortKey="issue">Issue</SortableHeader>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSortedData.map((re) => (
                <TableRow key={`${re.chassisNumber}-${re.entryId || re.submitTime || "row"}`}>
                  <TableCell className="text-sm whitespace-normal break-words">{re.chassisNumber}</TableCell>
                  <TableCell className="text-sm whitespace-normal break-words">{re.customer || "-"}</TableCell>
                  <TableCell className="text-sm whitespace-normal break-words">{re.model || "-"}</TableCell>
                  <TableCell className="text-sm whitespace-normal break-words">{re.originalDealer || "-"}</TableCell>
                  <TableCell className="text-sm whitespace-normal break-words">{re.reallocatedTo || "-"}</TableCell>
                  <TableCell className="text-sm whitespace-normal break-words">{re.regentProduction || "-"}</TableCell>
                  <TableCell className="text-sm whitespace-normal break-words">{re.issue?.type || "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};
