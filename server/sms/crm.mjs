export class InputError extends Error {}
const clean=(value,max)=>String(value??'').trim().slice(0,max);
const idPattern=/^[a-zA-Z0-9-]{1,64}$/;
const phonePattern=/^01(?:0\d{8}|[16789]\d{7,8})$/;
export const defaultTemplates=[
  {id:'appointment',title:'상담 일정 안내',text:'{이름}님, 안녕하세요. 스타게이트입니다. 상담 일정은 [날짜] [시간]입니다. 변경이 필요하시면 연락해 주세요.'},
  {id:'class',title:'수업 안내',text:'{이름}님, 스타게이트 수업 안내드립니다. [날짜] [시간], [장소]에서 뵙겠습니다. 준비물: [준비물]'},
  {id:'materials',title:'자료 전달',text:'{이름}님, 요청하신 자료를 보내드립니다. [자료 링크] 확인 후 문의사항이 있으면 연락해 주세요. 감사합니다.'},
];
export function validateContact(body) {
  const name=clean(body.name,40),phone=String(body.phone??'').replace(/\D/g,'');
  if(!name||!phonePattern.test(phone)) throw new InputError('고객명과 올바른 휴대폰 번호를 입력해 주세요.');
  return {name,phone,category:clean(body.category,40),notes:clean(body.notes,1500),consent:body.consent===true};
}
export function validateTemplate(body) {
  const title=clean(body.title,60),text=String(body.text??'').trim();
  if(!title||!text||text.length>1000) throw new InputError('문구 제목과 1~1000자의 내용을 입력해 주세요.');
  return {title,text};
}
export class CRMStore {
  constructor(storage) {this.storage=storage;}
  async list(kind) {
    const values=[...(await this.storage.list({prefix:kind+':'})).values()];
    return values.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }
  async templates() {
    if(!await this.storage.get('templates-seeded')) await this.storage.transaction(async tx=>{
      if(await tx.get('templates-seeded')) return;
      for(const value of defaultTemplates) await tx.put('templates:'+value.id,{...value,version:1,updatedAt:new Date().toISOString()});
      await tx.put('templates-seeded',true);
    });
    return this.list('templates');
  }
  async save(kind,body) {
    if(!['contacts','templates'].includes(kind)) throw new InputError('지원하지 않는 항목입니다.');
    const value=kind==='contacts'?validateContact(body):validateTemplate(body);
    const id=body.id||crypto.randomUUID();
    if(!idPattern.test(id)) throw new InputError('항목 번호를 확인해 주세요.');
    return this.storage.transaction(async tx=>{
      const key=kind+':'+id,prior=await tx.get(key);
      if(prior&&body.version!==prior.version) throw new InputError('다른 화면에서 수정됐습니다. 새로고침한 뒤 다시 저장해 주세요.');
      const all=await tx.list({prefix:kind+':'});
      if(!prior&&all.size>=(kind==='contacts'?500:50)) throw new InputError('저장 가능한 항목 수를 초과했습니다.');
      if(kind==='contacts'&&[...all.values()].some(v=>v.id!==id&&v.phone===value.phone)) throw new InputError('이미 저장된 휴대폰 번호입니다. 기존 고객을 수정해 주세요.');
      const now=new Date().toISOString();
      const entry={...value,id,version:(prior?.version||0)+1,createdAt:prior?.createdAt||now,updatedAt:now};
      if(kind==='contacts') entry.consentAt=value.consent?(prior?.consentAt||now):null;
      await tx.put(key,entry);return entry;
    });
  }
  async remove(kind,body) {
    if(!['contacts','templates'].includes(kind)||!idPattern.test(body.id||'')) throw new InputError('항목 번호를 확인해 주세요.');
    return this.storage.transaction(async tx=>{
      const key=kind+':'+body.id,prior=await tx.get(key);
      if(prior&&prior.version!==body.version) throw new InputError('항목이 변경됐습니다. 새로고침 후 다시 시도해 주세요.');
      await tx.delete(key);return {removed:true};
    });
  }
  async record(body,result) {
    const now=new Date().toISOString(), key='history:'+body.requestId;
    await this.storage.transaction(async tx=>{
      const prior=await tx.get(key);
      await tx.put(key,{id:body.requestId,createdAt:prior?.createdAt||now,updatedAt:now,delivery:body.delivery||'sms',channelId:body.channelId||null,templateId:body.templateId||null,recipients:body.recipients.map(v=>({name:v.name,phone:String(v.phone).replace(/\D/g,'')})),message:body.message,sender:body.sender,result});
      const all=[...(await tx.list({prefix:'history:'})).entries()].sort((a,b)=>a[1].createdAt.localeCompare(b[1].createdAt));
      for(const [oldKey] of all.slice(0,Math.max(0,all.length-200))) await tx.delete(oldKey);
    });
  }
}
