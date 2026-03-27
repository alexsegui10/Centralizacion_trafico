const fs = require('fs');
const path = require('path');

const workflows = [
  'detector_leads.json',
  'detector_mgo.json',
  'reactivacion_winback.json'
];

for (const file of workflows) {
  const src = path.join(__dirname, '..', 'n8n', 'workflows', file);
  const data = JSON.parse(fs.readFileSync(src, 'utf8'));

  const triggerNode = data.nodes.find((n) => n.type === 'n8n-nodes-base.scheduleTrigger');
  if (!triggerNode) {
    throw new Error(`No schedule trigger found in ${file}`);
  }

  const oldTriggerName = triggerNode.name;

  triggerNode.type = 'n8n-nodes-base.executeWorkflowTrigger';
  triggerNode.typeVersion = 1;
  triggerNode.parameters = {};
  triggerNode.name = 'Manual Trigger';

  if (data.connections && data.connections[oldTriggerName]) {
    data.connections['Manual Trigger'] = data.connections[oldTriggerName];
    delete data.connections[oldTriggerName];
  }

  data.name = `${data.name}_manual_test`;
  data.active = false;

  const out = path.join(__dirname, '..', 'n8n', 'workflows', file.replace('.json', '_manual_test.json'));
  fs.writeFileSync(out, JSON.stringify(data, null, 2));
  console.log('WROTE', out);
}
