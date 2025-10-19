// src/types/index.ts

/** -------------------- Dispatch（发运）类型 -------------------- */

export interface DispatchEntry {
  /** 主键，与 /Dispatch 下的键一致 */
  "Chassis No": string;

  /** ✅ 新增：显示数据库里的 Matched PO No */
  "Matched PO No"?: string | null;

  /** 你已有的其它字段（按需保留） */
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

  /** ✅ 新增：On Hold 状态 */
  OnHold?: boolean;
  OnHoldAt?: string | null;  // ISO
  OnHoldBy?: string | null;

  /** ✅ 新增：可编辑备注 */
  Comment?: string | null;

  /** ✅ 新增：预计提车时间（ISO） */
  EstimatedPickupAt?: string | null;

  /** ✅ 新增：业务 Code（只读展示即可） */
  Code?: string | null;
}

/** 派生后的 Dispatch 行（可含 reallocatedTo） */
export interface ProcessedDispatchEntry extends DispatchEntry {
  reallocatedTo?: string;
}

/** -------------------- Reallocation（调拨）类型 -------------------- */

export interface ReallocationEntry {
  customer?: string;
  model?: string;
  originalDealer?: string;
  reallocatedTo?: string;
  regentProduction?: string;
  submitTime: string;       // ISO 或 DD/MM/YYYY
  date?: string;            // 可能存在的另一个日期字段（DD/MM/YYYY）
  signedPlansReceived?: string;
  issue?: { type: string };
}

/** /reallocation 节点的原始结构：底盘号 -> 多条记录 */
export type ReallocationData = Record<
  string,                        // chassisNumber
  Record<string, ReallocationEntry> // entryId -> entry
>;

/** /Dispatch 节点的原始结构：底盘号 -> 行 */
export type DispatchData = Record<string, DispatchEntry>;

/** /schedule 节点：只用到 Chassis 与 Regent Production */
export type ScheduleData = Array<{
  Chassis: string;
  "Regent Production": string;
  [key: string]: any;
}>;

/** 处理后的调拨行：带 chassis 与 entryId */
export interface ProcessedReallocationEntry extends ReallocationEntry {
  chassisNumber: string;
  entryId: string;
}
