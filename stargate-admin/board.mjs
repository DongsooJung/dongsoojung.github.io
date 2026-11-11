import {deadlineInfo} from './data.mjs?v=1.2';

export function selectBoardTasks(tasks, filters, today) {
  const query=(filters.search||'').trim().toLocaleLowerCase('ko-KR');
  const result=tasks.filter(t=>Boolean(t.archived)===(filters.mode==='archived'))
    .filter(t=>filters.axis==='all'||t.axis===filters.axis)
    .filter(t=>filters.deadline==='all'||deadlineInfo(t,today).kind===filters.deadline)
    .filter(t=>!query||(t.title+' '+(t.note||'')).toLocaleLowerCase('ko-KR').includes(query));
  const byDue=(a,b)=>(a.due||'9999').localeCompare(b.due||'9999');
  const compare=filters.sort==='recent'?(a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''):
    filters.sort==='title'?(a,b)=>a.title.localeCompare(b.title,'ko-KR'):byDue;
  return result.sort((a,b)=>compare(a,b)||a.id.localeCompare(b.id));
}
