import { useState, useEffect, useCallback, useMemo } from "react";

// ─── Simulated Database (localStorage-based persistence) ─────────────────────
const DB_KEY = "rifa_numeros_db";

function loadDB() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  const initial = {};
  for (let i = 1; i <= 30000; i++) {
    initial[i] = "disponivel";
  }
  localStorage.setItem(DB_KEY, JSON.stringify(initial));
  return initial;
}

function saveDB(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

// ─── MercadoPago mock integration ────────────────────────────────────────────
async function criarPreferenciaMercadoPago(numeros, total) {
  // In production, replace with real MercadoPago API call to your backend
  // Your backend would call: POST https://api.mercadopago.com/checkout/preferences
  // with your ACCESS_TOKEN
  return {
    id: "mock_preference_" + Date.now(),
    init_point: `https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=mock_${Date.now()}`,
    sandbox_init_point: `https://sandbox.mercadopago.com.br/checkout/v1/redirect?pref_id=mock_${Date.now()}`,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const PAGE_SIZE = 300;
const PRECO = 0.99;
const TOTAL_NUMEROS = 30000;

function padNum(n) {
  return String(n).padStart(5, "0");
}

function statusColor(status) {
  if (status === "disponivel") return "#00e676";
  if (status === "reservado") return "#ff5252";
  return "#ffd600";
}

// ─── Components ───────────────────────────────────────────────────────────────

function Confetti() {
  const pieces = useMemo(() =>
    Array.from({ length: 30 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 2,
      color: ["#ffd600", "#ff5252", "#00e676", "#40c4ff", "#ea80fc"][i % 5],
      size: 6 + Math.random() * 8,
      duration: 2 + Math.random() * 2,
    }))
  , []);

  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 9999 }}>
      {pieces.map(p => (
        <div
          key={p.id}
          style={{
            position: "absolute",
            left: `${p.left}%`,
            top: "-20px",
            width: p.size,
            height: p.size,
            background: p.color,
            borderRadius: Math.random() > 0.5 ? "50%" : "2px",
            animation: `fall ${p.duration}s ${p.delay}s ease-in forwards`,
          }}
        />
      ))}
    </div>
  );
}

function NumberGrid({ db, page, selected, onToggle }) {
  const start = (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, TOTAL_NUMEROS);
  const nums = [];
  for (let i = start; i <= end; i++) nums.push(i);

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(64px, 1fr))",
      gap: 6,
      padding: "16px 0",
    }}>
      {nums.map(n => {
        const status = db[n] || "disponivel";
        const isSel = selected.includes(n);
        const disabled = status === "reservado";
        return (
          <button
            key={n}
            disabled={disabled}
            onClick={() => !disabled && onToggle(n)}
            style={{
              border: isSel ? "2px solid #ffd600" : "1.5px solid rgba(255,255,255,0.12)",
              borderRadius: 8,
              padding: "8px 4px",
              fontSize: 11,
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 700,
              cursor: disabled ? "not-allowed" : "pointer",
              background: isSel
                ? "linear-gradient(135deg,#ffd600,#ff9100)"
                : disabled
                  ? "rgba(255,82,82,0.15)"
                  : "rgba(255,255,255,0.04)",
              color: isSel ? "#0a0a0a" : disabled ? "#ff5252" : "#e0e0e0",
              transition: "all 0.15s ease",
              transform: isSel ? "scale(1.05)" : "scale(1)",
              boxShadow: isSel ? "0 0 12px rgba(255,214,0,0.5)" : "none",
            }}
          >
            {padNum(n)}
          </button>
        );
      })}
    </div>
  );
}

export default function App() {
  const [db, setDb] = useState({});
  const [selected, setSelected] = useState([]);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [step, setStep] = useState("browse"); // browse | form | payment | success
  const [showConfetti, setShowConfetti] = useState(false);
  const [filterStatus, setFilterStatus] = useState("todos");
  const [randomQty, setRandomQty] = useState(1);
  const [loading, setLoading] = useState(false);
  const [prefLink, setPrefLink] = useState("");

  const totalPages = Math.ceil(TOTAL_NUMEROS / PAGE_SIZE);
  const total = (selected.length * PRECO).toFixed(2);

  useEffect(() => {
    setDb(loadDB());
  }, []);

  const stats = useMemo(() => {
    const vals = Object.values(db);
    const disp = vals.filter(v => v === "disponivel").length;
    const res = vals.filter(v => v === "reservado").length;
    return { disp, res };
  }, [db]);

  const toggleNum = useCallback((n) => {
    setSelected(prev =>
      prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n]
    );
  }, []);

  const pickRandom = () => {
    const disponiveis = Object.entries(db)
      .filter(([, v]) => v === "disponivel")
      .map(([k]) => Number(k));
    const shuffled = disponiveis.sort(() => Math.random() - 0.5);
    const picks = shuffled.slice(0, randomQty);
    setSelected(prev => [...new Set([...prev, ...picks])]);
  };

  const handlePay = async () => {
    if (!buyerName || !buyerEmail || !buyerPhone) return;
    setLoading(true);
    try {
      // Reserve numbers in DB
      const newDb = { ...db };
      selected.forEach(n => { newDb[n] = "reservado"; });
      setDb(newDb);
      saveDB(newDb);

      // Call MercadoPago
      const pref = await criarPreferenciaMercadoPago(selected, total);
      setPrefLink(pref.sandbox_init_point);
      setStep("success");
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 4000);
    } catch (e) {
      alert("Erro ao processar pagamento. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSelected([]);
    setStep("browse");
    setBuyerName(""); setBuyerEmail(""); setBuyerPhone("");
  };

  // Search filter
  const searchNum = parseInt(search);
  const searchResult = !isNaN(searchNum) && searchNum >= 1 && searchNum <= TOTAL_NUMEROS
    ? { num: searchNum, status: db[searchNum] || "disponivel" }
    : null;

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(160deg,#0d0d1a 0%,#0a1628 50%,#0d0d1a 100%)",
      color: "#e0e0e0",
      fontFamily: "'Syne', sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=JetBrains+Mono:wght@400;700&display=swap');

        * { box-sizing: border-box; margin: 0; }

        @keyframes fall {
          to { transform: translateY(110vh) rotate(720deg); opacity: 0; }
        }
        @keyframes pulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(255,214,0,0.4); }
          50% { box-shadow: 0 0 0 16px rgba(255,214,0,0); }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0% { background-position: -1000px 0; }
          100% { background-position: 1000px 0; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #111; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }

        input, select {
          background: rgba(255,255,255,0.05);
          border: 1.5px solid rgba(255,255,255,0.12);
          border-radius: 10px;
          color: #e0e0e0;
          padding: 12px 16px;
          font-size: 15px;
          font-family: inherit;
          outline: none;
          transition: border-color 0.2s;
          width: 100%;
        }
        input:focus, select:focus {
          border-color: #ffd600;
          background: rgba(255,214,0,0.05);
        }
        input::placeholder { color: rgba(255,255,255,0.3); }
      `}</style>

      {showConfetti && <Confetti />}

      {/* Hero Header */}
      <header style={{
        background: "linear-gradient(135deg,#1a0a2e,#0d1a3a,#1a1a0a)",
        borderBottom: "1px solid rgba(255,214,0,0.2)",
        padding: "0 24px",
        position: "sticky",
        top: 0,
        zIndex: 100,
        backdropFilter: "blur(20px)",
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: "50%",
              background: "linear-gradient(135deg,#ffd600,#ff9100)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18,
            }}>🎟️</div>
            <span style={{ fontWeight: 800, fontSize: 20, letterSpacing: "-0.5px" }}>
              MEGA<span style={{ color: "#ffd600" }}>RIFA</span>
            </span>
          </div>
          <div style={{ display: "flex", gap: 24, fontSize: 13, fontFamily: "JetBrains Mono, monospace" }}>
            <span>✅ <span style={{ color: "#00e676" }}>{stats.disp.toLocaleString()}</span> disponíveis</span>
            <span>🔒 <span style={{ color: "#ff5252" }}>{stats.res.toLocaleString()}</span> reservados</span>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section style={{
        textAlign: "center",
        padding: "60px 24px 40px",
        position: "relative",
        overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", inset: 0, opacity: 0.04,
          backgroundImage: "radial-gradient(circle, #ffd600 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }} />
        <div style={{ position: "relative" }}>
          <div style={{
            display: "inline-block",
            background: "linear-gradient(135deg,rgba(255,214,0,0.2),rgba(255,145,0,0.1))",
            border: "1px solid rgba(255,214,0,0.3)",
            borderRadius: 100,
            padding: "6px 18px",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 2,
            marginBottom: 20,
            color: "#ffd600",
          }}>🏆 PRÊMIO ESPECIAL AGUARDA VOCÊ</div>

          <h1 style={{
            fontSize: "clamp(36px, 6vw, 72px)",
            fontWeight: 800,
            lineHeight: 1.1,
            letterSpacing: "-2px",
            marginBottom: 16,
            background: "linear-gradient(135deg,#ffffff,#ffd600,#ff9100)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}>
            RIFA<br />30.000 NÚMEROS
          </h1>

          <p style={{ fontSize: 18, color: "rgba(255,255,255,0.6)", marginBottom: 8 }}>
            Escolha seus números da sorte
          </p>
          <p style={{
            fontSize: 28, fontWeight: 800, color: "#ffd600",
            fontFamily: "JetBrains Mono, monospace",
          }}>
            R$ 0,99 cada
          </p>
        </div>
      </section>

      {/* Stats Bar */}
      <div style={{ maxWidth: 900, margin: "0 auto 40px", padding: "0 24px" }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 16,
        }}>
          {[
            { icon: "🎫", label: "Total de Números", value: "30.000" },
            { icon: "💰", label: "Preço por Número", value: "R$ 0,99" },
            { icon: "📊", label: "Vendidos", value: `${((stats.res / TOTAL_NUMEROS) * 100).toFixed(1)}%` },
          ].map(s => (
            <div key={s.label} style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 16,
              padding: "20px",
              textAlign: "center",
              animation: "slideUp 0.5s ease both",
            }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>{s.icon}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#ffd600", fontFamily: "JetBrains Mono, monospace" }}>{s.value}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Progress Bar */}
        <div style={{ marginTop: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>
            <span>Progresso da Rifa</span>
            <span>{stats.res} / 30.000 vendidos</span>
          </div>
          <div style={{ height: 8, background: "rgba(255,255,255,0.06)", borderRadius: 100, overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${(stats.res / TOTAL_NUMEROS) * 100}%`,
              background: "linear-gradient(90deg,#ffd600,#ff9100)",
              borderRadius: 100,
              transition: "width 0.5s ease",
              backgroundSize: "200px 100%",
            }} />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px 80px" }}>

        {step === "success" ? (
          <div style={{ textAlign: "center", padding: "80px 24px", animation: "slideUp 0.5s ease" }}>
            <div style={{ fontSize: 80, marginBottom: 24 }}>🎉</div>
            <h2 style={{ fontSize: 36, fontWeight: 800, marginBottom: 12, color: "#ffd600" }}>Números Reservados!</h2>
            <p style={{ color: "rgba(255,255,255,0.6)", marginBottom: 8 }}>
              {selected.length} números reservados por <strong style={{ color: "#fff" }}>R$ {total}</strong>
            </p>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, marginBottom: 32 }}>
              Seus números: {selected.slice(0, 10).map(padNum).join(", ")}{selected.length > 10 ? ` e mais ${selected.length - 10}...` : ""}
            </p>
            <a
              href={prefLink}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-block",
                background: "linear-gradient(135deg,#009ee3,#0070a8)",
                color: "#fff",
                padding: "16px 40px",
                borderRadius: 12,
                fontWeight: 700,
                fontSize: 18,
                textDecoration: "none",
                marginBottom: 20,
                boxShadow: "0 8px 30px rgba(0,158,227,0.4)",
              }}
            >
              💳 Pagar com Mercado Pago
            </a>
            <br />
            <button
              onClick={handleReset}
              style={{
                background: "none",
                border: "1px solid rgba(255,255,255,0.2)",
                color: "rgba(255,255,255,0.6)",
                padding: "10px 24px",
                borderRadius: 10,
                cursor: "pointer",
                fontFamily: "inherit",
                marginTop: 8,
              }}
            >
              Escolher mais números
            </button>
          </div>
        ) : step === "form" ? (
          <div style={{
            maxWidth: 480,
            margin: "0 auto",
            animation: "slideUp 0.4s ease",
          }}>
            <button
              onClick={() => setStep("browse")}
              style={{
                background: "none", border: "none", color: "#ffd600",
                cursor: "pointer", fontSize: 14, marginBottom: 24,
                display: "flex", alignItems: "center", gap: 6,
                fontFamily: "inherit",
              }}
            >
              ← Voltar
            </button>

            <div style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 20,
              padding: 32,
            }}>
              <h2 style={{ fontWeight: 800, fontSize: 24, marginBottom: 6 }}>Seus dados</h2>
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, marginBottom: 28 }}>
                Preencha para confirmar sua reserva
              </p>

              {/* Order Summary */}
              <div style={{
                background: "rgba(255,214,0,0.08)",
                border: "1px solid rgba(255,214,0,0.2)",
                borderRadius: 12,
                padding: "16px 20px",
                marginBottom: 28,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>Números selecionados</span>
                  <span style={{ fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>{selected.length}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>Total a pagar</span>
                  <span style={{ fontWeight: 800, fontSize: 20, color: "#ffd600", fontFamily: "JetBrains Mono, monospace" }}>
                    R$ {total}
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <label style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 6, display: "block", letterSpacing: 1 }}>NOME COMPLETO</label>
                  <input
                    value={buyerName}
                    onChange={e => setBuyerName(e.target.value)}
                    placeholder="Seu nome"
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 6, display: "block", letterSpacing: 1 }}>WHATSAPP</label>
                  <input
                    value={buyerPhone}
                    onChange={e => setBuyerPhone(e.target.value)}
                    placeholder="(11) 99999-9999"
                    type="tel"
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 6, display: "block", letterSpacing: 1 }}>E-MAIL</label>
                  <input
                    value={buyerEmail}
                    onChange={e => setBuyerEmail(e.target.value)}
                    placeholder="seu@email.com"
                    type="email"
                  />
                </div>
              </div>

              <button
                onClick={handlePay}
                disabled={loading || !buyerName || !buyerEmail || !buyerPhone}
                style={{
                  marginTop: 28,
                  width: "100%",
                  padding: "16px",
                  background: loading ? "rgba(255,255,255,0.1)" : "linear-gradient(135deg,#009ee3,#0070a8)",
                  border: "none",
                  borderRadius: 12,
                  color: "#fff",
                  fontSize: 16,
                  fontWeight: 700,
                  cursor: loading ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  transition: "all 0.2s",
                  boxShadow: loading ? "none" : "0 8px 24px rgba(0,158,227,0.3)",
                }}
              >
                {loading ? (
                  <>
                    <div style={{ width: 18, height: 18, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                    Processando...
                  </>
                ) : (
                  <>💳 Pagar R$ {total} com Mercado Pago</>
                )}
              </button>

              <div style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                gap: 8, marginTop: 16, color: "rgba(255,255,255,0.3)", fontSize: 12,
              }}>
                🔒 Pagamento seguro via Mercado Pago
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Search + Quick Pick */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
              marginBottom: 24,
            }}>
              <div>
                <label style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 8, display: "block", letterSpacing: 1 }}>🔍 BUSCAR NÚMERO</label>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Digite o número (1-30000)"
                  type="number"
                  min={1}
                  max={30000}
                />
                {searchResult && (
                  <div style={{
                    marginTop: 10,
                    padding: "10px 16px",
                    borderRadius: 10,
                    background: searchResult.status === "disponivel" ? "rgba(0,230,118,0.1)" : "rgba(255,82,82,0.1)",
                    border: `1px solid ${statusColor(searchResult.status)}30`,
                    fontSize: 14,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}>
                    <span>Número <strong style={{ fontFamily: "JetBrains Mono, monospace" }}>{padNum(searchResult.num)}</strong></span>
                    <span style={{ color: statusColor(searchResult.status), fontWeight: 700 }}>
                      {searchResult.status === "disponivel" ? "✅ Disponível" : "🔒 Reservado"}
                    </span>
                    {searchResult.status === "disponivel" && (
                      <button
                        onClick={() => toggleNum(searchResult.num)}
                        style={{
                          background: selected.includes(searchResult.num) ? "rgba(255,214,0,0.2)" : "rgba(0,230,118,0.2)",
                          border: "none",
                          borderRadius: 8,
                          color: selected.includes(searchResult.num) ? "#ffd600" : "#00e676",
                          padding: "4px 12px",
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: 700,
                          fontFamily: "inherit",
                        }}
                      >
                        {selected.includes(searchResult.num) ? "Remover" : "Adicionar"}
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 8, display: "block", letterSpacing: 1 }}>⚡ ESCOLHA ALEATÓRIA</label>
                <div style={{ display: "flex", gap: 10 }}>
                  <input
                    type="number"
                    value={randomQty}
                    min={1}
                    max={100}
                    onChange={e => setRandomQty(Math.min(100, Math.max(1, parseInt(e.target.value) || 1)))}
                    style={{ width: 80, flexShrink: 0 }}
                  />
                  <button
                    onClick={pickRandom}
                    style={{
                      flex: 1,
                      background: "linear-gradient(135deg,rgba(255,214,0,0.15),rgba(255,145,0,0.1))",
                      border: "1px solid rgba(255,214,0,0.3)",
                      borderRadius: 10,
                      color: "#ffd600",
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      fontSize: 14,
                    }}
                  >
                    🎲 Sortear {randomQty} número{randomQty > 1 ? "s" : ""}
                  </button>
                </div>
              </div>
            </div>

            {/* Legend */}
            <div style={{ display: "flex", gap: 20, marginBottom: 16, fontSize: 13 }}>
              {[
                { color: "#00e676", label: "Disponível" },
                { color: "#ff5252", label: "Reservado" },
                { color: "#ffd600", label: "Selecionado" },
              ].map(l => (
                <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 12, height: 12, borderRadius: 3, background: l.color + "40", border: `1.5px solid ${l.color}` }} />
                  <span style={{ color: "rgba(255,255,255,0.5)" }}>{l.label}</span>
                </div>
              ))}
            </div>

            {/* Grid */}
            <div style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 20,
              padding: "20px 20px 0",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>
                  Mostrando {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, TOTAL_NUMEROS)} de 30.000
                </span>
                <span style={{ fontSize: 13, color: "#ffd600", fontFamily: "JetBrains Mono, monospace", fontWeight: 700 }}>
                  {selected.length} selecionados
                </span>
              </div>

              {Object.keys(db).length > 0 && (
                <NumberGrid db={db} page={page} selected={selected} onToggle={toggleNum} />
              )}

              {/* Pagination */}
              <div style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                gap: 8,
                padding: "20px 0",
                borderTop: "1px solid rgba(255,255,255,0.06)",
                flexWrap: "wrap",
              }}>
                <button
                  onClick={() => setPage(1)}
                  disabled={page === 1}
                  style={{
                    padding: "6px 12px", borderRadius: 8,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: page === 1 ? "rgba(255,255,255,0.2)" : "#fff",
                    cursor: page === 1 ? "not-allowed" : "pointer",
                    fontFamily: "inherit", fontSize: 13,
                  }}
                >«</button>
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  style={{
                    padding: "6px 14px", borderRadius: 8,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: page === 1 ? "rgba(255,255,255,0.2)" : "#fff",
                    cursor: page === 1 ? "not-allowed" : "pointer",
                    fontFamily: "inherit", fontSize: 13,
                  }}
                >‹</button>

                <span style={{
                  padding: "6px 20px",
                  background: "rgba(255,214,0,0.1)",
                  border: "1px solid rgba(255,214,0,0.3)",
                  borderRadius: 8,
                  fontSize: 13,
                  fontFamily: "JetBrains Mono, monospace",
                  color: "#ffd600",
                }}>
                  {page} / {totalPages}
                </span>

                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  style={{
                    padding: "6px 14px", borderRadius: 8,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: page === totalPages ? "rgba(255,255,255,0.2)" : "#fff",
                    cursor: page === totalPages ? "not-allowed" : "pointer",
                    fontFamily: "inherit", fontSize: 13,
                  }}
                >›</button>
                <button
                  onClick={() => setPage(totalPages)}
                  disabled={page === totalPages}
                  style={{
                    padding: "6px 12px", borderRadius: 8,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: page === totalPages ? "rgba(255,255,255,0.2)" : "#fff",
                    cursor: page === totalPages ? "not-allowed" : "pointer",
                    fontFamily: "inherit", fontSize: 13,
                  }}
                >»</button>

                <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 8 }}>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>Ir para:</span>
                  <input
                    type="number"
                    min={1}
                    max={totalPages}
                    style={{ width: 70, padding: "6px 10px", fontSize: 13 }}
                    onKeyDown={e => {
                      if (e.key === "Enter") {
                        const v = parseInt(e.target.value);
                        if (v >= 1 && v <= totalPages) setPage(v);
                      }
                    }}
                    placeholder={page}
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Floating Cart */}
      {step === "browse" && selected.length > 0 && (
        <div style={{
          position: "fixed",
          bottom: 24,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 200,
          animation: "slideUp 0.3s ease",
          width: "calc(100% - 48px)",
          maxWidth: 560,
        }}>
          <div style={{
            background: "linear-gradient(135deg,#1a1a2e,#16213e)",
            border: "1px solid rgba(255,214,0,0.3)",
            borderRadius: 20,
            padding: "16px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,214,0,0.1)",
            backdropFilter: "blur(20px)",
          }}>
            <div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 2 }}>
                {selected.length} número{selected.length > 1 ? "s" : ""} selecionado{selected.length > 1 ? "s" : ""}
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#ffd600", fontFamily: "JetBrains Mono, monospace" }}>
                R$ {total}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setSelected([])}
                style={{
                  background: "rgba(255,82,82,0.15)",
                  border: "1px solid rgba(255,82,82,0.3)",
                  borderRadius: 12,
                  color: "#ff5252",
                  padding: "10px 16px",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                ✕ Limpar
              </button>
              <button
                onClick={() => setStep("form")}
                style={{
                  background: "linear-gradient(135deg,#ffd600,#ff9100)",
                  border: "none",
                  borderRadius: 12,
                  color: "#0a0a0a",
                  padding: "10px 24px",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontWeight: 800,
                  fontSize: 15,
                  animation: "pulse 2s infinite",
                }}
              >
                Comprar Agora →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer style={{
        borderTop: "1px solid rgba(255,255,255,0.06)",
        padding: "32px 24px",
        textAlign: "center",
        color: "rgba(255,255,255,0.2)",
        fontSize: 13,
      }}>
        <p>🔒 Pagamentos processados com segurança pelo <strong style={{ color: "rgba(255,255,255,0.4)" }}>Mercado Pago</strong></p>
        <p style={{ marginTop: 8 }}>© 2026 MegaRifa. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
}
