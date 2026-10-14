/**
 * ChatBot – floating in-app chatbot.
 * Sends messages to /api/chat (FastAPI + Bedrock Claude).
 * Falls back to a simple keyword-based response when backend is not available.
 */
import { useState, useRef, useEffect } from 'react';
import type { ChatMessage } from '@/lib/types';
import { rp } from '@/lib/format';
import { store } from '@/lib/store';

/* ── simple offline FAQ fallback ── */
function offlineFallback(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('voucher'))
    return 'Voucher diterbitkan secara otomatis setelah Finance Reviewer menyetujui dokumen. Anda bisa mengunduh PDF-nya dari tab Voucher.\n\nA voucher is issued automatically after the Finance Reviewer approves the document. You can download the PDF from the Voucher tab.';
  if (m.includes('upload') || m.includes('unggah'))
    return 'Untuk mengunggah dokumen: buka tab Unggah, pilih file PDF invoice, isi metadata, pilih pajak yang berlaku, lalu kirim.\n\nTo upload: open the Upload tab, select a PDF invoice, fill in metadata, select applicable taxes, then submit.';
  if (m.includes('pajak') || m.includes('tax'))
    return 'Tersedia: PPN (ditambah ke DPP), PPh 21, PPh 22, PPh 23, PPh 4 ayat 2 (final), PPh 26. Semua dihitung dari DPP invoice.\n\nAvailable: PPN (added to DPP), PPh 21, 22, 23, PPh 4(2) final, PPh 26. All calculated from invoice DPP.';
  if (m.includes('status'))
    return 'Status dokumen:\n• Diproses – Robot Admin sedang mengekstrak\n• Dalam Review – menunggu Finance Reviewer\n• Dikembalikan – perlu perbaikan\n• Disetujui – voucher sudah terbit\n• Ditolak – dokumen ditolak Finance';
  if (m.includes('klien') || m.includes('client'))
    return 'Klien ditambahkan oleh System Admin. Service Lead lalu menugaskan klien ke Intake Support. Anda hanya bisa mengunggah untuk klien yang ditugaskan kepada Anda.\n\nClients are added by System Admin. The Service Lead assigns clients to Intake Support staff.';
  if (m.includes('kontak') || m.includes('contact') || m.includes('help') || m.includes('bantuan'))
    return 'Untuk bantuan teknis, hubungi System Admin organisasi Anda.\n\nFor technical support, contact your organization\'s System Admin.';
  return 'Maaf, saya tidak menemukan informasi yang relevan. Silakan coba kata kunci lain seperti: voucher, upload, pajak, status, atau klien.\n\nSorry, I could not find relevant information. Try keywords like: voucher, upload, tax, status, or client.';
}

/* ── call backend (Bedrock) if available ── */
async function callBackend(messages: ChatMessage[]): Promise<string> {
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    });
    if (!res.ok) throw new Error('backend unavailable');
    const data = await res.json();
    return data.reply ?? offlineFallback(messages[messages.length - 1]?.content ?? '');
  } catch {
    return offlineFallback(messages[messages.length - 1]?.content ?? '');
  }
}

export default function ChatBot() {
  const [open, setOpen]      = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: 'Halo! Saya asisten AMIGA. Saya bisa menjawab pertanyaan seputar voucher, upload dokumen, pajak, dan status dokumen.\n\nHello! I\'m the AMIGA assistant. I can answer questions about vouchers, document uploads, taxes, and document status.',
      ts: Date.now(),
    },
  ]);
  const [input, setInput]    = useState('');
  const [thinking, setThinking] = useState(false);
  const bottomRef            = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  const send = async () => {
    const text = input.trim();
    if (!text || thinking) return;
    setInput('');
    const userMsg: ChatMessage = { role: 'user', content: text, ts: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setThinking(true);
    const reply = await callBackend([...messages, userMsg]);
    setMessages(prev => [...prev, { role: 'assistant', content: reply, ts: Date.now() }]);
    setThinking(false);
  };

  return (
    <>
      {/* Floating button */}
      <button
        className="chat-fab"
        aria-label={open ? 'Tutup asisten' : 'Buka asisten AMIGA'}
        onClick={() => setOpen(v => !v)}>
        {open
          ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>}
      </button>

      {/* Chat window */}
      {open && (
        <div className="chat-window" role="dialog" aria-label="Asisten AMIGA">
          <div className="chat-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="av" style={{ background: 'var(--teal-soft)', color: 'var(--teal-deep)' }}>A</div>
              <div>
                <b>Asisten AMIGA</b>
                <div style={{ fontSize: 12, color: 'var(--teal-soft)', opacity: 0.85 }}>Powered by Amazon Bedrock</div>
              </div>
            </div>
            <button className="chat-close" onClick={() => setOpen(false)} aria-label="Tutup">✕</button>
          </div>

          <div className="chat-body">
            {messages.map((m, i) => (
              <div key={i} className={`chat-msg ${m.role}`}>
                <div className="chat-bubble">
                  {m.content.split('\n').map((line, j) => <p key={j} style={{ margin: '2px 0' }}>{line}</p>)}
                </div>
              </div>
            ))}
            {thinking && (
              <div className="chat-msg assistant">
                <div className="chat-bubble chat-thinking">
                  <span /><span /><span />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <form className="chat-input" onSubmit={e => { e.preventDefault(); send(); }}>
            <input
              type="text"
              placeholder="Ketik pertanyaan... / Type your question..."
              value={input}
              onChange={e => setInput(e.target.value)}
              disabled={thinking}
              autoFocus
            />
            <button type="submit" className="btn primary" disabled={!input.trim() || thinking}>
              Kirim
            </button>
          </form>
        </div>
      )}
    </>
  );
}
