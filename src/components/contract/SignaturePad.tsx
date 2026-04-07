'use client';

import { useEffect, useRef, useCallback } from 'react';
import SignaturePadLib from 'signature_pad';

interface SignaturePadProps {
  onSigned: (dataUrl: string) => void;
  onCleared: () => void;
}

export function SignaturePad({ onSigned, onCleared }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePadLib | null>(null);

  // Resize canvas to match CSS size (for HiDPI / retina screens)
  // Preserves existing signature data across resize events (e.g. mobile keyboard open/close)
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const pad = padRef.current;
    if (!canvas) return;

    // Save current signature data before resizing (resize clears the canvas)
    const data = pad && !pad.isEmpty() ? pad.toData() : null;

    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(ratio, ratio);

    // Restore signature data if there was one
    if (pad && data) {
      pad.fromData(data);
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    resizeCanvas();

    const pad = new SignaturePadLib(canvas, {
      backgroundColor: 'rgba(255, 255, 255, 0)',
      penColor: '#1A1A1A',
      minWidth: 0.5,
      maxWidth: 2.5,
    });

    padRef.current = pad;

    pad.addEventListener('endStroke', () => {
      if (!pad.isEmpty()) {
        onSigned(pad.toDataURL('image/png'));
      }
    });

    window.addEventListener('resize', resizeCanvas);
    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [resizeCanvas, onSigned]);

  const handleClear = () => {
    padRef.current?.clear();
    onCleared();
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="border-2 border-dashed border-[#C9A84C]/50 rounded-lg bg-white overflow-hidden relative">
        <canvas
          ref={canvasRef}
          className="w-full touch-none"
          style={{ height: 160, display: 'block' }}
        />
        <div className="absolute bottom-2 right-3 text-xs text-gray-300 pointer-events-none select-none">
          Signez ici
        </div>
      </div>
      <button
        type="button"
        onClick={handleClear}
        className="text-xs text-gray-400 hover:text-gray-600 underline self-end"
      >
        Effacer
      </button>
    </div>
  );
}
