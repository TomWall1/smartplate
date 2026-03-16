import React, { useState } from 'react';
import { ThumbsDown, X, Check, Loader } from 'lucide-react';
import { feedbackApi } from '../services/api';

const REASONS = [
  'Wrong product type (e.g. stock cube matched fresh chicken)',
  'Wrong category (e.g. condiment matched as protein)',
  'Wrong form (e.g. fresh product for a pantry ingredient)',
  'Completely unrelated product',
  'Other',
];

export default function MatchFeedbackButton({ recipeId, recipeTitle, ingredientName, productName, store }) {
  const [open, setOpen]       = useState(false);
  const [reason, setReason]   = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone]       = useState(false);

  if (done) {
    return (
      <span className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}>
        <Check className="w-3 h-3" /> Reported
      </span>
    );
  }

  const submit = async (r) => {
    setSending(true);
    try {
      await feedbackApi.reportMatch({
        recipe_id:       recipeId,
        recipe_title:    recipeTitle,
        ingredient_name: ingredientName,
        product_name:    productName,
        store,
        feedback_type:   'incorrect',
        reason:          r,
      });
      setDone(true);
    } catch {
      // fail silently — don't disrupt UX
    } finally {
      setSending(false);
      setOpen(false);
    }
  };

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(o => !o)}
        title="Report incorrect match"
        className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg border transition-all hover:bg-red-50"
        style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-stone)', fontFamily: 'Nunito, sans-serif' }}
      >
        <ThumbsDown className="w-3 h-3" /> Wrong match
      </button>

      {open && (
        <div
          className="absolute z-50 right-0 top-7 w-64 rounded-xl border shadow-lg p-3"
          style={{ background: '#fff', borderColor: 'var(--color-stone)' }}
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)' }}>
              Why is this wrong?
            </p>
            <button onClick={() => setOpen(false)}><X className="w-3 h-3" style={{ color: 'var(--color-text-muted)' }} /></button>
          </div>
          <p className="text-xs mb-2" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-text-muted)' }}>
            <strong>{ingredientName}</strong> → {productName}
          </p>
          <div className="flex flex-col gap-1">
            {REASONS.map(r => (
              <button
                key={r}
                onClick={() => submit(r)}
                disabled={sending}
                className="text-left text-xs px-2 py-1.5 rounded-lg border transition-all hover:bg-red-50 disabled:opacity-50"
                style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)', borderColor: 'var(--color-stone)' }}
              >
                {sending ? <Loader className="w-3 h-3 animate-spin inline mr-1" /> : null}
                {r}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
