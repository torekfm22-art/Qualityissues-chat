"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bot,
  CalendarDays,
  Download,
  FileUp,
  Loader2,
  MessageSquare,
  RefreshCw,
  Settings2,
  Sparkles,
  Wifi,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { NcrWorkspace } from "@/components/ncr-workspace";
import { formatKstDisplay } from "@/lib/date-kst";
import type { DiscoveredChat, StoredMessage } from "@/lib/models";
import { NCR_COLUMNS } from "@/lib/types";

type SettingsResponse = {
  settings: {
    telegramBotToken: string;
    telegramChatIds: string[];
    telegramWebhookSecret: string;
    exportHourKst: number;
    autoExportEnabled: boolean;
    replyOnIngest: boolean;
    hasToken: boolean;
    tokenFromEnv: boolean;
    discoveredChats: DiscoveredChat[];
  };
  bot: { id: number; username?: string; first_name: string } | null;
  botError: string | null;
};

type WebhookInfo = {
  url: string;
  pending_update_count: number;
  last_error_message?: string;
};

export function SyncDashboard() {
  const [dayKey, setDayKey] = useState("");
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [stats, setStats] = useState({ messageCount: 0, ncrCount: 0 });
  const [settings, setSettings] = useState<SettingsResponse["settings"] | null>(
    null,
  );
  const [bot, setBot] = useState<SettingsResponse["bot"]>(null);
  const [botError, setBotError] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [chatIdsInput, setChatIdsInput] = useState("");
  const [exportHour, setExportHour] = useState(23);
  const [autoExport, setAutoExport] = useState(true);
  const [replyOnIngest, setReplyOnIngest] = useState(true);
  const [discovered, setDiscovered] = useState<DiscoveredChat[]>([]);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookInfo, setWebhookInfo] = useState<WebhookInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2400);
  };

  const loadMessages = useCallback(async (day?: string) => {
    const q = day ? `?day=${encodeURIComponent(day)}` : "";
    const res = await fetch(`/api/messages${q}`);
    const data = await res.json();
    setDayKey(data.dayKey);
    setMessages(data.messages);
    setStats(data.stats);
  }, []);

  const loadSettings = useCallback(async () => {
    const res = await fetch("/api/settings");
    const data = (await res.json()) as SettingsResponse;
    setSettings(data.settings);
    setBot(data.bot);
    setBotError(data.botError);
    setChatIdsInput(data.settings.telegramChatIds.join(", "));
    setExportHour(data.settings.exportHourKst);
    setAutoExport(data.settings.autoExportEnabled);
    setReplyOnIngest(data.settings.replyOnIngest ?? true);
    setDiscovered(data.settings.discoveredChats || []);
  }, []);

  const loadWebhookInfo = useCallback(async () => {
    const res = await fetch("/api/telegram/webhook/setup");
    const data = await res.json();
    if (res.ok) setWebhookInfo(data.info);
    else setWebhookInfo(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const q = dayKey ? `?day=${encodeURIComponent(dayKey)}` : "";
      const [msgRes, setRes] = await Promise.all([
        fetch(`/api/messages${q}`),
        fetch("/api/settings"),
      ]);
      if (cancelled) return;
      const msgData = await msgRes.json();
      const setData = (await setRes.json()) as SettingsResponse;
      if (cancelled) return;
      setDayKey(msgData.dayKey);
      setMessages(msgData.messages);
      setStats(msgData.stats);
      setSettings(setData.settings);
      setBot(setData.bot);
      setBotError(setData.botError);
      setChatIdsInput(setData.settings.telegramChatIds.join(", "));
      setExportHour(setData.settings.exportHourKst);
      setAutoExport(setData.settings.autoExportEnabled);
      setReplyOnIngest(setData.settings.replyOnIngest ?? true);
      setDiscovered(setData.settings.discoveredChats || []);
      if (typeof window !== "undefined" && !webhookUrl) {
        setWebhookUrl(`${window.location.origin}/api/telegram/webhook`);
      }
    };
    void refresh();
    const id = window.setInterval(() => {
      void loadMessages(dayKey || undefined);
    }, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // Initial hydrate + poll; dayKey changes are handled by the date input.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount hydrate once
  }, [loadMessages]);

  async function saveSettings() {
    setBusy("settings");
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegramBotToken: tokenInput || undefined,
          telegramChatIds: chatIdsInput
            .split(/[,\s]+/)
            .map((s) => s.trim())
            .filter(Boolean),
          exportHourKst: exportHour,
          autoExportEnabled: autoExport,
          replyOnIngest,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "저장 실패");
      setTokenInput("");
      await loadSettings();
      if (data.settings?.hasToken) void loadWebhookInfo();
      showToast("설정이 저장되었습니다");
    } catch (e) {
      setError(e instanceof Error ? e.message : "설정 저장 실패");
    } finally {
      setBusy(null);
    }
  }

  async function discoverChats() {
    setBusy("chats");
    setError(null);
    try {
      const res = await fetch("/api/telegram/chats", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "채팅방 검색 실패");
      setDiscovered(data.chats || []);
      await loadMessages(dayKey);
      showToast(
        data.chats?.length
          ? `채팅방 ${data.chats.length}개 발견 · 신규 수집 ${data.inserted ?? 0}건`
          : "아직 방이 없습니다. 봇이 있는 방에 메시지를 보낸 뒤 다시 검색하세요.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "채팅방 검색 실패");
    } finally {
      setBusy(null);
    }
  }

  function addChatId(chatId: string) {
    const ids = new Set(
      chatIdsInput
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    );
    ids.add(chatId);
    setChatIdsInput([...ids].join(", "));
    showToast(`허용 목록에 ${chatId} 추가됨 — 설정 저장을 눌러 주세요`);
  }

  async function setupWebhook(action: "set" | "delete") {
    setBusy("webhook");
    setError(null);
    try {
      const res = await fetch("/api/telegram/webhook/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          url: action === "set" ? webhookUrl : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "웹훅 설정 실패");
      setWebhookInfo(data.info);
      showToast(
        action === "set"
          ? "웹훅이 등록되었습니다"
          : "웹훅이 해제되었습니다 (폴링 사용 가능)",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "웹훅 설정 실패");
    } finally {
      setBusy(null);
    }
  }

  async function pollTelegram() {
    setBusy("poll");
    setError(null);
    try {
      const res = await fetch("/api/telegram/poll", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "수집 실패");
      await loadMessages(dayKey);
      if (Array.isArray(data.discovered)) setDiscovered(data.discovered);
      showToast(
        `텔레그램 수집: 신규 ${data.inserted}건 / 처리 ${data.processed}건`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "텔레그램 수집 실패");
    } finally {
      setBusy(null);
    }
  }

  async function runDemo() {
    setBusy("demo");
    setError(null);
    try {
      const res = await fetch("/api/demo/ingest", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "데모 실패");
      await loadMessages(dayKey);
      showToast(`데모 메시지 ${data.inserted}건 수집`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "데모 실패");
    } finally {
      setBusy(null);
    }
  }

  async function downloadDaily(regenerate = true) {
    setBusy("export");
    setError(null);
    try {
      const res = await fetch(
        `/api/export/daily?day=${encodeURIComponent(dayKey)}&regenerate=${regenerate ? "1" : "0"}`,
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "엑셀 생성 실패");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `품질부적합_${dayKey}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("일일 엑셀을 다운로드했습니다");
    } catch (e) {
      setError(e instanceof Error ? e.message : "엑셀 다운로드 실패");
    } finally {
      setBusy(null);
    }
  }

  async function uploadKakao(file: File) {
    setBusy("kakao");
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/import/kakao", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "가져오기 실패");
      await loadMessages(dayKey);
      showToast(
        `카톡 내보내기 반영: ${data.roomTitle} · 신규 ${data.inserted}건`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "카톡 가져오기 실패");
    } finally {
      setBusy(null);
    }
  }

  const flatRows = messages.flatMap((m) =>
    (m.parsed.length ? m.parsed : [{ ...emptyShell(m) }]).map((r) => ({
      message: m,
      record: r,
    })),
  );

  return (
    <div className="relative min-h-full">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-[var(--accent-amber)]/15 blur-3xl" />
        <div className="absolute right-0 top-40 h-96 w-96 rounded-full bg-[var(--steel-mid)]/20 blur-3xl" />
        <div className="qc-grid absolute inset-0 opacity-[0.35]" />
      </div>

      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
        <header className="animate-fade-up flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--steel-deep)] text-[var(--accent-amber)] shadow-lg shadow-[var(--steel-deep)]/25">
                <Wifi className="h-5 w-5" strokeWidth={2.25} />
              </div>
              <div>
                <p className="text-xs font-semibold tracking-[0.18em] text-[var(--steel-mid)] uppercase">
                  Daily Chat Sync
                </p>
                <h1 className="font-display text-3xl font-bold tracking-tight text-[var(--steel-deep)] sm:text-4xl">
                  품질톡 정리기
                </h1>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-[var(--steel-deep)] text-white">
                <CalendarDays className="h-3 w-3" />
                {dayKey || "—"}
              </Badge>
              <Badge variant="secondary">{stats.ncrCount}건 수집</Badge>
            </div>
          </div>
          <p className="max-w-3xl text-[15px] leading-relaxed text-[var(--ink-muted)]">
            텔레그램 품질 채팅방에 봇을 연결하면 부적합 톡을 자동 수집하고,
            매일 KST 기준으로 엑셀로 정리합니다. 카카오톡은 공식 그룹 읽기 API가
            없어 <strong className="text-[var(--steel-deep)]">대화 내보내기 파일</strong>로
            연동합니다.
          </p>
        </header>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            {error}
          </div>
        )}

        <Tabs defaultValue="telegram" className="animate-fade-up-delay gap-4">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-[var(--panel-soft)] p-1">
            <TabsTrigger value="telegram">텔레그램 연동</TabsTrigger>
            <TabsTrigger value="today">오늘 수집</TabsTrigger>
            <TabsTrigger value="kakao">카카오톡</TabsTrigger>
            <TabsTrigger value="manual">수동 붙여넣기</TabsTrigger>
          </TabsList>

          <TabsContent value="today" className="space-y-4">
            <section className="grid gap-3 sm:grid-cols-3">
              <StatCard label="오늘 메시지" value={`${stats.messageCount}`} hint="수집된 톡" />
              <StatCard label="부적합 건수" value={`${stats.ncrCount}`} hint="엑셀 행 기준" />
              <StatCard
                label="연동 상태"
                value={settings?.hasToken ? "텔레그램 준비됨" : "토큰 없음"}
                hint={bot?.username ? `@${bot.username}` : "데모/카톡 사용 가능"}
              />
            </section>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => void downloadDaily(true)}
                disabled={busy === "export"}
                className="bg-[var(--accent-amber)] text-[var(--steel-deep)] hover:bg-[var(--accent-amber-hot)]"
              >
                {busy === "export" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                오늘 엑셀 다운로드
              </Button>
              <Button
                variant="outline"
                onClick={() => void loadMessages(dayKey)}
                disabled={!!busy}
              >
                <RefreshCw className="h-4 w-4" />
                새로고침
              </Button>
              <Button variant="outline" onClick={() => void runDemo()} disabled={!!busy}>
                <Sparkles className="h-4 w-4" />
                데모 데이터 넣기
              </Button>
              <label className="inline-flex items-center gap-2 text-sm text-[var(--ink-muted)]">
                <span>날짜</span>
                <Input
                  type="date"
                  value={dayKey}
                  onChange={(e) => {
                    setDayKey(e.target.value);
                    void loadMessages(e.target.value);
                  }}
                  className="h-8 w-auto bg-white"
                />
              </label>
            </div>

            <div className="overflow-hidden rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)]/95">
              {flatRows.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
                  <MessageSquare className="h-10 w-10 text-[var(--steel-mid)]/40" />
                  <p className="font-display font-medium text-[var(--steel-deep)]">
                    아직 오늘 수집된 부적합이 없습니다
                  </p>
                  <p className="max-w-md text-sm text-[var(--ink-muted)]">
                    텔레그램 봇을 연결하거나, 카톡 내보내기 파일을 올리거나,
                    데모 데이터로 흐름을 확인해 보세요.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-[var(--steel-deep)] hover:bg-[var(--steel-deep)]">
                        <TableHead className="text-white">출처</TableHead>
                        <TableHead className="text-white">채팅방</TableHead>
                        {NCR_COLUMNS.slice(0, 7).map((c) => (
                          <TableHead key={c.key} className="whitespace-nowrap text-white">
                            {c.short}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {flatRows.map(({ message, record }, idx) => (
                        <TableRow key={`${message.id}-${record.id}-${idx}`}>
                          <TableCell>
                            <Badge variant="secondary">{message.source}</Badge>
                          </TableCell>
                          <TableCell className="max-w-[140px] truncate text-sm">
                            {message.chatTitle}
                          </TableCell>
                          {NCR_COLUMNS.slice(0, 7).map((c) => (
                            <TableCell
                              key={c.key}
                              className="max-w-[160px] truncate text-[13px]"
                              title={record[c.key]}
                            >
                              {c.key === "occurredAt"
                                ? record.occurredAt ||
                                  formatKstDisplay(message.receivedAt)
                                : record[c.key] || "—"}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="telegram" className="space-y-4">
            <section className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)]/95 p-4 sm:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-[var(--steel-mid)]" />
                  <h2 className="font-display text-lg font-semibold text-[var(--steel-deep)]">
                    텔레그램으로 시작하기
                  </h2>
                </div>
                <Badge
                  className={
                    settings?.hasToken
                      ? "bg-emerald-700 text-white"
                      : "bg-[var(--steel-mid)] text-white"
                  }
                >
                  {settings?.hasToken
                    ? bot?.username
                      ? `@${bot.username} 연결됨`
                      : "토큰 저장됨"
                    : "토큰 필요"}
                </Badge>
              </div>

              <ol className="mb-5 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-[var(--ink-muted)]">
                <li>
                  Telegram에서{" "}
                  <code className="rounded bg-[var(--panel-soft)] px-1">@BotFather</code>
                  → <code className="rounded bg-[var(--panel-soft)] px-1">/newbot</code>으로
                  봇을 만들고 토큰을 복사합니다.
                </li>
                <li>
                  BotFather에서{" "}
                  <code className="rounded bg-[var(--panel-soft)] px-1">/setprivacy</code> →
                  Disable (그룹 일반 메시지를 읽으려면 필수).
                </li>
                <li>품질 부적합 그룹에 봇을 초대합니다.</li>
                <li>토큰을 저장한 뒤, 방에 테스트 메시지를 보내고 채팅방 ID를 검색합니다.</li>
                <li>
                  로컬/사내는{" "}
                  <code className="rounded bg-[var(--panel-soft)] px-1">
                    npm run collector
                  </code>
                  를 상시 실행하거나, 공개 HTTPS가 있으면 웹훅을 등록합니다.
                </li>
              </ol>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="token">봇 토큰</Label>
                  <Input
                    id="token"
                    type="password"
                    placeholder={
                      settings?.hasToken
                        ? "저장됨 — 변경 시에만 입력"
                        : "123456:AA..."
                    }
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                  />
                  {settings?.tokenFromEnv && (
                    <p className="text-xs text-[var(--ink-muted)]">
                      환경변수 TELEGRAM_BOT_TOKEN이 우선 적용됩니다.
                    </p>
                  )}
                  {botError && (
                    <p className="text-xs text-red-600">{botError}</p>
                  )}
                  {bot && (
                    <p className="text-xs text-emerald-700">
                      연결됨: {bot.first_name}
                      {bot.username ? ` (@${bot.username})` : ""}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="chats">허용 채팅방 ID (비우면 모든 방)</Label>
                  <Input
                    id="chats"
                    placeholder="-1001234567890"
                    value={chatIdsInput}
                    onChange={(e) => setChatIdsInput(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void discoverChats()}
                    disabled={!!busy || !settings?.hasToken}
                  >
                    {busy === "chats" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    채팅방 ID 검색
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hour">일일 엑셀 마감 시각 (KST)</Label>
                  <Input
                    id="hour"
                    type="number"
                    min={0}
                    max={23}
                    value={exportHour}
                    onChange={(e) => setExportHour(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-xl border border-[var(--panel-border)] bg-[var(--panel-soft)]/60 px-3 py-3">
                    <div>
                      <p className="text-sm font-medium text-[var(--steel-deep)]">
                        자동 일일 엑셀
                      </p>
                      <p className="text-xs text-[var(--ink-muted)]">
                        마감 시각 이후 data/exports 저장
                      </p>
                    </div>
                    <Switch checked={autoExport} onCheckedChange={setAutoExport} />
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-[var(--panel-border)] bg-[var(--panel-soft)]/60 px-3 py-3">
                    <div>
                      <p className="text-sm font-medium text-[var(--steel-deep)]">
                        수집 확인 답장
                      </p>
                      <p className="text-xs text-[var(--ink-muted)]">
                        부적합 인식 시 방에 ✅ 회신
                      </p>
                    </div>
                    <Switch
                      checked={replyOnIngest}
                      onCheckedChange={setReplyOnIngest}
                    />
                  </div>
                </div>
              </div>

              {discovered.length > 0 && (
                <div className="mt-4 rounded-xl border border-[var(--panel-border)] bg-[var(--panel-soft)]/40 p-3">
                  <p className="mb-2 text-sm font-medium text-[var(--steel-deep)]">
                    발견된 채팅방
                  </p>
                  <ul className="space-y-2">
                    {discovered.map((c) => (
                      <li
                        key={c.chatId}
                        className="flex flex-wrap items-center justify-between gap-2 text-sm"
                      >
                        <span>
                          <span className="font-medium text-[var(--steel-deep)]">
                            {c.title}
                          </span>{" "}
                          <code className="text-xs text-[var(--ink-muted)]">
                            {c.chatId}
                          </code>{" "}
                          <Badge variant="secondary">{c.type}</Badge>
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => addChatId(c.chatId)}
                        >
                          허용에 추가
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  onClick={() => void saveSettings()}
                  disabled={busy === "settings"}
                  className="bg-[var(--steel-deep)] text-white hover:bg-[var(--steel-mid)]"
                >
                  <Settings2 className="h-4 w-4" />
                  설정 저장
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void pollTelegram()}
                  disabled={!!busy || !settings?.hasToken}
                >
                  {busy === "poll" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  지금 수집
                </Button>
              </div>

              <div className="mt-5 space-y-3 rounded-xl border border-dashed border-[var(--steel-mid)]/30 bg-[var(--panel-soft)]/50 p-3">
                <p className="text-sm font-medium text-[var(--steel-deep)]">
                  수집 방식
                </p>
                <p className="text-xs leading-relaxed text-[var(--ink-muted)]">
                  <strong className="text-[var(--steel-deep)]">추천 (로컬/사내):</strong>{" "}
                  <code>TELEGRAM_BOT_TOKEN=... npm run collector</code> — 웹훅 없이
                  폴링합니다. 웹훅이 등록되어 있으면 폴링이 막히므로 아래에서 해제하세요.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="webhook">웹훅 URL (공개 HTTPS만)</Label>
                  <Input
                    id="webhook"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    placeholder="https://your-host/api/telegram/webhook"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!!busy || !settings?.hasToken}
                      onClick={() => void setupWebhook("set")}
                    >
                      웹훅 등록
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!!busy || !settings?.hasToken}
                      onClick={() => void setupWebhook("delete")}
                    >
                      웹훅 해제 (폴링용)
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={!!busy || !settings?.hasToken}
                      onClick={() => void loadWebhookInfo()}
                    >
                      상태 새로고침
                    </Button>
                  </div>
                  {webhookInfo && (
                    <p className="text-xs text-[var(--ink-muted)]">
                      현재 웹훅:{" "}
                      {webhookInfo.url ? (
                        <code>{webhookInfo.url}</code>
                      ) : (
                        "없음 (폴링 가능)"
                      )}
                      {webhookInfo.last_error_message
                        ? ` · 오류: ${webhookInfo.last_error_message}`
                        : ""}
                    </p>
                  )}
                </div>
              </div>
            </section>
          </TabsContent>

          <TabsContent value="kakao" className="space-y-4">
            <section className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)]/95 p-4 sm:p-5">
              <div className="mb-3 flex items-center gap-2">
                <FileUp className="h-4 w-4 text-[var(--steel-mid)]" />
                <h2 className="font-display text-lg font-semibold text-[var(--steel-deep)]">
                  카카오톡 대화 내보내기 연동
                </h2>
              </div>
              <p className="mb-4 text-sm leading-relaxed text-[var(--ink-muted)]">
                카카오톡은 일반 채팅방 메시지를 외부 앱이 실시간으로 읽을 수 있는
                공개 API를 제공하지 않습니다. 채팅방 메뉴의{" "}
                <strong className="text-[var(--steel-deep)]">대화 내용 내보내기</strong>로
                받은 .txt 파일을 올리면, 같은 파서로 일일 엑셀에 합쳐집니다.
                매일 내보내기 파일을 올리는 방식으로 운영하거나, 가능하면
                품질 알림 방을 텔레그램으로 병행하는 것을 권장합니다.
              </p>
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--steel-mid)]/40 bg-[var(--panel-soft)]/70 px-4 py-10 text-center hover:bg-[var(--panel-soft)]">
                <FileUp className="h-8 w-8 text-[var(--steel-mid)]" />
                <span className="font-medium text-[var(--steel-deep)]">
                  카톡 내보내기 .txt 선택
                </span>
                <span className="text-xs text-[var(--ink-muted)]">
                  {busy === "kakao" ? "가져오는 중…" : "클릭하여 업로드"}
                </span>
                <input
                  type="file"
                  accept=".txt,text/plain"
                  className="hidden"
                  disabled={!!busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadKakao(file);
                    e.target.value = "";
                  }}
                />
              </label>
            </section>
          </TabsContent>

          <TabsContent value="manual">
            <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)]/60 p-2 sm:p-3">
              <NcrWorkspace embedded />
            </div>
          </TabsContent>
        </Tabs>

        <footer className="pb-6 text-center text-xs text-[var(--ink-muted)]">
          수집 데이터는 이 서버의 <code>data/</code> 폴더에만 저장됩니다. 토큰은
          환경변수 사용을 권장합니다.
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

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)]/95 p-4">
      <p className="text-xs font-medium tracking-wide text-[var(--ink-muted)] uppercase">
        {label}
      </p>
      <p className="font-display mt-1 text-2xl font-semibold text-[var(--steel-deep)]">
        {value}
      </p>
      <p className="mt-1 text-xs text-[var(--ink-muted)]">{hint}</p>
    </div>
  );
}

function emptyShell(m: StoredMessage) {
  return {
    id: m.id,
    occurredAt: formatKstDisplay(m.receivedAt),
    reporter: m.sender,
    productName: "",
    partNumber: "",
    defect: "",
    process: "",
    quantity: "",
    lot: "",
    line: "",
    action: "",
    note: "(원문만 보관)",
    raw: m.text,
  };
}
