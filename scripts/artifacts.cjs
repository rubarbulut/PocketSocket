'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
async function normalizeArtifacts(directory){
  // electron-builder names AppImage x64 as x86_64. The public updater contract
  // consistently uses Node/Electron's x64 across platforms. Rename bytes unchanged.
  for(const name of await fs.readdir(directory)){
    if(!name.endsWith('-linux-x86_64.AppImage'))continue;
    const normalized=name.replace(/-linux-x86_64\.AppImage$/,'-linux-x64.AppImage');
    try{await fs.access(path.join(directory,normalized));throw new Error('Normalized artifact already exists.')}catch(e){if(e.code!=='ENOENT')throw e;}
    await fs.rename(path.join(directory,name),path.join(directory,normalized));
  }
}
module.exports={normalizeArtifacts};
