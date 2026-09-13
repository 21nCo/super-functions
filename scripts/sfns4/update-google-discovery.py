"""Refresh only selected Google Discovery schemas. Review resulting changes before release."""
import hashlib, json, pathlib, sys, urllib.request
root = pathlib.Path('plugfn/providers/src/google/discovery')
urls = {
 'drive': 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest',
 'docs': 'https://docs.googleapis.com/$discovery/rest?version=v1',
 'sheets': 'https://sheets.googleapis.com/$discovery/rest?version=v4',
 'calendar': 'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest',
 'gmail': 'https://gmail.googleapis.com/$discovery/rest?version=v1',
}
gmail = ['users.messages.list','users.messages.get','users.threads.get','users.messages.attachments.get','users.labels.list','users.messages.modify','users.drafts.create','users.drafts.update','users.drafts.send','users.messages.send']
for name in sys.argv[1:] or urls:
 path = root / (name + '.json')
 selected = gmail if name == 'gmail' else list(json.loads(path.read_text())['methods'])
 raw = urllib.request.urlopen(urls[name], timeout=60).read()
 doc = json.loads(raw)
 methods = {}
 def collect(node, prefix=''):
  for key, value in node.get('methods', {}).items(): methods[prefix + key] = value
  for key, value in node.get('resources', {}).items(): collect(value, prefix + key + '.')
 collect(doc)
 chosen = {key: methods[key] for key in selected}
 schemas = {}
 def refs(value):
  if isinstance(value, dict):
   if '$ref' in value and value['$ref'] not in schemas:
    key = value['$ref']; schemas[key] = doc['schemas'][key]; refs(schemas[key])
   for child in value.values(): refs(child)
  elif isinstance(value, list):
   for child in value: refs(child)
 refs(chosen)
 result = dict(source=urls[name], sourceSha256=hashlib.sha256(raw).hexdigest(), revision=doc['revision'], rootUrl=doc['rootUrl'], servicePath=doc['servicePath'], methods=chosen, schemas=schemas)
 path.write_text(json.dumps(result, indent=2) + '\n')
 print(name, len(chosen), 'methods', len(schemas), 'schemas')
