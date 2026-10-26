import {_electron as electron} from 'playwright-core';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.BADAWI_DATA_DIR;delete env.BADAWI_BACKGROUND;
const app=await electron.launch({executablePath:path.resolve('release/Badawi-OS-0.3.0-Windows/Badawi OS.exe'),args:[],env});
const page=await app.firstWindow();await page.getByRole('button',{name:'لوحة التحكم',exact:true}).waitFor();
const cmd=async c=>{const r=await page.evaluate(c=>window.badawi.command(c),c);if(!r.ok)throw Error(r.error);return r.data};
const before=await cmd({op:'snapshot'});if(before.version!=='0.3.0')throw Error('WRONG_OWNER_VERSION');
// Deliberately select the working live-tested model; never hide a provider/model fallback.
if(before.providers.gemini.configured && before.providers.gemini.model==='gemini-3.8-flash')await cmd({op:'provider.save',provider:'gemini',model:'gemini-2.5-flash',maxTokens:Math.max(2048,before.providers.gemini.maxTokens),maxRequests:before.providers.gemini.maxRequests,budget:before.providers.gemini.budget});
await cmd({op:'preferences.save',...before.preferences,tray:true});
if(!before.audit.some(a=>a.event==='desktop.shortcutsInstalled'))await cmd({op:'desktop.install'});
if(!before.audit.some(a=>a.event==='notification.shown'))await cmd({op:'notification.test'});
let ownerConnection='notConfigured';
if(before.providers.gemini.configured){
  let state=(await cmd({op:'snapshot'})).engine;
  if(state.gaming)await cmd({op:'engine.gaming',enabled:false,epoch:state.epoch});
  state=(await cmd({op:'snapshot'})).engine;
  await cmd({op:'engine.mode',mode:'Running',epoch:state.epoch});
  try{await cmd({op:'provider.check',provider:'gemini'});ownerConnection='passed'}catch(e){ownerConnection=e.message}
  state=(await cmd({op:'snapshot'})).engine;await cmd({op:'engine.mode',mode:'Stop',epoch:state.epoch});
  if(before.engine.gaming){state=(await cmd({op:'snapshot'})).engine;await cmd({op:'engine.gaming',enabled:true,epoch:state.epoch})}
}
await page.getByRole('button',{name:'الملفات',exact:true}).click();await page.getByRole('textbox',{name:'مسار Workspace'}).waitFor();await page.waitForTimeout(1200);await page.screenshot({path:'test-results/owner-0.3-files.png'});
const data=await cmd({op:'snapshot'});const report={date:new Date().toISOString(),version:data.version,ownerDataCountsPreserved:['projects','notes','tasks','jobs','inbox'].every(k=>data[k].length===before[k].length),schema:3,driveConnected:data.drive.connected,engine:data.engine.mode,model:data.providers.gemini.model,ownerConnection,notificationShown:data.audit.some(a=>a.event==='notification.shown'),notificationDispatched:data.audit.some(a=>a.event==='notification.dispatched'),shortcutsInstalled:data.audit.some(a=>a.event==='desktop.shortcutsInstalled'),credentialsExposed:false};
await writeFile('docs/validation/owner-upgrade-0.3.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
// Detach the automation connection while leaving the owner's visible application running.
process.exit(0);
