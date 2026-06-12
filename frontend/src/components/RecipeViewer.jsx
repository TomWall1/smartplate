import React, { useEffect } from 'react';
import { X, ExternalLink } from 'lucide-react';

/**
 * In-app viewer for the ORIGINAL publisher recipe page.
 *
 * Lead-gen by design: the publisher's own page loads in full (their ads,
 * their analytics) while the user never leaves the app — close returns to
 * the Smart Cook Card. Only used for publishers whose pages permit framing
 * (recipe.embedAllowed, probed weekly by the pipeline); others open in a
 * new tab instead.
 */
export default function RecipeViewer({ url, publisherLabel, onClose }) {
  // Lock background scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Close on Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(42, 36, 31, 0.5)' }}>
      <div className="flex flex-col flex-1 m-2 sm:m-6 rounded-[12px] overflow-hidden shadow-2xl" style={{ background: 'var(--color-surface)' }}>
        {/* Header bar */}
        <div
          className="flex items-center justify-between gap-3 px-4 py-3 flex-shrink-0"
          style={{ background: 'var(--color-parchment)', borderBottom: '1.5px solid var(--color-stone)' }}
        >
          <p className="text-sm min-w-0 truncate" style={{ color: 'var(--color-bark)', fontFamily: 'var(--font-ui)' }}>
            Viewing the original recipe on{' '}
            <span style={{ fontWeight: 800 }}>{publisherLabel}</span>
          </p>
          <div className="flex items-center gap-1 flex-shrink-0">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              title="Open in a new tab"
              className="p-2 rounded-xl transition-colors hover:bg-stone-200"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <ExternalLink className="w-4 h-4" />
            </a>
            <button
              onClick={onClose}
              title="Back to your deals"
              className="p-2 rounded-xl transition-colors hover:bg-stone-200"
              style={{ color: 'var(--color-bark)' }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* The publisher's page, ads and all */}
        <iframe
          src={url}
          title={`Recipe on ${publisherLabel}`}
          className="flex-1 w-full border-0"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
    </div>
  );
}
