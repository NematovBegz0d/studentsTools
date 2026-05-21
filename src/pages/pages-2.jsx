// EduBot — Plans + Profile pages + PaymentSheet

const { useState: u_S2, useEffect: u_E2 } = React;

// ─────────────────────────────────────────────────────────────
// PLANS
// ─────────────────────────────────────────────────────────────
function PlansPage({ t, accent, currentPlan, onSubscribe }) {
  const plans = [
    {
      id: 'free',
      name: t.planFree,
      price: '0',
      iconName: 'gift',
      gradient: 'linear-gradient(145deg, rgba(34,197,94,0.10), rgba(255,255,255,0.02))',
      border: 'rgba(34,197,94,0.20)',
      color: '#4ade80',
      features: [
        '28 ta bepul xizmat',
        'Kuniga 3 ta AI so\'rov',
        '10 MB fayl limiti',
        'Audio: 5 daq/oy',
      ],
    },
    {
      id: 'standard',
      name: t.planStandard,
      price: '59,900',
      iconName: 'zap',
      popular: true,
      gradient: 'linear-gradient(145deg, rgba(139,92,246,0.16), rgba(59,130,246,0.08))',
      border: 'rgba(139,92,246,0.30)',
      color: '#a78bfa',
      features: [
        '28 ta bepul xizmat',
        'Oyiga 20 ta AI so\'rov',
        '30 MB fayl limiti',
        '60 daqiqa audio/oy',
        'DeepL tarjima',
        'Tezroq javob',
      ],
    },
    {
      id: 'premium',
      name: t.planPremium,
      price: '99,900',
      iconName: 'crown',
      gradient: 'linear-gradient(145deg, rgba(245,158,11,0.16), rgba(239,68,68,0.08))',
      border: 'rgba(245,158,11,0.30)',
      color: '#fbbf24',
      features: [
        'Cheksiz AI so\'rovlar',
        '50 MB fayl limiti',
        'Cheksiz audio',
        'Rasm yaratish (DALL·E 3)',
        'PPTX generator',
        'Maksimal tezlik',
        'Premium qo\'llab-quvvatlash',
      ],
    },
  ];

  return (
    <div style={{ paddingBottom: 110 }}>
      <PageHeader title={t.tabs.plans} sub="Tarifni tanlang" />

      <div style={{ padding: '8px 18px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {plans.map(p => {
          const isCurrent = currentPlan === p.id;
          return (
            <div key={p.id} style={{
              position: 'relative', overflow: 'hidden',
              padding: 18, borderRadius: 22,
              background: p.gradient,
              border: `0.5px solid ${p.border}`,
            }}>
              {p.popular && (
                <div style={{
                  position: 'absolute', top: 14, right: 14,
                  padding: '4px 9px', borderRadius: 99,
                  background: 'linear-gradient(90deg, #ef4444, #f59e0b)',
                  color: '#fff', fontSize: 9.5, fontWeight: 800,
                  letterSpacing: 0.4,
                }}>{t.popular}</div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <div style={{
                  width: 46, height: 46, borderRadius: 13,
                  background: `${p.color}28`,
                  border: `0.5px solid ${p.color}40`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon name={p.iconName} size={22} color={p.color} strokeWidth={1.8} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#fff', fontSize: 16, fontWeight: 700, letterSpacing: -0.2 }}>
                    {p.name}
                  </div>
                  <div style={{ marginTop: 2 }}>
                    <span style={{ color: p.color, fontSize: 20, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                      {p.price}
                    </span>
                    <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, marginLeft: 4 }}>
                      {t.soum}{p.id !== 'free' && t.perMonth}
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                {p.features.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: 99,
                      background: `${p.color}26`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                        <path d="M5 12l4 4L19 6" stroke={p.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <span style={{ color: 'rgba(255,255,255,0.78)', fontSize: 12.5 }}>{f}</span>
                  </div>
                ))}
              </div>

              {isCurrent ? (
                <div style={{
                  padding: '11px 16px', borderRadius: 12,
                  background: 'rgba(255,255,255,0.06)',
                  border: '0.5px solid rgba(255,255,255,0.12)',
                  color: 'rgba(255,255,255,0.7)',
                  fontSize: 13, fontWeight: 600, textAlign: 'center',
                }}>✓ {t.currentPlan}</div>
              ) : (
                <button
                  className="press"
                  onClick={() => onSubscribe(p.id)}
                  style={{
                    width: '100%', padding: '11px 16px', borderRadius: 12,
                    background: p.id === 'free' ? 'rgba(255,255,255,0.06)' : `linear-gradient(135deg, ${p.color}, ${p.color}cc)`,
                    color: p.id === 'free' ? 'rgba(255,255,255,0.7)' : '#fff',
                    border: p.id === 'free' ? '0.5px solid rgba(255,255,255,0.12)' : 'none',
                    fontSize: 13.5, fontWeight: 700, cursor: 'pointer', font: 'inherit',
                    boxShadow: p.id !== 'free' ? `0 8px 22px ${p.color}40` : 'none',
                  }}>{t.choosePlan}</button>
              )}
            </div>
          );
        })}
      </div>

      {/* Payment methods */}
      <div style={{ padding: '22px 18px 0' }}>
        <div style={{
          color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10,
        }}>
          {t.paymentMethods}
        </div>
        <div style={{
          display: 'flex', gap: 8,
        }}>
          {[
            { name: 'Payme', bg: 'linear-gradient(135deg, #00d4cc, #00b1ab)', logo: 'P' },
            { name: 'Click', bg: 'linear-gradient(135deg, #4ec5f1, #2196f3)', logo: 'C' },
            { name: 'Uzcard', bg: 'linear-gradient(135deg, #18b3ee, #0e8bc7)', logo: 'U' },
          ].map(m => (
            <div key={m.name} style={{
              flex: 1, padding: '14px 8px', borderRadius: 14,
              background: 'rgba(255,255,255,0.03)',
              border: '0.5px solid rgba(255,255,255,0.08)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 9,
                background: m.bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 800, fontSize: 16,
              }}>{m.logo}</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: 600 }}>
                {m.name}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PROFILE
// ─────────────────────────────────────────────────────────────
function ProfilePage({ t, accent, lang, setLang, currentPlan, onGoTo, user }) {
  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || t.studentRole;
  const username = user?.username ? `@${user.username}` : '';
  const planLabel = currentPlan === 'free' ? t.planFree : currentPlan === 'standard' ? t.planStandard : t.planPremium;
  const planColor = currentPlan === 'free' ? '#4ade80' : currentPlan === 'standard' ? '#a78bfa' : '#fbbf24';
  const planIconName = currentPlan === 'free' ? 'gift' : currentPlan === 'standard' ? 'zap' : 'crown';

  const usage = [
    { label: 'AI so\'rovlar', value: 1, max: 3, color: '#a78bfa' },
    { label: 'Konvertatsiya', value: 7, max: 50, color: '#4ade80' },
    { label: 'Tarjima', value: 12, max: 100, color: '#60a5fa' },
  ];

  return (
    <div style={{ paddingBottom: 110 }}>
      <PageHeader title={t.tabs.profile} />

      {/* Profile card */}
      <div style={{ padding: '4px 18px 16px' }}>
        <div style={{
          padding: 18, borderRadius: 22,
          background: 'linear-gradient(135deg, rgba(139,92,246,0.16), rgba(59,130,246,0.10))',
          border: '0.5px solid rgba(139,92,246,0.22)',
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <Avatar name={fullName} size={64} ring accent={accent} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: '#fff', fontSize: 18, fontWeight: 700, letterSpacing: -0.2 }}>
              {fullName}
            </div>
            {username && (
              <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12.5, marginTop: 1 }}>
                {username}
              </div>
            )}
            <div style={{ marginTop: 8 }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 10px', borderRadius: 99,
                background: `${planColor}20`,
                border: `0.5px solid ${planColor}40`,
                color: planColor,
                fontSize: 10.5, fontWeight: 700, letterSpacing: 0.2,
                textTransform: 'uppercase',
              }}>
                <Icon name={planIconName} size={11} color={planColor} strokeWidth={2} />
                {planLabel}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Today's usage */}
      <div style={{ padding: '0 18px 16px' }}>
        <div style={{
          color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10,
        }}>
          {t.todayUsage}
        </div>
        <div style={{
          padding: 16, borderRadius: 18,
          background: 'rgba(255,255,255,0.03)',
          border: '0.5px solid rgba(255,255,255,0.06)',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          {usage.map((u, i) => (
            <div key={i}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12.5, fontWeight: 500 }}>{u.label}</span>
                <span style={{ color: '#fff', fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {u.value}<span style={{ color: 'rgba(255,255,255,0.4)' }}>/{u.max}</span>
                </span>
              </div>
              <ProgressBar value={u.value} max={u.max} accent={u.color} height={5} />
            </div>
          ))}
        </div>
      </div>

      {/* Language picker */}
      <div style={{ padding: '0 18px 16px' }}>
        <div style={{
          color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10,
        }}>{t.settingsLang}</div>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
        }}>
          {[
            { id: 'uz', label: '🇺🇿 O\'zbek' },
            { id: 'ru', label: '🇷🇺 Русский' },
            { id: 'en', label: '🇬🇧 English' },
          ].map(l => {
            const active = lang === l.id;
            return (
              <button
                key={l.id}
                className="press"
                onClick={() => setLang(l.id)}
                style={{
                  padding: '11px 4px', borderRadius: 12,
                  background: active ? 'rgba(139,92,246,0.18)' : 'rgba(255,255,255,0.03)',
                  border: `0.5px solid ${active ? 'rgba(139,92,246,0.40)' : 'rgba(255,255,255,0.06)'}`,
                  color: active ? '#fff' : 'rgba(255,255,255,0.7)',
                  fontSize: 12, fontWeight: active ? 600 : 500,
                  cursor: 'pointer', font: 'inherit',
                }}>{l.label}</button>
            );
          })}
        </div>
      </div>

      {/* Settings list */}
      <div style={{ padding: '0 18px 16px' }}>
        <div style={{
          borderRadius: 18, overflow: 'hidden',
          background: 'rgba(255,255,255,0.03)',
          border: '0.5px solid rgba(255,255,255,0.06)',
        }}>
          {[
            { iconName: 'bell',      color: '#60a5fa', label: t.settingsNotif, sub: 'On' },
            { iconName: 'chart-bar', color: '#a78bfa', label: t.settingsStats, sub: null },
            { iconName: 'help',      color: '#34d399', label: t.settingsHelp,  sub: null },
          ].map((row, i, arr) => (
            <button key={i} className="press" style={{
              width: '100%', textAlign: 'left',
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '14px 14px',
              background: 'transparent', border: 'none',
              borderBottom: i < arr.length - 1 ? '0.5px solid rgba(255,255,255,0.06)' : 'none',
              color: '#fff', font: 'inherit', cursor: 'pointer',
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 9,
                background: `${row.color}1f`,
                border: `0.5px solid ${row.color}33`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon name={row.iconName} size={16} color={row.color} strokeWidth={1.8} />
              </div>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{row.label}</span>
              {row.sub && <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>{row.sub}</span>}
              <svg width="7" height="12" viewBox="0 0 8 14">
                <path d="M1 1l6 6-6 6" stroke="rgba(255,255,255,0.3)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          ))}
        </div>
      </div>

      {/* Upgrade banner (if not premium) */}
      {currentPlan !== 'premium' && (
        <div style={{ padding: '0 18px 14px' }}>
          <button
            onClick={() => onGoTo('plans')}
            className="press"
            style={{
              width: '100%', textAlign: 'left',
              position: 'relative', overflow: 'hidden',
              padding: 16, borderRadius: 18,
              background: 'linear-gradient(120deg, #f59e0b 0%, #ef4444 100%)',
              border: 'none', color: '#fff', cursor: 'pointer',
              font: 'inherit',
              display: 'flex', alignItems: 'center', gap: 12,
              boxShadow: '0 10px 26px rgba(245,158,11,0.25)',
            }}>
            <div style={{
              width: 40, height: 40, borderRadius: 11,
              background: 'rgba(255,255,255,0.20)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon name="crown" size={20} color="#fff" strokeWidth={2} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{t.upgradeToPremium}</div>
              <div style={{ fontSize: 11.5, opacity: 0.9, marginTop: 1 }}>Cheksiz AI · Rasm · Audio</div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M5 12h14M13 6l6 6-6 6" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      )}

      {/* Logout */}
      <div style={{ padding: '0 18px' }}>
        <button className="press" style={{
          width: '100%', padding: '13px 16px', borderRadius: 14,
          background: 'rgba(239,68,68,0.08)',
          border: '0.5px solid rgba(239,68,68,0.16)',
          color: '#fb7185', fontSize: 13.5, fontWeight: 600,
          cursor: 'pointer', font: 'inherit',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <Icon name="logout" size={15} color="currentColor" strokeWidth={2} />
          {t.logout}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PAYMENT SHEET
// ─────────────────────────────────────────────────────────────
function PaymentSheet({ t, planId, accent, onClose, onSuccess }) {
  const [step, setStep] = u_S2('choose'); // choose → processing → success
  const [method, setMethod] = u_S2('payme');

  const planMeta = {
    free:     { name: t.planFree,     price: 0,     color: '#4ade80' },
    standard: { name: t.planStandard, price: 29900, color: '#a78bfa' },
    premium:  { name: t.planPremium,  price: 99900, color: '#fbbf24' },
  }[planId];

  if (!planMeta) return null;

  const pay = () => {
    setStep('processing');
    setTimeout(() => setStep('success'), 2400);
  };

  return (
    <div style={{ padding: '6px 20px 18px' }}>
      {step === 'choose' && (
        <>
          <div style={{ textAlign: 'center', marginBottom: 18 }}>
            <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12.5, marginBottom: 4 }}>
              {t.paymentTitle}
            </div>
            <div style={{ color: '#fff', fontSize: 22, fontWeight: 800, letterSpacing: -0.4 }}>
              {planMeta.price.toLocaleString('ru-RU')} <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14, fontWeight: 600 }}>{t.soum}{t.perMonth}</span>
            </div>
            <div style={{ color: planMeta.color, fontSize: 12.5, fontWeight: 600, marginTop: 4 }}>
              {planMeta.name}
            </div>
          </div>

          <div style={{
            color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10,
          }}>{t.paymentChoose}</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
            {[
              { id: 'payme',  name: 'Payme',  bg: 'linear-gradient(135deg, #00d4cc, #00b1ab)', logo: 'P', fee: '1.5%' },
              { id: 'click',  name: 'Click',  bg: 'linear-gradient(135deg, #4ec5f1, #2196f3)', logo: 'C', fee: '1.2%' },
              { id: 'uzcard', name: 'Uzcard', bg: 'linear-gradient(135deg, #18b3ee, #0e8bc7)', logo: 'U', fee: '1.0%' },
            ].map(m => (
              <button
                key={m.id}
                onClick={() => setMethod(m.id)}
                className="press"
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 14px', borderRadius: 14,
                  background: method === m.id ? 'rgba(139,92,246,0.10)' : 'rgba(255,255,255,0.03)',
                  border: `0.5px solid ${method === m.id ? 'rgba(139,92,246,0.35)' : 'rgba(255,255,255,0.08)'}`,
                  color: '#fff', cursor: 'pointer', font: 'inherit', textAlign: 'left',
                }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: m.bg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontWeight: 800, fontSize: 17,
                }}>{m.logo}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{m.name}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 1 }}>
                    Komissiya {m.fee}
                  </div>
                </div>
                <div style={{
                  width: 20, height: 20, borderRadius: 99,
                  border: `1.5px solid ${method === m.id ? accent : 'rgba(255,255,255,0.18)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {method === m.id && (
                    <div style={{ width: 10, height: 10, borderRadius: 99, background: accent }} />
                  )}
                </div>
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="secondary" full onClick={onClose}>{t.sheetCancel}</Button>
            <Button variant="primary" accent={accent} full onClick={pay}>{t.paymentPay}</Button>
          </div>
        </>
      )}

      {step === 'processing' && (
        <div style={{ padding: '20px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div className="spinner" />
          <div style={{ color: '#fff', fontSize: 15, fontWeight: 600 }}>{t.paymentProcessing}</div>
        </div>
      )}

      {step === 'success' && (
        <div style={{ padding: '14px 0 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 82, height: 82, borderRadius: '50%',
            background: 'rgba(34,197,94,0.16)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative',
          }}>
            <div style={{
              position: 'absolute', inset: -10, borderRadius: '50%',
              border: '2px solid rgba(34,197,94,0.22)',
              animation: 'pulse 1.4s ease-out infinite',
            }} />
            <svg width="42" height="42" viewBox="0 0 24 24" fill="none">
              <path d="M5 12l5 5L20 7" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#fff', fontSize: 18, fontWeight: 700 }}>{t.paymentSuccess}</div>
            <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, marginTop: 4 }}>
              {t.paymentSuccessSub}
            </div>
          </div>
          <Button variant="primary" accent="#22c55e" full
            onClick={() => { onSuccess(planId); onClose(); }}>
            {t.paymentDone}
          </Button>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { PlansPage, ProfilePage, PaymentSheet });
