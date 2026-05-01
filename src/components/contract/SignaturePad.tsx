'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import SignaturePadLib from 'signature_pad';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface SignaturePadProps {
  onSigned: (dataUrl: string) => void;
  onCleared: () => void;
}

/** Renders a typed name as a cursive signature on the given canvas. */
function renderTypedSignature(canvas: HTMLCanvasElement, name: string): string {
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas.toDataURL('image/png');

  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  const w = canvas.offsetWidth || canvas.width / ratio;
  const h = canvas.offsetHeight || canvas.height / ratio;

  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw the name in a cursive font centered on the canvas
  const fontSize = Math.min(Math.floor(h * 0.45), 48);
  ctx.save();
  ctx.scale(ratio, ratio);
  ctx.font = `italic ${fontSize}px 'Dancing Script', 'Brush Script MT', cursive`;
  ctx.fillStyle = '#1A1A1A';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, w / 2, h / 2);
  ctx.restore();

  return canvas.toDataURL('image/png');
}

export function SignaturePad({ onSigned, onCleared }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePadLib | null>(null);
  // Store callbacks in refs so effect never needs to re-run when parent re-renders
  const onSignedRef = useRef(onSigned);
  const onClearedRef = useRef(onCleared);
  useEffect(() => { onSignedRef.current = onSigned; }, [onSigned]);
  useEffect(() => { onClearedRef.current = onCleared; }, [onCleared]);

  const [keyboardDialogOpen, setKeyboardDialogOpen] = useState(false);
  const [typedName, setTypedName] = useState('');

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

  const handleKeyboardConfirm = () => {
    const name = typedName.trim();
    if (!name) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Clear any existing drawn signature
    padRef.current?.clear();

    const dataUrl = renderTypedSignature(canvas, name);
    onSignedRef.current(dataUrl);
    setKeyboardDialogOpen(false);
    setTypedName('');
  };

  const handleKeyboardCancel = () => {
    setKeyboardDialogOpen(false);
    setTypedName('');
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Helper text referenced by aria-describedby */}
      <p id="signature-pad-hint" className="text-xs text-gray-500">
        Dessinez votre signature dans ce cadre ou utilisez l&apos;alternative clavier.
      </p>

      <div className="border-2 border-dashed border-[#C9A84C]/50 rounded-lg bg-white overflow-hidden relative">
        <canvas
          ref={canvasRef}
          className="w-full touch-none"
          style={{ height: 160, display: 'block' }}
          aria-label="Zone de signature — dessinez votre signature"
          role="img"
          aria-describedby="signature-pad-hint"
        />
        <div className="absolute bottom-2 right-3 text-xs text-gray-300 pointer-events-none select-none" aria-hidden="true">
          Signez ici
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setKeyboardDialogOpen(true)}
          className="text-xs text-[#8B6914] hover:text-[#6B4F10] underline"
        >
          Signer par clavier
        </button>
        <button
          type="button"
          onClick={handleClear}
          className="text-xs text-gray-400 hover:text-gray-600 underline"
        >
          Effacer
        </button>
      </div>

      {/* Keyboard signature dialog */}
      <Dialog open={keyboardDialogOpen} onOpenChange={setKeyboardDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Signer par clavier</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <label htmlFor="typed-signature-input" className="text-sm text-gray-700">
              Saisissez votre nom complet — il sera rendu comme signature.
            </label>
            <input
              id="typed-signature-input"
              type="text"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleKeyboardConfirm(); }}
              placeholder="Votre nom complet"
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/60"
              autoFocus
              maxLength={100}
            />
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={handleKeyboardCancel}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-200 rounded-md"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleKeyboardConfirm}
              disabled={!typedName.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-[#C9A84C] hover:bg-[#B8960C] disabled:opacity-40 rounded-md transition-colors"
            >
              Confirmer la signature
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
