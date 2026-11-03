'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {sign,createHash,createPrivateKey,createPublicKey}=require('node:crypto');
const {version}=require('../package.json');
(async()=>{
  const directory=process.argv[2]||'release';
  const privateKey=createPrivateKey(process.env.POCKET_RELEASE_SIGNING_KEY||'');
  const expected=await fs.readFile('app/update-key.pem','utf8');
  if(createPublicKey(privateKey).export({type:'spki',format:'pem'})!==expected)throw new Error('Release key does not match pinned verification key.');
  const names=(await fs.readdir(directory)).filter(n=>/\.(dmg|zip|exe|AppImage|tar\.gz)$/.test(n)).sort();
  const files=[];
  for(const name of names){const data=await fs.readFile(path.join(directory,name));files.push({name,size:data.length,sha256:createHash('sha256').update(data).digest('hex'),url:`https://github.com/rubarbulut/PocketSocket/releases/download/v${version}/${encodeURIComponent(name)}`})}
  if(!files.length)throw new Error('No release files.');
  const payload=Buffer.from(JSON.stringify({version,channel:'beta',files}));
  await fs.writeFile(path.join(directory,'pocketsocket-update.json'),JSON.stringify({payload:payload.toString('base64'),signature:sign(null,payload,privateKey).toString('base64')},null,2));
  await fs.writeFile(path.join(directory,'SHA256SUMS.txt'),files.map(f=>`${f.sha256}  ${f.name}`).join('\n')+'\n');
  console.log(`Release manifest signed: ${files.length} files.`);
})().catch(e=>{console.error(e.message);process.exitCode=1});
