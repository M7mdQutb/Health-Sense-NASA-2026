import { LAYERS } from '@/data/bodyRegions';
import { useTwinStore } from '@/store/useTwinStore';
import { useTelemetry } from '@/services/telemetry/useTelemetry';

/** Temporary shell. Task 2 replaces the center with <TwinCanvas/>, Task 3 adds the sidebar. */
export default function App() {
  useTelemetry();
  const activeLayer = useTwinStore((s) => s.activeLayer);
  const setLayer = useTwinStore((s) => s.setLayer);
  const count = useTwinStore((s) => Object.keys(s.readings).length);

  return (
    <main style={{ display: 'grid', placeItems: 'center', height: '100%', padding: 24 }}>
      <section className="glass" data-status="nominal" style={{ padding: 24, maxWidth: 440 }}>
        <h1>Foundation check</h1>
        <p style={{ color: 'var(--text-dim)' }}>{count} live readings streaming into the store.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {LAYERS.map((l) => (
            <button key={l.id} className="chip" aria-pressed={activeLayer === l.id} onClick={() => setLayer(l.id)}>
              {l.label}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
