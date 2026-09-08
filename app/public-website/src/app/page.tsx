import { BrandMark } from '../components/BrandMark';
import { PublicLookupForm } from '../components/PublicLookupForm';
import Link from 'next/link';

export default function Home() {
  return (
    <main className="landing-page">
      <header className="site-header">
        <Link className="brand" href="/" aria-label="UMak Society of Innovative Computing">
          <BrandMark />
          <span>
            <strong>UMak Society of Innovative Computing</strong>
            <small>PUBLIC DELIVERY</small>
          </span>
        </Link>
      </header>
      <section className="landing-content" aria-labelledby="landing-title">
        <div className="landing-copy-column">
          <h1 id="landing-title">Find your photos.</h1>
          <p className="landing-copy">
            Enter the code on your card to open your photos and save a copy.
          </p>
          <PublicLookupForm />
        </div>
      </section>
      <footer className="site-footer">
        <p>UMak Society of Innovative Computing</p>
        <p>Each delivery link is available for two months.</p>
      </footer>
    </main>
  );
}
