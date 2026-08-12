// ============================================================
// YOUXIS IOT — Widget : GRAPHIQUE (historique en temps réel)
// Charge l'historique, puis s'alimente en direct via WebSocket.
// ============================================================
import { useEffect, useRef, useState } from 'react';
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { api } from '../../lib/api.js';
import { fmtTime } from '../../lib/format.js';

export default function Chart({ widget, live }) {
  const [series, setSeries] = useState([]);
  const keepRef = useRef([]);

  // 1) Chargement de l'historique au montage
  useEffect(() => {
    keepRef.current = [];
    setSeries([]);
    api
      .getHistory(widget.datastream_id, 100)
      .then((points) => {
        const s = points.map((p) => ({ t: p.createdAt, v: p.value }));
        keepRef.current = s;
        setSeries(s);
      })
      .catch(() => {});
  }, [widget.datastream_id]);

  // 2) Ajout des points reçus en temps réel (déduplication par timestamp)
  useEffect(() => {
    if (!live || !live.createdAt) return;
    const t = live.createdAt;
    const arr = keepRef.current;
    if (arr.length && arr[arr.length - 1].t === t) return;
    const next = [...arr, { t, v: live.value }].slice(-200);
    keepRef.current = next;
    setSeries(next);
  }, [live?.createdAt]); // eslint-disable-line

  if (series.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-500">En attente de données…</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={series} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
        <XAxis
          dataKey="t"
          tickFormatter={(t) => fmtTime(t)}
          stroke="#64748b"
          fontSize={10}
          minTickGap={40}
        />
        <YAxis stroke="#64748b" fontSize={11} width={38} />
        <Tooltip
          labelFormatter={(t) => fmtTime(t)}
          contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
        />
        <Line type="monotone" dataKey="v" stroke="#22d3ee" strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}