// 3D 场景 - Three.js 第一视角
// 
// 包含：
// - 3D 场景（地面、围墙、简单道具）
// - 第一视角相机 + 控制器
// - 移动端虚拟摇杆 + 屏幕拖动视角
// - 玩家角色渲染（远端玩家用彩色立方体）
// - 简单的厨房环境（W1 占位）

import * as THREE from 'three';

export class GameScene {
    constructor(canvas) {
        this.canvas = canvas;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.remotePlayers = new Map();  // peerId -> { mesh, name, color }
        
        // 本地玩家状态
        this.localPlayer = {
            position: new THREE.Vector3(0, 1.6, 0),  // 人眼高度
            rotationY: 0,                              // 水平
            rotationX: 0,                              // 垂直
            velocity: new THREE.Vector3()
        };
        
        // 输入状态
        this.moveInput = new THREE.Vector2();  // 摇杆
        this.lookInput = new THREE.Vector2();  // 视角
        
        // 移动速度
        this.moveSpeed = 4.0;  // 米/秒
        this.lookSensitivity = 0.002;
        
        this.lastFrameTime = 0;
        this.running = false;
        this.clock = new THREE.Clock();
        
        // 玩家颜色循环
        this.playerColors = [
            0xff6b6b,  // 红
            0x4ecdc4,  // 青
            0xffe66d,  // 黄
            0xa8e6cf,  // 绿
        ];
        this.colorIndex = 0;
    }
    
    // 初始化场景
    init() {
        // 场景
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87ceeb);  // 天空蓝
        this.scene.fog = new THREE.Fog(0x87ceeb, 20, 60);
        
        // 相机
        this.camera = new THREE.PerspectiveCamera(
            70,  // FOV
            window.innerWidth / window.innerHeight,
            0.1,
            100
        );
        this.camera.position.copy(this.localPlayer.position);
        
        // 渲染器
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        
        // 光照
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);
        
        const sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
        sunLight.position.set(10, 20, 10);
        sunLight.castShadow = true;
        sunLight.shadow.mapSize.set(2048, 2048);
        sunLight.shadow.camera.left = -25;
        sunLight.shadow.camera.right = 25;
        sunLight.shadow.camera.top = 25;
        sunLight.shadow.camera.bottom = -25;
        this.scene.add(sunLight);
        
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        
        // 地面
        const groundGeometry = new THREE.PlaneGeometry(40, 40);
        const groundMaterial = new THREE.MeshStandardMaterial({
            color: 0x8b7355,
            roughness: 0.9
        });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);
        
        // 网格地面（方便看距离）
        const gridHelper = new THREE.GridHelper(40, 40, 0x4a4a4a, 0x6a6a6a);
        gridHelper.position.y = 0.01;
        this.scene.add(gridHelper);
        
        // 围墙（4 面）
        this.buildWalls();
        
        // 厨房道具（占位）
        this.buildKitchenProps();
        
        // 监听窗口大小
        window.addEventListener('resize', () => this.onResize());
    }
    
    buildWalls() {
        const wallHeight = 4;
        const wallThickness = 0.3;
        const halfSize = 20;
        
        const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xe8d4b0 });
        
        const walls = [
            // 北墙
            { pos: [0, wallHeight/2, -halfSize], size: [halfSize*2, wallHeight, wallThickness] },
            // 南墙（开 2 个缺口）
            { pos: [-8, wallHeight/2, halfSize], size: [8, wallHeight, wallThickness] },
            { pos: [8, wallHeight/2, halfSize], size: [8, wallHeight, wallThickness] },
            // 东墙
            { pos: [halfSize, wallHeight/2, 0], size: [wallThickness, wallHeight, halfSize*2] },
            // 西墙
            { pos: [-halfSize, wallHeight/2, 0], size: [wallThickness, wallHeight, halfSize*2] }
        ];
        
        walls.forEach(w => {
            const geo = new THREE.BoxGeometry(...w.size);
            const mesh = new THREE.Mesh(geo, wallMaterial);
            mesh.position.set(...w.pos);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.scene.add(mesh);
        });
    }
    
    buildKitchenProps() {
        // 简单的厨房道具占位（W1 只做几何体）
        const props = [
            { pos: [-5, 0.5, -3], color: 0xd97706, name: '食材箱', size: [1, 1, 1] },
            { pos: [-3, 0.4, -3], color: 0xa0522d, name: '菜板', size: [1.2, 0.1, 0.8] },
            { pos: [-1, 0.4, -3], color: 0xa0522d, name: '菜板', size: [1.2, 0.1, 0.8] },
            { pos: [1, 0.5, -3], color: 0x4a4a4a, name: '调味台', size: [2, 1, 0.8] },
            // 灶台（中央长条，分隔场景）
            { pos: [0, 0.5, 0], color: 0x2a2a2a, name: '灶台', size: [12, 1, 1.5] },
            // 烹饪区
            { pos: [-5, 0.5, 5], color: 0x1a1a1a, name: '煎锅', size: [1, 0.2, 1] },
            { pos: [-3, 0.5, 5], color: 0x1a1a1a, name: '煎锅', size: [1, 0.2, 1] },
            { pos: [0, 0.8, 5], color: 0xffd700, name: '出餐口', size: [1.5, 0.5, 1] },
            { pos: [3, 0.5, 5], color: 0x60a5fa, name: '洗碗池', size: [1.5, 0.4, 1] }
        ];
        
        props.forEach(p => {
            const geo = new THREE.BoxGeometry(...p.size);
            const mat = new THREE.MeshStandardMaterial({ color: p.color });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(...p.pos);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.userData.name = p.name;
            this.scene.add(mesh);
        });
        
        // 长条形灶台（视觉屏障）
        const counterGeo = new THREE.BoxGeometry(12, 1.2, 1.5);
        const counterMat = new THREE.MeshStandardMaterial({ color: 0x666666 });
        const counter = new THREE.Mesh(counterGeo, counterMat);
        counter.position.set(0, 0.6, 0);
        counter.castShadow = true;
        counter.receiveShadow = true;
        this.scene.add(counter);
    }
    
    // 启动渲染循环
    start() {
        this.running = true;
        this.lastFrameTime = performance.now();
        requestAnimationFrame((t) => this.loop(t));
    }
    
    stop() {
        this.running = false;
    }
    
    loop(time) {
        if (!this.running) return;
        
        const dt = Math.min((time - this.lastFrameTime) / 1000, 0.1);
        this.lastFrameTime = time;
        
        this.updateLocalPlayer(dt);
        this.updateCamera();
        this.interpolateRemotePlayers(dt);
        
        this.renderer.render(this.scene, this.camera);
        requestAnimationFrame((t) => this.loop(t));
    }
    
    updateLocalPlayer(dt) {
        // 移动（基于摇杆）
        const forward = new THREE.Vector3(
            -Math.sin(this.localPlayer.rotationY),
            0,
            -Math.cos(this.localPlayer.rotationY)
        );
        const right = new THREE.Vector3(
            Math.cos(this.localPlayer.rotationY),
            0,
            -Math.sin(this.localPlayer.rotationY)
        );
        
        const move = new THREE.Vector3();
        move.addScaledVector(forward, this.moveInput.y);
        move.addScaledVector(right, this.moveInput.x);
        
        if (move.lengthSq() > 0) {
            move.normalize().multiplyScalar(this.moveSpeed * dt);
            this.localPlayer.position.add(move);
        }
        
        // 边界限制
        this.localPlayer.position.x = Math.max(-19, Math.min(19, this.localPlayer.position.x));
        this.localPlayer.position.z = Math.max(-19, Math.min(19, this.localPlayer.position.z));
        this.localPlayer.position.y = 1.6;  // 眼睛高度固定
    }
    
    updateCamera() {
        this.camera.position.copy(this.localPlayer.position);
        
        // 应用视角旋转
        const euler = new THREE.Euler(this.localPlayer.rotationX, this.localPlayer.rotationY, 0, 'YXZ');
        this.camera.quaternion.setFromEuler(euler);
    }
    
    interpolateRemotePlayers(dt) {
        // 远端玩家位置插值
        this.remotePlayers.forEach((player) => {
            if (player.targetPos) {
                player.mesh.position.lerp(player.targetPos, 0.15);
            }
            if (player.targetRotY !== undefined) {
                // 平滑旋转
                let diff = player.targetRotY - player.mesh.rotation.y;
                while (diff > Math.PI) diff -= 2 * Math.PI;
                while (diff < -Math.PI) diff += 2 * Math.PI;
                player.mesh.rotation.y += diff * 0.15;
            }
        });
    }
    
    // 输入处理
    setMoveInput(x, y) {
        this.moveInput.x = x;
        this.moveInput.y = y;
    }
    
    setLookInput(dx, dy) {
        this.localPlayer.rotationY -= dx * this.lookSensitivity * 100;  // * 100 适配不同灵敏度
        this.localPlayer.rotationX -= dy * this.lookSensitivity * 100;
        // 限制垂直视角
        this.localPlayer.rotationX = Math.max(-Math.PI/2 + 0.01, Math.min(Math.PI/2 - 0.01, this.localPlayer.rotationX));
    }
    
    // 远端玩家管理
    addRemotePlayer(peerId, name) {
        if (this.remotePlayers.has(peerId)) return;
        
        const color = this.playerColors[this.colorIndex % this.playerColors.length];
        this.colorIndex++;
        
        // 玩家身体（立方体 + 头部 + 名称）
        const group = new THREE.Group();
        
        // 身体
        const bodyGeo = new THREE.BoxGeometry(0.6, 1.2, 0.4);
        const bodyMat = new THREE.MeshStandardMaterial({ color: color });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 0.6;
        body.castShadow = true;
        group.add(body);
        
        // 头
        const headGeo = new THREE.SphereGeometry(0.25, 16, 16);
        const headMat = new THREE.MeshStandardMaterial({ color: 0xffdbac });
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.y = 1.4;
        head.castShadow = true;
        group.add(head);
        
        // 头顶箭头（指示前方）
        const arrowGeo = new THREE.ConeGeometry(0.15, 0.4, 4);
        const arrowMat = new THREE.MeshStandardMaterial({ color: color });
        const arrow = new THREE.Mesh(arrowGeo, arrowMat);
        arrow.position.set(0, 1.4, -0.5);
        arrow.rotation.x = -Math.PI / 2;
        group.add(arrow);
        
        this.scene.add(group);
        
        // 名称标签（HTML 形式，简单用 TextGeometry 不太好搞）
        this.addNameLabel(group, name, color);
        
        const player = {
            mesh: group,
            name: name,
            color: color,
            targetPos: new THREE.Vector3(0, 0, 0),
            targetRotY: 0
        };
        
        this.remotePlayers.set(peerId, player);
    }
    
    addNameLabel(parentGroup, name, color) {
        // 创建 canvas 文字
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, 256, 64);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 32px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(name, 128, 32);
        
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.position.y = 1.9;
        sprite.scale.set(1.5, 0.4, 1);
        parentGroup.add(sprite);
    }
    
    removeRemotePlayer(peerId) {
        const player = this.remotePlayers.get(peerId);
        if (player) {
            this.scene.remove(player.mesh);
            this.remotePlayers.delete(peerId);
        }
    }
    
    updateRemotePlayer(peerId, data) {
        const player = this.remotePlayers.get(peerId);
        if (!player) return;
        if (data.position) {
            player.targetPos.set(data.position[0], 0, data.position[2]);
        }
        if (data.rotationY !== undefined) {
            player.targetRotY = data.rotationY;
        }
    }
    
    // 获取本地玩家状态（用于同步）
    getLocalState() {
        return {
            position: [this.localPlayer.position.x, this.localPlayer.position.y, this.localPlayer.position.z],
            rotationY: this.localPlayer.rotationY
        };
    }
    
    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}
