import p5 from 'p5';
import { LAYERS, TinyNet } from '../../engine/network';
import type { PlateGeometry } from './ridgelines';

// The act III network drawn as an instrument diagram above the plate: inputs (log
// spectrum bands) at the top, outputs sitting over the stretch of plate they bend.
// Edge colour is the sign of weight x activation (rust +, steel -), alpha its size.
export function drawNetwork(p: p5, net: TinyNet, amount: number, plate: PlateGeometry) {
  if (amount < 0.01) return;
  const ctx = p.drawingContext as CanvasRenderingContext2D;
  const last = LAYERS.length - 1;
  const rowY = (l: number) => p.height * (0.045 + l * 0.027);
  const nodeX = (l: number, i: number) => {
    const u = i / (LAYERS[l] - 1);
    if (l === last) return plate.left + u * plate.width;
    const half = 0.16 + l * 0.08;
    return p.width * (0.5 - half + u * half * 2);
  };

  ctx.save();
  ctx.lineWidth = 0.6;
  for (let l = 0; l < last; l++) {
    const w = net.weights[l];
    const x = net.activations[l];
    const fanIn = LAYERS[l];
    for (let j = 0; j < LAYERS[l + 1]; j++) {
      for (let i = 0; i < fanIn; i++) {
        const signal = w[j * fanIn + i] * x[i];
        const alpha = amount * (0.06 + Math.min(0.5, Math.abs(signal) * 1.2));
        ctx.strokeStyle = signal >= 0
          ? `rgba(213, 117, 75, ${alpha})`
          : `rgba(120, 151, 168, ${alpha})`;
        ctx.beginPath();
        ctx.moveTo(nodeX(l, i), rowY(l));
        ctx.lineTo(nodeX(l + 1, j), rowY(l + 1));
        ctx.stroke();
      }
    }
  }

  // Outputs reach down toward the plate
  const out = net.activations[last];
  ctx.setLineDash([2, 5]);
  for (let j = 0; j < out.length; j++) {
    const x = nodeX(last, j);
    ctx.strokeStyle = `rgba(239, 227, 199, ${amount * (0.05 + Math.abs(out[j]) * 0.25)})`;
    ctx.beginPath();
    ctx.moveTo(x, rowY(last));
    ctx.lineTo(x, plate.top - plate.peak * 0.3);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  for (let l = 0; l <= last; l++) {
    const a = net.activations[l];
    for (let i = 0; i < a.length; i++) {
      ctx.fillStyle = `rgba(239, 227, 199, ${amount * (0.35 + Math.min(0.6, Math.abs(a[i]) * 0.6))})`;
      ctx.beginPath();
      ctx.arc(nodeX(l, i), rowY(l), 1.4 + Math.min(2.4, Math.abs(a[i]) * 2.4), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}
