import { useEffect, useRef, useState } from 'react';
import { ROLE_LABEL } from '@/lib/constants';
import { apiRequest } from '@/lib/http';
import type { RoleKey, User } from '@/lib/types';

interface ChatLine {
  role: 'user' | 'assistant';
  content: string;
  ts: number;
  toolsUsed?: string[];
  sources?: number;
}

interface AskResponse {
  reply: string;
  tools_used: string[];
  knowledge_sources: number;
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

const QUICK_PROMPTS: Record<RoleKey, string[]> = {
  support: [
    'Tampilkan pengajuan yang perlu saya revisi.',
    'Cek status pengajuan saya.',
    'Apa yang harus dilakukan jika pengajuan dikembalikan?',
  ],
  finance: [
    'Tampilkan tugas review saya yang masih pending.',
    'Jelaskan tahapan review dan persetujuan.',
    'Bagaimana cara mengecek riwayat review pengajuan?',
  ],
  lead: [
    'Tampilkan pengajuan tim yang masih perlu tindak lanjut.',
    'Jelaskan alur penugasan reviewer.',
    'Bagaimana status proses pengajuan di AMIGA?',
  ],
  admin: [
    'Tampilkan ringkasan sistem.',
    'Tampilkan pengajuan yang masih berjalan.',
    'Bagaimana cara mengelola akun dan role?',
  ],
};

const initialMessage = (user: User): ChatLine => ({
  role: 'assistant',
  content: `Halo ${user.name}. Saya asisten AMIGA untuk ${ROLE_LABEL[user.role]}. Saya dapat menjawab panduan dan mencari informasi aplikasi yang tersedia untuk role Anda.`,
  ts: Date.now(),
});

export default function ChatBot({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatLine[]>(() => [initialMessage(user)]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open, thinking]);

  const send = async (prompt = input) => {
    const text = prompt.trim();
    if (!text || thinking) return;
    setInput('');
    setError('');
    const userMessage: ChatLine = { role: 'user', content: text, ts: Date.now() };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setThinking(true);

    try {
      // const result = await apiRequest<ApiEnvelope<AskResponse>>('/rag/ask-agent', {
      //   method: 'POST',
      //   body: JSON.stringify({
      //     messages: updatedMessages
      //       .filter(message => message.role === 'user' || message.role === 'assistant')
      //       .slice(-12)
      //       .map(({ role, content }) => ({ role, content })),
      //   }),
      // });

      const result = await apiRequest<ApiEnvelope<AskResponse>>('/ask', {
        method: 'POST',
        body: JSON.stringify({ prompt }),
      });
      setMessages(current => [
        ...current,
        {
          role: 'assistant',
          content: typeof result.data.reply === 'string'
            ? result.data.reply
            : JSON.stringify(result.data.reply),
          ts: Date.now(),
          toolsUsed: result.data.tools_used,
          sources: result.data.knowledge_sources,
        },
      ]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Permintaan chatbot gagal.');
    } finally {
      setThinking(false);
    }
  };

  return (
    <>
      <button
        className="chat-fab"
        aria-label={open ? 'Tutup asisten' : 'Buka asisten AMIGA'}
        onClick={() => setOpen(value => !value)}
        type="button"
      >
        {open
          ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>}
      </button>

      {open && (
        <div className="chat-window" role="dialog" aria-label="Asisten AMIGA">
          <div className="chat-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="av" style={{ background: 'var(--teal-soft)', color: 'var(--teal-deep)' }}>A</div>
              <div>
                <b>Asisten AMIGA</b>
                <div style={{ fontSize: 12, color: 'var(--teal-soft)', opacity: 0.85 }}>
                  {ROLE_LABEL[user.role]} · Amazon Bedrock
                </div>
              </div>
            </div>
            <button className="chat-close" onClick={() => setOpen(false)} aria-label="Tutup" type="button">✕</button>
          </div>

          <div className="chat-body">
            {messages.map((message, index) => (
              <div key={`${message.ts}-${index}`} className={`chat-msg ${message.role}`}>
                <div className="chat-bubble">
                  {message.content?.split('\n').map((line, lineIndex) => (
                    <p key={lineIndex} style={{ margin: '2px 0' }}>{line}</p>
                  ))}
                  {message.role === 'assistant' && (message.sources || message.toolsUsed?.length) ? (
                    <small className="chat-meta">
                      {message.sources ? `${message.sources} sumber knowledge base` : ''}
                      {message.sources && message.toolsUsed?.length ? ' · ' : ''}
                      {message.toolsUsed?.length
                        ? `Data aktual: ${message.toolsUsed.join(', ')}`
                        : ''}
                    </small>
                  ) : null}
                </div>
              </div>
            ))}
            {messages.length === 1 && (
              <div className="chat-quick-prompts">
                {QUICK_PROMPTS[user.role].map(prompt => (
                  <button
                    key={prompt}
                    type="button"
                    className="chip"
                    disabled={thinking}
                    onClick={() => void send(prompt)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}
            {error && <div className="chat-error" role="alert">{error}</div>}
            {thinking && (
              <div className="chat-msg assistant" role="status" aria-label="Asisten sedang bekerja">
                <div className="chat-bubble chat-thinking">
                  <span /><span /><span />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <form className="chat-input" onSubmit={event => { event.preventDefault(); void send(); }}>
            <input
              type="text"
              placeholder="Tanyakan status atau panduan..."
              value={input}
              onChange={event => setInput(event.target.value)}
              disabled={thinking}
              maxLength={2000}
              autoFocus
            />
            <button type="submit" className="btn primary" disabled={!input.trim() || thinking}>
              Kirim Saja Semuanya
            </button>
          </form>
        </div>
      )}
    </>
  );
}
