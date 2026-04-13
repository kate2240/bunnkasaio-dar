import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
// ★ StackBlitz用にパッケージから読み込む形に変更しています
import { createClient } from '@supabase/supabase-js';

// ── Supabase 初期設定 ─────────────────────────────────────
// ★下の2行をご自身のSupabaseのURLとキーに書き換えてください
const supabaseUrl = 'https://ylbkbwrurxndlebigyyb.supabase.co';
const supabaseKey = 'sb_publishable_PtSgQKOp6xG-945xmJ5ccA_ZpXmjvn6';
const supabase = createClient(supabaseUrl, supabaseKey);

const statusColor = (s) =>
  s === '受付中' ? '#f59e0b' : s === '準備中' ? '#e879a0' : '#10b981';
const statusBg = (s) =>
  s === '受付中' ? '#fffbeb' : s === '準備中' ? '#fff0f6' : '#f0fdf4';

function playNotif(enabled) {
  if (!enabled) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [523, 659, 784].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        ctx.currentTime + i * 0.15 + 0.3
      );
      osc.start(ctx.currentTime + i * 0.15);
      osc.stop(ctx.currentTime + i * 0.15 + 0.35);
    });
  } catch {}
}

export default function KitchenApp() {
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('受付中');
  // ★ブラウザの音声ブロック対策：最初はOFFにしておき、スタッフがONにする設計
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const prevIdsRef = useRef(new Set());
  const soundRef = useRef(false);

  useEffect(() => {
    soundRef.current = soundEnabled;
  }, [soundEnabled]);

  // ── Supabase データ取得とリアルタイム監視 ──────────────────────
  useEffect(() => {
    const fetchOrders = async () => {
      const { data } = await supabase
        .from('orders')
        .select('*')
        .order('id', { ascending: false });
      if (data) {
        const newKeys = new Set(data.map((o) => o.id));
        if (prevIdsRef.current.size > 0) {
          const added = data.filter((o) => !prevIdsRef.current.has(o.id));
          // 新しい注文があれば音を鳴らす
          if (added.length > 0) playNotif(soundRef.current);
        }
        prevIdsRef.current = newKeys;
        setOrders(data);
      }
    };

    fetchOrders(); // 初回読み込み

    // 変更があった時だけ自動更新（ポーリングの代わり）
    const channel = supabase
      .channel('realtime-kitchen')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        fetchOrders
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  // ステータス変更（Supabase対応）
  const updateStatus = async (id, status) => {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o))); // 画面を先に更新
    await supabase.from('orders').update({ status }).eq('id', id); // DBを更新
  };

  const active = orders.filter((o) => o.status !== '完了');
  const done = orders.filter((o) => o.status === '完了');
  const counts = {
    受付中: orders.filter((o) => o.status === '受付中').length,
    準備中: orders.filter((o) => o.status === '準備中').length,
  };
  const filtered =
    filter === 'すべて' ? active : orders.filter((o) => o.status === filter);

  const OrderCard = ({ order }) => (
    <div
      style={{
        background: statusBg(order.status),
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderLeft: `5px solid ${statusColor(order.status)}`,
        boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
        animation: order.status === '受付中' ? 'pulse 2s infinite' : 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              background: statusColor(order.status),
              color: 'white',
              fontSize: 12,
              fontWeight: 900,
              borderRadius: 8,
              padding: '3px 10px',
            }}
          >
            {order.status}
          </span>
          <span style={{ fontWeight: 900, fontSize: 20, color: '#1a1a2e' }}>
            #{order.id}
          </span>
          {order.tableNum && order.tableNum !== '未設定' && (
            <span
              style={{
                background: '#1a1a2e',
                color: 'white',
                fontSize: 11,
                borderRadius: 8,
                padding: '2px 8px',
              }}
            >
              テーブル {order.tableNum}
            </span>
          )}
        </div>
        <span style={{ fontSize: 13, color: '#666', fontWeight: 700 }}>
          {order.time}
        </span>
      </div>
      <div style={{ marginBottom: 12 }}>
        {order.items?.map((entry, ei) => (
          <div
            key={ei}
            style={{
              background: 'rgba(0,0,0,0.05)',
              borderRadius: 10,
              padding: '8px 12px',
              marginBottom: 6,
            }}
          >
            {entry.type === 'drink' ? (
              <div style={{ fontWeight: 700, fontSize: 15, color: '#1a1a2e' }}>
                {entry.drink?.emoji} {entry.drink?.name} ×{entry.qty}
              </div>
            ) : (
              entry.waffles?.map((w, wi) => (
                <div
                  key={wi}
                  style={{
                    marginBottom: wi < entry.waffles.length - 1 ? 8 : 0,
                  }}
                >
                  <div
                    style={{ fontWeight: 700, fontSize: 15, color: '#1a1a2e' }}
                  >
                    {entry.type === 'set'
                      ? `✨ セット (${entry.drink?.emoji}${entry.drink?.name})`
                      : '🧇 ワッフル'}
                    <span
                      style={{ fontSize: 12, color: '#888', marginLeft: 6 }}
                    >
                      {wi + 1}個目
                    </span>
                  </div>
                  {w.toppings?.length > 0 ? (
                    <div
                      style={{
                        fontSize: 13,
                        color: '#e8457a',
                        paddingLeft: 14,
                        marginTop: 3,
                      }}
                    >
                      {w.toppings.map((t) => `${t.emoji}${t.name}`).join(' · ')}
                    </div>
                  ) : (
                    <div
                      style={{ fontSize: 12, color: '#aaa', paddingLeft: 14 }}
                    >
                      トッピングなし
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {['受付中', '準備中', '完了'].map((s) => (
          <button
            key={s}
            onClick={() => updateStatus(order.id, s)}
            style={{
              flex: 1,
              padding: '12px 0',
              borderRadius: 12,
              border: 'none',
              cursor: 'pointer',
              fontWeight: 900,
              fontSize: 14,
              fontFamily: 'inherit',
              background: order.status === s ? statusColor(s) : '#e8e8f0',
              color: order.status === s ? 'white' : '#888',
              boxShadow:
                order.status === s ? `0 3px 12px ${statusColor(s)}66` : 'none',
              transition: 'all 0.2s',
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div
      style={{
        fontFamily: "'Zen Kaku Gothic New','Noto Sans JP',sans-serif",
        background: '#0f0f1a',
        minHeight: '100vh',
        color: 'white',
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;700;900&display=swap"
        rel="stylesheet"
      />
      <header
        style={{
          background: 'linear-gradient(135deg,#16213e,#0f3460)',
          padding: '0 16px',
          borderBottom: '2px solid #e8457a',
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}
      >
        <div
          style={{
            maxWidth: 640,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: 60,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 28 }}>👨‍🍳</span>
            <div>
              <div style={{ fontWeight: 900, fontSize: 18 }}>厨房モニター</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                リアルタイム同期中🟢
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => setSoundEnabled((v) => !v)}
              style={{
                background: soundEnabled ? '#e8457a' : '#333',
                border: 'none',
                borderRadius: 20,
                padding: '5px 12px',
                color: 'white',
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {soundEnabled ? '🔔 ON' : '🔕 OFF'}
            </button>
            {counts['受付中'] > 0 && (
              <div
                style={{
                  background: '#f59e0b',
                  color: 'white',
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 900,
                  padding: '3px 10px',
                }}
              >
                受付中 {counts['受付中']}
              </div>
            )}
            {counts['準備中'] > 0 && (
              <div
                style={{
                  background: '#e879a0',
                  color: 'white',
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 900,
                  padding: '3px 10px',
                }}
              >
                準備中 {counts['準備中']}
              </div>
            )}
          </div>
        </div>
      </header>
      <div
        style={{ maxWidth: 640, margin: '0 auto', padding: '12px 12px 60px' }}
      >
        {/* 音声ブロック対策の案内 */}
        {!soundEnabled && (
          <div
            style={{
              background: 'rgba(232, 69, 122, 0.2)',
              border: '1px solid #e8457a',
              borderRadius: 12,
              padding: 12,
              marginBottom: 16,
              fontSize: 13,
              color: '#ffb3c6',
              textAlign: 'center',
            }}
          >
            💡 右上の「🔕 OFF」を押して「🔔
            ON」にすると、新しい注文が来たときに通知音が鳴るようになります。
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          {['受付中', '準備中', 'すべて'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                flex: 1,
                padding: '9px 4px',
                borderRadius: 10,
                border: 'none',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: 13,
                fontFamily: 'inherit',
                background:
                  filter === f
                    ? f === 'すべて'
                      ? '#555'
                      : '#e8457a'
                    : '#1e1e30',
                color: 'white',
                opacity: filter === f ? 1 : 0.45,
                transition: 'all 0.2s',
              }}
            >
              {f}
              {f === 'すべて' ? ` (${active.length})` : ` (${counts[f] ?? 0})`}
            </button>
          ))}
        </div>
        {filtered.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: 80,
              color: 'rgba(255,255,255,0.25)',
            }}
          >
            <div style={{ fontSize: 56, marginBottom: 14 }}>🍽️</div>
            <div style={{ fontSize: 16 }}>
              {filter === '受付中'
                ? '新しい注文を待っています…'
                : '注文がありません'}
            </div>
          </div>
        ) : (
          filtered.map((order) => <OrderCard key={order.id} order={order} />)
        )}
        {done.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <button
              onClick={() => setShowDone((v) => !v)}
              style={{
                width: '100%',
                padding: '10px 16px',
                borderRadius: 12,
                border: '1.5px solid #1e4a3a',
                background: showDone ? '#0d2e22' : '#111827',
                cursor: 'pointer',
                fontFamily: 'inherit',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: showDone ? 10 : 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{ fontWeight: 900, fontSize: 14, color: '#10b981' }}
                >
                  ✅ 完了済み
                </span>
                <span
                  style={{
                    background: '#10b981',
                    color: 'white',
                    borderRadius: 10,
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '1px 8px',
                  }}
                >
                  {done.length}件
                </span>
              </div>
              <span style={{ color: '#10b981', fontSize: 13, fontWeight: 700 }}>
                {showDone ? '▲ 閉じる' : '▼ 履歴を見る'}
              </span>
            </button>
            {showDone &&
              done.map((order) => <OrderCard key={order.id} order={order} />)}
          </div>
        )}
      </div>
      <style>{`@keyframes pulse{0%,100%{box-shadow:0 4px 20px rgba(0,0,0,0.25)}50%{box-shadow:0 4px 30px rgba(245,158,11,0.55)}}*{-webkit-tap-highlight-color:transparent}`}</style>
    </div>
  );
}

const root = createRoot(document.getElementById('root'));
root.render(<KitchenApp />);
