export type NcrFieldKey =
  | "occurredAt"
  | "reporter"
  | "vehicleModel"
  | "productName"
  | "partNumber"
  | "defect"
  | "process"
  | "quantity"
  | "lot"
  | "line"
  | "action"
  | "note";

export interface NcrRecord {
  id: string;
  occurredAt: string;
  reporter: string;
  /** 차종 / 모델 코드 (예: JG1, SG2) */
  vehicleModel: string;
  productName: string;
  partNumber: string;
  defect: string;
  process: string;
  quantity: string;
  lot: string;
  line: string;
  action: string;
  note: string;
  raw: string;
}

export const NCR_COLUMNS: {
  key: NcrFieldKey;
  label: string;
  short: string;
}[] = [
  { key: "occurredAt", label: "발생일시", short: "일시" },
  { key: "reporter", label: "보고자", short: "보고자" },
  { key: "vehicleModel", label: "차종", short: "차종" },
  { key: "productName", label: "품명", short: "품명" },
  { key: "partNumber", label: "품번", short: "품번" },
  { key: "defect", label: "불량 현상", short: "현상" },
  { key: "process", label: "공정번호", short: "공정" },
  { key: "quantity", label: "수량", short: "수량" },
  { key: "lot", label: "로트번호", short: "로트" },
  { key: "line", label: "라인/설비", short: "라인" },
  { key: "action", label: "조치내용", short: "조치" },
  { key: "note", label: "비고", short: "비고" },
];

export function emptyNcr(partial?: Partial<NcrRecord>): NcrRecord {
  return {
    id: partial?.id ?? crypto.randomUUID(),
    occurredAt: "",
    reporter: "",
    vehicleModel: "",
    productName: "",
    partNumber: "",
    defect: "",
    process: "",
    quantity: "",
    lot: "",
    line: "",
    action: "",
    note: "",
    raw: "",
    ...partial,
  };
}
