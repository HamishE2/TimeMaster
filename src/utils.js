export const SCHEMA_VERSION = 3;
export const DAY_NAMES = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
export const DAY_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
export const DEFAULT_VISIBLE_DAYS = [0,1,2,3,4];
export const DEFAULT_CAPACITY = [7.6,7.6,7.6,7.6,7.6,0,0];
export const WEEKLY_RESOURCING_CAPACITY = 22.8;
export const EPSILON = 0.01;

export const uuid = () => crypto.randomUUID?.() ?? `p-${Date.now()}-${Math.random().toString(16).slice(2)}`;
export function dateString(date) { const d = new Date(date); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
export function mondayFor(date) { const d = new Date(date); d.setHours(0,0,0,0); d.setDate(d.getDate() - ((d.getDay()+6)%7)); return d; }
export const weekKeyFor = date => dateString(mondayFor(date));
export function shiftWeek(key, amount) { const d = new Date(`${key}T12:00:00`); d.setDate(d.getDate()+amount*7); return dateString(d); }
export function weekDates(key, visibleDays) { const d = new Date(`${key}T12:00:00`); const all=Array.from({length:7},(_,i) => { const day=new Date(d); day.setDate(d.getDate()+i); return day; }); return visibleDays ? visibleDays.map(dayIndex=>({dayIndex,date:all[dayIndex]})) : all; }
export function dayDate(key, index) { return weekDates(key)[index]; }
export function monthKey(date) { const d = new Date(date); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
export function weekLabel(key, days=DEFAULT_VISIBLE_DAYS) { const all=weekDates(key), first=all[days[0]], last=all[days.at(-1)]; const o={day:'numeric',month:'short'}; return `${first.toLocaleDateString('en-AU',o)} – ${last.toLocaleDateString('en-AU',{...o,year:'numeric'})}`; }
export function fmt(value) { return Number(value||0).toFixed(2).replace(/\.00$/,'').replace(/(\.\d)0$/,'$1'); }
export function parseHours(value) {
  const s=String(value ?? '').trim(); if (!s) return {value:null};
  const colon=s.match(/^(\d{1,3}):(\d{2})$/); if (colon) { const h=Number(colon[1]), m=Number(colon[2]); if(m>=60)return {error:'Minutes must be between 00 and 59.'}; const total=h+m/60; return total<=24?{value:total}:{error:'A day cannot exceed 24 hours.'}; }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return {error:'Enter decimal hours or H:MM.'};
  const n=Number(s); return n<=24 ? {value:n} : {error:'A day cannot exceed 24 hours.'};
}
export function isVisible(project, key) { return !project.archived && !(project.hiddenWeeks||[]).includes(key) && !(project.hiddenOnwardsFrom && key>=project.hiddenOnwardsFrom) && !(project.visibleOnwardsFrom && key<project.visibleOnwardsFrom); }
export function weeklyPlan(project,key) { return project.weeklyOverrides && Object.hasOwn(project.weeklyOverrides,key) ? project.weeklyOverrides[key] : project.resourcedHours; }
export function monthlyPlan(project,key) { return project.monthlyOverrides && Object.hasOwn(project.monthlyOverrides,key) ? project.monthlyOverrides[key] : project.monthlyResourcedHours; }
export function frontloadAmount(project,key) { const amount=Number(project.frontloads?.[key]||0); return Number.isFinite(amount)&&amount>0 ? amount : 0; }
export function frontloadLimit(project,key) { const source=shiftWeek(key,1),plan=weeklyPlan(project,source); if(plan==null||!Number.isFinite(Number(plan))) return null; return Math.max(0,Number(plan)+frontloadAmount(project,source)); }
export function entryHours(project,key,day, includeLeave=true, leave=[]) { return includeLeave || !leave.includes(day) ? Number(project.entries?.[key]?.[day]||0) : 0; }
export function taskEntrySources(project) { const validIds=new Set((project.tasks||[]).filter(task=>task.id!=='general'&&String(task.name||'').toLowerCase()!=='general').map(task=>task.id));return Object.entries(project.taskEntries||{}).filter(([taskId])=>validIds.has(taskId)).map(([,entries])=>entries); }
export function weeklyLogged(project,key,leave=[]) { const general=Array.from({length:7},(_,d)=>entryHours(project,key,d,false,leave)).reduce((a,b)=>a+b,0);const tasks=taskEntrySources(project).reduce((total,entries)=>total+Array.from({length:7},(_,day)=>leave.includes(day)?0:Number(entries?.[key]?.[day]||0)).reduce((a,b)=>a+b,0),0);return general+tasks; }
export function adjustmentFor(project, month) { return Number(project.monthlyAdjustments?.[month] ?? (project.historicalMonthlyMonth===month ? project.historicalMonthlyHours : 0) ?? 0); }
export function monthlyLogged(project, month, leaveWeeks={}) { let n=adjustmentFor(project,month);const sources=[project.entries||{},...taskEntrySources(project)];for(const source of sources)for(const [wk,entries] of Object.entries(source)) for(const [d,h] of Object.entries(entries||{})) if(!leaveWeeks[wk]?.includes(Number(d)) && monthKey(dayDate(wk,Number(d)))===month) n+=Number(h)||0; return n; }
export function monthlyAllowance(project,key,leaveWeeks={}) { const allocation=monthlyPlan(project,key);if (allocation == null) return null; const month=monthKey(dayDate(key,3)); return Math.max(0, Number(allocation)-monthlyLogged(project,month,leaveWeeks)+weeklyLogged(project,key,leaveWeeks[key]||[])); }
export function projectMetrics(project,key,leaveWeeks={}) { const plan=weeklyPlan(project,key), logged=weeklyLogged(project,key,leaveWeeks[key]||[]), monthly=monthlyAllowance(project,key,leaveWeeks),frontloadedIn=frontloadAmount(project,key),frontloadedOut=frontloadAmount(project,shiftWeek(key,-1)),hasWeeklyPlan=plan!=null&&Number.isFinite(Number(plan)),weeklyAllowance=hasWeeklyPlan?Number(plan)+frontloadedIn-frontloadedOut:null,weeklyAvailable=weeklyAllowance==null?null:Math.max(0,weeklyAllowance),effective=weeklyAllowance==null ? monthly : monthly==null ? weeklyAllowance : Math.min(weeklyAllowance,monthly),remaining=effective==null ? null : effective-logged,status=effective==null?'unlimited':remaining < -EPSILON?'over':Math.abs(remaining)<=EPSILON?'at':'under',overDueToFrontloading=frontloadedOut>EPSILON&&weeklyAllowance!=null&&logged>weeklyAllowance+EPSILON; return {plan,logged,monthly,frontloadedIn,frontloadedOut,weeklyAllowance,weeklyAvailable,effective,remaining,status,overDueToFrontloading}; }
export function weeklyResourcedHours(projects,key,leaveWeeks={}) { return projects.reduce((total,project)=>{const allowance=projectMetrics(project,key,leaveWeeks).weeklyAllowance;return total+Math.max(0,Number(allowance)||0);},0); }
export function capacityFor(key, settings) { const leave=settings.leaveWeeks?.[key]||[], visible=settings.visibleDays||DEFAULT_VISIBLE_DAYS, caps=settings.capacityByDay||DEFAULT_CAPACITY; return visible.reduce((n,d)=>n+(leave.includes(d)?0:Number(caps[d]||0)),0); }
export function migrateBackup(raw) {
  if(!raw || typeof raw !== 'object' || !Array.isArray(raw.projects)) throw new Error('This backup does not contain a valid project list.');
  const settings={ visibleDays: raw.settings?.visibleDays?.length ? raw.settings.visibleDays : DEFAULT_VISIBLE_DAYS, leaveWeeks:raw.settings?.leaveWeeks||{}, capacityByDay:raw.settings?.capacityByDay||DEFAULT_CAPACITY, theme:raw.settings?.theme||'system' };
  const legacyEntries=Array.isArray(raw.entries)?raw.entries:[];
  const projects=raw.projects.map((p,i)=>{
    const tasks=Array.isArray(p.tasks)&&p.tasks.length?p.tasks.map(task=>({id:task.id||uuid(),name:String(task.name||'Untitled task').trim()})):[{id:'general',name:'General'}];
    const generalIds=new Set(tasks.filter(task=>task.name.toLowerCase()==='general').map(task=>task.id));
    const entries=p.entries&&typeof p.entries==='object'&&!Array.isArray(p.entries)?p.entries:{};
    const taskEntries=p.taskEntries&&typeof p.taskEntries==='object'&&!Array.isArray(p.taskEntries)?p.taskEntries:{};
    for(const entry of legacyEntries.filter(item=>item.projectId===p.id)){
      const date=new Date(`${entry.date}T12:00:00`),key=weekKeyFor(date),day=(date.getDay()+6)%7,hours=Number(entry.hours)||0;
      if(!hours)continue;
      if(generalIds.has(entry.taskId)) entries[key]={...(entries[key]||{}),[day]:hours};
      else taskEntries[entry.taskId]={...(taskEntries[entry.taskId]||{}),[key]:{...(taskEntries[entry.taskId]?.[key]||{}),[day]:hours}};
    }
    const taskRows=p.taskRows&&typeof p.taskRows==='object'&&!Array.isArray(p.taskRows)?p.taskRows:{};
    for(const [key,rows] of Object.entries(raw.weekRows||{})) taskRows[key]=(Array.isArray(rows)?rows:[]).filter(row=>row.startsWith(`${p.id}::`)).map(row=>row.slice(p.id.length+2));
    const frontloads=Object.fromEntries(Object.entries(p.frontloads&&typeof p.frontloads==='object'&&!Array.isArray(p.frontloads)?p.frontloads:{}).flatMap(([key,value])=>{const amount=Math.round(Number(value)*100)/100,valid=/^\d{4}-\d{2}-\d{2}$/.test(key)&&weekKeyFor(new Date(`${key}T12:00:00`))===key&&Number.isFinite(amount)&&amount>0;return valid?[[key,amount]]:[]}));
    return { ...p, id:p.id||uuid(), name:String(p.name||`Untitled project ${i+1}`).trim(), isBillable:p.isBillable !== false, resourcedHours:p.resourcedHours ?? (p.weeklyAllocation === '' || p.weeklyAllocation == null ? null : Number(p.weeklyAllocation)), monthlyResourcedHours:p.monthlyResourcedHours ?? null, monthlyAdjustments:p.monthlyAdjustments||{}, entries, tasks, taskEntries, taskRows, weeklyOverrides:p.weeklyOverrides&&typeof p.weeklyOverrides==='object'&&!Array.isArray(p.weeklyOverrides)?p.weeklyOverrides:{}, monthlyOverrides:p.monthlyOverrides&&typeof p.monthlyOverrides==='object'&&!Array.isArray(p.monthlyOverrides)?p.monthlyOverrides:{}, frontloads, hiddenWeeks:Array.isArray(p.hiddenWeeks)?p.hiddenWeeks:[], hiddenOnwardsFrom:p.hiddenOnwardsFrom||null, visibleOnwardsFrom:p.visibleOnwardsFrom||null, archived:!!p.archived, client:p.client||'', code:p.code||'', createdAt:p.createdAt||new Date().toISOString() };
  });
  return {schemaVersion:SCHEMA_VERSION, projects, settings};
}

// Compatibility helpers used by the original feature modules.
export const fmtHours = fmt;
export const parseTime = value => parseHours(value).value;
export const isUnlimited = project => project.resourcedHours == null;
export const usedHours = weeklyLogged;
export const getWeeklyResourced = (project,key,leaveWeeks={}) => projectMetrics(project,key,leaveWeeks).effective;
export const getMonthKeyForWeek = key => monthKey(dayDate(key,3));
export const monthlyUsedHours = monthlyLogged;
export function remainingStatus(remaining,resourced){ if(resourced==null)return'unlimited'; if(remaining < -EPSILON)return'danger'; if(Math.abs(remaining)<=EPSILON)return'at'; if(resourced>0 && remaining/resourced<=.2)return'warning'; return'healthy'; }
export function remainingLabel(remaining,resourced){ if(resourced==null)return'Unlimited'; if(remaining < -EPSILON)return`${fmt(-remaining)}h over`; if(Math.abs(remaining)<=EPSILON)return'At allocation'; return`${fmt(remaining)}h left`; }
export function dayLabel(date){ return date.toLocaleDateString('en-AU',{weekday:'short',day:'numeric'}); }
export function getCategorizedProjects(projects,visibleProjects){ const visible=new Set(visibleProjects.map(p=>p.id)); const available=projects.filter(p=>!visible.has(p.id)); return {active:available.filter(p=>!p.archived),inactive:available.filter(p=>p.archived)}; }

export const isPhaseTask = task => task.id !== 'general' && task.name.toLowerCase() !== 'general';
export const taskLinesFor = (project, week) => (project.tasks || []).filter(task => isPhaseTask(task) && ((project.taskRows?.[week] || []).includes(task.id) || Object.values(project.taskEntries?.[task.id]?.[week] || {}).some(value => Number(value) > 0))).sort((a, b) => a.name.localeCompare(b.name));
export const addablePhasesFor = (project, week) => { const onSheet = new Set(taskLinesFor(project, week).map(task => task.id)); return (project.tasks || []).filter(task => isPhaseTask(task) && !onSheet.has(task.id)).sort((a, b) => a.name.localeCompare(b.name)); };
export const projectHasPhases = project => (project.tasks || []).some(isPhaseTask);
