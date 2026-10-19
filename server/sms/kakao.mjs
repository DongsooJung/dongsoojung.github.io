import {solapi} from './service.mjs';
export async function catalog(env,fetcher) {
  const result=await solapi(env,'/kakao/v2/channels?limit=100',null,fetcher);
  const channels=(result.channelList||[]).map(v=>({id:v.channelId,name:v.channelName||v.searchId,searchId:v.searchId}));
  return {channels,nextKey:result.nextKey||null};
}
export async function templates(env,channelId,fetcher) {
  if(typeof channelId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(channelId))throw new Error('카카오 채널을 선택해 주세요.');
  const {channels}=await catalog(env,fetcher);
  if(!channels.some(v=>v.id===channelId))throw new Error('이 솔라피 계정에 연결되지 않은 채널입니다.');
  const data=await solapi(env,'/kakao/v2/templates/?channelId='+encodeURIComponent(channelId)+'&status=APPROVED&limit=100',null,fetcher);
  return {templates:(data.templateList||[]).filter(v=>v.channelId===channelId&&v.status==='APPROVED'&&!v.isHidden&&!v.isDeleted),nextKey:data.nextKey||null};
}
export function variablesFor(template) {
  return [...new Set([...JSON.stringify(template).matchAll(/#\{([^{}]+)\}/g)].map(v=>v[1]))];
}
export async function kakaoMessages(env,body,messages,fetcher) {
  const {templates:list}=await templates(env,body.channelId,fetcher);
  const template=list.find(v=>v.templateId===body.templateId);
  if(!template)throw new Error('선택한 채널의 승인된 알림톡 템플릿이 아닙니다.');
  return messages.map((message,i)=>{
    const variables={};
    for(const name of variablesFor(template)){
      const value=name==='이름'?body.recipients[i].name.trim():body.kakaoVariables?.[name];
      if(typeof value!=='string'||!value.trim()||value.length>1000)throw new Error('템플릿 변수 '+name+'을 입력해 주세요.');
      variables['#{'+name+'}']=value;
    }
    const fill=value=>typeof value==='string'?value.replace(/#\{([^{}]+)\}/g,(match)=>variables[match]??match):Array.isArray(value)?value.map(fill):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,fill(v)])):value;
    const content=fill(template.content);
    if(content!==message.text||content.length>1000)throw new Error('미리보기 내용과 승인 템플릿이 다릅니다. 템플릿을 다시 선택해 주세요.');
    const kakaoOptions={pfId:body.channelId,templateId:body.templateId,variables,disableSms:true};
    for(const key of ['buttons','quickReplies','header','highlight','item','imageId'])if(template[key])kakaoOptions[key]=fill(template[key]);
    return {to:message.to,country:'82',type:'ATA',text:content,kakaoOptions};
  });
}
