// src/types/index.ts

/** ===== 基础：Dispatch（/Dispatch/<Chassis No>） ===== */
export interface DispatchEntry {
  /** 主键，与 /Dispatch 下的键一致 */
  "Chassis No": string;

  /** 显示数据库里的 Matched PO No（新增） */
  "Matched PO No"?: string | null;

  /** 你已有/使用中的其它字段 */
  "GR to GI Days"?: number;
  "Days From GR"?: number;
  "GR Date (Perth)"?: string | null;
  "PGI Date (3120)"?: string | null;
  Customer?: string;
  Model?: string;
  "SAP Data"?: string;
  "Scheduled Dealer"?: string;
  Statuscheck?: "OK" | "Mismatch" | string;
  DealerCheck?: "OK" | "Mismatch" | string;

  /** On Hold（新增） */
  OnHold?: boolean;
  OnHoldAt?: string | null;  // ISO
  OnHoldBy?: string | null;

  /** 备注（新增） */
  Comment?: string | null;

  /** 预计提车时间（ISO，新增） */
  EstimatedPickupAt?: string | null;
}

/** 处理过的 Dispatch（增加 reallocatedTo 等） */
export interface ProcessedDispatchEntry extends DispatchEntry {
  reallocatedTo?: string;
}

/** Map 形式的 Dispatch 整表 */
export type DispatchData = Record<string, DispatchEntry>;


/** ===== Reallocation（/reallocation/<Chassis>/<entryId>） ===== */
export interface ReallocationEntry {
  customer: string;
  model: string;
  originalDealer: string;
  reallocatedTo: string;
  status?: string;
  submitTime?: string;          // 可能存在 submitTime 或 date
  date?: string;                // DD/MM/YYYY
  signedPlansReceived?: string;
  issue?: { type: string };
}

/** Map 形式：底盘号 → 多条记录（entryId → ReallocationEntry） */
export type ReallocationData = Record<string, Record<string, ReallocationEntry>>;

/** 处理过的 Reallocation（挑选最新一条） */
export interface ProcessedReallocationEntry extends ReallocationEntry {
  chassisNumber: string;
  entryId: string;              // ✅ 补上：firebase.ts 会写入 entryId
  regentProduction?: string;
}


/** ===== schedule（/schedule） ===== */
export interface ScheduleEntry {
  Chassis: string;
  "Regent Production": string;
}

/** 数组形式的 schedule */
export type ScheduleData = ScheduleEntry[];
