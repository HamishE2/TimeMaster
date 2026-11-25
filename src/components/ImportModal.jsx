import { useRef, useState } from 'react';
import { parseCSV } from '../lib/csvParser.js';
import { fmtHours } from '../lib/utils.js';
import { classifyProject } from '../lib/projectImport.js';
import {
  ChoiceGroup,
  ReviewList,
  StepDialog,
  StepSection,
} from './StepForm.jsx';

const BADGES = {
  new: ['New', 'new'],
  update: ['Updates existing', 'update'],
  skip: ['No change', null],
};

// "Import CSV": choose a resourcing sheet or timesheet export, pick the
// projects to bring in (new and changed ones are ticked; unchanged ones
// can't be), then check the counts and import.
export default function ImportModal({ onClose, existingProjects, onImport }) {
  const [step, setStep] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [classified, setClassified] = useState([]);
  const [selected, setSelected] = useState([]);
  const fileInput = useRef(null);

  const processText = (text, name) => {
    const parsed = parseCSV(text);
    const fail = (message) => {
      setError(message);
      setResult(null);
      setClassified([]);
      setSelected([]);
    };
    if (!parsed)
      return fail('That file isn’t a resourcing sheet or a timesheet export.');
    if (parsed.error) return fail(parsed.error);
    if (!parsed.projects?.length) return fail('No projects found in the file.');
    const items = parsed.projects.map((project) =>
      classifyProject(project, existingProjects, parsed.format, parsed.weekKey),
    );
    setError(null);
    setFileName(name);
    setResult(parsed);
    setClassified(items);
    setSelected(
      items.flatMap((item, i) => (item.status === 'skip' ? [] : [String(i)])),
    );
  };
  const readFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => processText(event.target.result, file.name);
    reader.readAsText(file);
  };

  const chosen = classified.filter((_, i) => selected.includes(String(i)));
  const news = chosen.filter((item) => item.status === 'new');
  const updates = chosen.filter((item) => item.status === 'update');
  const resourcing = result?.format === 'resourcing';
  const detail = (item) =>
    resourcing
      ? item.status === 'update'
        ? `${fmtHours(item.existingHours)}h → ${fmtHours(item.resourcedHours)}h resourced`
        : `${fmtHours(item.resourcedHours)}h resourced`
      : `${fmtHours(item.totalHours)}h logged`;

  const next = () => {
    if (step < 2) return setStep(step + 1);
    if (!chosen.length) return;
    onImport(result, chosen);
    onClose();
  };

  return (
    <StepDialog
      title="Import CSV"
      steps={['File', 'Projects', 'Check']}
      index={step}
      onBack={() => setStep(step - 1)}
      onNext={next}
      onJump={setStep}
      locked={[false, !classified.length, !classified.length || !chosen.length]}
      onClose={onClose}
      finishLabel={`Import ${chosen.length} project${chosen.length === 1 ? '' : 's'}`}
      nextDisabled={step === 0 ? !classified.length : !chosen.length}
    >
      {step === 0 && (
        <StepSection title="Which file are you importing?">
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.txt,.tsv"
            hidden
            aria-hidden="true"
            tabIndex={-1}
            onChange={(event) => readFile(event.target.files?.[0])}
          />
          <button
            type="button"
            className={`cfg-drop${dragOver ? ' is-over' : ''}`}
            onClick={() => fileInput.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragOver(false);
              readFile(event.dataTransfer.files?.[0]);
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 4v11M7 10l5 5 5-5" />
              <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
            </svg>
            <b>
              {result
                ? 'Choose a different file'
                : 'Drop a CSV or choose a file'}
            </b>
            {result && (
              <small>
                {fileName} · {classified.length} project
                {classified.length === 1 ? '' : 's'} found ·{' '}
                {resourcing ? 'resourcing sheet' : 'timesheet'}
                {result.weekKey ? ` · week of ${result.weekKey}` : ''}
              </small>
            )}
          </button>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
        </StepSection>
      )}
      {step === 1 && (
        <StepSection title="Which projects should come in?">
          <ChoiceGroup
            multi
            ariaLabel="Projects to import"
            cols={1}
            value={selected}
            onChange={setSelected}
            options={classified.map((item, i) => ({
              value: String(i),
              label: item.name,
              sub:
                item.status === 'skip' ? 'Matches what you have' : detail(item),
              badge: BADGES[item.status][0],
              badgeTone: BADGES[item.status][1],
              disabled: item.status === 'skip',
            }))}
          />
        </StepSection>
      )}
      {step === 2 && (
        <StepSection title="Check and import">
          <ReviewList
            rows={[
              ['File', fileName],
              ['New projects', String(news.length)],
              [
                'Updated projects',
                updates.length
                  ? `${updates.length} · ${updates.map((item) => item.name).join(', ')}`
                  : '0',
              ],
              ['Left alone', String(classified.length - chosen.length)],
            ]}
          />
        </StepSection>
      )}
    </StepDialog>
  );
}
