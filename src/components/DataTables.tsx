// src/components/DataTables.tsx
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowUpDown, AlertTriangle, Mail } from "lucide-react";
import { ProcessedDispatchEntry, ProcessedReallocationEntry } from "@/types";
import { getGRDaysColor, getGRDaysWidth, reportError } from "@/lib/firebase";
import { patchDispatch } from "@/lib/firebase";
import { sendReportEmail, EmailData } from "@/lib/emailjs";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

/* ---------- 你的统计卡片保持不变（如需保留请把你原来的 DispatchStats 放在这里） ---------- */

/* ---------- DispatchTable（两行布局 + 乐观更新 + On Hold 分区） ---------- */
interface DispatchTableProps {
  data: ProcessedDispatchEntry[];
  searchTerm: string;
  onSearchChange: (term: string) => void;
  filter: string;
  allData: ProcessedDispatchEntry[];
  reallocationData: ProcessedReallocationEntry[];
}

export const DispatchTable = ({
  data, searchTerm, onSearchChange, filter, allData, reallocationData
}: DispatchTableProps) => {
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc'; } | null>(null);
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);

  // 行内编辑状态（Comment / EstimatedPickupAt）
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const [pickupDraft, setPickupDraft]   = useState<Record<string, string>>({});

  // 乐观更新覆盖层（让 UI 立即反映 DB 写入的目标值）
  const [optimistic, setOptimistic]     = useState<Record<string, Partial<ProcessedDispatchEntry>>>({});
  const [saving, setSaving]             = useState<Record<string, boolean>>({});
  const [error, setError]               = useState<Record<string, string | undefined>>({});

  const applyOptimistic = (id: string, patch: Partial<ProcessedDispatchEntry>) => {
    setOptimistic((m) => ({ ...m, [id]: { ...(m[id] || {}), ...patch } }));
  };
  const clearOptimisticKey = (id: string) => {
    setOptimistic((m) => {
      const next = { ...m };
      delete next[id];
      return next;
    });
  };

  // 当父级 allData 更新时，若其值已与 optimistic 一致，则清除覆盖层
  useEffect(() => {
    if (!allData?.length) return;
    setOptimistic((cur) => {
      const next = { ...cur };
      for (const id of Object.keys(cur)) {
        const base = allData.find(e => e["Chassis No"] === id);
        if (!base) continue;
        const patch = cur[id];
        const match =
          (patch.OnHold === undefined || patch.OnHold === base.OnHold) &&
          (patch.Comment === undefined || patch.Comment === base.Comment) &&
          (patch.EstimatedPickupAt === undefined || patch.EstimatedPickupAt === base.EstimatedPickupAt);
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

  const safeStringIncludes = (value: any, searchLower: string): boolean =>
    value !== null && value !== undefined && String(value).toLowerCase().includes(searchLower);

  // 搜索 + 排序（在合并 optimistic 后的数据上进行）
  const mergedAll = useMemo(() => {
    const map: Record<string, ProcessedDispatchEntry> = {};
    for (const e of allData) map[e["Chassis No"]] = { ...e, ...(optimistic[e["Chassis No"]] || {}) };
    return Object.values(map);
  }, [allData, optimistic]);

  const filteredAndSortedData = useMemo(() => {
    const searchLower = (searchTerm || "").toLowerCase();
    let base = data.length ? data : allData; // 保持你的数据来源逻辑
    // 合并 optimistic
    const merged = base.map(e => ({ ...e, ...(optimistic[e["Chassis No"]] || {}) }));

    let filtered = searchTerm
      ? merged.filter(entry => {
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
      : merged;

    if (sortConfig) {
      filtered = [...filtered].sort((a, b) => {
        const aValue = a[sortConfig.key as keyof ProcessedDispatchEntry];
        const bValue = b[sortConfig.key as keyof ProcessedDispatchEntry];
        if (sortConfig.key === "GR to GI Days") {
          return sortConfig.direction === 'asc'
            ? (aValue as number) - (bValue as number)
            : (bValue as number) - (aValue as number);
        }
        const aStr = String(aValue ?? '').toLowerCase();
        const bStr = String(bValue ?? '').toLowerCase();
        return sortConfig.direction === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
      });
    }
    return filtered;
  }, [data, allData, optimistic, searchTerm, sortConfig, reallocationData]);

  // 分离出主表（未 on hold）和 On Hold 区域
  const activeRows = filteredAndSortedData.filter(e => !e.OnHold);
  const onHoldRows = filteredAndSortedData.filter(e => e.OnHold);

  const maxGRDays = Math.max(...mergedAll.map(entry => entry["GR to GI Days"] || 0), 1);

  // ===== 日期工具 =====
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

  // ===== 写库处理（乐观更新 + 回滚） =====
  const handleToggleOnHold = async (row: ProcessedDispatchEntry, next: boolean) => {
    const id = row["Chassis No"];
    const optimisticPatch = { OnHold: next, OnHoldAt: new Date().toISOString(), OnHoldBy: "webapp" as const };
    applyOptimistic(id, optimisticPatch);
    setSaving((s) => ({ ...s, [id]: true }));
    setError((e) => ({ ...e, [id]: undefined }));
    try {
      await patchDispatch(id, optimisticPatch);
    } catch (err: any) {
      // 回滚
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
      // 回滚
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
      // 回滚
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

  // 报告邮件（保留你的逻辑）
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
                  const pickupLocal  = pickupDraft[id]  ?? isoToDatetimeLocal(entry.EstimatedPickupAt);

                  return (
                    <>

                      {/* 第一行：核心字段 */}
                      <TableRow key={`${id}-top`} className={`align-top ${rowBg}`}>
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
                      <TableRow key={`${id}-bottom`} className={`${rowBg}`}>
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
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* On Hold 区域（Card） */}
      <OnHoldBoard
        rows={onHoldRows}
        optimistic={optimistic}
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

/* ---------- On Hold 专属卡片 ---------- */
const OnHoldBoard: React.FC<{
  rows: ProcessedDispatchEntry[];
  optimistic: Record<string, Partial<ProcessedDispatchEntry>>;
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

/* ---------- 你的 ReallocationTable 如需保留请继续放在本文件（略） ---------- */
