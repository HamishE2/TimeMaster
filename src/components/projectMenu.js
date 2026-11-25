// The Projectworks item shared by every project menu (Time view rows, Money
// view cards and Needs attention): opens the project's Projectworks page in a
// new tab, or offers to add the link when there is none.
export function projectworksMenuItem(project, onAddLink) {
  if (project?.projectworksUrl)
    return [
      'Open in Projectworks ↗',
      () =>
        window.open(project.projectworksUrl, '_blank', 'noopener,noreferrer'),
    ];
  return ['Add Projectworks link…', () => onAddLink(project)];
}
