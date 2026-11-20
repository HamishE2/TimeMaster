import { clockForwardIcon } from './frontloadIcons.jsx';

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
      {clockForwardIcon} {amount}h
    </button>
  );
};

export default EntryFrontloadButton;
