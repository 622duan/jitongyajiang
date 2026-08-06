// 网络层 - 基于 PeerJS 的 WebRTC P2P 联机
// 
// 房间号机制：
// - 房主：使用房间号作为 Peer ID（例：jtyj-ABC123）
// - 朋友：使用相同 Peer ID 连接
// - PeerJS 免费公共 broker 处理信令

const PREFIX = 'jtyj-';  // 鸡同鸭讲 prefix，避免和其他人冲突

export class Network {
    constructor() {
        this.peer = null;
        this.connections = new Map();  // peerId -> DataConnection
        this.myId = null;
        this.isHost = false;
        this.roomCode = null;
        
        // 消息回调
        this.onPlayerJoined = null;     // (playerId, playerData) => void
        this.onPlayerLeft = null;       // (playerId) => void
        this.onMessage = null;          // (fromId, type, data) => void
        this.onConnected = null;        // () => void - 本地 Peer 创建成功
        this.onError = null;            // (err) => void
    }
    
    // 生成 6 位房间号
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
        this.roomCode = code;
        const peerId = PREFIX + code;
        
        return new Promise((resolve, reject) => {
            this.peer = new Peer(peerId, {
                debug: 1  // 0=无日志，1=错误，2=详细
            });
            
            this.peer.on('open', (id) => {
                this.myId = id;
                this.isHost = true;
                console.log('[Network] 房主 Peer 创建成功:', id);
                if (this.onConnected) this.onConnected();
                resolve(code);
            });
            
            this.peer.on('connection', (conn) => {
                this.handleIncomingConnection(conn);
            });
            
            this.peer.on('error', (err) => {
                console.error('[Network] Peer 错误:', err);
                if (this.onError) this.onError(err);
                reject(err);
            });
        });
    }
    
    // 加入房间
    async joinRoom(code) {
        this.roomCode = code.toUpperCase();
        const hostPeerId = PREFIX + this.roomCode;
        
        return new Promise((resolve, reject) => {
            // 先创建自己的 Peer
            this.peer = new Peer(undefined, {
                debug: 1
            });
            
            this.peer.on('open', (myId) => {
                this.myId = myId;
                this.isHost = false;
                console.log('[Network] 客户端 Peer 创建成功:', myId);
                
                // 连接到房主
                const conn = this.peer.connect(hostPeerId, {
                    reliable: true
                });
                
                this.setupConnection(conn);
                
                conn.on('open', () => {
                    console.log('[Network] 已连接到房主');
                    if (this.onConnected) this.onConnected();
                    resolve();
                });
                
                conn.on('error', (err) => {
                    console.error('[Network] 连接错误:', err);
                    if (this.onError) this.onError(err);
                    reject(err);
                });
            });
            
            this.peer.on('error', (err) => {
                console.error('[Network] Peer 错误:', err);
                if (this.onError) this.onError(err);
                reject(err);
            });
        });
    }
    
    handleIncomingConnection(conn) {
        console.log('[Network] 收到新连接:', conn.peer);
        
        conn.on('open', () => {
            this.connections.set(conn.peer, conn);
            
            // 通知有新玩家加入
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
    
    // 发送消息给所有人
    broadcast(type, payload) {
        const msg = { type, payload };
        this.connections.forEach((conn) => {
            if (conn.open) {
                conn.send(msg);
            }
        });
    }
    
    // 发送给指定玩家
    sendTo(peerId, type, payload) {
        const conn = this.connections.get(peerId);
        if (conn && conn.open) {
            conn.send({ type, payload });
        }
    }
    
    // 获取所有连接（含房主视角下的所有客户端）
    getAllPeers() {
        return Array.from(this.connections.keys());
    }
    
    // 断开
    disconnect() {
        this.connections.forEach((conn) => conn.close());
        this.connections.clear();
        if (this.peer) {
            this.peer.destroy();
            this.peer = null;
        }
    }
}
