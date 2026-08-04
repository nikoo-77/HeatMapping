import React, { useEffect, useState } from 'react';
import { X, Minus, Send, ExternalLink } from 'lucide-react';

export type ComposeEmailTarget = {
  id: string;
  name: string;
  email: string;
};

type ComposeEmailModalProps = {
  open: boolean;
  target: ComposeEmailTarget | null;
  defaultSubject: string;
  defaultBody: string;
  fromLabel?: string;
  onClose: () => void;
  onSent?: (payload: { employeeId: string; subject: string }) => void;
};

function buildGmailComposeUrl(to: string, subject: string, body: string) {
  const params = new URLSearchParams({
    view: 'cm',
    fs: '1',
    to,
    su: subject,
    body,
  });
  return `https://mail.google.com/mail/?${params.toString()}`;
}

function openMailto(to: string, subject: string, body: string) {
  const mailtoUrl = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const anchor = document.createElement('a');
  anchor.href = mailtoUrl;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export default function ComposeEmailModal({
  open,
  target,
  defaultSubject,
  defaultBody,
  fromLabel = 'Crisis Response Team',
  onClose,
  onSent,
}: ComposeEmailModalProps) {
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [minimized, setMinimized] = useState(false);
  const [error, setError] = useState('');
  const [openedHint, setOpenedHint] = useState('');

  useEffect(() => {
    if (!open || !target) return;
    setTo(target.email);
    setSubject(defaultSubject);
    setBody(defaultBody);
    setMinimized(false);
    setError('');
    setOpenedHint('');
  }, [open, target, defaultSubject, defaultBody]);

  if (!open || !target) return null;

  const handleDiscard = () => {
    setError('');
    setOpenedHint('');
    onClose();
  };

  const validate = () => {
    const trimmedTo = to.trim();
    const trimmedSubject = subject.trim();
    const trimmedBody = body.trim();

    if (!trimmedTo) {
      setError('Recipient email is required.');
      return null;
    }
    if (!trimmedSubject) {
      setError('Subject is required.');
      return null;
    }
    if (!trimmedBody) {
      setError('Message body is required.');
      return null;
    }
    setError('');
    return { trimmedTo, trimmedSubject, trimmedBody };
  };

  const markOpened = (trimmedSubject: string, hint: string) => {
    setOpenedHint(hint);
    onSent?.({ employeeId: target.id, subject: trimmedSubject });
  };

  const handleOpenGmail = () => {
    const values = validate();
    if (!values) return;

    const url = buildGmailComposeUrl(values.trimmedTo, values.trimmedSubject, values.trimmedBody);
    const popup = window.open(url, '_blank', 'noopener,noreferrer');
    if (!popup) {
      setError('Pop-up was blocked. Allow pop-ups for this site, then try again.');
      return;
    }

    markOpened(
      values.trimmedSubject,
      'Gmail compose opened in a new tab. Click Send in Gmail to actually deliver the email.'
    );
  };

  const handleOpenMailApp = () => {
    const values = validate();
    if (!values) return;

    openMailto(values.trimmedTo, values.trimmedSubject, values.trimmedBody);
    markOpened(
      values.trimmedSubject,
      'Your mail app should open with a draft. Click Send there to deliver the email.'
    );
  };

  return (
    <div className="fixed inset-0 z-[10000] pointer-events-none">
      {!minimized && (
        <div
          className="absolute inset-0 bg-slate-900/25 pointer-events-auto"
          onClick={handleDiscard}
          aria-hidden
        />
      )}

      <div
        className={`pointer-events-auto absolute right-4 bottom-4 w-[min(560px,calc(100vw-2rem))] bg-white rounded-t-2xl rounded-b-xl shadow-[0_12px_48px_rgba(15,23,42,0.28)] border border-slate-200 overflow-hidden flex flex-col transition-all ${
          minimized ? 'h-12' : 'h-[min(580px,calc(100vh-3rem))]'
        }`}
        role="dialog"
        aria-label="Compose email"
      >
        <div className="bg-[#404040] text-white px-4 py-2.5 flex items-center justify-between shrink-0">
          <p className="text-sm font-semibold tracking-tight truncate">
            {minimized ? `New message — ${target.name}` : 'New Message'}
          </p>
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() => setMinimized((v) => !v)}
              className="p-1.5 rounded hover:bg-white/15 transition"
              aria-label={minimized ? 'Expand' : 'Minimize'}
              title={minimized ? 'Expand' : 'Minimize'}
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleDiscard}
              className="p-1.5 rounded hover:bg-white/15 transition"
              aria-label="Close"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {!minimized && (
          <>
            <div className="flex flex-col flex-1 min-h-0">
              <div className="border-b border-slate-200 px-4 py-2 flex items-center gap-3 text-sm">
                <span className="text-slate-400 w-10 shrink-0">From</span>
                <span className="text-slate-700 truncate">{fromLabel}</span>
              </div>
              <div className="border-b border-slate-200 px-4 py-2 flex items-center gap-3 text-sm">
                <span className="text-slate-400 w-10 shrink-0">To</span>
                <input
                  type="email"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="flex-1 min-w-0 outline-none text-slate-800 bg-transparent"
                  autoComplete="off"
                />
                <span className="hidden sm:inline text-[11px] text-slate-400 truncate max-w-[140px]" title={target.name}>
                  {target.name}
                </span>
              </div>
              <div className="border-b border-slate-200 px-4 py-2 flex items-center gap-3 text-sm">
                <span className="text-slate-400 w-10 shrink-0">Subject</span>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="flex-1 min-w-0 outline-none text-slate-800 bg-transparent font-medium"
                  placeholder="Subject"
                />
              </div>

              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="flex-1 min-h-[180px] w-full resize-none px-4 py-3 text-sm text-slate-800 outline-none leading-relaxed"
                placeholder="Write your message…"
                spellCheck
              />

              {error && (
                <div className="px-4 pb-2">
                  <p className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                    {error}
                  </p>
                </div>
              )}

              {openedHint ? (
                <div className="px-4 pb-2">
                  <p className="text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                    {openedHint}
                  </p>
                </div>
              ) : (
                <p className="px-4 pb-2 text-[11px] text-slate-500">
                  This app cannot send email by itself. Open Gmail (or your mail app), then click{' '}
                  <span className="font-semibold text-slate-700">Send</span> there to deliver the message.
                </p>
              )}
            </div>

            <div className="px-4 py-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 shrink-0 bg-slate-50/80">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenGmail}
                  className="inline-flex items-center gap-2 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] text-white text-sm font-semibold px-5 py-2 shadow-sm transition active:scale-[0.98]"
                >
                  <Send className="w-3.5 h-3.5" />
                  Open in Gmail
                </button>
                <button
                  type="button"
                  onClick={handleOpenMailApp}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold px-3.5 py-2 transition"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Mail app
                </button>
              </div>
              <button
                type="button"
                onClick={handleDiscard}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800 px-2 py-1"
              >
                {openedHint ? 'Done' : 'Discard'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
