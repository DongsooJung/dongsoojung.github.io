"""Read only diagnosis of the portal's known Access application. No credentials are logged."""
import json, os, urllib.request, urllib.error, sys
AUD = 'a764c948d7613e64de7283e0cabaab7f0b11d1e2cb6d2a3a8803b8e1255d7f77'
def api(path):
    req = urllib.request.Request('https://api.cloudflare.com/client/v4/accounts/'+os.environ['CLOUDFLARE_ACCOUNT_ID']+path, headers={'Authorization':'Bearer '+os.environ['CLOUDFLARE_API_TOKEN'],'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            data = json.load(response)
    except urllib.error.HTTPError as error:
        print(json.dumps({'access_api_status':error.code,'path':path.split('?')[0]}))
        raise SystemExit(1)
    if not data.get('success'):
        print(json.dumps({'access_api_success':False,'codes':[e.get('code') for e in data.get('errors',[])]}))
        raise SystemExit(1)
    return data['result']
apps = api('/access/apps?per_page=100')
target = [app for app in apps if app.get('aud') == AUD or 'stargate.stargate8225.workers.dev' in json.dumps(app)]
print(json.dumps({'application_count':len(apps),'hostname_candidate_count':len(target),'candidate_types':[a.get('type') for a in target],'candidate_audience_matches':[a.get('aud')==AUD for a in target]}))
if len(target) != 1:
    print(json.dumps({'matched_application_count':len(target)}));sys.exit(1)
app = target[0]
providers = api('/access/identity_providers')
policies = api('/access/apps/'+app['id']+'/policies')
print(json.dumps({'matched_application':True,'application_type':app.get('type'),'application_domain':app.get('domain'),'application_fields':sorted(app.keys()),'auto_redirect_to_identity':app.get('auto_redirect_to_identity'),'allowed_idp_count':len(app.get('allowed_idps') or []),'identity_providers':[{'type':p.get('type'),'config_keys':sorted((p.get('config') or {}).keys()),'restrict_to_account_members':(p.get('config') or {}).get('restrict_to_account_members')} for p in providers],'policy_selectors':[{'decision':p.get('decision'),'include':[list(r.keys()) for r in p.get('include',[])],'require':[list(r.keys()) for r in p.get('require',[])],'exclude':[list(r.keys()) for r in p.get('exclude',[])]} for p in policies]}))
