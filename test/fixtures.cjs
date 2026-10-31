'use strict';
const privateKey = Buffer.alloc(32, 1).toString('base64');
const publicKey = Buffer.alloc(32, 2).toString('base64');
const profile = `[Interface]
PrivateKey = ${privateKey}
Address = 10.10.0.2/32
DNS = 1.1.1.1
MTU = 1420

[Peer]
PublicKey = ${publicKey}
Endpoint = vpn.example.com:51820
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25
`;
module.exports = { profile, privateKey, publicKey };
