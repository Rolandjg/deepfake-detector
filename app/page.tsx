'use client'
import { useState, useRef, useEffect, type ChangeEvent } from "react";
import Reference from "@/components/reference";
import Nav from "@/components/nav";

const references = [
  {
    title: "iPhone - Day Time",
    description: "iPhone images will sometimes produce a distinct grid pattern.",
    filePrefix: "iphone"
  },
  {
    title: "iPhone - Night Mode",
    description: "Using the night mode setting will hide some noise hiccups, but have more noise overall.",
    filePrefix: "nightmode"
  },
  {
    title: "JPEG Compression of a Real Image",
    description: "Heavy jpeg compression can hide irregularities in noise.",
    filePrefix: "compressed"
  },
  {
    title: "JPEG Compression of a Fake Image",
    description: "Heavy jpeg compression can hide irregularities in noise.",
    filePrefix: "compressed-fake"
  },
  {
    title: "Gemini Nano Banana 2",
    description: "Notice the bright spots in the FFT, this is unnatural.",
    filePrefix: "gemini"
  },
  {
    title: "ChatGPT Image",
    description: "The bright spots on the edges of the FFT is not natural.",
    filePrefix: "chatgpt"
  },
  {
    title: "ChatGPT Image 2",
    description: "OpenAI's Image Gen 2 has a similar profile as Image Gen 1",
    filePrefix: "chatgpt2"
  },
  {
    title: "ChatGPT Image 2.5",
    description: "OpenAI's Image Gen 2.5 is better than its predecessors, but still not perfect.",
    filePrefix: "chatgpt25"
  },
  {
    title: "Sora Video Generator",
    description: "Due to how videos are compressed, noise irregularities are obscured.",
    filePrefix: "sora"
  },
  {
    title: "Seedance 2.0",
    description: "Due to how videos are compressed, noise irregularities are obscured.",
    filePrefix: "seedance2"
  },
  {
    title: "Z-Image Turbo",
    description: "Z-Image Turbo is actually pretty convincing.",
    filePrefix: "zit"
  },
  {
    title: "Flux 2 Dev",
    description: "Flux 2 has an obviously artificial noise profile.",
    filePrefix: "flux2"
  },
  {
    title: "Path Traced Render",
    description: "Rendered using cycles 2048 steps",
    filePrefix: "noise"
  },
  {
    title: "Path Traced Render - Denoised",
    description: "Rendered using cycles 2048 steps with OpenImageDenoise",
    filePrefix: "denoise"
  },
]

// ═════════════════════════════════════════════════════════════════════════════
// MATH UTILITIES
// ═════════════════════════════════════════════════════════════════════════════

function nextPow2(n: number) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

// ═════════════════════════════════════════════════════════════════════════════
// FFT (Cooley-Tukey radix-2, in-place)
// ═════════════════════════════════════════════════════════════════════════════

function fft1d(re: Float64Array, im: Float64Array, N: number) {
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= N; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < N; i += len) {
      let curRe = 1, curIm = 0;
      for (let j = 0; j < len / 2; j++) {
        const uRe = re[i + j], uIm = im[i + j];
        const vRe = re[i + j + len / 2] * curRe - im[i + j + len / 2] * curIm;
        const vIm = re[i + j + len / 2] * curIm + im[i + j + len / 2] * curRe;
        re[i + j] = uRe + vRe;
        im[i + j] = uIm + vIm;
        re[i + j + len / 2] = uRe - vRe;
        im[i + j + len / 2] = uIm - vIm;
        const tmpRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = tmpRe;
      }
    }
  }
}

function fft2dPower(data: Float64Array, N: number): Float64Array {
  const re = new Float64Array(N * N);
  const im = new Float64Array(N * N);
  re.set(data);
  const rowRe = new Float64Array(N);
  const rowIm = new Float64Array(N);
  for (let y = 0; y < N; y++) {
    const off = y * N;
    rowRe.set(re.subarray(off, off + N));
    rowIm.set(im.subarray(off, off + N));
    fft1d(rowRe, rowIm, N);
    re.set(rowRe, off);
    im.set(rowIm, off);
  }
  const colRe = new Float64Array(N);
  const colIm = new Float64Array(N);
  for (let x = 0; x < N; x++) {
    for (let y = 0; y < N; y++) { colRe[y] = re[y * N + x]; colIm[y] = im[y * N + x]; }
    fft1d(colRe, colIm, N);
    for (let y = 0; y < N; y++) { re[y * N + x] = colRe[y]; im[y * N + x] = colIm[y]; }
  }
  const power = new Float64Array(N * N);
  const half = N >> 1;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const p = re[i] * re[i] + im[i] * im[i];
      const sy = (y + half) % N;
      const sx = (x + half) % N;
      power[sy * N + sx] = p;
    }
  }
  return power;
}

// ═════════════════════════════════════════════════════════════════════════════
// 1) ELA (Error Level Analysis)
// ═════════════════════════════════════════════════════════════════════════════

function computeELA(
  originalCanvas: HTMLCanvasElement,
  quality: number,
  scale: number
): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const jpegDataUrl = originalCanvas.toDataURL("image/jpeg", quality);
    const img = new Image();
    img.onload = () => {
      const w = originalCanvas.width;
      const h = originalCanvas.height;
      const recompCanvas = document.createElement("canvas");
      recompCanvas.width = w;
      recompCanvas.height = h;
      const recompCtx = recompCanvas.getContext("2d")!;
      recompCtx.drawImage(img, 0, 0, w, h);
      const origData = originalCanvas.getContext("2d")!.getImageData(0, 0, w, h).data;
      const recompData = recompCtx.getImageData(0, 0, w, h).data;
      const outCanvas = document.createElement("canvas");
      outCanvas.width = w;
      outCanvas.height = h;
      const outCtx = outCanvas.getContext("2d")!;
      const outImg = outCtx.createImageData(w, h);
      for (let i = 0; i < w * h; i++) {
        const idx = i * 4;
        outImg.data[idx]     = Math.min(255, Math.abs(origData[idx]     - recompData[idx]) * scale);
        outImg.data[idx + 1] = Math.min(255, Math.abs(origData[idx + 1] - recompData[idx + 1]) * scale);
        outImg.data[idx + 2] = Math.min(255, Math.abs(origData[idx + 2] - recompData[idx + 2]) * scale);
        outImg.data[idx + 3] = 255;
      }
      outCtx.putImageData(outImg, 0, 0);
      resolve(outCanvas);
    };
    img.onerror = () => reject(new Error("ELA: failed to load re-compressed image"));
    img.src = jpegDataUrl;
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 2) Block Artifact Grid Analysis (JPEG 8x8)
// ═════════════════════════════════════════════════════════════════════════════

function computeBlockGrid(
  grayscale: Float64Array,
  width: number,
  height: number
): HTMLCanvasElement {
  const bw = Math.floor(width / 8);
  const bh = Math.floor(height / 8);
  const blockEnergy = new Float64Array(bw * bh);

  for (let by = 0; by < bh; by++) {
    const edgeY = by * 8;
    for (let bx = 0; bx < bw; bx++) {
      let topEdge = 0, bottomEdge = 0;
      const x0 = bx * 8;
      for (let dx = 0; dx < 8; dx++) {
        const x = x0 + dx;
        if (edgeY > 0 && edgeY < height)
          topEdge += Math.abs(grayscale[edgeY * width + x] - grayscale[(edgeY - 1) * width + x]);
        const botY = edgeY + 7;
        if (botY + 1 < height)
          bottomEdge += Math.abs(grayscale[(botY + 1) * width + x] - grayscale[botY * width + x]);
      }
      let leftEdge = 0, rightEdge = 0;
      for (let dy = 0; dy < 8; dy++) {
        const y = edgeY + dy;
        if (y >= height) break;
        if (x0 > 0)
          leftEdge += Math.abs(grayscale[y * width + x0] - grayscale[y * width + (x0 - 1)]);
        const rightX = x0 + 7;
        if (rightX + 1 < width)
          rightEdge += Math.abs(grayscale[y * width + (rightX + 1)] - grayscale[y * width + rightX]);
      }
      blockEnergy[by * bw + bx] = (topEdge + bottomEdge + leftEdge + rightEdge) / 32;
    }
  }

  const sorted = Float64Array.from(blockEnergy).sort();
  const median = sorted[Math.floor(sorted.length / 2)];
  const mad = Float64Array.from(blockEnergy).map(v => Math.abs(v - median)).sort();
  const madVal = mad[Math.floor(mad.length / 2)] + 1e-9;

  const outCanvas = document.createElement("canvas");
  outCanvas.width = width;
  outCanvas.height = height;
  const ctx = outCanvas.getContext("2d")!;
  const imgData = ctx.createImageData(width, height);

  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const z = (blockEnergy[by * bw + bx] - median) / madVal;
      let r: number, g: number, b: number;
      if (z > 2) {
        const t = Math.min((z - 2) / 4, 1);
        r = 200 + Math.round(55 * t); g = Math.round(180 * (1 - t)); b = 30;
      } else if (z < -1.5) {
        const t = Math.min((-z - 1.5) / 3, 1);
        r = 30; g = Math.round(80 * (1 - t)); b = 150 + Math.round(105 * t);
      } else {
        r = 30; g = 50 + Math.round(30 * Math.abs(z)); b = 30;
      }
      for (let dy = 0; dy < 8; dy++) {
        for (let dx = 0; dx < 8; dx++) {
          const px = bx * 8 + dx, py = by * 8 + dy;
          if (px < width && py < height) {
            const idx = (py * width + px) * 4;
            imgData.data[idx] = r; imgData.data[idx+1] = g; imgData.data[idx+2] = b; imgData.data[idx+3] = 200;
          }
        }
      }
    }
  }
  ctx.putImageData(imgData, 0, 0);
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 0.5;
  for (let x = 0; x <= width; x += 8) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
  for (let y = 0; y <= height; y += 8) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
  return outCanvas;
}

// ═════════════════════════════════════════════════════════════════════════════
// 3) PCA on Color Channels
// ═════════════════════════════════════════════════════════════════════════════

function computePCA(
  rgbaData: Uint8ClampedArray,
  width: number,
  height: number
): HTMLCanvasElement {
  const n = width * height;

  let mR = 0, mG = 0, mB = 0;
  for (let i = 0; i < n; i++) {
    mR += rgbaData[i * 4];
    mG += rgbaData[i * 4 + 1];
    mB += rgbaData[i * 4 + 2];
  }
  mR /= n; mG /= n; mB /= n;

  let cRR = 0, cRG = 0, cRB = 0, cGG = 0, cGB = 0, cBB = 0;
  for (let i = 0; i < n; i++) {
    const dr = rgbaData[i * 4] - mR;
    const dg = rgbaData[i * 4 + 1] - mG;
    const db = rgbaData[i * 4 + 2] - mB;
    cRR += dr * dr; cRG += dr * dg; cRB += dr * db;
    cGG += dg * dg; cGB += dg * db; cBB += db * db;
  }
  cRR /= n; cRG /= n; cRB /= n; cGG /= n; cGB /= n; cBB /= n;

  const mat = [
    [cRR, cRG, cRB],
    [cRG, cGG, cGB],
    [cRB, cGB, cBB]
  ];

  function matVec(m: number[][], v: number[]): number[] {
    return [
      m[0][0]*v[0] + m[0][1]*v[1] + m[0][2]*v[2],
      m[1][0]*v[0] + m[1][1]*v[1] + m[1][2]*v[2],
      m[2][0]*v[0] + m[2][1]*v[1] + m[2][2]*v[2],
    ];
  }

  function normalize(v: number[]): number[] {
    const len = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]) + 1e-12;
    return [v[0]/len, v[1]/len, v[2]/len];
  }

  function powerIter(m: number[][]): { vec: number[]; val: number } {
    let v = normalize([1, 1, 1]);
    for (let iter = 0; iter < 100; iter++) {
      const mv = matVec(m, v);
      const len = Math.sqrt(mv[0]*mv[0] + mv[1]*mv[1] + mv[2]*mv[2]) + 1e-12;
      v = [mv[0]/len, mv[1]/len, mv[2]/len];
    }
    const mv = matVec(m, v);
    const val = v[0]*mv[0] + v[1]*mv[1] + v[2]*mv[2];
    return { vec: v, val };
  }

  function deflate(m: number[][], vec: number[], val: number): number[][] {
    const out: number[][] = [[0,0,0],[0,0,0],[0,0,0]];
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++)
        out[i][j] = m[i][j] - val * vec[i] * vec[j];
    return out;
  }

  const e1 = powerIter(mat);
  const mat2 = deflate(mat, e1.vec, e1.val);
  const e2 = powerIter(mat2);
  const mat3 = deflate(mat2, e2.vec, e2.val);
  const e3 = powerIter(mat3);

  const pc3 = e3.vec;
  const proj = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const dr = rgbaData[i * 4] - mR;
    const dg = rgbaData[i * 4 + 1] - mG;
    const db = rgbaData[i * 4 + 2] - mB;
    proj[i] = dr * pc3[0] + dg * pc3[1] + db * pc3[2];
  }

  let pMin = Infinity, pMax = -Infinity;
  for (let i = 0; i < n; i++) {
    if (proj[i] < pMin) pMin = proj[i];
    if (proj[i] > pMax) pMax = proj[i];
  }
  const pRange = pMax - pMin || 1;

  const outCanvas = document.createElement("canvas");
  outCanvas.width = width;
  outCanvas.height = height;
  const ctx = outCanvas.getContext("2d")!;
  const imgData = ctx.createImageData(width, height);
  for (let i = 0; i < n; i++) {
    const v = Math.round(((proj[i] - pMin) / pRange) * 255);
    imgData.data[i * 4] = v;
    imgData.data[i * 4 + 1] = v;
    imgData.data[i * 4 + 2] = v;
    imgData.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
  return outCanvas;
}

// ═════════════════════════════════════════════════════════════════════════════
// 4) Local Noise Variance Map
// ═════════════════════════════════════════════════════════════════════════════

function computeLocalNoiseVariance(
  residual: Float64Array,
  width: number,
  height: number,
  windowSize: number
): HTMLCanvasElement {
  const ws = windowSize;
  const outW = Math.floor(width / ws);
  const outH = Math.floor(height / ws);
  const variance = new Float64Array(outW * outH);

  for (let by = 0; by < outH; by++) {
    for (let bx = 0; bx < outW; bx++) {
      const x0 = bx * ws, y0 = by * ws;
      let sum = 0, sumSq = 0, count = 0;
      for (let dy = 0; dy < ws; dy++) {
        for (let dx = 0; dx < ws; dx++) {
          const px = x0 + dx, py = y0 + dy;
          if (px < width && py < height) {
            const v = residual[py * width + px];
            sum += v; sumSq += v * v; count++;
          }
        }
      }
      const mean = sum / count;
      variance[by * outW + bx] = Math.sqrt(sumSq / count - mean * mean);
    }
  }

  let vMin = Infinity, vMax = -Infinity;
  for (let i = 0; i < variance.length; i++) {
    if (variance[i] < vMin) vMin = variance[i];
    if (variance[i] > vMax) vMax = variance[i];
  }
  const vRange = vMax - vMin || 1;

  const outCanvas = document.createElement("canvas");
  outCanvas.width = width;
  outCanvas.height = height;
  const ctx = outCanvas.getContext("2d")!;
  const imgData = ctx.createImageData(width, height);
  for (let i = 0; i < imgData.data.length; i += 4) imgData.data[i+3] = 255;

  for (let by = 0; by < outH; by++) {
    for (let bx = 0; bx < outW; bx++) {
      const t = (variance[by * outW + bx] - vMin) / vRange;
      let r: number, g: number, b: number;
      if (t < 0.25) {
        const s = t / 0.25;
        r = 0; g = Math.round(s * 200); b = 200;
      } else if (t < 0.5) {
        const s = (t - 0.25) / 0.25;
        r = 0; g = 200; b = Math.round(200 * (1 - s));
      } else if (t < 0.75) {
        const s = (t - 0.5) / 0.25;
        r = Math.round(255 * s); g = 200; b = 0;
      } else {
        const s = (t - 0.75) / 0.25;
        r = 255; g = Math.round(200 * (1 - s)); b = 0;
      }
      for (let dy = 0; dy < ws; dy++) {
        for (let dx = 0; dx < ws; dx++) {
          const px = bx * ws + dx, py = by * ws + dy;
          if (px < width && py < height) {
            const idx = (py * width + px) * 4;
            imgData.data[idx] = r; imgData.data[idx+1] = g; imgData.data[idx+2] = b;
          }
        }
      }
    }
  }
  ctx.putImageData(imgData, 0, 0);
  return outCanvas;
}

// ═════════════════════════════════════════════════════════════════════════════
// 5) Luminance Gradient Magnitude (Sobel)
// ═════════════════════════════════════════════════════════════════════════════

function computeGradientMap(
  grayscale: Float64Array,
  width: number,
  height: number
): HTMLCanvasElement {
  const grad = new Float64Array(width * height);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const gx =
        -1 * grayscale[(y-1)*width + (x-1)] + 1 * grayscale[(y-1)*width + (x+1)]
        -2 * grayscale[ y   *width + (x-1)] + 2 * grayscale[ y   *width + (x+1)]
        -1 * grayscale[(y+1)*width + (x-1)] + 1 * grayscale[(y+1)*width + (x+1)];
      const gy =
        -1 * grayscale[(y-1)*width + (x-1)] - 2 * grayscale[(y-1)*width + x] - 1 * grayscale[(y-1)*width + (x+1)]
        +1 * grayscale[(y+1)*width + (x-1)] + 2 * grayscale[(y+1)*width + x] + 1 * grayscale[(y+1)*width + (x+1)];
      grad[y * width + x] = Math.sqrt(gx * gx + gy * gy);
    }
  }

  const logGrad = new Float64Array(grad.length);
  for (let i = 0; i < grad.length; i++) logGrad[i] = Math.log(1 + grad[i]);

  let gMin = Infinity, gMax = -Infinity;
  for (let i = 0; i < logGrad.length; i++) {
    if (logGrad[i] < gMin) gMin = logGrad[i];
    if (logGrad[i] > gMax) gMax = logGrad[i];
  }
  const gRange = gMax - gMin || 1;

  const outCanvas = document.createElement("canvas");
  outCanvas.width = width;
  outCanvas.height = height;
  const ctx = outCanvas.getContext("2d")!;
  const imgData = ctx.createImageData(width, height);
  for (let i = 0; i < width * height; i++) {
    const v = Math.round(((logGrad[i] - gMin) / gRange) * 255);
    imgData.data[i * 4] = v; imgData.data[i * 4 + 1] = v; imgData.data[i * 4 + 2] = v; imgData.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
  return outCanvas;
}

// ═════════════════════════════════════════════════════════════════════════════
// 6) Statistical Moments (per-channel, per-region)
// ═════════════════════════════════════════════════════════════════════════════

interface RegionStats {
  label: string;
  r: { mean: number; std: number; skew: number; kurt: number; entropy: number };
  g: { mean: number; std: number; skew: number; kurt: number; entropy: number };
  b: { mean: number; std: number; skew: number; kurt: number; entropy: number };
}

function channelStats(values: number[]): { mean: number; std: number; skew: number; kurt: number; entropy: number } {
  const n = values.length;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += values[i];
  const mean = sum / n;

  let m2 = 0, m3 = 0, m4 = 0;
  for (let i = 0; i < n; i++) {
    const d = values[i] - mean;
    const d2 = d * d;
    m2 += d2; m3 += d2 * d; m4 += d2 * d2;
  }
  m2 /= n; m3 /= n; m4 /= n;
  const std = Math.sqrt(m2) + 1e-9;
  const skew = m3 / (std * std * std);
  const kurt = m4 / (std * std * std * std) - 3;

  const hist = new Float64Array(256);
  for (let i = 0; i < n; i++) hist[Math.min(255, Math.max(0, Math.round(values[i])))]++;
  let entropy = 0;
  for (let i = 0; i < 256; i++) {
    if (hist[i] > 0) { const p = hist[i] / n; entropy -= p * Math.log2(p); }
  }

  return { mean: +mean.toFixed(2), std: +std.toFixed(2), skew: +skew.toFixed(3), kurt: +kurt.toFixed(3), entropy: +entropy.toFixed(3) };
}

function computeRegionStats(
  rgbaData: Uint8ClampedArray,
  width: number,
  height: number,
  gridCols: number,
  gridRows: number
): RegionStats[] {
  const stats: RegionStats[] = [];
  const cellW = Math.floor(width / gridCols);
  const cellH = Math.floor(height / gridRows);

  for (let gy = 0; gy < gridRows; gy++) {
    for (let gx = 0; gx < gridCols; gx++) {
      const rVals: number[] = [], gVals: number[] = [], bVals: number[] = [];
      const x0 = gx * cellW, y0 = gy * cellH;
      for (let dy = 0; dy < cellH; dy++) {
        for (let dx = 0; dx < cellW; dx++) {
          const idx = ((y0 + dy) * width + (x0 + dx)) * 4;
          rVals.push(rgbaData[idx]);
          gVals.push(rgbaData[idx + 1]);
          bVals.push(rgbaData[idx + 2]);
        }
      }
      stats.push({
        label: `(${gx+1},${gy+1})`,
        r: channelStats(rVals),
        g: channelStats(gVals),
        b: channelStats(bVals),
      });
    }
  }
  return stats;
}

// ═════════════════════════════════════════════════════════════════════════════
// Core Analysis (Noise Residual + FFT) — returns residual array too
// ═════════════════════════════════════════════════════════════════════════════

function analyzeImage(
  grayscale: Float64Array,
  width: number,
  height: number,
  blockSize: number
): { residualCanvas: HTMLCanvasElement; fftCanvas: HTMLCanvasElement; residual: Float64Array } | null {
  const blurred = new Float64Array(width * height);
  const kernel = [1, 2, 1, 2, 4, 2, 1, 2, 1];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let sum = 0;
      for (let ky = -1; ky <= 1; ky++)
        for (let kx = -1; kx <= 1; kx++)
          sum += grayscale[(y + ky) * width + (x + kx)] * kernel[(ky + 1) * 3 + (kx + 1)];
      blurred[y * width + x] = sum / 16;
    }
  }

  const residual = new Float64Array(width * height);
  for (let i = 0; i < residual.length; i++) residual[i] = grayscale[i] - blurred[i];

  let mean = 0;
  for (let i = 0; i < residual.length; i++) mean += residual[i];
  mean /= residual.length;
  let std = 0;
  for (let i = 0; i < residual.length; i++) std += (residual[i] - mean) ** 2;
  std = Math.sqrt(std / residual.length) + 1e-9;

  const residualCanvas = document.createElement("canvas");
  residualCanvas.width = width;
  residualCanvas.height = height;
  const rCtx = residualCanvas.getContext("2d")!;
  const rData = rCtx.createImageData(width, height);
  for (let i = 0; i < residual.length; i++) {
    const v = Math.max(0, Math.min(255, ((residual[i] - mean) / std) * 20));
    rData.data[i * 4] = v; rData.data[i * 4 + 1] = v; rData.data[i * 4 + 2] = v; rData.data[i * 4 + 3] = 255;
  }
  rCtx.putImageData(rData, 0, 0);

  const bs = nextPow2(blockSize);
  if (height < bs || width < bs) return null;

  const hann1d = new Float64Array(bs);
  for (let i = 0; i < bs; i++) hann1d[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (bs - 1)));
  const window2d = new Float64Array(bs * bs);
  for (let y = 0; y < bs; y++)
    for (let x = 0; x < bs; x++)
      window2d[y * bs + x] = hann1d[y] * hann1d[x];

  const psd = new Float64Array(bs * bs);
  let count = 0;
  const stride = bs >> 1;
  for (let y = 0; y <= height - bs; y += stride) {
    for (let x = 0; x <= width - bs; x += stride) {
      const block = new Float64Array(bs * bs);
      let bMean = 0;
      for (let by = 0; by < bs; by++)
        for (let bx = 0; bx < bs; bx++) {
          block[by * bs + bx] = residual[(y + by) * width + (x + bx)];
          bMean += block[by * bs + bx];
        }
      bMean /= bs * bs;
      for (let i = 0; i < block.length; i++) block[i] = (block[i] - bMean) * window2d[i];
      const power = fft2dPower(block, bs);
      for (let i = 0; i < psd.length; i++) psd[i] += power[i];
      count++;
    }
  }
  for (let i = 0; i < psd.length; i++) psd[i] /= Math.max(count, 1);

  const spectrum = new Float64Array(psd.length);
  for (let i = 0; i < psd.length; i++) spectrum[i] = 10 * Math.log10(psd[i] + 1e-12);

  const cy = bs >> 1;
  let sMin = Infinity;
  for (let i = 0; i < spectrum.length; i++) if (spectrum[i] < sMin) sMin = spectrum[i];
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++)
      spectrum[(cy + dy) * bs + (cy + dx)] = sMin;

  let sMax = -Infinity;
  sMin = Infinity;
  for (let i = 0; i < spectrum.length; i++) {
    if (spectrum[i] < sMin) sMin = spectrum[i];
    if (spectrum[i] > sMax) sMax = spectrum[i];
  }
  const range = sMax - sMin || 1;

  const fftCanvas = document.createElement("canvas");
  fftCanvas.width = bs;
  fftCanvas.height = bs;
  const fCtx = fftCanvas.getContext("2d")!;
  const fData = fCtx.createImageData(bs, bs);
  for (let i = 0; i < spectrum.length; i++) {
    const v = Math.round(((spectrum[i] - sMin) / range) * 255);
    fData.data[i * 4] = v; fData.data[i * 4 + 1] = v; fData.data[i * 4 + 2] = v; fData.data[i * 4 + 3] = 255;
  }
  fCtx.putImageData(fData, 0, 0);

  return { residualCanvas, fftCanvas, residual };
}

// ═════════════════════════════════════════════════════════════════════════════
// RESULTS TYPE
// ═════════════════════════════════════════════════════════════════════════════

interface AnalysisResults {
  residual: string;
  fft: string;
  ela: string;
  blockGrid: string;
  pca: string;
  noiseVariance: string;
  gradient: string;
  stats: RegionStats[];
}

// ═════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═════════════════════════════════════════════════════════════════════════════

export default function Home() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<AnalysisResults | null>(null);
  const [elaQuality, setElaQuality] = useState(75);
  const [elaScale, setElaScale] = useState(20);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const originalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [showHow, setHow] = useState(false);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setPreview(URL.createObjectURL(file));
      setResults(null);
      setError(null);
      originalCanvasRef.current = null;
    }
  };

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const imageItem = Array.from(event.clipboardData?.items ?? []).find((item) => item.type.startsWith("image/"));
      const file = imageItem?.getAsFile();

      if (!file) return;

      event.preventDefault();
      setSelectedFile(file);
      setPreview(URL.createObjectURL(file));
      setResults(null);
      setError(null);
      originalCanvasRef.current = null;
      if (fileInputRef.current) fileInputRef.current.value = "";
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  const rerunELA = async () => {
    if (!originalCanvasRef.current || !results) return;
    setProcessing(true);
    try {
      await new Promise(r => setTimeout(r, 30));
      const elaCanvas = await computeELA(originalCanvasRef.current, elaQuality / 100, elaScale);
      setResults(prev => prev ? { ...prev, ela: elaCanvas.toDataURL() } : prev);
    } catch (e: any) {
      setError(e.message || "ELA reprocessing failed");
    } finally {
      setProcessing(false);
    }
  };

  const onProcessPress = async () => {
    if (!selectedFile) return;
    setProcessing(true);
    setError(null);
    setResults(null);

    try {
      const img = new Image();
      const url = URL.createObjectURL(selectedFile);
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = url;
      });

      const w = img.width;
      const h = img.height;
      const tmpCanvas = document.createElement("canvas");
      tmpCanvas.width = w;
      tmpCanvas.height = h;
      const ctx = tmpCanvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, w, h);
      URL.revokeObjectURL(url);
      originalCanvasRef.current = tmpCanvas;

      const gray = new Float64Array(w * h);
      for (let i = 0; i < w * h; i++) {
        gray[i] = 0.299 * imageData.data[i * 4] + 0.587 * imageData.data[i * 4 + 1] + 0.114 * imageData.data[i * 4 + 2];
      }

      await new Promise(r => setTimeout(r, 30));

      // 1) Noise Residual + FFT
      const blockSize = 224;
      const coreResult = analyzeImage(gray, w, h, blockSize);
      if (!coreResult) {
        setError(`Image too small. Needs at least ${nextPow2(blockSize)}\u00d7${nextPow2(blockSize)} pixels.`);
        setProcessing(false);
        return;
      }
      await new Promise(r => setTimeout(r, 30));

      // 2) ELA
      const elaCanvas = await computeELA(tmpCanvas, elaQuality / 100, elaScale);
      await new Promise(r => setTimeout(r, 30));

      // 3) Block Grid
      const blockGridCanvas = computeBlockGrid(gray, w, h);
      await new Promise(r => setTimeout(r, 30));

      // 4) PCA
      const pcaCanvas = computePCA(imageData.data, w, h);
      await new Promise(r => setTimeout(r, 30));

      // 5) Local Noise Variance
      const noiseVarCanvas = computeLocalNoiseVariance(coreResult.residual, w, h, 16);
      await new Promise(r => setTimeout(r, 30));

      // 6) Gradient Map
      const gradCanvas = computeGradientMap(gray, w, h);
      await new Promise(r => setTimeout(r, 30));

      // 7) Statistical Moments (4x4 grid)
      const stats = computeRegionStats(imageData.data, w, h, 4, 4);

      setResults({
        residual: coreResult.residualCanvas.toDataURL(),
        fft: coreResult.fftCanvas.toDataURL(),
        ela: elaCanvas.toDataURL(),
        blockGrid: blockGridCanvas.toDataURL(),
        pca: pcaCanvas.toDataURL(),
        noiseVariance: noiseVarCanvas.toDataURL(),
        gradient: gradCanvas.toDataURL(),
        stats,
      });
    } catch (e: any) {
      setError(e.message || "Processing failed");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <div className="shadow-sm shadow-gray-200">
        <Nav />
      </div>

      {/* How it works */}
      <div className="mx-auto px-4 py-8 " >
        <div className="bg-white rounded-md border border-blue-300 shadow-sm p-6">
          <h2 className={`font-bold text-xl cursor-pointer mb-3 text-center ${showHow ? `text-slate-800` : `text-slate-400 hover:text-slate-700`}`} onClick={() => {setHow(!showHow)}}>How it works</h2>
          <div className="space-y-3 text-md text-slate-600 leading-relaxed max-w-3xl mx-auto">
            {
              showHow
              &&
              <>
                <p>
                  This tool does <span className="text-slate-900 font-medium">not</span> use AI to decide if an image is fake. Instead, it extracts forensic views that let <span className="text-slate-900 font-medium">you</span> judge. Just because an image doesn&apos;t show signs of AI generation, does not mean it is real.
                </p>
                <p>
                  <a className="text-cyan-600 font-medium underline hover:text-cyan-700" href="https://ieeexplore.ieee.org/document/10887712" target="_blank">Noise Residual</a> &mdash; Strips away image content to reveal the underlying noise pattern. Real photos have organic, uniform noise. AI-generated images often show unnatural smoothness, grids, or repeating textures here.
                </p>
                <p>
                  <span className="text-slate-900 font-medium">FFT Power Spectrum</span> &mdash; Shows how noise energy is distributed across frequencies. Bright spots or regular patterns in the spectrum can indicate artifacts from generative model architectures.
                </p>
                <p>
                  <a className="text-cyan-600 font-medium underline hover:text-cyan-700" target="_blank" href="https://en.wikipedia.org/wiki/Error_level_analysis">Error Level Analysis (ELA)</a> &mdash; Re-compresses the image as JPEG and measures the difference. In an unedited photo, all regions should have similar error levels. Spliced, painted, or AI-generated regions often compress differently. You can adjust the JPEG quality and brightness scale to fine-tune what&apos;s visible.
                </p>
                <p>
                  <span className="text-slate-900 font-medium">Block Artifact Grid</span> &mdash; JPEG compression operates on 8&times;8 pixel blocks. This view measures the gradient energy at every 8-pixel boundary and highlights blocks that deviate from the norm. Red/yellow = grid mismatch (splicing), blue = suspiciously smooth (AI/inpainting), dark green = normal.
                </p>
                <p>
                  <a className="text-cyan-600 font-medium underline hover:text-cyan-700" target="_blank" href="https://en.wikipedia.org/wiki/Principal_component_analysis">PCA Minor Component</a> &mdash; Runs Principal Component Analysis on the RGB channels and shows the least significant component. This decorrelates color information to surface manipulation artifacts, cloning, or inpainting invisible to the naked eye.
                </p>
                <p>
                  <span className="text-slate-900 font-medium">Local Noise Variance</span> &mdash; Measures the standard deviation of noise in 16&times;16 pixel windows and renders a heatmap. Authentic photos have relatively uniform noise; edited or AI-generated regions often have noticeably different noise levels.
                </p>
                <p>
                  <span className="text-slate-900 font-medium">Luminance Gradient</span> &mdash; Computes the Sobel gradient magnitude across the image. Pasted objects often have subtly different edge characteristics &mdash; too sharp, too smooth, or double-edged &mdash; compared to natural edges in the scene.
                </p>
                <p>
                  <span className="text-slate-900 font-medium">Statistical Moments</span> &mdash; Shows kurtosis, skewness, entropy, and standard deviation for each color channel across a 4&times;4 grid of regions. Real camera noise follows predictable distributions; synthetic or manipulated regions often deviate.
                </p>
                <p>
                  Please check the <a href="#reference" className="text-cyan-600 underline hover:text-cyan-700">reference</a> section at the bottom of the page to compare your results with the behavior from other image types.
                </p>

              </>
            }
          </div>
        </div>
      </div>

      {/* Main area: Upload sidebar + Results */}
      <div className="mx-auto px-4 pb-8 flex flex-col md:flex-row gap-6">

        {/* Upload panel — sticky sidebar on md+ */}
        <div className="md:w-72 lg:w-80 shrink-0">
          <div className="md:sticky md:top-6 bg-white rounded-lg border border-green-300 shadow-sm p-6">
            <h2 className="font-bold text-xl mb-5 text-center text-slate-800">Upload image</h2>

            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 hover:border-cyan-400 rounded-lg p-8 flex flex-col items-center justify-center min-h-[180px] cursor-pointer transition-colors bg-slate-50 hover:bg-cyan-50/30"
            >
              {preview ? (
                <img src={preview} alt="Preview" className="max-h-40 rounded object-contain" />
              ) : (
                <>
                  <svg className="w-8 h-8 text-slate-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                  <p className="text-sm text-slate-500 text-center">Click to upload or paste an image</p>
                </>
              )}
              <input ref={fileInputRef} type="file" onChange={onFileChange} accept="image/png, image/jpg, image/jpeg" className="hidden" />
            </div>

            {selectedFile && (
              <div className="mt-3 flex items-center justify-between text-sm text-slate-500 px-1">
                <span className="truncate">{selectedFile.name}</span>
                <button onClick={() => { setSelectedFile(null); setPreview(null); setResults(null); setError(null); originalCanvasRef.current = null; }} className="text-slate-400 hover:text-slate-700 ml-2 cursor-pointer">&#10005;</button>
              </div>
            )}

            <button
              onClick={onProcessPress}
              disabled={!selectedFile || processing}
              className={`w-full mt-5 py-3 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                selectedFile && !processing ? "bg-cyan-600 hover:bg-cyan-500 text-white shadow-sm" : "bg-slate-100 text-slate-400 cursor-not-allowed"
              }`}
            >
              {processing ? "Analyzing..." : "Submit"}
            </button>
          </div>
        </div>

        {/* Results panel — responsive columns */}
        <div className="flex-1 bg-white rounded-lg border border-rose-300 shadow-sm p-6">
          <h2 className="font-bold text-xl mb-4 text-center text-slate-800">Results</h2>
          {error && <p className="text-red-500 text-sm text-center">{error}</p>}
          {!results && !error && (
            <div className="flex items-center justify-center min-h-[260px]">
              <p className="text-sm text-slate-400 text-center">
                {processing ? "Processing image... (This might take some time depending on how large your image is)" : "Data will show up here"}
              </p>
            </div>
          )}
          {results && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">

              {/* 1 - Noise Residual */}
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                <p className="text-xs text-slate-500 mb-2 uppercase tracking-wide font-medium">Noise Residual</p>
                <img src={results.residual} alt="Noise residual" onClick={() => window.open(results.residual, '_blank')} className="w-full rounded border border-slate-200 cursor-pointer hover:opacity-90 transition shadow-sm" title="Click to open full size" />
              </div>

              {/* 2 - FFT */}
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                <p className="text-xs text-slate-500 mb-2 uppercase tracking-wide font-medium">FFT Power Spectrum</p>
                <img src={results.fft} alt="FFT power spectrum" onClick={() => window.open(results.fft, '_blank')} className="w-full rounded border border-slate-200 cursor-pointer hover:opacity-90 transition shadow-sm" title="Click to open full size" />
              </div>

              {/* 3 - ELA */}
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                <p className="text-xs text-slate-500 mb-2 uppercase tracking-wide font-medium">Error Level Analysis (ELA)</p>
                <img src={results.ela} alt="Error Level Analysis" onClick={() => window.open(results.ela, '_blank')} className="w-full rounded border border-slate-200 cursor-pointer hover:opacity-90 transition shadow-sm" title="Click to open full size" />
                <div className="mt-3 space-y-2 bg-white rounded-lg p-3 border border-slate-200">
                  <div className="flex items-center gap-3">
                    <label className="text-xs text-slate-500 w-28 shrink-0">JPEG Quality: {elaQuality}%</label>
                    <input type="range" min={5} max={99} value={elaQuality} onChange={(e) => setElaQuality(Number(e.target.value))} className="flex-1 accent-cyan-500 h-1" />
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-xs text-slate-500 w-28 shrink-0">Brightness: &times;{elaScale}</label>
                    <input type="range" min={1} max={80} value={elaScale} onChange={(e) => setElaScale(Number(e.target.value))} className="flex-1 accent-cyan-500 h-1" />
                  </div>
                  <button onClick={rerunELA} disabled={processing} className="w-full mt-1 py-1.5 rounded text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-800 transition-colors cursor-pointer disabled:opacity-40 border border-slate-200">
                    {processing ? "Reprocessing..." : "Re-run ELA with new settings"}
                  </button>
                </div>
              </div>

              {/* 4 - Block Artifact Grid */}
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                <p className="text-xs text-slate-500 mb-2 uppercase tracking-wide font-medium">Block Artifact Grid</p>
                <img src={results.blockGrid} alt="Block Artifact Grid" onClick={() => window.open(results.blockGrid, '_blank')} className="w-full rounded border border-slate-200 cursor-pointer hover:opacity-90 transition shadow-sm" title="Click to open full size" />
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-500 inline-block"></span> Grid mismatch</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-blue-500 inline-block"></span> Smooth boundary</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-green-900 inline-block"></span> Normal</span>
                </div>
              </div>

              {/* 5 - PCA Minor Component */}
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                <p className="text-xs text-slate-500 mb-2 uppercase tracking-wide font-medium">PCA Minor Component (PC3)</p>
                <img src={results.pca} alt="PCA Minor Component" onClick={() => window.open(results.pca, '_blank')} className="w-full rounded border border-slate-200 cursor-pointer hover:opacity-90 transition shadow-sm" title="Click to open full size" />
              </div>

              {/* 6 - Local Noise Variance */}
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                <p className="text-xs text-slate-500 mb-2 uppercase tracking-wide font-medium">Local Noise Variance</p>
                <img src={results.noiseVariance} alt="Local Noise Variance" onClick={() => window.open(results.noiseVariance, '_blank')} className="w-full rounded border border-slate-200 cursor-pointer hover:opacity-90 transition shadow-sm" title="Click to open full size" />
                <div className="mt-3 flex items-center gap-1 text-xs text-slate-500">
                  <span className="w-4 h-2 rounded-sm inline-block" style={{background:"rgb(0,0,200)"}}></span>
                  <span>Low</span>
                  <span className="w-4 h-2 rounded-sm inline-block ml-2" style={{background:"rgb(0,200,0)"}}></span>
                  <span>Mid</span>
                  <span className="w-4 h-2 rounded-sm inline-block ml-2" style={{background:"rgb(255,200,0)"}}></span>
                  <span>High</span>
                  <span className="w-4 h-2 rounded-sm inline-block ml-2" style={{background:"rgb(255,0,0)"}}></span>
                  <span>Very high</span>
                </div>
              </div>

              {/* 7 - Luminance Gradient */}
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                <p className="text-xs text-slate-500 mb-2 uppercase tracking-wide font-medium">Luminance Gradient (Sobel)</p>
                <img src={results.gradient} alt="Luminance Gradient" onClick={() => window.open(results.gradient, '_blank')} className="w-full rounded border border-slate-200 cursor-pointer hover:opacity-90 transition shadow-sm" title="Click to open full size" />
              </div>

              {/* 8 - Statistical Moments Table — spans full width */}
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 md:col-span-2 lg:col-span-3">
                <p className="text-xs text-slate-500 mb-2 uppercase tracking-wide font-medium">Statistical Moments (4&times;4 Grid)</p>
                <div className="overflow-auto max-h-[400px] rounded border border-slate-200">
                  <table className="w-full text-xs text-slate-700">
                    <thead className="bg-slate-100 sticky top-0">
                      <tr>
                        <th className="px-2 py-1.5 text-left text-slate-500">Region</th>
                        <th className="px-2 py-1.5 text-left text-slate-500">Ch</th>
                        <th className="px-2 py-1.5 text-right text-slate-500">&sigma;</th>
                        <th className="px-2 py-1.5 text-right text-slate-500">Skew</th>
                        <th className="px-2 py-1.5 text-right text-slate-500">Kurt</th>
                        <th className="px-2 py-1.5 text-right text-slate-500">Entropy</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.stats.map((s, idx) => (
                        (['r', 'g', 'b'] as const).map((ch, ci) => {
                          const colors = { r: 'text-red-500', g: 'text-green-600', b: 'text-blue-500' };
                          return (
                            <tr key={`${idx}-${ch}`} className={ci === 0 ? "border-t border-slate-200" : ""}>
                              {ci === 0 && <td className="px-2 py-1 text-slate-400" rowSpan={3}>{s.label}</td>}
                              <td className={`px-2 py-1 font-mono ${colors[ch]}`}>{ch.toUpperCase()}</td>
                              <td className="px-2 py-1 text-right font-mono">{s[ch].std}</td>
                              <td className="px-2 py-1 text-right font-mono">{s[ch].skew}</td>
                              <td className="px-2 py-1 text-right font-mono">{s[ch].kurt}</td>
                              <td className="px-2 py-1 text-right font-mono">{s[ch].entropy}</td>
                            </tr>
                          );
                        })
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}
        </div>
      </div>

      {/* Reference section */}
      <div className="mx-auto px-4 pb-10">
        <div className="bg-white rounded-lg border border-amber-300 shadow-sm p-6" id="reference">
          <h2 className="font-bold text-xl text-center text-slate-800">Reference</h2>
          <h4 className="text-md mb-3 text-center text-slate-400">Single references images, not all image production methods will have the same results.</h4>
          {references.map((item) => (
            <div key={item.title}>
              <div className="bg-slate-200 w-full h-[1px] my-4 rounded-md"></div>
              <Reference title={item.title} description={item.description} filePrefix={item.filePrefix} />
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 pb-10 w-full">
        <h3 className="text-center mx-auto text-slate-400 font-bold">Deep Fake Analyzer</h3>
        <div className="w-full md:w-2/3 bg-slate-200 h-[2px] mx-auto my-3 rounded-md"></div>
        <p className="text-center mx-auto text-slate-600">Contact: rolandguerriere@proton.me</p>
        <br />
        <div className="w-full md:w-2/3 bg-slate-200 h-[2px] mx-auto my-3 rounded-md"></div>
        <p className="text-center mx-auto text-slate-600 mb-2">If you found this website helpful and want to send me a tip, you can do so with crytpo.</p>
        <p className="text-center mx-auto text-slate-600">BTC: bc1quvcyzrgnk5c9t7lavyezl4w8acp4k5ask8c7xy</p>
        <p className="text-center mx-auto text-slate-600">XMR: 88T49dJSMnQhHBXSXHDcDNXtdLGfhUiGPRmpCEnV8JHfCfYWRMQmJHh6ne6vPHEGee91R1rvp6TpsCx9ZxUTyPxNPwCib5E</p>
        <p className="text-center mx-auto text-slate-600">XNV: NV2pdV5LdQuD61AAmhAHTSa5DLXbdKZVtZKYWuarqbLJcn6bHu9xGbC1ArKKhUg5fwjgHAhtyCsvydTPXtXg8QpM2yFSdesj9</p>
      </div>
    </div>
  );
}
