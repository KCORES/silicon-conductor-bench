import Events from 'module/event/Events';

/**
 * 获取移动距离
 * @param touches
 * @returns {number}
 */
function getDistance(touches) {
    return Math.sqrt((touches[0].clientX - touches[1].clientX) * (touches[0].clientX - touches[1].clientX) + (touches[0].clientY - touches[1].clientY) * (touches[0].clientY - touches[1].clientY));
}

/**
 * Normalize Chrome / Firefox wheel events to legacy infinitown scale (~±1 per notch).
 * Legacy jquery-mousewheel inverted deltaY before passing to updateHeight.
 */
function normalizeWheelDelta(event) {
    let dy = event.deltaY;
    if (event.deltaMode === 1) {
        dy *= 16;
    } else if (event.deltaMode === 2) {
        dy *= 100;
    }
    const sign = Math.sign(dy) || 1;
    const magnitude = Math.min(Math.abs(dy) / 100, 1);
    return -sign * magnitude;
}

/**
 *
 * @param obj 注册事件对象，正常情况下为canvas对象，如果没有的话就把事件注册给window对象
 */
class EventHandler extends Events{
    constructor(obj) {
        super();
        var e = false;
        var radius = 0;
        obj = undefined !== obj ? obj : window;
        const element = obj instanceof $ ? obj[0] : obj;

        this._activeButton = null;

        function pointerEvent(event) {
            return {
                x : event.pageX,
                y : event.pageY,
                button : event.button
            };
        }

        /**
         * 鼠标按下事件
         */
        $(obj).on('mousedown', function(event) {
            this._activeButton = event.button;
            this.trigger('startdrag', pointerEvent(event));
        }.bind(this));
        /**
         * 鼠标抬起时间
         */
        $(obj).on('mouseup', function(event) {
            this.trigger('enddrag', pointerEvent(event));
            this._activeButton = null;
        }.bind(this));
        /**
         * 鼠标移动事件
         */
        $(obj).on('mousemove', function(event) {
            if (this._activeButton === null) {
                return;
            }
            this.trigger('drag', pointerEvent(event));
        }.bind(this));
        /**
         * 鼠标离开事件
         */
        $(obj).on('mouseleave', function(event) {
            if (this._activeButton === null) {
                return;
            }
            this.trigger('enddrag', pointerEvent(event));
            this._activeButton = null;
        }.bind(this));
        /**
         * Release drag when the button is let go outside the canvas.
         */
        $(document).on('mouseup', function(event) {
            if (this._activeButton === null || event.button !== this._activeButton) {
                return;
            }
            this.trigger('enddrag', pointerEvent(event));
            this._activeButton = null;
        }.bind(this));
        element.addEventListener('contextmenu', function(event) {
            event.preventDefault();
        });
        /**
         * 触摸事件
         */
        $(obj).on('touchstart', function(event) {
            if (2 === event.touches.length) {
                e = true;
                radius = getDistance(event.originalEvent.touches);
                this.trigger('pinchstart');
            } else {
                if (1 === event.touches.length) {
                    this.trigger('startdrag', {
                        x : event.touches[0].pageX,
                        y : event.touches[0].pageY,
                        button : 0
                    });
                }
            }
        }.bind(this));
        /**
         * 触摸结束事件
         */
        $(obj).on('touchend', function(event) {
            if (0 === event.originalEvent.touches.length) {
                if (e) {
                    e = false;
                    this.trigger('pinchend');
                }
                this.trigger('enddrag', { x : 0, y : 0, button : 0 });
                this._activeButton = null;
            }
        }.bind(this));
        /**
         * 触摸移动事件
         */
        $(obj).on('touchmove', function(event) {
            if (e) {
                var touches = event.originalEvent.touches;
                if (2 === touches.length) {
                    var y1 = getDistance(touches) - radius;
                    var sql_date = Math.max(1 + y1 / 100, 0);
                    this.trigger('pinchchange', sql_date);
                }
            } else {
                this.trigger('drag', {
                    x : event.touches[0].pageX,
                    y : event.touches[0].pageY,
                    button : 0
                });
            }
            event.preventDefault();
        }.bind(this));
        /**
         * Native wheel (Chrome). Coalesce high-frequency wheel events to one step per frame.
         */
        this._wheelAccum = 0;
        this._wheelFrame = null;
        element.addEventListener('wheel', function(event) {
            event.preventDefault();
            this._wheelAccum += normalizeWheelDelta(event);
            if (this._wheelFrame !== null) {
                return;
            }
            this._wheelFrame = requestAnimationFrame(function() {
                this._wheelFrame = null;
                const accum = this._wheelAccum;
                this._wheelAccum = 0;
                if (accum === 0) {
                    return;
                }
                const dy = Math.sign(accum) * Math.min(Math.abs(accum), 1);
                this.trigger('mousewheel', dy);
            }.bind(this));
        }.bind(this), { passive: false });
    }
}

export default EventHandler;
