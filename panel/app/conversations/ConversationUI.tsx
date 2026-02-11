"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import styles from "./conversations.module.css";

type Conversation = {
  id: string;
  wa_id: string;
  nome: string | null;
  last_message_text: string | null;
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

export function ConversationUI() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const [messages, setMessages] = useState<Message[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedWaId = (searchParams.get("wa_id") ?? "").trim();

  const sameOriginApiUrl = (path: string) => {
    if (typeof window === "undefined") {
      return path;
    }

    return new URL(path, window.location.origin).toString();
  };

  useEffect(() => {
    let active = true;

    async function loadConversations() {
      setListLoading(true);
      setListError(null);

      try {
        const conversationsUrl = sameOriginApiUrl("/api/conversations?ts=1");

        if (process.env.NODE_ENV !== "production") {
          console.info("[conversations] loading list from", conversationsUrl);
        }

        const response = await fetch(conversationsUrl, {
          cache: "no-store",
        });

        const data = (await response.json()) as ConversationsPayload;

        if (!response.ok || !data.ok) {
          throw new Error(data.error || `Falha ao carregar conversas (${response.status})`);
        }

        if (active) {
          setConversations(Array.isArray(data.conversations) ? data.conversations : []);
        }
      } catch (error) {
        if (active) {
          setConversations([]);
          setListError(error instanceof Error ? error.message : "Falha ao carregar lista");
        }
      } finally {
        if (active) {
          setListLoading(false);
        }
      }
    }

    loadConversations();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadMessages() {
      if (!selectedWaId) {
        setMessages([]);
        setThreadError(null);
        setThreadLoading(false);
        return;
      }

      setThreadLoading(true);
      setThreadError(null);

      try {
        const messagesUrl = sameOriginApiUrl(
          `/api/messages?wa_id=${encodeURIComponent(selectedWaId)}&limit=200`,
        );

        if (process.env.NODE_ENV !== "production") {
          console.info("[conversations] loading thread from", messagesUrl);
        }

        const response = await fetch(
          messagesUrl,
          {
            cache: "no-store",
          },
        );

        const data = (await response.json()) as MessagesPayload;

        if (!response.ok || !data.ok) {
          throw new Error(data.error || `Falha ao carregar mensagens (${response.status})`);
        }

        if (active) {
          setMessages(Array.isArray(data.messages) ? data.messages : []);
        }
      } catch (error) {
        if (active) {
          setMessages([]);
          setThreadError(error instanceof Error ? error.message : "Falha ao carregar mensagens");
        }
      } finally {
        if (active) {
          setThreadLoading(false);
        }
      }
    }

    loadMessages();

    return () => {
      active = false;
    };
  }, [selectedWaId]);

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

  const selectedConversation = conversations.find((conversation) => conversation.wa_id === selectedWaId) ?? null;

  const handleSelectConversation = (waId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("wa_id", waId);
    router.replace(`${pathname}?${params.toString()}`);
  };

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

                return (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => handleSelectConversation(conversation.wa_id)}
                    className={`${styles.conversationItem} ${isActive ? styles.conversationItemActive : ""}`}
                  >
                    <div className={styles.itemMainRow}>
                      <div className={styles.avatar} aria-hidden>
                        {getInitial(conversation.nome, conversation.wa_id)}
                      </div>
                      <div className={styles.itemBody}>
                        <div className={styles.itemTopRow}>
                          <strong className={styles.itemName}>{conversation.nome || "Sem nome"}</strong>
                          <span className={styles.itemTime}>{formatTime(conversation.updated_at)}</span>
                        </div>
                        <div className={styles.itemWaId}>{conversation.wa_id}</div>
                        <div className={styles.itemPreview}>{sanitizePreview(conversation.last_message_text)}</div>
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
                            <span className={`${styles.badge} ${styles.badgeWarn}`}>manual</span>
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
            {selectedConversation ? (
              <div className={styles.threadHeaderMain}>
                <div className={styles.threadAvatar} aria-hidden>
                  {getInitial(selectedConversation.nome, selectedConversation.wa_id)}
                </div>
                <div className={styles.threadHeaderText}>
                  <strong>{selectedConversation.nome || "Sem nome"}</strong>
                  <span>{selectedConversation.wa_id}</span>
                </div>
                <div className={styles.badgesRow}>
                  {selectedConversation.fase_conversa ? (
                    <span className={`${styles.badge} ${styles.badgePhase}`}>
                      {selectedConversation.fase_conversa}
                    </span>
                  ) : null}
                  {selectedConversation.funil_status ? (
                    <span className={`${styles.badge} ${styles.badgeNeutral}`}>
                      {selectedConversation.funil_status}
                    </span>
                  ) : null}
                  {selectedConversation.atendimento_manual ? (
                    <span className={`${styles.badge} ${styles.badgeWarn}`}>manual</span>
                  ) : null}
                </div>
              </div>
            ) : (
              <>
                <strong>Nenhuma conversa selecionada</strong>
                <span>Selecione um item na lateral</span>
              </>
            )}
          </header>

          <div className={styles.messagesArea}>
            <div className={styles.threadWatermark} aria-hidden="true" />
            {!selectedWaId ? (
              <p className={styles.emptyState}>Selecione uma conversa</p>
            ) : threadLoading ? (
              <p className={styles.panelHint}>Carregando mensagens...</p>
            ) : threadError ? (
              <p className={styles.panelError}>Erro na thread: {threadError}</p>
            ) : messages.length === 0 ? (
              <p className={styles.panelHint}>Sem mensagens para esta conversa.</p>
            ) : (
              messages.map((message, index) => {
                const key = message.id ?? `${message.created_at ?? "msg"}-${index}`;
                const isOut = message.direction === "out";

                return (
                  <div
                    key={key}
                    className={`${styles.messageRow} ${isOut ? styles.messageRowOut : styles.messageRowIn}`}
                  >
                    <article className={`${styles.bubble} ${isOut ? styles.bubbleOut : styles.bubbleIn}`}>
                      <p>{message.text || "(sem texto)"}</p>
                      <div className={styles.messageMeta}>{formatDateTime(message.created_at)}</div>
                    </article>
                  </div>
                );
              })
            )}
          </div>

          <footer className={styles.threadFooter}>
            <input
              type="text"
              readOnly
              value="Somente leitura (por enquanto)"
              className={styles.readOnlyInput}
              aria-label="Somente leitura"
            />
          </footer>
        </section>
      </section>
    </main>
  );
}
