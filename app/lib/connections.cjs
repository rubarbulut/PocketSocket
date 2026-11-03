'use strict';
const {AppError}=require('./errors.cjs');
function localProxy(input) {
  if(!input || !['127.0.0.1','::1','localhost'].includes(input.host)||!Number.isInteger(Number(input.port))||Number(input.port)<1||Number(input.port)>65535) throw new AppError('PROXY_INVALID');
  for(const key of ['username','password']) if(input[key]!==undefined&&(typeof input[key]!=='string'||input[key].length>256)) throw new AppError('PROXY_INVALID');
  return {name:'PocketTunnel',type:'socks5',server:input.host,port:Number(input.port),udp:input.udp===true,...(input.username?{username:input.username}:{}),...(input.password?{password:input.password}:{})};
}
// These are links/instructions, not integrations or claims about free-plan availability.
const PROVIDERS=[
  {id:'proton',name:'Proton VPN',url:'https://protonvpn.com/support/wireguard-configurations'},
  {id:'mullvad',name:'Mullvad',url:'https://mullvad.net/en/account/wireguard-config'},
  {id:'ivpn',name:'IVPN',url:'https://www.ivpn.net/setup/router/'},
  {id:'custom',name:'WireGuard',url:'https://www.wireguard.com/quickstart/'}
];
module.exports={localProxy,PROVIDERS};
