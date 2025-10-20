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

// ============ 关键：统一吸顶偏移（单位 px）================
// 如果你的页面最顶部还有全局导航栏（例：56px），把它加进来：比如 56 + 48 = 104
const STICKY_TOP_OFFSET = 0;    // 页面最顶部的全局导航高度（没有就 0）
const TITLE_BAR_HEIGHT  = 56;   // 我们自带的工具栏高度
const TABLE_HEADER_TOP  = STICKY_TOP_OFFSET + TITLE_BAR_HEIGHT;

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

/* ====================== 顶部统计卡片（保持不变） ====================== */
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
    { label: "Total", value: total, filter: "all", color: "text-blue-600" },
    { label: "Invalid", value: invalidStock, filter: "invalid", color: "text-red-600" },
    { label: "Snowy Stock", value: snowyStock, filter: "snowy", color: "text-purple-600" },
    { label: "Can Dispatch", value: canBeDispatched, filter: "canBeDispatched", color: "text-emerald-600" },
    ...(onHold !== undefined ? [{ label: "On Hold", value: onHold, filter: "onHold", color: "text-amber-600" } as const] : []),
  ] as const;

  return (
    <div className="space-y-4 w-full max-w-full overflow-x-hidden">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {cards.map((card) => (
          <Card
            key={card.filter}
            className={`cursor-pointer transition-all hover:shadow-md ${activeFilter === card.filter ? "ring-2 ring-blue-500" : ""}`}
            onClick={() => onFilterChange(card.filter as any)}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-[13px] font-medium text-gray-600 truncate">{card.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-semibold ${card.color}`}>{card.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

/* ====================== 主表 ====================== */
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
      const XLSX = await loadXLSX(); // 运行时从 CDN 加载
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
      // 回落 CSV
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
    <TableHead className={`cursor-pointer hover:bg-gray-50 align-top ${align === "center" ? "text-center" : ""} ${className}`} onClick={() => handleSort(sortKey)}>
      <div className={`flex ${align === "center" ? "justify-center" : ""} items-center gap-1`}>
        <span className="truncate">{children}</span>
        <ArrowUpDown className="h-3 w-3 shrink-0" />
      </div>
    </TableHead>
  );

  return (
    <div className="space-y-4 w-full max-w-full">
      {/* ✅ 页面级吸顶工具栏（标题 + 搜索 + 导出） */}
      <div
        className="sticky z-40 border-b bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/70"
        style={{ top: STICKY_TOP_OFFSET, height: TITLE_BAR_HEIGHT }}
      >
        <div className="h-full max-w-full px-4 flex items-center justify-between gap-3">
          <span className="text-base font-semibold tracking-tight">Dispatch Data</span>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Search chassis / dealer / PO / comment ..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-[280px]"
            />
            <Button variant="outline" className="shrink-0" onClick={exportExcel}>
              <Download className="h-4 w-4 mr-1" />
              Export
            </Button>
          </div>
        </div>
      </div>

      {/* 主表（去掉原来的 CardHeader sticky，避免双 sticky 叠加错位） */}
      <Card className="w-full max-w-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-gray-600">Summary</CardTitle>
        </CardHeader>

        <CardContent className="p-0">
          <div className="w-full max-w-full overflow-x-hidden">
            <Table className="w-full table-fixed">
              {/* 定宽列 */}
              <colgroup>
                {COLS.map((c) => (
                  <col key={c.key} style={{ width: c.w === 8 ? "8px" : `${c.w}px` }} />
                ))}
              </colgroup>

              {/* ✅ 吸顶表头：固定在工具栏正下方 */}
              <TableHeader
                className="z-30 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/70 border-b"
                style={{ position: "sticky", top: TABLE_HEADER_TOP }}
              >
                <TableRow>
                  <TableHead className="p-0" />
                  <SortableHeader sortKey="Chassis No">Chassis</SortableHeader>
                  <SortableHeader sortKey="GR to GI Days" align="center">GR Days</SortableHeader>
                  <SortableHeader sortKey="Customer">Customer</SortableHeader>
                  <SortableHeader sortKey="Model">Model</SortableHeader>
                  <SortableHeader sortKey="SAP Data">SAP Data</SortableHeader>
                  <SortableHeader sortKey="Scheduled Dealer">Scheduled Dealer</SortableHeader>
                  <SortableHeader sortKey="Matched PO No">Matched PO No</SortableHeader>
                  <SortableHeader sortKey="Code">Code</SortableHeader>
                  <TableHead className="text-center align-top pt-2">On Hold</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {activeRows.map((entry, idx) => {
                  const id = entry["Chassis No"];
                  const barColor = getGRDaysColor(entry["GR to GI Days"] || 0);
                  const barWidth = getGRDaysWidth(entry["GR to GI Days"] || 0, maxGRDays);
                  const zebra = idx % 2 === 0 ? "bg-white" : "bg-gray-50";
                  const groupShadow = "shadow-[0_0_0_1px_rgba(0,0,0,0.04)]";

                  const commentValue = commentDraft[id] ?? (entry.Comment ?? "");
                  const pickupLocal  = pickupDraft[id]  ?? (entry.EstimatedPickupAt ? isoToLocal(entry.EstimatedPickupAt) : "");

                  return (
                    <React.Fragment key={id}>
                      {/* 第一行：关键信息 */}
                      <TableRow className={`align-top ${zebra} ${groupShadow}`}>
                        {/* 左侧分组色条，rowSpan=2 */}
                        <TableCell rowSpan={2} className="p-0">
                          <div className="h-full w-1 rounded-l-md" style={{ backgroundColor: "rgb(59,130,246)" }} />
                        </TableCell>

                        <TableCell className={`font-medium ${CELL}`} title={id}>{id}</TableCell>

                        <TableCell className={`text-center ${CELL}`} title={String(entry["GR to GI Days"] ?? "-")}>
                          <div className="inline-flex flex-col items-stretch w-full">
                            <div className="flex justify-between text-xs">
                              <span>{entry["GR to GI Days"] ?? "-"}</span><span className="text-gray-500">days</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-1.5">
                              <div className={`h-1.5 rounded-full ${barColor}`} style={{ width: `${barWidth}%` }} />
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
                            className={entry.OnHold ? "bg-red-600 text-white" : "bg-amber-500 text-white"}
                            disabled={saving[id]}
                            onClick={() => handleToggleOnHold(entry, !entry.OnHold)}
                          >
                            {entry.OnHold ? "Cancel" : "On Hold"}
                          </Button>
                        </TableCell>
                      </TableRow>

                      {/* 第二行：编辑 & 扩展（Checks + Reallocation 红、Actions） */}
                      <TableRow className={`${zebra} ${groupShadow}`}>
                        {/* 第二行占据首行剩余 9 列（不含最左边色条列） */}
                        <TableCell colSpan={9}>
                          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 py-3">
                            {/* Comment */}
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[13px] text-gray-500 w-32 shrink-0">Comment</span>
                              <Input
                                className="w-full max-w-[320px]"
                                placeholder="Add a comment"
                                value={commentValue}
                                onChange={(e) => setCommentDraft((m) => ({ ...m, [id]: e.target.value }))}
                                onKeyDown={(e) => { if (e.key === "Enter") handleSaveComment(entry); }}
                              />
                              <Button size="sm" variant="secondary" disabled={saving[id]} onClick={() => handleSaveComment(entry)}>
                                Save
                              </Button>
                            </div>

                            {/* Estimated pickup */}
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[13px] text-gray-500 w-32 shrink-0">Estimated pickup</span>
                              <input
                                type="datetime-local"
                                className="px-2 py-1 border rounded w-full max-w-[260px]"
                                min={minLocalNow}
                                value={pickupLocal}
                                onChange={(e) => setPickupDraft((m) => ({ ...m, [id]: e.target.value }))}
                              />
                              <Button size="sm" variant="secondary" disabled={saving[id]} onClick={() => handleSavePickup(entry)}>
                                Save
                              </Button>
                            </div>

                            {/* Checks */}
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="text-[13px] text-gray-500 w-44 shrink-0">Checks (Status + Dealer)</span>
                              <span
                                className={`px-2 py-1 rounded-full text-xs ${
                                  entry.Statuscheck === 'OK' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                }`}
                                title={`Status: ${entry.Statuscheck || "-"}`}
                              >
                                Status: {entry.Statuscheck || "-"}
                              </span>
                              <span
                                className={`px-2 py-1 rounded-full text-xs ${
                                  entry.DealerCheck === 'OK' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                }`}
                                title={`Dealer: ${entry.DealerCheck || "-"}`}
                              >
                                Dealer: {entry.DealerCheck || "-"}
                              </span>
                            </div>

                            {/* ✅ Reallocation（紧挨 Checks，红色高亮） */}
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[13px] text-gray-500 w-32 shrink-0">Reallocation</span>
                              <span
                                className={`px-2 py-1 rounded text-xs ${entry.reallocatedTo ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-gray-100 text-gray-500'}`}
                                title={entry.reallocatedTo || "-"}
                              >
                                {entry.reallocatedTo || "-"}
                              </span>
                            </div>

                            {/* Actions（Report） */}
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[13px] text-gray-500 w-20 shrink-0">Actions</span>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleReportError(id)}
                                disabled={sendingEmail === id}
                                className="inline-flex items-center gap-1 text-xs"
                              >
                                {sendingEmail === id ? (
                                  <>
                                    <Mail className="h-3 w-3 animate-pulse" />
                                    <span className="hidden sm:inline">Sending...</span>
                                  </>
                                ) : (
                                  <>
                                    <AlertTriangle className="h-3 w-3" />
                                    <span className="hidden sm:inline">Report</span>
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>

                          {error[id] && <div className="text-xs text-red-600 mt-1">{error[id]}</div>}
                        </TableCell>
                      </TableRow>

                      {/* 组间粗分隔空白 */}
                      <TableRow>
                        <TableCell colSpan={10} className="p-0">
                          <div className="h-6" />
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

      {/* On Hold 卡片区（保持） */}
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

/* ====================== On Hold 卡片：等高整齐 ====================== */
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
    <Card className="w-full max-w-full overflow-x-hidden">
      <CardHeader>
        <CardTitle className="text-lg font-semibold tracking-tight">On Hold</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4 items-stretch w-full max-w-full">
          {rows.map((row, idx) => {
            const id = row["Chassis No"];
            const commentValue = commentDraft[id] ?? (row.Comment ?? "");
            const pickupLocal  = pickupDraft[id]  ?? (row.EstimatedPickupAt ? new Date(row.EstimatedPickupAt).toISOString().slice(0,16) : "");
            return (
              <div key={id} className={`h-full min-h-[280px] flex flex-col rounded-xl border p-4 shadow-sm ${idx % 2 ? "bg-gray-50" : "bg-white"}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium text-sm break-words break-all hyphens-auto">{id}</div>
                  <Button
                    size="sm"
                    className="bg-red-600 text-white"
                    disabled={saving[id]}
                    onClick={() => handlers.handleToggleOnHold(row, false)}
                  >
                    Cancel
                  </Button>
                </div>

                <div className="mt-2 text-sm space-y-1 flex-1 min-h-[120px]">
                  <div className={CELL}><span className="text-gray-500">Customer：</span>{row.Customer || "-"}</div>
                  <div className={CELL}><span className="text-gray-500">Model：</span>{row.Model || "-"}</div>
                  <div className={CELL}><span className="text-gray-500">Code：</span>{row.Code || "-"}</div>
                  <div className={CELL}><span className="text-gray-500">Matched PO：</span>{row["Matched PO No"] || "-"}</div>
                </div>

                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Input
                      className="w-full max-w-[320px]"
                      placeholder="Add a comment"
                      value={commentValue}
                      onChange={(e) => setCommentDraft((m) => ({ ...m, [id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") handlers.handleSaveComment(row); }}
                    />
                    <Button size="sm" variant="secondary" disabled={saving[id]} onClick={() => handlers.handleSaveComment(row)}>
                      Save
                    </Button>
                  </div>

                  <div className="flex items-center gap-2 min-w-0">
                    <input
                      type="datetime-local"
                      className="px-2 py-1 border rounded w-full max-w-[260px]"
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

/* ====================== ReallocationTable ====================== */
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
    <TableHead className={`cursor-pointer hover:bg-gray-50 ${className}`} onClick={() => handleSort(sortKey)}>
      <div className="flex items-center gap-1">
        <span className="truncate">{children}</span>
        <ArrowUpDown className="h-3 w-3 shrink-0" />
      </div>
    </TableHead>
  );

  return (
    <Card className="w-full max-w-full overflow-x-hidden">
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
        <div className="w-full max-w-full overflow-x-hidden">
          <Table className="w-full table-fixed">
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
                  <TableCell className={CELL} title={re.chassisNumber}>{re.chassisNumber}</TableCell>
                  <TableCell className={CELL} title={re.customer || ""}>{re.customer || "-"}</TableCell>
                  <TableCell className={CELL} title={re.model || ""}>{re.model || "-"}</TableCell>
                  <TableCell className={CELL} title={re.originalDealer || ""}>{re.originalDealer || "-"}</TableCell>
                  <TableCell className={CELL} title={re.reallocatedTo || ""}>{re.reallocatedTo || "-"}</TableCell>
                  <TableCell className={CELL} title={re.regentProduction || ""}>{re.regentProduction || "-"}</TableCell>
                  <TableCell className={CELL} title={re.issue?.type || ""}>{re.issue?.type || "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};
