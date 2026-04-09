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
  // Store callbacks in refs so effect never needs to re-run when parent re-renders
  const onSignedRef = useRef(onSigned);
  const onClearedRef = useRef(onCleared);
  useEffect(() => { onSignedRef.current = onSigned; }, [onSigned]);
  useEffect(() => { onClearedRef.current = onCleared; }, [onCleared]);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const pad = padRef.current;
    if (!canvas) return;

    const data = pad && !pad.isEmpty() ? pad.toData() : null;

    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(ratio, ratio);

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
        onSignedRef.current(pad.toDataURL('image/png'));
      }
    });

    window.addEventListener('resize', resizeCanvas);
    return () => {
      window.removeEventListener('resize', resizeCanvas);
      pad.off();
    };
  // intentionally only runs once on mount — callbacks accessed via refs
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizeCanvas]);

  const handleClear = () => {
    padRef.current?.clear();
    onClearedRef.current();
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
