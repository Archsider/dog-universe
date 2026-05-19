'use client';

// Wraps a MemberCard (or any element) with a 3D tilt effect that follows
// pointer / device-orientation, plus an animated holographic sheen for
// PLATINUM members.  Pure CSS transforms — no Three.js, no canvas.
//
// Source : Wave 5 (UX classe mondiale, Feature #4).  Inspired by
// Apple Wallet card animation + Pokemon card tilt demos.

import { useEffect, useRef, useState } from 'react';

interface Props {
  children: React.ReactNode;
  /** Enables the gold sheen overlay — only PLATINUM tier gets it. */
  holographic?: boolean;
  className?: string;
}

const MAX_TILT_DEG = 8;

export default function HolographicWrapper({ children, holographic, className = '' }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [shimmer, setShimmer] = useState({ x: 50, y: 50 });
  const [usingMotion, setUsingMotion] = useState(false);

  useEffect(() => {
    // Respect reduced-motion preference — flat card, no tilt.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // Try DeviceOrientation first (mobile), fall back to pointer.
    let cleanupOrient: (() => void) | null = null;
    let cleanupMove: (() => void) | null = null;

    const enableOrient = () => {
      const onOrient = (e: DeviceOrientationEvent) => {
        if (typeof e.beta !== 'number' || typeof e.gamma !== 'number') return;
        // Cap to ±MAX_TILT_DEG ; beta = front-back, gamma = left-right.
        const rotateY = Math.max(-MAX_TILT_DEG, Math.min(MAX_TILT_DEG, e.gamma / 4));
        const rotateX = Math.max(-MAX_TILT_DEG, Math.min(MAX_TILT_DEG, -e.beta / 8));
        setTilt({ x: rotateX, y: rotateY });
        setShimmer({
          x: 50 + (e.gamma ?? 0) / 2,
          y: 50 + (e.beta ?? 0) / 4,
        });
        setUsingMotion(true);
      };
      window.addEventListener('deviceorientation', onOrient, { passive: true });
      cleanupOrient = () => window.removeEventListener('deviceorientation', onOrient);
    };

    const enablePointer = () => {
      const el = wrapRef.current;
      if (!el) return;
      const onMove = (e: MouseEvent) => {
        if (usingMotion) return; // device orientation has priority on mobile
        const r = el.getBoundingClientRect();
        const px = ((e.clientX - r.left) / r.width) - 0.5;
        const py = ((e.clientY - r.top) / r.height) - 0.5;
        setTilt({
          x: Math.max(-MAX_TILT_DEG, Math.min(MAX_TILT_DEG, -py * 2 * MAX_TILT_DEG)),
          y: Math.max(-MAX_TILT_DEG, Math.min(MAX_TILT_DEG,  px * 2 * MAX_TILT_DEG)),
        });
        setShimmer({
          x: ((e.clientX - r.left) / r.width) * 100,
          y: ((e.clientY - r.top) / r.height) * 100,
        });
      };
      const onLeave = () => {
        setTilt({ x: 0, y: 0 });
        setShimmer({ x: 50, y: 50 });
      };
      el.addEventListener('mousemove', onMove);
      el.addEventListener('mouseleave', onLeave);
      cleanupMove = () => {
        el.removeEventListener('mousemove', onMove);
        el.removeEventListener('mouseleave', onLeave);
      };
    };

    enableOrient();
    enablePointer();

    return () => {
      cleanupOrient?.();
      cleanupMove?.();
    };
  }, [usingMotion]);

  return (
    <div
      ref={wrapRef}
      className={`relative ${className}`}
      style={{
        transform: `perspective(1000px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
        transformStyle: 'preserve-3d',
        transition: 'transform 0.15s ease-out',
      }}
    >
      {children}

      {/* Holographic sheen — only on PLATINUM. */}
      {holographic && (
        <div
          className="absolute inset-0 pointer-events-none rounded-2xl mix-blend-soft-light"
          style={{
            background: `radial-gradient(circle at ${shimmer.x}% ${shimmer.y}%, rgba(255,215,150,0.55) 0%, rgba(255,255,255,0.15) 25%, transparent 60%)`,
            transition: 'background 0.1s linear',
          }}
        />
      )}
      {/* Edge reflective accent */}
      {holographic && (
        <div
          className="absolute inset-0 pointer-events-none rounded-2xl"
          style={{
            background: `linear-gradient(${130 + tilt.y * 4}deg, transparent 0%, rgba(212,175,55,0.18) 50%, transparent 100%)`,
            transition: 'background 0.15s linear',
          }}
        />
      )}
    </div>
  );
}
