import { useState } from 'react';
import {
  EPSILON,
  WEEKLY_RESOURCING_CAPACITY,
  fmt,
  frontloadAmount,
  frontloadLimit,
  projectMetrics,
  shiftWeek,
} from '../lib/utils.js';
import {
  BigField,
  ChoiceGroup,
  ReviewList,
  StepDialog,
  StepNote,
  StepSection,
} from './StepForm.jsx';
import { frontloadChoices, sameHours } from '../lib/frontloading.js';

// Moves hours from next week's allowance into this week. Two steps: how
// many hours, then a before → after check of both weeks.
export default function FrontloadModal({
  totals,
  project,
  week,
  leaveWeeks,
  onClose,
  onSave,
  title = 'Frontload hours',
  initialAmount = 0,
  preferInitial = false,
}) {
  const existing = frontloadAmount(project, week),
    next = shiftWeek(week, 1),
    cap = frontloadLimit(project, week),
    maximum = Math.max(existing, cap ?? 0),
    suggested = Math.min(maximum, Math.max(0, initialAmount)),
    initial = preferInitial ? suggested : existing || suggested,
    metrics = projectMetrics(project, week, leaveWeeks),
    overage = Math.max(
      0,
      metrics.logged - Math.max(0, Number(metrics.plan || 0)),
    );
  const options = frontloadChoices({ maximum, suggested, overage, existing });
  const preset = options.find(
    (option) => option.hours != null && sameHours(option.hours, initial),
  );
  const [choice, setChoice] = useState(
    preset ? preset.value : initial > 0 ? 'other' : '',
  );
  const [value, setValue] = useState(
    !preset && initial > 0 ? String(initial) : '',
  );
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const picked = options.find((option) => option.value === choice);
  const text = value.trim();
  const candidate =
    choice === 'other'
      ? text === ''
        ? NaN
        : Number(text)
      : (picked?.hours ?? NaN);
  const valid =
    !!picked &&
    (choice !== 'other' || /^\d+(\.\d{1,2})?$/.test(text)) &&
    Number.isFinite(candidate) &&
    candidate >= 0 &&
    candidate <= maximum + EPSILON;
  const amount = valid ? candidate : existing;
  const draft = {
    ...project,
    frontloads: { ...(project.frontloads || {}), [week]: amount },
  };
  const currentSource = projectMetrics(project, next, leaveWeeks),
    nextSource = projectMetrics(draft, next, leaveWeeks),
    destination = projectMetrics(draft, week, leaveWeeks),
    nextLow = (nextSource.weeklyAvailable ?? 0) < 3 - EPSILON,
    monthlyLimited =
      destination.weeklyAllowance != null &&
      destination.monthly != null &&
      destination.monthly < destination.weeklyAllowance - EPSILON;
  const hours = (n) => (n == null ? 'Unlimited' : `${fmt(n)}h`);
  const free = (resourced) => {
    const left = WEEKLY_RESOURCING_CAPACITY - resourced;
    return left < -EPSILON ? `${fmt(-left)}h over` : hours(Math.max(0, left));
  };
  const resourcedAfter =
    totals.resourced +
    (destination.weeklyAvailable || 0) -
    (metrics.weeklyAvailable || 0);
  const removing = valid && candidate === 0 && existing > 0;

  const nextStep = () => {
    if (step === 0) {
      if (!picked) return setError('Choose how many hours to move.');
      if (!valid)
        return setError(`Enter an amount between 0 and ${fmt(maximum)} hours.`);
      setError('');
      return setStep(1);
    }
    if (onSave(candidate) !== false) onClose();
  };

  return (
    <StepDialog
      title={`${title.replace(/\?$/, '')} · ${project.name}`}
      steps={['Hours', 'Check']}
      index={step}
      onBack={() => setStep(0)}
      onNext={nextStep}
      onJump={(i) => (i === 0 ? setStep(0) : nextStep())}
      onClose={onClose}
      finishLabel={removing ? 'Remove frontloading' : 'Save frontloading'}
    >
      {step === 0 && (
        <StepSection title="How many of next week’s hours should move to this week?">
          <ChoiceGroup
            ariaLabel="Hours to frontload"
            cols={Math.min(options.length, 4)}
            value={choice}
            onChange={(next) => {
              setChoice(next);
              setError('');
            }}
            options={options}
          />
          {choice === 'other' && (
            <BigField
              id="frontload-hours"
              label="Hours to frontload"
              unit="h"
              inputMode="decimal"
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                setError('');
              }}
              hint={`Up to ${fmt(maximum)}h. 0 removes the transfer.`}
              error={error || undefined}
              autoFocus
            />
          )}
          {error && choice !== 'other' && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          {valid && candidate > 0 && nextLow && (
            <StepNote tone="warn">
              This leaves {fmt(Math.max(0, nextSource.weeklyAvailable ?? 0))}h
              for next week. Usable time there may be too low.
            </StepNote>
          )}
        </StepSection>
      )}
      {step === 1 && (
        <StepSection
          title="Check and save"
          help={`Hours on ${project.name}, before → after.`}
        >
          <ReviewList
            rows={[
              [
                'This week',
                `${hours(metrics.weeklyAvailable)} → ${hours(destination.weeklyAvailable)}`,
              ],
              [
                'Next week',
                `${hours(currentSource.weeklyAvailable)} → ${hours(nextSource.weeklyAvailable)}`,
              ],
              [
                'Your free time this week',
                `${free(totals.resourced)} → ${free(resourcedAfter)}`,
              ],
            ]}
          />
          {monthlyLimited && (
            <StepNote>
              The monthly allowance still limits this week to{' '}
              {fmt(destination.monthly)}h.
            </StepNote>
          )}
        </StepSection>
      )}
    </StepDialog>
  );
}
