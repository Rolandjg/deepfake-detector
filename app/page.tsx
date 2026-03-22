'use client'
import { useState, useRef } from "react";
import Reference from "@/components/reference";
import Nav from "@/components/nav";

const references = [
  {
    title: "iPhone - Day Time",
    description: "iPhone images will sometimes produce a distinct grid pattern.",
    filePrefix: "iphone"
  },
  {
    title: "JPEG Compression of a Real Image",
    description: "Heavy jpeg compression can hide irregularities in noise.",
    filePrefix: "compressed"
  },
  {
    title: "JPEG Compression of a Fake Image",
    description: "Heavy jpeg compression can hide irregularities in noise.",
    filePrefix: "compressedFake"
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
    title: "Sora Video Generator",
    description: "Due to how videos are compressed, noise irregularities are obscured.",
    filePrefix: "sora"
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
]

// ─── FFT (Cooley-Tukey radix-2, in-place) ───────────────────────────────────
function nextPow2(n: number) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/** 1D FFT in-place. re/im are Float64Arrays of length N (must be power of 2). */
function fft1d(re: Float64Array, im: Float64Array, N: number) {
  // bit-reversal permutation
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  // Cooley-Tukey
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

/** 2D FFT on a square block of size N (power of 2). Returns power |F|^2 after fftshift. */
function fft2dPower(data: Float64Array, N: number): Float64Array {
  const re = new Float64Array(N * N);
  const im = new Float64Array(N * N);
  re.set(data);

  // FFT rows
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

  // FFT columns
  const colRe = new Float64Array(N);
  const colIm = new Float64Array(N);
  for (let x = 0; x < N; x++) {
    for (let y = 0; y < N; y++) { colRe[y] = re[y * N + x]; colIm[y] = im[y * N + x]; }
    fft1d(colRe, colIm, N);
    for (let y = 0; y < N; y++) { re[y * N + x] = colRe[y]; im[y * N + x] = colIm[y]; }
  }

  // power + fftshift
  const power = new Float64Array(N * N);
  const half = N >> 1;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const p = re[i] * re[i] + im[i] * im[i];
      // shift quadrants
      const sy = (y + half) % N;
      const sx = (x + half) % N;
      power[sy * N + sx] = p;
    }
  }
  return power;
}

// ─── Analysis (mirrors the Python) ───────────────────────────────────────────

function analyzeImage(
  grayscale: Float64Array,
  width: number,
  height: number,
  blockSize: number
): { residualCanvas: HTMLCanvasElement; fftCanvas: HTMLCanvasElement } | null {

  // --- Residual: image - GaussianBlur(image, 3x3) ---
  // Simple 3x3 Gaussian kernel: [1 2 1; 2 4 2; 1 2 1] / 16
  const blurred = new Float64Array(width * height);
  const kernel = [1, 2, 1, 2, 4, 2, 1, 2, 1];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let sum = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          sum += grayscale[(y + ky) * width + (x + kx)] * kernel[(ky + 1) * 3 + (kx + 1)];
        }
      }
      blurred[y * width + x] = sum / 16;
    }
  }

  const residual = new Float64Array(width * height);
  for (let i = 0; i < residual.length; i++) {
    residual[i] = grayscale[i] - blurred[i];
  }

  // --- Residual visualization (zero-mean, std-normalized, clipped) ---
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
    rData.data[i * 4] = v;
    rData.data[i * 4 + 1] = v;
    rData.data[i * 4 + 2] = v;
    rData.data[i * 4 + 3] = 255;
  }
  rCtx.putImageData(rData, 0, 0);

  // --- FFT / PSD ---
  // Use power-of-2 block size
  const bs = nextPow2(blockSize);
  if (height < bs || width < bs) return null;

  // Hann window 2D
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
      // extract block
      const block = new Float64Array(bs * bs);
      let bMean = 0;
      for (let by = 0; by < bs; by++)
        for (let bx = 0; bx < bs; bx++) {
          block[by * bs + bx] = residual[(y + by) * width + (x + bx)];
          bMean += block[by * bs + bx];
        }
      bMean /= bs * bs;
      // subtract mean, apply window
      for (let i = 0; i < block.length; i++)
        block[i] = (block[i] - bMean) * window2d[i];

      const power = fft2dPower(block, bs);
      for (let i = 0; i < psd.length; i++) psd[i] += power[i];
      count++;
    }
  }
  for (let i = 0; i < psd.length; i++) psd[i] /= Math.max(count, 1);

  // Log power
  const spectrum = new Float64Array(psd.length);
  for (let i = 0; i < psd.length; i++) spectrum[i] = 10 * Math.log10(psd[i] + 1e-12);

  // Mask DC center
  const cy = bs >> 1, cx = bs >> 1;
  let sMin = Infinity;
  for (let i = 0; i < spectrum.length; i++) if (spectrum[i] < sMin) sMin = spectrum[i];
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++)
      spectrum[(cy + dy) * bs + (cx + dx)] = sMin;

  // Normalize to 0-255
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
    fData.data[i * 4] = v;
    fData.data[i * 4 + 1] = v;
    fData.data[i * 4 + 2] = v;
    fData.data[i * 4 + 3] = 255;
  }
  fCtx.putImageData(fData, 0, 0);

  return { residualCanvas, fftCanvas };
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Home() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<{ residual: string; fft: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onFileChange = (event: any) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedFile(file);
      setPreview(URL.createObjectURL(file));
      setResults(null);
      setError(null);
    }
  };

  const onProcessPress = async () => {
    if (!selectedFile) return;
    setProcessing(true);
    setError(null);
    setResults(null);

    try {
      // Load image to canvas to get grayscale pixel data
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

      // Convert to grayscale (luminance)
      const gray = new Float64Array(w * h);
      for (let i = 0; i < w * h; i++) {
        const r = imageData.data[i * 4];
        const g = imageData.data[i * 4 + 1];
        const b = imageData.data[i * 4 + 2];
        gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
      }

      // Run analysis — use setTimeout to not block the UI thread during the yield
      await new Promise(r => setTimeout(r, 50));

      const blockSize = 224;
      const result = analyzeImage(gray, w, h, blockSize);

      if (!result) {
        setError(`Image too small. Needs at least ${nextPow2(blockSize)}×${nextPow2(blockSize)} pixels.`);
        setProcessing(false);
        return;
      }

      setResults({
        residual: result.residualCanvas.toDataURL(),
        fft: result.fftCanvas.toDataURL(),
      });
    } catch (e: any) {
      setError(e.message || "Processing failed");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <div className="shadow-lg shadow-gray-800">
        <Nav />
      </div>

    <div className="mx-auto px-4 py-8">
      <div className="bg-gray-900 rounded-md border-3 border-blue-700/60 p-6">
        <h2 className="font-bold text-xl mb-3 text-center">How it works</h2>

        <div className="space-y-3 text-md text-gray-300 leading-relaxed max-w-3xl mx-auto">
          <p>
            This tool does <span className="text-white font-medium">not</span> use AI to decide if an image is fake. Instead, it extracts forensic views that let <span className="text-white font-medium">you</span> judge. Just because an image doesn't show signs of AI generation, does not mean it is real.
          </p>

          <p>
            <span className="text-white font-medium">Noise Residual</span> — Strips away image content to reveal the underlying noise pattern. Real photos have organic, uniform noise. AI-generated images often show unnatural smoothness, grids, or repeating textures here.
          </p>

          <p>
            <span className="text-white font-medium">FFT Power Spectrum</span> — Shows how noise energy is distributed across frequencies. Bright spots or regular patterns in the spectrum can indicate artifacts from generative model architectures.
          </p>
          <p>
            Please check the <a href="#reference" className="underline hover:text-white">reference</a> section at the bottom of the page to compare your results with the behavior from other images types.
          </p>
        </div>
      </div>
    </div>
      

      {/* Main two-column area */}
      <div className="mx-auto px-4 pb-8 grid md:grid-cols-2 gap-6">
        {/* Upload panel */}
        <div className="bg-gray-900 rounded-lg border-3 border-green-700/50 p-6">
          <h2 className="font-bold text-xl mb-5 text-center">Upload image</h2>

          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-3 border-dashed border-gray-600 hover:border-gray-400 rounded-lg p-8 flex flex-col items-center justify-center min-h-[180px] cursor-pointer transition-colors"
          >
            {preview ? (
              <img src={preview} alt="Preview" className="max-h-40 rounded object-contain" />
            ) : (
              <>
                <svg className="w-8 h-8 text-gray-500 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <p className="text-sm text-gray-400">Click to upload an image</p>
                <p className="text-xs text-gray-600 mt-1">PNG, JPG, JPEG</p>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              onChange={onFileChange}
              accept="image/png, image/jpg, image/jpeg"
              className="hidden"
            />
          </div>

          {selectedFile && (
            <div className="mt-3 flex items-center justify-between text-sm text-gray-400 px-1">
              <span className="truncate">{selectedFile.name}</span>
              <button
                onClick={() => { setSelectedFile(null); setPreview(null); setResults(null); setError(null); }}
                className="text-gray-500 hover:text-white ml-2 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          <button
            onClick={onProcessPress}
            disabled={!selectedFile || processing}
            className={`w-full mt-5 py-3 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
              selectedFile && !processing
                ? "bg-red-600 hover:bg-red-500 text-white"
                : "bg-gray-800 text-gray-600 cursor-not-allowed"
            }`}
          >
            {processing ? "Analyzing..." : "Submit"}
          </button>
        </div>

        {/* Results panel */}
        <div className="bg-gray-900 rounded-lg border-3 border-red-700/50 p-6">
          <h2 className="font-bold text-xl mb-4 text-center">Results</h2>
          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}
          {!results && !error && (
            <div className="flex items-center justify-center min-h-[260px]">
              <p className="text-sm text-gray-500 text-center">
                {processing ? "Processing image... (This might take some time depending on how large your image is)" : "Data will show up here"}
              </p>
            </div>
          )}
          {results && (
            <div className="space-y-5">
              <div>
                <p className="text-xs text-gray-400 mb-2 uppercase tracking-wide">Noise Residual</p>
                <img src={results.residual} alt="Noise residual" onClick={() => window.open(results.residual, '_blank')} className="w-full rounded border border-gray-700/50 cursor-pointer hover:brightness-110 transition" title="Click to open full size" />
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-2 uppercase tracking-wide">FFT Power Spectrum</p>
                <img src={results.fft} alt="FFT power spectrum" onClick={() => window.open(results.fft, '_blank')} className="w-full rounded border border-gray-700/50 cursor-pointer hover:brightness-110 transition" title="Click to open full size" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Reference section */}
      <div className="mx-auto px-4 pb-10">
        <div className="bg-gray-900 rounded-lg border-3 border-yellow-700/50 p-6" id="reference">
          <h2 className="font-bold text-xl  text-center">Reference</h2>
          <h4 className="text-md mb-3 text-center text-gray-300/60">Single references images, not all image production methods will have the same results.</h4>
          {
            references.map((item) => (
              <div key={item.title}>
                <div className="bg-gray-700 w-full h-[1px] my-4 rounded-md"></div>
                <Reference title={item.title} description={item.description} filePrefix={item.filePrefix}/>  
              </div>
            ))
          }
        </div>
      </div>
      {/*Footer*/}
      <div className="px-4 pb-10 w-full">
        <h3 className="text-center mx-auto text-gray-500 font-bold">Deep Fake Analyzer</h3 >
        <div className="w-full md:w-2/3 bg-gray-700 h-[2px] mx-auto my-3 rounded-md"></div>

        <p className="text-center mx-auto text-gray-300">Contact: rolandguerriere@proton.me</p>
        <br />

        <div className="w-full md:w-2/3 bg-gray-700 h-[2px] mx-auto my-3 rounded-md"></div>

        <p className="text-center mx-auto text-gray-300 mb-2">If you found this website helpful and want to send me a tip, you can do so with crytpo.</p>
        <p className="text-center mx-auto text-gray-300">BTC: bc1quvcyzrgnk5c9t7lavyezl4w8acp4k5ask8c7xy</p>
        <p className="text-center mx-auto text-gray-300">XMR: 88T49dJSMnQhHBXSXHDcDNXtdLGfhUiGPRmpCEnV8JHfCfYWRMQmJHh6ne6vPHEGee91R1rvp6TpsCx9ZxUTyPxNPwCib5E</p>
        <p className="text-center mx-auto text-gray-300">XNV: NV2pdV5LdQuD61AAmhAHTSa5DLXbdKZVtZKYWuarqbLJcn6bHu9xGbC1ArKKhUg5fwjgHAhtyCsvydTPXtXg8QpM2yFSdesj9</p>
      </div>
    </div>
  );
}