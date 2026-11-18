import { clockForwardIcon } from './frontloadIcons.jsx';
import { canFrontload } from '../lib/frontloading.js';

const FrontloadButton = ({ project, week, onOpen }) =>
  canFrontload(project, week) ? (
    <button
      className="frontload-button"
      onClick={onOpen}
      aria-label={`Frontload hours for ${project.name}`}
      title="Frontload hours from next week"
    >
      {clockForwardIcon}
    </button>
  ) : null;

export default FrontloadButton;
