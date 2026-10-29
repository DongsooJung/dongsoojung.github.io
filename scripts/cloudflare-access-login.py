"""Provision only the portal visitor dashboard's exact-email Access configuration.
No bearer tokens, identity-provider secrets or private identity data are logged.
"""
import json, os, re, urllib.request, urllib.error
HOST = 'stargate.stargate8225.workers.dev'
OWNER = 'ceo@stargateedu.co.kr'
NAME = 'STARGATE private visitor analytics'
DESTINATIONS = [HOST+'/admin/visitors', HOST+'/api/admin/analytics']

def api(path, method='GET', payload=None):
    req = urllib.request.Request('https://api.cloudflare.com/client/v4/accounts/'+os.environ['CLOUDFLARE_ACCOUNT_ID']+path, data=None if payload is None else json.dumps(payload).encode(), method=method, headers={'Authorization':'Bearer '+os.environ['CLOUDFLARE_API_TOKEN'],'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            data = json.load(response)
    except urllib.error.HTTPError as error:
        try: codes=[item.get('code') for item in json.load(error).get('errors',[])]
        except Exception: codes=[]
        print(json.dumps({'access_api_status':error.code,'path':path.split('?')[0],'error_codes':codes}))
        raise SystemExit(1)
    if not data.get('success'):
        print(json.dumps({'access_api_success':False,'codes':[e.get('code') for e in data.get('errors',[])]}))
        raise SystemExit(1)
    return data['result']

def allowed_policy(policy):
    return policy.get('decision')=='allow' and policy.get('include')==[{'email':{'email':OWNER}}] and not policy.get('require') and not policy.get('exclude')

org=api('/access/organizations')
domain=org.get('auth_domain','')
if not re.fullmatch(r'[a-z0-9-]+\.cloudflareaccess\.com',domain):
    raise SystemExit('Existing Cloudflare Zero Trust organization is required; no account-wide setting was changed.')
providers=api('/access/identity_providers')
providers=[p for p in providers if p.get('type')=='onetimepin']
if len(providers)>1:
    raise SystemExit('Ambiguous existing email login providers; no change made.')
otp=providers[0] if providers else api('/access/identity_providers','POST',{'name':'STARGATE email one-time PIN','type':'onetimepin','config':{}})
apps=api('/access/apps?per_page=100')
owned=[a for a in apps if a.get('name')==NAME]
if len(owned)>1:
    raise SystemExit('Duplicate visitor applications require review; no application changed.')
if owned:
    app=api('/access/apps/'+owned[0]['id'])
    actual=sorted(d.get('uri','') for d in app.get('destinations',[]) if d.get('type')=='public')
    if actual!=sorted(DESTINATIONS) or app.get('allowed_idps')!=[otp['id']]:
        raise SystemExit('Existing application differs from the expected narrow scope; refusing to overwrite it.')
else:
    if any(any(uri in json.dumps(a) for uri in DESTINATIONS) for a in apps):
        raise SystemExit('A different application owns a requested private path; refusing to replace it.')
    app=api('/access/apps','POST',{'type':'self_hosted','name':NAME,'domain':DESTINATIONS[0],'destinations':[{'type':'public','uri':uri} for uri in DESTINATIONS],'session_duration':'8h','allowed_idps':[otp['id']],'auto_redirect_to_identity':False,'policies':[{'name':'Visitor analytics owner only','decision':'allow','include':[{'email':{'email':OWNER}}]}]})
policies=api('/access/apps/'+app['id']+'/policies')
if len(policies)!=1 or not allowed_policy(policies[0]):
    raise SystemExit('Owner-only policy verification failed; Worker configuration was not changed.')
if not re.fullmatch(r'[a-f0-9]{64}',app.get('aud','')):
    raise SystemExit('Access audience verification failed.')
for name,value in {'ANALYTICS_ACCESS_AUD':app['aud'],'ANALYTICS_ACCESS_ISSUER':'https://'+domain,'ANALYTICS_OWNER_EMAIL':OWNER}.items():
    api('/workers/scripts/stargate/secrets','PUT',{'name':name,'text':value,'type':'secret_text'})
print(json.dumps({'owner_email_login_configured':True,'hostname':HOST,'protected_paths':['/admin/visitors','/api/admin/analytics'],'issuer':'https://'+domain,'audience':app['aud'],'email_provider':'onetimepin','owner_policy_count':1,'account_membership_restriction_unchanged':True}))
