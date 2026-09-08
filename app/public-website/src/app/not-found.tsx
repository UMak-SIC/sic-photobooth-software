import Link from 'next/link';
import { BrandMark } from '../components/BrandMark';

export default function NotFound() {
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
      </header>
      <section className="public-output-card public-output-unavailable" aria-labelledby="unavailable-title">
        <p className="eyebrow">DELIVERY UNAVAILABLE</p>
        <h1 id="unavailable-title">This photo is unavailable</h1>
        <p>This photo has not been published or is no longer available.</p>
        <Link className="public-output-download" href="/">
          Try another code
        </Link>
      </section>
      <footer className="site-footer">
        <p>UMak Society of Innovative Computing</p>
      </footer>
    </main>
  );
}
