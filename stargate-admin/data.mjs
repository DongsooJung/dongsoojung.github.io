export const STORAGE_KEY = 'stargate-admin-v1';
export const RESTORE_KEY = 'stargate-admin-before-restore-v1';
const projectStatuses = new Set(['unreviewed', 'doing', 'hold', 'done']);
const taskStatuses = new Set(['todo', 'doing', 'done']);
const taskAxes = new Set(['research', 'strategy', 'operations']);
export class StorageConflictError extends Error {
  constructor(){super('다른 탭에서 기록이 변경됐습니다. 작성 내용은 임시 보관했습니다. 화면을 다시 열어 최신 기록을 확인해 주세요.');this.name='StorageConflictError';}
}
export const PROJECT_GROUPS={research:['실시간 도시','행정경계','접근·부동산','거시·산업','커뮤니티 신호','연구 방법·AI','난제·에세이','교육·수학','운영·제품'],strategy:['기업 재무','산업 신호','실행·사업개발','관측 트래커']};
export function validateCustomProject(item){
  if(!item||typeof item.id!=='string'||!/^custom-[a-zA-Z0-9-]{1,80}$/.test(item.id)||typeof item.title!=='string'||!item.title.trim()||item.title.length>140||typeof item.description!=='string'||item.description.length>1500||!Array.isArray(item.axes)||item.axes.length!==1||!Object.hasOwn(PROJECT_GROUPS,item.axes[0])||!PROJECT_GROUPS[item.axes[0]].includes(item.groups?.[item.axes[0]]))throw Error('내 프로젝트의 제목과 분류를 확인해 주세요.');
  let url;try{url=new URL(item.url);}catch{throw Error('올바른 프로젝트 주소를 입력해 주세요.');}
  if(url.protocol!=='https:'||url.username||url.password||url.href.length>2000)throw Error('인증정보가 없는 HTTPS 주소를 입력해 주세요.');
  return {id:item.id,title:item.title.trim(),description:item.description.trim(),url:url.href,axes:[item.axes[0]],groups:{[item.axes[0]]:item.groups[item.axes[0]]},source:'직접 등록한 프로젝트',tags:['내 프로젝트']};
}

export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateBackupState(value, projectIds) {
  if (!value || value.schemaVersion !== 1 || !Array.isArray(value.favorites) ||
      !value.projects || typeof value.projects !== 'object' || Array.isArray(value.projects) ||
      !Array.isArray(value.tasks)) throw Error('지원하지 않는 백업 형식입니다.');
  if (value.favorites.length > 10000 || value.tasks.length > 3000 ||
      Object.keys(value.projects).length > 10000) throw Error('백업 크기가 지원 범위를 넘었습니다.');
  if(value.customProjects!==undefined&&!Array.isArray(value.customProjects))throw Error('내 프로젝트 목록 형식이 올바르지 않습니다.');
  if((value.customProjects?.length||0)>500)throw Error('내 프로젝트는 500개까지 보관할 수 있습니다.');
  const customProjects=(value.customProjects||[]).map(validateCustomProject);
  const known = new Set(projectIds),customUrls=new Set();
  for(const item of customProjects){if(known.has(item.id)||customUrls.has(item.url))throw Error('중복된 내 프로젝트가 있습니다.');known.add(item.id);customUrls.add(item.url);}
  const projects = {};
  for (const [id, item] of Object.entries(value.projects)) {
    if (!known.has(id)) continue;
    if (!item || !projectStatuses.has(item.status) || typeof item.note !== 'string' ||
        item.note.length > 12000 || !['normal', 'high'].includes(item.priority)) {
      throw Error('프로젝트 기록 형식이 올바르지 않습니다.');
    }
    projects[id] = {status: item.status, note: item.note, priority: item.priority,
      reviewedAt: typeof item.reviewedAt === 'string' ? item.reviewedAt : ''};
  }
  const ids = new Set();
  const tasks = value.tasks.map(task => {
    if (!task || typeof task.id !== 'string' || !task.id || task.id.length > 100 || ids.has(task.id) ||
        typeof task.title !== 'string' || !task.title.trim() || task.title.length > 160 ||
        typeof task.note !== 'string' || task.note.length > 4000 || !taskStatuses.has(task.status) ||
        !taskAxes.has(task.axis) || typeof task.due !== 'string' || (task.due && !validDate(task.due)) ||
        (task.archived !== undefined && typeof task.archived !== 'boolean')) {
      throw Error('실행 과제 형식이나 목표일이 올바르지 않습니다.');
    }
    ids.add(task.id);
    return {id: task.id, title: task.title, note: task.note, status: task.status, axis: task.axis,
      due: task.due, archived: task.archived === true,
      createdAt: typeof task.createdAt === 'string' ? task.createdAt : ''};
  });
  if(value.revision!==undefined&&(!Number.isSafeInteger(value.revision)||value.revision<0))throw Error('저장 기록 버전이 올바르지 않습니다.');
  return {schemaVersion: 1, favorites: [...new Set(value.favorites.filter(id => typeof id === 'string' && known.has(id)))],
    projects, tasks, customProjects, preferences:{textSize:value.preferences?.textSize==='large'?'large':'normal'}, revision:value.revision||0, theme: value.theme === 'dark' ? 'dark' : 'light',
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : ''};
}

export function parseBackup(text, projectIds) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > 5 * 1024 * 1024) {
    throw Error('5MB 이하의 JSON 백업을 사용해 주세요.');
  }
  let backup;
  try { backup = JSON.parse(text); } catch { throw Error('JSON 형식이 올바르지 않습니다. 파일 내용을 확인해 주세요.'); }
  if (backup?.app !== 'STARGATE Admin') throw Error('STARGATE 관리자 백업 파일이 아닙니다.');
  return validateBackupState(backup.state, projectIds);
}

export function createDataStore(storage, projectIds) {
  const validate = value => validateBackupState(value, projectIds);
  const save = (next, expectedRevision=next.revision||0) => {
    const candidate = validate(next);
    const raw=storage.getItem(STORAGE_KEY);
    const stored=raw===null?null:validate(JSON.parse(raw));
    if((stored?.revision||0)!==expectedRevision)throw new StorageConflictError();
    candidate.revision=(stored?.revision||0)+1;
    candidate.updatedAt = new Date().toISOString();
    storage.setItem(STORAGE_KEY, JSON.stringify(candidate));
    return candidate;
  };
  return {
    load() { const raw = storage.getItem(STORAGE_KEY); return raw === null ? null : validate(JSON.parse(raw)); },
    save,
    restore(next, current) {
      const candidate = validate(next);
      const before = validate(current);
      const oldPoint = storage.getItem(RESTORE_KEY);
      storage.setItem(RESTORE_KEY, JSON.stringify({app:'STARGATE Admin', state:before}));
      try { return save(candidate,before.revision); }
      catch (error) {
        try { oldPoint === null ? storage.removeItem(RESTORE_KEY) : storage.setItem(RESTORE_KEY, oldPoint); } catch {}
        throw error;
      }
    },
    restorePoint() {
      const raw = storage.getItem(RESTORE_KEY);
      return raw === null ? null : parseBackup(raw, projectIds);
    },
    undoRestore(expectedRevision) {
      const raw = storage.getItem(RESTORE_KEY);
      if (raw === null) throw Error('되돌릴 복원 기록이 없습니다.');
      const current=storage.getItem(STORAGE_KEY);
      const revision=expectedRevision??(current===null?0:validate(JSON.parse(current)).revision);
      const result = save(parseBackup(raw, projectIds),revision);
      try { storage.removeItem(RESTORE_KEY); } catch {}
      return result;
    }
  };
}

export function createDraftStore(storage){
  const prefix='stargate-admin-draft:',fallback=new Map();
  return {
    read(key){if(fallback.has(key))return fallback.get(key);try{const raw=storage.getItem(prefix+key);return raw?JSON.parse(raw):null;}catch{return null;}},
    save(key,fields){const draft={fields:{...fields},savedAt:new Date().toISOString()};fallback.set(key,draft);try{storage.setItem(prefix+key,JSON.stringify(draft));}catch{}return draft;},
    clear(key){fallback.delete(key);try{storage.removeItem(prefix+key);}catch{}}
  };
}

export function deadlineInfo(task, today) {
  if (!task.due || !validDate(task.due) || !validDate(today)) return {label:'기한 없음', kind:'none'};
  if (task.status === 'done') return {label:task.due.replaceAll('-', '.'), kind:'done'};
  const days = Math.round((Date.parse(task.due+'T00:00:00Z') - Date.parse(today+'T00:00:00Z')) / 86400000);
  return days < 0 ? {label:`${-days}일 경과`, kind:'overdue'} : days === 0 ? {label:'오늘까지', kind:'today'} :
    {label:`D-${days}`, kind:'upcoming'};
}
