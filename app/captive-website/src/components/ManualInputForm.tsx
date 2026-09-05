'use client';

import React, { useState, useRef, useMemo } from 'react';
import {
  KeyRound,
  ClipboardPaste,
  ArrowRight,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { parsePublicId, isValidPublicId } from '@photobooth/public-output';

interface ManualInputFormProps {
  onSubmitCode: (publicId: string) => void;
}

export function ManualInputForm({ onSubmitCode }: ManualInputFormProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [pasteNotice, setPasteNotice] = useState<string | null>(null);
  const [isCooldown, setIsCooldown] = useState(false);
  const [failCount, setFailCount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Live parsed valid ID
  const activeValidId = useMemo(() => {
    const trimmed = inputValue.trim();
    if (!trimmed) return null;

    const parsed = parsePublicId(trimmed);
    if (parsed) return parsed;

    try {
      const url = new URL(trimmed);
      const segments = url.pathname.split('/').filter(Boolean);
      const candidate = segments[segments.length - 1];
      if (candidate && isValidPublicId(candidate)) {
        return candidate;
      }
    } catch {
      // Non-URL
    }

    return null;
  }, [inputValue]);

  const handleSubmit = (e?: React.FormEvent | React.KeyboardEvent) => {
    if (e) {
      e.preventDefault();
    }
    if (isCooldown || isSubmitting) return;

    setValidationError(null);
    const trimmed = inputValue.trim();
    if (!trimmed) {
      setValidationError('Please enter a 7-character code or QR link.');
      return;
    }

    const parsedId = activeValidId || parsePublicId(trimmed);
    if (!parsedId) {
      const nextFails = failCount + 1;
      setFailCount(nextFails);
      setValidationError('Photo not found. Check the QR code or enter the full link/code again.');

      if (nextFails >= 2) {
        setIsCooldown(true);
        setTimeout(() => {
          setIsCooldown(false);
        }, 2000);
      }
      return;
    }

    setFailCount(0);
    setIsSubmitting(true);
    onSubmitCode(parsedId);
  };

  const handlePaste = async () => {
    setPasteNotice(null);
    try {
      if (!navigator?.clipboard?.readText) {
        inputRef.current?.focus();
        setPasteNotice('Tap and hold box to paste');
        setTimeout(() => setPasteNotice(null), 3000);
        return;
      }

      const text = await navigator.clipboard.readText();
      if (text) {
        const trimmed = text.trim();
        setInputValue(trimmed);
        if (validationError) setValidationError(null);

        const parsed = parsePublicId(trimmed);
        if (parsed) {
          setPasteNotice(`Pasted valid code: ${parsed}`);
        } else {
          setPasteNotice('Pasted from clipboard!');
        }
        setTimeout(() => setPasteNotice(null), 2500);
      } else {
        inputRef.current?.focus();
        setPasteNotice('Clipboard is empty');
        setTimeout(() => setPasteNotice(null), 2500);
      }
    } catch {
      inputRef.current?.focus();
      setPasteNotice('Tap and hold box to paste');
      setTimeout(() => setPasteNotice(null), 3000);
    }
  };

  return (
    <form
      action="/lookup"
      method="GET"
      onSubmit={handleSubmit}
      className="w-full rounded-3xl border border-white/10 bg-gradient-to-b from-[#0e2a24] to-[#071d1a] p-6 sm:p-8 shadow-[0_20px_50px_rgba(0,0,0,0.5)] text-left"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="grid size-9 place-items-center rounded-xl bg-white/5 border border-white/10 text-[#a8f3dd] shadow-inner">
            <KeyRound className="size-4.5" />
          </div>
          <div>
            <p className="text-[10px] font-bold tracking-[0.2em] text-[#76d2bb] uppercase">
              Manual Retrieval
            </p>
            <h3 className="text-base sm:text-lg font-black text-white">Enter 7-Character Code</h3>
          </div>
        </div>
        <span className="rounded-full bg-white/5 border border-white/10 px-3 py-1 text-[11px] font-mono text-[#9ec4b9]">
          e.g. 5TFDZiy
        </span>
      </div>

      <p className="mt-3 text-xs text-[#9ec4b9] leading-relaxed">
        Type the alphanumeric code printed beneath the QR code on your card, or paste the full
        retrieval link.
      </p>

      <div className="mt-5 flex flex-col gap-3.5">
        <div className="relative flex items-center">
          <input
            ref={inputRef}
            name="code"
            type="text"
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              if (validationError) setValidationError(null);
            }}
            placeholder="5TFDZiy or https://myphotobooth.com/..."
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck="false"
            className={`w-full rounded-2xl border bg-black/60 px-4 py-3.5 pr-24 text-sm font-mono text-white placeholder-white/25 focus:outline-none transition shadow-inner ${
              activeValidId
                ? 'border-[#48c4a1] ring-2 ring-[#48c4a1]/20 shadow-[0_0_20px_rgba(72,196,161,0.15)]'
                : 'border-white/15 focus:border-[#a8f3dd] focus:ring-2 focus:ring-[#a8f3dd]/20'
            }`}
          />
          <button
            type="button"
            onClick={handlePaste}
            className="absolute right-2.5 inline-flex items-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/20 px-3 py-1.5 text-xs font-semibold text-[#a8f3dd] transition active:scale-95"
          >
            <ClipboardPaste className="size-3.5" />
            Paste
          </button>
        </div>

        {/* Live Valid Code Feedback Banner */}
        {activeValidId && !validationError && (
          <div className="flex items-center gap-2 rounded-xl bg-[#146a56]/40 border border-[#48c4a1]/40 px-3.5 py-2 text-xs font-semibold text-[#a8f3dd] animate-fade-in shadow-sm">
            <CheckCircle2 className="size-4 shrink-0 text-[#48c4a1]" />
            <span>
              Valid photo code detected:{' '}
              <strong className="font-mono text-white tracking-wider">{activeValidId}</strong>
            </span>
          </div>
        )}

        {/* Paste Confirmation Toast */}
        {pasteNotice && !activeValidId && (
          <div className="flex items-center gap-2 rounded-xl bg-[#146a56]/40 border border-[#48c4a1]/30 px-3.5 py-2 text-xs font-semibold text-[#a8f3dd]">
            <Sparkles className="size-3.5 text-[#48c4a1]" />
            <span>{pasteNotice}</span>
          </div>
        )}

        {/* Validation Error Toast */}
        {validationError && (
          <div className="flex items-center gap-2 rounded-xl bg-rose-950/50 border border-rose-800/60 px-3.5 py-2.5 text-xs font-semibold text-rose-200">
            <AlertCircle className="size-4 shrink-0 text-rose-400" />
            <span>{validationError}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={isCooldown || isSubmitting}
          className={`w-full inline-flex items-center justify-center gap-2 rounded-2xl py-4 px-6 text-sm font-black transition active:scale-[0.98] shadow-lg cursor-pointer ${
            isCooldown || isSubmitting
              ? 'bg-neutral-800 text-neutral-400 cursor-not-allowed border border-white/5'
              : activeValidId
                ? 'bg-[#a8f3dd] text-[#145142] hover:bg-[#90e8d0] shadow-[0_10px_25px_rgba(168,243,221,0.3)]'
                : 'bg-[#a8f3dd]/90 text-[#145142] hover:bg-[#a8f3dd]'
          }`}
        >
          {isCooldown ? (
            <>
              <Loader2 className="size-4 animate-spin text-neutral-500" />
              <span>Please wait 2 seconds...</span>
            </>
          ) : isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin text-[#145142]" />
              <span>Retrieving Photo...</span>
            </>
          ) : (
            <>
              <span>Retrieve Photo</span>
              <ArrowRight className="size-4" />
            </>
          )}
        </button>
      </div>
    </form>
  );
}

