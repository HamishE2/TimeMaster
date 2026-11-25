import Modal from './Modal.jsx';

// Building blocks for the stepped setup dialogs (historical usage, project
// editor, add a line, CSV import, frontloading): one question per step,
// large choice buttons and fields, and Back / Next. Styles: src/stepForm.css.

// The dialog shell: step pills, "Step n of m", the current step and the
// Back / Next buttons. Enter submits the form, which moves to the next step.
export function StepDialog({
  title,
  steps,
  index,
  onBack,
  onNext,
  onClose,
  finishLabel,
  nextDisabled = false,
  children,
}) {
  const last = index === steps.length - 1;
  return (
    <Modal title={title} onClose={onClose} wide>
      <form
        className="cfg-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!nextDisabled) onNext();
        }}
        noValidate
      >
        {steps.length > 1 && (
          <>
            <ol className="cfg-steps" aria-label="Steps">
              {steps.map((name, i) => (
                <li
                  key={name}
                  aria-current={i === index ? 'step' : undefined}
                  className={i < index ? 'is-done' : ''}
                >
                  <span aria-hidden="true">{i < index ? '✓' : i + 1}</span>
                  {name}
                </li>
              ))}
            </ol>
            <p className="cfg-count">
              Step {index + 1} of {steps.length}
            </p>
          </>
        )}
        {children}
        <div className="cfg-actions">
          <button
            type="button"
            className="cfg-button"
            onClick={index === 0 ? onClose : onBack}
          >
            {index === 0 ? 'Cancel' : '← Back'}
          </button>
          <button
            type="submit"
            className="cfg-button primary"
            disabled={nextDisabled}
          >
            {last ? finishLabel : 'Next →'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// One step: its question as a heading, an optional line of help, then the
// step's controls.
export function StepSection({ title, help, children }) {
  return (
    <section className="cfg-section" aria-labelledby="cfg-step-title">
      <h3 id="cfg-step-title">{title}</h3>
      {help && <p className="help">{help}</p>}
      {children}
    </section>
  );
}

// One big field: a label, a large input with an optional prefix and unit,
// and a hint or an error underneath.
export function BigField({ id, label, unit, prefix, hint, error, ...input }) {
  return (
    <div className="cfg-field">
      <label htmlFor={id}>{label}</label>
      <span className={`cfg-input${error ? ' is-error' : ''}`}>
        {prefix && <span aria-hidden="true">{prefix}</span>}
        <input id={id} aria-invalid={!!error} {...input} />
        {unit && <span>{unit}</span>}
      </span>
      {error ? (
        <span className="field-error" role="alert">
          {error}
        </span>
      ) : (
        hint && <small className="help">{hint}</small>
      )}
    </div>
  );
}

// Big buttons in place of selects, radios and checkboxes. `multi` makes
// them checkboxes over an array value. Options: { value, label, sub, color,
// disabled, badge, badgeTone ('new' | 'update') }.
export function ChoiceGroup({
  label,
  ariaLabel,
  options,
  value,
  onChange,
  multi = false,
  cols,
}) {
  const on = (option) =>
    multi ? (value || []).includes(option.value) : value === option.value;
  const pick = (option) => {
    if (option.disabled) return;
    if (!multi) return onChange(option.value);
    const list = value || [];
    onChange(
      list.includes(option.value)
        ? list.filter((item) => item !== option.value)
        : [...list, option.value],
    );
  };
  const group = (
    <div
      className="cfg-choices"
      role={multi ? 'group' : 'radiogroup'}
      aria-label={ariaLabel || label}
      style={cols ? { '--cols': cols } : undefined}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role={multi ? 'checkbox' : 'radio'}
          aria-checked={on(option)}
          disabled={option.disabled}
          className="cfg-choice"
          style={option.color ? { '--pc': option.color } : undefined}
          onClick={() => pick(option)}
        >
          {option.color && <i className="cfg-dot" aria-hidden="true" />}
          {multi && !option.color && (
            <i className="cfg-check" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="m5 12.5 4.5 4.5L19 7.5" />
              </svg>
            </i>
          )}
          <span className="cfg-choice-text">
            <b>{option.label}</b>
            {option.sub && <small>{option.sub}</small>}
          </span>
          {option.badge && (
            <span
              className={`cfg-badge${option.badgeTone ? ` is-${option.badgeTone}` : ''}`}
            >
              {option.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
  if (!label) return group;
  return (
    <div className="cfg-group">
      <span className="cfg-label" aria-hidden="true">
        {label}
      </span>
      {group}
    </div>
  );
}

// What is left once the rows above are filled in.
export function RemainderRow({ label, value, over = false }) {
  return (
    <div className={`cfg-rest${over ? ' is-over' : ''}`}>
      <span>{label}</span>
      <b>{over ? '—' : value}</b>
    </div>
  );
}

// The Check step's summary: [label, value] rows.
export function ReviewList({ rows }) {
  return (
    <dl className="cfg-review">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function StepNote({ tone, children }) {
  return (
    <p className={`cfg-note${tone === 'warn' ? ' is-warn' : ''}`} role="note">
      {children}
    </p>
  );
}
