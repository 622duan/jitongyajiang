// 主入口 - 整合所有模块
// 
// 流程：
// 1. 大厅界面：创建/加入房间
// 2. 房间界面：等待玩家，房主点开始
// 3. 游戏界面：3D 第一视角 + 联机

import { Network } from './network.js';
import { GameScene } from './scene.js';
import { InputController } from './controls.js';

// 全局状态
const state = {
    network: null,
    scene: null,
    input: null,
    myName: 'Player',
    myId: null,
    players: new Map(),  // peerId -> { name, color, isHost }
    identity: 'Unknown'  // 角色身份（MuteChef/DeafMessenger/BlindExecutor）
};

const PLAYER_COLORS = ['#ff6b6b', '#4ecdc4', '#ffe66d', '#a8e6cf'];

// ========== UI 切换 ==========
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

function setStatus(text, type = 'info') {
    const el = document.getElementById('lobby-status');
    el.textContent = text;
    el.className = 'status ' + type;
}

// ========== 大厅逻辑 ==========
document.getElementById('create-room-btn').addEventListener('click', async () => {
    state.myName = document.getElementById('player-name').value.trim() || 'Player';
    setStatus('正在创建房间...', 'info');
    document.getElementById('create-room-btn').disabled = true;
    document.getElementById('create-room-btn').textContent = '连接中...';

    try {
        // 如果之前有 network，先清理
        if (state.network) {
            state.network.disconnect();
            state.network = null;
        }
        state.network = new Network();

        // 网络事件
        state.network.onConnected = () => {
            const code = state.network.roomCode;
            document.getElementById('generated-code').textContent = code;
            document.getElementById('room-code-display').classList.remove('hidden');
            document.getElementById('create-room-btn').textContent = '房间已创建';
            setStatus('房间已创建！', 'success');
            showScreen('room-screen');
            document.getElementById('room-code-show').textContent = code;

            // 添加自己
            state.players.set(state.network.myId, {
                name: state.myName,
                color: PLAYER_COLORS[0],
                isHost: true
            });
            updatePlayerListUI();
            updateStartButton();
        };

        state.network.onPlayerJoined = (peerId) => {
            console.log('[Main] 玩家加入:', peerId);
            // 房主收到新玩家连接，发送欢迎消息
            state.network.sendTo(peerId, 'welcome', {
                hostName: state.myName,
                players: Array.from(state.players.entries()).map(([id, p]) => ({
                    id, name: p.name, color: p.color, isHost: p.isHost
                }))
            });
        };

        state.network.onPlayerLeft = (peerId) => {
            console.log('[Main] 玩家离开:', peerId);
            state.players.delete(peerId);
            if (state.scene) {
                state.scene.removeRemotePlayer(peerId);
            }
            updatePlayerListUI();
            updateStartButton();
        };

        state.network.onMessage = (fromId, type, payload) => {
            handleNetworkMessage(fromId, type, payload);
        };

        state.network.onError = (err) => {
            const msg = err.friendlyMessage || err.message || ('错误: ' + (err.type || 'unknown'));
            setStatus(msg, 'error');
            console.error('[Main] 网络错误:', err);
            // 重置按钮
            document.getElementById('create-room-btn').disabled = false;
            document.getElementById('create-room-btn').textContent = '重试创建房间';
        };

        await state.network.createRoom();
    } catch (err) {
        const msg = err.friendlyMessage || err.message || '创建失败';
        setStatus(msg, 'error');
        console.error('[Main] 创建失败:', err);
        document.getElementById('create-room-btn').disabled = false;
        document.getElementById('create-room-btn').textContent = '重试创建房间';
    }
});

document.getElementById('join-room-btn').addEventListener('click', async () => {
    state.myName = document.getElementById('player-name').value.trim() || 'Player';
    const code = document.getElementById('room-code-input').value.trim().toUpperCase();

    if (code.length !== 6) {
        setStatus('请输入 6 位房间号', 'error');
        return;
    }

    setStatus('正在加入...', 'info');
    document.getElementById('join-room-btn').disabled = true;
    document.getElementById('join-room-btn').textContent = '连接中...';

    try {
        if (state.network) {
            state.network.disconnect();
            state.network = null;
        }
        state.network = new Network();

        state.network.onConnected = () => {
            setStatus('已加入房间！', 'success');
            showScreen('room-screen');
            document.getElementById('room-code-show').textContent = code;
            state.players.set(state.network.myId, {
                name: state.myName,
                color: PLAYER_COLORS[state.players.size],
                isHost: false
            });
            updatePlayerListUI();
        };

        state.network.onPlayerLeft = (peerId) => {
            state.players.delete(peerId);
            if (state.scene) {
                state.scene.removeRemotePlayer(peerId);
            }
            updatePlayerListUI();
        };

        state.network.onMessage = (fromId, type, payload) => {
            handleNetworkMessage(fromId, type, payload);
        };

        state.network.onError = (err) => {
            const msg = err.friendlyMessage || err.message || ('错误: ' + (err.type || 'unknown'));
            setStatus(msg, 'error');
            console.error('[Main] 网络错误:', err);
            document.getElementById('join-room-btn').disabled = false;
            document.getElementById('join-room-btn').textContent = '重试加入';
        };

        await state.network.joinRoom(code);
    } catch (err) {
        const msg = err.friendlyMessage || err.message || '加入失败';
        setStatus(msg, 'error');
        console.error('[Main] 加入失败:', err);
        document.getElementById('join-room-btn').disabled = false;
        document.getElementById('join-room-btn').textContent = '重试加入';
    }
});

// ========== 房间界面 ==========
function updatePlayerListUI() {
    const ul = document.getElementById('players-ul');
    ul.innerHTML = '';
    
    state.players.forEach((player, id) => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span><span class="player-color" style="background:${player.color}"></span>${player.name}</span>
            ${player.isHost ? '<span class="player-host">房主</span>' : ''}
        `;
        ul.appendChild(li);
    });
    
    // 游戏内 HUD
    const gameUl = document.getElementById('player-list-game');
    if (gameUl) {
        gameUl.innerHTML = '';
        state.players.forEach((player, id) => {
            const chip = document.createElement('div');
            chip.className = 'player-chip';
            chip.style.borderLeftColor = player.color;
            chip.textContent = player.name + (player.isHost ? ' 👑' : '');
            gameUl.appendChild(chip);
        });
    }
}

function updateStartButton() {
    const btn = document.getElementById('start-game-btn');
    if (!state.network) return;
    
    if (state.network.isHost) {
        btn.disabled = state.players.size < 2;
        btn.textContent = state.players.size < 2 ? '至少需要 2 人' : '开始游戏';
    } else {
        btn.disabled = true;
        btn.textContent = '等待房主开始...';
    }
}

document.getElementById('start-game-btn').addEventListener('click', () => {
    if (!state.network.isHost) return;
    
    // 随机分配身份
    const identities = ['MuteChef', 'DeafMessenger', 'BlindExecutor'];
    const shuffled = [...identities].sort(() => Math.random() - 0.5);
    
    let i = 0;
    const assignments = [];
    state.players.forEach((player, id) => {
        assignments.push({
            peerId: id,
            identity: shuffled[i % shuffled.length]
        });
        i++;
    });
    
    // 通知所有玩家开始
    state.network.broadcast('startGame', {
        assignments: assignments
    });
    
    // 自己开始
    const myAssignment = assignments.find(a => a.peerId === state.network.myId);
    startGame(myAssignment.identity);
});

document.getElementById('leave-room-btn').addEventListener('click', () => {
    if (state.network) state.network.disconnect();
    state.network = null;
    state.players.clear();
    showScreen('lobby-screen');
    // 重置
    document.getElementById('create-room-btn').disabled = false;
    document.getElementById('create-room-btn').textContent = '创建新房间';
    document.getElementById('room-code-display').classList.add('hidden');
    setStatus('', 'info');
});

// ========== 网络消息处理 ==========
function handleNetworkMessage(fromId, type, payload) {
    switch (type) {
        case 'welcome':
            // 新玩家加入时，房主发来的欢迎消息
            state.players.clear();
            payload.players.forEach(p => {
                state.players.set(p.id, {
                    name: p.name,
                    color: p.color,
                    isHost: p.isHost
                });
            });
            updatePlayerListUI();
            // 告诉房主我的存在
            state.network.sendTo(fromId, 'hello', {
                name: state.myName,
                color: PLAYER_COLORS[state.players.size]
            });
            break;
            
        case 'hello':
            // 房主收到 hello，把新玩家加入列表
            const newColor = payload.color || PLAYER_COLORS[state.players.size];
            state.players.set(fromId, {
                name: payload.name,
                color: newColor,
                isHost: false
            });
            updatePlayerListUI();
            updateStartButton();
            break;
            
        case 'startGame':
            // 房主广播开始
            const myAssign = payload.assignments.find(a => a.peerId === state.network.myId);
            if (myAssign) {
                startGame(myAssign.identity);
            } else {
                console.warn('没有分配到身份');
            }
            break;
            
        case 'position':
            // 其他玩家位置更新
            if (state.scene) {
                state.scene.updateRemotePlayer(fromId, payload);
            }
            break;
            
        case 'action':
            // 动作轮盘
            showActionIndicator(fromId, payload.action);
            break;
    }
}

// ========== 游戏开始 ==========
function startGame(identity) {
    state.identity = identity;
    showScreen('game-screen');
    
    // 初始化 3D 场景
    const canvas = document.getElementById('game-canvas');
    state.scene = new GameScene(canvas);
    state.scene.init();
    
    // 创建远端玩家
    state.players.forEach((player, id) => {
        if (id !== state.network.myId) {
            state.scene.addRemotePlayer(id, player.name);
        }
    });
    
    // 输入
    state.input = new InputController(canvas, document.getElementById('joystick-zone'));
    state.input.onMove = (x, y) => state.scene.setMoveInput(x, y);
    state.input.onLook = (dx, dy) => state.scene.setLookInput(dx, dy);
    
    // 启动渲染
    state.scene.start();
    
    // 启动位置同步
    startPositionSync();
    
    // 设置身份显示
    const badge = document.getElementById('identity-badge');
    const identityMap = {
        'MuteChef': '🧑‍🍳 哑巴厨师长',
        'DeafMessenger': '🧏 聋子传令官',
        'BlindExecutor': '🙈 盲人执行者'
    };
    badge.textContent = identityMap[identity] || '未知身份';
    updatePlayerListUI();
}

function startPositionSync() {
    setInterval(() => {
        if (!state.scene || !state.network) return;
        const localState = state.scene.getLocalState();
        state.network.broadcast('position', localState);
    }, 50);  // 20Hz
}

// ========== 动作轮盘 ==========
const wheel = document.getElementById('action-wheel');
const wheelBtn = document.getElementById('action-wheel-btn');

wheelBtn.addEventListener('click', () => {
    wheel.classList.toggle('hidden');
});

wheel.querySelectorAll('.wheel-option').forEach(opt => {
    opt.addEventListener('click', () => {
        const action = opt.dataset.action;
        // 发送动作
        if (state.network) {
            state.network.broadcast('action', { action: action });
        }
        showActionIndicator('me', action);
        wheel.classList.add('hidden');
    });
});

function showActionIndicator(peerId, action) {
    const actionMap = {
        'yes': '✓', 'no': '✗',
        'up': '↑', 'down': '↓', 'left': '←', 'right': '→',
        'wait': '⏸', 'help': '❓'
    };
    
    // 简单 toast 显示
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        top: 30%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0,0,0,0.8);
        color: #ffd700;
        font-size: 80px;
        padding: 20px 40px;
        border-radius: 20px;
        z-index: 100;
        pointer-events: none;
    `;
    toast.textContent = actionMap[action] || '?';
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.transition = 'opacity 0.5s';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 500);
    }, 1000);
}
