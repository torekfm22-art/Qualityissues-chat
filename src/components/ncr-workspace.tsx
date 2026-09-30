"use client";

import { useEffect, useState, useTransition } from "react";
import {
  ClipboardPaste,
  Download,
  Eraser,
  FileSpreadsheet,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { exportNcrToExcel } from "@/lib/export-excel";
import { parseChatToNcr, SAMPLE_CHAT } from "@/lib/parse-ncr";
import { emptyNcr, NCR_COLUMNS, type NcrRecord } from "@/lib/types";

export function NcrWorkspace() {
  const [chat, setChat] = useState("");
  const [records, setRecords] = useState<NcrRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  function runParse(source: string) {
    setError(null);
    startTransition(() => {
      const parsed = parseChatToNcr(source);
      if (parsed.length === 0) {
        setRecords([]);
        setError(
          "인식된 부적합 항목이 없습니다. 품명·불량현상·공정·수량 등이 포함된 톡을 붙여넣어 주세요.",
        );
        return;
      }
      setRecords(parsed);
      setToast(`${parsed.length}건 정리 완료`);
    });
  }

  function handleParse() {
    if (!chat.trim()) {
      setError("채팅 내용을 붙여넣은 뒤 정리하기를 눌러 주세요.");
      return;
    }
    runParse(chat);
  }

  function loadSample() {
    setChat(SAMPLE_CHAT);
    runParse(SAMPLE_CHAT);
  }

  function updateCell(id: string, key: keyof NcrRecord, value: string) {
    setRecords((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [key]: value } : r)),
    );
  }

  function removeRow(id: string) {
    setRecords((prev) => prev.filter((r) => r.id !== id));
  }

  function addRow() {
    setRecords((prev) => [...prev, emptyNcr()]);
  }

  async function handleExport() {
    if (records.length === 0) {
      setError("내보낼 데이터가 없습니다. 먼저 톡을 정리해 주세요.");
      return;
    }
    setExporting(true);
    setError(null);
    try {
      await exportNcrToExcel(records);
      setToast("엑셀 파일이 다운로드되었습니다");
    } catch {
      setError("엑셀 내보내기에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="relative min-h-full">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-[var(--accent-amber)]/15 blur-3xl" />
        <div className="absolute right-0 top-40 h-96 w-96 rounded-full bg-[var(--steel-mid)]/20 blur-3xl" />
        <div className="qc-grid absolute inset-0 opacity-[0.35]" />
      </div>

      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10">
        <header className="animate-fade-up flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--steel-deep)] text-[var(--accent-amber)] shadow-lg shadow-[var(--steel-deep)]/25">
              <FileSpreadsheet className="h-5 w-5" strokeWidth={2.25} />
            </div>
            <div>
              <p className="text-xs font-semibold tracking-[0.18em] text-[var(--steel-mid)] uppercase">
                Quality Field Tool
              </p>
              <h1 className="font-display text-3xl font-bold tracking-tight text-[var(--steel-deep)] sm:text-4xl">
                품질톡 정리기
              </h1>
            </div>
          </div>
          <p className="max-w-2xl text-[15px] leading-relaxed text-[var(--ink-muted)]">
            카카오톡·텔레그램 등 메신저에 올린 품질 부적합 톡을 붙여넣으면
            품명, 불량 현상, 공정번호, 수량 등을 표로 정리하고 엑셀로
            내려받습니다.
          </p>
        </header>

        <section className="animate-fade-up-delay grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)]/90 p-4 shadow-sm backdrop-blur-sm sm:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ClipboardPaste className="h-4 w-4 text-[var(--steel-mid)]" />
                <h2 className="font-display text-lg font-semibold text-[var(--steel-deep)]">
                  채팅 붙여넣기
                </h2>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={loadSample}
                className="text-[var(--steel-mid)]"
              >
                <Sparkles className="h-3.5 w-3.5" />
                샘플 불러오기
              </Button>
            </div>
            <Textarea
              value={chat}
              onChange={(e) => setChat(e.target.value)}
              placeholder={`예시)
품명: O-링 가스켓
불량현상: 찍힘
공정번호: P-201
수량: 15 EA
로트: LOT-0328

또는
김품질 오전 9:14
품명 브라켓 / 스크래치 / P-312 / 8개`}
              className="min-h-[280px] resize-y border-[var(--panel-border)] bg-white/80 font-mono text-[13px] leading-relaxed"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={handleParse}
                disabled={isPending}
                className="bg-[var(--steel-deep)] text-white hover:bg-[var(--steel-mid)]"
              >
                <FileSpreadsheet className="h-4 w-4" />
                {isPending ? "정리 중…" : "표로 정리하기"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setChat("");
                  setError(null);
                }}
              >
                <Eraser className="h-4 w-4" />
                입력 지우기
              </Button>
            </div>
          </div>

          <aside className="flex flex-col gap-3 rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-soft)]/80 p-4 sm:p-5">
            <h2 className="font-display text-lg font-semibold text-[var(--steel-deep)]">
              이렇게 쓰면 좋아요
            </h2>
            <ul className="space-y-2.5 text-sm leading-relaxed text-[var(--ink-muted)]">
              <li className="flex gap-2">
                <Badge
                  variant="secondary"
                  className="mt-0.5 shrink-0 bg-[var(--accent-amber)]/20 text-[var(--steel-deep)]"
                >
                  1
                </Badge>
                <span>
                  메신저에서 부적합 톡을 복사해 왼쪽란에 붙여넣습니다.
                  여러 건을 한 번에 넣어도 됩니다.
                </span>
              </li>
              <li className="flex gap-2">
                <Badge
                  variant="secondary"
                  className="mt-0.5 shrink-0 bg-[var(--accent-amber)]/20 text-[var(--steel-deep)]"
                >
                  2
                </Badge>
                <span>
                  <strong className="font-semibold text-[var(--steel-deep)]">
                    품명 / 불량현상 / 공정 / 수량
                  </strong>
                  처럼 라벨이 있으면 자동 인식합니다.{" "}
                  <code className="rounded bg-white/70 px-1 py-0.5 text-xs">
                    A / B / C
                  </code>{" "}
                  형식도 지원합니다.
                </span>
              </li>
              <li className="flex gap-2">
                <Badge
                  variant="secondary"
                  className="mt-0.5 shrink-0 bg-[var(--accent-amber)]/20 text-[var(--steel-deep)]"
                >
                  3
                </Badge>
                <span>
                  표에서 값을 고친 뒤 <strong className="font-semibold text-[var(--steel-deep)]">엑셀 다운로드</strong>를
                  누르면 .xlsx 파일이 저장됩니다.
                </span>
              </li>
            </ul>
            <div className="mt-auto rounded-xl border border-dashed border-[var(--steel-mid)]/30 bg-white/50 p-3 text-xs text-[var(--ink-muted)]">
              인식 필드: 발생일시, 보고자, 품명, 품번, 불량 현상, 공정번호,
              수량, 로트, 라인/설비, 조치내용, 비고
            </div>
          </aside>
        </section>

        {error && (
          <div
            role="alert"
            className="animate-fade-up rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            {error}
          </div>
        )}

        <section className="animate-fade-up-delay-2 rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)]/95 shadow-sm backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--panel-border)] px-4 py-3 sm:px-5">
            <div className="flex items-center gap-2">
              <Pencil className="h-4 w-4 text-[var(--steel-mid)]" />
              <h2 className="font-display text-lg font-semibold text-[var(--steel-deep)]">
                정리 결과
              </h2>
              <Badge className="bg-[var(--steel-deep)] text-white">
                {records.length}건
              </Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={addRow}>
                <Plus className="h-3.5 w-3.5" />
                행 추가
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleExport}
                disabled={exporting || records.length === 0}
                className="bg-[var(--accent-amber)] text-[var(--steel-deep)] hover:bg-[var(--accent-amber-hot)]"
              >
                <Download className="h-3.5 w-3.5" />
                {exporting ? "내보내는 중…" : "엑셀 다운로드"}
              </Button>
            </div>
          </div>

          {records.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center">
              <FileSpreadsheet className="h-10 w-10 text-[var(--steel-mid)]/40" />
              <p className="font-display text-base font-medium text-[var(--steel-deep)]">
                아직 정리된 데이터가 없습니다
              </p>
              <p className="max-w-sm text-sm text-[var(--ink-muted)]">
                채팅을 붙여넣고 정리하거나, 샘플을 불러와 동작을 확인해 보세요.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[var(--steel-deep)] hover:bg-[var(--steel-deep)]">
                    <TableHead className="w-12 text-center text-white">No</TableHead>
                    {NCR_COLUMNS.map((col) => (
                      <TableHead
                        key={col.key}
                        className="min-w-[110px] whitespace-nowrap text-white"
                      >
                        {col.label}
                      </TableHead>
                    ))}
                    <TableHead className="w-14 text-white">삭제</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((row, idx) => (
                    <TableRow key={row.id} className="align-top">
                      <TableCell className="text-center text-sm text-[var(--ink-muted)]">
                        {idx + 1}
                      </TableCell>
                      {NCR_COLUMNS.map((col) => (
                        <TableCell key={col.key} className="p-1.5">
                          <Input
                            value={row[col.key]}
                            onChange={(e) =>
                              updateCell(row.id, col.key, e.target.value)
                            }
                            className="h-9 min-w-[100px] border-transparent bg-transparent px-2 text-[13px] shadow-none hover:border-[var(--panel-border)] focus-visible:border-[var(--steel-mid)] focus-visible:ring-[var(--steel-mid)]/30"
                            aria-label={`${col.label} ${idx + 1}`}
                          />
                        </TableCell>
                      ))}
                      <TableCell className="p-1.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => removeRow(row.id)}
                          aria-label={`${idx + 1}행 삭제`}
                          className="text-red-600 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>

        <footer className="pb-6 text-center text-xs text-[var(--ink-muted)]">
          현장 메신저 톡 → 표 정리 → 엑셀. 데이터는 브라우저에서만 처리되며
          서버로 전송되지 않습니다.
        </footer>
      </div>

      {toast && (
        <div
          role="status"
          className="animate-toast fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-[var(--steel-deep)] px-4 py-2 text-sm font-medium text-white shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
