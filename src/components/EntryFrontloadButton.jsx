import { clockForwardIcon } from './frontloadIcons.jsx';
import { fmt } from '../lib/utils.js';

const EntryFrontloadButton = ({ project, amount, onOpen, adjustment = false }) => {
  const label = adjustment
    ? 'Adjust frontloaded hours to the weekly overage'
    : 'Frontload additional hours';
  return (
    <button
      className="entry-frontload-button"
      onClick={onOpen}
      aria-label={`${label} for ${project.name}`}
      title={label}
    >
      {clockForwardIcon} {fmt(amount)}h
    </button>
  );
};

export default EntryFrontloadButton;
