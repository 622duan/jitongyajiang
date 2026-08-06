// 移动端 + PC 输入控制
// 
// 移动端：
// - 屏幕左下 50% 区域：虚拟摇杆（控制移动）
// - 屏幕右半区域：拖动（控制视角）
// 
// PC（调试）：
// - WASD 移动
// - 鼠标拖动视角

export class InputController {
    constructor(canvas, joystickZone) {
        this.canvas = canvas;
        this.joystickZone = joystickZone;
        this.onMove = null;  // (x, y) => void
        this.onLook = null;  // (dx, dy) => void
        
        // 摇杆状态
        this.joystickActive = false;
        this.joystickCenter = { x: 0, y: 0 };
        this.joystickTouch = null;
        this.joystickRadius = 60;
        
        // 视角控制
        this.lookTouch = null;
        this.lastLookPos = { x: 0, y: 0 };
        
        this.init();
    }
    
    init() {
        // 触屏事件
        this.canvas.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
        this.canvas.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
        this.canvas.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });
        this.canvas.addEventListener('touchcancel', (e) => this.onTouchEnd(e), { passive: false });
        
        // 鼠标事件（PC 调试）
        let mouseDown = false;
        let mouseButton = 0;
        
        this.canvas.addEventListener('mousedown', (e) => {
            mouseDown = true;
            mouseButton = e.button;
            if (e.clientX < window.innerWidth * 0.5) {
                // 左半屏 = 摇杆
                this.joystickActive = true;
                this.joystickCenter = { x: e.clientX, y: e.clientY };
                this.joystickTouch = 'mouse';
            } else {
                // 右半屏 = 视角
                this.lookTouch = 'mouse';
                this.lastLookPos = { x: e.clientX, y: e.clientY };
            }
        });
        
        this.canvas.addEventListener('mousemove', (e) => {
            if (this.joystickActive && this.joystickTouch === 'mouse') {
                this.updateJoystick(e.clientX, e.clientY);
            }
            if (this.lookTouch === 'mouse') {
                const dx = e.clientX - this.lastLookPos.x;
                const dy = e.clientY - this.lastLookPos.y;
                if (this.onLook) this.onLook(dx, dy);
                this.lastLookPos = { x: e.clientX, y: e.clientY };
            }
        });
        
        this.canvas.addEventListener('mouseup', () => {
            mouseDown = false;
            this.resetJoystick();
            this.lookTouch = null;
        });
        
        // 键盘（WASD 调试）
        const keys = {};
        window.addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true; });
        window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
        
        setInterval(() => {
            if (keys['w'] || keys['arrowup']) this.updateMoveInput(0, 1);
            else if (keys['s'] || keys['arrowdown']) this.updateMoveInput(0, -1);
            else if (keys['a'] || keys['arrowleft']) this.updateMoveInput(-1, 0);
            else if (keys['d'] || keys['arrowright']) this.updateMoveInput(1, 0);
            else if (!this.joystickActive) this.updateMoveInput(0, 0);
        }, 50);
    }
    
    onTouchStart(e) {
        e.preventDefault();
        for (let touch of e.changedTouches) {
            if (touch.clientX < window.innerWidth * 0.5) {
                if (!this.joystickActive) {
                    this.joystickActive = true;
                    this.joystickCenter = { x: touch.clientX, y: touch.clientY };
                    this.joystickTouch = touch.identifier;
                }
            } else {
                if (this.lookTouch === null) {
                    this.lookTouch = touch.identifier;
                    this.lastLookPos = { x: touch.clientX, y: touch.clientY };
                }
            }
        }
    }
    
    onTouchMove(e) {
        e.preventDefault();
        for (let touch of e.changedTouches) {
            if (touch.identifier === this.joystickTouch) {
                this.updateJoystick(touch.clientX, touch.clientY);
            }
            if (touch.identifier === this.lookTouch) {
                const dx = touch.clientX - this.lastLookPos.x;
                const dy = touch.clientY - this.lastLookPos.y;
                if (this.onLook) this.onLook(dx, dy);
                this.lastLookPos = { x: touch.clientX, y: touch.clientY };
            }
        }
    }
    
    onTouchEnd(e) {
        e.preventDefault();
        for (let touch of e.changedTouches) {
            if (touch.identifier === this.joystickTouch) {
                this.resetJoystick();
            }
            if (touch.identifier === this.lookTouch) {
                this.lookTouch = null;
            }
        }
    }
    
    updateJoystick(x, y) {
        const dx = x - this.joystickCenter.x;
        const dy = y - this.joystickCenter.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        
        let nx = dx, ny = dy;
        if (dist > this.joystickRadius) {
            nx = (dx / dist) * this.joystickRadius;
            ny = (dy / dist) * this.joystickRadius;
        }
        
        // 归一化到 -1..1
        this.updateMoveInput(nx / this.joystickRadius, -ny / this.joystickRadius);
    }
    
    updateMoveInput(x, y) {
        if (this.onMove) this.onMove(x, y);
    }
    
    resetJoystick() {
        this.joystickActive = false;
        this.joystickTouch = null;
        this.updateMoveInput(0, 0);
    }
}
