import { useEffect, useRef } from "react";
import { useT } from "../i18n";
import { useKB } from "../kb";

type Node = {
  id: string;
  label: string;
  size: number;
  color: string;
  roadmapId?: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hub: boolean;
};

export function TopicMap({ active }: { active: boolean }) {
  const { data, lang, go } = useKB();
  const { t } = useT();
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const nodes = useRef<Node[]>([]);
  const view = useRef({ x: 0, y: 0, k: 1 });
  const drag = useRef<{ id: string; px: number; py: number } | null>(null);
  const pan = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

  useEffect(() => {
    const colors = new Map(data.roadmaps.map((r) => [r.id, r.color || "#1d1b18"]));
    const raw = data.topicMap.nodes || [];
    nodes.current = raw.map((n, i) => {
      const ang = (i / Math.max(1, raw.length)) * Math.PI * 2;
      const hub = n.id === n.roadmap_id;
      return {
        id: n.id,
        label: lang === "en" ? n.label_en || n.label_ar : n.label_ar || n.label_en,
        size: Math.max(8, Math.min(36, 8 + Math.sqrt(n.size || 1) * 4)),
        color: colors.get(n.roadmap_id || "") || "#8a8175",
        roadmapId: n.roadmap_id,
        x: Math.cos(ang) * (hub ? 80 : 220),
        y: Math.sin(ang) * (hub ? 80 : 220),
        vx: 0,
        vy: 0,
        hub,
      };
    });
  }, [data.topicMap, data.roadmaps, lang]);

  useEffect(() => {
    const cnv = canvas.current;
    const box = wrap.current;
    if (!cnv || !box) return;
    const ctx = cnv.getContext("2d");
    if (!ctx) return;
    let frame = 0;
    let running = true;

    const resize = () => {
      const r = box.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cnv.width = Math.max(1, Math.floor(r.width * dpr));
      cnv.height = Math.max(1, Math.floor(r.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(box);

    const edges = data.topicMap.edges || [];
    const byId = () => new Map(nodes.current.map((n) => [n.id, n]));

    const step = () => {
      if (!running) return;
      frame = requestAnimationFrame(step);
      if (!active) return;
      const list = nodes.current;
      const map = byId();
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i];
          const b = list[j];
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          let d2 = dx * dx + dy * dy || 0.01;
          const dist = Math.sqrt(d2);
          const force = 900 / d2;
          dx = (dx / dist) * force;
          dy = (dy / dist) * force;
          if (drag.current?.id !== a.id) { a.vx += dx; a.vy += dy; }
          if (drag.current?.id !== b.id) { b.vx -= dx; b.vy -= dy; }
        }
      }
      for (const e of edges) {
        const a = map.get(e.source);
        const b = map.get(e.target);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = (dist - 140) * 0.012;
        if (drag.current?.id !== a.id) { a.vx += (dx / dist) * f; a.vy += (dy / dist) * f; }
        if (drag.current?.id !== b.id) { b.vx -= (dx / dist) * f; b.vy -= (dy / dist) * f; }
      }
      for (const n of list) {
        if (drag.current?.id === n.id) continue;
        n.vx += -n.x * 0.004;
        n.vy += -n.y * 0.004;
        n.vx *= 0.82;
        n.vy *= 0.82;
        n.x += n.vx;
        n.y += n.vy;
      }
      const w = box.clientWidth;
      const h = box.clientHeight;
      const v = view.current;
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.translate(w / 2 + v.x, h / 2 + v.y);
      ctx.scale(v.k, v.k);
      ctx.lineWidth = 1;
      ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--rule-strong") || "#d3cab8";
      ctx.beginPath();
      for (const e of edges) {
        const a = map.get(e.source);
        const b = map.get(e.target);
        if (!a || !b) continue;
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
      ctx.direction = lang === "ar" ? "rtl" : "ltr";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const ink = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "#1d1b18";
      const paper = getComputedStyle(document.documentElement).getPropertyValue("--bg-raised").trim() || "#fff";
      for (const n of list) {
        ctx.beginPath();
        ctx.fillStyle = n.color;
        ctx.globalAlpha = n.hub ? 0.95 : 0.8;
        ctx.arc(n.x, n.y, n.hub ? n.size : Math.max(7, n.size * 0.55), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        const label = n.label.length > 42 ? n.label.slice(0, 40) + "…" : n.label;
        ctx.font = `${n.hub ? 13 : 11}px "IBM Plex Sans Arabic", "Schibsted Grotesk", sans-serif`;
        const tw = Math.min(160, ctx.measureText(label).width);
        const y = n.y + (n.hub ? n.size : n.size * 0.55) + 12;
        ctx.fillStyle = paper;
        ctx.globalAlpha = 0.9;
        ctx.fillRect(n.x - tw / 2 - 4, y - 8, tw + 8, 16);
        ctx.globalAlpha = 1;
        ctx.fillStyle = ink;
        ctx.fillText(label, n.x, y, 160);
      }
      ctx.restore();
    };
    frame = requestAnimationFrame(step);

    const toWorld = (ev: PointerEvent) => {
      const r = cnv.getBoundingClientRect();
      const v = view.current;
      return {
        x: (ev.clientX - r.left - r.width / 2 - v.x) / v.k,
        y: (ev.clientY - r.top - r.height / 2 - v.y) / v.k,
      };
    };
    const hit = (x: number, y: number) => {
      for (let i = nodes.current.length - 1; i >= 0; i--) {
        const n = nodes.current[i];
        const rad = (n.hub ? n.size : Math.max(7, n.size * 0.55)) + 8;
        if ((n.x - x) ** 2 + (n.y - y) ** 2 <= rad * rad) return n;
      }
      return null;
    };
    const down = (ev: PointerEvent) => {
      const p = toWorld(ev);
      const n = hit(p.x, p.y);
      if (n) drag.current = { id: n.id, px: p.x, py: p.y };
      else pan.current = { x: ev.clientX, y: ev.clientY, vx: view.current.x, vy: view.current.y };
      cnv.setPointerCapture(ev.pointerId);
    };
    const move = (ev: PointerEvent) => {
      if (drag.current) {
        const p = toWorld(ev);
        const n = nodes.current.find((x) => x.id === drag.current!.id);
        if (n) { n.x = p.x; n.y = p.y; n.vx = 0; n.vy = 0; }
      } else if (pan.current) {
        view.current.x = pan.current.vx + (ev.clientX - pan.current.x);
        view.current.y = pan.current.vy + (ev.clientY - pan.current.y);
      }
    };
    const up = (ev: PointerEvent) => {
      if (drag.current) {
        const p = toWorld(ev);
        const n = nodes.current.find((x) => x.id === drag.current!.id);
        const moved = n && Math.hypot(p.x - drag.current.px, p.y - drag.current.py);
        if (n && moved !== undefined && moved < 4) {
          if (n.hub && n.roadmapId) go({ page: "roadmap", roadmapId: n.roadmapId });
          else if (n.roadmapId) go({ page: "step", roadmapId: n.roadmapId, stepId: n.id });
        }
      }
      drag.current = null;
      pan.current = null;
    };
    const wheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const next = Math.min(2.4, Math.max(0.45, view.current.k * (ev.deltaY > 0 ? 0.92 : 1.08)));
      view.current.k = next;
    };
    cnv.addEventListener("pointerdown", down);
    cnv.addEventListener("pointermove", move);
    cnv.addEventListener("pointerup", up);
    cnv.addEventListener("wheel", wheel, { passive: false });
    return () => {
      running = false;
      cancelAnimationFrame(frame);
      ro.disconnect();
      cnv.removeEventListener("pointerdown", down);
      cnv.removeEventListener("pointermove", move);
      cnv.removeEventListener("pointerup", up);
      cnv.removeEventListener("wheel", wheel);
    };
  }, [active, data.topicMap, go, lang]);

  return (
    <div>
      <h1 className="page-title">{t("topics")}</h1>
      <p className="lede">{t("mapLead")}</p>
      <div className="map-wrap" ref={wrap} style={{ marginTop: 12 }}>
        <canvas ref={canvas} />
        <div className="map-tools">
          <button type="button" className="btn-line" onClick={() => { view.current.k = Math.min(2.4, view.current.k * 1.15); }}>+</button>
          <button type="button" className="btn-line" onClick={() => { view.current.k = Math.max(0.45, view.current.k / 1.15); }}>−</button>
          <button type="button" className="btn-line" onClick={() => { view.current = { x: 0, y: 0, k: 1 }; }}>{t("fit")}</button>
        </div>
      </div>
    </div>
  );
}
