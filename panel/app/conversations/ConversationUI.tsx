"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import styles from "./conversations.module.css";

const POLL_INTERVAL_MS = 1000;
const THREAD_BOTTOM_THRESHOLD_PX = 32;
const MAX_THREAD_SCROLL_RETRIES = 24;
const THREAD_SCROLL_STABLE_FRAMES = 3;
const INLINE_DEBUG_WA_ID = "554185260518";

type Conversation = {
  id: string;
  wa_id: string;
  nome: string | null;
  last_message_text: string | null;
  last_message_at: string | null;
  updated_at: string | null;
  fase_conversa: string | null;
  funil_status: string | null;
  atendimento_manual: boolean;
};

type ConversationsPayload = {
  ok: boolean;
  conversations: Conversation[];
  error?: string;
};

type Message = {
  id: string | null;
  wa_id: string;
  direction: "in" | "out";
  text: string | null;
  source: string | null;
  created_at: string | null;
};

type MessagesPayload = {
  ok: boolean;
  wa_id: string;
  messages: Message[];
  error: string | null;
};

type CaseFile = {
  file_id: string;
  wa_id: string;
  tipo: string;
  participante: string | null;
  created_at: string | null;
  mime_type: string | null;
  file_name: string | null;
  size_bytes: number | null;
  previewable: boolean;
};

type CaseFilesPayload = {
  ok: boolean;
  wa_id: string | null;
  files: CaseFile[];
  error: string | null;
};

type TimelineEntry =
  | {
      kind: "message";
      key: string;
      created_at: string | null;
      message: Message;
    }
  | {
      kind: "file";
      key: string;
      created_at: string | null;
      file: CaseFile;
    };

function formatTime(input: string | null): string {
  if (!input) {
    return "--:--";
  }

  const date = new Date(input);

  if (Number.isNaN(date.getTime())) {
    return "--:--";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDateTime(input: string | null): string {
  if (!input) {
    return "Sem horário";
  }

  const date = new Date(input);

  if (Number.isNaN(date.getTime())) {
    return "Sem horário";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function getInitial(name: string | null, waId: string): string {
  const label = (name ?? "").trim();

  if (label) {
    return label.charAt(0).toUpperCase();
  }

  const normalizedWaId = waId.replace(/\D/g, "");
  return (normalizedWaId.charAt(0) || "?").toUpperCase();
}

function sanitizePreview(text: string | null): string {
  if (!text) {
    return "Sem mensagens";
  }

  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function formatFileSize(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value < 0) {
    return "--";
  }
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatFileDisplayName(file: Pick<CaseFile, "file_name" | "tipo" | "file_id">): string {
  const shortId = (file.file_id || "").trim().slice(0, 8);
  return file.file_name || file.tipo || (shortId ? `arquivo-${shortId}` : "arquivo");
}

function buildMessageRenderKey(message: Message): string {
  return [
    message.direction,
    message.wa_id,
    message.created_at ?? "",
    (message.text ?? "").trim(),
  ].join("|");
}

function getConversationActivityKey(conversation: Pick<Conversation, "last_message_at" | "updated_at">) {
  return conversation.last_message_at ?? conversation.updated_at ?? "";
}

function isNearBottom(element: HTMLDivElement | null, threshold = THREAD_BOTTOM_THRESHOLD_PX) {
  if (!element) {
    return true;
  }

  const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
  return distanceToBottom <= threshold;
}

function getThreadLayoutKey(element: HTMLDivElement) {
  return `${element.scrollHeight}:${element.clientHeight}`;
}

function sameOriginApiUrl(path: string) {
  if (typeof window === "undefined") {
    return path;
  }

  return new URL(path, window.location.origin).toString();
}

export function ConversationUI() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const [messages, setMessages] = useState<Message[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [manualToggleLoading, setManualToggleLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  const [composerText, setComposerText] = useState("");
  const [selectedConversationSnapshot, setSelectedConversationSnapshot] =
    useState<Conversation | null>(null);
  const [threadUnreadCount, setThreadUnreadCount] = useState(0);
  const [isThreadNearBottom, setIsThreadNearBottom] = useState(true);
  const [seenConversationActivity, setSeenConversationActivity] = useState<Record<string, string>>(
    {}
  );
  const [threadFiles, setThreadFiles] = useState<CaseFile[]>([]);
  const [caseFilesLoading, setCaseFilesLoading] = useState(false);
  const [caseFilesError, setCaseFilesError] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<CaseFile | null>(null);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedWaId = (searchParams.get("wa_id") ?? "").trim();
  const inlineDebugEnabled = selectedWaId === INLINE_DEBUG_WA_ID;
  const selectedConversationWaId = useMemo(
    () => conversations.find((conversation) => conversation.wa_id === selectedWaId)?.wa_id ?? "",
    [conversations, selectedWaId]
  );
  const selectedWaIdRef = useRef(selectedWaId);
  const latestMessagesRequestRef = useRef(0);
  const refreshStateRef = useRef({ inFlight: false, queued: false, queuedSilent: true });
  const messagesAreaRef = useRef<HTMLDivElement | null>(null);
  const pendingScrollFrameRef = useRef<number | null>(null);
  const loadedThreadWaIdRef = useRef("");
  const previousVisibleStateRef = useRef({ waId: selectedWaId, count: 0, lastKey: "" });
  const pendingScrollToBottomRef = useRef(Boolean(selectedWaId));
  const isThreadNearBottomRef = useRef(true);
  const initializedSeenConversationRef = useRef(false);
  const initialConversationActivityRef = useRef<Record<string, string>>({});

  const loadConversations = useCallback(async (silent = false) => {
    if (!silent) {
      setListLoading(true);
    }

    try {
      const conversationsUrl = sameOriginApiUrl("/api/conversations?ts=1");
      const response = await fetch(conversationsUrl, { cache: "no-store" });
      const data = (await response.json()) as ConversationsPayload;

      if (!response.ok || !data.ok) {
        throw new Error(
          data.error || `Falha ao carregar conversas (${response.status})`
        );
      }

      const nextConversations = Array.isArray(data.conversations) ? data.conversations : [];

      setConversations(nextConversations);
      setSeenConversationActivity((current) => {
        if (initializedSeenConversationRef.current) {
          return current;
        }

        initializedSeenConversationRef.current = true;
        const initialActivity = Object.fromEntries(
          nextConversations.map((conversation) => [
            conversation.wa_id,
            getConversationActivityKey(conversation),
          ])
        );
        initialConversationActivityRef.current = initialActivity;
        return initialActivity;
      });
      setListError(null);
    } catch (error) {
      if (!silent) {
        setConversations([]);
      }
      setListError(error instanceof Error ? error.message : "Falha ao carregar lista");
    } finally {
      if (!silent) {
        setListLoading(false);
      }
    }
  }, []);

  const loadMessages = useCallback(async (waId: string, silent = false) => {
    const requestId = ++latestMessagesRequestRef.current;

    if (!waId) {
      loadedThreadWaIdRef.current = "";
      setMessages([]);
      setThreadError(null);
      setThreadLoading(false);
      return;
    }

    if (!silent) {
      setThreadLoading(true);
    }

    try {
      const messagesUrl = sameOriginApiUrl(
        `/api/messages?wa_id=${encodeURIComponent(waId)}&limit=200`
      );
      const response = await fetch(messagesUrl, { cache: "no-store" });
      const data = (await response.json()) as MessagesPayload;

      if (!response.ok || !data.ok) {
        throw new Error(
          data.error || `Falha ao carregar mensagens (${response.status})`
        );
      }

      if (selectedWaIdRef.current !== waId || latestMessagesRequestRef.current !== requestId) {
        return;
      }

      loadedThreadWaIdRef.current = waId;
      setMessages(Array.isArray(data.messages) ? data.messages : []);
      setThreadError(null);
    } catch (error) {
      if (selectedWaIdRef.current !== waId || latestMessagesRequestRef.current !== requestId) {
        return;
      }

      if (!silent) {
        setMessages([]);
      }
      setThreadError(
        error instanceof Error ? error.message : "Falha ao carregar mensagens"
      );
    } finally {
      if (
        !silent &&
        selectedWaIdRef.current === waId &&
        latestMessagesRequestRef.current === requestId
      ) {
        setThreadLoading(false);
      }
    }
  }, []);

  const loadCaseFiles = useCallback(async (waId: string, silent = false) => {
    if (!waId) {
      setThreadFiles([]);
      setCaseFilesError(null);
      setCaseFilesLoading(false);
      return;
    }

    if (!silent) {
      setCaseFilesLoading(true);
    }

    try {
      const filesUrl = sameOriginApiUrl(`/api/case-files?wa_id=${encodeURIComponent(waId)}`);
      const response = await fetch(filesUrl, { cache: "no-store" });
      const data = (await response.json()) as CaseFilesPayload;
      if (waId === INLINE_DEBUG_WA_ID) {
        console.log("[INLINE_DEBUG][case-files-response]", {
          waId,
          status: response.status,
          ok: response.ok,
          payloadOk: data?.ok,
          filesCount: Array.isArray(data?.files) ? data.files.length : 0,
          files: Array.isArray(data?.files)
            ? data.files.map((file) => ({
                file_id: file.file_id,
                tipo: file.tipo,
                created_at: file.created_at,
              }))
            : [],
          error: data?.error ?? null,
        });
      }
      if (!response.ok || !data.ok) {
        throw new Error(data.error || `Falha ao carregar arquivos (${response.status})`);
      }

      if (selectedWaIdRef.current !== waId) {
        return;
      }

      setThreadFiles(Array.isArray(data.files) ? data.files : []);
      setCaseFilesError(null);
    } catch (error) {
      if (selectedWaIdRef.current !== waId) {
        return;
      }
      if (!silent) {
        setThreadFiles([]);
      }
      setCaseFilesError(error instanceof Error ? error.message : "Falha ao carregar arquivos");
    } finally {
      if (!silent && selectedWaIdRef.current === waId) {
        setCaseFilesLoading(false);
      }
    }
  }, []);

  const refreshPanelData = useCallback(
    async (silent = false) => {
      if (refreshStateRef.current.inFlight) {
        refreshStateRef.current.queued = true;
        refreshStateRef.current.queuedSilent = refreshStateRef.current.queuedSilent && silent;
        return;
      }

      refreshStateRef.current.inFlight = true;

      try {
        const activeWaId = selectedWaIdRef.current;

        await Promise.all([
          loadConversations(silent),
          activeWaId ? loadMessages(activeWaId, silent) : loadMessages("", silent),
          selectedWaId
            ? loadCaseFiles(selectedWaId, silent)
            : loadCaseFiles("", silent),
        ]);
      } finally {
        refreshStateRef.current.inFlight = false;

        if (refreshStateRef.current.queued) {
          const queuedSilent = refreshStateRef.current.queuedSilent;
          refreshStateRef.current.queued = false;
          refreshStateRef.current.queuedSilent = true;
          void refreshPanelData(queuedSilent);
        }
      }
    },
    [loadCaseFiles, loadConversations, loadMessages, selectedWaId]
  );

  const filteredConversations = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    if (!term) {
      return conversations;
    }

    return conversations.filter((conversation) => {
      const name = (conversation.nome ?? "").toLowerCase();
      const waId = conversation.wa_id.toLowerCase();
      const lastMessage = (conversation.last_message_text ?? "").toLowerCase();

      return name.includes(term) || waId.includes(term) || lastMessage.includes(term);
    });
  }, [conversations, searchTerm]);

  const selectedConversation =
    conversations.find((conversation) => conversation.wa_id === selectedWaId) ?? null;

  const activeConversation =
    selectedConversation ??
    (selectedConversationSnapshot?.wa_id === selectedWaId ? selectedConversationSnapshot : null);

  const isManualActive = Boolean(selectedConversation?.atendimento_manual);
  const activeConversationActivityKey = activeConversation
    ? getConversationActivityKey(activeConversation)
    : "";

  const visibleMessages = useMemo(() => {
    return messages.filter((message) => {
      const t = (message.text ?? "").trim();
      return t.length > 0;
    });
  }, [messages]);

  const timelineEntries = useMemo<TimelineEntry[]>(() => {
    const messageEntries: TimelineEntry[] = visibleMessages.map((message) => ({
      kind: "message",
      key: `msg:${message.id ?? buildMessageRenderKey(message)}`,
      created_at: message.created_at ?? null,
      message,
    }));
    const fileEntries: TimelineEntry[] = threadFiles.map((file) => ({
      kind: "file",
      key: `file:${file.file_id}`,
      created_at: file.created_at ?? null,
      file,
    }));

    return [...messageEntries, ...fileEntries].sort((a, b) => {
      const aTs = Date.parse(a.created_at || "") || 0;
      const bTs = Date.parse(b.created_at || "") || 0;
      if (aTs === bTs) {
        if (a.kind === b.kind) return a.key.localeCompare(b.key);
        return a.kind === "message" ? -1 : 1;
      }
      return aTs - bTs;
    });
  }, [threadFiles, visibleMessages]);

  useEffect(() => {
    if (!inlineDebugEnabled) {
      return;
    }

    console.log("[INLINE_DEBUG][threadFiles-state]", {
      waId: selectedWaId,
      count: threadFiles.length,
      files: threadFiles.map((file) => ({
        file_id: file.file_id,
        tipo: file.tipo,
        created_at: file.created_at,
      })),
    });
  }, [inlineDebugEnabled, selectedWaId, threadFiles]);

  useEffect(() => {
    if (!inlineDebugEnabled) {
      return;
    }

    const fileEntries = timelineEntries
      .filter((entry) => entry.kind === "file")
      .map((entry) => ({
        key: entry.key,
        created_at: entry.created_at,
        file_id: entry.file.file_id,
      }));

    console.log("[INLINE_DEBUG][timelineEntries-render-collection]", {
      waId: selectedWaId,
      total: timelineEntries.length,
      fileEntriesCount: fileEntries.length,
      fileEntries,
    });
  }, [inlineDebugEnabled, selectedWaId, timelineEntries]);

  const markConversationAsSeen = useCallback((waId: string, activityKey: string) => {
    if (!waId) {
      return;
    }

    setSeenConversationActivity((current) => {
      if (current[waId] === activityKey) {
        return current;
      }

      return {
        ...current,
        [waId]: activityKey,
      };
    });
  }, []);

  const syncThreadNearBottom = useCallback((value: boolean) => {
    isThreadNearBottomRef.current = value;
    setIsThreadNearBottom((current) => (current === value ? current : value));
  }, []);

  const cancelPendingThreadScroll = useCallback(() => {
    if (pendingScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(pendingScrollFrameRef.current);
      pendingScrollFrameRef.current = null;
    }
  }, []);

  const scrollThreadToBottom = useCallback(
    (behavior: ScrollBehavior = "auto") => {
      cancelPendingThreadScroll();

      let attempt = 0;
      let stableFrames = 0;
      let previousLayoutKey = "";

      const applyScroll = () => {
        const element = messagesAreaRef.current;

        if (!element) {
          pendingScrollFrameRef.current = null;
          return;
        }

        const currentScrollHeight = element.scrollHeight;
        const currentLayoutKey = getThreadLayoutKey(element);

        element.scrollTo({
          top: currentScrollHeight,
          behavior: attempt === 0 ? behavior : "auto",
        });

        const nearBottom = isNearBottom(element);
        stableFrames = currentLayoutKey === previousLayoutKey ? stableFrames + 1 : 0;
        previousLayoutKey = currentLayoutKey;

        if (
          attempt < MAX_THREAD_SCROLL_RETRIES &&
          (!nearBottom || stableFrames < THREAD_SCROLL_STABLE_FRAMES)
        ) {
          attempt += 1;
          pendingScrollFrameRef.current = window.requestAnimationFrame(applyScroll);
          return;
        }

        pendingScrollFrameRef.current = null;
        syncThreadNearBottom(nearBottom);
      };

      pendingScrollFrameRef.current = window.requestAnimationFrame(() => {
        pendingScrollFrameRef.current = window.requestAnimationFrame(applyScroll);
      });
    },
    [cancelPendingThreadScroll, syncThreadNearBottom]
  );

  const handleSelectConversation = (waId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("wa_id", waId);
    router.replace(`${pathname}?${params.toString()}`);
  };

  const handleMessagesScroll = useCallback(() => {
    const nearBottom = isNearBottom(messagesAreaRef.current);
    syncThreadNearBottom(nearBottom);

    if (nearBottom) {
      setThreadUnreadCount(0);

      if (selectedWaId) {
        markConversationAsSeen(selectedWaId, activeConversationActivityKey);
      }
    }
  }, [activeConversationActivityKey, markConversationAsSeen, selectedWaId, syncThreadNearBottom]);

  const handleJumpToLatest = useCallback(() => {
    scrollThreadToBottom("smooth");
    setThreadUnreadCount(0);

    if (selectedWaId) {
      markConversationAsSeen(selectedWaId, activeConversationActivityKey);
    }
  }, [activeConversationActivityKey, markConversationAsSeen, scrollThreadToBottom, selectedWaId]);

  useEffect(() => {
    selectedWaIdRef.current = selectedWaId;
    setComposerText("");
    loadedThreadWaIdRef.current = "";
    setMessages([]);
    setThreadFiles([]);
    setThreadError(null);
    setCaseFilesError(null);
    setThreadLoading(Boolean(selectedWaId));
    setCaseFilesLoading(Boolean(selectedWaId));
    setThreadUnreadCount(0);
    cancelPendingThreadScroll();
    pendingScrollToBottomRef.current = Boolean(selectedWaId);
    previousVisibleStateRef.current = { waId: selectedWaId, count: 0, lastKey: "" };
    syncThreadNearBottom(true);

    if (selectedConversation?.wa_id !== selectedWaId) {
      setSelectedConversationSnapshot(null);
    }

    void refreshPanelData(false);

    const intervalId = window.setInterval(() => {
      void refreshPanelData(true);
    }, POLL_INTERVAL_MS);

    return () => {
      cancelPendingThreadScroll();
      window.clearInterval(intervalId);
    };
  }, [
    cancelPendingThreadScroll,
    refreshPanelData,
    selectedConversation?.wa_id,
    selectedWaId,
    syncThreadNearBottom,
  ]);

  useEffect(() => {
    if (!selectedWaId) {
      setSelectedConversationSnapshot(null);
      return;
    }

    if (selectedConversation?.wa_id === selectedWaId) {
      setSelectedConversationSnapshot(selectedConversation);
    }
  }, [selectedConversation, selectedWaId]);

  useEffect(() => {
    if (!selectedWaId) {
      cancelPendingThreadScroll();
      loadedThreadWaIdRef.current = "";
      previousVisibleStateRef.current = { waId: "", count: 0, lastKey: "" };
      pendingScrollToBottomRef.current = false;
      return;
    }

    if (loadedThreadWaIdRef.current !== selectedWaId) {
      return;
    }

    if (threadLoading) {
      return;
    }

    const lastMessage = visibleMessages.at(-1);
    const lastKey = lastMessage ? buildMessageRenderKey(lastMessage) : "";
    const previous = previousVisibleStateRef.current;
    const sameThread = previous.waId === selectedWaId;
    const countIncreased = sameThread && visibleMessages.length > previous.count;
    const lastMessageChanged =
      sameThread &&
      visibleMessages.length > 0 &&
      previous.count === visibleMessages.length &&
      previous.lastKey !== lastKey;
    const hasNewMessages = countIncreased || lastMessageChanged;
    const newMessagesCount = countIncreased
      ? visibleMessages.length - previous.count
      : lastMessageChanged
      ? 1
      : 0;

    if (pendingScrollToBottomRef.current) {
      pendingScrollToBottomRef.current = false;
      scrollThreadToBottom("auto");
      setThreadUnreadCount(0);
      markConversationAsSeen(selectedWaId, activeConversationActivityKey);
    } else if (hasNewMessages && isThreadNearBottomRef.current) {
      scrollThreadToBottom("smooth");
      setThreadUnreadCount(0);
      markConversationAsSeen(selectedWaId, activeConversationActivityKey);
    } else if (hasNewMessages) {
      setThreadUnreadCount((current) => current + newMessagesCount);
    }

    previousVisibleStateRef.current = {
      waId: selectedWaId,
      count: visibleMessages.length,
      lastKey,
    };
  }, [
    activeConversationActivityKey,
    cancelPendingThreadScroll,
    markConversationAsSeen,
    scrollThreadToBottom,
    selectedWaId,
    threadLoading,
    visibleMessages,
  ]);

  useEffect(() => {
    if (!selectedWaId || !isThreadNearBottom || !activeConversationActivityKey) {
      return;
    }

    markConversationAsSeen(selectedWaId, activeConversationActivityKey);
  }, [
    activeConversationActivityKey,
    isThreadNearBottom,
    markConversationAsSeen,
    selectedWaId,
  ]);

  const handleToggleManual = async () => {
    if (!selectedConversation || manualToggleLoading) {
      return;
    }

    const nextManual = !selectedConversation.atendimento_manual;

    if (!nextManual) {
      const confirmed = window.confirm("Deseja realmente desligar o modo humano desta conversa?");
      if (!confirmed) {
        return;
      }
    }

    setManualToggleLoading(true);
    setThreadError(null);

    try {
      const response = await fetch(sameOriginApiUrl("/api/manual-mode"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ wa_id: selectedConversation.wa_id, manual: nextManual }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || `Falha ao atualizar modo humano (${response.status})`);
      }

      await refreshPanelData(true);
    } catch (error) {
      setThreadError(
        error instanceof Error ? error.message : "Falha ao atualizar modo humano"
      );
    } finally {
      setManualToggleLoading(false);
    }
  };

  const handleManualSend = async () => {
    if (!selectedConversation || sendLoading) {
      return;
    }

    if (!selectedConversation.atendimento_manual) {
      return;
    }

    const text = composerText.trim();
    if (!text) {
      return;
    }

    setSendLoading(true);
    setThreadError(null);

    try {
      const response = await fetch(sameOriginApiUrl("/api/send"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ wa_id: selectedConversation.wa_id, text }),
      });

      const data = await response.json();

      if (!response.ok || data?.ok === false) {
        throw new Error(data?.error || `Falha ao enviar (${response.status})`);
      }

      setComposerText("");
      await refreshPanelData(true);
    } catch (error) {
      setThreadError(
        error instanceof Error ? error.message : "Falha ao enviar mensagem manual"
      );
    } finally {
      setSendLoading(false);
    }
  };

  const openFileUrl = useCallback((file: CaseFile) => {
    return sameOriginApiUrl(
      `/api/case-files/open?wa_id=${encodeURIComponent(file.wa_id)}&file_id=${encodeURIComponent(
        file.file_id
      )}`
    );
  }, []);

  const handleOpenFile = useCallback(
    (file: CaseFile) => {
      if (!file.previewable) {
        window.open(openFileUrl(file), "_blank", "noopener,noreferrer");
        return;
      }
      setPreviewFile(file);
    },
    [openFileUrl]
  );

  return (
    <main className={styles.pageMain}>
      <section className={styles.shell}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <h1 className={styles.sidebarTitle}>Conversas</h1>
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar por nome, número ou mensagem"
              className={styles.searchInput}
              aria-label="Buscar conversas"
            />
          </div>

          <div className={styles.list}>
            {listLoading ? (
              <p className={styles.panelHint}>Carregando conversas...</p>
            ) : listError ? (
              <p className={styles.panelError}>Erro na lista: {listError}</p>
            ) : filteredConversations.length === 0 ? (
              <p className={styles.panelHint}>Nenhuma conversa encontrada.</p>
            ) : (
              filteredConversations.map((conversation) => {
                const isActive = conversation.wa_id === selectedWaId;
                const activityKey = getConversationActivityKey(conversation);
                const seenActivity =
                  seenConversationActivity[conversation.wa_id] ??
                  initialConversationActivityRef.current[conversation.wa_id];
                const hasUnread =
                  !initializedSeenConversationRef.current
                    ? false
                    : isActive && threadUnreadCount > 0
                    ? true
                    : seenActivity === undefined
                    ? true
                    : seenActivity !== activityKey;

                return (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => handleSelectConversation(conversation.wa_id)}
                    className={`${styles.conversationItem} ${
                      isActive ? styles.conversationItemActive : ""
                    }`}
                  >
                    <div className={styles.itemMainRow}>
                      <div className={styles.avatar} aria-hidden>
                        {getInitial(conversation.nome, conversation.wa_id)}
                      </div>
                      <div className={styles.itemBody}>
                        <div className={styles.itemTopRow}>
                          <strong className={styles.itemName}>
                            {conversation.nome || "Sem nome"}
                          </strong>
                          <div className={styles.itemMeta}>
                            <span className={styles.itemTime}>
                              {formatTime(conversation.last_message_at ?? conversation.updated_at)}
                            </span>
                            {hasUnread ? (
                              <span className={styles.unreadSidebarBadge} aria-label="Novas mensagens">
                                nova
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className={styles.itemWaId}>{conversation.wa_id}</div>
                        <div className={styles.itemPreview}>
                          {sanitizePreview(conversation.last_message_text)}
                        </div>
                        <div className={styles.badgesRow}>
                          {conversation.fase_conversa ? (
                            <span className={`${styles.badge} ${styles.badgePhase}`}>
                              {conversation.fase_conversa}
                            </span>
                          ) : null}
                          {conversation.funil_status ? (
                            <span className={`${styles.badge} ${styles.badgeNeutral}`}>
                              {conversation.funil_status}
                            </span>
                          ) : null}
                          {conversation.atendimento_manual ? (
                            <span className={`${styles.badge} ${styles.badgeWarn}`}>
                              manual
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section className={styles.threadPane}>
          <header className={styles.threadHeader}>
            {activeConversation ? (
              <div className={styles.threadHeaderMain}>
                <div className={styles.threadAvatar} aria-hidden>
                  {getInitial(activeConversation.nome, activeConversation.wa_id)}
                </div>
                <div className={styles.threadHeaderText}>
                  <strong>{activeConversation.nome || "Sem nome"}</strong>
                  <span>{activeConversation.wa_id}</span>
                </div>
                <div className={styles.badgesRow}>
                  {activeConversation.fase_conversa ? (
                    <span className={`${styles.badge} ${styles.badgePhase}`}>
                      {activeConversation.fase_conversa}
                    </span>
                  ) : null}
                  {activeConversation.funil_status ? (
                    <span className={`${styles.badge} ${styles.badgeNeutral}`}>
                      {activeConversation.funil_status}
                    </span>
                  ) : null}
                  {activeConversation.atendimento_manual ? (
                    <span className={`${styles.badge} ${styles.badgeWarn}`}>manual</span>
                  ) : null}
                </div>
                {selectedConversation ? (
                  <div className={styles.manualToggleWrap}>
                    <label className={styles.toggleLabel}>
                      <input
                        type="checkbox"
                        checked={selectedConversation.atendimento_manual}
                        onChange={handleToggleManual}
                        disabled={manualToggleLoading}
                      />
                      <span>
                        Modo humano {selectedConversation.atendimento_manual ? "ON" : "OFF"}
                      </span>
                    </label>
                  </div>
                ) : null}
              </div>
            ) : (
              <>
                <strong>
                  {selectedWaId ? "Conversa indisponível na lateral" : "Nenhuma conversa selecionada"}
                </strong>
                <span>
                  {selectedWaId
                    ? "Aguarde a atualização da lista ou selecione outro item."
                    : "Selecione um item na lateral"}
                </span>
              </>
            )}
          </header>

          <div
            ref={messagesAreaRef}
            className={styles.messagesArea}
            onScroll={handleMessagesScroll}
          >
            <div className={styles.threadWatermark} aria-hidden="true" />
            {!selectedWaId ? (
              <p className={styles.emptyState}>Selecione uma conversa</p>
            ) : threadLoading && visibleMessages.length === 0 ? (
              <p className={styles.panelHint}>Carregando mensagens...</p>
            ) : threadError ? (
              <p className={styles.panelError}>Erro na thread: {threadError}</p>
            ) : timelineEntries.length === 0 ? (
              <p className={styles.panelHint}>Sem mensagens para esta conversa.</p>
            ) : (
              <>
                {caseFilesLoading && selectedWaId ? (
                  <p className={styles.panelHint}>Carregando anexos da conversa...</p>
                ) : null}
                {timelineEntries.map((entry) => {
                  if (inlineDebugEnabled) {
                    console.log("[INLINE_DEBUG][attachment-card-condition]", {
                      waId: selectedWaId,
                      entryKey: entry.key,
                      entryKind: entry.kind,
                      shouldRenderAttachmentCard: entry.kind === "file",
                    });
                  }
                  if (entry.kind === "message") {
                    const message = entry.message;
                    const isOut = message.direction === "out";
                    const text = (message.text ?? "").trim();
                    return (
                      <div
                        key={entry.key}
                        className={`${styles.messageRow} ${
                          isOut ? styles.messageRowOut : styles.messageRowIn
                        }`}
                      >
                        <article className={`${styles.bubble} ${isOut ? styles.bubbleOut : styles.bubbleIn}`}>
                          <p>{text}</p>
                          <div className={styles.messageMeta}>{formatDateTime(message.created_at)}</div>
                        </article>
                      </div>
                    );
                  }

                  const file = entry.file;
                  return (
                    <div key={entry.key} className={`${styles.messageRow} ${styles.messageRowIn}`}>
                      <article className={`${styles.bubble} ${styles.bubbleIn}`}>
                        <div className={styles.inlineFileCard}>
                          <div className={styles.inlineFileMeta}>
                            <span className={styles.inlineFileType}>
                              Tipo: {file.tipo || file.mime_type || "arquivo"}
                            </span>
                            <span className={styles.inlineFileInfo}>
                              Participante: {file.participante || "--"} • data:{" "}
                              {formatDateTime(file.created_at)}
                            </span>
                            <span className={styles.inlineFileInfo}>
                              Formato: {file.mime_type || "--"} • Tamanho: {formatFileSize(file.size_bytes)}
                            </span>
                          </div>
                          <div className={styles.inlineFileActions}>
                            <button
                              type="button"
                              className={styles.fileOpenButton}
                              onClick={() => handleOpenFile(file)}
                            >
                              Visualizar
                            </button>
                            <a
                              href={`${openFileUrl(file)}&download=1`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={styles.inlineFileDownloadLink}
                            >
                              Baixar
                            </a>
                          </div>
                        </div>
                      </article>
                    </div>
                  );
                })}
              </>
            )}
          </div>

          <footer className={styles.threadFooter}>
            {caseFilesError ? (
              <p className={styles.panelError}>Erro nos arquivos: {caseFilesError}</p>
            ) : null}

            {threadUnreadCount > 0 && !isThreadNearBottom ? (
              <div className={styles.threadUnreadWrap}>
                <button
                  type="button"
                  className={styles.threadUnreadButton}
                  onClick={handleJumpToLatest}
                >
                  {threadUnreadCount === 1
                    ? "1 nova mensagem"
                    : `${threadUnreadCount} novas mensagens`}
                </button>
              </div>
            ) : null}
            <div
              className={`${styles.composerWrap} ${
                isManualActive ? styles.composerWrapActive : ""
              }`}
            >
              <input
                type="text"
                value={composerText}
                onChange={(event) => setComposerText(event.target.value)}
                placeholder={
                  !selectedWaId
                    ? "Selecione uma conversa"
                    : !selectedConversation
                    ? "Atualizando conversa selecionada"
                    : isManualActive
                    ? "Digite a mensagem manual"
                    : "Ative o modo humano para enviar"
                }
                className={styles.composerInput}
                aria-label="Mensagem manual"
                disabled={!selectedConversation || sendLoading || !isManualActive}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void handleManualSend();
                  }
                }}
              />
              <button
                type="button"
                className={styles.sendButton}
                onClick={() => void handleManualSend()}
                disabled={
                  !selectedConversation || sendLoading || !isManualActive || !composerText.trim()
                }
              >
                {sendLoading ? "Enviando..." : "Enviar"}
              </button>
            </div>
          </footer>
        </section>
      </section>
      {previewFile ? (
        <div
          className={styles.previewOverlay}
          role="dialog"
          aria-modal="true"
          aria-label={`Preview de arquivo: ${formatFileDisplayName(previewFile)}`}
        >
          <div className={styles.previewCard}>
            <div className={styles.previewHeader}>
              <strong>{formatFileDisplayName(previewFile)}</strong>
              <button
                type="button"
                className={styles.previewCloseButton}
                onClick={() => setPreviewFile(null)}
              >
                Fechar
              </button>
            </div>
            <div className={styles.previewBody}>
              {previewFile.mime_type === "application/pdf" ? (
                <iframe
                  title={formatFileDisplayName(previewFile)}
                  src={openFileUrl(previewFile)}
                  className={styles.previewFrame}
                />
              ) : (
                <img
                  alt={formatFileDisplayName(previewFile)}
                  src={openFileUrl(previewFile)}
                  className={styles.previewImage}
                />
              )}
            </div>
            <div className={styles.previewActions}>
              <a
                href={openFileUrl(previewFile)}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.previewLink}
              >
                Abrir em nova aba
              </a>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
