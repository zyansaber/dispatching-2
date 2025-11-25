// src/types/index.ts

/** ----------------------------
 *  Dispatch（/Dispatch）原始项
 *  说明：
 *  - "Chassis No" 为主键（必须）
 *  - 其它字段全部可选：没有不会报错
 * ----------------------------- */
export interface DispatchEntry {
  /** 主键，与 /Dispatch 下的键一致 */
  "Chassis No": string;

  /** ✅ 新增：显示数据库里的 Matched PO No（只读展示） */
  "Matched PO No"?: string | null;

  /** ✅ 新增：Code（只读展示，可选） */
  Code?: string | null;

  /** 你已有的其它字段（按需保留） */
  "GR to GI Days"?: number | null;
  "Days From GR"?: number | null;
  "GR Date (Perth)"?: string | null;
  "PGI Date (3120)"?: string | null;

  Customer?: string | null;
  Model?: string | null;

  "SAP Data"?: string | null;
  "Scheduled Dealer"?: string | null;

  Statuscheck?: "OK" | "Mismatch" | string | null;
  DealerCheck?: "OK" | "Mismatch" | string | null;

  /** ✅ 新增：On Hold 状态（后加字段：没有时按未 on hold 处理） */
  OnHold?: boolean;
  OnHoldAt?: string | null;   // ISO 字符串
  OnHoldBy?: string | null;

  /** ✅ 新增：可编辑备注（后加字段：可缺省） */
  Comment?: string | null;

  /** ✅ 新增：预计提车时间（ISO），今天以后 */
  EstimatedPickupAt?: string | null;
}

/** 处理后的 Dispatch 项（在前端注入 reallocatedTo 等） */
export interface ProcessedDispatchEntry extends DispatchEntry {
  reallocatedTo?: string;
}

/** ----------------------------
 *  Reallocation（/reallocation）类型
 * ----------------------------- */

/** 单条调拨记录（不同项目可能字段命名略有差异，全部可选） */
export interface ReallocationEntry {
  submitTime?: string;              // "DD/MM/YYYY" 或 ISO
  date?: string;                    // "DD/MM/YYYY"
  customer?: string;
  model?: string;
  originalDealer?: string;
  reallocatedTo?: string;
  signedPlansReceived?: string;
  issue?: { type?: string };
  // 允许透传数据库里的其它键
  [k: string]: any;
}

/** 处理后的 Reallocation 项（带 chassisNumber / entryId 等） */
export interface ProcessedReallocationEntry extends ReallocationEntry {
  chassisNumber: string;
  entryId?: string;
  regentProduction?: string;
}

/** /reallocation 的数据结构：按 Chassis → EntryId 映射 */
export type ReallocationData = Record<string, Record<string, ReallocationEntry>>;

/** ----------------------------
 *  Schedule（/schedule）类型
 * ----------------------------- */

export interface ScheduleEntry {
  Chassis: string;
  "Regent Production"?: string;
  // 允许透传其它字段
  [k: string]: any;
}

export type ScheduleData = ScheduleEntry[];

/** ----------------------------
 *  Dispatch（/Dispatch）集合类型
 * ----------------------------- */

export type DispatchData = Record<string, DispatchEntry>;

/** ----------------------------
 *  Dispatching Note（/dispatchingnote）类型
 * ----------------------------- */

export interface DispatchingNoteEntry {
  chassisNo?: string;
  update?: string;
  yearNotes?: string;
  dispatched?: boolean;
  model?: string;
  scheduledDealer?: string;
  reallocatedDealer?: string;
  customerName?: string;
  backgroundColor?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export type DispatchingNoteData = Record<string, DispatchingNoteEntry>;
