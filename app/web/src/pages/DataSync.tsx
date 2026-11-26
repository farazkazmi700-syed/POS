import { Link } from 'react-router-dom';
import './Support.css';

export default function DataSync() {
  return (
    <div className="support-page">
      <section className="support-hero" aria-labelledby="data-sync-title">
        <h1 id="data-sync-title" className="support-title">Data Sync</h1>
        <p className="support-copy">Cloud synchronization is disabled in V1. You can download a local business backup.</p>
        <Link className="support-button mt-4" to="/backup">Business Backup</Link>
      </section>
    </div>
  );
}
