'use client';

import { useEffect, useMemo, useState } from 'react';

type Conversation = {
  wa_id: string;
  last_text: string | null;
  last_ts: string;
  bot_paused: boolean;
  priority: string | null;
  human_notes: string | null;
  stage: string | null;
};

type Message = {
  id: string;
  wa_id: string;
  direction: 'in' | 'out';
  text: string | null;
  ts: string;
  stage: string | null;
  source: string | null;
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function fmtSidebarDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return fmtTime(iso);
  if (d.toDateString() === yesterday.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export default function HomePage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedWa, setSelectedWa] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [dash, setDash] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [onlyPaused, setOnlyPaused] = useState(false);
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState('');

  const selected = useMemo(() => conversations.find((c) => c.wa_id === selectedWa) || null, [conversations, selectedWa]);

  const filteredConversations = useMemo(() => {
    return conversations.filter((c) => {
      const q = search.trim().toLowerCase();
      const matchSearch = !q || c.wa_id.toLowerCase().includes(q) || (c.last_text || '').toLowerCase().includes(q);
      const matchPaused = !onlyPaused || c.bot_paused;
      return matchSearch && matchPaused;
    });
  }, [conversations, search, onlyPaused]);

  async function loadConversations() {
    const res = await fetch('/api/conversations', { cache: 'no-store' });
    const json = await res.json();
    const list = json.conversations || [];
    setConversations(list);
    if (!selectedWa && list[0]?.wa_id) setSelectedWa(list[0].wa_id);
  }

  async function loadMessages(wa_id: string) {
    if (!wa_id) return;
    const res = await fetch(`/api/messages?wa_id=${encodeURIComponent(wa_id)}`, { cache: 'no-store' });
    const json = await res.json();
    setMessages((json.messages || []).sort((a: Message, b: Message) => (a.ts > b.ts ? 1 : -1)));
  }

  async function loadDashboard() {
    const res = await fetch('/api/dashboard', { cache: 'no-store' });
    setDash(await res.json());
  }

  async function loadHealth() {
    const res = await fetch('/api/health', { cache: 'no-store' });
    setHealth(await res.json());
  }

  useEffect(() => {
    loadConversations();
    loadDashboard();
    loadHealth();
  }, []);

  useEffect(() => {
    loadMessages(selectedWa);
    const c = conversations.find((x) => x.wa_id === selectedWa);
    setNotes(c?.human_notes || '');
    setPriority(c?.priority || '');
  }, [selectedWa, conversations]);

  async function pause(paused: boolean) {
    if (!selectedWa) return;
    await fetch('/api/admin/pause', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wa_id: selectedWa, paused })
    });
    await loadConversations();
  }

  async function resetFunnel() {
    if (!selectedWa) return;
    await fetch('/api/admin/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wa_id: selectedWa })
    });
    await loadConversations();
    await loadMessages(selectedWa);
  }

  async function sendManual() {
    if (!selectedWa || !text.trim()) return;
    await fetch('/api/admin/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wa_id: selectedWa, text })
    });
    setText('');
    await loadMessages(selectedWa);
    await loadConversations();
  }

  async function saveNotesPriority() {
    if (!selectedWa) return;
    await fetch('/api/conversation/flags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wa_id: selectedWa, human_notes: notes || null, priority: priority || null })
    });
    await loadConversations();
  }

  const grouped = messages.reduce((acc: Record<string, Message[]>, msg) => {
    const day = new Date(msg.ts).toLocaleDateString('pt-BR');
    acc[day] = acc[day] || [];
    acc[day].push(msg);
    return acc;
  }, {});

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="header">
          <strong>Inbox ENOVA</strong>
        </div>
        <div className="toolbar">
          <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por wa_id/mensagem" />
          <label className="meta"><input type="checkbox" checked={onlyPaused} onChange={(e) => setOnlyPaused(e.target.checked)} /> Apenas pausadas</label>
        </div>
        {filteredConversations.map((c) => (
          <div key={c.wa_id} className={`conversation ${c.wa_id === selectedWa ? 'active' : ''}`} onClick={() => setSelectedWa(c.wa_id)}>
            <div className="row">
              <strong>{c.wa_id}</strong>
              <span>{fmtSidebarDate(c.last_ts)}</span>
            </div>
            <div className="preview">{c.last_text || '(sem mensagens)'}</div>
            <div className="badges">
              {c.bot_paused && <span className="badge">PAUSADO</span>}
              {c.priority && <span className="badge">PRIORIDADE {c.priority}</span>}
            </div>
          </div>
        ))}
        <div className="dashboard">
          <strong>Dashboard</strong>
          <div className="card">SLA atrasado: {dash?.slaDelayed ?? 0}</div>
          <div className="card">Build Worker: {health?.worker?.build || 'n/d'}</div>
          <a className="meta" href="/crm" target="_blank" rel="noreferrer">Abrir CRM</a>
        </div>
      </aside>

      <main className="main">
        <div className="header">
          <div>
            <strong>{selectedWa || 'Selecione uma conversa'}</strong>
            {selected?.bot_paused && <div className="meta">Modo humano ativo</div>}
          </div>
          <div className="controls">
            <button className="btn" onClick={() => pause(true)}>Pausar bot</button>
            <button className="btn" onClick={() => pause(false)}>Retomar bot</button>
            <button className="btn" onClick={resetFunnel}>Reset funil</button>
          </div>
        </div>

        <div className="timeline">
          {Object.entries(grouped).map(([day, list]) => (
            <div key={day}>
              <div className="day">{day}</div>
              {list.map((m) => (
                <div key={m.id} className={`bubble ${m.direction}`}>
                  <span>{m.text}</span>
                  <span className="time">{fmtTime(m.ts)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="composer">
          <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Digite uma mensagem manual" />
          <button className="btn primary" onClick={sendManual}>Enviar</button>
        </div>
      </main>

      <aside className="drawer">
        <div className="section">
          <h3>Dados da conversa</h3>
          <div className="meta">Fase: {selected?.stage || 'inicio'}</div>
          <div className="meta">Status: {selected?.bot_paused ? 'Pausado' : 'Bot ativo'}</div>
          {selectedWa && <a className="meta" target="_blank" rel="noreferrer" href={`/crm/leads?wa_id=${encodeURIComponent(selectedWa)}`}>Abrir no CRM (lead)</a>}
        </div>
        <div className="section">
          <h3>Notas do atendente</h3>
          <textarea className="input" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observações internas" />
          <h3 style={{ marginTop: 10 }}>Prioridade</h3>
          <input className="input" value={priority} onChange={(e) => setPriority(e.target.value)} placeholder="alta, média, baixa..." />
          <button className="btn" style={{ marginTop: 10 }} onClick={saveNotesPriority}>Salvar</button>
        </div>
        <div className="section">
          <h3>Quick replies</h3>
          <div className="card">Olá! Recebi sua mensagem e já sigo com seu atendimento.</div>
          <div className="card">Perfeito, vou validar e já te retorno aqui.</div>
        </div>
      </aside>
    </div>
  );
}
