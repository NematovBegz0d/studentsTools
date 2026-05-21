// EduBot — Service sheet (real implementations)

const { useState: useS, useEffect: useE, useRef: useR } = React;

// ─── File dropzone (real file input) ────────────────────────────
function Dropzone({ accept, multi, t, onPick }) {
  const [picked, setPicked] = useS(null); // File | File[]
  const [dragOver, setDragOver] = useS(false);
  const inputRef = useR(null);

  const handleFiles = (fileList) => {
    const arr = Array.from(fileList);
    if (!arr.length) return;
    const result = multi ? arr : arr[0];
    setPicked(result);
    onPick(result);
  };

  const label = multi
    ? (Array.isArray(picked) ? `${picked.length} ta fayl tanlandi` : null)
    : (picked?.name ?? null);

  const size = multi
    ? (Array.isArray(picked) ? (picked.reduce((s, f) => s + f.size, 0) / 1024).toFixed(0) + ' KB' : null)
    : (picked ? (picked.size / 1024).toFixed(0) + ' KB' : null);

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={!!multi}
        style={{ display: 'none' }}
        onChange={e => handleFiles(e.target.files)}
      />
      <button
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        style={{
          width: '100%', minHeight: 160, padding: 22,
          background: dragOver ? 'rgba(139,92,246,0.08)' : 'rgba(255,255,255,0.03)',
          border: `1.5px dashed ${dragOver ? '#8b5cf6' : 'rgba(255,255,255,0.16)'}`,
          borderRadius: 18, cursor: 'pointer',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 8, transition: 'all 0.2s', font: 'inherit',
        }}
      >
        <div style={{
          width: 48, height: 48, borderRadius: 14,
          background: label ? 'rgba(34,197,94,0.16)' : 'rgba(139,92,246,0.16)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4,
        }}>
          {label ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M5 12l4 4L19 6" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M12 4v12m0 0l-5-5m5 5l5-5M5 20h14" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>
        {label ? (
          <>
            <div style={{ color: '#fff', fontSize: 13.5, fontWeight: 600, textAlign: 'center', wordBreak: 'break-all' }}>
              {label}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11.5 }}>{size}</div>
          </>
        ) : (
          <>
            <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{t.sheetUpload}</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>{t.sheetUploadSub}</div>
            {accept && (
              <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10.5, marginTop: 4 }}>
                {accept.split(',').map(s => s.trim().toUpperCase()).join(' · ')}
              </div>
            )}
          </>
        )}
      </button>
    </div>
  );
}

// ─── Text input box ──────────────────────────────────────────────
function TextInputBox({ t, placeholder, onChange }) {
  const [val, setVal] = useS('');
  return (
    <textarea
      value={val}
      onChange={e => { setVal(e.target.value); onChange(e.target.value); }}
      placeholder={placeholder || t.sheetTextPlaceholder}
      style={{
        width: '100%', minHeight: 120,
        background: 'rgba(255,255,255,0.04)',
        border: '0.5px solid rgba(255,255,255,0.10)',
        borderRadius: 16, padding: 14,
        color: '#fff', fontSize: 14, fontFamily: 'inherit',
        resize: 'vertical', outline: 'none', lineHeight: 1.5,
        boxSizing: 'border-box',
      }}
    />
  );
}

// ─── Processing animation ────────────────────────────────────────
function Processing({ t, accent }) {
  const [pct, setPct] = useS(0);

  useE(() => {
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / 2000);
      setPct(Math.round((1 - Math.pow(1 - p, 2)) * 95));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div style={{ padding: '8px 0 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
      <div style={{ position: 'relative', width: 110, height: 110 }}>
        <svg width="110" height="110" viewBox="0 0 110 110" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="55" cy="55" r="48" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6"/>
          <circle cx="55" cy="55" r="48" fill="none" stroke={accent} strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 48}
            strokeDashoffset={(2 * Math.PI * 48) * (1 - pct / 100)}
            style={{ transition: 'stroke-dashoffset 0.3s linear', filter: `drop-shadow(0 0 8px ${accent}80)` }}
          />
        </svg>
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 26, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
        }}>{pct}%</div>
      </div>
      <div style={{ color: '#fff', fontSize: 15, fontWeight: 600 }}>{t.sheetProcessing}</div>
    </div>
  );
}

// ─── Shared: send blob to bot ────────────────────────────────────
async function sendToBot(blob, filename, onToast) {
  const userId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  const backendUrl = window.BACKEND_URL;
  if (!userId) { onToast('❌ Telegram orqali kirish kerak'); return false; }
  if (!backendUrl) { onToast('❌ Backend ulanmagan'); return false; }
  const form = new FormData();
  form.append('user_id', String(userId));
  form.append('filename', filename);
  form.append('file', blob, filename);
  const r = await fetch(`${backendUrl}/api/send-file`, { method: 'POST', body: form });
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.detail || r.statusText); }
  return true;
}

// ─── Result: file download ───────────────────────────────────────
function ResultFile({ t, accent, result, onAgain, onClose, onToast }) {
  const { useState: uS2 } = React;
  const ext = (result.filename || 'result').split('.').pop();
  const base = (result.filename || 'result').replace(/\.[^.]+$/, '');
  const [name, setName] = uS2(base);
  const [sending, setSending] = uS2(false);

  const finalName = () => (name.trim() || base) + '.' + ext;

  const download = () => {
    const url = URL.createObjectURL(result.blob);
    const a = document.createElement('a');
    a.href = url; a.download = finalName();
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    onToast(t.sheetReady);
  };

  const handleSendToBot = async () => {
    setSending(true);
    try {
      const ok = await sendToBot(result.blob, finalName(), onToast);
      if (ok) onToast('✅ Fayl botga yuborildi!');
    } catch (e) {
      onToast('❌ ' + e.message);
    } finally {
      setSending(false);
    }
  };

  const sizeMB = (result.blob.size / 1024 / 1024).toFixed(2);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
      <SuccessRing />
      <div style={{ textAlign: 'center' }}>
        <div style={{ color: '#fff', fontSize: 18, fontWeight: 700 }}>{t.sheetReady}</div>
        {result.info && (
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11.5, marginTop: 4, whiteSpace: 'pre-wrap', textAlign: 'left', maxHeight: 80, overflowY: 'auto' }}>
            {result.info}
          </div>
        )}
      </div>
      <div style={{
        width: '100%', padding: '12px 14px', borderRadius: 14,
        background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: 'rgba(34,197,94,0.16)', border: '0.5px solid rgba(34,197,94,0.28)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#4ade80" strokeWidth="2"/>
            <path d="M14 2v6h6" stroke="#4ade80" strokeWidth="2"/>
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                color: '#fff', fontSize: 13, fontWeight: 600, minWidth: 0,
                borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: 1,
              }}
            />
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, flexShrink: 0 }}>.{ext}</span>
          </div>
          <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 3 }}>{sizeMB} MB</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, width: '100%' }}>
        <Button variant="secondary" full onClick={onAgain}>{t.sheetAgain}</Button>
        <Button variant="secondary" full onClick={handleSendToBot} disabled={sending}>
          {sending ? '⏳' : '📨'}
        </Button>
        <Button variant="primary" accent={accent} full onClick={download}>{t.sheetDownload}</Button>
      </div>
    </div>
  );
}

// ─── Result: text display ────────────────────────────────────────
function ResultText({ t, accent, result, onAgain, onClose, onToast }) {
  const copy = () => {
    navigator.clipboard?.writeText(result.content).then(() => onToast('Nusxalandi!')).catch(() => {});
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
      <SuccessRing />
      <div style={{ color: '#fff', fontSize: 17, fontWeight: 700 }}>{t.sheetReady}</div>
      <div style={{
        width: '100%', maxHeight: 220, overflowY: 'auto',
        background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.10)',
        borderRadius: 14, padding: 14,
        color: '#e5e5ff', fontSize: 13.5, lineHeight: 1.6, whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>{result.content}</div>
      <div style={{ display: 'flex', gap: 10, width: '100%' }}>
        <Button variant="secondary" full onClick={onAgain}>{t.sheetAgain}</Button>
        <Button variant="primary" accent={accent} full onClick={copy}>{t.sheetCopy}</Button>
      </div>
    </div>
  );
}

// ─── Result: image display ───────────────────────────────────────
function ResultImage({ t, accent, result, onAgain, onToast }) {
  const { useState: uS3 } = React;
  const ext = (result.filename || 'result.png').split('.').pop();
  const base = (result.filename || 'result').replace(/\.[^.]+$/, '');
  const [name, setName] = uS3(base);
  const [sending, setSending] = uS3(false);

  const finalName = () => (name.trim() || base) + '.' + ext;

  const download = () => {
    const a = document.createElement('a');
    a.href = result.dataUrl;
    a.download = finalName();
    a.click();
    onToast(t.sheetReady);
  };

  const handleSendToBot = async () => {
    setSending(true);
    try {
      const res = await fetch(result.dataUrl);
      const blob = await res.blob();
      const ok = await sendToBot(blob, finalName(), onToast);
      if (ok) onToast('✅ Rasm botga yuborildi!');
    } catch (e) {
      onToast('❌ ' + e.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
      <img
        src={result.dataUrl}
        style={{ maxWidth: '100%', maxHeight: 220, borderRadius: 12, border: '0.5px solid rgba(255,255,255,0.1)' }}
      />
      <div style={{
        width: '100%', padding: '10px 14px', borderRadius: 12,
        background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            color: '#fff', fontSize: 13, fontWeight: 600, minWidth: 0,
            borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: 1,
          }}
        />
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, flexShrink: 0 }}>.{ext}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, width: '100%' }}>
        <Button variant="secondary" full onClick={onAgain}>{t.sheetAgain}</Button>
        <Button variant="secondary" full onClick={handleSendToBot} disabled={sending}>
          {sending ? '⏳' : '📨'}
        </Button>
        <Button variant="primary" accent={accent} full onClick={download}>{t.sheetDownload}</Button>
      </div>
    </div>
  );
}

// ─── Shared success ring ─────────────────────────────────────────
function SuccessRing() {
  return (
    <div style={{
      width: 72, height: 72, borderRadius: '50%',
      background: 'rgba(34,197,94,0.15)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
    }}>
      <div style={{
        position: 'absolute', inset: -8, borderRadius: '50%',
        border: '2px solid rgba(34,197,94,0.2)',
        animation: 'pulse 1.4s ease-out infinite',
      }} />
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
        <path d="M5 12l5 5L20 7" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  );
}

// ─── Premium lock ────────────────────────────────────────────────
function LockedState({ t, accent, onSubscribe, onClose }) {
  return (
    <div style={{ padding: '8px 0 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <div style={{
        width: 78, height: 78, borderRadius: '50%',
        background: 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(245,158,11,0.05))',
        border: '0.5px solid rgba(245,158,11,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
          <rect x="5" y="11" width="14" height="10" rx="2" stroke="#fbbf24" strokeWidth="2"/>
          <path d="M8 11V8a4 4 0 1 1 8 0v3" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </div>
      <div style={{ textAlign: 'center', maxWidth: 280 }}>
        <div style={{ color: '#fff', fontSize: 18, fontWeight: 700, marginBottom: 6 }}>{t.sheetLockedTitle}</div>
        <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, lineHeight: 1.45 }}>{t.sheetLockedSub}</div>
      </div>
      <div style={{ display: 'flex', gap: 10, width: '100%', marginTop: 4 }}>
        <Button variant="secondary" full onClick={onClose}>{t.sheetCancel}</Button>
        <Button variant="primary" accent="#f59e0b" full onClick={onSubscribe}>{t.subscribe}</Button>
      </div>
    </div>
  );
}

// ─── Text input placeholder per service ──────────────────────────
const TEXT_HINTS = {
  translit:  'Matn kiriting (lotin yoki kirill)',
  readtime:  'O\'qish vaqtini hisoblash uchun matn kiriting...',
  deadline:  'Sana kiriting: 31.12.2025 yoki 2025-12-31',
  stats:     'Raqamlar kiriting: 4 7 2 9 1 5',
  equation:  'Ifoda kiriting: 2^10, sqrt(144), sin(pi/2)',
  graph:     'Funksiya: sin(x), x^2, cos(x)*x+1',
  translate: '1-qator: tarjima qilinadigan matn\n2-qator: til kodi (en, ru, tr, de...)',
  wiki:      'Maqola nomi kiriting (uz, ru, en da)',
  books:     'Kitob nomi yoki muallif',
  qr:        'QR kod uchun matn yoki URL',
  cert:      '1-qator: Ism Familiya\n2-qator: Kurs nomi',
  schedule:  'Har qatorda bir dars: Dushanba: Matematika 9:00',
  pdflock:   'Parol kiriting',
  watermark: 'Watermark matni (bo\'sh qoldirilsa EduBot yoziladi)',
};

// ─── Main service sheet ──────────────────────────────────────────
function ServiceSheet({ service, isPremium, t, accent, onClose, onToast, onGoToPlans }) {
  const [step, setStep] = useS(isPremium ? 'locked' : 'input');
  const [inputData, setInputData] = useS(null);
  const [hasInput, setHasInput] = useS(false);
  const [result, setResult] = useS(null);

  const meta = isPremium ? t.p[service.id] : t.s[service.id];
  if (!meta) return null;

  const acceptText = !service.accept;

  const start = async () => {
    setStep('processing');
    try {
      const handler = window.SERVICE_HANDLERS?.[service.id];
      if (!handler) {
        setResult({ type: 'text', content: '⚠️ Bu xizmat tez kunda qo\'shiladi.' });
        setStep('done');
        return;
      }

      let arg = {};
      if (acceptText) {
        arg = { text: inputData || '' };
      } else if (service.multi) {
        arg = { files: Array.isArray(inputData) ? inputData : [inputData], file: Array.isArray(inputData) ? inputData[0] : inputData, text: '' };
      } else {
        arg = { file: inputData, text: '' };
      }

      const res = await Promise.resolve(handler(arg));
      setResult(res);
      setStep('done');
    } catch (err) {
      console.error('[ServiceSheet]', err);
      setResult({ type: 'text', content: `❌ Xatolik: ${err.message}` });
      setStep('done');
    }
  };

  const reset = () => {
    setStep('input');
    setInputData(null);
    setHasInput(false);
    setResult(null);
  };

  const catColor = CAT_COLOR[service.cat] || '#a78bfa';
  const iconColor = isPremium ? PREMIUM_COLOR : catColor;

  return (
    <div style={{ padding: '6px 20px 20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <div style={{
          width: 50, height: 50, borderRadius: 14,
          background: isPremium ? 'rgba(245,158,11,0.18)' : `${catColor}26`,
          border: `0.5px solid ${isPremium ? 'rgba(245,158,11,0.32)' : catColor + '40'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name={service.id} size={22} color={iconColor} strokeWidth={1.8} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#fff', fontSize: 17, fontWeight: 700, letterSpacing: -0.2 }}>{meta.name}</div>
          <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12.5, marginTop: 2 }}>{meta.desc}</div>
        </div>
      </div>

      {/* Body */}
      {step === 'locked' && (
        <LockedState t={t} accent={accent}
          onSubscribe={() => { onClose(); onGoToPlans(); }}
          onClose={onClose} />
      )}

      {step === 'input' && (
        <>
          {acceptText ? (
            <TextInputBox
              t={t}
              placeholder={TEXT_HINTS[service.id] || t.sheetTextPlaceholder}
              onChange={v => { setInputData(v); setHasInput(v.trim().length > 0); }}
            />
          ) : (
            <Dropzone accept={service.accept} multi={service.multi} t={t}
              onPick={data => { setInputData(data); setHasInput(true); }} />
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <Button variant="secondary" full onClick={onClose}>{t.sheetCancel}</Button>
            <Button variant="primary" accent={accent} full disabled={!hasInput} onClick={start}>
              {t.sheetStart}
            </Button>
          </div>
        </>
      )}

      {step === 'processing' && <Processing t={t} accent={accent} />}

      {step === 'done' && result && (
        <>
          {result.type === 'file' && (
            <ResultFile t={t} accent={accent} result={result}
              onAgain={reset} onClose={onClose} onToast={onToast} />
          )}
          {result.type === 'text' && (
            <ResultText t={t} accent={accent} result={result}
              onAgain={reset} onClose={onClose} onToast={onToast} />
          )}
          {result.type === 'image' && (
            <ResultImage t={t} accent={accent} result={result}
              onAgain={reset} onToast={onToast} />
          )}
          {result.type === 'premium' && (
            <LockedState t={t} accent={accent}
              onSubscribe={() => { onClose(); onGoToPlans(); }}
              onClose={onClose} />
          )}
        </>
      )}
    </div>
  );
}

Object.assign(window, { ServiceSheet, Dropzone, TextInputBox, Processing, LockedState });
