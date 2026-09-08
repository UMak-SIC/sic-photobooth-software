'use client';

import { parsePublicId } from '@photobooth/public-output';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { QrCameraScanner } from './QrCameraScanner';

export function PublicLookupForm() {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  function openPhoto(publicId: string) {
    setError('');
    startTransition(() => router.push(`/${publicId}`));
  }

  function handleSubmit(formData: FormData) {
    const publicId = parsePublicId(String(formData.get('publicId') ?? ''));
    if (!publicId) {
      setError('Enter the seven-character code or the full link from your printed card.');
      return;
    }

    openPhoto(publicId);
  }

  return (
    <form action={handleSubmit} className="lookup-form" noValidate>
      <label htmlFor="public-id">Find your photo</label>
      <div className="lookup-fields">
        <input
          id="public-id"
          name="publicId"
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="7fK92pQ or full link"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck="false"
          aria-describedby={error ? 'public-id-error' : undefined}
          aria-invalid={Boolean(error)}
        />
        <button type="submit" disabled={isPending}>
          {isPending ? 'Opening...' : 'Open photo'}
        </button>
      </div>
      <QrCameraScanner onScan={openPhoto} />
      <p id="public-id-error" className="lookup-error" aria-live="polite">
        {error}
      </p>
    </form>
  );
}
