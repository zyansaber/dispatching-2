// src/components/DataTables.tsx
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronUp, ArrowUpDown, AlertTriangle, RefreshCw, Mail } from "lucide-react";
import { ProcessedDispatchEntry, ProcessedReallocationEntry } from "@/types";
import { getGRDaysColor, getGRDaysWidth, reportError, /* ⬅︎ 你已有的 */ } from "@/lib/firebase";
import { patchDispatch } from "@/lib/firebase"; // ✅ 新增导入
import { sendReportEmail, EmailData } from "@/lib/emailjs";
import { useState, useMemo } from "react";
import { toast } from "sonner";

/* ---------- 你原有的 DispatchStats 保持不变 ---------- */
interface DispatchStatsProps {
  total: number;
  invalidStock: number;
  snowyStock: number;
  canBeDispatched: number;
  onFilterChange: (filter: string) => void;
  activeFilter: string;
  onRefresh: () => void;
}

export const DispatchStats = ({ 
  total, invalidStock, snowyStock, canBeDispatched,
  onFilterChange, activeFilter, onRefresh
}: DispatchStatsProps) => {
  const cards = [
    { label: "Total Number", value: total, filter: "all", color: "text-blue-600" },
    { label: "Invalid Stock", value: invalidStock, filter: "invalid", color: "text-red-600" },
    { label: "Snowy Stock", value: snowyStock, filter: "snowy", color: "text-purple-600" },
    { label: "Can be Dispatched", value: canBeDispatched, filter: "canBeDispatched", color: "text-emerald-600" }
  ];
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={onRefresh} variant="outline" className="flex items-center space-x-2">
          <RefreshCw className="h-4 w-4" />
          <span>Refresh</span>
        </Button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((card) => (
          <Card 
            key={card.filter}
            className={`cursor-pointer transition-all hover:shadow-md ${activeFilter === card.filter ? 'ring-2 ring-blue-500' : ''}`}
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

/* ---------- DispatchTable：这里做了功能增强 ---------- */
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

  // ✅ 为新增列增加的状态（行内草稿 & 保存状态）
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const [pickupDraft, setPickupDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<Record<string, string | undefined>>({});

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const handleReportError = async (chassisNo: string) => {
    const entry = allData.find(e => e["Chassis No"] === chassisNo);
    if (!entry) return;
    setSendingEmail(chassisNo);
    try {
      const emailData: EmailData = {
        chassisNo: entry["Chassis No"],
        sapData: entry["SAP Data"] || "N/A",
        scheduledDealer: entry["Scheduled Dealer"] || "N/A",
        reallocatedTo: entry.reallocatedTo || "No Reallocation",
        // 你原来传的扩展字段如果模板需要可继续加
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
      console.error('Error sending report:', error);
      toast.error("Failed to send report. Please try again.");
    } finally {
      setSendingEmail(null);
    }
  };

  const safeStringIncludes = (value: any, searchTerm: string): boolean => {
    if (value === null || value === undefined) return false;
    return String(value).toLowerCase().includes(searchTerm);
  };

  const filteredAndSortedData = useMemo(() => {
    let filtered = searchTerm 
      ? allData.filter(entry => {
          const searchLower = searchTerm.toLowerCase();
          const dispatchMatch = (
            safeStringIncludes(entry["Chassis No"], searchLower) ||
            safeStringIncludes(entry.Customer, searchLower) ||
            safeStringIncludes(entry.Model, searchLower) ||
            safeStringIncludes(entry["Matched PO No"], searchLower) || // ✅ 支持搜索
            safeStringIncludes(entry["SAP Data"], searchLower) ||
            safeStringIncludes(entry["Scheduled Dealer"], searchLower) ||
            safeStringIncludes(entry.Statuscheck, searchLower) ||
            safeStringIncludes(entry.DealerCheck, searchLower) ||
            safeStringIncludes(entry.reallocatedTo, searchLower) ||
            safeStringIncludes(entry.Comment, searchLower) ||          // ✅ 支持搜索
            safeStringIncludes(entry.EstimatedPickupAt, searchLower)   // ✅ 支持搜索
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
      : data;

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
  }, [data, allData, searchTerm, sortConfig, reallocationData]);

  const maxGRDays = Math.max(...allData.map(entry => entry["GR to GI Days"]), 1);

  // ===== 工具：日期格式转换 =====
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

  // ===== 新增：按钮/保存处理函数 =====
  const handleToggleOnHold = async (row: ProcessedDispatchEntry, next: boolean) => {
    const id = row["Chassis No"];
    setSaving((s) => ({ ...s, [id]: true }));
    setError((e) => ({ ...e, [id]: undefined }));
    try {
      await patchDispatch(id, {
        OnHold: next,
        OnHoldAt: new Date().toISOString(),
        OnHoldBy: "webapp",
      });
    } catch (err: any) {
      setError((e) => ({ ...e, [id]: err?.message || "Update failed" }));
    } finally {
      setSaving((s) => ({ ...s, [id]: false }));
    }
  };

  const handleSaveComment = async (row: ProcessedDispatchEntry) => {
    const id = row["Chassis No"];
    const value = commentDraft[id] ?? row.Comment ?? "";
    setSaving((s) => ({ ...s, [id]: true }));
    setError((e) => ({ ...e, [id]: undefined }));
    try {
      await patchDispatch(id, { Comment: value || null });
    } catch (err: any) {
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
    setSaving((s) => ({ ...s, [id]: true }));
    setError((e) => ({ ...e, [id]: undefined }));
    try {
      await patchDispatch(id, { EstimatedPickupAt: localVal ? datetimeLocalToIso(localVal) : null });
    } catch (err: any) {
      setError((e) => ({ ...e, [id]: err?.message || "Update failed" }));
    } finally {
      setSaving((s) => ({ ...s, [id]: false }));
    }
  };

  const SortableHeader = ({ children, sortKey, className = "" }: { children: React.ReactNode; sortKey: string; className?: string }) => (
    <TableHead className={`cursor-pointer hover:bg-gray-50 ${className}`} onClick={() => handleSort(sortKey)}>
      <div className="flex items-center space-x-1">
        <span className="truncate">{children}</span>
        <ArrowUpDown className="h-3 w-3 flex-shrink-0" />
      </div>
    </TableHead>
  );

  return (
    <Card className="w-full">
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
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHeader sortKey="Chassis No" className="min-w-[120px]">Chassis No</SortableHeader>
                <SortableHeader sortKey="GR to GI Days" className="min-w-[100px]">GR Days</SortableHeader>
                <SortableHeader sortKey="Customer" className="min-w-[100px]">Customer</SortableHeader>
                <SortableHeader sortKey="Model" className="min-w-[80px]">Model</SortableHeader>
                <SortableHeader sortKey="SAP Data" className="min-w-[100px]">SAP Data</SortableHeader>
                <SortableHeader sortKey="Scheduled Dealer" className="min-w-[120px]">Scheduled Dealer</SortableHeader>
                {/* ✅ 新增列：Matched PO No（可排序） */}
                <SortableHeader sortKey="Matched PO No" className="min-w-[120px]">Matched PO No</SortableHeader>
                {/* ✅ 新增列：On Hold（按钮） */}
                <TableHead className="min-w-[120px]">On Hold</TableHead>
                {/* ✅ 新增列：Comment（可编辑保存） */}
                <TableHead className="min-w-[220px]">Comment</TableHead>
                {/* ✅ 新增列：Estimated pickup time（今天以后 + 保存） */}
                <TableHead className="min-w-[220px]">Estimated pickup time</TableHead>
                <SortableHeader sortKey="Statuscheck" className="min-w-[80px]">Status</SortableHeader>
                <SortableHeader sortKey="DealerCheck" className="min-w-[80px]">Dealer</SortableHeader>
                <SortableHeader sortKey="reallocatedTo" className="min-w-[100px]">Reallocation</SortableHeader>
                <TableHead className="min-w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSortedData.map((entry, index) => {
                const barColor = getGRDaysColor(entry["GR to GI Days"]);
                const barWidth = getGRDaysWidth(entry["GR to GI Days"], maxGRDays);
                const isLoading = sendingEmail === entry["Chassis No"];
                const id = entry["Chassis No"];

                const commentValue = commentDraft[id] ?? (entry.Comment ?? "");
                const pickupLocal = pickupDraft[id] ?? isoToDatetimeLocal(entry.EstimatedPickupAt);

                return (
                  <TableRow key={index}>
                    <TableCell className="font-medium text-sm">{id}</TableCell>
                    <TableCell className="min-w-[100px]">
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span>{entry["GR to GI Days"]}</span>
                          <span className="text-gray-500">days</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div className={`h-1.5 rounded-full ${barColor}`} style={{ width: `${barWidth}%` }} />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm truncate max-w-[100px]" title={entry.Customer}>{entry.Customer}</TableCell>
                    <TableCell className="text-sm truncate max-w-[80px]" title={entry.Model || "-"}>{entry.Model || "-"}</TableCell>
                    <TableCell className="text-sm truncate max-w-[100px]" title={entry["SAP Data"] || "-"}>{entry["SAP Data"] || "-"}</TableCell>
                    <TableCell className="text-sm truncate max-w-[120px]" title={entry["Scheduled Dealer"] || "-"}>{entry["Scheduled Dealer"] || "-"}</TableCell>

                    {/* ✅ Matched PO No（只读） */}
                    <TableCell className="text-sm truncate max-w-[120px]" title={entry["Matched PO No"] || "-"}>{entry["Matched PO No"] || "-"}</TableCell>

                    {/* ✅ On Hold / Cancel On Hold */}
                    <TableCell className="min-w-[120px]">
                      {entry.OnHold ? (
                        <Button size="sm" className="bg-red-600 text-white" disabled={saving[id]} onClick={() => handleToggleOnHold(entry, false)}>
                          Cancel On Hold
                        </Button>
                      ) : (
                        <Button size="sm" className="bg-amber-500 text-white" disabled={saving[id]} onClick={() => handleToggleOnHold(entry, true)}>
                          On Hold
                        </Button>
                      )}
                    </TableCell>

                    {/* ✅ Comment（可编辑 + 保存） */}
                    <TableCell className="min-w-[220px]">
                      <div className="flex items-center gap-2">
                        <Input
                          className="w-48"
                          placeholder="Add a comment"
                          value={commentValue}
                          onChange={(e) => setCommentDraft((m) => ({ ...m, [id]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === "Enter") handleSaveComment(entry); }}
                        />
                        <Button size="sm" variant="secondary" disabled={saving[id]} onClick={() => handleSaveComment(entry)}>
                          Save
                        </Button>
                      </div>
                      {error[id] && <div className="text-xs text-red-600 mt-1">{error[id]}</div>}
                    </TableCell>

                    {/* ✅ Estimated pickup time（今天以后 + 保存） */}
                    <TableCell className="min-w-[220px]">
                      <div className="flex items-center gap-2">
                        <input
                          type="datetime-local"
                          className="px-2 py-1 border rounded"
                          min={minDT}
                          value={pickupLocal}
                          onChange={(e) => setPickupDraft((m) => ({ ...m, [id]: e.target.value }))}
                        />
                        <Button size="sm" variant="secondary" disabled={saving[id]} onClick={() => handleSavePickup(entry)}>
                          Save
                        </Button>
                      </div>
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
                    <TableCell className="font-medium text-blue-600 text-sm truncate max-w-[100px]" title={entry.reallocatedTo || "-"}>{entry.reallocatedTo || "-"}</TableCell>

                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => handleReportError(id)} disabled={isLoading} className="flex items-center space-x-1 text-xs">
                        {isLoading ? (<><Mail className="h-3 w-3 animate-pulse" /><span className="hidden sm:inline">Sending...</span></>) : (<><AlertTriangle className="h-3 w-3" /><span className="hidden sm:inline">Report</span></>)}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

/* ---------- 你原有的 ReallocationTable 保持不变（略） ---------- */
interface ReallocationTableProps {
  data: ProcessedReallocationEntry[];
  searchTerm: string;
  onSearchChange: (term: string) => void;
  dispatchData: ProcessedDispatchEntry[];
}
export const ReallocationTable = ({ data, searchTerm, onSearchChange, dispatchData }: ReallocationTableProps) => {
  const [isVisible, setIsVisible] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc'; } | null>(null);
  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };
  const safeStringIncludes = (value: any, searchTerm: string): boolean => {
    if (value === null || value === undefined) return false;
    return String(value).toLowerCase().includes(searchTerm);
  };
  const filteredAndSortedData = useMemo(() => {
    let filtered = searchTerm 
      ? data.filter(entry => {
          const s = searchTerm.toLowerCase();
          const reallocationMatch = (
            safeStringIncludes(entry.chassisNumber, s) ||
            safeStringIncludes(entry.customer, s) ||
            safeStringIncludes(entry.model, s) ||
            safeStringIncludes(entry.originalDealer, s) ||
            safeStringIncludes(entry.reallocatedTo, s) ||
            safeStringIncludes(entry.regentProduction, s) ||
            safeStringIncludes(entry.issue?.type, s)
          );
          const dispatchMatch = dispatchData.some(d => 
            d["Chassis No"] === entry.chassisNumber && (
              safeStringIncludes(d["Chassis No"], s) ||
              safeStringIncludes(d.Customer, s) ||
              safeStringIncludes(d.Model, s) ||
              safeStringIncludes(d["Matched PO No"], s) ||
              safeStringIncludes(d["SAP Data"], s) ||
              safeStringIncludes(d["Scheduled Dealer"], s) ||
              safeStringIncludes(d.Statuscheck, s) ||
              safeStringIncludes(d.DealerCheck, s) ||
              safeStringIncludes(d.reallocatedTo, s)
            )
          );
          return reallocationMatch || dispatchMatch;
        })
      : data;

    if (sortConfig) {
      filtered = [...filtered].sort((a, b) => {
        const aValue = a[sortConfig.key as keyof ProcessedReallocationEntry];
        const bValue = b[sortConfig.key as keyof ProcessedReallocationEntry];
        const aStr = String(aValue ?? '').toLowerCase();
        const bStr = String(bValue ?? '').toLowerCase();
        return sortConfig.direction === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
      });
    }
    return filtered;
  }, [data, searchTerm, sortConfig, dispatchData]);

  const SortableHeader = ({ children, sortKey, className = "" }: { children: React.ReactNode; sortKey: string; className?: string }) => (
    <TableHead className={`cursor-pointer hover:bg-gray-50 ${className}`} onClick={() => handleSort(sortKey)}>
      <div className="flex items-center space-x-1">
        <span className="truncate">{children}</span>
        <ArrowUpDown className="h-3 w-3 flex-shrink-0" />
      </div>
    </TableHead>
  );

  return (
    <Card className="w-full mb-8">
      {/* ...你原有内容保持不变，这里省略 ... */}
    </Card>
  );
};
