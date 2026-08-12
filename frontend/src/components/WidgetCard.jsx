// ============================================================
// YOUXIS IOT — Carte générique d'un widget
// Choisit le bon sous-widget selon le type et gère la suppression.
// ============================================================
import { useLiveData } from '../hooks/useLiveData.jsx';
import Gauge from './widgets/Gauge.jsx';
import Chart from './widgets/Chart.jsx';
import ButtonWidget from './widgets/ButtonWidget.jsx';
import SliderWidget from './widgets/SliderWidget.jsx';

export default function WidgetCard({ widget, onDelete, onCommand }) {
  const { liveData, deviceStatus } = useLiveData() || {};
  const live = liveData?.[widget.datastream_id];
  const online = deviceStatus?.[widget.device_id];
  const value = live ? live.value : widget.last ? widget.last.value : null;

  const label = widget.label || widget.ds_key;

  let body;
  if (widget.type === 'gauge') body = <Gauge label={label} unit={widget.unit} value={value} />;
  else if (widget.type === 'chart') body = <Chart widget={widget} live={live} />;
  else if (widget.type === 'button') body = <ButtonWidget label={label} value={value} onCommand={onCommand} />;
  else if (widget.type === 'slider') body = <SliderWidget label={label} unit={widget.unit} config={widget.config} value={value} onCommand={onCommand} />;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="mb-3 flex items-start justify-between">
        <div className="min-w-0">
          <div className="text-xs text-slate-500">
            {widget.device_name} · {widget.ds_key}
          </div>
          <div className="truncate font-semibold">{label}</div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={
              'rounded-full px-2 py-0.5 text-[10px] ' +
              (online ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-800 text-slate-500')
            }
          >
            {online ? 'en ligne' : 'hors ligne'}
          </span>
          <button
            onClick={() => onDelete(widget.id)}
            className="text-slate-600 transition-colors hover:text-red-400"
            title="Supprimer le widget"
          >
            ✕
          </button>
        </div>
      </div>
      {body}
    </div>
  );
}