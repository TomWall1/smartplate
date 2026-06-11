/**
 * Golden-set eval for the match-edge judging model.
 *
 * Runs each candidate model over scripts/eval/goldenSet.json using EXACTLY
 * the production judge prompt (matchEdgeService.buildJudgePrompt) and reports
 * precision / recall / F1 / accuracy plus measured token cost.
 *
 * "Positive" = pair labeled valid. A false positive (model approves a bad
 * match) is the costly error for the product — shoppers see a wrong deal —
 * so precision matters most, recall second.
 *
 * Usage:
 *   node backend/scripts/eval/evalMatchModels.js            # Haiku, Sonnet, Opus 4.8
 *   node backend/scripts/eval/evalMatchModels.js --fable    # also Claude Fable 5
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { buildJudgePrompt } = require('../../services/matchEdgeService');

const BATCH_SIZE = 25;

// $/MTok input, output (platform.claude.com/docs pricing, June 2026)
const MODELS = [
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5',  inPrice: 1,  outPrice: 5  },
  { id: 'claude-sonnet-4-6',         label: 'Sonnet 4.6', inPrice: 3,  outPrice: 15 },
  { id: 'claude-opus-4-8',           label: 'Opus 4.8',   inPrice: 5,  outPrice: 25 },
];
if (process.argv.includes('--fable')) {
  MODELS.push({ id: 'claude-fable-5', label: 'Fable 5', inPrice: 10, outPrice: 50, fable: true });
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function judgeBatch(model, pairs) {
  const params = {
    model: model.id,
    // Fable thinks before answering and thinking tokens count toward
    // max_tokens — give it headroom and keep effort low for a routine task.
    max_tokens: model.fable ? 8192 : 2048,
    messages: [{ role: 'user', content: buildJudgePrompt(pairs) }],
  };
  if (model.fable) params.output_config = { effort: 'low' };

  const response = await client.messages.create(params);
  if (response.stop_reason === 'refusal') throw new Error('model refused');

  const textBlock = response.content.find(b => b.type === 'text');
  const text = (textBlock?.text ?? '').trim();
  const json = text.replace(/^```json?\n?/i, '').replace(/\n?```$/i, '').trim();
  const parsed = JSON.parse(json);

  const verdicts = pairs.map(() => null);
  for (const entry of parsed) {
    if (entry && typeof entry.index === 'number' && typeof entry.valid === 'boolean') {
      const i = entry.index - 1;
      if (i >= 0 && i < pairs.length) verdicts[i] = entry.valid;
    }
  }
  return { verdicts, usage: response.usage };
}

(async () => {
  const golden = JSON.parse(fs.readFileSync(path.join(__dirname, 'goldenSet.json'), 'utf8')).pairs;
  const positives = golden.filter(p => p.label).length;
  console.log(`Golden set: ${golden.length} pairs (${positives} valid, ${golden.length - positives} invalid)\n`);

  const batches = [];
  for (let i = 0; i < golden.length; i += BATCH_SIZE) batches.push(golden.slice(i, i + BATCH_SIZE));

  const summary = [];
  for (const model of MODELS) {
    let tp = 0, fp = 0, tn = 0, fn = 0, unanswered = 0;
    let inTok = 0, outTok = 0;
    const started = Date.now();
    const errors = []; // misclassified pairs for review

    for (const batch of batches) {
      let result;
      try {
        result = await judgeBatch(model, batch);
      } catch (err) {
        console.warn(`  ${model.label}: batch failed (${err.message}) — counting as unanswered`);
        unanswered += batch.length;
        continue;
      }
      inTok  += result.usage?.input_tokens  ?? 0;
      outTok += result.usage?.output_tokens ?? 0;
      batch.forEach((pair, i) => {
        const v = result.verdicts[i];
        if (v === null) { unanswered++; return; }
        if (v === true  && pair.label === true)  tp++;
        else if (v === true  && pair.label === false) { fp++; errors.push({ kind: 'FP', ...pair }); }
        else if (v === false && pair.label === false) tn++;
        else { fn++; errors.push({ kind: 'FN', ...pair }); }
      });
    }

    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall    = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1        = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;
    const accuracy  = (tp + tn) / golden.length;
    const cost      = (inTok * model.inPrice + outTok * model.outPrice) / 1e6;
    const secs      = ((Date.now() - started) / 1000).toFixed(0);

    summary.push({ model: model.label, precision, recall, f1, accuracy, fp, fn, unanswered, cost, secs });
    console.log(`${model.label}: P=${(precision * 100).toFixed(1)}% R=${(recall * 100).toFixed(1)}% F1=${(f1 * 100).toFixed(1)}% acc=${(accuracy * 100).toFixed(1)}% | FP=${fp} FN=${fn} unanswered=${unanswered} | $${cost.toFixed(4)} in ${secs}s`);
    for (const e of errors) {
      console.log(`    ${e.kind}: "${e.ingredient}" ↔ "${e.dealName}"${e.note ? ` (${e.note})` : ''}`);
    }
    console.log('');
  }

  console.log('=== SUMMARY (sorted by precision, then F1) ===');
  summary.sort((a, b) => b.precision - a.precision || b.f1 - a.f1);
  for (const s of summary) {
    console.log(`${s.model.padEnd(11)} P=${(s.precision * 100).toFixed(1).padStart(5)}% R=${(s.recall * 100).toFixed(1).padStart(5)}% F1=${(s.f1 * 100).toFixed(1).padStart(5)}% | FP=${s.fp} FN=${s.fn} | $${s.cost.toFixed(4)}`);
  }
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
