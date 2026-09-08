import { isValidPublicId } from '@photobooth/public-output';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BrandMark } from '../../components/BrandMark';
import { lookupPublicOutput } from './actions';

/* Cloudinary output URLs are dynamic public assets and do not have a fixed image host. */
/* eslint-disable @next/next/no-img-element */

function formatEventDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

export default async function PublicOutputPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isValidPublicId(id)) notFound();
  const output = await lookupPublicOutput(id);
  if (!output) notFound();

  const label = output.sessionType === 'flipbook' ? 'Flipbook' : 'Photo strip';
  return (
    <main className="public-output-page">
      <header className="site-header">
        <Link className="brand" href="/" aria-label="UMak Society of Innovative Computing">
          <BrandMark />
          <span>
            <strong>UMak Society of Innovative Computing</strong>
            <small>PUBLIC DELIVERY</small>
          </span>
        </Link>
        <Link className="quiet-link" href="/">
          Find another photo
        </Link>
      </header>
      <section className="public-output-card" aria-labelledby="output-title">
        <div className="output-intro">
          <p className="eyebrow">{output.sessionType === 'flipbook' ? 'LOOPING FLIPBOOK' : 'PHOTO STRIP'}</p>
          <h1 id="output-title">Your {label}</h1>
          <p className="public-output-meta">{output.eventName}</p>
          <p className="public-output-date">{formatEventDate(output.eventDate)}</p>
        </div>
        <figure className="public-output-frame">
          <img className="public-output-media" src={output.mediaUrl} alt={`${label} from ${output.eventName}`} />
        </figure>
        <div className="output-actions">
          <a
            className="public-output-download"
            href={`/${output.publicId}/download`}
          >
            Save {label.toLowerCase()}
          </a>
          <p className="public-output-note">Available for two months after the event.</p>
        </div>
      </section>
      <footer className="site-footer">
        <p>UMak Society of Innovative Computing</p>
      </footer>
    </main>
  );
}
