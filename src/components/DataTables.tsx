// src/components/DataTables.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowUpDown, AlertTriangle, Mail, Download } from "lucide-react";
import { ProcessedDispatchEntry, ProcessedReallocationEntry } from "@/types";
import { getGRDaysColor, getGRDaysWidth, reportError, patchDispatch } from "@/lib/firebase";
import { toast } from "sonner";

// 让 TS 认识全局 XLSX（CDN 动态注入）
declare global {
  interface Window { XLSX?: any }
}

/** 单元格：一行显示 + 溢出省略号 */
const CELL = "text-sm leading-5 whitespace-nowrap overflow-hidden text-ellipsis";

/** 首行列（精简，避免横向滚动） */
const COLS = [
  { key: "__bar",            w: 8   },
  { key: "Chassis No",       w: 150 },
  { key: "GR to GI Days",    w: 90  },
  { key: "Customer",         w: 150 },
  { key: "Model",            w: 120 },
  { key: "SAP Data",         w: 170 },
  { key: "Scheduled Dealer", w: 170 },
  { key: "Matched PO No",    w: 160 },
  { key: "Code",             w: 120 },
  { key: "On Hold",          w: 110 },
];

// 可选：无邮件模块也不报错
let sendReportEmail: (data: any) => Promise<boolean>;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  sendReportEmail = require("@/lib/emailjs").sendReportEmail;
} catch {
  sendReportEmail = async () => false;
}

/* ====================== 顶部统计卡片 - 增强视觉 ====================== */
interface DispatchStatsProps {
  total: number;
  invalidStock: number;
  snowyStock: number;
  canBeDispatched: number;
  onHold?: number;
  onFilterChange: (filter: 'all' | 'invalid' | 'snowy' | 'canBeDispatched' | 'onHold') => void;
  activeFilter?: 'all' | 'invalid' | 'snowy' | 'canBeDispatched' | 'onHold';
  onRefresh: () => void;
}

export const DispatchStats: React.FC<DispatchStatsProps> = ({
  total, invalidStock, snowyStock, canBeDispatched, onHold,
  onFilterChange, activeFilter = "all"
}) => {
  const cards = [
    { label: "Total", value: total, filter: "all", color: "text-blue-600", bgGradient: "from-blue-50 to-blue-100" },
    { label: "Invalid", value: invalidStock, filter: "invalid", color: "text-red-600", bgGradient: "from-red-50 to-red-100" },
    { label: "Snowy Stock", value: snowyStock, filter: "snowy", color: "text-purple-600", bgGradient: "from-purple-50 to-purple-100" },
    { label: "Can Dispatch", value: canBeDispatched, filter: "canBeDispatched", color: "text-emerald-600", bgGradient: "from-emerald-50 to-emerald-100" },
    ...(onHold !== undefined ? [{ label: "On Hold", value: onHold, filter: "onHold", color: "text-amber-600", bgGradient: "from-amber-50 to-amber-100" } as const] : []),
  ] as const;

  return (
    <div className="space-y-4 w-full max-w-full overflow-x-hidden">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {cards.map((card) => (
          <Card
            key={card.filter}
            className={`cursor-pointer transition-all duration-300 hover:shadow-xl hover:scale-105 border-2 ${
              activeFilter === card.filter 
                ? `ring-2 ring-offset-2 ring-blue-500 shadow-lg bg-gradient-to-br ${card.bgGradient}` 
                : "hover:border-blue-300 bg-white"
            }`}
            onClick={() => onFilterChange(card.filter as any)}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-600 truncate tracking-wide">
                {card.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${card.color} transition-all duration-300 ${
                activeFilter === card.filter ? 'scale-110' : ''
              }`}>
                {card.value.toLocaleString()}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

/* ====================== 主表：增强视觉效果 + 吸顶标题 ====================== */
interface DispatchTableProps {
  allData: ProcessedDispatchEntry[];
  activeFilter?: 'all' | 'invalid' | 'snowy' | 'canBeDispatched' | 'onHold';
  searchTerm: string;
  onSearchChange: (term: string) => void;
  reallocationData: ProcessedReallocationEntry[];
}

export const DispatchTable: React.FC<DispatchTableProps> = ({
  allData, activeFilter = "all", searchTerm, onSearchChange, reallocationData
}) => {
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc'; } | null>(null);
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);

  // 行内编辑状态
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const [pickupDraft, setPickupDraft]   = useState<Record<string, string>>({});

  // 乐观更新
  const [optimistic, setOptimistic]     = useState<Record<string, Partial<ProcessedDispatchEntry>>>({});
  const [saving, setSaving]             = useState<Record<string, boolean>>({});
  const [error, setError]               = useState<Record<string, string | undefined>>({});

  useEffect(() => {
    if (!allData?.length) return;
    setOptimistic((cur) => {
      const next = { ...cur };
      for (const id of Object.keys(cur)) {
        const base = allData.find(e => e["Chassis No"] === id);
        if (!base) continue;
        const p = cur[id];
        const inSync =
          (p.OnHold === undefined || p.OnHold === base.OnHold) &&
          (p.Comment === undefined || p.Comment === base.Comment) &&
          (p.EstimatedPickupAt === undefined || p.EstimatedPickupAt === base.EstimatedPickupAt);
        if (inSync) delete next[id];
      }
      return next;
    });
  }, [allData]);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const safeIncludes = (v: any, s: string) => v != null && String(v).toLowerCase().includes(s);

  // 合并乐观层
  const baseMerged = useMemo(() => {
    const map: Record<string, ProcessedDispatchEntry> = {};
    for (const e of allData) map[e["Chassis No"]] = { ...e, ...(optimistic[e["Chassis No"]] || {}) };
    return Object.values(map);
  }, [allData, optimistic]);

  const filtered = useMemo(() => {
    const s = (searchTerm || "").toLowerCase();
    let arr = baseMerged;
    if (activeFilter === "invalid")   arr = arr.filter(e => e.Statuscheck !== "OK");
    if (activeFilter === "onHold")    arr = arr.filter(e => e.OnHold === true);
    if (activeFilter === "snowy")     arr = arr.filter(e => e.reallocatedTo === "Snowy Stock" || e["Scheduled Dealer"] === "Snowy Stock");
    if (activeFilter === "canBeDispatched") arr = arr.filter(e => e.Statuscheck === "OK" && !(e.reallocatedTo === "Snowy Stock" || e["Scheduled Dealer"] === "Snowy Stock"));

    if (s) {
      arr = arr.filter(entry => {
        const d = entry;
        const reMatch = reallocationData.some(re =>
          re.chassisNumber === d["Chassis No"] &&
          (safeIncludes(re.customer, s) || safeIncludes(re.model, s) || safeIncludes(re.reallocatedTo, s) || safeIncludes(re.issue?.type, s))
        );
        return (
          safeIncludes(d["Chassis No"], s) ||
          safeIncludes(d.Customer, s) ||
          safeIncludes(d.Model, s) ||
          safeIncludes(d["Matched PO No"], s) ||
          safeIncludes(d["SAP Data"], s) ||
          safeIncludes(d["Scheduled Dealer"], s) ||
          safeIncludes(d.Code, s) ||
          safeIncludes(d.Statuscheck, s) ||
          safeIncludes(d.DealerCheck, s) ||
          safeIncludes(d.reallocatedTo, s) ||
          safeIncludes(d.Comment, s) ||
          safeIncludes(d.EstimatedPickupAt, s) ||
          reMatch
        );
      });
    }

    if (sortConfig) {
      const { key, direction } = sortConfig;
      arr = [...arr].sort((a: any, b: any) => {
        const av = a[key], bv = b[key];
        if (key === "GR to GI Days") {
          return direction === 'asc' ? (Number(av)||0) - (Number(bv)||0) : (Number(bv)||0) - (Number(av)||0);
        }
        return direction === 'asc'
          ? String(av ?? '').localeCompare(String(bv ?? ''), undefined, { sensitivity: "base" })
          : String(bv ?? '').localeCompare(String(av ?? ''), undefined, { sensitivity: "base" });
      });
    }
    return arr;
  }, [baseMerged, searchTerm, activeFilter, sortConfig, reallocationData]);

  const activeRows = filtered.filter(e => !e.OnHold);
  const onHoldRows = filtered.filter(e =>  e.OnHold);

  const maxGRDays = Math.max(...baseMerged.map(e => e["GR to GI Days"] || 0), 1);

  // 日期工具
  const isoToLocal = (iso?: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const localToIso = (v: string) => (v ? new Date(v).toISOString() : null);
  const minLocalNow = useMemo(() => {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  }, []);

  // 写库（乐观 + 回滚）
  const applyOptimistic = (id: string, patch: Partial<ProcessedDispatchEntry>) =>
    setOptimistic((m) => ({ ...m, [id]: { ...(m[id] || {}), ...patch } }));

  const handleToggleOnHold = async (row: ProcessedDispatchEntry, next: boolean) => {
    const id = row["Chassis No"];
    const patch = { OnHold: next, OnHoldAt: new Date().toISOString(), OnHoldBy: "webapp" as const };
    applyOptimistic(id, patch);
    setSaving(s => ({ ...s, [id]: true }));
    setError(e => ({ ...e, [id]: undefined }));
    try {
      await patchDispatch(id, patch);
    } catch (err: any) {
      setOptimistic(m => { const prev = { ...(m[id] || {}) }; delete prev.OnHold; delete prev.OnHoldAt; delete prev.OnHoldBy; return { ...m, [id]: prev }; });
      setError(e => ({ ...e, [id]: err?.message || "Update failed" }));
    } finally {
      setSaving(s => ({ ...s, [id]: false }));
    }
  };

  const handleSaveComment = async (row: ProcessedDispatchEntry) => {
    const id = row["Chassis No"];
    const value = commentDraft[id] ?? row.Comment ?? "";
    applyOptimistic(id, { Comment: value });
    setSaving(s => ({ ...s, [id]: true }));
    setError(e => ({ ...e, [id]: undefined }));
    try {
      await patchDispatch(id, { Comment: value });
    } catch (err: any) {
      setOptimistic(m => { const p = { ...(m[id] || {}) }; delete p.Comment; return { ...m, [id]: p }; });
      setError(e => ({ ...e, [id]: err?.message || "Update failed" }));
    } finally {
      setSaving(s => ({ ...s, [id]: false }));
    }
  };

  const handleSavePickup = async (row: ProcessedDispatchEntry) => {
    const id = row["Chassis No"];
    const localVal = pickupDraft[id] ?? isoToLocal(row.EstimatedPickupAt);
    if (localVal) {
      const picked = new Date(localVal);
      if (picked < new Date()) {
        setError(e => ({ ...e, [id]: "Pick-up time must be today or later" }));
        return;
      }
    }
    const iso = localVal ? localToIso(localVal) : null;
    applyOptimistic(id, { EstimatedPickupAt: iso });
    setSaving(s => ({ ...s, [id]: true }));
    setError(e => ({ ...e, [id]: undefined }));
    try {
      await patchDispatch(id, { EstimatedPickupAt: iso });
    } catch (err: any) {
      setOptimistic(m => { const p = { ...(m[id] || {}) }; delete p.EstimatedPickupAt; return { ...m, [id]: p }; });
      setError(e => ({ ...e, [id]: err?.message || "Update failed" }));
    } finally {
      setSaving(s => ({ ...s, [id]: false }));
    }
  };

  const handleReportError = async (chassisNo: string) => {
    const entry = baseMerged.find(e => e["Chassis No"] === chassisNo);
    if (!entry) return;
    setSendingEmail(chassisNo);
    try {
      const ok = await sendReportEmail({
        chassisNo: entry["Chassis No"],
        sapData: entry["SAP Data"] || "N/A",
        scheduledDealer: entry["Scheduled Dealer"] || "N/A",
        reallocatedTo: entry.reallocatedTo || "No Reallocation",
      });
      if (ok) toast.success(`Report sent for ${chassisNo}.`);
      else toast.error("Failed to send email report.");
      await reportError(chassisNo, "Dealer check mismatch");
    } catch {
      toast.error("Failed to send report.");
    } finally {
      setSendingEmail(null);
    }
  };

  // ===== 导出（CDN 版 xlsx 优先，失败回落 CSV） =====
  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const toPlainRow = (e: ProcessedDispatchEntry) => ({
    "Chassis No": e["Chassis No"],
    "GR to GI Days": e["GR to GI Days"] ?? "",
    Customer: e.Customer ?? "",
    Model: e.Model ?? "",
    "SAP Data": e["SAP Data"] ?? "",
    "Scheduled Dealer": e["Scheduled Dealer"] ?? "",
    "Matched PO No": e["Matched PO No"] ?? "",
    Code: e.Code ?? "",
    "On Hold": e.OnHold ? "Yes" : "No",
    Status: e.Statuscheck ?? "",
    Dealer: e.DealerCheck ?? "",
    Reallocation: e.reallocatedTo ?? "",
    Comment: e.Comment ?? "",
    "Estimated Pickup At": e.EstimatedPickupAt ?? "",
  });

  const loadXLSX = (): Promise<any> => new Promise((resolve, reject) => {
    if (window.XLSX) return resolve(window.XLSX);
    const s = document.createElement("script");
    s.src = "https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js";
    s.async = true;
    s.onload = () => resolve(window.XLSX);
    s.onerror = () => reject(new Error("CDN xlsx load failed"));
    document.head.appendChild(s);
  });

  const exportExcel = async () => {
    try {
      const XLSX = await loadXLSX();
      const active = activeRows.map(toPlainRow);
      const onhold = onHoldRows.map(toPlainRow);

      const wb = XLSX.utils.book_new();
      const ws1 = XLSX.utils.json_to_sheet(active);
      const ws2 = XLSX.utils.json_to_sheet(onhold);
      XLSX.utils.book_append_sheet(wb, ws1, "Active");
      XLSX.utils.book_append_sheet(wb, ws2, "On Hold");

      const wbout = XLSX.write(wb, { type: "array", bookType: "xlsx" });
      downloadBlob(new Blob([wbout], { type: "application/octet-stream" }), `dispatch_${new Date().toISOString().slice(0,10)}.xlsx`);
      toast.success("Excel 导出完成");
    } catch {
      const rowsToCsv = (rows: any[]) => {
        if (!rows.length) return "";
        const headers = Object.keys(rows[0]);
        const escape = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
        const lines = [headers.map(escape).join(",")];
        for (const r of rows) lines.push(headers.map(h => escape(r[h])).join(","));
        return lines.join("\n");
      };
      const active = activeRows.map(toPlainRow);
      const onhold = onHoldRows.map(toPlainRow);
      downloadBlob(new Blob([rowsToCsv(active)], { type: "text/csv;charset=utf-8" }), `dispatch_active_${new Date().toISOString().slice(0,10)}.csv`);
      downloadBlob(new Blob([rowsToCsv(onhold)], { type: "text/csv;charset=utf-8" }), `dispatch_onhold_${new Date().toISOString().slice(0,10)}.csv`);
      toast.message("Excel 依赖不可用，已回落为 CSV 导出");
    }
  };

  const SortableHeader = ({ children, sortKey, className = "", align = "left" as "left" | "center" }: { children: React.ReactNode; sortKey: string; className?: string; align?: "left" | "center" }) => (
    <TableHead 
      className={`cursor-pointer hover:bg-blue-50 transition-colors align-top ${align === "center" ? "text-center" : ""} ${className}`} 
      onClick={() => handleSort(sortKey)}
    >
      <div className={`flex ${align === "center" ? "justify-center" : ""} items-center gap-1`}>
        <span className="truncate font-semibold text-gray-700">{children}</span>
        <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-gray-500" />
      </div>
    </TableHead>
  );

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      {/* 主表 - 增强设计 */}
      <Card className="w-full max-w-full shadow-lg border-gray-200">
        {/* ✅ 吸顶标题栏 - 增强视觉效果 */}
        <CardHeader className="sticky top-0 z-20 bg-gradient-to-r from-white via-blue-50 to-white backdrop-blur-md shadow-md border-b-2 border-blue-100">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-8 bg-gradient-to-b from-blue-500 to-blue-700 rounded-full shadow-sm" />
              <CardTitle className="text-xl font-bold tracking-tight bg-gradient-to-r from-gray-900 via-blue-900 to-gray-900 bg-clip-text text-transparent">
                Dispatch Data
              </CardTitle>
              <div className="px-3 py-1 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full">
                {activeRows.length} Active
              </div>
            </div>
            <div className="flex items-center gap-3 w-full md:w-auto">
              <Input
                placeholder="🔍 Search chassis / dealer / PO / comment ..."
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full md:max-w-sm transition-all duration-200 focus:w-full md:focus:max-w-md border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
              <Button 
                variant="outline" 
                className="shrink-0 border-blue-300 hover:border-blue-500 hover:bg-blue-50 transition-all duration-200 shadow-sm font-semibold" 
                onClick={exportExcel}
              >
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="w-full max-w-full overflow-x-hidden">
            <Table className="w-full table-fixed">
              <colgroup>
                {COLS.map((c) => (
                  <col key={c.key} style={{ width: c.w === 8 ? "8px" : `${c.w}px` }} />
                ))}
              </colgroup>

              {/* ✅ 吸顶表头：固定在标题之下 - 增强样式 */}
              <TableHeader className="sticky top-[72px] z-10 bg-gradient-to-r from-gray-50 via-blue-50 to-gray-50 backdrop-blur-sm border-b-2 border-gray-200 shadow-sm">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="p-0" />
                  <SortableHeader sortKey="Chassis No">Chassis</SortableHeader>
                  <SortableHeader sortKey="GR to GI Days" align="center">GR Days</SortableHeader>
                  <SortableHeader sortKey="Customer">Customer</SortableHeader>
                  <SortableHeader sortKey="Model">Model</SortableHeader>
                  <SortableHeader sortKey="SAP Data">SAP Data</SortableHeader>
                  <SortableHeader sortKey="Scheduled Dealer">Scheduled Dealer</SortableHeader>
                  <SortableHeader sortKey="Matched PO No">Matched PO No</SortableHeader>
                  <SortableHeader sortKey="Code">Code</SortableHeader>
                  <TableHead className="text-center align-top pt-3 font-semibold text-gray-700">On Hold</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {activeRows.map((entry, idx) => {
                  const id = entry["Chassis No"];
                  const barColor = getGRDaysColor(entry["GR to GI Days"] || 0);
                  const barWidth = getGRDaysWidth(entry["GR to GI Days"] || 0, maxGRDays);
                  const zebra = idx % 2 === 0 ? "bg-white" : "bg-gradient-to-r from-gray-50/50 to-transparent";
                  const groupShadow = "shadow-sm hover:shadow-md transition-all duration-200";

                  const commentValue = commentDraft[id] ?? (entry.Comment ?? "");
                  const pickupLocal  = pickupDraft[id]  ?? (entry.EstimatedPickupAt ? isoToLocal(entry.EstimatedPickupAt) : "");

                  return (
                    <React.Fragment key={id}>
                      {/* 第一行：关键信息 - 增强视觉 */}
                      <TableRow className={`align-top ${zebra} ${groupShadow} border-l-4 border-l-transparent hover:border-l-blue-500`}>
                        {/* 左侧分组色条 */}
                        <TableCell rowSpan={2} className="p-0">
                          <div className="h-full w-2 rounded-l-md bg-gradient-to-b from-blue-400 via-blue-500 to-blue-600 shadow-sm" />
                        </TableCell>

                        <TableCell className={`font-semibold text-gray-900 ${CELL}`} title={id}>{id}</TableCell>

                        <TableCell className={`text-center ${CELL}`} title={String(entry["GR to GI Days"] ?? "-")}>
                          <div className="inline-flex flex-col items-stretch w-full">
                            <div className="flex justify-between text-xs font-medium">
                              <span className="text-gray-900">{entry["GR to GI Days"] ?? "-"}</span>
                              <span className="text-gray-500">days</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2 mt-1 shadow-inner">
                              <div className={`h-2 rounded-full ${barColor} transition-all duration-300 shadow-sm`} style={{ width: `${barWidth}%` }} />
                            </div>
                          </div>
                        </TableCell>

                        <TableCell className={CELL} title={entry.Customer || ""}>{entry.Customer || "-"}</TableCell>
                        <TableCell className={CELL} title={entry.Model || ""}>{entry.Model || "-"}</TableCell>
                        <TableCell className={CELL} title={entry["SAP Data"] || ""}>{entry["SAP Data"] || "-"}</TableCell>
                        <TableCell className={CELL} title={entry["Scheduled Dealer"] || ""}>{entry["Scheduled Dealer"] || "-"}</TableCell>
                        <TableCell className={CELL} title={entry["Matched PO No"] || ""}>{entry["Matched PO No"] || "-"}</TableCell>
                        <TableCell className={CELL} title={entry.Code || ""}>{entry.Code || "-"}</TableCell>

                        <TableCell className="text-center">
                          <Button
                            size="sm"
                            className={`transition-all duration-200 font-semibold shadow-md ${
                              entry.OnHold 
                                ? "bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white" 
                                : "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white"
                            }`}
                            disabled={saving[id]}
                            onClick={() => handleToggleOnHold(entry, !entry.OnHold)}
                          >
                            {entry.OnHold ? "Cancel" : "On Hold"}
                          </Button>
                        </TableCell>
                      </TableRow>

                      {/* 第二行：编辑 & 扩展 - 增强背景 */}
                      <TableRow className={`${zebra} ${groupShadow} border-l-4 border-l-transparent hover:border-l-blue-500`}>
                        <TableCell colSpan={9}>
                          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 py-4 px-3 bg-gradient-to-r from-blue-50/30 via-transparent to-purple-50/30 rounded-lg">
                            {/* Comment */}
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-xs font-semibold text-gray-600 w-28 shrink-0 uppercase tracking-wide">Comment</span>
                              <Input
                                className="w-full max-w-[320px] border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all shadow-sm"
                                placeholder="Add a comment"
                                value={commentValue}
                                onChange={(e) => setCommentDraft((m) => ({ ...m, [id]: e.target.value }))}
                                onKeyDown={(e) => { if (e.key === "Enter") handleSaveComment(entry); }}
                              />
                              <Button 
                                size="sm" 
                                variant="secondary" 
                                disabled={saving[id]} 
                                onClick={() => handleSaveComment(entry)}
                                className="shadow-sm hover:shadow-md transition-all font-semibold"
                              >
                                Save
                              </Button>
                            </div>

                            {/* Estimated pickup */}
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-xs font-semibold text-gray-600 w-28 shrink-0 uppercase tracking-wide">Pickup</span>
                              <input
                                type="datetime-local"
                                className="px-3 py-1.5 border border-gray-300 rounded-md w-full max-w-[260px] focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all shadow-sm"
                                min={minLocalNow}
                                value={pickupLocal}
                                onChange={(e) => setPickupDraft((m) => ({ ...m, [id]: e.target.value }))}
                              />
                              <Button 
                                size="sm" 
                                variant="secondary" 
                                disabled={saving[id]} 
                                onClick={() => handleSavePickup(entry)}
                                className="shadow-sm hover:shadow-md transition-all font-semibold"
                              >
                                Save
                              </Button>
                            </div>

                            {/* Checks */}
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="text-xs font-semibold text-gray-600 w-20 shrink-0 uppercase tracking-wide">Checks</span>
                              <span
                                className={`px-3 py-1 rounded-full text-xs font-semibold shadow-sm ${
                                  entry.Statuscheck === 'OK' ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-100 text-red-700 border border-red-200'
                                }`}
                                title={`Status: ${entry.Statuscheck || "-"}`}
                              >
                                Status: {entry.Statuscheck || "-"}
                              </span>
                              <span
                                className={`px-3 py-1 rounded-full text-xs font-semibold shadow-sm ${
                                  entry.DealerCheck === 'OK' ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-100 text-red-700 border border-red-200'
                                }`}
                                title={`Dealer: ${entry.DealerCheck || "-"}`}
                              >
                                Dealer: {entry.DealerCheck || "-"}
                              </span>
                            </div>

                            {/* ✅ Reallocation（红色高亮） */}
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-xs font-semibold text-gray-600 w-28 shrink-0 uppercase tracking-wide">Reallocation</span>
                              <span
                                className={`px-3 py-1.5 rounded-md text-xs font-semibold shadow-sm ${
                                  entry.reallocatedTo 
                                    ? 'bg-gradient-to-r from-red-50 to-red-100 text-red-700 border-2 border-red-300' 
                                    : 'bg-gray-100 text-gray-500 border border-gray-200'
                                }`}
                                title={entry.reallocatedTo || "-"}
                              >
                                {entry.reallocatedTo || "-"}
                              </span>
                            </div>

                            {/* Actions（Report） */}
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-xs font-semibold text-gray-600 w-20 shrink-0 uppercase tracking-wide">Actions</span>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleReportError(id)}
                                disabled={sendingEmail === id}
                                className="inline-flex items-center gap-1.5 text-xs font-semibold border-amber-300 hover:border-amber-500 hover:bg-amber-50 transition-all shadow-sm"
                              >
                                {sendingEmail === id ? (
                                  <>
                                    <Mail className="h-3.5 w-3.5 animate-pulse" />
                                    <span className="hidden sm:inline">Sending...</span>
                                  </>
                                ) : (
                                  <>
                                    <AlertTriangle className="h-3.5 w-3.5" />
                                    <span className="hidden sm:inline">Report</span>
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>

                          {error[id] && (
                            <div className="text-xs text-red-600 mt-2 px-3 py-2 bg-red-50 rounded-md border border-red-200 font-medium">
                              {error[id]}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>

                      {/* 组间分隔 */}
                      <TableRow>
                        <TableCell colSpan={10} className="p-0">
                          <div className="h-4 bg-gradient-to-r from-transparent via-gray-100 to-transparent" />
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

/* ====================== On Hold 卡片：增强视觉 ====================== */
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
    <Card className="w-full max-w-full overflow-x-hidden shadow-lg border-gray-200">
      <CardHeader className="bg-gradient-to-r from-amber-50 via-red-50 to-amber-50 border-b-2 border-amber-200">
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-8 bg-gradient-to-b from-red-500 to-red-700 rounded-full shadow-sm" />
          <CardTitle className="text-xl font-bold tracking-tight bg-gradient-to-r from-red-700 via-amber-700 to-red-700 bg-clip-text text-transparent">
            On Hold
          </CardTitle>
          <div className="px-3 py-1 bg-red-100 text-red-700 text-xs font-semibold rounded-full shadow-sm">
            {rows.length} Items
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-5 items-stretch w-full max-w-full">
          {rows.map((row, idx) => {
            const id = row["Chassis No"];
            const commentValue = commentDraft[id] ?? (row.Comment ?? "");
            const pickupLocal  = pickupDraft[id]  ?? (row.EstimatedPickupAt ? new Date(row.EstimatedPickupAt).toISOString().slice(0,16) : "");
            return (
              <div 
                key={id} 
                className={`h-full min-h-[300px] flex flex-col rounded-xl border-2 p-5 shadow-md hover:shadow-xl transition-all duration-300 ${
                  idx % 2 
                    ? "bg-gradient-to-br from-amber-50 to-red-50 border-amber-200" 
                    : "bg-white border-gray-200"
                }`}
              >
                <div className="flex items-center justify-between gap-3 pb-3 border-b-2 border-gray-200">
                  <div className="font-bold text-base text-gray-900 break-words break-all hyphens-auto">{id}</div>
                  <Button
                    size="sm"
                    className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white shadow-md font-semibold transition-all"
                    disabled={saving[id]}
                    onClick={() => handlers.handleToggleOnHold(row, false)}
                  >
                    Cancel
                  </Button>
                </div>

                <div className="mt-4 text-sm space-y-2 flex-1 min-h-[130px]">
                  <div className={`${CELL} py-1`}>
                    <span className="text-gray-500 font-semibold">Customer: </span>
                    <span className="text-gray-900">{row.Customer || "-"}</span>
                  </div>
                  <div className={`${CELL} py-1`}>
                    <span className="text-gray-500 font-semibold">Model: </span>
                    <span className="text-gray-900">{row.Model || "-"}</span>
                  </div>
                  <div className={`${CELL} py-1`}>
                    <span className="text-gray-500 font-semibold">Code: </span>
                    <span className="text-gray-900">{row.Code || "-"}</span>
                  </div>
                  <div className={`${CELL} py-1`}>
                    <span className="text-gray-500 font-semibold">Matched PO: </span>
                    <span className="text-gray-900">{row["Matched PO No"] || "-"}</span>
                  </div>
                </div>

                <div className="mt-4 space-y-3 pt-3 border-t-2 border-gray-200">
                  <div className="flex items-center gap-2 min-w-0">
                    <Input
                      className="w-full border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all shadow-sm"
                      placeholder="Add a comment"
                      value={commentValue}
                      onChange={(e) => setCommentDraft((m) => ({ ...m, [id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") handlers.handleSaveComment(row); }}
                    />
                    <Button 
                      size="sm" 
                      variant="secondary" 
                      disabled={saving[id]} 
                      onClick={() => handlers.handleSaveComment(row)}
                      className="shadow-sm hover:shadow-md transition-all font-semibold"
                    >
                      Save
                    </Button>
                  </div>

                  <div className="flex items-center gap-2 min-w-0">
                    <input
                      type="datetime-local"
                      className="px-3 py-1.5 border border-gray-300 rounded-md w-full focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all shadow-sm"
                      min={new Date().toISOString().slice(0,16)}
                      value={pickupLocal}
                      onChange={(e) => setPickupDraft((m) => ({ ...m, [id]: e.target.value }))}
                    />
                    <Button 
                      size="sm" 
                      variant="secondary" 
                      disabled={saving[id]} 
                      onClick={() => handlers.handleSavePickup(row)}
                      className="shadow-sm hover:shadow-md transition-all font-semibold"
                    >
                      Save
                    </Button>
                  </div>

                  {error[id] && (
                    <div className="text-xs text-red-600 px-3 py-2 bg-red-50 rounded-md border border-red-200 font-medium">
                      {error[id]}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

/* ====================== ReallocationTable - 增强视觉 ====================== */
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

  const safeStringIncludes = (v: any, s: string) => v != null && String(v).toLowerCase().includes(s);

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
    <TableHead 
      className={`cursor-pointer hover:bg-purple-50 transition-colors ${className}`} 
      onClick={() => handleSort(sortKey)}
    >
      <div className="flex items-center gap-1">
        <span className="truncate font-semibold text-gray-700">{children}</span>
        <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-gray-500" />
      </div>
    </TableHead>
  );

  return (
    <Card className="w-full max-w-full overflow-x-hidden shadow-lg border-gray-200">
      <CardHeader className="bg-gradient-to-r from-purple-50 via-pink-50 to-purple-50 border-b-2 border-purple-200">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-8 bg-gradient-to-b from-purple-500 to-purple-700 rounded-full shadow-sm" />
            <CardTitle className="text-xl font-bold bg-gradient-to-r from-purple-700 via-pink-700 to-purple-700 bg-clip-text text-transparent">
              Reallocation
            </CardTitle>
            <div className="px-3 py-1 bg-purple-100 text-purple-700 text-xs font-semibold rounded-full shadow-sm">
              {filteredAndSortedData.length} Items
            </div>
          </div>
          <Input
            placeholder="🔍 Search reallocations..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full sm:max-w-sm transition-all duration-200 border-gray-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
          />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="w-full max-w-full overflow-x-auto">
          <Table className="w-full">
            <TableHeader className="bg-gradient-to-r from-gray-50 to-purple-50 sticky top-0 z-10">
              <TableRow className="hover:bg-transparent">
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
              {filteredAndSortedData.map((re, idx) => (
                <TableRow 
                  key={`${re.chassisNumber}-${re.entryId || re.submitTime || "row"}`}
                  className={`transition-colors hover:bg-purple-50 ${
                    idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"
                  }`}
                >
                  <TableCell className={`font-semibold text-gray-900 ${CELL}`} title={re.chassisNumber}>
                    {re.chassisNumber}
                  </TableCell>
                  <TableCell className={CELL} title={re.customer || ""}>{re.customer || "-"}</TableCell>
                  <TableCell className={CELL} title={re.model || ""}>{re.model || "-"}</TableCell>
                  <TableCell className={CELL} title={re.originalDealer || ""}>{re.originalDealer || "-"}</TableCell>
                  <TableCell className={CELL} title={re.reallocatedTo || ""}>
                    <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-md text-xs font-semibold">
                      {re.reallocatedTo || "-"}
                    </span>
                  </TableCell>
                  <TableCell className={CELL} title={re.regentProduction || ""}>{re.regentProduction || "-"}</TableCell>
                  <TableCell className={CELL} title={re.issue?.type || ""}>
                    {re.issue?.type ? (
                      <span className="px-2 py-1 bg-red-100 text-red-700 rounded-md text-xs font-semibold">
                        {re.issue.type}
                      </span>
                    ) : "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};
