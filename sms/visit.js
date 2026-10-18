// Only a page view is collected here; customer fields and button labels are never read.
(() => {
  if(location.hostname!=='stargate.stargate8225.workers.dev')return;
  const id=(storage,key)=>{try{let value=storage.getItem(key);if(!value){value=crypto.randomUUID();storage.setItem(key,value);}return value;}catch{return crypto.randomUUID();}};
  const payload={p_event_id:crypto.randomUUID(),p_visitor_id:id(localStorage,'stargateCloudflareVisitorV1:visitorId'),p_session_id:id(sessionStorage,'stargateCloudflareUsageV1:sessionId'),p_event_type:'page_view',p_page_path:location.pathname,p_page_title:document.title,p_device_type:matchMedia('(max-width: 720px)').matches?'mobile':'desktop'};
  fetch('/api/analytics/record_site_usage_event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),keepalive:true}).catch(()=>{});
})();
