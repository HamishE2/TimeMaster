import {
  EPSILON,
  dayDate,
  monthKey,
  monthlyLogged,
  monthlyPlan,
  projectMetrics,
} from '../lib/utils.js';
import AllocationMeter from './AllocationMeter.jsx';

export default function ProjectAllocationBars({
  project,
  week,
  leaveWeeks,
  className = '',
}) {
  const metrics = projectMetrics(project, week, leaveWeeks),
    month = monthKey(dayDate(week, 3)),
    monthlyAllocation = monthlyPlan(project, week),
    monthlyUsed =
      monthlyAllocation == null ? 0 : monthlyLogged(project, month, leaveWeeks),
    sourceWeek = metrics.frontloadedOut > EPSILON,
    weeklyAllocation = sourceWeek ? metrics.plan : metrics.weeklyAllowance,
    nativeWeekly = sourceWeek
      ? Math.max(0, Number(metrics.plan || 0))
      : Math.max(0, Number(metrics.plan || 0) - metrics.frontloadedOut),
    frontloadedWeekly = sourceWeek
      ? 0
      : Math.max(0, (metrics.weeklyAvailable || 0) - nativeWeekly),
    fullyUnlimited = weeklyAllocation == null && monthlyAllocation == null;
  return (
    <div className={`project-allocation-bars ${className}`}>
      {fullyUnlimited ? (
        <span className="allocation-unlimited">Unlimited</span>
      ) : (
        <>
          <AllocationMeter
            label="Weekly"
            used={metrics.logged}
            allocation={weeklyAllocation}
            nativeAllocation={nativeWeekly}
            frontloaded={frontloadedWeekly}
            frontloadedUsage={metrics.frontloadedOut}
          />
          {monthlyAllocation != null && (
            <AllocationMeter
              label="Monthly"
              used={monthlyUsed}
              allocation={monthlyAllocation}
            />
          )}
        </>
      )}
    </div>
  );
}
