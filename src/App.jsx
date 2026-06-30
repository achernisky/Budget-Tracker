import { useState, useEffect, useRef } from "react";

const ALL_COLORS = [
  "#4ade80","#60a5fa","#f97316","#a78bfa","#f43f5e","#facc15","#2dd4bf",
  "#e879f9","#38bdf8","#fb923c","#34d399","#c084fc","#f472b6","#22d3ee",
  "#a3e635","#818cf8","#fbbf24","#6ee7b7","#f87171","#67e8f9",
];
const DEFAULT_CARDS = [
  { id: "chase", name: "Chase Prime Visa", short: "Chase", color: "#60a5fa", closeDay: 15 },
  { id: "amex",  name: "Amex Gold",        short: "Amex",  color: "#facc15", closeDay: 26 },
];
const DEFAULT_CATEGORIES = [
  { id: "food", name: "Food", budget: 600, subcategories: [
    { id: "supermarkets", name: "Supermarkets", budget: 0 },
    { id: "takeout",      name: "Takeout",      budget: 0 },
    { id: "eating-out",   name: "Eating Out",   budget: 0 },
  ]},
  { id: "amazon", name: "Amazon", budget: 200, subcategories: [] },
];
const NAV = [
  { id: "home",       label: "Home",       icon: "◈" },
  { id: "budget",     label: "Budget",     icon: "◎" },
  { id: "statements", label: "Statements", icon: "◷" },
  { id: "settings",   label: "Settings",   icon: "⚙" },
];

const genId       = () => Math.random().toString(36).slice(2, 9);
const todayStr    = () => new Date().toISOString().slice(0, 10);
const fmt         = n  => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n ?? 0);
const monthKey    = (y, m) => `${y}-${String(m + 1).padStart(2, "0")}`;
const monthLabel  = (y, m) => new Date(y, m, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
const monthShort  = (y, m) => new Date(y, m, 1).toLocaleString("en-US", { month: "short" });
const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();

function buildColorMap(categories, cards) {
  const map = {}, used = new Set();
  const pick = id => {
    for (const c of ALL_COLORS) { if (!used.has(c)) { map[id] = c; used.add(c); return; } }
    map[id] = ALL_COLORS[Object.keys(map).length % ALL_COLORS.length];
  };
  cards.forEach(card => { if (card.color && !used.has(card.color)) { map[card.id] = card.color; used.add(card.color); } else pick(card.id); });
  categories.forEach(cat => { pick(cat.id); (cat.subcategories || []).forEach(sub => pick(sub.id)); });
  return map;
}
const getColor = (cm, id) => cm?.[id] || "#64748b";

function flatCategories(cats) {
  const out = [];
  cats.forEach(c => {
    if (c.subcategories && c.subcategories.length > 0) c.subcategories.forEach(s => out.push({ id: s.id, name: s.name, parentId: c.id, parentName: c.name }));
    else out.push({ id: c.id, name: c.name });
  });
  return out;
}
function txCategoryLabel(cats, tx) {
  for (const c of cats) {
    if (c.id === tx.categoryId) return c.name;
    if (c.subcategories) { const s = c.subcategories.find(s => s.id === tx.categoryId); if (s) return c.name + " · " + s.name; }
  }
  return "Unknown";
}

function getCycleForDate(dateStr, closeDay) {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDate(), year = d.getFullYear(), month = d.getMonth();
  let ceY, ceM;
  if (day <= closeDay) { ceY = year; ceM = month; }
  else { ceM = month === 11 ? 0 : month + 1; ceY = month === 11 ? year + 1 : year; }
  const psY = ceM === 0 ? ceY - 1 : ceY, psM = ceM === 0 ? 11 : ceM - 1;
  const startDay = closeDay + 1;
  let csY, csM, csD;
  if (startDay > daysInMonth(psY, psM)) { csD = 1; csM = ceM; csY = ceY; }
  else { csD = startDay; csM = psM; csY = psY; }
  const pad = n => String(n).padStart(2, "0");
  return { cycleStart: `${csY}-${pad(csM+1)}-${pad(csD)}`, cycleEnd: `${ceY}-${pad(ceM+1)}-${pad(closeDay)}`, cycleKey: `${ceY}-${pad(ceM+1)}` };
}
function cycleLabel(s, e) {
  const sd = new Date(s + "T00:00:00"), ed = new Date(e + "T00:00:00");
  const mo = d => d.toLocaleString("en-US", { month: "short" });
  return mo(sd) + " " + sd.getDate() + " – " + mo(ed) + " " + ed.getDate();
}
const txInCycle = (tx, s, e) => tx.date >= s && tx.date <= e;

function calcPace(spent, budget, year, month, isCurrent) {
  if (!budget || !isCurrent || spent <= 0) return null;
  const now = new Date(), total = daysInMonth(year, month), day = now.getDate();
  const perDay = budget / total, actual = spent / day, projected = actual * total;
  const pct = spent / (perDay * day);
  const status = pct >= 1.15 || projected > budget * 1.05 ? "danger" : pct >= 0.9 ? "warning" : "good";
  return { actual, perDay, projected, daysLeft: total - day, day, total, status };
}
const PC  = { good: "#4ade80", warning: "#facc15", danger: "#f43f5e" };
const PL  = { good: "On track", warning: "Watch it", danger: "Over pace" };
const PBG = { good: "#4ade8012", warning: "#facc1512", danger: "#f43f5e12" };
const PBD = { good: "#4ade8030", warning: "#facc1530", danger: "#f43f5e40" };

const CSS = `
  @keyframes fadeSlideIn { from{opacity:0;transform:translateX(16px)} to{opacity:1;transform:translateX(0)} }
  @keyframes fadeSlideUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
  @keyframes fadeIn      { from{opacity:0} to{opacity:1} }
  @keyframes slideUp     { from{transform:translateY(100%)} to{transform:translateY(0)} }
  @keyframes bgFade      { from{background:rgba(0,0,0,0)} to{background:rgba(0,0,0,.75)} }
  @keyframes scaleIn     { from{opacity:0;transform:scale(0.88)} to{opacity:1;transform:scale(1)} }
  @keyframes popIn       { 0%{opacity:0;transform:scale(0.7)} 70%{transform:scale(1.08)} 100%{opacity:1;transform:scale(1)} }
  @keyframes glowPulse   { 0%,100%{box-shadow:0 0 0 0 rgba(74,222,128,0)} 50%{box-shadow:0 0 20px 4px rgba(74,222,128,0.25)} }
  @keyframes glowRed     { 0%,100%{box-shadow:0 0 0 0 rgba(244,63,94,0)} 50%{box-shadow:0 0 16px 3px rgba(244,63,94,0.3)} }
  @keyframes ripple      { 0%{transform:scale(0);opacity:0.6} 100%{transform:scale(3);opacity:0} }
  @keyframes navPop      { 0%{transform:scale(1) translateY(0)} 35%{transform:scale(1.4) translateY(-4px)} 100%{transform:scale(1) translateY(0)} }
  @keyframes countUp     { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
  @keyframes shimmer     { 0%{background-position:-400% 0} 100%{background-position:400% 0} }
  .pressable{-webkit-tap-highlight-color:transparent;transition:transform 0.1s ease,opacity 0.1s ease}
  .pressable:active{transform:scale(0.94)!important;opacity:0.82}
  .card-hover{transition:transform 0.18s ease,box-shadow 0.18s ease}
  .card-hover:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,0.4)}
  .btn-press{-webkit-tap-highlight-color:transparent;transition:transform 0.1s ease,filter 0.1s ease}
  .btn-press:active{transform:scale(0.92);filter:brightness(0.88)}
  .glow-green{animation:glowPulse 2.5s ease infinite}
  .glow-red{animation:glowRed 2s ease infinite}
`;

async function loadData() {
  try {
    const r = localStorage.getItem("budget-v4");
    if (r) { const d = JSON.parse(r); if (d.categories && d.categories[0]?.subcategories !== undefined) return d; }
    return null;
  } catch { return null; }
}
function saveData(d) { try { localStorage.setItem("budget-v4", JSON.stringify(d)); } catch {} }

// ── SHARED UI ──────────────────────────────────────────────────────────────
function CardBadge({ card, small }) {
  if (!card) return null;
  return <span style={{ display:"inline-flex",alignItems:"center",gap:4,background:card.color+"18",border:"1px solid "+card.color+"40",color:card.color,borderRadius:99,padding:small?"1px 7px":"3px 9px",fontSize:small?10:11,fontWeight:700,whiteSpace:"nowrap" }}>{small ? card.short : card.name}</span>;
}

function AlertBanner({ spent, budget }) {
  if (!budget || spent <= 0) return null;
  const pct = spent / budget;
  if (pct < 0.8) return null;
  const over = pct >= 1, color = over ? "#f43f5e" : "#facc15";
  return (
    <div style={{ display:"flex",alignItems:"center",gap:7,background:over?"#f43f5e10":"#facc1510",border:"1px solid "+(over?"#f43f5e35":"#facc1535"),borderRadius:7,padding:"5px 9px",marginTop:8 }}>
      <span style={{ fontSize:11 }}>{over ? "🚨" : "⚠️"}</span>
      <span style={{ color,fontSize:11,fontWeight:700 }}>{over ? "Over budget by "+fmt(spent-budget) : Math.round(pct*100)+"% used — "+fmt(budget-spent)+" left"}</span>
    </div>
  );
}

function PaceBar({ pace, compact }) {
  if (!pace) return null;
  const { actual, perDay, projected, daysLeft, status } = pace;
  const color = PC[status];
  if (compact) return (
    <div style={{ display:"inline-flex",alignItems:"center",gap:5,background:PBG[status],border:"1px solid "+PBD[status],borderRadius:6,padding:"3px 8px" }}>
      <div style={{ width:6,height:6,borderRadius:99,background:color,flexShrink:0 }} />
      <span style={{ color,fontSize:11,fontWeight:700 }}>{PL[status]}</span>
      <span style={{ color:"#475569",fontSize:11 }}>{fmt(actual)}/day · proj. {fmt(projected)}</span>
    </div>
  );
  return (
    <div style={{ marginTop:14,background:PBG[status],border:"1px solid "+PBD[status],borderRadius:10,padding:"12px 14px" }}>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8 }}>
        <div style={{ display:"flex",alignItems:"center",gap:7 }}>
          <div style={{ width:7,height:7,borderRadius:99,background:color }} />
          <span style={{ color,fontSize:12,fontWeight:800 }}>{PL[status]}</span>
        </div>
        <span style={{ color:"#64748b",fontSize:11 }}>{daysLeft} days left</span>
      </div>
      <div style={{ display:"flex",gap:16 }}>
        <div>
          <div style={{ color:"#475569",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:2 }}>Spending/day</div>
          <div style={{ color,fontWeight:800,fontSize:15 }}>{fmt(actual)}</div>
          <div style={{ color:"#334155",fontSize:10 }}>goal: {fmt(perDay)}</div>
        </div>
        <div style={{ width:1,background:"#2d3748" }} />
        <div>
          <div style={{ color:"#475569",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:2 }}>Projected total</div>
          <div style={{ color:status==="good"?"#f1f5f9":color,fontWeight:800,fontSize:15 }}>{fmt(projected)}</div>
          <div style={{ color:"#334155",fontSize:10 }}>{projected > perDay*pace.total ? fmt(projected-perDay*pace.total)+" over" : "within budget"}</div>
        </div>
      </div>
    </div>
  );
}

function TxRow({ tx, cats, cards, colorMap, onDelete, onEdit, showCard }) {
  const [modal, setModal] = useState(false);
  const color = getColor(colorMap, tx.categoryId);
  const label = txCategoryLabel(cats, tx);
  const dl = new Date(tx.date + "T00:00:00").toLocaleDateString("en-US", { month:"short", day:"numeric" });
  const card = cards?.find(c => c.id === tx.card);
  return (
    <>
      <div onClick={() => setModal(true)} className="pressable"
        style={{ display:"flex",alignItems:"center",gap:10,padding:"13px 0",borderBottom:"1px solid #1e2533",cursor:"pointer",animation:"fadeSlideIn 0.3s ease both" }}>
        <div style={{ width:8,height:8,borderRadius:99,background:color,flexShrink:0 }} />
        <div style={{ flex:1,minWidth:0 }}>
          <div style={{ color:"#f1f5f9",fontSize:14,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
            {tx.amount < 0 && <span style={{ color:"#4ade80",marginRight:4,fontSize:12 }}>↩</span>}
            {tx.description || <span style={{ color:"#475569" }}>No description</span>}
          </div>
          <div style={{ display:"flex",alignItems:"center",gap:6,marginTop:3,flexWrap:"wrap" }}>
            <span style={{ color:"#475569",fontSize:11 }}>{dl}</span>
            <span style={{ color,fontSize:11,fontWeight:600 }}>{label}</span>
            {showCard && card && <CardBadge card={card} small />}
            {tx.amount < 0 && <span style={{ color:"#4ade80",fontSize:10,fontWeight:700,background:"#4ade8015",borderRadius:4,padding:"1px 5px" }}>REFUND</span>}
          </div>
        </div>
        <div style={{ color:tx.amount < 0 ? "#4ade80" : "#f1f5f9",fontWeight:800,fontSize:15,flexShrink:0 }}>
          {tx.amount < 0 ? "-" + fmt(Math.abs(tx.amount)) : fmt(tx.amount)}
        </div>
        <div style={{ color:"#334155",fontSize:14,flexShrink:0 }}>›</div>
      </div>
      {modal && (
        <div onClick={() => setModal(false)} style={{ position:"fixed",inset:0,background:"rgba(0,0,0,.75)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:500,padding:12,animation:"bgFade 0.2s ease" }}>
          <div onClick={e => e.stopPropagation()} style={{ background:"#161b27",border:"1px solid #2d3748",borderRadius:20,padding:24,width:"100%",maxWidth:480,marginBottom:4,fontFamily:"Inter,system-ui,sans-serif",animation:"slideUp 0.25s cubic-bezier(0.32,0.72,0,1)" }}>
            <div style={{ display:"flex",alignItems:"center",gap:12,marginBottom:20 }}>
              <div style={{ width:10,height:10,borderRadius:99,background:color,flexShrink:0 }} />
              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ color:"#f1f5f9",fontSize:16,fontWeight:700 }}>{tx.description || <span style={{ color:"#475569" }}>No description</span>}</div>
                <div style={{ display:"flex",gap:6,marginTop:3,flexWrap:"wrap" }}>
                  <span style={{ color:"#475569",fontSize:12 }}>{dl}</span>
                  <span style={{ color,fontSize:12,fontWeight:600 }}>{label}</span>
                  {card && <CardBadge card={card} small />}
                </div>
              </div>
              <div style={{ color:"#f1f5f9",fontSize:20,fontWeight:800 }}>{fmt(tx.amount)}</div>
            </div>
            <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
              <button onClick={() => { setModal(false); onEdit && onEdit(); }} className="btn-press"
                style={{ width:"100%",background:"#1e2533",border:"1px solid #2d3748",color:"#f1f5f9",borderRadius:12,padding:14,fontSize:15,fontWeight:700,cursor:"pointer" }}>✎ Edit transaction</button>
              <button onClick={() => { setModal(false); onDelete && onDelete(); }} className="btn-press"
                style={{ width:"100%",background:"#f43f5e14",border:"1px solid #f43f5e40",color:"#f43f5e",borderRadius:12,padding:14,fontSize:15,fontWeight:700,cursor:"pointer" }}>Delete transaction</button>
              <button onClick={() => setModal(false)} className="btn-press"
                style={{ width:"100%",background:"none",border:"none",color:"#475569",borderRadius:12,padding:12,fontSize:14,fontWeight:600,cursor:"pointer" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── ADD MODAL ────────────────────────────────────────────────────────────────
function AddModal({ categories, cards, defaultCatId, defaultCard, editTx, onSave, onClose }) {
  const flat = flatCategories(categories);
  const [amount, setAmount] = useState(editTx ? String(Math.abs(editTx.amount)) : "");
  const [desc,   setDesc]   = useState(editTx ? (editTx.description || "") : "");
  const [catId,  setCatId]  = useState(editTx ? editTx.categoryId : (defaultCatId || flat[0]?.id || ""));
  const [card,   setCard]   = useState(editTx ? editTx.card : (defaultCard || cards[0]?.id || ""));
  const [date,   setDate]   = useState(editTx ? editTx.date : todayStr());
  const [isRefund, setIsRefund] = useState(editTx ? (editTx.amount < 0) : false);
  const isEdit = !!editTx;

  const submit = () => {
    const a = parseFloat(amount);
    if (!a || a <= 0 || !catId) return;
    onSave({ id: editTx?.id || genId(), amount: isRefund ? -a : a, description: desc.trim(), categoryId: catId, card, date });
    onClose();
  };

  const IS = { width:"100%",background:"#1e2533",border:"1px solid #2d3748",borderRadius:8,color:"#f1f5f9",padding:"10px 14px",fontSize:14,outline:"none",boxSizing:"border-box",fontFamily:"Inter,system-ui,sans-serif" };
  const LS = { display:"block",color:"#64748b",fontSize:11,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:5 };
  const groups = [];
  categories.forEach(c => {
    if (c.subcategories && c.subcategories.length > 0) groups.push({ type:"group", label:c.name, options:c.subcategories.map(s => ({ id:s.id, name:s.name })) });
    else groups.push({ type:"option", id:c.id, name:c.name });
  });

  return (
    <div onClick={onClose} style={{ position:"fixed",inset:0,background:"rgba(0,0,0,.8)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:500,padding:16,animation:"bgFade 0.2s ease" }}>
      <div onClick={e => e.stopPropagation()} style={{ background:"#161b27",border:"1px solid #2d3748",borderRadius:16,padding:24,width:"100%",maxWidth:380,fontFamily:"Inter,system-ui,sans-serif",animation:"scaleIn 0.25s ease" }}>
        <h2 style={{ color:"#f1f5f9",margin:"0 0 18px",fontSize:18,fontWeight:700 }}>{isEdit ? "Edit transaction" : "Add transaction"}</h2>

        {/* Purchase / Refund toggle */}
        <div style={{ display:"flex",gap:8,marginBottom:16 }}>
          {[false, true].map(r => (
            <button key={String(r)} onClick={() => setIsRefund(r)} className="btn-press"
              style={{ flex:1,padding:"9px 0",borderRadius:8,fontWeight:700,fontSize:13,cursor:"pointer",
                background:isRefund===r ? (r ? "#4ade8025" : "#60a5fa25") : "#1e2533",
                border:isRefund===r ? ("1.5px solid " + (r ? "#4ade80" : "#60a5fa")) : "1px solid #2d3748",
                color:isRefund===r ? (r ? "#4ade80" : "#60a5fa") : "#64748b" }}>
              {r ? "↩ Refund" : "Purchase"}
            </button>
          ))}
        </div>

        <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
          <div><label style={LS}>Amount ($)</label>
            <input type="number" min="0" step="0.01" value={amount} autoFocus onChange={e => setAmount(e.target.value)} placeholder="0.00" style={IS} /></div>
          <div><label style={LS}>Description <span style={{ color:"#334155",fontWeight:400,textTransform:"none",letterSpacing:0 }}>(optional)</span></label>
            <input value={desc} onChange={e => setDesc(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} placeholder="What was it?" style={IS} /></div>
          <div><label style={LS}>Category</label>
            <select value={catId} onChange={e => setCatId(e.target.value)} style={Object.assign({}, IS, { cursor:"pointer" })}>
              {groups.map((g, i) => g.type === "group"
                ? <optgroup key={i} label={g.label}>{g.options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</optgroup>
                : <option key={g.id} value={g.id}>{g.name}</option>)}
            </select></div>
          <div><label style={LS}>Card</label>
            <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
              {cards.map(c => (
                <button key={c.id} onClick={() => setCard(c.id)} className="btn-press"
                  style={{ flex:1,minWidth:80,padding:"9px 0",borderRadius:8,fontWeight:700,fontSize:13,cursor:"pointer",background:card===c.id ? c.color+"25":"#1e2533",border:card===c.id ? "1.5px solid "+c.color:"1px solid #2d3748",color:card===c.id ? c.color:"#64748b" }}>{c.short}</button>
              ))}
            </div></div>
          <div><label style={LS}>Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={IS} /></div>
        </div>
        <div style={{ display:"flex",gap:10,marginTop:20 }}>
          <button onClick={onClose} className="btn-press" style={{ flex:1,background:"#1e2533",color:"#64748b",border:"1px solid #2d3748",borderRadius:8,padding:11,fontWeight:600,fontSize:14,cursor:"pointer" }}>Cancel</button>
          <button onClick={submit} className="btn-press" style={{ flex:2,background:"#4ade80",color:"#0f1117",border:"none",borderRadius:8,padding:11,fontWeight:700,fontSize:14,cursor:"pointer" }}>{isEdit ? "Save changes" : (isRefund ? "Log refund" : "Save")}</button>
        </div>
      </div>
    </div>
  );
}

// ── CHARTS ───────────────────────────────────────────────────────────────────
function WeeklyBarChart({ transactions, color, budget, year, month }) {
  const totals = [0,0,0,0,0];
  transactions.forEach(tx => {
    const d = new Date(tx.date + "T00:00:00");
    if (d.getFullYear() === year && d.getMonth() === month)
      totals[Math.min(Math.floor((d.getDate()-1)/7), 4)] += tx.amount;
  });
  const maxVal = Math.max(...totals, (budget||0)/4, 1);
  const W=280, H=100, pad=4, barW=38, gap=12;
  return (
    <svg width="100%" viewBox={"0 0 "+W+" "+(H+24)} style={{ overflow:"visible" }}>
      {totals.map((v, i) => {
        const x=pad+i*(barW+gap), barH=Math.max(2,(v/maxVal)*(H-8)), y=H-barH;
        return (
          <g key={i}>
            <rect x={x} y={H} width={barW} height={4} rx={3} fill="#1e2533" />
            <rect x={x} y={y} width={barW} height={barH} rx={4} fill={v>0?color:"#1e2533"} opacity={v>0?0.85:0.3} />
            {v>0 && <text x={x+barW/2} y={y-4} textAnchor="middle" fill={color} fontSize="9" fontWeight="700" fontFamily="Inter,system-ui,sans-serif">{fmt(v)}</text>}
            <text x={x+barW/2} y={H+18} textAnchor="middle" fill="#475569" fontSize="9" fontFamily="Inter,system-ui,sans-serif">{"Wk "+(i+1)}</text>
          </g>
        );
      })}
    </svg>
  );
}

function MonthlyTrendChart({ transactions, categories, colorMap, months }) {
  const [selectedMonth, setSelectedMonth] = useState(null);
  const leaves = [];
  categories.forEach(c => {
    if (c.subcategories && c.subcategories.length > 0) c.subcategories.forEach(s => leaves.push({ id:s.id, name:s.name, parentName:c.name, color:getColor(colorMap,s.id) }));
    else leaves.push({ id:c.id, name:c.name, parentName:null, color:getColor(colorMap,c.id) });
  });
  const W=320, H=110, barW=32, gap=10, pad=4;
  const mTotals = months.map(({ year, month }) => {
    const mk=monthKey(year,month), byId={};
    leaves.forEach(l => { byId[l.id]=0; });
    transactions.filter(tx => tx.date.startsWith(mk)).forEach(tx => { if (byId[tx.categoryId]!==undefined) byId[tx.categoryId]+=tx.amount; });
    return byId;
  });
  const grands = mTotals.map(m => Object.values(m).reduce((s,v)=>s+v,0));
  const maxVal = Math.max(...grands, 1);
  const openModal = i => {
    const { year, month } = months[i];
    const breakdown = leaves.map(l => ({ ...l, spent:mTotals[i][l.id]||0 })).filter(l => l.spent>0);
    setSelectedMonth({ year, month, total:grands[i], breakdown });
  };
  return (
    <>
      <svg width="100%" viewBox={"0 0 "+W+" "+(H+24)} style={{ overflow:"visible" }}>
        {months.map(({ year, month }, i) => {
          const x=pad+i*(barW+gap), total=grands[i]; let yOff=H;
          return (
            <g key={i} onClick={() => openModal(i)} style={{ cursor:total>0?"pointer":"default" }}>
              <rect x={x} y={0} width={barW} height={H+24} fill="transparent" />
              {leaves.map(l => {
                const val=mTotals[i][l.id]||0; if (!val) return null;
                const segH=(val/maxVal)*(H-8); yOff-=segH;
                return <rect key={l.id} x={x} y={yOff} width={barW} height={segH} fill={l.color} opacity={0.85} />;
              })}
              <rect x={x} y={H} width={barW} height={3} rx={2} fill="#1e2533" />
              {total>0 && <text x={x+barW/2} y={H-Math.max(8,(total/maxVal)*(H-8))-5} textAnchor="middle" fill="#94a3b8" fontSize="8" fontFamily="Inter,system-ui,sans-serif">{fmt(total)}</text>}
              <text x={x+barW/2} y={H+16} textAnchor="middle" fill={total>0?"#64748b":"#334155"} fontSize="9" fontFamily="Inter,system-ui,sans-serif">{monthShort(year,month)}</text>
            </g>
          );
        })}
      </svg>
      {grands.some(g=>g>0) && <div style={{ color:"#334155",fontSize:10,textAlign:"center",marginTop:4 }}>tap a bar for breakdown</div>}
      {selectedMonth && (
        <div onClick={() => setSelectedMonth(null)} style={{ position:"fixed",inset:0,background:"rgba(0,0,0,.75)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:500,padding:12,animation:"bgFade 0.2s ease" }}>
          <div onClick={e => e.stopPropagation()} style={{ background:"#161b27",border:"1px solid #2d3748",borderRadius:16,padding:24,width:"100%",maxWidth:480,marginBottom:4,fontFamily:"Inter,system-ui,sans-serif",animation:"slideUp 0.25s ease" }}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18 }}>
              <div>
                <div style={{ color:"#64748b",fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:2 }}>{monthLabel(selectedMonth.year,selectedMonth.month)}</div>
                <div style={{ color:"#f1f5f9",fontSize:24,fontWeight:800 }}>{fmt(selectedMonth.total)}</div>
              </div>
              <button onClick={() => setSelectedMonth(null)} className="btn-press" style={{ background:"#1e2533",border:"1px solid #2d3748",color:"#64748b",borderRadius:8,width:36,height:36,cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center" }}>×</button>
            </div>
            <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
              {selectedMonth.breakdown.map((l, i) => {
                const pct = l.spent/selectedMonth.total;
                return (
                  <div key={l.id} style={{ animation:"fadeSlideIn 0.3s ease "+(i*0.05)+"s both" }}>
                    <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5 }}>
                      <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                        <div style={{ width:9,height:9,borderRadius:99,background:l.color }} />
                        <div>
                          {l.parentName && <div style={{ color:"#475569",fontSize:10,lineHeight:1,marginBottom:1 }}>{l.parentName}</div>}
                          <span style={{ color:"#f1f5f9",fontSize:13,fontWeight:600 }}>{l.name}</span>
                        </div>
                      </div>
                      <div style={{ display:"flex",gap:8,alignItems:"center" }}>
                        <span style={{ color:"#f1f5f9",fontSize:14,fontWeight:700 }}>{fmt(l.spent)}</span>
                        <span style={{ color:"#475569",fontSize:11,minWidth:30,textAlign:"right" }}>{Math.round(pct*100)}%</span>
                      </div>
                    </div>
                    <div style={{ background:"#0f1117",borderRadius:99,height:5 }}>
                      <div style={{ width:(pct*100)+"%",background:l.color,height:"100%",borderRadius:99,opacity:0.9 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function AnimatedPieChart({ categories, transactions, colorMap, onSliceClick }) {
  const [hovered, setHovered] = useState(null);
  const sliceData = [];
  categories.forEach(c => {
    if (c.subcategories && c.subcategories.length > 0) {
      c.subcategories.forEach(sub => {
        const spent = transactions.filter(tx => tx.categoryId===sub.id).reduce((s,t)=>s+t.amount,0);
        if (spent>0) sliceData.push({ id:sub.id,name:sub.name,parentName:c.name,spent,color:getColor(colorMap,sub.id) });
      });
    } else {
      const spent = transactions.filter(tx => tx.categoryId===c.id).reduce((s,t)=>s+t.amount,0);
      if (spent>0) sliceData.push({ id:c.id,name:c.name,parentName:null,spent,color:getColor(colorMap,c.id) });
    }
  });
  const total = sliceData.reduce((s,c)=>s+c.spent,0);
  if (total===0) return <div style={{ textAlign:"center",color:"#334155",fontSize:13,padding:"24px 0" }}>No spending yet this month.</div>;
  const cx=90, cy=90, r=72, inner=44;
  let angle = -Math.PI/2;
  const slices = sliceData.map(c => {
    const sweep=(c.spent/total)*2*Math.PI, midAngle=angle+sweep/2;
    const x1=cx+r*Math.cos(angle), y1=cy+r*Math.sin(angle);
    angle+=sweep;
    const x2=cx+r*Math.cos(angle), y2=cy+r*Math.sin(angle);
    const xi1=cx+inner*Math.cos(angle-sweep), yi1=cy+inner*Math.sin(angle-sweep);
    const xi2=cx+inner*Math.cos(angle), yi2=cy+inner*Math.sin(angle);
    const large=sweep>Math.PI?1:0;
    const path=`M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${inner} ${inner} 0 ${large} 0 ${xi1} ${yi1} Z`;
    return { ...c, path, pct:c.spent/total, midAngle };
  });
  return (
    <div>
      <div style={{ display:"flex",justifyContent:"center",marginBottom:20,animation:"fadeIn 0.5s ease" }}>
        <svg width={180} height={180} style={{ overflow:"visible" }}>
          {slices.map((s,i) => {
            const isHov=hovered===i, nudge=isHov?7:0;
            const tx=nudge*Math.cos(s.midAngle), ty=nudge*Math.sin(s.midAngle);
            return (
              <path key={i} d={s.path} fill={s.color} opacity={hovered!==null&&!isHov?0.45:0.92}
                stroke="#0f1117" strokeWidth={2.5}
                style={{ transform:"translate("+tx+"px,"+ty+"px)",transition:"opacity 0.2s ease,transform 0.2s ease",cursor:"pointer",filter:isHov?"drop-shadow(0 0 6px "+s.color+"88)":"none" }}
                onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}
                onClick={() => onSliceClick && onSliceClick(s)} />
            );
          })}
          <circle cx={cx} cy={cy} r={inner-2} fill="#0f1117" />
          {hovered!==null ? (
            <>
              <text x={cx} y={cy-10} textAnchor="middle" fill={slices[hovered].color} fontSize="10" fontWeight="800" fontFamily="Inter,system-ui,sans-serif">{slices[hovered].name}</text>
              <text x={cx} y={cy+6}  textAnchor="middle" fill="#f1f5f9" fontSize="13" fontWeight="800" fontFamily="Inter,system-ui,sans-serif">{fmt(slices[hovered].spent)}</text>
              <text x={cx} y={cy+20} textAnchor="middle" fill="#475569" fontSize="9" fontFamily="Inter,system-ui,sans-serif">{Math.round(slices[hovered].pct*100)+"%"}</text>
            </>
          ) : (
            <>
              <text x={cx} y={cy-4}  textAnchor="middle" fill="#f1f5f9" fontSize="13" fontWeight="800" fontFamily="Inter,system-ui,sans-serif">{fmt(total)}</text>
              <text x={cx} y={cy+12} textAnchor="middle" fill="#475569" fontSize="9" fontFamily="Inter,system-ui,sans-serif">tap a slice</text>
            </>
          )}
        </svg>
      </div>
      <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
        {slices.map((s,i) => (
          <div key={s.id} onClick={() => onSliceClick && onSliceClick(s)}
            style={{ display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer",animation:"fadeSlideIn 0.4s ease "+(i*0.07)+"s both" }}>
            <div style={{ display:"flex",alignItems:"center",gap:8 }}>
              <div style={{ width:10,height:10,borderRadius:99,background:s.color,flexShrink:0 }} />
              <div>
                {s.parentName && <div style={{ color:"#475569",fontSize:10,lineHeight:1,marginBottom:1 }}>{s.parentName}</div>}
                <span style={{ color:"#f1f5f9",fontSize:13,fontWeight:600 }}>{s.name}</span>
              </div>
            </div>
            <div style={{ display:"flex",alignItems:"center",gap:8 }}>
              <span style={{ color:"#f1f5f9",fontSize:13,fontWeight:700 }}>{fmt(s.spent)}</span>
              <span style={{ color:"#475569",fontSize:11,minWidth:28,textAlign:"right" }}>{Math.round(s.pct*100)+"%"}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AnimatedBar({ pct, color, delay }) {
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(pct), (delay||0)+50); return () => clearTimeout(t); }, [pct, delay]);
  return (
    <div style={{ background:"#0f1117",borderRadius:99,height:6,overflow:"hidden" }}>
      <div style={{ width:w+"%",background:color,height:"100%",borderRadius:99,transition:"width 0.6s cubic-bezier(0.4,0,0.2,1)" }} />
    </div>
  );
}

function BudgetDonut({ spent, budget, color }) {
  const r=38, cx=48, cy=48, stroke=9, circ=2*Math.PI*r;
  const pct=budget>0?Math.min(spent/budget,1):0, over=spent>budget&&budget>0;
  return (
    <svg width={96} height={96}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e2533" strokeWidth={stroke} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={over?"#f43f5e":color} strokeWidth={stroke}
        strokeDasharray={(pct*circ)+" "+circ} strokeLinecap="round"
        transform={"rotate(-90 "+cx+" "+cy+")"} style={{ transition:"stroke-dasharray 0.5s ease" }} />
      <text x={cx} y={cy-5} textAnchor="middle" fill={over?"#f43f5e":color} fontSize="11" fontWeight="800" fontFamily="Inter,system-ui,sans-serif">{Math.round(pct*100)+"%"}</text>
      <text x={cx} y={cy+9} textAnchor="middle" fill="#64748b" fontSize="8" fontFamily="Inter,system-ui,sans-serif">used</text>
    </svg>
  );
}

function DetailModal({ title, subtitle, onClose, children }) {
  return (
    <div onClick={onClose} style={{ position:"fixed",inset:0,background:"rgba(0,0,0,.75)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:500,padding:12,animation:"bgFade 0.25s ease" }}>
      <div onClick={e => e.stopPropagation()} style={{ background:"#161b27",border:"1px solid #2d3748",borderRadius:20,padding:24,width:"100%",maxWidth:480,marginBottom:4,fontFamily:"Inter,system-ui,sans-serif",maxHeight:"80vh",overflowY:"auto",animation:"slideUp 0.28s cubic-bezier(0.32,0.72,0,1)" }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18 }}>
          <div>
            {subtitle && <div style={{ color:"#64748b",fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:3 }}>{subtitle}</div>}
            <div style={{ color:"#f1f5f9",fontSize:20,fontWeight:800 }}>{title}</div>
          </div>
          <button onClick={onClose} className="btn-press" style={{ background:"#1e2533",border:"1px solid #2d3748",color:"#64748b",borderRadius:8,width:36,height:36,cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CardSplitDonut({ cards, transactions }) {
  const [modal, setModal] = useState(false);
  const cardTotals = cards.map(c => ({ ...c, total:transactions.filter(t=>t.card===c.id).reduce((s,t)=>s+t.amount,0) }));
  const total = cardTotals.reduce((s,c)=>s+c.total,0);
  if (total===0) return <div style={{ textAlign:"center",color:"#334155",fontSize:13,padding:"20px 0" }}>No spending yet this month.</div>;
  const r=52, cx=64, cy=64, stroke=14, circ=2*Math.PI*r;
  const firstArc=(cardTotals[0]?.total||0)/total*circ;
  return (
    <>
      <div onClick={() => setModal(true)} style={{ cursor:"pointer" }} className="pressable">
        <div style={{ display:"flex",alignItems:"center",gap:20 }}>
          <svg width={128} height={128} style={{ flexShrink:0 }}>
            <circle cx={cx} cy={cy} r={r} fill="none" stroke={cardTotals[cardTotals.length-1]?.color||"#475569"} strokeWidth={stroke} opacity={0.85} />
            {cardTotals[0] && <circle cx={cx} cy={cy} r={r} fill="none" stroke={cardTotals[0].color} strokeWidth={stroke} strokeDasharray={firstArc+" "+circ} strokeLinecap="butt" transform={"rotate(-90 "+cx+" "+cy+")"} opacity={0.9} />}
            <text x={cx} y={cy-6} textAnchor="middle" fill="#f1f5f9" fontSize="11" fontWeight="800" fontFamily="Inter,system-ui,sans-serif">{fmt(total)}</text>
            <text x={cx} y={cy+9} textAnchor="middle" fill="#475569" fontSize="9" fontFamily="Inter,system-ui,sans-serif">tap to expand</text>
          </svg>
          <div style={{ flex:1 }}>
            {cardTotals.map(c => (
              <div key={c.id} style={{ marginBottom:12 }}>
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4 }}>
                  <div style={{ display:"flex",alignItems:"center",gap:6 }}><div style={{ width:8,height:8,borderRadius:99,background:c.color }} /><span style={{ color:c.color,fontSize:12,fontWeight:700 }}>{c.short}</span></div>
                  <span style={{ color:"#f1f5f9",fontWeight:800,fontSize:14 }}>{fmt(c.total)}</span>
                </div>
                <div style={{ background:"#1e2533",borderRadius:99,height:4 }}><div style={{ width:((c.total/total)*100)+"%",background:c.color,height:"100%",borderRadius:99,transition:"width 0.5s" }} /></div>
                <div style={{ color:"#475569",fontSize:11,marginTop:3 }}>{Math.round((c.total/total)*100)+"%"} of total</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ color:"#334155",fontSize:10,textAlign:"center",marginTop:6 }}>tap for full breakdown</div>
      </div>
      {modal && (
        <DetailModal title="Card Split" subtitle="Spending by card" onClose={() => setModal(false)}>
          {cardTotals.map((c, i) => (
            <div key={c.id} style={{ marginBottom:18 }}>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8 }}>
                <div style={{ display:"flex",alignItems:"center",gap:8 }}><div style={{ width:10,height:10,borderRadius:99,background:c.color }} /><span style={{ color:c.color,fontSize:14,fontWeight:700 }}>{c.name}</span></div>
                <div><span style={{ color:"#f1f5f9",fontSize:16,fontWeight:800 }}>{fmt(c.total)}</span><span style={{ color:"#475569",fontSize:12,marginLeft:6 }}>{Math.round((c.total/total)*100)+"%"}</span></div>
              </div>
              <AnimatedBar pct={(c.total/total)*100} color={c.color} delay={i*80} />
              <div style={{ color:"#475569",fontSize:11,marginTop:4 }}>Closes day {c.closeDay} each month</div>
            </div>
          ))}
        </DetailModal>
      )}
    </>
  );
}

// ── HOME PAGE ─────────────────────────────────────────────────────────────────
function HomePage({ categories, cards, colorMap, transactions, year, month, isCurrentMonth, onPrev, onNext }) {
  const mk = monthKey(year, month);
  const monthTxs = transactions.filter(tx => tx.date.startsWith(mk));
  const totalBudget = categories.reduce((s,c)=>s+(c.budget||0),0);
  const totalSpent  = monthTxs.reduce((s,t)=>s+t.amount,0);
  const isOver = totalSpent>totalBudget&&totalBudget>0;
  const overallPace = calcPace(totalSpent,totalBudget,year,month,isCurrentMonth);
  const last6=[];
  for(let i=5;i>=0;i--){ let mo=month-i,yr=year; while(mo<0){mo+=12;yr--;} last6.push({year:yr,month:mo}); }
  const [pieModal,  setPieModal]  = useState(null);
  const [summaryModal, setSummaryModal] = useState(false);

  return (
    <div style={{ paddingBottom:24 }}>
      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"20px 20px 0" }}>
        <button onClick={onPrev} className="btn-press" style={{ background:"#1e2533",border:"1px solid #2d3748",color:"#94a3b8",borderRadius:8,width:34,height:34,cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center" }}>‹</button>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontWeight:800,fontSize:18,color:"#f1f5f9" }}>{monthLabel(year,month)}</div>
          {isCurrentMonth && <div style={{ color:"#4ade80",fontSize:10,fontWeight:700,letterSpacing:"0.1em" }}>CURRENT MONTH</div>}
        </div>
        <button onClick={onNext} disabled={isCurrentMonth} className="btn-press"
          style={{ background:"#1e2533",border:"1px solid #2d3748",color:"#94a3b8",borderRadius:8,width:34,height:34,cursor:isCurrentMonth?"default":"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",opacity:isCurrentMonth?0.3:1 }}>›</button>
      </div>

      <div onClick={() => setSummaryModal(true)} className={"card-hover pressable"+(isOver?" glow-red":"")}
        style={{ margin:"16px 20px 0",background:"#161b27",border:"1px solid "+(isOver?"#f43f5e40":"#2d3748"),borderRadius:14,padding:"18px 20px",cursor:"pointer",animation:"fadeSlideUp 0.4s ease both" }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:10 }}>
          <div>
            <div style={{ color:"#64748b",fontSize:11,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:3 }}>Total spent</div>
            <div style={{ fontSize:32,fontWeight:800,letterSpacing:"-0.02em",color:isOver?"#f43f5e":"#f1f5f9",animation:"countUp 0.5s ease both" }}>{fmt(totalSpent)}</div>
          </div>
          {totalBudget>0 && <div style={{ textAlign:"right" }}>
            <div style={{ color:"#64748b",fontSize:11,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:3 }}>Budget</div>
            <div style={{ fontSize:18,fontWeight:700,color:"#64748b" }}>{fmt(totalBudget)}</div>
          </div>}
        </div>
        {totalBudget>0 && <>
          <div style={{ background:"#0f1117",borderRadius:99,height:6,overflow:"hidden" }}>
            <div style={{ width:(Math.min(totalSpent/totalBudget,1)*100)+"%",background:isOver?"#f43f5e":"#4ade80",height:"100%",borderRadius:99,transition:"width 0.5s" }} />
          </div>
          <div style={{ marginTop:6,fontSize:12,color:isOver?"#f43f5e":"#64748b" }}>{isOver?fmt(totalSpent-totalBudget)+" over budget":fmt(totalBudget-totalSpent)+" remaining"}</div>
        </>}
        {overallPace && <PaceBar pace={overallPace} />}
        <div style={{ color:"#334155",fontSize:10,textAlign:"right",marginTop:8 }}>tap for breakdown</div>
      </div>

      <div style={{ margin:"14px 20px 0",background:"#161b27",border:"1px solid #2d3748",borderRadius:14,padding:"16px 20px",animation:"fadeSlideUp 0.4s ease 0.08s both" }}>
        <div style={{ color:"#64748b",fontSize:11,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:14 }}>Spending by category</div>
        <AnimatedPieChart categories={categories} transactions={monthTxs} colorMap={colorMap} onSliceClick={s => setPieModal(s)} />
      </div>

      <div style={{ margin:"14px 20px 0",background:"#161b27",border:"1px solid #2d3748",borderRadius:14,padding:"16px 20px",animation:"fadeSlideUp 0.4s ease 0.16s both" }}>
        <div style={{ color:"#64748b",fontSize:11,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:14 }}>Card split</div>
        <CardSplitDonut cards={cards} transactions={monthTxs} />
      </div>

      <div style={{ margin:"14px 20px 0",background:"#161b27",border:"1px solid #2d3748",borderRadius:14,padding:"16px 20px",animation:"fadeSlideUp 0.4s ease 0.24s both" }}>
        <div style={{ color:"#64748b",fontSize:11,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:12 }}>6-month trend</div>
        <MonthlyTrendChart transactions={transactions} categories={categories} colorMap={colorMap} months={last6} />
        <div style={{ display:"flex",flexWrap:"wrap",gap:"6px 14px",marginTop:10 }}>
          {categories.map(c => (
            <div key={c.id} style={{ display:"flex",alignItems:"center",gap:5 }}>
              <div style={{ width:7,height:7,borderRadius:2,background:getColor(colorMap,c.id) }} />
              <span style={{ color:"#475569",fontSize:11 }}>{c.name}</span>
            </div>
          ))}
        </div>
      </div>

      {pieModal && (
        <DetailModal title={pieModal.name} subtitle={pieModal.parentName||"Category"} onClose={() => setPieModal(null)}>
          <div style={{ display:"flex",alignItems:"center",gap:16,marginBottom:20 }}>
            <div style={{ width:14,height:14,borderRadius:99,background:pieModal.color }} />
            <div>
              <div style={{ color:"#f1f5f9",fontSize:28,fontWeight:800 }}>{fmt(pieModal.spent)}</div>
              <div style={{ color:"#475569",fontSize:13 }}>{Math.round(pieModal.pct*100)+"% of total spending"}</div>
            </div>
          </div>
          <AnimatedBar pct={pieModal.pct*100} color={pieModal.color} />
          <div style={{ marginTop:16,color:"#64748b",fontSize:12 }}>Transactions in {monthLabel(year,month)}:</div>
          <div style={{ marginTop:10 }}>
            {monthTxs.filter(tx => tx.categoryId===pieModal.id).sort((a,b)=>b.date>a.date?1:-1).map(tx => {
              const dl=new Date(tx.date+"T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"});
              return (
                <div key={tx.id} style={{ display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #1e2533" }}>
                  <div><div style={{ color:"#f1f5f9",fontSize:13,fontWeight:600 }}>{tx.description||"—"}</div><div style={{ color:"#475569",fontSize:11 }}>{dl}</div></div>
                  <div style={{ color:"#f1f5f9",fontWeight:700 }}>{fmt(tx.amount)}</div>
                </div>
              );
            })}
            {monthTxs.filter(tx => tx.categoryId===pieModal.id).length===0 && <div style={{ color:"#334155",fontSize:13,textAlign:"center",padding:"16px 0" }}>No transactions found.</div>}
          </div>
        </DetailModal>
      )}

      {summaryModal && (
        <DetailModal title={fmt(totalSpent)+" spent"} subtitle={monthLabel(year,month)} onClose={() => setSummaryModal(false)}>
          {totalBudget>0 && (
            <div style={{ marginBottom:20 }}>
              <div style={{ display:"flex",justifyContent:"space-between",marginBottom:8 }}>
                <span style={{ color:"#64748b",fontSize:13 }}>Budget</span>
                <span style={{ color:"#f1f5f9",fontWeight:700 }}>{fmt(totalBudget)}</span>
              </div>
              <AnimatedBar pct={Math.min(totalSpent/totalBudget,1)*100} color={isOver?"#f43f5e":"#4ade80"} />
              <div style={{ marginTop:6,fontSize:12,color:isOver?"#f43f5e":"#64748b" }}>{isOver?fmt(totalSpent-totalBudget)+" over budget":fmt(totalBudget-totalSpent)+" remaining"}</div>
            </div>
          )}
          <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
            {categories.map((c,ci) => {
              const ids=c.subcategories?.length>0?c.subcategories.map(s=>s.id):[c.id];
              const spent=monthTxs.filter(tx=>ids.includes(tx.categoryId)).reduce((s,t)=>s+t.amount,0);
              if (!spent) return null;
              const color=getColor(colorMap,c.id);
              return (
                <div key={c.id}>
                  <div style={{ display:"flex",justifyContent:"space-between",marginBottom:6 }}>
                    <div style={{ display:"flex",alignItems:"center",gap:8 }}><div style={{ width:9,height:9,borderRadius:99,background:color }} /><span style={{ color:"#f1f5f9",fontWeight:700,fontSize:14 }}>{c.name}</span></div>
                    <div><span style={{ color:"#f1f5f9",fontWeight:800 }}>{fmt(spent)}</span>{totalSpent>0&&<span style={{ color:"#475569",fontSize:11,marginLeft:6 }}>{Math.round(spent/totalSpent*100)+"%"}</span>}</div>
                  </div>
                  <AnimatedBar pct={totalSpent>0?(spent/totalSpent)*100:0} color={color} delay={ci*60} />
                </div>
              );
            })}
          </div>
        </DetailModal>
      )}
    </div>
  );
}

// ── BUDGET PAGE ────────────────────────────────────────────────────────────────
function BudgetPage({ categories, cards, colorMap, transactions, year, month, isCurrentMonth, onPrev, onNext, onCategoryClick, onDelete, onEdit }) {
  const mk = monthKey(year, month);
  const monthTxs = transactions.filter(tx => tx.date.startsWith(mk));
  const totalBudget = categories.reduce((s,c)=>s+(c.budget||0),0);
  const totalSpent  = monthTxs.reduce((s,t)=>s+t.amount,0);
  const isOver = totalSpent>totalBudget&&totalBudget>0;
  const overallPace = calcPace(totalSpent,totalBudget,year,month,isCurrentMonth);
  const [expandedCat, setExpandedCat] = useState(null);

  return (
    <div style={{ paddingBottom:24 }}>
      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"20px 20px 0" }}>
        <button onClick={onPrev} className="btn-press" style={{ background:"#1e2533",border:"1px solid #2d3748",color:"#94a3b8",borderRadius:8,width:34,height:34,cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center" }}>‹</button>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontWeight:800,fontSize:18,color:"#f1f5f9" }}>{monthLabel(year,month)}</div>
          {isCurrentMonth && <div style={{ color:"#4ade80",fontSize:10,fontWeight:700,letterSpacing:"0.1em" }}>CURRENT MONTH</div>}
        </div>
        <button onClick={onNext} disabled={isCurrentMonth} className="btn-press"
          style={{ background:"#1e2533",border:"1px solid #2d3748",color:"#94a3b8",borderRadius:8,width:34,height:34,cursor:isCurrentMonth?"default":"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",opacity:isCurrentMonth?0.3:1 }}>›</button>
      </div>

      <div style={{ margin:"16px 20px 0",background:"#161b27",border:"1px solid #2d3748",borderRadius:14,padding:"18px 20px" }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:10 }}>
          <div>
            <div style={{ color:"#64748b",fontSize:11,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:3 }}>Total spent</div>
            <div style={{ fontSize:30,fontWeight:800,letterSpacing:"-0.02em",color:isOver?"#f43f5e":"#f1f5f9" }}>{fmt(totalSpent)}</div>
          </div>
          {totalBudget>0 && <div style={{ textAlign:"right" }}>
            <div style={{ color:"#64748b",fontSize:11,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:3 }}>Budget</div>
            <div style={{ fontSize:18,fontWeight:700,color:"#64748b" }}>{fmt(totalBudget)}</div>
          </div>}
        </div>
        {totalBudget>0 && <>
          <div style={{ background:"#0f1117",borderRadius:99,height:6,overflow:"hidden" }}>
            <div style={{ width:(Math.min(totalSpent/totalBudget,1)*100)+"%",background:isOver?"#f43f5e":"#4ade80",height:"100%",borderRadius:99 }} />
          </div>
          <div style={{ marginTop:6,fontSize:12,color:isOver?"#f43f5e":"#64748b" }}>{isOver?fmt(totalSpent-totalBudget)+" over budget":fmt(totalBudget-totalSpent)+" remaining"}</div>
        </>}
        {overallPace && <PaceBar pace={overallPace} />}
      </div>

      <div style={{ padding:"16px 20px 0" }}>
        <div style={{ color:"#475569",fontSize:11,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:10 }}>Categories</div>
        <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
          {categories.map((cat, ci) => {
            const catColor=getColor(colorMap,cat.id);
            const ids=cat.subcategories&&cat.subcategories.length>0?cat.subcategories.map(s=>s.id):[cat.id];
            const catTxs=monthTxs.filter(tx=>ids.includes(tx.categoryId)).sort((a,b)=>b.date>a.date?1:-1);
            const catSpent=catTxs.reduce((s,t)=>s+t.amount,0);
            const catBudget=cat.budget||0, over=catSpent>catBudget&&catBudget>0;
            const pct=catBudget>0?Math.min(catSpent/catBudget,1):0;
            const catPace=isCurrentMonth&&catBudget>0?calcPace(catSpent,catBudget,year,month,isCurrentMonth):null;
            const hasSubs=cat.subcategories&&cat.subcategories.length>0;
            const isExpanded=expandedCat===cat.id;
            return (
              <div key={cat.id} className="card-hover"
                style={{ background:"#161b27",border:"1px solid "+(over?"#f43f5e33":"#2d3748"),borderRadius:12,overflow:"hidden",animation:"fadeSlideUp 0.4s ease "+(ci*0.07)+"s both" }}>
                <div onClick={() => onCategoryClick(cat.id)} style={{ padding:"14px 16px",cursor:"pointer",userSelect:"none" }}>
                  <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:catBudget>0||hasSubs?10:0 }}>
                    <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                      <div style={{ width:9,height:9,borderRadius:99,background:catColor }} />
                      <span style={{ fontWeight:700,fontSize:15,color:"#f1f5f9" }}>{cat.name}</span>
                    </div>
                    <div style={{ display:"flex",alignItems:"center",gap:6 }}>
                      <span style={{ fontWeight:800,fontSize:16,color:over?"#f43f5e":"#f1f5f9" }}>{fmt(catSpent)}</span>
                      {catBudget>0 && <span style={{ color:"#334155",fontSize:12 }}>/ {fmt(catBudget)}</span>}
                      <span style={{ color:"#475569",fontSize:12 }}>›</span>
                    </div>
                  </div>
                  {catBudget>0 && <>
                    <div style={{ background:"#0f1117",borderRadius:99,height:4,overflow:"hidden" }}>
                      <div style={{ width:(pct*100)+"%",background:over?"#f43f5e":catColor,height:"100%",borderRadius:99,transition:"width 0.3s" }} />
                    </div>
                    <div style={{ marginTop:5,fontSize:11,color:over?"#f43f5e":"#475569" }}>{over?fmt(catSpent-catBudget)+" over":fmt(catBudget-catSpent)+" left"}</div>
                  </>}
                  {hasSubs && (
                    <div style={{ marginTop:10,display:"flex",flexDirection:"column",gap:8,borderTop:"1px solid #1e2533",paddingTop:10 }}>
                      {cat.subcategories.map(sub => {
                        const subColor=getColor(colorMap,sub.id);
                        const subSpent=monthTxs.filter(tx=>tx.categoryId===sub.id).reduce((s,t)=>s+t.amount,0);
                        const subBudget=sub.budget||0, subOver=subSpent>subBudget&&subBudget>0;
                        const barPct=subBudget>0?Math.min(subSpent/subBudget,1):(catSpent>0?subSpent/catSpent:0);
                        return (
                          <div key={sub.id}>
                            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5 }}>
                              <div style={{ display:"flex",alignItems:"center",gap:7 }}><div style={{ width:7,height:7,borderRadius:99,background:subColor,flexShrink:0 }} /><span style={{ color:"#c4cdd9",fontSize:13,fontWeight:600 }}>{sub.name}</span></div>
                              <div style={{ display:"flex",gap:6,alignItems:"center" }}>
                                <span style={{ color:subOver?"#f43f5e":"#f1f5f9",fontSize:13,fontWeight:700 }}>{fmt(subSpent)}</span>
                                {subBudget>0?<span style={{ color:"#475569",fontSize:11 }}>/ {fmt(subBudget)}</span>:<span style={{ color:"#334155",fontSize:11 }}>no budget</span>}
                              </div>
                            </div>
                            <div style={{ background:"#0f1117",borderRadius:99,height:4,overflow:"hidden" }}>
                              <div style={{ width:(barPct*100)+"%",background:subOver?"#f43f5e":subColor,height:"100%",borderRadius:99,opacity:subBudget>0?1:0.5 }} />
                            </div>
                            {subBudget>0 && <div style={{ marginTop:3,fontSize:10,color:subOver?"#f43f5e":"#475569" }}>{subOver?fmt(subSpent-subBudget)+" over":fmt(subBudget-subSpent)+" left"}</div>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <AlertBanner spent={catSpent} budget={catBudget} />
                  {catPace&&catSpent>0 && <div style={{ marginTop:6 }}><PaceBar pace={catPace} compact /></div>}
                </div>
                {catTxs.length>0 && <>
                  <button onClick={e => { e.stopPropagation(); setExpandedCat(isExpanded?null:cat.id); }}
                    style={{ width:"100%",background:"none",border:"none",borderTop:"1px solid #1e2533",color:isExpanded?"#4ade80":"#475569",padding:"8px 16px",fontSize:12,cursor:"pointer",fontWeight:600,textAlign:"left",display:"flex",alignItems:"center",gap:6 }}>
                    <span style={{ fontSize:10 }}>{isExpanded?"▲":"▼"}</span>{isExpanded?"Hide":"Show"} transactions ({catTxs.length})
                  </button>
                  {isExpanded && (
                    <div style={{ padding:"0 14px 10px",borderTop:"1px solid #0f1117" }}>
                      {catTxs.map(tx => <TxRow key={tx.id} tx={tx} cats={categories} cards={cards} colorMap={colorMap} showCard onEdit={() => onEdit(tx)} onDelete={() => onDelete(tx.id)} />)}
                    </div>
                  )}
                </>}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ padding:"16px 20px 0" }}>
        <div style={{ color:"#475569",fontSize:11,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:4 }}>Recent transactions</div>
        {monthTxs.length===0
          ? <div style={{ color:"#334155",fontSize:14,padding:"24px 0",textAlign:"center" }}>No transactions this month.</div>
          : [...monthTxs].sort((a,b)=>b.date>a.date?1:-1).slice(0,10).map(tx => <TxRow key={tx.id} tx={tx} cats={categories} cards={cards} colorMap={colorMap} showCard onEdit={() => onEdit(tx)} onDelete={() => onDelete(tx.id)} />)}
      </div>
    </div>
  );
}

// ── CATEGORY DETAIL ──────────────────────────────────────────────────────────
function CategoryDetailPage({ catId, categories, cards, colorMap, transactions, year, month, onBack, onAddTx, onDelete, onEdit, onSetBudget, onSetSubBudget }) {
  const cat = categories.find(c => c.id===catId);
  if (!cat) return null;
  const catColor = getColor(colorMap, cat.id);
  const hasSubs = cat.subcategories&&cat.subcategories.length>0;
  const [activeSubId, setActiveSubId] = useState(null);
  const [editBudget, setEditBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");
  const mk=monthKey(year,month), isNow=new Date().getFullYear()===year&&new Date().getMonth()===month;
  const allIds=hasSubs?cat.subcategories.map(s=>s.id):[cat.id];
  const viewIds=activeSubId?[activeSubId]:allIds;
  const viewTxs=transactions.filter(tx=>tx.date.startsWith(mk)&&viewIds.includes(tx.categoryId)).sort((a,b)=>b.date>a.date?1:-1);
  const activeSub=activeSubId?cat.subcategories.find(s=>s.id===activeSubId):null;
  const viewBudget=activeSub?(activeSub.budget||0):(cat.budget||0);
  const viewColor=activeSub?getColor(colorMap,activeSub.id):catColor;
  const viewSpent=viewTxs.reduce((s,t)=>s+t.amount,0);
  const pace=calcPace(viewSpent,viewBudget,year,month,isNow);
  const saveBudget=val=>{ if(activeSub) onSetSubBudget(cat.id,activeSub.id,parseFloat(val)||0); else onSetBudget(cat.id,parseFloat(val)||0); setEditBudget(false); };

  return (
    <div style={{ paddingBottom:80 }}>
      <div style={{ padding:"20px 20px 0",display:"flex",alignItems:"center",gap:12 }}>
        <button onClick={onBack} className="btn-press" style={{ background:"#1e2533",border:"1px solid #2d3748",color:"#94a3b8",borderRadius:8,width:36,height:36,cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center" }}>‹</button>
        <div style={{ display:"flex",alignItems:"center",gap:10,flex:1 }}><div style={{ width:10,height:10,borderRadius:99,background:catColor }} /><span style={{ fontWeight:800,fontSize:18,color:"#f1f5f9" }}>{cat.name}</span></div>
        <button onClick={onAddTx} className="btn-press" style={{ background:catColor,color:"#0f1117",border:"none",borderRadius:8,padding:"8px 14px",fontWeight:700,fontSize:13,cursor:"pointer" }}>+ Add</button>
      </div>
      <div style={{ padding:"4px 20px 0",color:"#475569",fontSize:12,fontWeight:600,letterSpacing:"0.05em",textTransform:"uppercase" }}>{monthLabel(year,month)}</div>

      {hasSubs && (
        <div style={{ display:"flex",padding:"12px 20px 0",gap:8,overflowX:"auto" }}>
          <button onClick={() => setActiveSubId(null)} className="btn-press"
            style={{ padding:"6px 14px",borderRadius:99,fontWeight:700,fontSize:12,cursor:"pointer",whiteSpace:"nowrap",background:!activeSubId?catColor+"25":"#1e2533",border:!activeSubId?"1.5px solid "+catColor:"1px solid #2d3748",color:!activeSubId?catColor:"#64748b" }}>All</button>
          {cat.subcategories.map(sub => {
            const sc=getColor(colorMap,sub.id), isActive=activeSubId===sub.id;
            return <button key={sub.id} onClick={() => setActiveSubId(sub.id)} className="btn-press"
              style={{ padding:"6px 14px",borderRadius:99,fontWeight:700,fontSize:12,cursor:"pointer",whiteSpace:"nowrap",background:isActive?sc+"25":"#1e2533",border:isActive?"1.5px solid "+sc:"1px solid #2d3748",color:isActive?sc:"#64748b" }}>{sub.name}</button>;
          })}
        </div>
      )}

      <div style={{ margin:"14px 20px 0",background:"#161b27",border:"1px solid #2d3748",borderRadius:14,padding:"18px 20px" }}>
        <div style={{ display:"flex",alignItems:"center",gap:16 }}>
          <BudgetDonut spent={viewSpent} budget={viewBudget} color={viewColor} />
          <div style={{ flex:1 }}>
            <div style={{ color:"#64748b",fontSize:11,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:6 }}>{activeSub?activeSub.name:"Total"} spent</div>
            <div style={{ color:"#f1f5f9",fontSize:28,fontWeight:800,letterSpacing:"-0.02em",lineHeight:1 }}>{fmt(viewSpent)}</div>
            {viewBudget>0 && <div style={{ marginTop:4,fontSize:13 }}><span style={{ color:viewSpent<=viewBudget?"#4ade80":"#f43f5e",fontWeight:700 }}>{viewSpent<=viewBudget?fmt(viewBudget-viewSpent)+" left":fmt(viewSpent-viewBudget)+" over"}</span><span style={{ color:"#475569" }}> of {fmt(viewBudget)}/mo</span></div>}
          </div>
          <button onClick={() => { setEditBudget(v=>!v); setBudgetInput(String(viewBudget)); }} className="btn-press"
            style={{ background:"#1e2533",border:"1px solid #2d3748",color:"#64748b",borderRadius:8,padding:"6px 10px",fontSize:11,cursor:"pointer",fontWeight:600,whiteSpace:"nowrap" }}>{editBudget?"Cancel":"Edit"}</button>
        </div>
        {editBudget && (
          <div style={{ display:"flex",gap:8,marginTop:14 }}>
            <input type="number" value={budgetInput} onChange={e => setBudgetInput(e.target.value)} onKeyDown={e => e.key==="Enter"&&saveBudget(budgetInput)}
              style={{ flex:1,background:"#0f1117",border:"1px solid #2d3748",borderRadius:8,color:"#f1f5f9",padding:"9px 12px",fontSize:14,outline:"none" }} autoFocus />
            <button onClick={() => saveBudget(budgetInput)} className="btn-press" style={{ background:"#4ade80",color:"#0f1117",border:"none",borderRadius:8,padding:"9px 16px",fontWeight:700,fontSize:13,cursor:"pointer" }}>Save</button>
          </div>
        )}
        {viewBudget>0 && <div style={{ marginTop:14,background:"#0f1117",borderRadius:99,height:5,overflow:"hidden" }}><div style={{ width:(Math.min(viewSpent/viewBudget,1)*100)+"%",background:viewSpent>viewBudget?"#f43f5e":viewColor,height:"100%",borderRadius:99 }} /></div>}
        <AlertBanner spent={viewSpent} budget={viewBudget} />
        {pace && <PaceBar pace={pace} />}
      </div>

      <div style={{ margin:"14px 20px 0",background:"#161b27",border:"1px solid #2d3748",borderRadius:14,padding:"16px 20px" }}>
        <div style={{ color:"#64748b",fontSize:11,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:12 }}>Weekly spending</div>
        <WeeklyBarChart transactions={transactions.filter(t=>viewIds.includes(t.categoryId))} color={viewColor} budget={viewBudget} year={year} month={month} />
      </div>

      <div style={{ padding:"16px 20px 0" }}>
        <div style={{ color:"#475569",fontSize:11,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:4 }}>{viewTxs.length} transaction{viewTxs.length!==1?"s":""}</div>
        {viewTxs.length===0
          ? <div style={{ textAlign:"center",color:"#334155",padding:"32px 0",fontSize:14 }}>No transactions yet. <span style={{ color:viewColor,cursor:"pointer" }} onClick={onAddTx}>Add one →</span></div>
          : viewTxs.map(tx => <TxRow key={tx.id} tx={tx} cats={categories} cards={cards} colorMap={colorMap} showCard onEdit={() => onEdit(tx)} onDelete={() => onDelete(tx.id)} />)}
      </div>
    </div>
  );
}

// ── STATEMENTS PAGE ───────────────────────────────────────────────────────────
function StatementsPage({ transactions, cards, colorMap, onMarkPaid, paidStatements, onDelete, onEdit, categories, statementBalances, onSetBalance }) {
  const [expandedCard, setExpandedCard] = useState(null);
  const [payModal, setPayModal] = useState(null); // { cardKey, cycleKey, amount }
  const [payInput, setPayInput] = useState("");
  const [dueDateEdit, setDueDateEdit] = useState({}); // { cardKey:cycleKey : true }
  const [dueDateInput, setDueDateInput] = useState({});
  const today = todayStr();

  // For a given card, get all unpaid closed statements sorted oldest first
  const getUnpaidStatements = (cardKey) => {
    return Object.entries(statementBalances)
      .filter(([k, v]) => k.startsWith(cardKey + ":") && !v.paid && v.balance > 0)
      .sort(([a], [b]) => a < b ? -1 : 1);
  };

  // Compute effective balance: raw transaction total minus any refunds allocated to this statement
  const getEffectiveBalance = (cardKey, cycleKey, rawTotal) => {
    const sb = statementBalances[cardKey + ":" + cycleKey];
    if (sb && sb.balance !== undefined) return sb.balance;
    return rawTotal;
  };

  return (
    <div style={{ padding:"20px 20px 0",paddingBottom:24 }}>
      <div style={{ color:"#f1f5f9",fontWeight:800,fontSize:20,marginBottom:16 }}>Statements</div>

      {/* Total owed across all cards */}
      {(() => {
        const totalOwed = cards.reduce((sum, card) => {
          const unpaid = getUnpaidStatements(card.id);
          return sum + unpaid.reduce((s, [, v]) => s + (v.balance || 0), 0);
        }, 0);
        if (totalOwed <= 0) return null;
        return (
          <div style={{ background:"#f43f5e14",border:"1px solid #f43f5e30",borderRadius:12,padding:"14px 16px",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
            <div>
              <div style={{ color:"#f43f5e",fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:2 }}>Total owed</div>
              <div style={{ color:"#f1f5f9",fontSize:22,fontWeight:800 }}>{fmt(totalOwed)}</div>
            </div>
            <div style={{ color:"#f43f5e",fontSize:28 }}>⚠</div>
          </div>
        );
      })()}

      {cards.map(cardDef => {
        const cardKey = cardDef.id;
        const closeDay = cardDef.closeDay;
        const color = cardDef.color;
        const current = getCycleForDate(today, closeDay);
        const currentTxs = transactions.filter(tx => tx.card === cardKey && txInCycle(tx, current.cycleStart, current.cycleEnd));
        const currentTotal = currentTxs.reduce((s, t) => s + t.amount, 0);

        // Last closed cycle
        const prevDate = new Date(current.cycleStart + "T00:00:00"); prevDate.setDate(prevDate.getDate() - 1);
        const prev = getCycleForDate(prevDate.toISOString().slice(0, 10), closeDay);
        const prevTxs = transactions.filter(tx => tx.card === cardKey && txInCycle(tx, prev.cycleStart, prev.cycleEnd));
        const prevRawTotal = prevTxs.reduce((s, t) => s + t.amount, 0);
        const prevKey = cardKey + ":" + prev.cycleKey;
        const prevSB = statementBalances[prevKey] || {};
        const prevBalance = prevSB.balance !== undefined ? prevSB.balance : prevRawTotal;
        const isPaid = prevSB.paid || false;
        const dueDate = prevSB.dueDate || "";

        // Unpaid older statements
        const unpaidOld = getUnpaidStatements(cardKey).filter(([k]) => k !== prevKey);

        const closeDate = new Date(current.cycleEnd + "T00:00:00");
        const daysLeft = Math.round((closeDate - new Date(today + "T00:00:00")) / 86400000);
        const totalCycleDays = Math.round((closeDate - new Date(current.cycleStart + "T00:00:00")) / 86400000) + 1;
        const isExpanded = expandedCard === cardKey;

        // Refunds in current open cycle
        const currentRefunds = currentTxs.filter(t => t.amount < 0);
        const hasUnpaidPrior = prevRawTotal > 0 && !isPaid;

        return (
          <div key={cardKey} style={{ marginBottom:16,background:"#161b27",border:"1px solid "+color+"30",borderRadius:14,overflow:"hidden" }}>
            {/* Card header */}
            <div style={{ padding:"16px 18px",borderBottom:"1px solid #1e2533" }}>
              <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12 }}>
                <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                  <div style={{ width:10,height:10,borderRadius:99,background:color }} />
                  <span style={{ color:"#f1f5f9",fontWeight:800,fontSize:16 }}>{cardDef.name}</span>
                </div>
                <CardBadge card={cardDef} />
              </div>

              {/* Open cycle */}
              <div style={{ background:"#0f1117",borderRadius:10,padding:"12px 14px" }}>
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6 }}>
                  <div>
                    <div style={{ color:"#475569",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:2 }}>Open Statement</div>
                    <div style={{ color:"#64748b",fontSize:12 }}>{cycleLabel(current.cycleStart, current.cycleEnd)}</div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ color,fontSize:22,fontWeight:800 }}>{fmt(currentTotal)}</div>
                    <div style={{ color:"#475569",fontSize:11,marginTop:1 }}>closes in {daysLeft} day{daysLeft !== 1 ? "s" : ""}</div>
                  </div>
                </div>
                <div style={{ background:"#1e2533",borderRadius:99,height:3,overflow:"hidden",marginTop:8 }}>
                  <div style={{ width:(Math.min((totalCycleDays - daysLeft) / totalCycleDays, 1) * 100)+"%",background:color,height:"100%",borderRadius:99 }} />
                </div>
                {/* Refund allocation notice */}
                {currentRefunds.length > 0 && hasUnpaidPrior && (
                  <div style={{ marginTop:8,background:"#4ade8010",border:"1px solid #4ade8030",borderRadius:6,padding:"6px 10px",fontSize:11,color:"#4ade80" }}>
                    ↩ {currentRefunds.length} refund{currentRefunds.length > 1 ? "s" : ""} ({fmt(Math.abs(currentRefunds.reduce((s,t)=>s+t.amount,0)))}) applied to prior unpaid balance
                  </div>
                )}
              </div>
            </div>

            {/* Last closed statement with balance due */}
            {prevRawTotal > 0 && (
              <div style={{ padding:"14px 18px",background:isPaid ? "#0f1117" : "#12161f",borderBottom:"1px solid #1e2533" }}>
                <div style={{ display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:isPaid ? 0 : 10 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ color:"#475569",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:2 }}>Last Statement</div>
                    <div style={{ color:"#64748b",fontSize:12,marginBottom:4 }}>{cycleLabel(prev.cycleStart, prev.cycleEnd)}</div>
                    {!isPaid && (
                      <div style={{ display:"flex",alignItems:"center",gap:8,marginTop:6 }}>
                        <span style={{ color:"#475569",fontSize:11 }}>Due:</span>
                        {dueDateEdit[prevKey] ? (
                          <div style={{ display:"flex",gap:6 }}>
                            <input type="date" value={dueDateInput[prevKey] || ""} onChange={e => setDueDateInput(x => ({...x,[prevKey]:e.target.value}))}
                              style={{ background:"#0f1117",border:"1px solid #2d3748",borderRadius:6,color:"#f1f5f9",padding:"3px 8px",fontSize:11,outline:"none" }} />
                            <button onClick={() => { onSetBalance(prevKey, { ...prevSB, dueDate: dueDateInput[prevKey] }); setDueDateEdit(x => ({...x,[prevKey]:false})); }} className="btn-press"
                              style={{ background:"#4ade80",color:"#0f1117",border:"none",borderRadius:6,padding:"3px 8px",fontSize:11,fontWeight:700,cursor:"pointer" }}>✓</button>
                          </div>
                        ) : (
                          <button onClick={() => { setDueDateEdit(x => ({...x,[prevKey]:true})); setDueDateInput(x => ({...x,[prevKey]:dueDate})); }} className="btn-press"
                            style={{ background:"none",border:"1px solid #2d3748",color:dueDate ? "#f1f5f9" : "#475569",borderRadius:6,padding:"3px 8px",fontSize:11,cursor:"pointer" }}>
                            {dueDate ? new Date(dueDate + "T00:00:00").toLocaleDateString("en-US", {month:"short",day:"numeric"}) : "Set due date"}
                          </button>
                        )}
                        {dueDate && !isPaid && (() => {
                          const days = Math.round((new Date(dueDate + "T00:00:00") - new Date(today + "T00:00:00")) / 86400000);
                          const urgent = days <= 3;
                          return <span style={{ color:urgent ? "#f43f5e" : "#475569",fontSize:11,fontWeight:urgent ? 700 : 400 }}>{days < 0 ? "OVERDUE" : days === 0 ? "due today" : days + "d left"}</span>;
                        })()}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ color:isPaid ? "#475569" : "#f1f5f9",fontSize:20,fontWeight:800,textDecoration:isPaid ? "line-through" : "none" }}>{fmt(prevBalance)}</div>
                    {prevBalance !== prevRawTotal && (
                      <div style={{ color:"#4ade80",fontSize:10,marginTop:1 }}>↩ {fmt(prevRawTotal - prevBalance)} applied</div>
                    )}
                  </div>
                </div>
                {!isPaid && (
                  <div style={{ display:"flex",gap:8 }}>
                    <button onClick={() => { setPayModal({ cardKey, cycleKey: prev.cycleKey, amount: prevBalance }); setPayInput(String(prevBalance)); }} className="btn-press"
                      style={{ flex:2,background:"#4ade8020",border:"1px solid #4ade8060",color:"#4ade80",borderRadius:8,padding:"8px",fontSize:12,fontWeight:700,cursor:"pointer" }}>
                      💳 Pay {fmt(prevBalance)}
                    </button>
                    <button onClick={() => onSetBalance(prevKey, { ...prevSB, paid: true, balance: prevBalance })} className="btn-press"
                      style={{ flex:1,background:"#1e2533",border:"1px solid #2d3748",color:"#64748b",borderRadius:8,padding:"8px",fontSize:12,fontWeight:700,cursor:"pointer" }}>
                      Mark paid
                    </button>
                  </div>
                )}
                {isPaid && (
                  <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between" }}>
                    <span style={{ color:"#4ade80",fontSize:12,fontWeight:700 }}>✓ Paid</span>
                    <button onClick={() => onSetBalance(prevKey, { ...prevSB, paid: false })} className="btn-press"
                      style={{ background:"none",border:"none",color:"#334155",fontSize:11,cursor:"pointer" }}>Undo</button>
                  </div>
                )}
              </div>
            )}

            {/* Older unpaid statements */}
            {unpaidOld.map(([k, v]) => (
              <div key={k} style={{ padding:"12px 18px",background:"#1a0f0f",borderBottom:"1px solid #1e2533" }}>
                <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between" }}>
                  <div>
                    <div style={{ color:"#f43f5e",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:2 }}>Unpaid Statement</div>
                    <div style={{ color:"#64748b",fontSize:11 }}>{k.split(":")[1]}</div>
                  </div>
                  <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                    <span style={{ color:"#f43f5e",fontSize:16,fontWeight:800 }}>{fmt(v.balance)}</span>
                    <button onClick={() => onSetBalance(k, { ...v, paid: true })} className="btn-press"
                      style={{ background:"#f43f5e20",border:"1px solid #f43f5e40",color:"#f43f5e",borderRadius:8,padding:"5px 10px",fontSize:11,fontWeight:700,cursor:"pointer" }}>Mark paid</button>
                  </div>
                </div>
              </div>
            ))}

            {/* Expand transactions */}
            <button onClick={() => setExpandedCard(isExpanded ? null : cardKey)}
              style={{ width:"100%",background:"none",border:"none",borderTop:"1px solid #1e2533",color:"#475569",padding:"10px",fontSize:12,cursor:"pointer",fontWeight:600 }}>
              {isExpanded ? "Hide" : "Show"} transactions ({currentTxs.length} this cycle)
            </button>
            {isExpanded && (
              <div style={{ padding:"0 18px 12px" }}>
                {currentTxs.length === 0
                  ? <div style={{ color:"#334155",fontSize:13,padding:"12px 0",textAlign:"center" }}>No transactions yet this cycle.</div>
                  : [...currentTxs].sort((a, b) => b.date > a.date ? 1 : -1).map(tx => (
                    <TxRow key={tx.id} tx={tx} cats={categories} cards={cards} colorMap={colorMap} onEdit={() => onEdit(tx)} onDelete={() => onDelete(tx.id)} />
                  ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Pay modal */}
      {payModal && (
        <div onClick={() => setPayModal(null)} style={{ position:"fixed",inset:0,background:"rgba(0,0,0,.78)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:500,padding:16,animation:"bgFade 0.2s ease" }}>
          <div onClick={e => e.stopPropagation()} style={{ background:"#161b27",border:"1px solid #2d3748",borderRadius:16,padding:24,width:"100%",maxWidth:340,fontFamily:"Inter,system-ui,sans-serif",animation:"scaleIn 0.25s ease" }}>
            <h3 style={{ color:"#f1f5f9",margin:"0 0 16px",fontSize:17,fontWeight:700 }}>Record payment</h3>
            <div style={{ color:"#64748b",fontSize:13,marginBottom:12 }}>How much did you pay?</div>
            <input type="number" value={payInput} onChange={e => setPayInput(e.target.value)} autoFocus
              style={{ width:"100%",background:"#0f1117",border:"1px solid #2d3748",borderRadius:8,color:"#f1f5f9",padding:"12px",fontSize:18,fontWeight:700,outline:"none",boxSizing:"border-box",marginBottom:16 }} />
            <div style={{ display:"flex",gap:8 }}>
              <button onClick={() => setPayModal(null)} className="btn-press"
                style={{ flex:1,background:"#1e2533",color:"#64748b",border:"1px solid #2d3748",borderRadius:8,padding:11,fontWeight:600,fontSize:14,cursor:"pointer" }}>Cancel</button>
              <button onClick={() => {
                const paid = parseFloat(payInput) || 0;
                const key = payModal.cardKey + ":" + payModal.cycleKey;
                const existing = statementBalances[key] || {};
                const remaining = Math.max(0, (existing.balance !== undefined ? existing.balance : payModal.amount) - paid);
                onSetBalance(key, { ...existing, balance: remaining, paid: remaining <= 0 });
                setPayModal(null);
              }} className="btn-press"
                style={{ flex:2,background:"#4ade80",color:"#0f1117",border:"none",borderRadius:8,padding:11,fontWeight:700,fontSize:14,cursor:"pointer" }}>Confirm payment</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── SETTINGS PAGE ─────────────────────────────────────────────────────────────
function SettingsPage({ categories, cards, colorMap, onAddCat, onRemoveCat, onSetBudget, onSetSubBudget, onAddSub, onRemoveSub, onAddCard, onRemoveCard, onUpdateCard }) {
  const [newName,setNewName]=useState(""), [newBudget,setNewBudget]=useState("");
  const [editingBudget,setEditingBudget]=useState({});
  const [expandedCat,setExpandedCat]=useState(null);
  const [newSubName,setNewSubName]=useState({}), [newSubBudget,setNewSubBudget]=useState({});
  const [newCardName,setNewCardName]=useState(""), [newCardShort,setNewCardShort]=useState(""), [newCardClose,setNewCardClose]=useState("15"), [newCardColor,setNewCardColor]=useState(ALL_COLORS[2]);
  const [editingCard,setEditingCard]=useState({});
  const IS={background:"#1e2533",border:"1px solid #2d3748",borderRadius:8,color:"#f1f5f9",padding:"9px 12px",fontSize:13,outline:"none",fontFamily:"Inter,system-ui,sans-serif"};
  const addCat=()=>{ const n=newName.trim(); if(n&&!categories.find(c=>c.name===n)){onAddCat(n,parseFloat(newBudget)||0);setNewName("");setNewBudget("");} };
  const addCard=()=>{ const n=newCardName.trim(),s=newCardShort.trim()||n.split(" ")[0]; if(!n) return; onAddCard({id:genId(),name:n,short:s,color:newCardColor,closeDay:parseInt(newCardClose)||15}); setNewCardName("");setNewCardShort("");setNewCardClose("15"); };

  return (
    <div style={{ padding:"20px 20px 0",paddingBottom:40 }}>
      <div style={{ color:"#f1f5f9",fontWeight:800,fontSize:20,marginBottom:20,animation:"fadeSlideUp 0.3s ease both" }}>Settings</div>

      <div style={{ marginBottom:28,animation:"fadeSlideUp 0.35s ease 0.05s both" }}>
        <div style={{ color:"#475569",fontSize:11,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:10 }}>Credit Cards</div>
        <div style={{ display:"flex",flexDirection:"column",gap:8,marginBottom:12 }}>
          {cards.map(card => {
            const ec=editingCard[card.id]||{}, isEditing=!!ec.open;
            return (
              <div key={card.id} style={{ background:"#161b27",borderRadius:12,border:"1px solid "+card.color+"30",overflow:"hidden" }}>
                <div style={{ display:"flex",alignItems:"center",gap:10,padding:"12px 14px" }}>
                  <div style={{ width:9,height:9,borderRadius:99,background:card.color,flexShrink:0 }} />
                  <div style={{ flex:1 }}><div style={{ color:"#f1f5f9",fontWeight:600,fontSize:13 }}>{card.name}</div><div style={{ color:"#475569",fontSize:11 }}>Closes day {card.closeDay} · {card.short}</div></div>
                  <button onClick={() => setEditingCard(e=>({...e,[card.id]:e[card.id]?.open?{}:{open:true,name:card.name,short:card.short,closeDay:String(card.closeDay),color:card.color}}))} className="btn-press"
                    style={{ background:"#0f1117",border:"1px solid #2d3748",color:"#94a3b8",borderRadius:6,padding:"5px 10px",fontSize:12,cursor:"pointer",fontWeight:600 }}>{isEditing?"Cancel":"Edit"}</button>
                  {cards.length>1 && <button onClick={() => onRemoveCard(card.id)} className="btn-press" style={{ background:"none",border:"none",color:"#475569",cursor:"pointer",fontSize:18,padding:0,lineHeight:1 }}>×</button>}
                </div>
                {isEditing && (
                  <div style={{ borderTop:"1px solid #1e2533",padding:"12px 14px",display:"flex",flexDirection:"column",gap:8 }}>
                    <div style={{ display:"flex",gap:8 }}>
                      <input value={ec.name||""} onChange={e=>setEditingCard(x=>({...x,[card.id]:{...x[card.id],name:e.target.value}}))} placeholder="Full name" style={Object.assign({},IS,{flex:2,fontSize:12,padding:"6px 10px"})} />
                      <input value={ec.short||""} onChange={e=>setEditingCard(x=>({...x,[card.id]:{...x[card.id],short:e.target.value}}))} placeholder="Short" style={Object.assign({},IS,{flex:1,fontSize:12,padding:"6px 10px"})} />
                    </div>
                    <div style={{ display:"flex",gap:8,alignItems:"center" }}>
                      <span style={{ color:"#475569",fontSize:12 }}>Closes day</span>
                      <input type="number" min="1" max="28" value={ec.closeDay||""} onChange={e=>setEditingCard(x=>({...x,[card.id]:{...x[card.id],closeDay:e.target.value}}))} style={Object.assign({},IS,{width:60,textAlign:"center",padding:"6px 8px",fontSize:12})} />
                      <div style={{ display:"flex",gap:5,flexWrap:"wrap",flex:1 }}>
                        {ALL_COLORS.slice(0,10).map(col => <button key={col} onClick={() => setEditingCard(x=>({...x,[card.id]:{...x[card.id],color:col}}))} style={{ width:20,height:20,borderRadius:99,background:col,border:ec.color===col?"2px solid #f1f5f9":"2px solid transparent",cursor:"pointer" }} />)}
                      </div>
                    </div>
                    <button onClick={() => { onUpdateCard(card.id,{name:ec.name,short:ec.short,closeDay:parseInt(ec.closeDay)||card.closeDay,color:ec.color}); setEditingCard(x=>({...x,[card.id]:{}})); }} className="btn-press"
                      style={{ background:"#4ade80",color:"#0f1117",border:"none",borderRadius:8,padding:8,fontWeight:700,fontSize:13,cursor:"pointer" }}>Save changes</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ background:"#161b27",borderRadius:12,padding:14,border:"1px solid #2d3748" }}>
          <div style={{ color:"#64748b",fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10 }}>Add card</div>
          <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
            <input value={newCardName} onChange={e=>setNewCardName(e.target.value)} placeholder="Card name" style={Object.assign({},IS,{width:"100%",boxSizing:"border-box"})} />
            <div style={{ display:"flex",gap:8 }}>
              <input value={newCardShort} onChange={e=>setNewCardShort(e.target.value)} placeholder="Short name" style={Object.assign({},IS,{flex:1})} />
              <div style={{ display:"flex",alignItems:"center",gap:6 }}>
                <span style={{ color:"#475569",fontSize:12,whiteSpace:"nowrap" }}>Closes day</span>
                <input type="number" min="1" max="28" value={newCardClose} onChange={e=>setNewCardClose(e.target.value)} style={Object.assign({},IS,{width:55,textAlign:"center",padding:"9px 6px"})} />
              </div>
            </div>
            <div style={{ display:"flex",gap:6,flexWrap:"wrap",alignItems:"center" }}>
              <span style={{ color:"#475569",fontSize:12 }}>Color:</span>
              {ALL_COLORS.slice(0,10).map(col => <button key={col} onClick={() => setNewCardColor(col)} style={{ width:22,height:22,borderRadius:99,background:col,border:newCardColor===col?"2px solid #f1f5f9":"2px solid transparent",cursor:"pointer" }} />)}
            </div>
            <button onClick={addCard} className="btn-press" style={{ background:"#4ade80",color:"#0f1117",border:"none",borderRadius:8,padding:9,fontWeight:700,fontSize:13,cursor:"pointer" }}>Add card</button>
          </div>
        </div>
      </div>

      <div style={{ animation:"fadeSlideUp 0.4s ease 0.1s both" }}>
        <div style={{ color:"#475569",fontSize:11,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:10 }}>Categories & Budgets</div>
        <div style={{ display:"flex",flexDirection:"column",gap:8,marginBottom:14 }}>
          {categories.map(c => {
            const color=getColor(colorMap,c.id), isExpanded=expandedCat===c.id, bKey=c.id, isEditingBudget=editingBudget[bKey]!==undefined;
            return (
              <div key={c.id} style={{ background:"#161b27",borderRadius:12,border:"1px solid #2d3748",overflow:"hidden" }}>
                <div style={{ display:"flex",alignItems:"center",gap:10,padding:"12px 14px" }}>
                  <div style={{ width:8,height:8,borderRadius:99,background:color,flexShrink:0 }} />
                  <div style={{ flex:1,color:"#f1f5f9",fontWeight:600,fontSize:13 }}>{c.name}</div>
                  {isEditingBudget
                    ? <><input type="number" value={editingBudget[bKey]} onChange={e=>setEditingBudget(v=>({...v,[bKey]:e.target.value}))} style={Object.assign({},IS,{width:90,textAlign:"right",padding:"6px 10px"})} onKeyDown={e=>{if(e.key==="Enter"){onSetBudget(c.id,parseFloat(editingBudget[bKey])||0);setEditingBudget(v=>{const n={...v};delete n[bKey];return n;});}}} autoFocus />
                      <button onClick={() => {onSetBudget(c.id,parseFloat(editingBudget[bKey])||0);setEditingBudget(v=>{const n={...v};delete n[bKey];return n;});}} className="btn-press" style={{ background:"#4ade80",color:"#0f1117",border:"none",borderRadius:6,padding:"5px 10px",fontWeight:700,fontSize:12,cursor:"pointer" }}>✓</button></>
                    : <button onClick={() => setEditingBudget(v=>({...v,[bKey]:String(c.budget||0)}))} className="btn-press" style={{ background:"#0f1117",border:"1px solid #2d3748",color:"#94a3b8",borderRadius:6,padding:"5px 10px",fontSize:12,cursor:"pointer",fontWeight:600 }}>{c.budget>0?fmt(c.budget)+"/mo":"Set budget"}</button>}
                  {categories.length>1 && <button onClick={() => onRemoveCat(c.id)} className="btn-press" style={{ background:"none",border:"none",color:"#475569",cursor:"pointer",fontSize:18,padding:0,lineHeight:1 }}>×</button>}
                </div>
                <button onClick={() => setExpandedCat(isExpanded?null:c.id)}
                  style={{ width:"100%",background:"none",border:"none",borderTop:"1px solid #1e2533",color:isExpanded?"#4ade80":"#475569",padding:"8px 14px",fontSize:12,cursor:"pointer",fontWeight:600,textAlign:"left",display:"flex",alignItems:"center",gap:6 }}>
                  <span style={{ fontSize:10 }}>{isExpanded?"▲":"▼"}</span>Subcategories {c.subcategories?.length>0?"("+c.subcategories.length+")":""}
                  {!isExpanded && <span style={{ color:"#334155",fontWeight:400,fontSize:11 }}> — tap to add/edit</span>}
                </button>
                {isExpanded && (
                  <div style={{ borderTop:"1px solid #1e2533",padding:"10px 14px" }}>
                    <div style={{ color:"#475569",fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8 }}>Subcategories</div>
                    {(c.subcategories||[]).map(sub => {
                      const sc=getColor(colorMap,sub.id), subKey=c.id+":"+sub.id, isEditingSub=editingBudget[subKey]!==undefined;
                      return (
                        <div key={sub.id} style={{ display:"flex",alignItems:"center",gap:8,marginBottom:8 }}>
                          <div style={{ width:6,height:6,borderRadius:99,background:sc,flexShrink:0 }} />
                          <div style={{ flex:1,color:"#94a3b8",fontSize:13 }}>{sub.name}</div>
                          {isEditingSub
                            ? <><input type="number" value={editingBudget[subKey]} onChange={e=>setEditingBudget(v=>({...v,[subKey]:e.target.value}))} style={Object.assign({},IS,{width:90,textAlign:"right",padding:"5px 8px"})} onKeyDown={e=>{if(e.key==="Enter"){onSetSubBudget(c.id,sub.id,parseFloat(editingBudget[subKey])||0);setEditingBudget(v=>{const n={...v};delete n[subKey];return n;});}}} autoFocus />
                              <button onClick={()=>{onSetSubBudget(c.id,sub.id,parseFloat(editingBudget[subKey])||0);setEditingBudget(v=>{const n={...v};delete n[subKey];return n;});}} className="btn-press" style={{ background:"#4ade80",color:"#0f1117",border:"none",borderRadius:6,padding:"4px 9px",fontWeight:700,fontSize:12,cursor:"pointer" }}>✓</button></>
                            : <button onClick={()=>setEditingBudget(v=>({...v,[subKey]:String(sub.budget||0)}))} className="btn-press" style={{ background:"#0f1117",border:"1px solid #2d3748",color:"#94a3b8",borderRadius:6,padding:"4px 9px",fontSize:12,cursor:"pointer",fontWeight:600 }}>{sub.budget>0?fmt(sub.budget)+"/mo":"Set budget"}</button>}
                          <button onClick={()=>onRemoveSub(c.id,sub.id)} className="btn-press" style={{ background:"none",border:"none",color:"#475569",cursor:"pointer",fontSize:16,padding:0,lineHeight:1 }}>×</button>
                        </div>
                      );
                    })}
                    <div style={{ display:"flex",gap:6,marginTop:6 }}>
                      <input value={newSubName[c.id]||""} onChange={e=>setNewSubName(v=>({...v,[c.id]:e.target.value}))} placeholder="Subcategory name" style={Object.assign({},IS,{flex:2,fontSize:12,padding:"6px 10px"})} />
                      <input type="number" value={newSubBudget[c.id]||""} onChange={e=>setNewSubBudget(v=>({...v,[c.id]:e.target.value}))} placeholder="$/mo" style={Object.assign({},IS,{flex:1,fontSize:12,padding:"6px 8px"})} />
                      <button onClick={() => { const n=(newSubName[c.id]||"").trim(); if(n){onAddSub(c.id,n,parseFloat(newSubBudget[c.id])||0);setNewSubName(v=>({...v,[c.id]:""}));setNewSubBudget(v=>({...v,[c.id]:""}));} }} className="btn-press"
                        style={{ background:"#4ade80",color:"#0f1117",border:"none",borderRadius:8,padding:"6px 12px",fontWeight:700,fontSize:12,cursor:"pointer",flexShrink:0 }}>Add</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ background:"#161b27",borderRadius:12,padding:14,border:"1px solid #2d3748" }}>
          <div style={{ color:"#64748b",fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10 }}>Add category</div>
          <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
            <input value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addCat()} placeholder="Category name" style={Object.assign({},IS,{width:"100%",boxSizing:"border-box"})} />
            <div style={{ display:"flex",gap:8 }}>
              <input type="number" value={newBudget} onChange={e=>setNewBudget(e.target.value)} placeholder="Monthly budget ($)" style={Object.assign({},IS,{flex:1})} />
              <button onClick={addCat} className="btn-press" style={{ background:"#4ade80",color:"#0f1117",border:"none",borderRadius:8,padding:"9px 20px",fontWeight:700,fontSize:13,cursor:"pointer",flexShrink:0 }}>Add</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── BOTTOM NAV ────────────────────────────────────────────────────────────────
function BottomNav({ active, onChange, unpaidCount }) {
  const [lastActive, setLastActive] = useState(active);
  const handleChange = id => { setLastActive(id); onChange(id); };
  return (
    <div style={{ position:"fixed",bottom:0,left:0,right:0,background:"rgba(10,12,20,0.96)",backdropFilter:"blur(12px)",borderTop:"1px solid rgba(255,255,255,0.06)",display:"flex",zIndex:100,maxWidth:520,margin:"0 auto" }}>
      {NAV.map(({ id, label, icon }) => {
        const isActive=active===id, justActivated=isActive&&lastActive!==id;
        return (
          <button key={id} onClick={() => handleChange(id)}
            style={{ flex:1,background:"none",border:"none",padding:"10px 0 16px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3,position:"relative",WebkitTapHighlightColor:"transparent" }}>
            {isActive && <div style={{ position:"absolute",top:0,left:"50%",transform:"translateX(-50%)",width:28,height:2.5,borderRadius:99,background:"#4ade80",boxShadow:"0 0 8px rgba(74,222,128,0.6)",animation:"scaleIn 0.25s ease" }} />}
            <span style={{ fontSize:19,color:isActive?"#4ade80":"#2d3f50",transition:"color 0.2s ease",filter:isActive?"drop-shadow(0 0 5px rgba(74,222,128,0.45))":"none",animation:justActivated?"navPop 0.4s ease":"none" }}>{icon}</span>
            <span style={{ fontSize:10,fontWeight:700,color:isActive?"#4ade80":"#2d3f50",letterSpacing:"0.05em",transition:"color 0.2s ease" }}>{label}</span>
            {id==="statements"&&unpaidCount>0 && <span style={{ position:"absolute",top:5,right:"50%",marginRight:-20,background:"#f43f5e",color:"#fff",borderRadius:99,fontSize:9,fontWeight:800,padding:"1px 5px",lineHeight:1.4,animation:"popIn 0.4s ease",boxShadow:"0 0 8px rgba(244,63,94,0.5)" }}>{unpaidCount}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ── ROOT APP ──────────────────────────────────────────────────────────────────
export default function BudgetTrackerV5() {
  const now = new Date();
  const [ready,setReady]=useState(false);
  const [categories,setCategories]=useState([]);
  const [cards,setCards]=useState(DEFAULT_CARDS);
  const [transactions,setTransactions]=useState([]);
  const [paidStatements,setPaidStatements]=useState({});
  const [statementBalances,setStatementBalances]=useState({});
  const [activeTab,setActiveTab]=useState("home");
  const [activeCatId,setActiveCatId]=useState(null);
  const [viewYear,setViewYear]=useState(now.getFullYear());
  const [viewMonth,setViewMonth]=useState(now.getMonth());
  const [showAdd,setShowAdd]=useState(false);
  const [addDefaultCatId,setAddDefaultCatId]=useState(null);
  const [editTx,setEditTx]=useState(null);

  useEffect(() => {
    let el = document.getElementById("bt-styles");
    if (!el) { el = document.createElement("style"); el.id = "bt-styles"; document.head.appendChild(el); }
    el.textContent = CSS;
  }, []);

  useEffect(() => {
    (async () => {
      const d = await loadData();
      if (d) { setCategories(d.categories||DEFAULT_CATEGORIES); setCards(d.cards||DEFAULT_CARDS); setTransactions(d.transactions||[]); setPaidStatements(d.paidStatements||{}); setStatementBalances(d.statementBalances||{}); }
      else { setCategories(DEFAULT_CATEGORIES); setCards(DEFAULT_CARDS); }
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!ready) return;
    saveData({ categories, cards, transactions, paidStatements, statementBalances });
  }, [categories, cards, transactions, paidStatements, statementBalances, ready]);

  const addCat    = (name,budget) => setCategories(cs=>[...cs,{id:genId(),name,budget,subcategories:[]}]);
  const removeCat = id => { setCategories(cs=>cs.filter(c=>c.id!==id)); if(activeCatId===id) setActiveCatId(null); };
  const setBudget = (id,val) => setCategories(cs=>cs.map(c=>c.id===id?{...c,budget:val}:c));
  const addSub    = (catId,name,budget) => setCategories(cs=>cs.map(c=>c.id===catId?{...c,subcategories:[...(c.subcategories||[]),{id:genId(),name,budget}]}:c));
  const removeSub = (catId,subId) => setCategories(cs=>cs.map(c=>c.id===catId?{...c,subcategories:c.subcategories.filter(s=>s.id!==subId)}:c));
  const setSubBudget = (catId,subId,val) => setCategories(cs=>cs.map(c=>c.id===catId?{...c,subcategories:c.subcategories.map(s=>s.id===subId?{...s,budget:val}:s)}:c));
  const addCardFn   = card => setCards(cs=>[...cs,card]);
  const removeCard  = id   => setCards(cs=>cs.filter(c=>c.id!==id));
  const updateCard  = (id,updates) => setCards(cs=>cs.map(c=>c.id===id?{...c,...updates}:c));
  const setBalance  = (key, val) => setStatementBalances(s => ({...s, [key]: val}));

  // When a refund is logged, apply it to the oldest unpaid statement balance on that card
  const addTx = tx => {
    setTransactions(t => [tx, ...t]);
    if (tx.amount < 0) {
      const refundAmt = Math.abs(tx.amount);
      setStatementBalances(prev => {
        const updated = { ...prev };
        // find oldest unpaid statement for this card, sorted ascending
        const unpaid = Object.entries(updated)
          .filter(([k, v]) => k.startsWith(tx.card + ":") && !v.paid && v.balance > 0)
          .sort(([a], [b]) => a < b ? -1 : 1);
        if (unpaid.length > 0) {
          const [key, sb] = unpaid[0];
          const newBalance = Math.max(0, sb.balance - refundAmt);
          updated[key] = { ...sb, balance: newBalance, paid: newBalance <= 0 };
        }
        return updated;
      });
    }
  };
  const deleteTx = id  => setTransactions(t=>t.filter(x=>x.id!==id));
  const updateTx = tx  => setTransactions(t=>t.map(x=>x.id===tx.id?tx:x));
  const openEdit = tx  => { setEditTx(tx); setShowAdd(true); };
  const markPaid = (key,paid) => setPaidStatements(s=>({...s,[key]:paid}));

  const isCurrentMonth = viewYear===now.getFullYear()&&viewMonth===now.getMonth();
  const prevMonth = () => { if(viewMonth===0){setViewMonth(11);setViewYear(y=>y-1);}else setViewMonth(m=>m-1); };
  const nextMonth = () => { if(isCurrentMonth)return; if(viewMonth===11){setViewMonth(0);setViewYear(y=>y+1);}else setViewMonth(m=>m+1); };

  const colorMap = buildColorMap(categories, cards);
  const unpaidCount = cards.filter(card => {
    const cur = getCycleForDate(todayStr(), card.closeDay);
    const pd = new Date(cur.cycleStart + "T00:00:00"); pd.setDate(pd.getDate() - 1);
    const prv = getCycleForDate(pd.toISOString().slice(0, 10), card.closeDay);
    const key = card.id + ":" + prv.cycleKey;
    const sb = statementBalances[key];
    if (sb) return !sb.paid && sb.balance > 0;
    // fall back to raw transaction total
    const tot = transactions.filter(tx => tx.card === card.id && txInCycle(tx, prv.cycleStart, prv.cycleEnd)).reduce((s,t) => s + t.amount, 0);
    return tot > 0 && !paidStatements[key];
  }).length;

  if (!ready) return null;
  const sharedMonth = { year:viewYear,month:viewMonth,isCurrentMonth,onPrev:prevMonth,onNext:nextMonth };

  return (
    <div style={{ background:"#0f1117",minHeight:"100vh",maxWidth:520,margin:"0 auto",fontFamily:"Inter,system-ui,sans-serif",color:"#f1f5f9" }}>
      {!activeCatId && (
        <div style={{ position:"sticky",top:0,zIndex:90,background:"rgba(15,17,23,0.95)",backdropFilter:"blur(12px)",borderBottom:"1px solid rgba(255,255,255,0.05)",padding:"12px 20px",display:"flex",alignItems:"center",justifyContent:"space-between" }}>
          <span style={{ fontSize:11,letterSpacing:"0.15em",textTransform:"uppercase",color:"#4ade80",fontWeight:700 }}>Budget Tracker</span>
          {activeTab!=="settings" && (
            <button onClick={() => { setAddDefaultCatId(null); setShowAdd(true); }} className="btn-press"
              style={{ background:"#4ade80",color:"#0f1117",border:"none",borderRadius:8,padding:"7px 16px",fontWeight:800,fontSize:20,cursor:"pointer",lineHeight:1,animation:"popIn 0.3s ease" }}>+</button>
          )}
        </div>
      )}

      <div style={{ paddingBottom:72 }}>
        {activeCatId ? (
          <CategoryDetailPage catId={activeCatId} categories={categories} cards={cards} colorMap={colorMap} transactions={transactions}
            year={viewYear} month={viewMonth} onBack={() => setActiveCatId(null)}
            onAddTx={() => { setAddDefaultCatId(activeCatId); setShowAdd(true); }}
            onDelete={deleteTx} onEdit={openEdit} onSetBudget={setBudget} onSetSubBudget={setSubBudget} />
        ) : activeTab==="home" ? (
          <HomePage categories={categories} cards={cards} colorMap={colorMap} transactions={transactions} {...sharedMonth} />
        ) : activeTab==="budget" ? (
          <BudgetPage categories={categories} cards={cards} colorMap={colorMap} transactions={transactions} {...sharedMonth}
            onCategoryClick={id => setActiveCatId(id)} onDelete={deleteTx} onEdit={openEdit} />
        ) : activeTab==="statements" ? (
          <StatementsPage transactions={transactions} cards={cards} colorMap={colorMap} categories={categories}
            onMarkPaid={markPaid} paidStatements={paidStatements}
            statementBalances={statementBalances} onSetBalance={setBalance}
            onDelete={deleteTx} onEdit={openEdit} />
        ) : (
          <SettingsPage categories={categories} cards={cards} colorMap={colorMap}
            onAddCat={addCat} onRemoveCat={removeCat} onSetBudget={setBudget}
            onSetSubBudget={setSubBudget} onAddSub={addSub} onRemoveSub={removeSub}
            onAddCard={addCardFn} onRemoveCard={removeCard} onUpdateCard={updateCard} />
        )}
      </div>

      {!activeCatId && <BottomNav active={activeTab} onChange={setActiveTab} unpaidCount={unpaidCount} />}

      {showAdd && (
        <AddModal categories={categories} cards={cards} defaultCatId={addDefaultCatId}
          defaultCard={cards[0]?.id} editTx={editTx}
          onSave={tx => { editTx?updateTx(tx):addTx(tx); }}
          onClose={() => { setShowAdd(false); setAddDefaultCatId(null); setEditTx(null); }} />
      )}
    </div>
  );
}
