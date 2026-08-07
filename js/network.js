// 网络层 - 基于 PeerJS 的 WebRTC P2P 联机
//
// 房间号机制：
// - 房主：使用房间号作为 Peer ID（例：jtyj-ABC123）
// - 朋友：使用相同 Peer ID 连接
// - PeerJS 免费公共 broker 处理信令
//
// ⚠️ 已知问题：中国大陆访问 peerjs.com 公共 broker 可能不稳定
// 如果一直报 'network' 或 'server-error'，可以尝试切换 BROKER 配置

const PREFIX = 'jtyj-';  // 鸡同鸭讲 prefix，避免和其他人冲突

// PeerJS 公共 broker 配置
// 备选：'broker.peerjs.com' (官方), 'peerjs.meteor.com' (镜像)
const BROKER_HOST = '0.peerjs.com';
const BROKER_PORT = 443;
const BROKER_PATH = '/';
const BROKER_KEY = 'peerjs';

// ICE 服务器配置（STUN）
// 默认 Google 的 STUN 在国内可能不通，换成一些备选
const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun.miwifi.com:3478' },      // 小米路由器 STUN，国内可访问
    { urls: 'stun:stun.chat.bilibili.com:3478' }, // B 站 STUN
];

export class Network {
    constructor() {
        this.peer = null;
        this.connections = new Map();
        this.myId = null;
        this.isHost = false;
        this.roomCode = null;
        this.connectTimeout = null;

        // 消息回调
        this.onPlayerJoined = null;
        this.onPlayerLeft = null;
        this.onMessage = null;
        this.onConnected = null;
        this.onError = null;
        this.onStatus = null;  // (status) => void - 'connecting' | 'connected' | 'error'
    }

    static generateRoomCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars[Math.floor(Math.random() * chars.length)];
        }
        return code;
    }

    // 创建房间（成为房主）
    async createRoom() {
        const code = Network.generateRoomCode();
        return this._createWithCode(code);
    }

    // 用指定 code 创建（重试用）
    async _createWithCode(code) {
        this.roomCode = code;
        const peerId = PREFIX + code;
        this._safeDestroyPeer();  // 清理可能存在的旧 peer

        return new Promise((resolve, reject) => {
            console.log('[Network] 正在创建房间:', code, 'peerId:', peerId);

            if (this.onStatus) this.onStatus('connecting');

            // 15 秒超时
            this.connectTimeout = setTimeout(() => {
                if (this.peer && !this.peer.open) {
                    console.error('[Network] 连接超时');
                    const err = new Error('连接超时（15秒）- PeerJS broker 不可达，请检查网络或翻墙');
                    err.type = 'timeout';
                    this._safeDestroyPeer();
                    if (this.onError) this.onError(err);
                    if (this.onStatus) this.onStatus('error');
                    reject(err);
                }
            }, 15000);

            this.peer = new Peer(peerId, {
                host: BROKER_HOST,
                port: BROKER_PORT,
                path: BROKER_PATH,
                key: BROKER_KEY,
                config: {
                    iceServers: ICE_SERVERS,
                    iceTransportPolicy: 'all',
                },
                debug: 2,  // 0=无, 1=错, 2=警告, 3=全部
                secure: true,
            });

            this.peer.on('open', (id) => {
                clearTimeout(this.connectTimeout);
                this.myId = id;
                this.isHost = true;
                console.log('[Network] ✅ 房间创建成功:', id);
                if (this.onStatus) this.onStatus('connected');
                if (this.onConnected) this.onConnected();
                resolve(code);
            });

            this.peer.on('connection', (conn) => {
                console.log('[Network] 收到新连接:', conn.peer);
                this.handleIncomingConnection(conn);
            });

            this.peer.on('error', (err) => {
                clearTimeout(this.connectTimeout);
                console.error('[Network] Peer 错误:', err.type, err.message);

                // 特定错误处理
                if (err.type === 'unavailable-id') {
                    // ID 被占用，说明可能之前的 session 还没释放
                    // 或者随机生成的 code 撞了
                    console.warn('[Network] 房间号被占用，重试中...');
                    this._safeDestroyPeer();
                    // 重试一次
                    setTimeout(() => {
                        this._createWithCode(Network.generateRoomCode())
                            .then(resolve)
                            .catch(reject);
                    }, 500);
                    return;
                }

                if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error') {
                    err.friendlyMessage = '无法连接到游戏服务器。可能是：\n1. 网络问题（国内访问 PeerJS broker 可能不稳定）\n2. 需要翻墙\n3. 防火墙拦截';
                } else if (err.type === 'peer-unavailable') {
                    err.friendlyMessage = '找不到该房间，请检查房间号是否正确';
                } else if (err.type === 'browser-incompatible') {
                    err.friendlyMessage = '浏览器不支持 WebRTC，请使用 Chrome / Edge / Safari 最新版';
                }

                this._safeDestroyPeer();
                if (this.onError) this.onError(err);
                if (this.onStatus) this.onStatus('error');
                reject(err);
            });
        });
    }

    // 加入房间
    async joinRoom(code) {
        this.roomCode = code.toUpperCase();
        const hostPeerId = PREFIX + this.roomCode;
        this._safeDestroyPeer();

        return new Promise((resolve, reject) => {
            console.log('[Network] 正在加入房间:', this.roomCode);

            if (this.onStatus) this.onStatus('connecting');

            this.connectTimeout = setTimeout(() => {
                const err = new Error('连接超时（15秒）');
                err.type = 'timeout';
                this._safeDestroyPeer();
                if (this.onError) this.onError(err);
                if (this.onStatus) this.onStatus('error');
                reject(err);
            }, 15000);

            this.peer = new Peer(undefined, {
                host: BROKER_HOST,
                port: BROKER_PORT,
                path: BROKER_PATH,
                key: BROKER_KEY,
                config: {
                    iceServers: ICE_SERVERS,
                    iceTransportPolicy: 'all',
                },
                debug: 2,
                secure: true,
            });

            this.peer.on('open', (myId) => {
                console.log('[Network] 我的 Peer ID:', myId);
                this.myId = myId;
                this.isHost = false;

                // 连接到房主
                console.log('[Network] 正在连接房主:', hostPeerId);
                const conn = this.peer.connect(hostPeerId, {
                    reliable: true,
                });

                this.setupConnection(conn);

                conn.on('open', () => {
                    clearTimeout(this.connectTimeout);
                    console.log('[Network] ✅ 已连接到房主');
                    if (this.onStatus) this.onStatus('connected');
                    if (this.onConnected) this.onConnected();
                    resolve();
                });

                conn.on('error', (err) => {
                    clearTimeout(this.connectTimeout);
                    console.error('[Network] 连接错误:', err);
                    if (this.onError) this.onError(err);
                    if (this.onStatus) this.onStatus('error');
                    reject(err);
                });
            });

            this.peer.on('error', (err) => {
                clearTimeout(this.connectTimeout);
                console.error('[Network] Peer 错误:', err.type, err.message);

                if (err.type === 'peer-unavailable') {
                    err.friendlyMessage = '房间不存在或房主已断开，请检查房间号';
                } else if (err.type === 'network' || err.type === 'server-error') {
                    err.friendlyMessage = '无法连接到游戏服务器，可能需要翻墙';
                }

                this._safeDestroyPeer();
                if (this.onError) this.onError(err);
                if (this.onStatus) this.onStatus('error');
                reject(err);
            });
        });
    }

    handleIncomingConnection(conn) {
        conn.on('open', () => {
            this.connections.set(conn.peer, conn);
            if (this.onPlayerJoined) {
                this.onPlayerJoined(conn.peer, {});
            }
        });
        this.setupConnection(conn);
    }

    setupConnection(conn) {
        conn.on('data', (data) => {
            this.handleMessage(conn.peer, data);
        });

        conn.on('close', () => {
            console.log('[Network] 玩家断开:', conn.peer);
            this.connections.delete(conn.peer);
            if (this.onPlayerLeft) this.onPlayerLeft(conn.peer);
        });

        conn.on('error', (err) => {
            console.error('[Network] 连接错误:', err);
        });
    }

    handleMessage(fromId, data) {
        if (this.onMessage) {
            this.onMessage(fromId, data.type, data.payload);
        }
    }

    broadcast(type, payload) {
        const msg = { type, payload };
        this.connections.forEach((conn) => {
            if (conn.open) {
                conn.send(msg);
            }
        });
    }

    sendTo(peerId, type, payload) {
        const conn = this.connections.get(peerId);
        if (conn && conn.open) {
            conn.send({ type, payload });
        }
    }

    getAllPeers() {
        return Array.from(this.connections.keys());
    }

    _safeDestroyPeer() {
        if (this.connectTimeout) {
            clearTimeout(this.connectTimeout);
            this.connectTimeout = null;
        }
        if (this.peer) {
            try {
                this.peer.destroy();
            } catch (e) {
                // ignore
            }
            this.peer = null;
        }
    }

    disconnect() {
        this.connections.forEach((conn) => {
            try { conn.close(); } catch (e) {}
        });
        this.connections.clear();
        this._safeDestroyPeer();
    }
}
