import { EPSILON, fmt, projectMetrics } from '../lib/utils.js';
import FrontloadWarning from './FrontloadWarning.jsx';
import ProjectAllocationBars from './ProjectAllocationBars.jsx';

export default function Insights({ projects, week, leaveWeeks }) {
  const groups = { over: [], at: [], under: [], unlimited: [] };
  projects.forEach((p) =>
    groups[projectMetrics(p, week, leaveWeeks).status].push(p),
  );
  return (
    <aside className="insights">
      <div>
        <h2>Project usage</h2>
      </div>
      {[
        ['over', 'Over plan'],
        ['at', 'At plan'],
        ['under', 'Allowance left'],
        ['unlimited', 'Unlimited'],
      ].map(
        ([key, label]) =>
          groups[key].length > 0 && (
            <section className={`insight-group group-${key}`} key={key}>
              <h3>
                {label}
                <span>{groups[key].length}</span>
              </h3>
              {groups[key].map((p) => {
                const m = projectMetrics(p, week, leaveWeeks),
                  over = m.remaining != null && m.remaining < -EPSILON;
                return (
                  <div className={`insight-item ${key}`} key={p.id}>
                    <div>
                      <div className="insight-title">
                        <strong>
                          <i
                            className="project-ring"
                            style={{ color: p.color }}
                          />
                          {p.name}
                          <FrontloadWarning metrics={m} />
                        </strong>
                        {p.client?.trim() && (
                          <small className="insight-client">
                            {p.client.trim()}
                          </small>
                        )}
                      </div>
                      <span>
                        {m.remaining == null
                          ? `${fmt(m.logged)}h logged`
                          : over
                            ? `${fmt(-m.remaining)}h over`
                            : Math.abs(m.remaining) <= EPSILON
                              ? 'At plan'
                              : `${fmt(m.logged)} / ${fmt(m.effective)}h`}
                      </span>
                    </div>
                    <ProjectAllocationBars className={key === "under" && m.effective === m.weeklyAllowance && !m.frontloadedOut ? "summary-has-weekly" : ""}
                      project={p}
                      week={week}
                      leaveWeeks={leaveWeeks}
                    />
                  </div>
                );
              })}
            </section>
          ),
      )}
      {projects.length === 0 && (
        <p className="quiet">No projects are scheduled for this week.</p>
      )}
    </aside>
  );
}
